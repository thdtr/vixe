// Material inside walls: rock, brick, riveted steel, ink hatching, planks, hull panels...
// The map draws only the edge of a wall mass; this fills the hollow inside with a carved
// pattern on the fine grid, darker the deeper it is, so a wall reads as a solid block.
//
//   { "type": "texture", "pattern": "brick", "colors": [dark ... light], "alpha": 0.75,
//     "shimmer": "caustics" | "heat" | "scan" | "lamps", "strength": 1, "light": [colors] }
//
// "caustics": 1 on its own still works (the old rock effect). Patterns live in PATTERNS:
// each maps a fine cell to a brightness and, optionally, its own glyph.

import { MAP_COLS, MAP_ROWS } from '../config.js';
import { tileOf } from '../game/tiles.js';
import { clamp, hash, fbm, noise, frac } from '../art/math.js';
import { gradient, pick } from '../art/color.js';
import { HX, HY, HH, RAMP, put, done, cacheLayer } from '../art/glyphs.js';

// (hx, hy) on the fine grid -> [brightness 0..1, glyph or undefined]
export const PATTERNS = {
  rock(hx, hy) {
    const v = fbm(hx * 0.16, hy * 0.27), s = clamp((v - 0.4) * 1.8);
    const strata = 0.5 + 0.5 * Math.sin(hy * 0.9 + fbm(hx * 0.05, hy * 0.1) * 6);
    return [clamp(s * 0.8 + strata * 0.25)];
  },

  // Running bond: courses two fine rows tall, joints staggered by half a brick.
  brick(hx, hy) {
    const course = hy >> 1, u = (hx + (course % 2) * 3) % 6, brick = Math.floor((hx + (course % 2) * 3) / 6);
    const tone = 0.35 + hash(brick, course) * 0.35;
    if (hy % 2 === 1) return [0.25, '_'];
    if (u === 0) return [0.3, '|'];
    const grain = noise(hx * 0.9, hy * 1.7);
    return [clamp(tone + grain * 0.2), grain > 0.62 ? ':' : grain > 0.4 ? '.' : ' '];
  },

  // Steel plates with riveted corners and a little wear.
  plate(hx, hy) {
    const u = hx % 8, v = hy % 6;
    if (v === 0) return [0.45, u === 0 ? '+' : '-'];
    if (u === 0) return [0.4, '|'];
    if ((u === 1 || u === 7) && (v === 1 || v === 5)) return [0.75, 'o'];
    const wear = fbm(hx * 0.12, hy * 0.2), rust = wear > 0.62;
    if (rust) return [0.55 + (wear - 0.62) * 2, hash(hx, hy) > 0.5 ? '%' : ';'];
    return [0.2 + wear * 0.25, (hx + hy) % 4 === 0 ? '/' : ' '];
  },

  // Engraving: diagonal hatching, denser where the ink pools.
  ink(hx, hy) {
    const d = fbm(hx * 0.09, hy * 0.16);
    const a = (hx + hy) % 3 === 0, b = (hx - hy + 99) % 3 === 0;
    if (d > 0.58 && a && b) return [0.9, 'X'];
    if (d > 0.5 && b) return [0.7, '\\'];
    if (a) return [0.5 + d * 0.3, '/'];
    return [0.15 + d * 0.2, d > 0.55 ? '.' : ' '];
  },

  // Floorboards: long planks with grain lines and a nail at each end.
  planks(hx, hy) {
    const board = hy >> 1, len = 14 + Math.floor(hash(board, 3) * 10), off = Math.floor(hash(board, 7) * len);
    const u = (hx + off) % len;
    if (hy % 2 === 1 && hx % 1 === 0 && u > 0) {
      const g = noise(hx * 0.35, board * 3.1);
      return [0.25 + g * 0.3, g > 0.6 ? '~' : '_'];
    }
    if (u === 0) return [0.2, '|'];
    if (u === 1 || u === len - 1) return [0.7, '.'];
    const g = noise(hx * 0.25 + board * 9, hy * 0.5);
    return [0.3 + g * 0.35, g > 0.68 ? '~' : g > 0.5 ? '-' : ' '];
  },

  // Spacecraft hull: wide panels, seams, vents and caution stripes.
  hull(hx, hy) {
    const pw = 12, ph = 6, u = hx % pw, v = hy % ph, panel = hash(Math.floor(hx / pw), Math.floor(hy / ph));
    if (v === 0) return [0.5, u === 0 ? '+' : '=' ];
    if (u === 0) return [0.45, ':'];
    if (panel > 0.82 && v >= 2 && v <= 3 && u >= 2 && u <= 9) return [0.7, '/'];
    if (panel < 0.2 && v === 2 && u > 2 && u < 10) return [0.55, u % 2 ? '=' : '-'];
    if ((u === 1 || u === pw - 1) && (v === 1 || v === ph - 1)) return [0.65, '.'];
    return [0.18 + noise(hx * 0.2, hy * 0.3) * 0.2, ' '];
  },

  // Facets of a crystal: a diamond lattice, each face shaded on its own.
  crystal(hx, hy) {
    const a = Math.floor((hx + hy * 1.6) / 7), b = Math.floor((hx - hy * 1.6 + 400) / 7);
    const face = hash(a, b), ea = frac((hx + hy * 1.6) / 7), eb = frac((hx - hy * 1.6 + 400) / 7);
    if (ea < 0.15) return [0.75, '/'];
    if (eb < 0.15) return [0.75, '\\'];
    return [0.2 + face * 0.5, face > 0.7 ? ':' : face > 0.45 ? '.' : ' '];
  },
};

