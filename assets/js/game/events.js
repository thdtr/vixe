import { CW, CH, STEP, MAP_COLS, MAP_H } from '../config.js';

// Traps are data. Each level has a list of events:
//
//   { "id": "x", "when": { "zone": "A", "deaths": 1 }, "delay": 0.1, "repeat": false,
//     "do": [ { "wobble": "a" }, { "fall": "a" }, { "wait": 0.5 }, { "show": "b" } ] }
//
// Every condition in `when` must hold. An event fires once by default; with
// "repeat" it fires again each time its conditions become true. The steps in
// `do` run in order; a step's first key names the action, the rest are options.

export const triggers = {
  start: () => true,
  time: (p, v) => p.time >= v,
  every: (p, v) => p.ticks % Math.max(1, Math.round(v / STEP)) === 0,
  zone: (p, v) => p.level.inZone(v, p.player.rect),
  jump: (p) => p.player.jumped,
  land: (p) => p.player.landed,
  stand: (p, v) => p.player.ground?.id === v,
  idle: (p, v) => p.player.idle >= v,
  deaths: (p, v) => p.attempt >= v,
  fewerDeaths: (p, v) => p.attempt < v,
  collected: (p) => p.collected,
  flag: (p, v) => !!p.flags[v],
  // Closer than r cells: "near": "a" (a group, 2 cells), { "group": "a", "r": 3 } or [x, y, r].
  near: (p, v) => distance(p, v) < (Array.isArray(v) ? v[2] : v.r ?? 2) * CW,
  // Anywhere under a group, as it is now: the cue for a ceiling to drop.
  below(p, id) {
    const b = p.level.group(id), r = p.player.rect;
    if (!b.visible || !b.cells.length) return false;
    const x0 = b.box.x0 * CW + b.ox, x1 = (b.box.x1 + 1) * CW + b.ox, bottom = (b.box.y1 + 1) * CH + b.oy;
    return r.x + r.w > x0 && r.x < x1 && r.y >= bottom - 1;
  },
  past: (p, x) => p.player.cx > x * CW,
  before: (p, x) => p.player.cx < x * CW,
  airborne: (p, v) => !p.player.ground === !!v,
  grounded: (p, v) => !!p.player.ground === !!v,
};

// From the player's middle to a point, or to the nearest edge of a group.
function distance(p, v) {
  const pl = p.player;
  if (Array.isArray(v)) return Math.hypot(pl.cx - (v[0] + 0.5) * CW, pl.cy - (v[1] + 0.5) * CH);
  const b = p.level.group(typeof v === 'string' ? v : v.group);
  if (!b.visible || !b.cells.length) return Infinity;
  const x0 = b.box.x0 * CW + b.ox, x1 = (b.box.x1 + 1) * CW + b.ox, y0 = b.box.y0 * CH + b.oy, y1 = (b.box.y1 + 1) * CH + b.oy;
  return Math.hypot(Math.max(x0 - pl.cx, 0, pl.cx - x1), Math.max(y0 - pl.cy, 0, pl.cy - y1));
}

const body = (p, id) => p.level.group(id);
// Mercy: { "ease": 1.6 } gives every trap set off after it 60% more time.
const ease = (p) => p.ease || 1;
// Where a group is across the map (pixels), so its sound comes from that side.
const midX = (b) => (b.box.x0 + b.box.x1 + 1) / 2 * CW + b.ox;

