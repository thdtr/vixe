import { FONT_BOLD } from '../config.js';
import { blend } from '../art/color.js';

// The player's looks. Each figure draws itself with its feet at (0, 0), facing +x, from
// glyphs fitted into small boxes, so it keeps the same size whatever monospace font the
// device falls back to. Only FIGURE and CROWN are worn; the rest are kept for later.
export const FIGURE = 'astronaut';
export const CROWN = 'spikes';

const FACE = FONT_BOLD.slice(FONT_BOLD.indexOf('px ') + 3);
const BIG = `bold 100px ${FACE}`;

// Set by drawFigure for each draw: maps a palette color through the screen's tint.
let ink = (c) => c;
export const setInk = (fn) => { ink = fn; };

// Draws ch so its inked shape fills a w×h box centered on (x, y). Either side may be null
// to keep the glyph's own proportions.
const metrics = new Map();
export function fit(ctx, ch, x, y, w, h, color) {
  let m = metrics.get(ch);
  if (!m) {
    ctx.save();
    ctx.font = BIG; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const t = ctx.measureText(ch);
    m = { L: t.actualBoundingBoxLeft, R: t.actualBoundingBoxRight, A: t.actualBoundingBoxAscent, D: t.actualBoundingBoxDescent };
    ctx.restore();
    metrics.set(ch, m);
  }
  const gw = Math.max(1, m.L + m.R), gh = Math.max(1, m.A + m.D);
  if (w == null) w = h * gw / gh;
  if (h == null) h = w * gh / gw;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / gw, h / gh);
  ctx.font = BIG; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink(color);
  ctx.fillText(ch, -(m.R - m.L) / 2, (m.A - m.D) / 2);
  ctx.restore();
}

// What the body is doing, from the player (or anything shaped like one) and the clock:
// pose is 'idle', 'run', 'rise', 'apex' or 'fallHard'; frame steps through the walk cycle.
// Left alone long enough (when the zZ start), the player falls asleep.
export function pose(p, t = 0) {
  const vy = (p.vy ?? 0) * (p.gdir ?? 1), vx = p.vx ?? 0;
  let name;
  if (!p.ground) name = vy < -60 ? 'rise' : vy > 280 ? 'fallHard' : 'apex';
  else name = Math.abs(vx) > 15 ? 'run' : 'idle';
  const landing = !!p.ground && (p.squash ?? 0) > 0.12;
  const sleep = name === 'idle' && (p.idle ?? 0) > SLEEP;
  return {
    pose: name, frame: Math.floor((p.stride ?? 0) / 6) % 4, t, vx, vy, landing, sleep, jet: p.jet ?? 0,
    blink: name === 'idle' && !landing && !sleep && t % 2.3 > 2.15,
  };
}

export const SLEEP = 20;   // seconds without input before the player dozes off

const STRIDE = ['/|', '||', '|\\', '/\\'];
function legsOf(s) {
  if (s.pose === 'rise') return '\\/';
  if (s.pose === 'fallHard') return '||';
  if (s.pose === 'run') return STRIDE[s.frame];
  return '/\\';
}
function eyeOf(s) {
  if (s.blink || s.sleep) return '-';
  if (s.landing) return '^';
  if (s.pose === 'fallHard') return 'O';
  return '•';
}
const look = (s) => (s.pose === 'run' ? 1.4 : 0.6);
const lift = (s) => (s.pose === 'run' ? (s.frame % 2 ? [-1.2, 0] : [0, -1.2]) : [0, 0]);

function eyes(ctx, s, cx, y, gap, color, scale = 1) {
  const e = eyeOf(s), lx = look(s) * scale;
  for (const sx of [-1, 1]) {
    const x = cx + sx * gap + lx;
    if (e === '-') fit(ctx, '-', x, y, 2.6 * scale, 0.9 * scale, color);
    else if (e === '^') fit(ctx, '^', x, y, 2.6 * scale, 1.8 * scale, color);
    else if (e === 'O') fit(ctx, 'O', x, y, 2.8 * scale, 3.4 * scale, color);
    else fit(ctx, '•', x, y, null, 2.7 * scale, color);
  }
}

