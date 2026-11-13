import { CW, CH, MAP_COLS, MAP_Y, PHYS } from '../config.js';
import { registerTile, tileOf } from './tiles.js';
import { overlaps } from './level.js';
import { wallGlyphAt, color } from './render.js';
import { hash } from '../art/math.js';

// Mechanisms: tiles that act on their own, with no trap data needed. Drop the glyph in a
// map and it works; tune it per level in "mechs": { "<name>": { ...options } }.
//
//   ░  crumble  looks like any wall; stood on, it shakes and falls away
//   ¡  pop      a hidden spike that springs up when you come close
//   †  pulse    a floor spike on a beat: down, a warning flicker, up      (‡ hangs from the ceiling)
//   ↑  spring   throws you high when you land on it
//   « » belt    carries whoever stands on it
//
// A mechanism is { tiles, options, setup(cells, opts, level), update(state, dt, play),
// hurts(state, rect, play), draw(state, screen, pal, play) }, all optional but tiles.
// Its state is plain data, so a level can always be rebuilt from scratch on a retry.
// Packs add more with registerMechanism(name, def). Mechanism tiles only act on the
// static map; inside a group (marks) they keep their look and solidity, nothing more.

export const mechanisms = {};

export function registerMechanism(name, def) {
  mechanisms[name] = def;
  for (const [ch, tile] of Object.entries(def.tiles)) registerTile(ch, { ...tile, mech: name, live: true });
}

// Spike hitboxes, as in tiles.js.
const SPIKE_UP = [1, 9, 8, 9], SPIKE_DOWN = [1, 0, 8, 9];
const hitsBox = (rect, x, y, [bx, by, bw, bh]) => overlaps(rect.x, rect.y, rect.w, rect.h, x * CW + bx, y * CH + by, bw, bh);

// The static cells under the player's feet that belong to a mechanism.
const standingOn = (play, name) => play.player.under.filter((u) => u.i >= 0 && tileOf(play.level.grid[u.i])?.mech === name);

// ---------------------------------------------------------------- crumble
registerMechanism('crumble', {
  tiles: { '░': { solid: true, wall: true } },
  options: { delay: 0.32, chain: 0.06, respawn: 0 },
  setup: (cells) => ({ cells: cells.map((c) => ({ ...c, t: -1, state: 'idle' })) }),
  update(s, dt, play, o) {
    const level = play.level;
    const start = (c, delay) => { if (c.state === 'idle') { c.state = 'shake'; c.t = delay; } };
    for (const u of standingOn(play, 'crumble')) {
      const hit = s.cells.find((c) => c.i === u.i);
      if (!hit || hit.state !== 'idle') continue;
      start(hit, o.delay);
      play.sfx('creak', hit.x * CW);
      // The rest of the slab goes too, a cell at a time, spreading from your feet.
      if (o.chain) {
        for (const dir of [-1, 1]) {
          for (let k = 1; ; k++) {
            const c = s.cells.find((n) => n.y === hit.y && n.x === hit.x + dir * k);
            if (!c) break;
            start(c, o.delay + k * o.chain);
          }
        }
      }
    }
    for (const c of s.cells) {
      if (c.state === 'idle') continue;
      c.t -= dt;
      if (c.state === 'shake' && c.t <= 0) {
        c.state = 'gone';
        c.t = o.respawn || Infinity;
        level.set(c.i, ' ');
        const pal = play.world.palette;
        play.particles.burst(c.x * CW + CW / 2, c.y * CH + CH / 2, '#%:.', 5, 70, pal.wall, { angle: Math.PI / 2, spread: 1.2, gravity: 900, life: 0.8 });
        play.particles.burst(c.x * CW + CW / 2, c.y * CH + 4, '.,', 4, 40, pal.dim, { gravity: 200, life: 0.5 });
        play.sfx('crumble', c.x * CW);
      } else if (c.state === 'gone' && c.t <= 0) {
        const r = { x: c.x * CW, y: c.y * CH, w: CW, h: CH }, p = play.player.rect;
        if (overlaps(p.x, p.y, p.w, p.h, r.x, r.y, r.w, r.h)) continue;
        c.state = 'idle';
        level.set(c.i, c.ch);
      }
    }
  },
  draw(s, screen, pal, play) {
    for (const c of s.cells) {
      if (c.state === 'gone') continue;
      const g = wallGlyphAt(play.level, c.x, c.y);
      if (!g) continue;
      const shake = c.state === 'shake' ? (hash(play.ticks, c.x) - 0.5) * 3 : 0;
      screen.glyph(g[0], c.x * CW + shake, c.y * CH + MAP_Y + Math.abs(shake) * 0.4, color(pal, g[1]));
    }
  },
});

