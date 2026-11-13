// Helpers shared by the scenery effects.

import { MAP_W, MAP_H, MAP_Y } from '../config.js';
import { rng } from '../art/math.js';

// A generator seeded by the level, so each level gets its own scenery and keeps it on every try.
export function seeded(play, salt = 0) {
  let h = 7 + salt * 131;
  for (const ch of String(play.def?.id ?? 'x')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return rng(h);
}

// Drawing straight to the map area with the screen's transform, in map pixels.
export function clipMap(screen, draw) {
  const ctx = screen.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, MAP_Y, MAP_W, MAP_H);
  ctx.clip();
  draw(ctx);
  ctx.restore();
}

// Picks from a list with a generator.
export const choose = (r, list) => list[Math.floor(r() * list.length)];

// A value from a def or a default, as a list of points scaled to pixels.
export const cells = (list, cw, ch) => list.map(([x, y, ...rest]) => [x * cw, y * ch, ...rest]);