// Stick arms from the shoulders: swinging on the run, thrown up on the way up, flailing
// on a hard fall.
function arms(ctx, s, k, x, y, h) {
  const flap = Math.floor(s.t * 12) % 2;
  const slash = (ch, ax, ay) => fit(ctx, ch, ax, ay, null, h, k);
  const dash = (ax, ay) => fit(ctx, '-', ax, ay, h * 0.82, h * 0.3, k);
  if (s.pose === 'rise' || (s.pose === 'fallHard' && flap)) { slash('\\', -x - 0.8, y - h * 1.5); slash('/', x + 0.8, y - h * 1.5); }
  else if (s.pose === 'fallHard') { slash('|', -x - 0.8, y - h * 1.35); slash('|', x + 0.8, y - h * 1.35); }
  else if (s.pose === 'apex') { dash(-x - 0.7, y - h * 0.4); dash(x + 0.7, y - h * 0.4); }
  else if (s.pose === 'run') {
    if (s.frame < 2) { dash(-x - 0.7, y - h * 0.4); slash('\\', x, y); }
    else { slash('/', -x, y); dash(x + 0.7, y - h * 0.4); }
  } else { slash('/', -x, y); slash('\\', x, y); }
}

// The crown for a player who beat every level without skipping one, centered on (0, y) in
// a w×h box that each figure fits to its head. It lifts off a little on a hard fall.
export function crown(ctx, s, c, y, w, h) {
  if (!c.crown) return;
  const g = c.exit;
  if (s.pose === 'fallHard') y -= 1.6;
  if (c.style === 'w') fit(ctx, 'w', 0, y, w, h, g);
  else if (c.style === 'spikes') {
    y -= h * 0.125; w *= 1.15; h *= 1.25;
    fit(ctx, '▲', -w * 0.37, y - h * 0.05, w * 0.3, h * 0.6, g);
    fit(ctx, '▲', w * 0.37, y - h * 0.05, w * 0.3, h * 0.6, g);
    fit(ctx, '▲', 0, y - h * 0.15, w * 0.34, h * 0.8, g);
    fit(ctx, '▬', 0, y + h * 0.33, w, h * 0.34, g);
    fit(ctx, '•', 0, y + h * 0.33, null, h * 0.3, c.hazard);
  } else if (c.style === 'king') {
    const H = h * 1.6;
    fit(ctx, '♚', 0, y + h / 2 - H / 2, null, H, g);
  } else if (c.style === 'halo') {
    ctx.save();
    ctx.shadowColor = ink(g); ctx.shadowBlur = 4 * c.px;
    fit(ctx, 'O', 0, y - h * 0.35 - 1.2 + Math.sin(s.t * 2.5) * 0.5, w * 1.3, h * 0.9, g);
    ctx.restore();
  } else if (c.style === 'stars') {
    for (let i = 0; i < 3; i++) {
      const a = s.t * 3.2 + i * 2.094, z = Math.sin(a);
      ctx.save();
      ctx.globalAlpha *= z < 0 ? 0.55 : 1;
      fit(ctx, '*', Math.cos(a) * w * 0.7, y + z * h * 0.3, null, 2.1 + z * 0.7, g);
      ctx.restore();
    }
  }
}

// The 'sparkle' crown: nothing on the head, glints coming and going around the figure.
const GLINTS = [[-6, -14], [6, -9], [-5, -4], [5, -17], [0, -21]];
export function glints(ctx, t, color) {
  for (const off of [0, 0.5]) {
    const ph = t / 0.35 + off * 5, i = Math.floor(ph) % 5, size = Math.sin((ph % 1) * Math.PI) * 3.2;
    if (size > 0.3) fit(ctx, '+', GLINTS[i][0], GLINTS[i][1], null, size, blend(color, '#ffffff', 0.5));
  }
}

