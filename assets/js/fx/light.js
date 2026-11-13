// Light and shadow over a level.
//
// Every light casts shadows: a ray walks from each sample to the light through the map.
// The result is a 128x36 picture, stretched smooth over the level: darkness first, then
// the colored glow added on top. Lights come from the level ("lights"), the player, every
// exit, and any other effect with a lights() hook.
//
//   { "type": "light", "ambient": 0.12, "player": [radius, color, intensity],
//     "lights": [{ "at": [x, y], "r": 6, "color": "#ffd27a", "i": 1, "flicker": 0.3 }],
//     "sonar": { "speed": 260, "range": 460, "every": 0, "fade": 0.45, "onJump": true },
//     "glow": 0.6, "glowAlpha": 0.45 }

import { CW, CH, MAP_COLS, MAP_ROWS, MAP_Y, MAP_W, MAP_H } from '../config.js';
import { tileOf } from '../game/tiles.js';
import { TAU, clamp } from '../art/math.js';
import { rgb } from '../art/color.js';
import { HX, HY, HW, HH, putAt, flow, done, solids } from '../art/glyphs.js';

export function light(def, play) {
  const N = HW * HH;
  const L = new Float32Array(N), Rr = new Float32Array(N), Gg = new Float32Array(N), Bb = new Float32Array(N), mem = new Float32Array(N);
  const mk = () => { const c = document.createElement('canvas'); c.width = HW; c.height = HH; const x = c.getContext('2d'); return { c, x, img: x.createImageData(HW, HH) }; };
  const dark = mk(), glow = mk();
  const ambient = def.ambient ?? 0.12;
  const [pr, pc, pi] = def.player ?? [5, '#bfefff', 0.85];
  const colorCache = new Map();
  const col = (screen, c) => { const k = screen.color(c); let v = colorCache.get(k); if (!v) colorCache.set(k, v = rgb(k)); return v; };
  const fixed = (def.lights ?? []).map((l) => ({ x: (l.at[0] + 0.5) * CW, y: (l.at[1] + 0.5) * CH, r: (l.r ?? 6) * CW, color: l.color ?? '#ffd27a', i: l.i ?? 1, flicker: l.flicker ?? 0 }));
  const exits = [];
  play.level.grid.forEach((ch, i) => {
    if (tileOf(ch)?.exit) exits.push({ x: (i % MAP_COLS + 0.5) * CW, y: (((i / MAP_COLS) | 0) + 0.5) * CH, r: 4 * CW, color: play.world.palette.exit, i: 0.9 });
  });
  const sonar = def.sonar ? { speed: def.sonar.speed ?? 260, range: def.sonar.range ?? 460, rings: [], every: def.sonar.every ?? 0, clock: 0 } : null;
  let t = 0;

  const occluded = (m, sx, sy, lx, ly) => {
    const own = Math.floor(sy / CH) * MAP_COLS + Math.floor(sx / CW), src = Math.floor(ly / CH) * MAP_COLS + Math.floor(lx / CW);
    const dx = lx - sx, dy = ly - sy, n = Math.ceil(Math.hypot(dx, dy) / 4);
    for (let k = 1; k < n; k++) {
      const x = sx + dx * k / n, y = sy + dy * k / n, cx = Math.floor(x / CW), cy = Math.floor(y / CH);
      if (cx < 0 || cx >= MAP_COLS || cy < 0 || cy >= MAP_ROWS) continue;
      const ci = cy * MAP_COLS + cx;
      if (ci !== own && ci !== src && m[ci]) return true;
    }
    return false;
  };

  const add = (screen, m, l) => {
    const [cr, cg, cb] = col(screen, l.color), r = l.r, i0 = l.i;
    const x0 = Math.max(0, Math.floor((l.x - r) / HX)), x1 = Math.min(HW - 1, Math.floor((l.x + r) / HX));
    const y0 = Math.max(0, Math.floor((l.y - r) / HY)), y1 = Math.min(HH - 1, Math.floor((l.y + r) / HY));
    for (let hy = y0; hy <= y1; hy++) {
      const sy = hy * HY + HY / 2, dy = sy - l.y;
      for (let hx = x0; hx <= x1; hx++) {
        const sx = hx * HX + HX / 2, dx = sx - l.x, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        let f = 1 - Math.sqrt(d2) / r;
        f = f * f * i0;
        if (l.shadow !== false && occluded(m, sx, sy, l.x, l.y)) continue;
        const k = hy * HW + hx;
        L[k] += f; Rr[k] += f * cr; Gg[k] += f * cg; Bb[k] += f * cb;
      }
    }
  };

  const ping = (x, y) => {
    if (!sonar) return;
    if (sonar.rings.length >= 4) sonar.rings.shift();
    sonar.rings.push({ x, y, r: 0 });
    play.sfx('ping', x);
  };

  return {
    save: () => ({ clock: sonar?.clock, rings: sonar ? sonar.rings.map((r) => ({ ...r })) : [] }),
    load(st) { if (sonar) { sonar.clock = st.clock; sonar.rings = st.rings.map((r) => ({ ...r })); } },
    ping,
    anim(dt) {
      t += dt;
      for (let k = 0; k < N; k++) if (mem[k] > 0) mem[k] = Math.max(0, mem[k] - dt * (def.sonar?.fade ?? 0.45));
      if (sonar) {
        for (const ring of sonar.rings) ring.r += sonar.speed * dt;
        sonar.rings = sonar.rings.filter((ring) => ring.r < sonar.range);
      }
    },
    update(dt, play) {
      if (!sonar) return;
      const p = play.player;
      if (def.sonar.onJump !== false && p.jumped) ping(p.cx, p.cy);
      if (sonar.every && (sonar.clock += dt) >= sonar.every) { sonar.clock = 0; ping(p.cx, p.cy); }
    },
    cmd(s) { if (s.ping) ping((s.ping[0] + 0.5) * CW, (s.ping[1] + 0.5) * CH); if (s.ambient != null) def.ambient = s.ambient; },
    front(screen) {
      const ctx = screen.ctx, m = solids(play.level), p = play.player, pal = play.world.palette;
      L.fill(0); Rr.fill(0); Gg.fill(0); Bb.fill(0);
      const lights = [...exits];
      for (const l of fixed) lights.push(l.flicker ? { ...l, i: l.i * (1 - l.flicker * (0.5 + 0.5 * Math.sin(t * 13 + l.x) * Math.sin(t * 7.3 + l.y))) } : l);
      if (pr) lights.push({ x: p.cx, y: p.cy, r: pr * CW * (play.state === 'dead' ? 0.6 : 1), color: pc, i: pi });
      for (const f of play.fx) if (f.lights) lights.push(...f.lights(play));
      for (const l of lights) add(screen, m, l);

      const amb = def.ambient ?? ambient;
      if (sonar) {
        const [sr, sg, sb] = col(screen, pal.accent), [hr, hg, hb] = col(screen, pal.hazard);
        for (const ring of sonar.rings) {
          const fade = 1 - ring.r / sonar.range;
          const x0 = Math.max(0, Math.floor((ring.x - ring.r - 30) / HX)), x1 = Math.min(HW - 1, Math.ceil((ring.x + ring.r + 30) / HX));
          const y0 = Math.max(0, Math.floor((ring.y - ring.r - 30) / HY)), y1 = Math.min(HH - 1, Math.ceil((ring.y + ring.r + 30) / HY));
          for (let hy = y0; hy <= y1; hy++) {
            for (let hx = x0; hx <= x1; hx++) {
              const d = Math.hypot(hx * HX + HX / 2 - ring.x, hy * HY + HY / 2 - ring.y) - ring.r;
              if (d > 26 || d < -26) continue;
              const k = hy * HW + hx, v = Math.exp(-(d * d) / 200) * fade;
              if (v > mem[k]) mem[k] = v;
            }
          }
        }
        for (let k = 0; k < N; k++) {
          const v = mem[k];
          if (v <= 0.01) continue;
          const tile = tileOf(play.level.grid[((k / HW / 2) | 0) * MAP_COLS + ((k % HW) >> 1)]);
          const red = tile?.hazard;
          L[k] += v * 1.1;
          Rr[k] += v * (red ? hr : sr); Gg[k] += v * (red ? hg : sg); Bb[k] += v * (red ? hb : sb);
        }
      }

      const [br, bg, bb] = col(screen, pal.bg), dd = dark.img.data, gd = glow.img.data, gk = def.glow ?? 0.6;
      for (let k = 0, j = 0; k < N; k++, j += 4) {
        const lit = clamp(amb + L[k]);
        dd[j] = br; dd[j + 1] = bg; dd[j + 2] = bb; dd[j + 3] = Math.pow(1 - lit, 1.3) * 255;
        gd[j] = Math.min(255, Rr[k] * gk); gd[j + 1] = Math.min(255, Gg[k] * gk); gd[j + 2] = Math.min(255, Bb[k] * gk); gd[j + 3] = 255;
      }
      dark.x.putImageData(dark.img, 0, 0);
      glow.x.putImageData(glow.img, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 1;
      ctx.drawImage(dark.c, 0, MAP_Y, MAP_W, MAP_H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = def.glowAlpha ?? 0.45;
      ctx.drawImage(glow.c, 0, MAP_Y, MAP_W, MAP_H);
      ctx.restore();

      // The ping itself, drawn as a circle of glyphs on top of the dark.
      if (sonar) {
        for (const ring of sonar.rings) {
          const fade = 1 - ring.r / sonar.range, steps = Math.max(12, Math.floor(ring.r * TAU / 7));
          for (let s = 0; s < steps; s++) {
            const a = s / steps * TAU, x = ring.x + Math.cos(a) * ring.r, y = ring.y + Math.sin(a) * ring.r;
            if (x < 0 || x > MAP_W || y < 0 || y > MAP_H) continue;
            putAt(screen, flow(a + Math.PI / 2), x, y, pal.accent, 2, fade * 0.9);
          }
        }
      }
      done(screen);
    },
  };
}
