// The Basement: an old brick wall far behind, pipes that sweat, cobwebs, and bare bulbs
// swinging on their cords, each lighting its own pool of the wall.
//
//   { "type": "cellar", "bulbs": [[x, cord], ...], "pipes": [x, ...], "main": row,
//     "webs": true, "drips": 1.2 }
//
// Without bulbs or pipes the level's id picks them, so every room is furnished differently.

import { CW, CH, MAP_COLS, MAP_ROWS, MAP_Y } from '../config.js';
import { TAU, clamp, hash, fbm, noise } from '../art/math.js';
import { gradient, pick, blend } from '../art/color.js';
import { HX, HY, HW, HH, put, putAt, flow, done, cacheLayer, solids, free, blockedAt } from '../art/glyphs.js';
import { seeded, clipMap } from './common.js';

export function cellar(def, play) {
  const pal = play.world.palette, r = seeded(play, 1);
  const brickG = gradient([pal.bg, blend(pal.bg, pal.wallDim, 0.55), blend(pal.wallDim, pal.girder, 0.35)], 10);
  const pipeG = gradient([blend(pal.bg, pal.girder, 0.25), blend(pal.girder, pal.bg, 0.25), pal.girder, '#e8c48a'], 8);
  const webC = blend(pal.dim, pal.bg, 0.35);
  const warm = def.light ?? '#ffcf7a';
  const m0 = solids(play.level);

  // Where things hang from: the first solid cell going up from a column, or the top.
  const ceiling = (x) => { let y = 0; for (let k = 0; k < MAP_ROWS; k++) if (m0[k * MAP_COLS + x]) y = k + 1; else if (k > 4) break; return y; };
  const count = 1 + Math.floor(r() * 2.2);
  const bulbs = (def.bulbs ?? Array.from({ length: count }, (_, i) => [Math.floor((i + 0.3 + r() * 0.4) / count * MAP_COLS), 2 + Math.floor(r() * 3)]))
    .map(([x, cord], i) => {
      const top = ceiling(x);
      return { ax: (x + 0.5) * CW, ay: top * CH, len: (cord + 0.5) * CH, amp: 0.08 + r() * 0.12, w: 1.6 + r() * 0.8, ph: r() * TAU, flick: 0, i };
    });
  const pipes = def.pipes ?? [Math.floor(4 + r() * 20), Math.floor(36 + r() * 24)];
  const main = def.main ?? 1 + Math.floor(r() * 2);
  const drips = [];
  let t = 0;
  const store = {};

  const pos = (b) => {
    const a = Math.sin(t * b.w + b.ph) * b.amp;
    return [b.ax + Math.sin(a) * b.len, b.ay + Math.cos(a) * b.len, a];
  };

  // The wall, pipes and webs, lit where the bulbs hang at rest.
  const paint = (screen, l) => {
    const m = solids(play.level);
    for (let hy = 0; hy < HH; hy++) {
      for (let hx = 0; hx < HW; hx++) {
        if (!free(m, hx, hy)) continue;
        const x = hx * HX + HX / 2, y = hy * HY + HY / 2;
        let lit = 0.14;
        for (const b of bulbs) lit += Math.exp(-(((x - b.ax) ** 2) / 9000 + ((y - b.ay - b.len) ** 2) / 7000)) * 0.9;
        const damp = fbm(x * 0.012, y * 0.02);
        lit *= 0.55 + damp * 0.8;
        // Running bond: courses of two fine rows, joints staggered.
        const course = hy >> 1, shift = (course % 2) * 3, u = (hx + shift) % 6;
        let ch, v;
        if (hy % 2 === 1) { ch = '_'; v = 0.55; } else if (u === 0) { ch = '|'; v = 0.5; } else {
          const n = noise(hx * 0.8, hy * 1.4) + hash(Math.floor((hx + shift) / 6), course) * 0.4;
          ch = n > 1.05 ? ':' : n > 0.8 ? '.' : ' ';
          v = 0.4 + n * 0.25;
        }
        // Cracked, crumbled patches where the plaster's gone.
        if (damp > 0.66) { ch = hash(hx, hy) > 0.6 ? '%' : ';'; v *= 0.8; }
        put(screen, ch, hx * HX, hy * HY, pick(brickG, clamp(v * lit * 1.5)), 2, clamp(0.25 + lit), false, l);
      }
    }
    // Vertical pipes, with flanges, a valve and a gauge.
    for (const [k, px] of pipes.entries()) {
      const hx0 = px * 2;
      for (let hy = 0; hy < HH; hy++) {
        if (!free(m, hx0, hy) || !free(m, hx0 + 1, hy)) continue;
        const flange = hy % 9 === 4, c = pick(pipeG, flange ? 0.85 : 0.5);
        put(screen, flange ? '=' : '|', hx0 * HX, hy * HY, c, 2, 0.8, false, l);
        put(screen, flange ? '=' : hash(hy, k) > 0.85 ? ':' : '|', (hx0 + 1) * HX, hy * HY, pick(pipeG, flange ? 0.7 : 0.3), 2, 0.8, false, l);
        if (hy === 14 + k * 5) {
          put(screen, '0', (hx0 - 1) * HX, hy * HY, pick(pipeG, 0.9), 2, 0.9, true, l);
          put(screen, '-', (hx0 - 2) * HX, hy * HY, pick(pipeG, 0.6), 2, 0.8, false, l);
        }
      }
    }
    // The main along the ceiling, sweating at its joints.
    const hy0 = main * 2;
    for (let hx = 0; hx < HW; hx++) {
      if (!free(m, hx, hy0) || !free(m, hx, hy0 + 1)) continue;
      const joint = hx % 14 === 0;
      put(screen, joint ? '#' : '=', hx * HX, hy0 * HY, pick(pipeG, joint ? 0.8 : 0.55), 2, 0.85, false, l);
      put(screen, joint ? '#' : '-', hx * HX, (hy0 + 1) * HY, pick(pipeG, joint ? 0.6 : 0.3), 2, 0.85, false, l);
    }
    // Cobwebs in the corners where the walls meet the ceiling.
    if (def.webs !== false) {
      for (let x = 1; x < MAP_COLS - 1; x++) {
        const y = ceiling(x);
        if (y === 0 || y >= MAP_ROWS - 4) continue;
        const left = m[y * MAP_COLS + x - 1] && !m[y * MAP_COLS + x], right = m[y * MAP_COLS + x + 1] && !m[y * MAP_COLS + x];
        if (!(left || right) || hash(x, y) > 0.45) continue;
        const ox = left ? x * CW : (x + 1) * CW, oy = y * CH, s = left ? 1 : -1, R = 26 + hash(y, x) * 16;
        for (let k = 0; k < 4; k++) {
          const a = (k + 0.5) / 4 * Math.PI / 2;
          for (let d = 4; d < R; d += 4) putAt(screen, flow(s > 0 ? a : Math.PI - a), ox + Math.cos(a) * d * s, oy + Math.sin(a) * d, webC, 2, 0.55, false, l);
        }
        for (let ring = 10; ring < R; ring += 7) {
          for (let a = 0.15; a < Math.PI / 2; a += 0.22) putAt(screen, '.', ox + Math.cos(a) * ring * s, oy + Math.sin(a) * ring, webC, 2, 0.45, false, l);
        }
      }
    }
  };

  return {
    lights() {
      return bulbs.map((b) => { const [x, y] = pos(b); return { x, y: y + 6, r: 11 * CW, color: warm, i: 0.9 * (1 - b.flick) }; });
    },
    anim(dt) {
      t += dt;
      for (const b of bulbs) {
        // Now and then a bulb browns out for a moment.
        if (b.flick > 0) b.flick = Math.max(0, b.flick - dt * 3);
        else if (hash(Math.floor(t * 8), b.i * 17) > 0.996) b.flick = 0.8;
      }
      if (Math.random() < dt * (def.drips ?? 1.2)) {
        const hx = Math.floor(Math.random() * HW);
        if (hx % 14 < 2) drips.push({ x: hx * HX + HX / 2, y: (main * 2 + 2) * HY, vy: 0 });
      }
      const m = solids(play.level);
      for (let i = drips.length - 1; i >= 0; i--) {
        const d = drips[i];
        d.vy += 600 * dt;
        d.y += d.vy * dt;
        if (blockedAt(m, d.x, d.y) || d.y > MAP_ROWS * CH) {
          play.particles.burst(d.x, d.y - 2, ".,'", 3, 40, pipeG[4], { angle: -Math.PI / 2, spread: 2.2, gravity: 300, life: 0.3 });
          drips.splice(i, 1);
        }
      }
    },
    back(screen) {
      cacheLayer(store, `cellar:${play.level.version}`, screen, (l) => paint(screen, l));
      // Each bulb's light, swinging with it.
      clipMap(screen, (ctx) => {
        ctx.globalCompositeOperation = 'lighter';
        for (const b of bulbs) {
          const [x, y] = pos(b), g = ctx.createRadialGradient(x, y + MAP_Y, 2, x, y + MAP_Y, 120);
          const a = 0.16 * (1 - b.flick);
          g.addColorStop(0, `rgba(255,190,110,${a})`);
          g.addColorStop(1, 'rgba(255,190,110,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - 120, y + MAP_Y - 120, 240, 240);
        }
      });
      for (const d of drips) put(screen, d.vy > 120 ? "'" : '.', d.x - HX / 2, d.y - HY / 2, pipeG[5], 2, 0.8);
      // Cords and bulbs.
      for (const b of bulbs) {
        const [x, y, a] = pos(b), n = Math.ceil(b.len / 7);
        for (let k = 0; k < n; k++) {
          const s = k / n;
          putAt(screen, flow(Math.PI / 2 - a), b.ax + (x - b.ax) * s, b.ay + (y - b.ay) * s, pal.dim, 2, 0.9);
        }
        putAt(screen, 'n', x, y - 3, pal.girder, 2, 1, true);
        putAt(screen, 'O', x, y + 4, b.flick > 0.4 ? pal.dim : '#fff1c8', 1, 1, true);
      }
      done(screen);
    },
  };
}

