import { CW, CH, MAP_COLS, MAP_ROWS, MAP_Y, PHYS, FONT_BOLD } from '../config.js';
import { tileOf } from './tiles.js';
import { hash } from '../art/math.js';
import { tones } from './palette.js';
import { FIGURE, CROWN, FIGURES, pose, glints, setInk } from './figures.js';

// Re-exported: the menus use it for their own textures.
export { hash };

const isWall = (ch) => !!tileOf(ch)?.wall;

// Part of a wall mass, for drawing purposes. Bodies resting at home blend in,
// so a floor that is about to fall looks exactly like the floor around it.
function wallLook(level, x, y) {
  if (x < 0 || x >= MAP_COLS || y < 0 || y >= MAP_ROWS) return true;
  const i = y * MAP_COLS + x;
  if (isWall(level.grid[i]) || level.buried?.has(i)) return true;
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
// The outline is lit from above: tops catch the light, undersides fall back.
function wallGlyph(look, x, y) {
  if (enclosed(look, x, y)) {
    const n = hash(x, y);
    return n < 0.12 ? ['.', 'wallDim'] : n < 0.16 ? ["'", 'wallDim'] : n < 0.18 ? [':', 'wallDim'] : null;
  }
  if (!look(x, y - 1)) return ['#', 'wallLit'];
  if (!look(x - 1, y) || !look(x + 1, y)) return ['#', 'wallSide'];
  return ['#', look(x, y + 1) ? 'wallSide' : 'wallUnder'];
}

// A static wall cell as drawn, for mechanisms that draw their own (a floor that crumbles).
export function wallGlyphAt(level, x, y) {
  return wallGlyph((a, b) => wallLook(level, a, b), x, y);
}

export const color = (pal, role) => pal[role] ?? tones(pal)[role];

// Soft shadow in the air under ledges and beside walls, so the scenery behind sits back.
// It fades down from the ledge in thin bands rather than filling whole cells.
function drawShade(screen, ctx, level, pal) {
  const { shadow, shade: k } = tones(pal), solid = (x, y) => y >= 0 && y < MAP_ROWS && wallLook(level, x, y);
  const BAND = CH / 6;
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      if (tileOf(level.at(x, y))) continue;
      const px = x * CW, py = y * CH + MAP_Y;
      const top = solid(x, y - 1) ? 0 : solid(x, y - 2) ? 6 : -1;
      if (top >= 0) {
        for (let b = 0; b < 6; b++) screen.fill(px, py + b * BAND, CW, BAND, shadow, 0.5 * k * Math.pow(0.78, top + b), ctx);
      }
      for (const [dx, from] of [[-1, 0], [1, CW]]) {
        if (!solid(x + dx, y)) continue;
        for (let b = 0; b < 3; b++) screen.fill(from === 0 ? px + b * 2 : px + CW - (b + 1) * 2, py, 2, CH, shadow, 0.22 * k * (1 - b / 3), ctx);
      }
    }
  }
}

// Everything that doesn't move or animate: drawn once into the screen cache.
export function drawStatic(screen, ctx, level, pal) {
  const look = (x, y) => wallLook(level, x, y);
  drawShade(screen, ctx, level, pal);
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      const ch = level.at(x, y);
      const t = tileOf(ch);
      if (!t) {
        if (hash(x + 7, y * 3) < 0.035) screen.glyph('.', x * CW, y * CH + MAP_Y, pal.dots, ctx);
        continue;
      }
      const buried = level.buried?.has(y * MAP_COLS + x);
      if (!buried && (t.anim || t.exit || t.pickup || t.hidden || t.live)) continue;
      const g = t.wall || buried ? wallGlyph(look, x, y) : [t.glyph || ch, t.color || 'wall'];
      if (g) screen.glyph(g[0], x * CW, y * CH + MAP_Y, color(pal, g[1]), ctx);
    }
  }
}

function animGlyph(t, time, x, y) {
  return t.anim[Math.floor(time * 12 + x * 0.7 + y) % t.anim.length];
}

