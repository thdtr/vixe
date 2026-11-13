// Orbit: deep space. A nebula, a spiral galaxy, a ringed gas giant lit from one side,
// three layers of stars drifting at their own pace, and now and then a shooting star.
//
//   { "type": "cosmos", "planet": [x, y, radius] | false, "galaxy": [x, y] | false,
//     "nebula": ["#3a1460", "#ff4fd8", "#3fd0ff"], "drift": 1 }

import { CW, CH, MAP_W, MAP_H } from '../config.js';
import { TAU, clamp, hash, fbm } from '../art/math.js';
import { gradient, pick, blend } from '../art/color.js';
import { HX, HY, HW, HH, put, putAt, done, cacheLayer, solids, free, blockedAt } from '../art/glyphs.js';
import { seeded } from './common.js';

const SPHERE = ' .,:-=+oO0';
const GAS = " .'`-~";

export function cosmos(def, play) {
  const pal = play.world.palette, r = seeded(play, 6);
  const neb = gradient([pal.bg, ...(def.nebula ?? ['#2a0f4a', '#7a2a8a', '#ff4fd8']).map((c) => blend(pal.bg, c, 0.55))], 12);
  const neb2 = gradient([pal.bg, blend(pal.bg, '#1a4a8a', 0.6), blend(pal.bg, '#3fd0ff', 0.5)], 10);
  const planetG = gradient(def.planetColors ?? ['#05060f', '#2a1838', '#6a3a5a', '#c8705a', '#ffd0a0', '#fff6e0'], 14);
  const ringG = gradient(['#3a3550', '#8a8098', '#e0d8c8'], 8);
  const planet = def.planet === false ? null : def.planet ? [(def.planet[0] + 0.5) * CW, (def.planet[1] + 0.5) * CH, def.planet[2] * CW] : r() < 0.75 ? [(r() < 0.5 ? 6 + r() * 12 : 46 + r() * 12) * CW, (3 + r() * 6) * CH, (5 + r() * 4) * CW] : null;
  const galaxy = def.galaxy === false ? null : def.galaxy ? [(def.galaxy[0] + 0.5) * CW, (def.galaxy[1] + 0.5) * CH] : [r() * MAP_W, (1 + r() * 6) * CH];
  const stars = [0.15, 0.35, 0.7].flatMap((speed, layer) => Array.from({ length: [70, 40, 18][layer] }, () => ({
    x: r() * MAP_W, y: r() * MAP_H, speed, layer, p: r() * TAU, tw: 1 + r() * 3,
  })));
  const nebSeed = r() * 50, store = {};
  let t = 0, shooting = null, nextShot = 2 + r() * 4;
  const L = [-0.7, -0.35, 0.62];

  const paint = (screen, l) => {
    const m = solids(play.level);
    for (let hy = 0; hy < HH; hy++) {
      for (let hx = 0; hx < HW; hx++) {
        if (!free(m, hx, hy)) continue;
        const x = hx * HX + HX / 2, y = hy * HY + HY / 2;
        // Two veils of gas, one warm and one cold, with dark lanes through them.
        const a = fbm(x * 0.006 + nebSeed, y * 0.011), b = fbm(x * 0.009 - nebSeed, y * 0.014 + 3);
        const va = clamp((a - 0.45) * 2.4), vb = clamp((b - 0.5) * 2.2);
        if (va > 0.08) put(screen, GAS[Math.round(va * (GAS.length - 1))], hx * HX, hy * HY, pick(neb, va), 2, 0.25 + va * 0.5, false, l);
        else if (vb > 0.08) put(screen, GAS[Math.round(vb * (GAS.length - 1))], hx * HX, hy * HY, pick(neb2, vb), 2, 0.2 + vb * 0.45, false, l);
      }
    }
    // A spiral galaxy, far off.
    if (galaxy) {
      const [gx, gy] = galaxy;
      for (let k = 0; k < 260; k++) {
        const arm = k % 2, s = k / 260, a = s * TAU * 1.6 + arm * Math.PI, d = 3 + s * 34 + (hash(k, 1) - 0.5) * 6;
        const x = gx + Math.cos(a) * d, y = gy + Math.sin(a) * d * 0.45;
        if (blockedAt(m, x, y)) continue;
        putAt(screen, s < 0.15 ? 'o' : hash(k, 2) > 0.7 ? "'" : '.', x, y, pick(neb2, 1 - s * 0.7), 2, 0.9 - s * 0.6, false, l);
      }
    }
    // The planet: banded, lit from the upper left, its ring passing behind and in front.
    if (planet) {
      const [px, py, R] = planet;
      const ring = (front) => {
        for (let a = 0; a < TAU; a += 0.012) {
          const sa = Math.sin(a);
          if ((sa > 0) !== front) continue;
          for (const rr of [1.45, 1.6, 1.75]) {
            const x = px + Math.cos(a) * R * rr, y = py + sa * R * rr * 0.22 - Math.cos(a) * R * 0.12;
            if (!front && Math.hypot(x - px, y - py) < R) continue;
            if (blockedAt(m, x, y)) continue;
            putAt(screen, rr === 1.6 ? '=' : '-', x, y, pick(ringG, 0.3 + (rr - 1.45) * 2 + (front ? 0.2 : 0)), 2, front ? 0.85 : 0.6, false, l);
          }
        }
      };
      ring(false);
      const x0 = Math.floor((px - R) / HX), x1 = Math.ceil((px + R) / HX), y0 = Math.floor((py - R) / HY), y1 = Math.ceil((py + R) / HY);
      for (let hy = Math.max(0, y0); hy <= Math.min(HH - 1, y1); hy++) {
        for (let hx = Math.max(0, x0); hx <= Math.min(HW - 1, x1); hx++) {
          if (!free(m, hx, hy)) continue;
          const nx = (hx * HX + HX / 2 - px) / R, ny = (hy * HY + HY / 2 - py) / R, d2 = nx * nx + ny * ny;
          if (d2 >= 1) continue;
          const nz = Math.sqrt(1 - d2), diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          const band = 0.5 + 0.5 * Math.sin(ny * 11 + fbm(nx * 2, ny * 6) * 4);
          const v = clamp(diff * (0.55 + band * 0.45) + 0.04);
          put(screen, SPHERE[Math.round(v * (SPHERE.length - 1))], hx * HX, hy * HY, pick(planetG, v), 2, 0.95, v > 0.8, l);
        }
      }
      ring(true);
    }
  };

  return {
    anim(dt) {
      t += dt;
      for (const s of stars) { s.x -= s.speed * 4 * dt * (def.drift ?? 1); if (s.x < 0) s.x += MAP_W; }
      if (shooting) { shooting.age += dt; if (shooting.age > 0.9) shooting = null; }
      else if ((nextShot -= dt) <= 0) {
        nextShot = 3 + Math.random() * 6;
        shooting = { x: Math.random() * MAP_W, y: Math.random() * MAP_H * 0.5, a: 0.35 + Math.random() * 0.4, dir: Math.random() < 0.5 ? -1 : 1, age: 0 };
      }
    },
    back(screen) {
      const m = solids(play.level);
      cacheLayer(store, `cosmos:${play.level.version}`, screen, (l) => paint(screen, l));
      for (const s of stars) {
        if (blockedAt(m, s.x, s.y)) continue;
        const tw = 0.5 + 0.5 * Math.sin(t * s.tw + s.p), bright = s.layer === 2 && tw > 0.85;
        put(screen, bright ? '+' : s.layer ? (tw > 0.6 ? "'" : '.') : '.', s.x, s.y, s.layer === 2 ? '#ffffff' : pal.text, 2, (0.25 + s.layer * 0.25) * (0.4 + tw * 0.6), bright);
      }
      if (shooting) {
        const k = shooting.age / 0.9, len = 70;
        for (let s = 0; s < 1; s += 0.05) {
          const d = (k * 300 - s * len), x = shooting.x + Math.cos(shooting.a) * d * shooting.dir, y = shooting.y + Math.sin(shooting.a) * d;
          if (!blockedAt(m, x, y)) putAt(screen, s < 0.1 ? 'o' : shooting.dir > 0 ? '\\' : '/', x, y, '#e8f0ff', 2, (1 - s) * (1 - k));
        }
      }
      done(screen);
    },
  };
}

