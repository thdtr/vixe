// The Foundry: trusses in the dark, great gears meshing, chains swaying, a ladle pouring
// white-hot metal, steam from the floor vents and the glow of the furnace under it all.
//
//   { "type": "foundry", "gears": [[x, y, radius], ...], "pour": x | false, "trusses": [row, ...],
//     "chains": [x, ...], "steam": [x, ...] }
//
// Anything left out is picked from the level's id, so every room is fitted out differently.

import { CW, CH, MAP_COLS, MAP_ROWS, MAP_H } from '../config.js';
import { TAU, clamp, hash, noise, frac } from '../art/math.js';
import { gradient, pick, blend } from '../art/color.js';
import { HX, HY, HW, HH, put, putAt, flow, done, cacheLayer, solids, free } from '../art/glyphs.js';
import { seeded } from './common.js';

export function foundry(def, play) {
  const pal = play.world.palette, r = seeded(play, 2);
  const steel = gradient([pal.bg, blend(pal.bg, pal.wallDim, 0.7), blend(pal.wallDim, pal.wall, 0.3)], 10);
  const gearG = gradient([pal.bg, blend(pal.bg, pal.wallDim, 0.8), blend(pal.wallDim, pal.girder, 0.45), blend(pal.girder, '#ffd9a0', 0.2)], 12);
  const hot = gradient(['#5a0a00', '#c42a05', '#ff7a1a', '#ffd25a', '#fff6d0'], 12);
  const m0 = solids(play.level);
  const roomAt = (x, y) => x >= 0 && x < MAP_COLS && y >= 0 && y < MAP_ROWS && !m0[y * MAP_COLS + x];

  // Gears sit where there's open space; a second one meshes with the first.
  let gears = def.gears;
  if (!gears) {
    gears = [];
    for (let k = 0; k < 40 && gears.length < 2; k++) {
      const R = 3 + Math.floor(r() * 4), x = 4 + Math.floor(r() * 56), y = 2 + Math.floor(r() * 9);
      if (roomAt(x, y) && !gears.some(([gx, gy, gr]) => Math.hypot((gx - x) * CW, (gy - y) * CH) < (gr + R) * CW * 1.4)) gears.push([x, y, R]);
    }
    // A smaller one meshing with the first, down and to the side, teeth into teeth.
    if (gears[0]) {
      const [x, y, R] = gears[0], R2 = Math.max(2, R - 2), d = R + R2 + 0.5, a = 0.55;
      gears.push([x + d * Math.cos(a) * (x < 32 ? 1 : -1), y + d * Math.sin(a) * CW / CH, R2]);
    }
  }
  gears = gears.map(([x, y, R], i) => ({ x: (x + 0.5) * CW, y: (y + 0.5) * CH, R: R * CW, n: Math.max(8, Math.round(R * 3)), dir: i % 2 ? -1 : 1, speed: 0.35 / R * 3 }));
  const trusses = def.trusses ?? [1 + Math.floor(r() * 3), 7 + Math.floor(r() * 4)];
  const chains = (def.chains ?? [Math.floor(r() * 60) + 2, Math.floor(r() * 60) + 2]).map((x) => ({ x: (x + 0.5) * CW, len: 3 + Math.floor(r() * 6), ph: r() * TAU }));
  const pourX = def.pour === false ? null : (def.pour ?? (r() < 0.6 ? 6 + Math.floor(r() * 52) : null));
  const vents = (def.steam ?? [Math.floor(r() * 64), Math.floor(r() * 64)]).map((x) => ({ x: (x + 0.5) * CW, puffs: [], next: r() * 2 }));
  const store = {};
  let t = 0;

  const paint = (screen, l) => {
    const m = solids(play.level);
    // Trusses: two chords and a zigzag web between them, riveted at the nodes.
    for (const row of trusses) {
      const top = row * 2, bottom = top + 3;
      for (let hx = 0; hx < HW; hx++) {
        const u = hx % 6;
        for (let hy = top; hy <= bottom; hy++) {
          if (!free(m, hx, hy)) continue;
          let ch = null, v = 0.5;
          if (hy === top || hy === bottom) { ch = u === 0 ? 'o' : '='; v = u === 0 ? 0.8 : 0.55; }
          else {
            const k = hy - top, zig = Math.floor(hx / 6) % 2 ? u === 6 - k * 2 || u === 7 - k * 2 : u === k * 2 || u === k * 2 - 1;
            if (zig) { ch = Math.floor(hx / 6) % 2 ? '/' : '\\'; v = 0.45; }
          }
          if (ch) put(screen, ch, hx * HX, hy * HY, pick(steel, v), 2, 0.5, false, l);
        }
      }
    }
    // Columns holding the trusses up, every so often.
    for (let hx = 6; hx < HW; hx += 34) {
      for (let hy = 0; hy < HH; hy++) {
        if (!free(m, hx, hy) || !free(m, hx + 1, hy)) continue;
        put(screen, hy % 5 === 0 ? '+' : '|', hx * HX, hy * HY, pick(steel, 0.5), 2, 0.6, false, l);
        put(screen, hy % 5 === 0 ? '+' : ':', (hx + 1) * HX, hy * HY, pick(steel, 0.3), 2, 0.6, false, l);
      }
    }
  };

  const drawGear = (screen, m, g) => {
    const rot = t * g.speed * g.dir, out = g.R + 5, hub = g.R * 0.3;
    const x0 = Math.max(0, Math.floor((g.x - out) / HX)), x1 = Math.min(HW - 1, Math.ceil((g.x + out) / HX));
    const y0 = Math.max(0, Math.floor((g.y - out) / HY)), y1 = Math.min(HH - 1, Math.ceil((g.y + out) / HY));
    for (let hy = y0; hy <= y1; hy++) {
      for (let hx = x0; hx <= x1; hx++) {
        if (!free(m, hx, hy)) continue;
        const dx = hx * HX + HX / 2 - g.x, dy = hy * HY + HY / 2 - g.y, d = Math.hypot(dx, dy);
        if (d > out) continue;
        const a = Math.atan2(dy, dx), lit = 0.55 + 0.45 * (-(dx + dy) / (d || 1)) * 0.5;
        let ch = null, v = 0;
        if (d > g.R) {
          if (frac((a - rot) * g.n / TAU) < 0.45) { ch = flow(a); v = 0.75; }
        } else if (d > g.R - 4) { ch = flow(a + Math.PI / 2); v = 0.9; }
        else if (d < hub) { ch = d < hub * 0.45 ? 'O' : flow(a + Math.PI / 2); v = d < hub * 0.45 ? 1 : 0.7; }
        else if (Math.abs(Math.sin((a - rot) * 3)) < 0.14) { ch = flow(a); v = 0.6; }
        else if (hash(hx, hy) > 0.75) { ch = '.'; v = 0.25; }
        if (ch) put(screen, ch, hx * HX, hy * HY, pick(gearG, v * lit), 2, 0.85);
      }
    }
  };

  return {
    lights() {
      const out = [];
      if (pourX != null) out.push({ x: (pourX + 0.5) * CW, y: MAP_H - CH * 2, r: 10 * CW, color: '#ff7a1a', i: 0.9 });
      return out;
    },
    anim(dt) {
      t += dt;
      for (const v of vents) {
        if ((v.next -= dt) <= 0) { v.next = 2.5 + Math.random() * 3; for (let i = 0; i < 6; i++) v.puffs.push({ x: v.x + (Math.random() - 0.5) * 6, y: MAP_H - 4 - i * 3, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 20, age: 0 }); }
        for (const p of v.puffs) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 1 - dt * 0.4; }
        v.puffs = v.puffs.filter((p) => p.age < 2.6);
      }
    },
    back(screen) {
      const m = solids(play.level);
      cacheLayer(store, `foundry:${play.level.version}`, screen, (l) => paint(screen, l));
      for (const g of gears) drawGear(screen, m, g);
      // Chains on pulleys, swaying, a hook at the end.
      for (const c of chains) {
        const sway = Math.sin(t * 0.9 + c.ph) * 0.06;
        for (let k = 0; k < c.len * 2; k++) {
          const y = k * HY + 2, x = c.x + Math.sin(sway) * y;
          if (!free(m, Math.floor(x / HX), Math.floor(y / HY))) break;
          putAt(screen, k % 2 ? '0' : '|', x, y, pick(steel, 0.75), 2, 0.85);
          if (k === c.len * 2 - 1) putAt(screen, 'J', x + 1, y + HY, pick(steel, 0.9), 2, 0.9, true);
        }
      }
      // The pour: a ladle tipping a ribbon of white-hot metal down into the dark.
      if (pourX != null) {
        const x = (pourX + 0.5) * CW;
        putAt(screen, '\\', x - 6, 6, pick(steel, 0.8), 2, 0.9, true);
        putAt(screen, '_', x - 2, 8, pick(steel, 0.8), 2, 0.9, true);
        for (let hy = 1; hy < HH; hy++) {
          const y = hy * HY + HY / 2, wob = Math.sin(y * 0.15 - t * 9) * 1.2;
          if (!free(m, Math.floor((x + wob) / HX), hy)) break;
          const v = 0.65 + 0.35 * noise(y * 0.2 - t * 12, 1);
          putAt(screen, v > 0.85 ? '!' : '|', x + wob, y, pick(hot, v), 2, 1, v > 0.85);
        }
      }
      // Steam rising from the floor vents.
      for (const v of vents) {
        for (const p of v.puffs) {
          const k = p.age / 2.6, ch = k < 0.3 ? 'o' : k < 0.6 ? '~' : '.';
          if (free(m, Math.floor(p.x / HX), Math.floor(p.y / HY))) putAt(screen, ch, p.x, p.y, '#c8d2d6', 2, (1 - k) * 0.5);
        }
      }
      // The furnace under the floor breathes.
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.3) * Math.sin(t * 0.7 + 1);
      for (let hx = 0; hx < HW; hx += 1) {
        const n = noise(hx * 0.15, t * 0.8), h = 2 + n * 3 * (0.6 + breathe * 0.4);
        for (let k = 0; k < h; k++) {
          const hy = HH - 1 - k;
          if (!free(m, hx, hy)) continue;
          const v = clamp((1 - k / h) * (0.35 + n * 0.4));
          if (v > 0.12) put(screen, k === 0 ? '~' : '.', hx * HX, hy * HY, pick(hot, v * 0.7), 2, v * 0.8);
        }
      }
      done(screen);
    },
  };
}