// c: { body, bg, hazard, exit, accent, light, crown, style, px }. glow: the glyph behind the halo.
export const FIGURES = {
  at: {
    glow: '@',
    draw(ctx, s, c) {
      ctx.fillStyle = ink(c.body); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold 12px ${FACE}`; ctx.fillText('@', 0, -12);
      ctx.font = `bold 9px ${FACE}`;
      const l = legsOf(s);
      ctx.fillText(l[0], -2.4, -3.6); ctx.fillText(l[1], 2.4, -3.6);
      if (s.pose === 'fallHard') { ctx.fillText('\\', -6.2, -12.5); ctx.fillText('/', 6.2, -12.5); }
      crown(ctx, s, c, -20.6, 7.4, 4.4);
    },
  },

  stick: {
    draw(ctx, s, c) {
      const k = c.body;
      fit(ctx, 'O', 0, -12.6, null, 5, k);
      fit(ctx, '|', 0, -7.7, null, 5, k);
      arms(ctx, s, k, 2.6, -7.8, 3.6);
      const l = legsOf(s);
      fit(ctx, l[0], -1.9, -2.3, null, 4.4, k); fit(ctx, l[1], 1.9, -2.3, null, 4.4, k);
      crown(ctx, s, c, -16.9, 5.2, 3.2);
    },
  },

  blob: {
    draw(ctx, s, c) {
      const k = c.body;
      if (s.pose !== 'rise') {
        const up = lift(s);
        fit(ctx, '▬', -2.6, -0.8 + up[0], 3.2, 1.6, k);
        fit(ctx, '▬', 2.6, -0.8 + up[1], 3.2, 1.6, k);
      }
      fit(ctx, '●', 0, -7.3, 11.5, 11, k);
      eyes(ctx, s, 0, s.pose === 'rise' ? -9 : -7.8, 2.3, c.bg);
      if (s.pose === 'fallHard') fit(ctx, 'o', 0.8, -4.3, 2, 2, c.bg);
      crown(ctx, s, c, -14.5, 5.8, 3.4);
    },
  },

  monitor: {
    draw(ctx, s, c) {
      const k = c.body;
      fit(ctx, '[', -4.4, -9.3, null, 10.5, k);
      fit(ctx, ']', 4.4, -9.3, null, 10.5, k);
      const lx = look(s) * 0.5;
      if (s.landing && !s.blink) {
        fit(ctx, '>', -1.8 + lx, -9.4, 2, 2.6, k); fit(ctx, '<', 1.8 + lx, -9.4, 2, 2.6, k);
      } else eyes(ctx, s, 0, s.pose === 'rise' ? -10.6 : -9.4, 1.8, k, 0.85);
      if (c.crown) crown(ctx, s, c, -16.3, 6.4, 3.8);
      else {
        fit(ctx, '|', 0, -15.6, null, 2.4, k);
        fit(ctx, '•', 0, -17.6, null, 2.3, s.t % 1.2 < 0.6 ? c.accent : k);
      }
      const l = legsOf(s);
      fit(ctx, l[0], -1.8, -2.1, null, 3.8, k); fit(ctx, l[1], 1.8, -2.1, null, 3.8, k);
    },
  },

  ghost: {
    draw(ctx, s, c) {
      const k = c.body;
      const fast = s.pose === 'run' || s.pose === 'fallHard' || s.pose === 'rise';
      ctx.save();
      ctx.translate(0, -(s.pose === 'idle' ? 1.2 + Math.sin(s.t * 3.2) * 0.8 : 0.6));
      if (s.pose === 'run') ctx.transform(1, 0, -0.14, 1, 0, 0);
      fit(ctx, '●', 0, -10.4, 11, 10.5, k);
      fit(ctx, '█', 0, -5.6, 11, 5.4, k);
      const sp = fast ? 18 : 6;
      [-3.67, 0, 3.67].forEach((x, i) => fit(ctx, '▼', x, -1.9 + Math.sin(s.t * sp + i * 2.1) * 0.6, 3.7, 2.4, k));
      const ey = s.pose === 'rise' ? -11.2 : -10.2, e = eyeOf(s), lx = look(s);
      for (const sx of [-1, 1]) {
        const x = sx * 2.2 + lx;
        if (e === '•') fit(ctx, '▮', x, ey, 1.9, 3.2, c.bg);
        else if (e === '-') fit(ctx, '-', x, ey, 2.6, 0.9, c.bg);
        else if (e === '^') fit(ctx, '^', x, ey, 2.6, 1.8, c.bg);
        else fit(ctx, 'O', x, ey, 2.8, 3.4, c.bg);
      }
      if (s.pose === 'fallHard') fit(ctx, 'o', lx * 0.6, -6.2, 2.2, 2.4, c.bg);
      crown(ctx, s, c, -17.4, 5.6, 3.4);
      ctx.restore();
    },
  },

  matchstick: {
    draw(ctx, s, c) {
      const k = c.body;
      const l = legsOf(s);
      fit(ctx, l[0], -1.7, -2.1, null, 4, k); fit(ctx, l[1], 1.7, -2.1, null, 4, k);
      fit(ctx, '█', 0, -7.6, 2, 7.6, k);
      arms(ctx, s, k, 2.1, -7.7, 3);
      fit(ctx, '●', 0, -13.2, 4.8, 5.4, c.hazard);
      const flick = 1 + 0.12 * Math.sin(s.t * 23) + 0.08 * Math.sin(s.t * 37 + 1);
      const len = 5.4 * flick * (1 + Math.max(-0.35, Math.min(0.8, s.vy * 0.0016)));
      ctx.save();
      ctx.translate(0, c.crown ? -17 : -15.2);
      ctx.rotate(Math.max(-0.7, -Math.abs(s.vx) * 0.005));
      ctx.shadowColor = ink(c.exit); ctx.shadowBlur = 5 * c.px;
      fit(ctx, '♦', 0, -len / 2, 3.3, len, c.exit);
      ctx.shadowBlur = 0;
      fit(ctx, '♦', 0, -len * 0.32, 1.5, len * 0.5, blend(c.exit, c.light, 0.6));
      ctx.restore();
      crown(ctx, s, c, -17.2, 5.6, 3);
    },
  },

  kitten: {
    draw(ctx, s, c) {
      const k = c.body;
      let a = -0.9 + Math.sin(s.t * 2.4) * 0.25;
      if (s.pose === 'run') a = -0.25 + Math.sin(s.t * 14) * 0.12;
      else if (s.pose === 'rise') a = 0.45;
      else if (s.pose === 'fallHard') a = -1.45;
      ctx.save(); ctx.translate(-4.4, -4.2); ctx.rotate(a); fit(ctx, '~', -2.2, 0, 4.8, 2.3, k); ctx.restore();
      if (s.pose !== 'rise') {
        const up = lift(s);
        fit(ctx, '▬', -2.4, -0.8 + up[0], 2.8, 1.5, k);
        fit(ctx, '▬', 2.4, -0.8 + up[1], 2.8, 1.5, k);
      }
      fit(ctx, '●', 0, -7.4, 10.5, 10, k);
      fit(ctx, '▲', -3.1, -12.7, 3.4, 3.8, k);
      fit(ctx, '▲', 3.1, -12.7, 3.4, 3.8, k);
      eyes(ctx, s, 0, s.pose === 'rise' ? -9.2 : -8.3, 2.1, c.bg, 0.9);
      if (s.pose === 'fallHard') fit(ctx, 'o', look(s) * 0.6, -5.3, 1.9, 2.1, c.bg);
      else fit(ctx, 'ω', look(s) * 0.6, -5.4, 3.2, 1.6, c.bg);
      crown(ctx, s, c, -13.9, 3.8, 2.8);
    },
  },

  penguin: {
    draw(ctx, s, c) {
      const k = c.body;
      ctx.save();
      ctx.rotate(s.pose === 'run' ? Math.sin(s.t * 16) * 0.13 : s.pose === 'idle' ? Math.sin(s.t * 2) * 0.03 : 0);
      const up = lift(s);
      fit(ctx, '▬', -2.2, -0.7 + up[0], 3, 1.4, c.accent);
      fit(ctx, '▬', 2.4, -0.7 + up[1], 3, 1.4, c.accent);
      if (s.pose === 'rise' || s.pose === 'fallHard' || s.pose === 'apex') {
        if (s.pose === 'fallHard' && Math.floor(s.t * 14) % 2) { fit(ctx, '-', -5.4, -8.4, 3, 1.1, k); fit(ctx, '-', 5.4, -8.4, 3, 1.1, k); }
        else { fit(ctx, '\\', -5.1, -9.8, null, 3.4, k); fit(ctx, '/', 5.1, -9.8, null, 3.4, k); }
      }
      fit(ctx, '●', 0, -7.6, 9.5, 13, k);
      fit(ctx, '●', 0.9, -5.4, 6, 7.6, c.bg);
      eyes(ctx, s, 0.4, -11.4, 1.7, c.bg, 0.7);
      fit(ctx, '▶', 5.3, -10, 2.6, 1.8, c.accent);
      crown(ctx, s, c, -15.8, 5.2, 3.2);
      ctx.restore();
    },
  },

  ninja: {
    draw(ctx, s, c) {
      const k = c.body;
      let a = 1.15 + Math.sin(s.t * 2) * 0.08;
      if (s.pose === 'run') a = 0.1 + Math.sin(s.t * 14) * 0.1;
      else if (s.pose === 'rise') a = 0.9;
      else if (s.pose === 'apex') a = 0.4;
      else if (s.pose === 'fallHard') a = -1.2;
      ctx.save();
      ctx.translate(-3, -10.4); ctx.rotate(a);
      fit(ctx, '~', -2.6, 0, 5.2, 2, c.hazard);
      fit(ctx, '~', -6.6, Math.sin(s.t * 14) * 0.5, 4, 1.8, c.hazard);
      ctx.restore();
      const l = legsOf(s);
      fit(ctx, l[0], -1.8, -2.2, null, 4.2, k); fit(ctx, l[1], 1.8, -2.2, null, 4.2, k);
      fit(ctx, '█', 0, -6, 4.4, 4.2, k);
      fit(ctx, '●', 0, -11.6, 7.6, 7.2, k);
      fit(ctx, '▬', 0.5, -12, 6.4, 2.1, c.bg);
      eyes(ctx, s, 0.5, -12, 1.5, k, 0.5);
      crown(ctx, s, c, -16.9, 5, 3.2);
    },
  },

  vee: {
    draw(ctx, s, c) {
      const k = c.body;
      const l = legsOf(s);
      fit(ctx, l[0], -1.6, -2, null, 3.8, k); fit(ctx, l[1], 1.6, -2, null, 3.8, k);
      let spread = 1 + (s.pose === 'idle' ? Math.sin(s.t * 2.4) * 0.04 : 0);
      if (s.pose === 'rise') spread = 1.3;
      else if (s.pose === 'apex') spread = 1.12;
      else if (s.pose === 'fallHard') spread = 0.78;
      fit(ctx, 'V', 0, -9.6, 11 * spread, 11, k);
      eyes(ctx, s, 0, -12.8, 1.4, k, 0.7);
      crown(ctx, s, c, -16.8, 5, 3);
    },
  },

  drop: {
    draw(ctx, s, c) {
      const k = c.body;
      ctx.save();
      if (s.pose === 'run') ctx.transform(1, 0, -0.12, 1, 0, 0);
      const tip = s.pose === 'fallHard' ? 8.5 : s.pose === 'rise' ? 4.6 : 5.6;
      const sway = -Math.min(2, Math.abs(s.vx) * 0.015) + (s.pose === 'idle' ? Math.sin(s.t * 2) * 0.4 : 0);
      fit(ctx, '▲', sway, -9.2 - tip / 2, 6.4, tip, k);
      fit(ctx, '●', 0, -5.6, 10, 10, k);
      eyes(ctx, s, 0, -6, 2.2, c.bg, 0.95);
      if (s.pose === 'fallHard') fit(ctx, 'o', 0.8, -3, 2, 2, c.bg);
      if (s.landing) { fit(ctx, '•', -6.6, -1.6, null, 1.6, k); fit(ctx, '•', 6.6, -1.6, null, 1.6, k); }
      crown(ctx, s, c, -10.2 - tip, 4.6, 2.8);
      ctx.restore();
    },
  },

  skull: {
    draw(ctx, s, c) {
      const k = c.body;
      const l = legsOf(s);
      fit(ctx, l[0], -1.8, -2.1, null, 4, k); fit(ctx, l[1], 1.8, -2.1, null, 4, k);
      fit(ctx, '≡', 0, -5.7, 4.6, 3.2, k);
      arms(ctx, s, k, 3.2, -5.9, 3);
      fit(ctx, 'ш', 0.4, -8.2 + (s.pose === 'fallHard' ? 1 : 0), 4.2, 1.9, k);
      fit(ctx, '●', 0, -12.2, 8, 7, k);
      const lx = look(s) * 0.5, e = eyeOf(s);
      for (const sx of [-1, 1]) {
        const x = sx * 1.9 + lx;
        if (e === '-') fit(ctx, '-', x, -12.6, 2.4, 0.9, c.bg);
        else if (e === '^') fit(ctx, '^', x, -12.6, 2.4, 1.7, c.bg);
        else if (e === 'O') fit(ctx, '●', x, -12.6, 3, 3.4, c.bg);
        else fit(ctx, '●', x, -12.4, 2.5, 2.7, c.bg);
      }
      fit(ctx, '▼', lx, -10.2, 1.2, 1, c.bg);
      crown(ctx, s, c, -17.3, 5.2, 3.2);
    },
  },

  // The one in the game: helmet with a tinted visor, backpack and boots. The pack fires a
  // little jet on every jump. Asleep, it sits with its legs out, leans back on the pack
  // and nods off.
  astronaut: {
    draw(ctx, s, c) {
      const k = c.body;
      if (s.sleep) return this.sleep(ctx, s, c);
      // The jet: full while it burns, shrinking into the pack as the burn runs out.
      if (s.jet > 0) {
        const burn = Math.min(1, s.jet / 0.08), h = 4 * burn * (1 + 0.2 * Math.sin(s.t * 31));
        fit(ctx, '♦', -4.4, -4.4 + h / 2, 1.8 * (0.6 + 0.4 * burn), h, c.hazard);
        if (burn > 0.5) fit(ctx, '♦', -4.4, -4.4 + h * 0.3, 0.8, h * 0.45, blend(c.hazard, c.light, 0.6));
      }
      fit(ctx, '█', -4.3, -7, 2.2, 5, blend(k, c.bg, 0.35));
      const up = s.pose === 'rise' ? [-0.8, -0.8] : lift(s);
      fit(ctx, '█', -1.7, -1.7 + up[0], 2.4, 3.4, k);
      fit(ctx, '█', 1.7, -1.7 + up[1], 2.4, 3.4, k);
      fit(ctx, '█', 0, -5.8, 7, 4.6, k);
      fit(ctx, '●', 0, -11.8, 9.6, 8.6, k);
      fit(ctx, '●', 1.3, -11.8, 6.4, 5, blend(c.bg, c.accent, 0.3));
      eyes(ctx, s, 1.1, -11.8, 1.3, k, 0.55);
      fit(ctx, '/', 3.3, -13, null, 1.6, blend(c.accent, c.light, 0.5));
      crown(ctx, s, c, -17.7, 5.4, 3.2);
    },
    sleep(ctx, s, c) {
      const k = c.body, breath = Math.sin(s.t * 1.6);
      fit(ctx, '█', 2, -1.2, 6, 2.4, k);
      ctx.save();
      ctx.translate(0, -2.2);
      ctx.rotate(-0.14);
      fit(ctx, '█', -4.3, -2.6, 2.2, 5, blend(k, c.bg, 0.35));
      fit(ctx, '█', 0, -2.3, 7, 4.6, k);
      ctx.translate(0, -3.6 + breath * 0.35);
      ctx.rotate(0.3 + breath * 0.05);
      fit(ctx, '●', 0, -4, 9.6, 8.6, k);
      fit(ctx, '●', 1.3, -4, 6.4, 5, blend(c.bg, c.accent, 0.3));
      fit(ctx, '-', -0.3, -3.6, 2, 0.7, k);
      fit(ctx, '-', 2.5, -3.6, 2, 0.7, k);
      fit(ctx, '/', 3.3, -5.2, null, 1.6, blend(c.accent, c.light, 0.5));
      crown(ctx, s, c, -9.9, 5.4, 3.2);
      ctx.restore();
    },
  },
};
