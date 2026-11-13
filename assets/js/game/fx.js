// Level effects: procedural layers painted behind and in front of the map.
// A world lists the ones every level of it shares in "fx", and a level adds its own:
//
//   world: "fx": [{ "type": "cellar", "id": "scene" }, { "type": "texture", "pattern": "brick" }]
//   level: "fx": [{ "type": "light", "ambient": 0.2 }, { "id": "scene", "bulb": [30, 2] }]
//
// A level entry with the same id as a world entry is merged onto it (so a level can tune
// the shared scenery), and { "id": "scene", "off": true } drops it for that level. An id
// defaults to the type. The core library lives in assets/js/fx/; a pack script registers
// more types with registerFx(name, (def, play) => fx), where fx has any of these hooks
// (all optional):
//
//   update(dt, play)   every simulation step, before the player moves (may push or kill)
//   anim(dt, play)     every frame, even while dying, for things that should keep breathing
//   back(screen, play)   drawn before the map
//   front(screen, play)  drawn after the player, particles and tide
//   lights(play)       returns light sources for a "light" layer: [{ x, y, r, color, i }]
//   cmd(step, play)    the { "fx": id, ... } trap action
//   save() / load(s)   its state as plain data and back, for effects that change the game
//                      (tools/solve.mjs rewinds a level with them while it searches)
//
// Unknown types are skipped with a warning, like unknown traps.

export const fxTypes = {};

export function registerFx(name, make) {
  fxTypes[name] = make;
}

// The world's shared effects with the level's on top, in order: world first.
export function fxDefs(world, level) {
  const out = (world?.fx ?? []).map((d) => ({ ...d, id: d.id ?? d.type }));
  for (const d of level.fx ?? []) {
    const id = d.id ?? d.type, at = out.findIndex((x) => x.id === id);
    if (at >= 0) out[at] = { ...out[at], ...d };
    else out.push({ ...d, id });
  }
  return out.filter((d) => !d.off);
}

export function makeFx(defs = [], play) {
  const out = [];
  for (const def of defs) {
    const make = fxTypes[def.type];
    if (!make) { console.warn(`[fx] unknown "${def.type}"`); continue; }
    const fx = make(def, play);
    fx.id = def.id ?? def.type;
    out.push(fx);
  }
  return out;
}
