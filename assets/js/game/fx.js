// Level effects: procedural layers a pack can paint behind and in front of the map.
// A level lists them in "fx": [{ "type": "sea", "id": "water", ...options }].
// A pack script registers types with registerFx(name, (def, play) => fx), where fx has
// any of these hooks (all optional):
//
//   update(dt, play)   every simulation step, before the player moves (may push or kill)
//   anim(dt, play)     every frame, even while dying, for things that should keep breathing
//   back(screen, play)   drawn before the map
//   front(screen, play)  drawn after the player, particles and tide
//   lights(play)       returns light sources for a "light" layer: [{ x, y, r, color, i }]
//   cmd(step, play)    the { "fx": id, ... } trap action
//
// Unknown types are skipped with a warning, like unknown traps.

export const fxTypes = {};

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
