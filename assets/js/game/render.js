import { CW, CH, MAP_COLS, MAP_ROWS, MAP_Y, PHYS, FONT_BOLD } from '../config.js';
import { tileOf } from './tiles.js';

// Cheap deterministic noise for textures that must not flicker.
export const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const isWall = (ch) => !!tileOf(ch)?.wall;

// Part of a wall mass, for drawing purposes. Bodies resting at home blend in,
// so a floor that is about to fall looks exactly like the floor around it.
function wallLook(level, x, y) {
  if (x < 0 || x >= MAP_COLS || y < 0 || y >= MAP_ROWS) return true;
  if (isWall(level.grid[y * MAP_COLS + x])) return true;
  for (const b of level.bodies.values()) if (b.home && isWall(b.at(x, y)?.ch)) return true;
  return false;
}

function enclosed(test, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !test(x + dx, y + dy)) return false;
  }
  return true;
}

// Walls are outlined: only cells touching air get a '#', the inside stays
// mostly hollow with a faint grain. Big masses read as shapes, not noise.
function wallGlyph(inside, x, y) {
  if (!inside) return ['#', 'wall'];
  const n = hash(x, y);
  return n < 0.12 ? ['.', 'wallDim'] : n < 0.16 ? ["'", 'wallDim'] : n < 0.18 ? [':', 'wallDim'] : null;
}

// Everything that doesn't move or animate: drawn once into the screen cache.
export function drawStatic(screen, ctx, level, pal) {
  const look = (x, y) => wallLook(level, x, y);
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      const ch = level.at(x, y);
      const t = tileOf(ch);
      if (!t) {
        if (hash(x + 7, y * 3) < 0.035) screen.glyph('.', x * CW, y * CH + MAP_Y, pal.dots, ctx);
        continue;
      }
      if (t.anim || t.exit || t.pickup || t.hidden) continue;
      const g = t.wall ? wallGlyph(enclosed(look, x, y), x, y) : [t.glyph || ch, t.color || 'wall'];
      if (g) screen.glyph(g[0], x * CW, y * CH + MAP_Y, pal[g[1]], ctx);
    }
  }
}

function animGlyph(t, time, x, y) {
  return t.anim[Math.floor(time * 12 + x * 0.7 + y) % t.anim.length];
}

// Animated static tiles: saws, acid, exits, pickups.
// found: this level's secret is already in the save, so its '$' is drawn as a ghost.
export function drawLive(screen, level, pal, time, found = false) {
  for (let i = 0; i < level.grid.length; i++) {
    const ch = level.grid[i];
    if (ch === ' ') continue;
    const t = tileOf(ch);
    if (!t.anim && !t.exit && !t.pickup) continue;
    const x = i % MAP_COLS, y = (i / MAP_COLS) | 0;
    drawTile(screen, t, ch, x * CW, y * CH + MAP_Y, pal, time, x, y, found);
  }
}

function drawTile(screen, t, ch, px, py, pal, time, x, y, found) {
  if (t.anim) return screen.glyph(animGlyph(t, time, x, y), px, py, pal[t.color]);
  if (t.exit) {
    // The way out breathes, so it reads as "the goal" even in a busy room.
    const ctx = screen.ctx;
    ctx.save();
    ctx.font = FONT_BOLD;
    ctx.shadowColor = screen.color(pal.exit);
    ctx.shadowBlur = 6 + 4 * Math.sin(time * 4);
    screen.glyph(t.glyph, px, py, pal.exit);
    ctx.restore();
    return;
  }
  if (t.pickup) return screen.glyph(t.glyph, px, py + Math.sin(time * 3 + x) * 1.5, found ? pal.dim : pal.exit);
  screen.glyph(t.glyph || ch, px, py, pal[t.color || 'wall']);
}

export function drawBodies(screen, level, pal, time, found = false) {
  for (const b of level.bodies.values()) {
    if (!b.visible) continue;
    const jx = b.wobble > 0 ? (hash(time * 60 | 0, 1) - 0.5) * 3 : 0;
    const home = b.home && !b.wobble;
    const look = home ? (x, y) => wallLook(level, x, y) : (x, y) => isWall(b.at(x, y)?.ch);
    for (const c of b.cells) {
      const t = tileOf(c.ch);
      if (!t) continue;
      const px = c.x * CW + b.ox + jx, py = c.y * CH + b.oy + MAP_Y;
      if (t.wall) {
        const g = wallGlyph(enclosed(look, c.x, c.y), c.x, c.y);
        if (g) screen.glyph(g[0], px, py, pal[g[1]]);
      } else if (!t.hidden) {
        drawTile(screen, t, c.ch, px, py, pal, time, c.x, c.y, found);
      }
    }
  }
}

// The tide: a churning surface and a sparse body of acid beneath it.
export function drawTide(screen, tide, pal, time) {
  const top = tide.y + MAP_Y;
  const ctx = screen.ctx;
  for (let x = 0; x < MAP_COLS; x++) {
    const wave = Math.sin(time * 5 + x * 0.6) * 1.5;
    screen.glyph('~-~^'[Math.floor(time * 10 + x * 0.7) % 4], x * CW, top - CH / 2 + wave, pal.hazard);
  }
  ctx.globalAlpha = 0.45;
  for (let y = Math.ceil(tide.y / CH); y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      if (hash(x, y + Math.floor(time * 3)) < 0.3) screen.glyph('~', x * CW, y * CH + MAP_Y, pal.hazard);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawPlayer(screen, p, pal, size = 1) {
  const ctx = screen.ctx;
  const sy = (1 - p.squash) * size, sx = (1 + p.squash * 0.6) * size;
  // Anchored at the feet (the head, upside down) so squash looks grounded.
  ctx.save();
  ctx.translate(p.x + PHYS.w / 2, (p.gdir > 0 ? p.y + PHYS.h : p.y) + MAP_Y);
  ctx.scale(sx * p.facing, sy * p.gdir);
  ctx.font = FONT_BOLD;
  ctx.fillStyle = screen.color(pal.player);
  ctx.fillText('@', 0, -CH / 2 + 1);
  if (p.crown) {
    ctx.fillStyle = screen.color(pal.exit);
    ctx.fillText('w', 0, -CH - 4);
  }
  ctx.restore();
}

// Particles are just glyphs with velocity.
export class Particles {
  constructor() { this.list = []; }

  burst(x, y, chars, n, speed, color, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle ?? Math.random() * Math.PI * 2;
      const spread = opts.spread ?? Math.PI * 2;
      const dir = opts.angle == null ? a : a + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = (opts.life ?? 0.7) * (0.6 + Math.random() * 0.4);
      this.list.push({
        ch: chars[(Math.random() * chars.length) | 0], x, y,
        vx: Math.cos(dir) * v, vy: Math.sin(dir) * v,
        g: opts.gravity ?? 600, life, max: life, color,
      });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(screen) {
    const ctx = screen.ctx;
    for (const p of this.list) {
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      screen.glyph(p.ch, p.x - CW / 2, p.y - CH / 2 + MAP_Y, p.color);
    }
    ctx.globalAlpha = 1;
  }
}