// Animated light running over the walls: [brightness, glyph] or null.
const SHIMMERS = {
  caustics(x, y, t, hy) {
    const a = Math.sin(x * 0.06 + t * 0.9 + Math.sin(y * 0.08 + t * 0.5) * 1.5);
    const b = Math.sin(y * 0.1 - t * 0.7 + Math.sin(x * 0.05 - t * 0.6) * 1.5);
    const c = Math.pow(1 - Math.abs(a + b) * 0.5, 7) * (1 - hy / HH * 0.6);
    return c < 0.3 ? null : [c, c > 0.6 ? '~' : '-'];
  },
  // Glow rising from below, flickering like a furnace behind the plates.
  heat(x, y, t, hy) {
    const c = Math.pow(hy / HH, 2.2) * (0.6 + 0.4 * noise(x * 0.04, y * 0.05 - t * 1.6));
    return c < 0.32 ? null : [c, c > 0.55 ? '*' : '\''];
  },
  // A slow scanner band sweeping down.
  scan(x, y, t, hy) {
    const band = frac(t * 0.12) * (HH + 12) - 6, d = Math.abs(hy - band);
    return d > 1.5 ? null : [0.8 - d * 0.3, '='];
  },
  // Status lamps here and there, blinking on their own clocks.
  lamps(x, y, t, hy, hx) {
    const n = hash(hx * 7, hy * 13);
    if (n < 0.985) return null;
    const on = frac(t * (0.3 + n * 2) + n * 50) < 0.5;
    return on ? [1, '.'] : null;
  },
};

export function texture(def, play) {
  const pattern = PATTERNS[def.pattern ?? 'rock'] ?? PATTERNS.rock;
  const g = gradient(def.colors ?? ['#03080d', '#0b2030', '#1a3d50', '#2c5a6e'], 10);
  const cg = gradient(def.light ?? ['#14506a', '#53cfee', '#e4fbff'], 8);
  const shimmer = SHIMMERS[def.shimmer ?? (def.caustics ? 'caustics' : '')];
  const strength = def.strength ?? def.caustics ?? 1, alpha = def.alpha ?? 0.75, deep = def.depth ?? 0.09;
  const store = {};
  let t = 0, cells = [], ver = -1;

  // Every fine cell inside a wall mass (not on its edge), with how far it is from open air.
  const scan = (level) => {
    cells = [];
    const N = MAP_COLS * MAP_ROWS, dist = new Int16Array(N).fill(-1), queue = [];
    const wall = (x, y) => x < 0 || x >= MAP_COLS || y < 0 || y >= MAP_ROWS || !!tileOf(level.grid[y * MAP_COLS + x])?.wall;
    for (let i = 0; i < N; i++) {
      if (!wall(i % MAP_COLS, (i / MAP_COLS) | 0)) { dist[i] = 0; queue.push(i); }
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % MAP_COLS, y = (i / MAP_COLS) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) continue;
          const j = ny * MAP_COLS + nx;
          if (dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
        }
      }
    }
    for (let i = 0; i < N; i++) {
      const d = dist[i] < 0 ? 9 : dist[i];
      if (d < 2) continue;
      const x = i % MAP_COLS, y = (i / MAP_COLS) | 0;
      for (let k = 0; k < 4; k++) cells.push([x * 2 + (k & 1), y * 2 + (k >> 1), d]);
    }
    ver = level.version;
  };

  return {
    anim(dt) { t += dt; },
    back(screen) {
      const level = play.level;
      if (ver !== level.version) scan(level);
      cacheLayer(store, `${def.pattern}:${ver}`, screen, (l) => {
        for (const [hx, hy, d] of cells) {
          const [v, ch] = pattern(hx, hy);
          const b = clamp(v * (1 - Math.min(0.6, (d - 2) * deep)));
          put(screen, ch ?? RAMP.rock[Math.round(b * (RAMP.rock.length - 1))], hx * HX, hy * HY, pick(g, b), 2, alpha, false, l);
        }
      });
      if (shimmer) {
        for (const [hx, hy] of cells) {
          const s = shimmer(hx * HX, hy * HY, t, hy, hx);
          if (!s) continue;
          const c = s[0] * strength;
          if (c < 0.2) continue;
          put(screen, s[1], hx * HX, hy * HY, pick(cg, c), 2, clamp(c));
        }
      }
      done(screen);
    },
  };
}