// ---------------------------------------------------------------- pop
// A run of hidden spikes side by side pops as one, as soon as you're `reach` cells from it.
registerMechanism('pop', {
  tiles: { '¡': {} },
  options: { reach: 1.4, hold: 0, hint: false },
  setup(cells) {
    const runs = [];
    for (const c of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const last = runs[runs.length - 1];
      if (last && last.y === c.y && last.x1 === c.x - 1) last.x1 = c.x;
      else runs.push({ y: c.y, x0: c.x, x1: c.x, up: 0, state: 'hidden', t: 0 });
    }
    return { runs };
  },
  update(s, dt, play, o) {
    const p = play.player;
    for (const r of s.runs) {
      if (r.state === 'hidden') {
        const dx = Math.max(r.x0 * CW - (p.x + PHYS.w), p.x - (r.x1 + 1) * CW, 0);
        const dy = Math.max(r.y * CH - (p.y + PHYS.h), p.y - (r.y + 1) * CH, 0);
        if (dx < o.reach * CW && dy < CH * 1.5 && p.alive) {
          r.state = 'up';
          r.t = o.hold || Infinity;
          play.sfx('spike', (r.x0 + r.x1 + 1) / 2 * CW);
        }
      } else if (r.state === 'up') {
        r.up = Math.min(1, r.up + dt * 16);
        if ((r.t -= dt) <= 0) r.state = 'down';
      } else if (r.state === 'down') {
        r.up = Math.max(0, r.up - dt * 3);
        if (!r.up) r.state = 'hidden';
      }
    }
  },
  hurts(s, rect) {
    for (const r of s.runs) {
      if (r.up < 0.6) continue;
      for (let x = r.x0; x <= r.x1; x++) if (hitsBox(rect, x, r.y, SPIKE_UP)) return true;
    }
    return false;
  },
  draw(s, screen, pal, play, o) {
    for (const r of s.runs) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (r.up > 0) screen.glyph('^', x * CW, r.y * CH + MAP_Y + (1 - r.up) * 8, pal.hazard);
        else if (o.hint && hash(x, r.y) < 0.5) screen.glyph('.', x * CW, r.y * CH + MAP_Y + 6, pal.dots);
      }
    }
  },
});

// ---------------------------------------------------------------- pulse
// Up for `on` seconds every `period`, with a `warn` flicker before; `wave` delays each column
// a little more than the one to its left, so a row of them ripples.
registerMechanism('pulse', {
  tiles: { '†': { dir: 1 }, '‡': { dir: -1 } },
  options: { period: 2, on: 0.8, warn: 0.45, wave: 0, phase: 0 },
  setup: (cells, o, level) => ({ cells: cells.map((c) => ({ ...c, dir: tileOf(c.ch).dir })), level }),
  phase(c, o, time) {
    const u = (((time + o.phase - c.x * o.wave) % o.period) + o.period) % o.period;
    return u < o.on ? 'up' : u > o.period - o.warn ? 'warn' : 'down';
  },
  update(s, dt, play, o) {
    // One sound per wave, not per spike.
    const time = play.time, before = time - dt;
    const rose = s.cells.find((c) => this.phase(c, o, time) === 'up' && this.phase(c, o, before) !== 'up');
    if (rose) play.sfx('spike', rose.x * CW);
  },
  hurts(s, rect, play, o) {
    for (const c of s.cells) {
      if (this.phase(c, o, play.time) === 'up' && hitsBox(rect, c.x, c.y, c.dir > 0 ? SPIKE_UP : SPIKE_DOWN)) return true;
    }
    return false;
  },
  draw(s, screen, pal, play, o) {
    for (const c of s.cells) {
      const ph = this.phase(c, o, play.time), y = c.y * CH + MAP_Y;
      if (ph === 'up') screen.glyph(c.dir > 0 ? '^' : 'v', c.x * CW, y, pal.hazard);
      else if (ph === 'warn') screen.glyph(Math.sin(play.time * 40) > 0 ? (c.dir > 0 ? ',' : "'") : '.', c.x * CW, y + 4 * c.dir, pal.hazard);
      else screen.glyph(c.dir > 0 ? '_' : '¯', c.x * CW, y, pal.dim);
    }
  },
});