// Animated static tiles: saws, acid, exits, pickups.
// found: this level's secret is already in the save, so its '$' is drawn as a ghost.
export function drawLive(screen, level, pal, time, found = false) {
  // A glint runs along the spikes now and then, so the teeth catch the eye.
  const sweep = (time * 0.45) % 1.6, glint = tones(pal).glint, ctx = screen.ctx;
  for (let i = 0; i < level.grid.length; i++) {
    const ch = level.grid[i];
    if (ch === ' ') continue;
    const t = tileOf(ch);
    const x = i % MAP_COLS, y = (i / MAP_COLS) | 0;
    if (t.hazard && !t.anim && !t.live) {
      const k = 1 - Math.abs(sweep - (x + y * 0.5) / MAP_COLS) * 14;
      if (k > 0) { ctx.globalAlpha = k; screen.glyph(t.glyph || ch, x * CW, y * CH + MAP_Y, glint); ctx.globalAlpha = 1; }
      continue;
    }
    if (!t.anim && !t.exit && !t.pickup) continue;
    if (t.pickup && level.buried?.has(i)) continue;
    drawTile(screen, t, ch, x * CW, y * CH + MAP_Y, pal, time, x, y, found);
  }
}

// A glyph's glow at one blur, in device pixels. shadowBlur is costly to paint
// every frame, so each step of the glow is drawn once, shadow only, and reused.
// (fx, fy): where it sits within a device pixel, to a quarter, so it lines up with the glyph.
const glows = { scale: 0, map: new Map() };
const glowPad = (blur, s) => Math.ceil(blur * 2 / s) + 2;   // room around the cell, virtual pixels
function glow(screen, ch, color, blur, fx, fy) {
  const s = screen.scale, key = `${ch}${color}${blur}:${fx}:${fy}`;
  // An exit riding a moving body visits every phase: start over rather than grow without end.
  if (glows.scale !== s || glows.map.size > 160) { glows.scale = s; glows.map.clear(); }
  let canvas = glows.map.get(key);
  if (!canvas) {
    const pad = glowPad(blur, s), w = CW + pad * 2, h = CH + pad * 2;
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * s) + 1;
    canvas.height = Math.ceil(h * s) + 1;
    const l = canvas.getContext('2d');
    // The glyph itself lands off the canvas; its shadow (offset in device pixels) lands here.
    l.setTransform(s, 0, 0, s, fx, fy);
    l.font = FONT_BOLD;
    l.textAlign = 'center';
    l.textBaseline = 'middle';
    l.fillStyle = l.shadowColor = color;
    l.shadowBlur = blur;
    l.shadowOffsetX = w * s;
    l.fillText(ch, pad + CW / 2 - w, pad + CH / 2 + 1);
    glows.map.set(key, canvas);
  }
  return canvas;
}

// Draws a glyph's glow pixel for pixel, as it was drawn: scaling it again would soften it.
function drawGlow(screen, ch, px, py, color, blur) {
  const ctx = screen.ctx, m = ctx.getTransform(), s = screen.scale;
  const pad = glowPad(blur, s);
  const dx = m.e + (px - pad) * s, dy = m.f + (py - pad) * s, ix = Math.floor(dx), iy = Math.floor(dy);
  const canvas = glow(screen, ch, color, blur, Math.round((dx - ix) * 4) / 4, Math.round((dy - iy) * 4) / 4);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, ix, iy);
  ctx.restore();
}

function drawTile(screen, t, ch, px, py, pal, time, x, y, found) {
  if (t.anim) return screen.glyph(animGlyph(t, time, x, y), px, py, pal[t.color]);
  if (t.exit) {
    // The way out breathes, so it reads as "the goal" even in a busy room.
    const ctx = screen.ctx;
    drawGlow(screen, t.glyph, px, py, screen.color(pal.exit), Math.round((6 + 4 * Math.sin(time * 4)) * 2) / 2);
    ctx.save();
    ctx.font = FONT_BOLD;
    screen.glyph(t.glyph, px, py, pal.exit);
    ctx.restore();
    // Motes drifting up out of it, like light through a door left ajar.
    for (let k = 0; k < 3; k++) {
      const u = (time * 0.7 + k / 3 + x * 0.13) % 1;
      ctx.globalAlpha = (1 - u) * 0.8;
      screen.glyph(u < 0.5 ? "'" : '.', px + Math.sin(time * 2 + k * 2.1) * 4, py - 4 - u * 16, pal.exit);
    }
    ctx.globalAlpha = 1;
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
        const g = wallGlyph(look, c.x, c.y);
        if (g) screen.glyph(g[0], px, py, color(pal, g[1]));
      } else if (!t.hidden) {
        drawTile(screen, t, c.ch, px, py, pal, time, c.x, c.y, found);
      }
    }
  }
}

