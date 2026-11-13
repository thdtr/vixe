// Glyph stamping for procedural art.
//
// Effects paint on the map's grid (res 1: 10x18 cells, the 16px font) or on a grid twice as
// fine (res 2: 5x9 cells, a 9px font), so a sphere, a flame or a curtain fold can be shaded
// glyph by glyph like an old ASCII-art photograph. fillText is slow when called thousands of
// times a frame, so every (glyph, color, size) is drawn once into a tiny canvas at the
// screen's real resolution and stamped after that.

import { CW, CH, MAP_COLS, MAP_ROWS, MAP_Y, FONT } from '../config.js';
import { tileOf } from '../game/tiles.js';

const FACE = FONT.slice(FONT.indexOf(' ') + 1);

// The fine grid.
export const HX = CW / 2, HY = CH / 2, HW = MAP_COLS * 2, HH = MAP_ROWS * 2;

// Ramps from empty to dense, for shading by brightness.
export const RAMP = {
  fine: ' .,-~:;=!*#%@',
  shade: ' .:-=+*#%@',
  fire: ' .,:;=+*#%@',
  rock: ' .,:;-=+*%',
  soft: ' .\'`-~=+',
};

const SIZE = { 1: [CW, CH, 16, 1], 2: [HX, HY, 9, 0.5] };
const PAD = 3;
const sprites = { scale: 0, tint: null, count: 0, maps: [new Map(), new Map(), new Map(), new Map()] };

function sprite(screen, ch, color, res, bold) {
  const s = screen.scale;
  if (sprites.scale !== s || sprites.tint !== screen.tint || sprites.count > 8000) {
    sprites.scale = s; sprites.tint = screen.tint; sprites.count = 0;
    for (const m of sprites.maps) m.clear();
  }
  const bucket = sprites.maps[(res - 1) * 2 + (bold ? 1 : 0)];
  let byChar = bucket.get(color);
  if (!byChar) bucket.set(color, byChar = new Map());
  let c = byChar.get(ch);
  if (!c) {
    const [w, h, size, lift] = SIZE[res];
    c = document.createElement('canvas');
    c.width = Math.ceil((w + PAD * 2) * s);
    c.height = Math.ceil((h + PAD * 2) * s);
    const l = c.getContext('2d');
    l.setTransform(s, 0, 0, s, 0, 0);
    l.font = `${bold ? 'bold ' : ''}${size}px ${FACE}`;
    l.textAlign = 'center';
    l.textBaseline = 'middle';
    l.fillStyle = screen.color(color);
    l.fillText(ch, PAD + w / 2, PAD + h / 2 + lift);
    byChar.set(ch, c);
    sprites.count++;
  }
  return c;
}

// A glyph with its cell's top-left corner at (x, y), in map pixels.
export function put(screen, ch, x, y, color, res = 2, alpha = 1, bold = false, ctx = screen.ctx) {
  if (ch === ' ' || alpha < 0.02) return;
  const [w, h] = SIZE[res];
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(sprite(screen, ch, color, res, bold), x - PAD, y + MAP_Y - PAD, w + PAD * 2, h + PAD * 2);
}

// Same, centered on a point.
export const putAt = (screen, ch, x, y, color, res = 2, alpha = 1, bold = false, ctx = screen.ctx) =>
  put(screen, ch, x - SIZE[res][0] / 2, y - SIZE[res][1] / 2, color, res, alpha, bold, ctx);

// The glyph of a ramp for a brightness 0..1.
export const ramp = (chars, v) => chars[Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * (chars.length - 1))];

// Which way a line runs, as a glyph (angle in screen space, y down).
export const flow = (a) => '-\\|/'[Math.round(((a % Math.PI) + Math.PI) % Math.PI / (Math.PI / 4)) % 4];

// Every effect leaves alpha where the next draw expects it.
export const done = (screen) => { screen.ctx.globalAlpha = 1; };

// A picture that only changes now and then, kept in its own canvas and stamped
// where the current transform puts the map (so screen shake still moves it).
export function cacheLayer(store, key, screen, draw) {
  const s = screen.scale, full = `${key}:${s}:${screen.tint}`;
  if (store.key !== full) {
    const c = store.canvas ??= document.createElement('canvas');
    c.width = screen.canvas.width;
    c.height = screen.canvas.height;
    const l = c.getContext('2d');
    l.setTransform(s, 0, 0, s, 0, 0);
    draw(l);
    l.globalAlpha = 1;
    store.key = full;
  }
  const ctx = screen.ctx, m = ctx.getTransform();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(store.canvas, Math.round(m.e), Math.round(m.f));
  ctx.restore();
}

// ---- what the eye can't see through ----

// Per map cell: 1 solid, 2 only looks solid (a fake wall), 0 open. Rebuilt when the map changes.
export function solids(level) {
  const c = level.sight;
  if (c && c.v === level.version) return c.m;
  const m = new Uint8Array(MAP_COLS * MAP_ROWS);
  for (let i = 0; i < m.length; i++) {
    const t = tileOf(level.grid[i]);
    if (t && !t.hidden && !t.oneway && !t.sign && !t.hazard && !t.exit && !t.pickup && !t.scenery && (t.solid || t.wall)) m[i] = t.solid ? 1 : 2;
  }
  level.sight = { v: level.version, m };
  return m;
}

// Is this fine-grid cell open air?
export const free = (m, hx, hy) => m[(hy >> 1) * MAP_COLS + (hx >> 1)] === 0;

// Is this map pixel inside something solid? (only: 1 or 2 to ask for one kind)
export function blockedAt(m, x, y, only = 0) {
  const cx = Math.floor(x / CW), cy = Math.floor(y / CH);
  if (cx < 0 || cx >= MAP_COLS) return true;
  if (cy < 0 || cy >= MAP_ROWS) return false;
  const v = m[cy * MAP_COLS + cx];
  return only ? v === only : v > 0;
}
