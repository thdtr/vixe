// Inside Out: an endless tunnel drawn in perspective, rushing toward a vanishing point, with
// impossible shapes turning in the air. When gravity flips the whole tunnel rolls over with
// you; when the controls flip it turns into its own mirror image.
//
//   { "type": "mirror", "at": [x, y] (vanishing point, cells), "speed": 0.35, "cubes": 3 }

import { CW, CH, MAP_W, MAP_H } from '../config.js';
import { TAU, clamp, frac, approach, hash } from '../art/math.js';
import { gradient, pick, blend } from '../art/color.js';
import { HX, HY, HW, HH, put, putAt, flow, done, solids, free } from '../art/glyphs.js';
import { seeded } from './common.js';

export function mirror(def, play) {
  const pal = play.world.palette, r = seeded(play, 3);
  const [vx, vy] = def.at ? [(def.at[0] + 0.5) * CW, (def.at[1] + 0.5) * CH] : [MAP_W / 2, MAP_H / 2];
  const lines = gradient([pal.bg, blend(pal.bg, pal.wallDim, 0.9), blend(pal.wallDim, pal.girder, 0.5), pal.girder], 10);
  const glow = gradient([pal.bg, blend(pal.bg, pal.accent, 0.5), pal.accent], 8);
  const cubes = Array.from({ length: def.cubes ?? 3 }, (_, i) => ({
    x: (0.12 + (i + r() * 0.6) / (def.cubes ?? 3) * 0.8) * MAP_W, y: (0.2 + r() * 0.5) * MAP_H, s: 12 + r() * 14,
    ax: r() * TAU, ay: r() * TAU, wx: 0.3 + r() * 0.5, wy: 0.2 + r() * 0.4, bob: r() * TAU, penrose: i % 2 === 1,
  }));
  let t = 0, roll = 0, flip = 1;

  // 3D wireframes: a cube, or the three bars of an impossible triangle.
  const CUBE = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const CUBE_E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const TRI = [[-1, 1, 0], [1, 1, 0], [0, -0.8, 0], [-0.6, 0.65, 0.3], [0.6, 0.65, 0.3], [0, -0.35, 0.3]];
  const TRI_E = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]];

  const wire = (screen, m, c) => {
    const [pts, edges] = c.penrose ? [TRI, TRI_E] : [CUBE, CUBE_E];
    const ax = c.ax + t * c.wx, ay = c.ay + t * c.wy, cx = c.x, cy = c.y + Math.sin(t * 0.8 + c.bob) * 6;
    const P = pts.map(([x, y, z]) => {
      const y1 = y * Math.cos(ax) - z * Math.sin(ax), z1 = y * Math.sin(ax) + z * Math.cos(ax);
      const x2 = x * Math.cos(ay) + z1 * Math.sin(ay), z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
      const k = 3 / (4 + z2);
      return [cx + x2 * c.s * k, cy + y1 * c.s * k * 0.9, z2];
    });
    for (const [a, b] of edges) {
      const [x0, y0, z0] = P[a], [x1, y1, z1] = P[b], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4), ch = flow(Math.atan2(y1 - y0, x1 - x0));
      for (let k = 0; k <= n; k++) {
        const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n, z = z0 + (z1 - z0) * k / n;
        if (!free(m, Math.floor(x / HX), Math.floor(y / HY))) continue;
        putAt(screen, ch, x, y, pick(glow, 0.55 - z * 0.25), 2, 0.75 - z * 0.15);
      }
    }
  };

  return {
    anim(dt) {
      t += dt;
      // Roll toward upside down with gravity, mirror with the controls.
      roll = approach(roll, play.gravity < 0 ? Math.PI : 0, dt * 3.2);
      flip = approach(flip, play.reversed ? -1 : 1, dt * 4);
    },
    back(screen) {
      const m = solids(play.level), speed = def.speed ?? 0.35, cs = Math.cos(roll), sn = Math.sin(roll);
      for (let hy = 0; hy < HH; hy++) {
        for (let hx = 0; hx < HW; hx++) {
          if (!free(m, hx, hy)) continue;
          let dx = (hx * HX + HX / 2 - vx) * flip, dy = hy * HY + HY / 2 - vy;
          [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs];
          // Which face of the box tunnel: floor and ceiling, or the two walls.
          const side = Math.abs(dx) * 0.56 > Math.abs(dy);
          const a = side ? Math.abs(dx) : Math.abs(dy), b = side ? dy : dx;
          if (a < 6) continue;
          const z = 60 / a, u = b / a;
          const across = frac(z * 0.9 - t * speed * 3), along = frac(u * 3.2 + 0.5);
          const fade = clamp(1.25 - z * 0.62) * (def.alpha ?? 0.7);
          let ch = null, v = 0;
          if (across < 0.07 * (1 + z * 0.3)) { ch = side ? '|' : '-'; v = 0.75; }
          else if (along < 0.06 || along > 0.94) { ch = flow(Math.atan2(hy * HY - vy, hx * HX - vx)); v = 0.6; }
          else if (hash(hx, hy) > 0.97) { ch = '.'; v = 0.35; }
          if (ch && fade > 0.05) put(screen, ch, hx * HX, hy * HY, pick(lines, v * fade + 0.15), 2, clamp(fade));
        }
      }
      for (const c of cubes) wire(screen, m, c);
      done(screen);
    },
  };
}