// Fields shimmer with motes that show which way they pull, so a beam reads as a beam.
export function drawFields(screen, level, pal, time) {
  const ctx = screen.ctx;
  ctx.globalAlpha = 0.45;
  for (const [id, f] of level.fields) {
    if (!f.on || f.motes === false) continue;
    const [px, py] = f.push || [0, 0];
    // Which way the motes stream (in cells/s), and what they look like.
    const vx = px, vy = py || (f.gravity ? f.gravity * 3 : 0);
    const ch = vx && !vy ? '-' : vy ? "'" : '·';
    for (const i of level.zones.get(id) || []) {
      const x = i % MAP_COLS, y = (i / MAP_COLS) | 0, n = hash(x * 3, y + 11);
      if (n > 0.3) continue;
      const k = time + n * 9;
      const dx = vx ? ((k * vx * CW) % CW + CW) % CW : Math.sin(k * 1.3) * 2;
      const dy = vy ? ((k * vy * CH) % CH + CH) % CH : Math.cos(k) * 2;
      screen.glyph(ch, x * CW + dx - (vx ? CW / 2 : 0), y * CH + dy - (vy ? CH / 2 : 0) + MAP_Y, pal.accent);
    }
  }
  ctx.globalAlpha = 1;
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

// The player is one of the figures in figures.js, drawn from the feet up (the head, upside
// down), so squash and stretch stay planted. Glyphs mirror with facing.
export { pose };

// x, feet: where the feet are, in screen pixels. sx, sy: squash and stretch. color, when
// set, paints the whole figure in it (an afterimage); otherwise it wears the palette.
export function drawFigure(screen, x, feet, { facing = 1, gdir = 1, sx = 1, sy = 1, pose: s, pal, color = null, crown = false }) {
  const ctx = screen.ctx, gold = crown && CROWN === 'sparkle';
  const c = {
    body: color ?? (gold ? pal.exit : pal.player), bg: pal.bg,
    hazard: color ?? pal.hazard, exit: color ?? pal.exit, accent: color ?? pal.accent ?? pal.exit,
    light: '#ffffff', crown: crown && CROWN !== 'sparkle', style: CROWN, px: screen.scale,
  };
  setInk((k) => screen.color(k));
  ctx.save();
  ctx.translate(x, feet);
  ctx.scale(sx * facing, sy * gdir);
  FIGURES[FIGURE].draw(ctx, s, c);
  ctx.restore();
  if (gold && !color) {
    ctx.save();
    ctx.translate(x, feet);
    ctx.scale(1, gdir);
    glints(ctx, s.t, pal.exit);
    ctx.restore();
  }
}

const feetOf = (p) => (p.gdir > 0 ? p.y + PHYS.h : p.y) + MAP_Y;

export function drawPlayer(screen, p, pal, size = 1, time = 0) {
  const ctx = screen.ctx;
  // A faint halo: the one warm thing in every room.
  if (size > 0.2) {
    ctx.globalAlpha = 0.55 * size;
    drawGlow(screen, FIGURES[FIGURE].glow ?? '●', p.x + PHYS.w / 2 - CW / 2, (p.gdir > 0 ? p.y + PHYS.h - CH : p.y) + MAP_Y, screen.color(pal.player), 5);
    ctx.globalAlpha = 1;
  }
  drawFigure(screen, p.x + PHYS.w / 2, feetOf(p), {
    facing: p.facing, gdir: p.gdir, sx: (1 + p.squash * 0.6) * size, sy: (1 - p.squash) * size,
    pose: pose(p, time), pal, crown: !!p.crown,
  });
}

// Afterimages left behind when moving fast: [{ x, y, facing, gdir, pose, age }].
export function drawTrail(screen, trail, pal) {
  const ctx = screen.ctx, ghost = tones(pal).ghost;
  for (const g of trail) {
    const a = 0.35 - g.age * 1.6;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    drawFigure(screen, g.x + PHYS.w / 2, feetOf(g), { facing: g.facing, gdir: g.gdir, pose: g.pose, pal, color: ghost });
  }
  ctx.globalAlpha = 1;
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