export const actions = {
  wait: (p, v) => v,

  show(p, id, s) {
    const b = body(p, id);
    b.visible = true;
    if (!s.quiet) p.sfx('pop', midX(b));
  },

  hide: (p, id) => { body(p, id).visible = false; },

  wobble(p, id, s) {
    const time = (s.time ?? 0.25) * ease(p);
    body(p, id).wobble = time;
    return time;
  },

  fall(p, id, s) {
    const b = body(p, id);
    b.motion = { type: 'fall', vy: s.speed ?? 0, dir: s.dir ?? 1, land: s.land ?? true };
    if (!s.quiet) p.sfx('trap', midX(b));
  },

  // { "move": "a", "by": [dx, dy] (cells), "speed": cells/s, "loop": true, "linear": true }
  // "loop": "wrap" starts over from the beginning instead of coming back.
  move(p, id, s) {
    const b = body(p, id);
    const [dx, dy] = s.by;
    b.motion = {
      type: 'move', t: 0, loop: !!s.loop, linear: !!s.linear,
      fx: b.ox, fy: b.oy, tx: b.ox + dx * CW, ty: b.oy + dy * CH,
      len: Math.hypot(dx, dy) || 1, speed: (s.speed ?? 10) / ease(p),
    };
    if (!s.quiet && !s.loop) p.sfx('trap', midX(b));
    return s.wait ? Math.hypot(dx, dy) / b.motion.speed : 0;
  },

  // Circles around a point: { "orbit": "a", "radius": [rx, ry] (cells), "period": s, "at": 0..1, "dir": -1 }
  // "at" is where on the loop the group starts (0 right, 0.25 below, 0.5 left, 0.75 above).
  // Sent to a group that is already orbiting, it keeps its place and changes pace or direction.
  orbit(p, id, s) {
    const b = body(p, id), m = b.motion;
    const period = (s.period ?? 6) * ease(p), dir = s.dir ?? 1;
    if (m?.type === 'orbit') return void Object.assign(m, { period, dir });
    const [rx, ry] = s.radius ?? [4, 4], a = (s.at ?? 0) * Math.PI * 2;
    b.motion = {
      type: 'orbit', a, period, dir, rx: rx * CW, ry: ry * CH,
      cx: b.ox - Math.cos(a) * rx * CW, cy: b.oy - Math.sin(a) * ry * CH,
    };
  },

  stop: (p, id) => { body(p, id).motion = null; },

  // Stalks the player (or keeps away, with "flee": gap in cells) along "axis" ("x", "y" or
  // "xy"), at up to "speed" cells/s, never past "min"/"max" ([dx, dy] cells from where it is).
  chase(p, id, s) {
    const b = body(p, id), lo = s.min ?? [-64, -18], hi = s.max ?? [64, 18];
    b.motion = {
      type: 'chase', axis: s.axis ?? 'x', flee: !!s.flee, gap: (s.flee || 0) * CW,
      speed: (s.speed ?? 6) * CW / ease(p), accel: (s.accel ?? 30) * CW / ease(p), v: [0, 0],
      min: [b.ox + lo[0] * CW, b.oy + lo[1] * CH], max: [b.ox + hi[0] * CW, b.oy + hi[1] * CH],
    };
  },

  // The floor gives way column by column: { "collapse": "a", "from": "left" | "right" |
  // "player", "rate": 14 (columns/s), "wobble": 0.15 }. The columns become groups "a:<x>".
  collapse(p, id, s) {
    const b = body(p, id), cols = new Map();
    for (const c of b.take()) {
      if (!cols.has(c.x)) cols.set(c.x, []);
      cols.get(c.x).push(c);
    }
    const xs = [...cols.keys()], from = s.from ?? 'player';
    const origin = from === 'left' ? Math.min(...xs) : from === 'right' ? Math.max(...xs) : p.player.cx / CW;
    const rate = (s.rate ?? 14) / ease(p), wob = (s.wobble ?? 0.15) * ease(p);
    for (const x of xs) {
      const sub = body(p, `${id}:${x}`);
      for (const c of cols.get(x)) sub.add(c);
      Object.assign(sub, { ox: b.ox, oy: b.oy, visible: b.visible });
      const k = Math.abs(x + 0.5 - origin);
      p.events.script([{ wobble: sub.id, time: wob }, { fall: sub.id, land: false, quiet: true }], k / rate);
    }
    if (!s.quiet) p.sfx('crumble', origin * CW);
  },

  // Sets an actor loose (see actors.js): { "spawn": "bolt", "at": [x, y], "dir": [-1, 0] }
  spawn: (p, type, s) => { p.actors.spawn(type, s, p); },

  // Turns every tile of a group into another one: { "swap": "a", "to": "^" }
  swap(p, id, s) {
    const b = body(p, id);
    for (const c of b.cells) if (!s.from || s.from.includes(c.ch)) c.ch = s.to;
    if (!s.quiet) p.sfx('pop', midX(b));
  },

  // Fills the cells of a zone on the static map: { "fill": "B", "with": "#" }
  fill(p, zone, s) {
    const cells = p.level.zoneCells(zone);
    for (const i of cells) p.level.set(i, s.with ?? ' ');
    if (!s.quiet) p.sfx('thud', cells.reduce((sum, i) => sum + (i % MAP_COLS), 0) / cells.length * CW + CW / 2);
  },

  gravity(p, v) {
    p.setGravity(v === 'flip' ? -p.gravity : v);
  },

  // How hard gravity pulls: { "weight": 0.5 } is the moon.
  weight: (p, v) => { p.weight = v; },

  // Turns a field on or off: { "field": "A", "on": false }
  field(p, id, s) {
    const f = p.level.fields.get(id);
    if (f) f.on = s.on ?? !f.on;
    if (!s.quiet) p.sfx(f?.on ? 'hum' : 'pop');
  },

  controls: (p, v) => { p.reversed = v === 'reverse'; p.sfx('glitch'); },
  speed: (p, v) => { p.player.speed = v; },
  say: (p, text, s) => { p.say(text, s.time ?? 2.5); },
  sfx: (p, name) => { p.sfx(name); },
  shake: (p, v) => { p.shake(v); },
  dark: (p, v) => { p.dark = v; },
  ease: (p, v) => { p.ease = v; },

  // Rising acid: { "tide": rows per second, "to": highest row }. 0 stops it.
  tide(p, v, s) {
    const l = p.level;
    l.tide ??= { y: MAP_H + 6, speed: 0, to: 0 };
    l.tide.speed = v / ease(p);
    l.tide.to = (s.to ?? 0) * CH;
  },
  glitch: (p, v) => { p.glitch = v; p.sfx('glitch'); },
  flash: (p, v) => { p.flash = v; },
  flag: (p, v) => { p.flags[v] = true; },
  fire: (p, id) => { p.events.fire(id); },
  // Talks to a level effect: { "fx": "eye", ...whatever it understands }
  fx: (p, id, s) => { p.fx.find((f) => f.id === id)?.cmd?.(s, p); },
  kill: (p) => { p.kill(); },
  win: (p) => { p.win(); },
};

