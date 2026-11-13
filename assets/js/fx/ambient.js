// Atmosphere any world can wear: drifting particles and a vignette.
//
//   { "type": "dust", "kind": "dust" | "embers" | "ash" | "snow" | "spores" | "glitter",
//     "count": 40, "colors": [...], "layer": "back" | "front", "area": [x, y, w, h] }
//   { "type": "vignette", "strength": 0.6, "color": "#000", "fog": ["#ff6a3d", 0.25] }

import { CW, CH, MAP_W, MAP_H, MAP_Y } from '../config.js';
import { clamp, noise } from '../art/math.js';
import { gradient, pick } from '../art/color.js';
import { put, done } from '../art/glyphs.js';
import { seeded, clipMap } from './common.js';

const KINDS = {
  //            glyphs     drift x, y (px/s)  wobble  alpha       life-cycle flicker
  dust:   { chars: ".'`·", vx: 3, vy: -2, wob: 6, alpha: [0.15, 0.45], flicker: 0 },
  embers: { chars: ".,'`", vx: 6, vy: -28, wob: 10, alpha: [0.4, 1], flicker: 0.6 },
  ash:    { chars: ".,`", vx: 8, vy: 10, wob: 12, alpha: [0.2, 0.5], flicker: 0 },
  snow:   { chars: ".'`", vx: 4, vy: 16, wob: 8, alpha: [0.3, 0.8], flicker: 0 },
  spores: { chars: "o.°", vx: 2, vy: -6, wob: 14, alpha: [0.2, 0.6], flicker: 0.3 },
  glitter:{ chars: "+.'`", vx: 0, vy: 0, wob: 3, alpha: [0, 1], flicker: 1 },
};

export function dust(def, play) {
  const kind = KINDS[def.kind ?? 'dust'] ?? KINDS.dust, r = seeded(play, 3);
  const [ax, ay, aw, ah] = (def.area ?? [0, 0, MAP_W / CW, MAP_H / CH]).map((v, i) => v * (i % 2 ? CH : CW));
  const colors = gradient(def.colors ?? [play.world.palette.dim, play.world.palette.text], 6);
  const motes = Array.from({ length: def.count ?? 40 }, () => ({
    x: ax + r() * aw, y: ay + r() * ah, p: r() * 99, s: 0.5 + r(), ch: kind.chars[Math.floor(r() * kind.chars.length)], c: r(),
  }));
  let t = 0;
  const draw = (screen) => {
    for (const m of motes) {
      const wx = Math.sin(t * 0.7 * m.s + m.p) * kind.wob, wy = Math.cos(t * 0.5 * m.s + m.p * 1.3) * kind.wob * 0.5;
      const fl = kind.flicker ? 1 - kind.flicker * (0.5 + 0.5 * Math.sin(t * 9 * m.s + m.p)) : 1;
      const a = (kind.alpha[0] + (kind.alpha[1] - kind.alpha[0]) * (0.5 + 0.5 * Math.sin(t * 0.8 + m.p))) * fl;
      put(screen, m.ch, m.x + wx, m.y + wy, pick(colors, m.c), 2, a);
    }
    done(screen);
  };
  return {
    anim(dt) {
      t += dt;
      for (const m of motes) {
        m.x += (kind.vx + noise(m.p, t * 0.2) * kind.vx) * m.s * dt * (def.wind ?? 1);
        m.y += kind.vy * m.s * dt;
        if (m.x > ax + aw + 10) m.x = ax - 5; else if (m.x < ax - 10) m.x = ax + aw + 5;
        if (m.y > ay + ah + 10) m.y = ay - 5; else if (m.y < ay - 10) m.y = ay + ah + 5;
      }
    },
    [def.layer === 'front' ? 'front' : 'back']: draw,
  };
}

// The corners fall into shadow; an optional colored fog rises from the floor.
export function vignette(def, play) {
  const store = { key: null, canvas: null };
  return {
    front(screen) {
      const s = screen.scale, bg = screen.color(def.color ?? play.world.palette.bg);
      const key = `${s}:${bg}:${def.strength}:${def.fog}`;
      if (store.key !== key) {
        const c = store.canvas ??= document.createElement('canvas');
        c.width = Math.ceil(MAP_W * s);
        c.height = Math.ceil(MAP_H * s);
        const l = c.getContext('2d'), w = c.width, h = c.height;
        l.clearRect(0, 0, w, h);
        const g = l.createRadialGradient(w / 2, h * 0.45, h * 0.35, w / 2, h * 0.45, Math.hypot(w, h) * 0.58);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, bg);
        l.globalAlpha = clamp(def.strength ?? 0.6);
        l.fillStyle = g;
        l.fillRect(0, 0, w, h);
        if (def.fog) {
          const [fc, fa] = def.fog, f = l.createLinearGradient(0, h, 0, h * 0.55);
          f.addColorStop(0, screen.color(fc));
          f.addColorStop(1, 'rgba(0,0,0,0)');
          l.globalAlpha = fa;
          l.fillStyle = f;
          l.fillRect(0, 0, w, h);
        }
        store.key = key;
      }
      clipMap(screen, (ctx) => ctx.drawImage(store.canvas, 0, MAP_Y, MAP_W, MAP_H));
    },
  };
}