// ---------------------------------------------------------------- spring
registerMechanism('spring', {
  tiles: { '↑': { solid: true } },
  options: { power: 1.5 },
  setup: (cells) => ({ cells: cells.map((c) => ({ ...c, t: 0 })) }),
  update(s, dt, play, o) {
    for (const c of s.cells) c.t = Math.max(0, c.t - dt);
    const hit = standingOn(play, 'spring')[0];
    if (!hit) return;
    const c = s.cells.find((n) => n.i === hit.i);
    c.t = 0.3;
    play.player.launch(o.power);
    play.sfx('spring', c.x * CW);
    play.particles.burst(c.x * CW + CW / 2, c.y * CH, "'.", 5, 90, play.world.palette.accent, { angle: -Math.PI / 2, spread: 1.4, life: 0.35 });
  },
  draw(s, screen, pal) {
    for (const c of s.cells) {
      const y = c.y * CH + MAP_Y;
      if (c.t > 0.22) screen.glyph('=', c.x * CW, y + 4, pal.accent);
      else screen.glyph(c.t > 0 ? '^' : '↑', c.x * CW, y - Math.sin(c.t / 0.22 * Math.PI) * 4, pal.accent);
      screen.glyph('_', c.x * CW, y + 2, pal.girder);
    }
  },
});

// ---------------------------------------------------------------- belt
registerMechanism('belt', {
  tiles: { '«': { solid: true, dir: -1 }, '»': { solid: true, dir: 1 } },
  options: { speed: 5 },
  setup: (cells) => ({ cells: cells.map((c) => ({ ...c, dir: tileOf(c.ch).dir })) }),
  update(s, dt, play, o) {
    const hit = standingOn(play, 'belt')[0];
    if (hit) play.player.conveyor = tileOf(play.level.grid[hit.i]).dir * o.speed * CW;
  },
  draw(s, screen, pal, play, o) {
    for (const c of s.cells) {
      const k = Math.floor(play.time * o.speed * 2 * c.dir - c.x) & 1;
      screen.glyph(k ? (c.dir > 0 ? '>' : '<') : '=', c.x * CW, c.y * CH + MAP_Y, pal.girder);
    }
  },
});

// ---------------------------------------------------------------- runtime

// Every mechanism with cells on this level, set up fresh.
export class Mechanisms {
  constructor(level, options = {}) {
    const byName = new Map();
    level.grid.forEach((ch, i) => {
      const name = tileOf(ch)?.mech;
      if (!name || !mechanisms[name]) return;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ i, x: i % MAP_COLS, y: (i / MAP_COLS) | 0, ch });
    });
    this.list = [...byName].map(([name, cells]) => {
      const def = mechanisms[name], opts = { ...def.options, ...options[name] };
      return { def, opts, state: def.setup ? def.setup(cells, opts, level) : { cells } };
    });
  }

  update(dt, play) {
    play.player.conveyor = 0;
    for (const m of this.list) m.def.update?.call(m.def, m.state, dt, play, m.opts);
  }

  hurts(rect, play) {
    return this.list.some((m) => m.def.hurts?.call(m.def, m.state, rect, play, m.opts));
  }

  draw(screen, pal, play) {
    for (const m of this.list) m.def.draw?.call(m.def, m.state, screen, pal, play, m.opts);
  }
}
