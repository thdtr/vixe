// Saves and restores everything about a running level that can change, so a search can
// try one move, back up, and try another. Restoring writes back into the same objects, so
// references between them (the player's ground and the body under it) stay valid.
// Level effects (fx) keep their state in closures and aren't covered: levels whose effects
// push, pull or kill can't be searched this way.

const PLAY = ['time', 'ticks', 'state', 'stateT', 'reversed', 'gravity', 'weight', 'flipT', 'dark', 'ease', 'collected'];
const PLAYER = ['x', 'y', 'vx', 'vy', 'gdir', 'weight', 'push', 'speed', 'swim', 'facing', 'alive', 'ground', 'coyote', 'buffer', 'jumped', 'landed', 'idle', 'squash', 'conveyor'];

const copy = (v) => (v && typeof v === 'object' ? structuredClone(v) : v);

export function snapshot(play) {
  const { level, player, events, mechs, actors } = play;
  return {
    play: Object.fromEntries(PLAY.map((k) => [k, play[k]])),
    flags: { ...play.flags },
    player: { ...Object.fromEntries(PLAYER.map((k) => [k, player[k]])), drift: { ...player.drift } },
    grid: level.grid.slice(),
    version: level.version,
    tide: level.tide && { ...level.tide },
    fields: [...level.fields.values()].map((f) => f.on),
    bodies: [...level.bodies.values()].map((b) => ({
      b, cells: b.cells.map((c) => [c, c.ch]), ox: b.ox, oy: b.oy, vx: b.vx, visible: b.visible, wobble: b.wobble, motion: copy(b.motion),
    })),
    events: events.list.map((e) => [e.done, e.was]),
    scripts: events.scripts.map((s) => ({ ...s })),
    mechs: mechs.list.map((m) => copy(m.state)),
    actors: actors.list.map((a) => ({ def: a.def, state: copy(a.state) })),
  };
}

export function restore(play, s) {
  const { level, player, events, mechs, actors } = play;
  Object.assign(play, s.play);
  play.flags = { ...s.flags };
  Object.assign(player, s.player, { drift: { ...s.player.drift } });
  level.grid = s.grid.slice();
  level.version = s.version;
  level.tide = s.tide && { ...s.tide };
  [...level.fields.values()].forEach((f, i) => { f.on = s.fields[i]; });
  // Groups made after the snapshot (a collapse splits a floor into columns) go away.
  const keep = new Set(s.bodies.map((x) => x.b));
  for (const [id, b] of level.bodies) if (!keep.has(b)) level.bodies.delete(id);
  for (const x of s.bodies) {
    const b = x.b;
    b.take();
    for (const [c, ch] of x.cells) { c.ch = ch; b.add(c); }
    Object.assign(b, { ox: x.ox, oy: x.oy, vx: x.vx, visible: x.visible, wobble: x.wobble, motion: copy(x.motion) });
    level.bodies.set(b.id, b);
  }
  events.list.forEach((e, i) => { [e.done, e.was] = s.events[i]; });
  events.scripts = s.scripts.map((x) => ({ ...x }));
  mechs.list.forEach((m, i) => { m.state = copy(s.mechs[i]); });
  actors.list = s.actors.map((a) => ({ def: a.def, state: copy(a.state) }));
}
