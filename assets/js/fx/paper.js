// Between the Lines: the level is a page. Ruled lines, a red margin, the ghost of text
// erased underneath, a coffee ring, ink spatters and doodles in the margin, and the shadow
// of the binding down one side.
//
//   { "type": "paper", "margin": 5, "ring": [x, y] | false, "binding": "left" | "right" }

import { CW, CH, MAP_W, MAP_H, MAP_Y } from '../config.js';
import { TAU, hash, noise } from '../art/math.js';
import { blend } from '../art/color.js';
import { HX, HY, HW, HH, put, putAt, done, cacheLayer, solids, free } from '../art/glyphs.js';
import { seeded, clipMap } from './common.js';

const GHOST = ('era uma vez um porão onde o chão mentia e as portas fugiam ' +
  'once upon a time the floor lied and every door ran away from you ' +
  'não acredite em tudo que lê nem nas linhas nem no que fica entre elas ' +
  'the end is never where the page says it is turn back read again ').split(' ');

export function paper(def, play) {
  const pal = play.world.palette, r = seeded(play, 4);
  const rule = def.rule ?? blend(pal.bg, '#6f93b8', 0.38), margin = def.marginColor ?? blend(pal.bg, '#d0503c', 0.55);
  const ghost = blend(pal.bg, pal.text, 0.16), coffee = blend(pal.bg, '#7a4a1e', 0.5), ink = blend(pal.bg, pal.wall, 0.55);
  const fiber = blend(pal.bg, pal.wallDim, 0.5);
  const mx = (def.margin ?? 5) * 2;
  const ring = def.ring === false ? null : def.ring ? [(def.ring[0] + 0.5) * CW, (def.ring[1] + 0.5) * CH] : r() < 0.7 ? [(10 + r() * 44) * CW, (3 + r() * 10) * CH] : null;
  const blots = Array.from({ length: 2 + Math.floor(r() * 3) }, () => [r() * MAP_W, r() * MAP_H, 4 + r() * 8]);
  const doodle = Math.floor(r() * 3);
  const store = {};

  const paint = (screen, l) => {
    const m = solids(play.level), ok = (x, y) => free(m, Math.floor(x / HX), Math.floor(y / HY));
    // Paper grain and stray fibers.
    for (let hy = 0; hy < HH; hy++) {
      for (let hx = 0; hx < HW; hx++) {
        if (!free(m, hx, hy)) continue;
        const n = hash(hx * 3, hy * 7);
        if (n > 0.985) put(screen, n > 0.995 ? '~' : '`', hx * HX, hy * HY, fiber, 2, 0.6, false, l);
      }
    }
    // Erased words, still pressed into the page.
    let w = Math.floor(r() * GHOST.length);
    for (let row = 1; row < 18; row += 1) {
      if (hash(row, 99) < 0.35) continue;
      let hx = mx + 3 + Math.floor(hash(row, 5) * 8);
      while (hx < HW - 6) {
        const word = GHOST[w++ % GHOST.length];
        if (hx + word.length >= HW) break;
        [...word].forEach((ch, k) => { if (free(m, hx + k, row * 2)) put(screen, ch, (hx + k) * HX, row * 2 * HY + 2, ghost, 2, 0.45, false, l); });
        hx += word.length + 1;
      }
    }
    // The rules: one under every line of the map, and the margin.
    for (let hy = 1; hy < HH; hy += 2) {
      for (let hx = 0; hx < HW; hx++) if (free(m, hx, hy)) put(screen, '_', hx * HX, hy * HY, rule, 2, 0.9, false, l);
    }
    for (let hy = 0; hy < HH; hy++) {
      if (free(m, mx, hy)) put(screen, '|', mx * HX, hy * HY, margin, 2, 0.9, false, l);
      if (free(m, mx + 1, hy)) put(screen, '|', (mx + 1) * HX - 2, hy * HY, margin, 2, 0.5, false, l);
    }
    // A coffee ring: never quite closed, darker where it dried.
    if (ring) {
      const [cx, cy] = ring, R = 34;
      for (let a = 0; a < TAU * 0.92; a += 0.045) {
        const k = noise(a * 3, 7), rr = R + (k - 0.5) * 4;
        for (let d = -2; d <= 2; d += 2) {
          const x = cx + Math.cos(a + 0.6) * (rr + d), y = cy + Math.sin(a + 0.6) * (rr + d) * 0.8;
          if (ok(x, y)) putAt(screen, d === 2 ? ')' : d === 0 ? 'o' : '.', x, y, coffee, 2, 0.22 + k * 0.3, false, l);
        }
      }
    }
    // Ink spatters.
    for (const [bx, by, s] of blots) {
      for (let k = 0; k < s * 3; k++) {
        const a = hash(k, bx | 0) * TAU, d = Math.pow(hash(k, by | 0), 2) * s * 3;
        const x = bx + Math.cos(a) * d, y = by + Math.sin(a) * d * 0.8;
        if (ok(x, y)) putAt(screen, d < s ? 'o' : d < s * 2 ? '.' : ',', x, y, ink, 2, 0.5, d < s, l);
      }
    }
    // A doodle in the margin: a spiral, a little star, or an arrow pointing nowhere.
    const dx = mx * HX / 2, dy = MAP_H * (0.25 + hash(doodle, 3) * 0.5);
    if (doodle === 0) {
      for (let a = 0; a < TAU * 3; a += 0.25) {
        const d = 2 + a * 2.4, x = dx + Math.cos(a) * d, y = dy + Math.sin(a) * d * 0.8;
        if (ok(x, y)) putAt(screen, '.', x, y, ink, 2, 0.6, false, l);
      }
    } else if (doodle === 1) {
      for (let k = 0; k < 5; k++) {
        const a0 = -Math.PI / 2 + k * TAU * 2 / 5, a1 = a0 + TAU * 2 / 5;
        for (let s = 0; s <= 1; s += 0.12) {
          const x = dx + (Math.cos(a0) * (1 - s) + Math.cos(a1) * s) * 14, y = dy + (Math.sin(a0) * (1 - s) + Math.sin(a1) * s) * 12;
          if (ok(x, y)) putAt(screen, '.', x, y, ink, 2, 0.6, false, l);
        }
      }
    } else {
      for (let s = 0; s < 1; s += 0.08) if (ok(dx - 12 + s * 24, dy)) putAt(screen, '-', dx - 12 + s * 24, dy, ink, 2, 0.6, false, l);
      if (ok(dx + 12, dy)) putAt(screen, '}', dx + 13, dy, ink, 2, 0.7, true, l);
    }
  };

  return {
    back(screen) {
      cacheLayer(store, `paper:${play.level.version}`, screen, (l) => paint(screen, l));
      // The binding: the page curves into shadow near one edge.
      clipMap(screen, (ctx) => {
        const left = (def.binding ?? 'left') === 'left', g = ctx.createLinearGradient(left ? 0 : MAP_W, 0, left ? 60 : MAP_W - 60, 0);
        g.addColorStop(0, 'rgba(60,40,20,0.22)');
        g.addColorStop(1, 'rgba(60,40,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect(left ? 0 : MAP_W - 60, MAP_Y, 60, MAP_H);
      });
      done(screen);
    },
  };
}

