// Backstage: a painted backdrop hung far behind (clouds and a moon on canvas), the fly
// system's ropes, a scalloped valance, haze, and followspots sweeping the dark from the
// rig above, each beam full of dust.
//
//   { "type": "stage", "spots": [[x, angle], ...], "moon": [x, y] | false, "haze": 0.5 }

import { CW, CH, MAP_H, MAP_COLS } from '../config.js';
import { TAU, clamp, hash, fbm, noise } from '../art/math.js';
import { gradient, pick, blend } from '../art/color.js';
import { HX, HY, HW, HH, put, putAt, done, cacheLayer, solids, free } from '../art/glyphs.js';
import { seeded } from './common.js';

export function stage(def, play) {
  const pal = play.world.palette, r = seeded(play, 5);
  const drop = gradient([pal.bg, blend(pal.bg, '#2a1530', 0.8), blend(pal.bg, '#5a2a40', 0.7), blend(pal.wallDim, '#d08a6a', 0.35)], 10);
  const velvet = gradient([pal.bg, blend(pal.bg, pal.wallDim, 0.8), pal.wallDim, blend(pal.wallDim, '#ff5060', 0.35)], 10);
  const beamC = gradient([pal.bg, blend(pal.bg, pal.accent, 0.35), blend(pal.accent, '#fff4d0', 0.4)], 8);
  const gold = blend(pal.girder, pal.accent, 0.4), rope = blend(pal.dim, pal.bg, 0.3);
  const moon = def.moon === false ? null : def.moon ? [(def.moon[0] + 0.5) * CW, (def.moon[1] + 0.5) * CH] : [(14 + r() * 36) * CW, (3 + r() * 4) * CH];
  const spots = (def.spots ?? [[8 + Math.floor(r() * 16), 0.35], [40 + Math.floor(r() * 16), -0.35]]).map(([x, a], i) => ({ x: (x + 0.5) * CW, a, w: 0.5 + r() * 0.4, ph: r() * TAU, i }));
  const lines = Array.from({ length: 7 }, () => Math.floor(r() * MAP_COLS));
  const store = {};
  let t = 0;

  const paint = (screen, l) => {
    const m = solids(play.level);
    for (let hy = 0; hy < HH; hy++) {
      for (let hx = 0; hx < HW; hx++) {
        if (!free(m, hx, hy)) continue;
        const x = hx * HX + HX / 2, y = hy * HY + HY / 2;
        // The valance: swags hung in a row across the top, with a gold fringe.
        const sw = (hx % 16) / 16, swag = 3 + Math.sin(sw * Math.PI) * 2.2;
        if (hy < swag) { put(screen, hy > swag - 1 ? (hx % 2 ? ':' : '|') : sw < 0.08 || sw > 0.92 ? '(' : ')', hx * HX, hy * HY, hy > swag - 1 ? gold : pick(velvet, 0.35 + Math.sin(sw * Math.PI) * 0.5), 2, 0.55, false, l); continue; }
        // The painted backdrop: soft clouds, brush strokes, and a moon.
        let v = 0.12 + fbm(x * 0.006, y * 0.012) * 0.45 * (1 - y / MAP_H * 0.6);
        let ch = v > 0.42 ? '~' : v > 0.32 ? '-' : v > 0.24 ? '.' : null;
        if (moon) {
          const d = Math.hypot(x - moon[0], (y - moon[1]) * 1.1);
          if (d < 34) { const k = 1 - d / 34, crater = noise(x * 0.15, y * 0.2) > 0.62; ch = crater ? 'o' : k > 0.3 ? 'O' : '('; v = 0.55 + k * 0.4 - (crater ? 0.15 : 0); }
          else if (d < 50) v += (1 - (d - 34) / 16) * 0.15;
        }
        if (ch) put(screen, ch, hx * HX, hy * HY, pick(drop, v), 2, 0.45, false, l);
      }
    }
    // The fly system: lines dropping from the grid, a few with sandbag counterweights.
    for (const [k, x] of lines.entries()) {
      const hx = x * 2 + 1, len = 6 + Math.floor(hash(k, 3) * 18);
      for (let hy = 4; hy < len; hy++) if (free(m, hx, hy)) put(screen, ':', hx * HX, hy * HY, rope, 2, 0.6, false, l);
      if (k % 3 === 0 && free(m, hx, len)) put(screen, '8', hx * HX, len * HY, blend(pal.girder, pal.bg, 0.4), 2, 0.8, true, l);
    }
  };

  const beam = (s) => s.a + Math.sin(t * 0.35 * s.w + s.ph) * 0.45;

  return {
    lights() {
      // Where each spot lands, for a "light" layer if the level has one.
      return spots.map((s) => {
        const a = beam(s), d = MAP_H * 0.85;
        return { x: s.x + Math.sin(a) * d, y: Math.cos(a) * d, r: 7 * CW, color: '#fff0c8', i: 0.8 };
      });
    },
    anim(dt) { t += dt; },
    back(screen) {
      const m = solids(play.level);
      cacheLayer(store, `stage:${play.level.version}`, screen, (l) => paint(screen, l));
      // Followspots: cones from the rig, sweeping, full of dust.
      for (const s of spots) {
        const a = beam(s), ca = Math.cos(a), sa = Math.sin(a);
        for (let hy = 1; hy < HH; hy++) {
          for (let hx = 0; hx < HW; hx++) {
            const dx = hx * HX + HX / 2 - s.x, dy = hy * HY + HY / 2;
            const along = dx * sa + dy * ca, across = dx * ca - dy * sa, w = 6 + along * 0.2;
            if (along < 0 || Math.abs(across) > w || !free(m, hx, hy)) continue;
            const edge = 1 - Math.abs(across) / w, fall = clamp(1 - along / (MAP_H * 1.1));
            const mote = hash(hx + Math.floor(t * 4), hy) > 0.93;
            const v = edge * fall * (def.beam ?? 0.55);
            if (v < 0.05 && !mote) continue;
            put(screen, mote ? '.' : Math.abs(across) > w * 0.8 ? (across * ca > 0 ? '\\' : '/') : "'", hx * HX, hy * HY, pick(beamC, v + 0.3), 2, mote ? 0.7 * fall : v);
          }
        }
        putAt(screen, 'U', s.x, 6, gold, 1, 0.9, true);
      }
      // Haze rolling over the boards.
      const haze = def.haze ?? 0.5;
      for (let hx = 0; hx < HW; hx++) {
        const n = noise(hx * 0.08 + t * 0.15, t * 0.1);
        for (let k = 0; k < 4; k++) {
          const hy = HH - 3 - k;
          if (!free(m, hx, hy)) continue;
          const v = n * haze * (1 - k / 4);
          if (v > 0.12) put(screen, k ? '-' : '~', hx * HX, hy * HY, blend(pal.dim, pal.bg, 0.2), 2, v);
        }
      }
      done(screen);
    },
  };
}