export class Events {
  constructor(defs = []) {
    this.list = defs.map((def) => ({ def, done: false, was: false }));
    this.scripts = [];
    this.warned = new Set();
  }

  update(dt, play) {
    for (const e of this.list) {
      if (e.done) continue;
      const active = this.check(e.def.when || {}, play);
      if (active && !e.was) this.start(e);
      e.was = active;
    }
    for (const s of this.scripts) this.run(s, dt, play);
    this.scripts = this.scripts.filter((s) => s.i < s.steps.length);
  }

  check(when, play) {
    for (const [k, v] of Object.entries(when)) {
      const fn = triggers[k];
      if (!fn) { this.warn(`trigger "${k}"`); return false; }
      if (!fn(play, v)) return false;
    }
    return true;
  }

  start(e) {
    if (!e.def.repeat) e.done = true;
    this.script(e.def.do || [], e.def.delay);
  }

  // Runs a list of steps; also handy for pack scripts that generate steps.
  script(steps, delay = 0) {
    this.scripts.push({ steps, i: 0, wait: delay || 0 });
  }

  fire(id) {
    const e = this.list.find((x) => x.def.id === id);
    if (e) this.start(e);
  }

  run(s, dt, play) {
    s.wait -= dt;
    while (s.wait <= 0 && s.i < s.steps.length) {
      const step = s.steps[s.i++];
      const name = Object.keys(step)[0];
      const fn = actions[name];
      if (!fn) { this.warn(`action "${name}"`); continue; }
      s.wait += fn(play, step[name], step) || 0;
    }
  }

  warn(what) {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(`[events] unknown ${what}`);
  }
}
