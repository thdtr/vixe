// The Abyss: everything here is still glyphs, just more of them.
//
// Built on the art kit (assets/js/art/) and the core effects (assets/js/fx/): this file
// only adds what belongs to the deep sea. Each type below is registered with registerFx
// (game/fx.js) and switched on per level in "fx": [...].
//
//   sky      dusk over the sea: gradient, clouds and a striped sun
//   sea      waves, god rays, sun glitter, bubbles and marine snow
//   jellies  pulsing jellyfish that glow, sway and sting
//   vortex   a maelstrom that drags you around its eye
//   serpent  a leviathan that hunts you
//   magma    vents that breathe fire (doom-fire style)
//   eye      a 3D eyeball that follows you, blinks and, if asked, fights
//
// Walls are carved by the core "texture" effect and lit by the core "light" effect.
// Effects that change the game (push, kill, open doors) also have save() and load(state),
// so tools/solve.mjs can rewind them while it searches.

import { CW, CH, MAP_W, MAP_H } from '../../js/config.js';
import { TAU, clamp, mix, smooth, frac, approach, wrapAngle, hash, noise, fbm } from '../../js/art/math.js';
import { gradient, pick } from '../../js/art/color.js';
import { HX, HY, HW, HH, RAMP, put, putAt, flow, done, solids, free, blockedAt } from '../../js/art/glyphs.js';

const { fine: FINE, shade: SHADE, fire: FIRE } = RAMP;

export function register({ registerFx, registerTile }) {
  // Kelp and coral: scenery that sways in place and is never solid.
  registerTile('}', { color: 'wallDim', anim: '}}}{{{)))(((' });

  // ---------------------------------------------------------------- sky
  registerFx('sky', (def, play) => {
    const horizon = (def.horizon ?? 8) * CH;
    const sx = (def.sun?.[0] ?? 46) * CW, sy = (def.sun?.[1] ?? 7) * CH, R = def.radius ?? 50;
    const skyG = gradient(['#07051a', '#1d0b3a', '#4a1250', '#a12d5c', '#f06a5a', '#ffb070'], 14);
    const sunG = gradient(['#ff3d6e', '#ff7a4d', '#ffc266', '#fff3c4'], 12);
    const cloudG = gradient(['#1b0a2e', '#4b1a4a', '#a8405e', '#ff9a6a', '#ffd9a0'], 12);
    let t = 0;
    return {
      anim(dt) { t += dt; },
      back(screen) {
        const m = solids(play.level), rows = Math.ceil(horizon / HY);
        for (let hy = 0; hy < rows; hy++) {
          const y = hy * HY + HY / 2, k = y / horizon;
          for (let hx = 0; hx < HW; hx++) {
            if (!free(m, hx, hy)) continue;
            const x = hx * HX + HX / 2;
            const dx = (x - sx) / R, dy = (y - sy) / R, d = Math.hypot(dx, dy);
            // Long thin clouds, lit from below by the sun.
            const c = smooth(0.52, 0.78, fbm(x * 0.007 + t * 0.012, y * 0.055)) * smooth(0.12, 0.45, k);
            if (d < 1 && c < 0.35) {
              // Retro sun: bands cut its lower half, thicker toward the sea.
              const k = Math.floor((y - sy) / HY);
              if (k > 0 && (k % 3 === 1 || (dy > 0.45 && k % 3 === 2))) continue;
              const b = 0.55 + 0.45 * (1 - (dy + 1) / 2) - d * d * 0.15;
              put(screen, FINE[Math.round(clamp(b) * (FINE.length - 1))], hx * HX, hy * HY, pick(sunG, 1 - (dy + 1) / 2), 2, 1);
              continue;
            }
            const glow = d > 1 ? Math.exp(-(d - 1) * 1.6) * 0.55 : 0;
            let v = k * k * 0.32 + glow;
            if (c > 0.05) {
              const lit = clamp(0.25 + glow * 1.4 + k * 0.4);
              put(screen, ' .-~=+*'[Math.round(clamp(0.15 + c * 0.85) * 6)], hx * HX, hy * HY, pick(cloudG, lit), 2, 0.35 + c * 0.6);
              continue;
            }
            const n = hash(hx, hy);
            if (k < 0.6 && n > 0.982) {
              const tw = 0.5 + 0.5 * Math.sin(t * (2 + n * 6) + n * 99);
              put(screen, tw > 0.8 ? '+' : n > 0.995 ? '*' : '.', hx * HX, hy * HY, '#ffe9d0', 2, (0.3 + tw * 0.7) * (1 - k));
              continue;
            }
            v *= 0.6 + noise(x * 0.03, y * 0.08) * 0.8;
            if (v < 0.07) continue;
            put(screen, SHADE[Math.round(clamp(v) * (SHADE.length - 1))], hx * HX, hy * HY, pick(skyG, k * 0.85 + glow * 0.5), 2, 0.85);
          }
        }
        done(screen);
      },
    };
  });

  // ---------------------------------------------------------------- sea
  registerFx('sea', (def, play) => {
    const surf = (def.surface ?? 0) * CH;
    const sunX = def.sun != null ? def.sun * CW : null;
    const deep = gradient(def.colors ?? ['#9af0ff', '#38b6dd', '#136a96', '#0a3557', '#041627', '#02070e'], 14);
    const rays = def.rays ?? 0.7, open = surf > 0;
    const bubbles = [], snow = [];
    for (let i = 0; i < (def.snow ?? 50); i++) snow.push({ x: Math.random() * MAP_W, y: Math.random() * MAP_H, v: 4 + Math.random() * 8, p: Math.random() * 9 });
    let t = 0, was = null;
    const wave = (x) => open ? Math.sin(x * 0.045 + t * 1.7) * 3 + Math.sin(x * 0.11 - t * 2.4) * 1.5 + Math.sin(x * 0.021 + t * 0.6) * 2 : 0;
    const level = surf + 1;
    const bubble = (x, y, big) => bubbles.length < 90 && bubbles.push({ x, y, v: 25 + Math.random() * 35, p: Math.random() * 9, big, life: 6 });
    return {
      save: () => ({ was }),
      load(st) { was = st.was; },
      anim(dt) {
        t += dt;
        for (const b of bubbles) { b.y -= b.v * dt; b.x += Math.sin(t * 4 + b.p) * 10 * dt; b.life -= dt; }
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          if (b.life < 0 || b.y < surf + wave(b.x) + 4) bubbles.splice(i, 1);
        }
        if (Math.random() < dt * (def.bubbles ?? 3)) bubble(Math.random() * MAP_W, MAP_H - 4, Math.random() < 0.3);
        for (const s of snow) {
          s.y += s.v * dt;
          s.x += Math.sin(t * 0.5 + s.p) * 3 * dt;
          if (s.y > MAP_H) { s.y = level; s.x = Math.random() * MAP_W; }
        }
      },
      update(dt, play) {
        const p = play.player, under = p.cy > surf + wave(p.cx);
        if (open && was !== null && under !== was && Math.abs(p.vy) > 40) {
          play.particles.burst(p.cx, surf, "~.'`,", 14, 170, '#d6fbff', { angle: -Math.PI / 2, spread: 1.7, life: 0.7 });
          play.sfx('splash', p.cx);
          for (let i = 0; i < 6; i++) bubble(p.cx + (Math.random() - 0.5) * 12, p.cy + 6, i < 2);
        }
        was = under;
        if (under && p.jumped) for (let i = 0; i < 3; i++) bubble(p.cx + (Math.random() - 0.5) * 6, p.cy, i === 0);
        if (under && Math.random() < dt * 1.2) bubble(p.cx + p.facing * 3, p.y + 2, false);
      },
      back(screen) {
        const m = solids(play.level), depthSpan = MAP_H - surf;
        for (let hx = 0; hx < HW; hx++) {
          const x = hx * HX + HX / 2, w = surf + wave(x);
          const top = Math.max(0, Math.floor(w / HY));
          const slope = wave(x + 3) - wave(x - 3);
          for (let hy = top; hy < HH; hy++) {
            if (!free(m, hx, hy)) continue;
            const y = hy * HY + HY / 2;
            if (open && hy === top) {
              const crest = wave(x) < -3.2;
              const ch = crest ? '^' : slope > 1.2 ? '/' : slope < -1.2 ? '\\' : hash(hx, Math.floor(t * 3)) > 0.5 ? '~' : '-';
              put(screen, ch, hx * HX, hy * HY, crest ? '#ffffff' : '#bff6ff', 2, 0.95);
              continue;
            }
            const depth = clamp((y - w) / depthSpan);
            let v = 0, warm = false;
            // God rays: slanted bands that drift and fade with depth.
            const r = rays ? Math.pow(0.5 + 0.5 * Math.sin((x + (y - surf) * 0.55) * 0.027 + Math.sin(t * 0.35 + x * 0.003) * 1.3 + t * 0.12), 7) * Math.pow(1 - depth, 1.6) * rays : 0;
            const n = noise(x * 0.05 + t * 0.35, y * 0.09 - t * 0.25);
            v = 0.05 + r * 0.9 + n * 0.22 * (1 - depth * 0.7);
            if (sunX != null && open && y - w < 70) {
              const spread = 14 + (y - w) * 0.5;
              if (Math.abs(x - sunX) < spread && hash(hx * 3 + Math.floor(t * 9), hy) > 0.62) { v += 0.7 * (1 - (y - w) / 70); warm = true; }
            }
            if (v < 0.15) continue;
            const ch = warm ? (hash(hx, hy) > 0.5 ? '=' : '-') : r > 0.22 ? (r > 0.5 ? '/' : "'") : SHADE[Math.round(clamp(v) * 5)];
            put(screen, ch, hx * HX, hy * HY, warm ? '#ffcf7a' : pick(deep, depth * 0.92 + 0.08 - r * 0.25), 2, clamp(0.35 + v));
          }
        }
        for (const s of snow) {
          if (blockedAt(m, s.x, s.y)) continue;
          put(screen, s.p > 6 ? ',' : '.', s.x, s.y, '#5d8aa0', 2, 0.55);
        }
        for (const b of bubbles) {
          if (blockedAt(m, b.x, b.y)) continue;
          put(screen, b.big ? 'O' : b.y % 30 < 15 ? 'o' : '.', b.x - HX / 2, b.y - HY / 2, '#c8f6ff', 2, 0.8);
        }
        done(screen);
      },
    };
  });

  // ---------------------------------------------------------------- jellies
  registerFx('jellies', (def, play) => {
    const list = def.list.map((j, k) => {
      const color = j.color ?? '#ff6ad5';
      return {
        ax: (j.at[0] + 0.5) * CW, ay: (j.at[1] + 0.5) * CH, path: j.path ?? [1, 2], period: j.period ?? 4,
        phase: j.phase ?? k * 0.37, size: j.size ?? 1, color, g: gradient(['#12051a', color, '#ffffff'], 10),
        x: 0, y: 0, squeeze: 0, legs: j.legs ?? 5,
      };
    });
    let t = 0;
    const place = (j) => {
      const u = frac(t / j.period + j.phase), A = j.path[1] * CH;
      // A quick pulse up, a slow sink back down.
      const rise = u < 0.25 ? smooth(0, 1, u / 0.25) : 1 - (u - 0.25) / 0.75;
      j.y = j.ay + A * (1 - rise * 2) * 0.5;
      j.x = j.ax + Math.sin(u * TAU) * j.path[0] * CW;
      j.squeeze = u < 0.25 ? Math.sin(u / 0.25 * Math.PI) : 0;
    };
    const dims = (j) => [22 * j.size * (1 - 0.2 * j.squeeze), 26 * j.size * (1 + 0.22 * j.squeeze)];
    list.forEach(place);
    return {
      save: () => ({ t }),
      load(st) { t = st.t; list.forEach(place); },
      anim(dt) { t += dt; list.forEach(place); },
      update(dt, play) {
        const p = play.player;
        for (const j of list) {
          const [W, H] = dims(j);
          const dx = (p.cx - j.x) / (W + 2), dy = (p.cy - j.y) / (H + 4);
          const bell = dy < 0.3 && dx * dx + dy * dy < 1;
          const legs = Math.abs(p.cx - j.x) < W * 0.7 && p.cy > j.y && p.cy < j.y + 6.5 * HY * j.size + 4;
          if (bell || legs) return play.kill();
        }
      },
      lights() {
        return list.map((j) => ({ x: j.x, y: j.y - 4, r: (6 + j.squeeze * 2) * CW * j.size, color: j.color, i: 0.75 + j.squeeze * 0.4 }));
      },
      front(screen) {
        for (const j of list) {
          const [W, H] = dims(j);
          const x0 = Math.floor((j.x - W) / HX), x1 = Math.ceil((j.x + W) / HX), y0 = Math.floor((j.y - H) / HY), y1 = Math.floor(j.y / HY);
          const inside = (x, y) => { const nx = (x - j.x) / W, ny = (y - j.y) / H; return ny <= 0.1 && nx * nx + ny * ny < 1; };
          for (let hy = y0; hy <= y1 + 1; hy++) {
            for (let hx = x0; hx <= x1; hx++) {
              const x = hx * HX + HX / 2, y = hy * HY + HY / 2, nx = (x - j.x) / W, ny = (y - j.y) / H;
              if (hy === y1 + 1) {
                // Scalloped rim under the bell.
                if (Math.abs(nx) > 1.02) continue;
                const ch = nx < -0.75 ? '(' : nx > 0.75 ? ')' : (hx + Math.floor(t * 6)) % 2 ? 'v' : '-';
                put(screen, ch, hx * HX, hy * HY, pick(j.g, 0.75), 2, 0.9, true);
                continue;
              }
              if (!inside(x, y)) continue;
              const edge = !inside(x - HX, y) || !inside(x + HX, y) || !inside(x, y - HY);
              if (edge) {
                // The outline of the dome, drawn with the glyph that follows its curve.
                const ch = Math.abs(nx) > 0.82 ? (nx < 0 ? '(' : ')') : Math.abs(nx) < 0.3 ? (ny < -0.7 ? '_' : '~') : flow(Math.atan2(ny / H, nx / W) + Math.PI / 2);
                put(screen, ch, hx * HX, hy * HY, pick(j.g, 0.8 + j.squeeze * 0.2), 2, 1, true);
                continue;
              }
              // See-through inside, with four glowing lobes that turn as it swims.
              const lobe = Math.sin(Math.atan2(ny + 0.35, nx) * 4 + t * 1.5);
              const near = ny > -0.75 && ny < -0.05 && Math.abs(nx) < 0.6;
              if (near && lobe > 0.3) put(screen, lobe > 0.8 ? 'O' : 'o', hx * HX, hy * HY, pick(j.g, 0.65 + lobe * 0.3), 2, 0.9);
              else put(screen, (hx + hy) % 3 ? '.' : ':', hx * HX, hy * HY, pick(j.g, 0.45), 2, 0.35 + j.squeeze * 0.3);
            }
          }
          const len = Math.round(6 * j.size + j.squeeze * -1.5);
          for (let l = 0; l < j.legs; l++) {
            const base = j.x + (l / (j.legs - 1) - 0.5) * W * 1.4, mid = l === (j.legs >> 1);
            let prev = base;
            for (let k = 0; k < len; k++) {
              const x = base + Math.sin(t * 2.4 + k * 0.7 + l * 1.3) * k * 1.4 * (1 - j.squeeze * 0.6);
              const ch = mid ? (k % 2 ? '}' : '{') : x - prev > 0.8 ? '\\' : x - prev < -0.8 ? '/' : k % 3 === 2 ? ':' : '|';
              putAt(screen, ch, x, j.y + H * 0.15 + (k + 1.5) * HY, j.color, 2, (1 - k / len) * 0.85);
              prev = x;
            }
          }
        }
        done(screen);
      },
    };
  });

  // ---------------------------------------------------------------- vortex
  registerFx('vortex', (def, play) => {
    const cx = (def.at[0] + 0.5) * CW, cy = (def.at[1] + 0.5) * CH, R = (def.radius ?? 8) * CW, core = (def.core ?? 1.2) * CW;
    const dir = def.dir ?? 1, spin = def.spin ?? 15, pull = def.pull ?? 4;
    const g = gradient(['#05202e', '#0f5a78', '#3ec1e6', '#d9fbff'], 12);
    const bits = Array.from({ length: def.debris ?? 22 }, (_, i) => ({ r: R * (0.3 + 0.7 * Math.random()), a: Math.random() * TAU, ch: ",.'`*o"[i % 6] }));
    let t = 0;
    return {
      // Its pull depends only on where you are; the debris is just for show.
      save: () => ({}),
      load() {},
      anim(dt) {
        t += dt;
        for (const b of bits) {
          b.a += dir * dt * (spin * CW / Math.max(b.r, core)) * 0.9;
          b.r -= dt * (pull * CW * 0.5 + 8);
          if (b.r < core) { b.r = R * (0.85 + Math.random() * 0.15); b.a = Math.random() * TAU; }
        }
      },
      update(dt, play) {
        const p = play.player, dx = p.cx - cx, dy = p.cy - cy, d = Math.hypot(dx, dy);
        if (d < core) return play.kill();
        if (d >= R) return;
        const ux = dx / d, uy = dy / d, k = 1 - d / R;
        const vt = spin * CW * Math.pow(k, 0.5), vr = pull * CW * k;
        const vx = -uy * dir * vt - ux * vr, vy = ux * dir * vt - uy * vr;
        const was = p.push || [0, 0];
        p.push = [was[0] + vx / CW, was[1] + vy / CH];
      },
      back(screen) {
        const m = solids(play.level), reach = R * 1.15;
        const x0 = Math.max(0, Math.floor((cx - reach) / HX)), x1 = Math.min(HW - 1, Math.ceil((cx + reach) / HX));
        const y0 = Math.max(0, Math.floor((cy - reach) / HY)), y1 = Math.min(HH - 1, Math.ceil((cy + reach) / HY));
        for (let hy = y0; hy <= y1; hy++) {
          for (let hx = x0; hx <= x1; hx++) {
            if (!free(m, hx, hy)) continue;
            const x = hx * HX + HX / 2, y = hy * HY + HY / 2, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), r = d / R;
            if (r > 1.15) continue;
            const a = Math.atan2(dy, dx);
            if (d < core) {
              put(screen, d > core * 0.6 ? '@' : ' ', hx * HX, hy * HY, '#02060a', 2, 1);
              continue;
            }
            // A logarithmic spiral that turns, brighter toward the throat.
            const ph = 3 * a - dir * Math.log(r + 0.04) * 5.5 - t * 3.2 * dir;
            const arm = Math.pow(0.5 + 0.5 * Math.sin(ph), 2.2);
            const fall = Math.pow(clamp(1.1 - r), 0.8);
            const v = arm * (0.3 + 0.85 * fall) * (0.8 + 0.35 * noise(x * 0.07 + t, y * 0.07)) + (d < core * 1.8 ? 0.5 : 0);
            if (v < 0.1) continue;
            const ch = v > 0.3 ? flow(a + dir * (Math.PI / 2 + 0.35)) : v > 0.18 ? ':' : '.';
            put(screen, ch, hx * HX, hy * HY, pick(g, 0.2 + v), 2, clamp(v + 0.4), v > 0.6);
          }
        }
        for (const b of bits) putAt(screen, b.ch, cx + Math.cos(b.a) * b.r, cy + Math.sin(b.a) * b.r * 0.9, '#a9e9ff', 2, 0.8);
        done(screen);
      },
    };
  });

  // ---------------------------------------------------------------- serpent
  // A chain of spheres following the head's trail; drawn through a depth buffer
  // so it shades as one smooth body.
  registerFx('serpent', (def, play) => {
    const N = def.length ?? 44, GAP = def.gap ?? 7, R = def.radius ?? 28;
    const rad = Array.from({ length: N }, (_, i) => i < 5 ? R * (0.78 + 0.22 * i / 5) : R * Math.max(0.12, 1 - Math.pow((i - 5) / (N - 5), 1.35) * 0.9));
    const bodyG = gradient(['#020a08', '#0b3a32', '#1f7a5c', '#7fd6a0', '#e8ffe0'], 14);
    const bellyG = gradient(['#0b0a06', '#4a3b1e', '#a8875a', '#f0dcb0'], 12);
    const Lx = -0.45, Ly = -0.65, Lz = 0.61, Hn = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / Hn, Hy = Ly / Hn, Hz = (Lz + 1) / Hn;
    let x = (def.start?.[0] ?? -8) * CW, y = (def.start?.[1] ?? 9) * CH, ang = def.angle ?? 0, speed = 0, t = 0, wait = def.delay ?? 1, awake = false, mouth = 0;
    const path = [];
    for (let i = 0; i <= N * GAP / 2 + 2; i++) path.push([x - Math.cos(ang) * i * 2, y - Math.sin(ang) * i * 2]);
    const seg = (i) => path[Math.min(path.length - 1, Math.round(i * GAP / 2))];
    const Z = new Float32Array(HW * HH), NX = new Float32Array(HW * HH), NY = new Float32Array(HW * HH), S = new Int16Array(HW * HH).fill(-1);
    return {
      save: () => ({ x, y, ang, speed, t, wait, awake, mouth, path: path.map((q) => [...q]) }),
      load(st) {
        ({ x, y, ang, speed, t, wait, awake, mouth } = st);
        path.length = 0;
        for (const q of st.path) path.push([...q]);
      },
      anim(dt) { t += dt; },
      update(dt, play) {
        if (!awake) {
          if (def.flag && !play.flags[def.flag]) return;
          if ((wait -= dt) > 0) return;
          awake = true;
          play.sfx('roar');
          play.shake(0.6);
          if (def.say) play.say(def.say, 2.5);
        }
        const p = play.player, ease = play.ease || 1;
        const want = Math.atan2(p.cy - y, p.cx - x), turn = (def.turn ?? 2.4) * dt;
        ang += clamp(wrapAngle(want - ang), -turn, turn);
        speed = approach(speed, (def.speed ?? 88) / ease, 70 * dt);
        const a = ang + Math.sin(t * 2.6) * 0.4;
        x += Math.cos(a) * speed * dt;
        y += Math.sin(a) * speed * dt;
        const h = path[0];
        if (Math.hypot(x - h[0], y - h[1]) >= 2) {
          path.unshift([x, y]);
          path.length = Math.min(path.length, N * GAP / 2 + 3);
        }
        const near = Math.hypot(p.cx - x, p.cy - y);
        mouth = approach(mouth, near < 110 ? 1 : 0.15, dt * 3);
        for (let i = 0; i < N; i += 2) {
          const [sx, sy] = seg(i);
          if (Math.hypot(p.cx - sx, p.cy - sy) < rad[i] * 0.7 + 3) return play.kill();
        }
      },
      lights() {
        if (!awake) return [];
        const out = [{ x, y, r: 6 * CW, color: '#ff4040', i: 0.7 }];
        for (let i = 8; i < N - 6; i += 9) { const [sx, sy] = seg(i); out.push({ x: sx, y: sy, r: 3 * CW, color: '#5fffd0', i: 0.6, shadow: false }); }
        return out;
      },
      front(screen) {
        if (!awake && x < -R * 2) return;
        let bx0 = HW, bx1 = 0, by0 = HH, by1 = 0;
        for (let i = N - 1; i >= 0; i--) {
          const [sx, sy] = seg(i), r = rad[i];
          const x0 = Math.max(0, Math.floor((sx - r) / HX)), x1 = Math.min(HW - 1, Math.floor((sx + r) / HX));
          const y0 = Math.max(0, Math.floor((sy - r) / HY)), y1 = Math.min(HH - 1, Math.floor((sy + r) / HY));
          if (x0 > x1 || y0 > y1) continue;
          bx0 = Math.min(bx0, x0); bx1 = Math.max(bx1, x1); by0 = Math.min(by0, y0); by1 = Math.max(by1, y1);
          for (let hy = y0; hy <= y1; hy++) {
            for (let hx = x0; hx <= x1; hx++) {
              const k = hy * HW + hx;
              const nx = (hx * HX + HX / 2 - sx) / r, ny = (hy * HY + HY / 2 - sy) / r, d2 = nx * nx + ny * ny;
              if (d2 >= 1) continue;
              const z = Math.sqrt(1 - d2) * r + (N - i) * 0.35;
              if (S[k] >= 0 && Z[k] >= z) continue;
              Z[k] = z; NX[k] = nx; NY[k] = ny; S[k] = i;
            }
          }
        }
        for (let hy = by0; hy <= by1; hy++) {
          for (let hx = bx0; hx <= bx1; hx++) {
            const k = hy * HW + hx, i = S[k];
            if (i < 0) continue;
            S[k] = -1;
            const nx = NX[k], ny = NY[k], nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
            const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz), spec = Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), 26);
            const scale = Math.abs(frac(i * 0.5 + ny * 1.2 + Math.abs(nx) * 0.6) - 0.5) * 2;
            const b = clamp((0.1 + diff * 0.8) * (0.78 + 0.22 * scale) + spec * 0.9);
            const ch = spec > 0.55 ? '@' : FINE[Math.round(b * (FINE.length - 1))];
            put(screen, ch, hx * HX, hy * HY, ny > 0.45 ? pick(bellyG, b) : pick(bodyG, b), 2, 1);
          }
        }
        // Spines along the back and glowing spots along the flank.
        for (let i = 3; i < N - 4; i++) {
          const [ax, ay] = seg(i - 1), [bx, by] = seg(i + 1), [sx, sy] = seg(i);
          let ux = ax - bx, uy = ay - by;
          const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
          let nx = uy, ny = -ux;
          if (ny > 0) { nx = -nx; ny = -ny; }
          if (i % 3 === 0 && i < N * 0.75) putAt(screen, ny < -0.6 ? '^' : nx < 0 ? '<' : '>', sx + nx * rad[i] * 1.12, sy + ny * rad[i] * 1.12, '#9fe8c0', 2, 0.9);
          if (i % 9 === 8) putAt(screen, 'o', sx - nx * rad[i] * 0.4, sy - ny * rad[i] * 0.4, '#5fffd0', 2, 0.6 + 0.4 * Math.sin(t * 5 + i));
        }
        // The head: an eye, and a jaw full of teeth that opens as it closes in.
        const [hx0, hy0] = seg(0), [hx1, hy1] = seg(2);
        let ux = hx0 - hx1, uy = hy0 - hy1;
        const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        let nx = uy, ny = -ux;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const r0 = rad[0], fa = Math.atan2(uy, ux);
        for (let k = -4; k <= 4; k++) {
          if (k === 0) continue;
          const a = fa + k * 0.13, upper = (k < 0) === (ux >= 0), open = mouth * 7 * (upper ? 1 : -1);
          const tx = hx0 + Math.cos(a) * r0 * 0.95 + nx * open, ty = hy0 + Math.sin(a) * r0 * 0.95 + ny * open;
          putAt(screen, upper ? 'V' : 'A', tx, ty, '#fff4dc', 2, 1, true);
        }
        const ex = hx0 + ux * r0 * 0.3 + nx * r0 * 0.42, ey = hy0 + uy * r0 * 0.3 + ny * r0 * 0.42;
        putAt(screen, '@', ex, ey, '#ff3344', 1, 1, true);
        putAt(screen, '.', ex + ux * 2, ey - 3, '#ffffff', 2, 1);
        done(screen);
      },
    };
  });

  // ---------------------------------------------------------------- magma
  registerFx('magma', (def, play) => {
    const base = def.base ?? HH - 1;
    const vents = (def.vents ?? []).map((v) => ({ x0: v.x * 2, x1: (v.x + v.w) * 2, period: v.period ?? 4, on: v.on ?? 1.5, warn: v.warn ?? 1, phase: v.phase ?? 0, heat: 0, was: 0 }));
    const pools = def.pools ?? [];
    const heat = new Float32Array(HW * HH);
    const g = gradient(['#120000', '#5a0505', '#b31d06', '#ff6a10', '#ffb43a', '#fff0a0', '#ffffff'], 16);
    let t = 0, acc = 0;
    const tick = (m) => {
      for (const v of vents) {
        const u = frac((t + v.phase) / v.period) * v.period;
        const state = u < v.on ? 2 : u > v.period - v.warn ? 1 : 0;
        if (state === 2 && v.was !== 2) { play.sfx('rumble', (v.x0 + v.x1) / 4 * CW); play.shake(0.2); }
        v.was = state;
        v.heat = state === 2 ? 1 : state === 1 ? 0.28 + Math.random() * 0.12 : 0;
        for (let hx = v.x0; hx < v.x1; hx++) heat[base * HW + hx] = v.heat * (0.75 + Math.random() * 0.25);
      }
      for (const [a, b] of pools) for (let hx = a * 2; hx < b * 2; hx++) heat[base * HW + hx] = 0.3 + Math.random() * 0.25;
      const decay = def.decay ?? 0.075;
      for (let hy = 0; hy < base; hy++) {
        for (let hx = 0; hx < HW; hx++) {
          const sx = Math.min(HW - 1, Math.max(0, hx + ((Math.random() * 3) | 0) - 1));
          const k = hy * HW + hx;
          heat[k] = free(m, hx, hy) ? Math.max(0, heat[(hy + 1) * HW + sx] - Math.random() * decay) : 0;
        }
      }
    };
    const at = (x, y) => {
      const hx = Math.floor(x / HX), hy = Math.floor(y / HY);
      return hx < 0 || hx >= HW || hy < 0 || hy >= HH ? 0 : heat[hy * HW + hx];
    };
    return {
      save: () => ({ heat: heat.slice(), t, acc, vents: vents.map((v) => [v.heat, v.was]) }),
      load(st) {
        heat.set(st.heat);
        ({ t, acc } = st);
        vents.forEach((v, i) => { [v.heat, v.was] = st.vents[i]; });
      },
      anim(dt) {
        t += dt;
        acc = Math.min(acc + dt, 0.2);
        const m = solids(play.level);
        while (acc >= 1 / 40) { tick(m); acc -= 1 / 40; }
      },
      update(dt, play) {
        const p = play.player, lethal = def.lethal ?? 0.4;
        if (at(p.cx, p.cy) > lethal || at(p.cx, p.y + 13) > lethal || at(p.cx, p.y + 2) > lethal) play.kill();
      },
      lights() {
        const out = [];
        for (const v of vents) if (v.heat > 0) out.push({ x: (v.x0 + v.x1) / 2 * HX, y: (base - 6 * v.heat) * HY, r: (4 + 9 * v.heat) * CW, color: '#ff7a2a', i: 0.5 + 0.6 * v.heat });
        return out;
      },
      back(screen) {
        const m = solids(play.level);
        for (let hy = 0; hy <= base; hy++) {
          for (let hx = 0; hx < HW; hx++) {
            const v = heat[hy * HW + hx];
            if (v < 0.06 || !free(m, hx, hy)) continue;
            put(screen, FIRE[Math.round(clamp(v) * (FIRE.length - 1))], hx * HX, hy * HY, pick(g, v), 2, clamp(v * 2.5));
          }
        }
        done(screen);
      },
    };
  });

  // ---------------------------------------------------------------- eye
  registerFx('eye', (def, play) => {
    const R = def.radius ?? 64, passive = !!def.passive;
    const home = { x: (def.at[0] + 0.5) * CW, y: (def.at[1] + 0.5) * CH };
    const scl = gradient(def.sclera ?? ['#160a0c', '#6a5550', '#cbbfb2', '#fff8ee'], 12);
    const iris = gradient(def.iris ?? ['#100600', '#6b2c00', '#d97a00', '#ffcc3d', '#fff6c0'], 12);
    const lid = gradient(['#12040a', '#4a1a22', '#8a4040', '#d08878'], 10);
    const rage = gradient(['#300008', '#ff2040', '#ffd0d8'], 8), nodeG = gradient(['#ff2a50', '#ffd6de'], 6);
    const Lx = -0.42, Ly = -0.62, Lz = 0.66, Hn = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / Hn, Hy = Ly / Hn, Hz = (Lz + 1) / Hn;
    const nodes = (def.nodes ?? []).map(([x, y]) => ({ x: (x + 0.5) * CW, y: (y + 0.5) * CH, alive: true }));
    const gaps = def.gaps ?? [2.4, 1.9, 1.4];
    let t = 0, gx = 0, gy = 0, gz = 1, blink = 0, nextBlink = 2 + Math.random() * 3, blinking = 0;
    let state = passive ? 'watch' : 'idle', timer = def.first ?? 3, hits = 0, aim = null, end = null, tremble = 0, pupil = 0.92;
    let cx = home.x, cy = home.y;
    const cells = [];

    const look = (tx, ty, rate, dt) => {
      let x = tx - cx, y = ty - cy, z = R * 4.2;
      const n = Math.hypot(x, y, z);
      x /= n; y /= n; z /= n;
      // Never roll so far that the iris slides off the visible ball.
      const side = Math.hypot(x, y);
      if (side > 0.6) { x *= 0.6 / side; y *= 0.6 / side; z = 0.8; }
      const k = Math.min(1, rate * dt);
      gx += (x - gx) * k; gy += (y - gy) * k; gz += (z - gz) * k;
      const m = Math.hypot(gx, gy, gz); gx /= m; gy /= m; gz /= m;
    };
    const cast = (m, dx, dy) => {
      let x = cx + dx * R * 0.9, y = cy + dy * R * 0.9;
      for (let i = 0; i < 300; i++) {
        x += dx * 3; y += dy * 3;
        if (x < 0 || x > MAP_W || y < 0 || y > MAP_H || blockedAt(m, x, y, 1)) break;
      }
      return { x, y };
    };
    const segDist = (px, py, ax, ay, bx, by) => {
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy, u = clamp(((px - ax) * vx + (py - ay) * vy) / l2);
      return Math.hypot(px - ax - vx * u, py - ay - vy * u);
    };
    const nerve = (n, s) => {
      // A sagging curve from the eye to a node; s from 0 (eye) to 1 (node).
      const mx = (cx + n.x) / 2, my = (cy + n.y) / 2 + 50, u = 1 - s;
      return [u * u * cx + 2 * u * s * mx + s * s * n.x, u * u * cy + 2 * u * s * my + s * s * n.y];
    };
    const explode = (play) => {
      const list = play.particles.list;
      for (const c of cells) {
        if (Math.random() > 0.55) continue;
        const dx = c.x - cx, dy = c.y - cy, d = Math.hypot(dx, dy) || 1, v = 60 + Math.random() * 260;
        const life = 0.8 + Math.random() * 1.4;
        list.push({ ch: c.ch, x: c.x, y: c.y, vx: dx / d * v, vy: dy / d * v - 60, g: 260, life, max: life, color: c.color });
      }
      play.sfx('die', cx); play.sfx('roar', cx);
      play.shake(1); play.flash = 0.35; play.glitch = 0.5;
      if (def.exit) play.level.group(def.exit).visible = true;
      if (def.say) play.say(def.say, 4);
    };

    return {
      save: () => ({
        t, gx, gy, gz, blink, nextBlink, blinking, state, timer, hits, tremble, pupil, cx, cy,
        aim: aim && { ...aim }, end: end && { ...end }, alive: nodes.map((n) => n.alive),
      }),
      load(st) {
        ({ t, gx, gy, gz, blink, nextBlink, blinking, state, timer, hits, tremble, pupil, cx, cy } = st);
        aim = st.aim && { ...st.aim };
        end = st.end && { ...st.end };
        nodes.forEach((n, i) => { n.alive = st.alive[i]; });
      },
      anim(dt, play) {
        t += dt;
        tremble = Math.max(0, tremble - dt);
        // Blinks: now and then, or in a flurry when hurt.
        if (state === 'hurt' || state === 'dying') blink = 0.5 + 0.5 * Math.sin(t * 30);
        else {
          if ((nextBlink -= dt) <= 0) { blinking = 0.22; nextBlink = 2.5 + Math.random() * 4; }
          blinking = Math.max(0, blinking - dt);
          blink = blinking > 0 ? Math.sin((1 - blinking / 0.22) * Math.PI) : approach(blink, state === 'gone' ? 1 : 0, dt * 4);
        }
        if (passive || state === 'idle') look(play.player.cx, play.player.cy, 3, dt);
      },
      update(dt, play) {
        if (passive) return;
        const p = play.player, m = solids(play.level);
        for (const n of nodes) {
          if (!n.alive || state === 'dying' || state === 'gone' || Math.hypot(p.cx - n.x, p.cy - n.y) > 13) continue;
          n.alive = false;
          hits++;
          play.particles.burst(n.x, n.y, '*+x.', 18, 180, '#ff4060', { life: 0.7 });
          play.sfx('glitch', n.x); play.sfx('roar', cx);
          play.shake(0.45); play.glitch = 0.3; play.flash = 0.12;
          tremble = 1;
          state = hits >= nodes.length ? 'dying' : 'hurt';
          timer = state === 'dying' ? 2.2 : 1;
          aim = null;
        }
        timer -= dt;
        const ease = play.ease || 1;
        if (state === 'idle') { if (timer <= 0) { state = 'watch'; timer = gaps[0] * ease; } }
        else if (state === 'watch') {
          look(p.cx, p.cy, 4, dt);
          pupil = approach(pupil, 0.9, dt);
          if (timer <= 0) { state = 'charge'; timer = 1.05 * ease; play.sfx('charge', cx); }
        } else if (state === 'charge') {
          if (timer > 0.38 * ease) look(p.cx, p.cy, 9, dt);
          else if (!aim) { aim = { x: gx, y: gy }; const l = Math.hypot(aim.x, aim.y) || 1; aim.x /= l; aim.y /= l; }
          pupil = approach(pupil, 0.975, dt * 0.4);
          if (timer <= 0) { state = 'fire'; timer = 0.5; play.sfx('beam', cx); play.shake(0.35); }
        } else if (state === 'fire') {
          end = cast(m, aim.x, aim.y);
          const sx = cx + aim.x * R * 0.9, sy = cy + aim.y * R * 0.9;
          if (segDist(p.cx, p.cy, sx, sy, end.x, end.y) < 9) play.kill();
          if (Math.random() < 0.6) play.particles.burst(end.x, end.y, "*'.", 2, 140, '#ffb0c0', { life: 0.35 });
          if (timer <= 0) { state = 'watch'; timer = (gaps[Math.min(hits, gaps.length - 1)] ?? 1.4) * ease; aim = null; }
        } else if (state === 'hurt') {
          look(cx + Math.sin(t * 17) * 200, cy + Math.cos(t * 13) * 120, 12, dt);
          pupil = approach(pupil, 0.8, dt * 2);
          if (timer <= 0) { state = 'watch'; timer = gaps[Math.min(hits, gaps.length - 1)] * ease; }
        } else if (state === 'dying') {
          tremble = 1;
          look(cx + Math.sin(t * 23) * 300, cy + Math.cos(t * 19) * 200, 14, dt);
          if (timer <= 0) { state = 'gone'; explode(play); }
        }
        cx = home.x + (tremble ? (Math.random() - 0.5) * 6 * tremble : 0);
        cy = home.y + (tremble ? (Math.random() - 0.5) * 4 * tremble : 0);
      },
      lights() {
        if (state === 'gone') return [];
        const hot = state === 'charge' ? 1 - timer : state === 'fire' ? 1.2 : 0;
        const out = [{ x: cx + gx * R * 0.9, y: cy + gy * R * 0.9, r: R * (passive ? 1.2 : 2.6) + hot * 60, color: hot ? '#ff3050' : '#ffb347', i: passive ? 0.25 : 0.7 + hot * 0.5, shadow: false }];
        if (state === 'fire' && end) {
          for (let s = 0; s <= 1; s += 0.2) out.push({ x: mix(cx, end.x, s), y: mix(cy, end.y, s), r: 7 * CW, color: '#ff2040', i: 1, shadow: false });
        }
        for (const n of nodes) if (n.alive) out.push({ x: n.x, y: n.y, r: 4 * CW, color: '#ff3355', i: 0.6 + 0.3 * Math.sin(t * 6) });
        return out;
      },
      [def.layer === 'front' ? 'front' : 'back'](screen) {
        if (state === 'gone') return drawNodes(screen);
        cells.length = 0;
        // A frame around the gaze, to read the iris in polar coordinates.
        let e1x = gz, e1y = 0, e1z = -gx;
        const e1l = Math.hypot(e1x, e1y, e1z) || 1; e1x /= e1l; e1y /= e1l; e1z /= e1l;
        const e2x = gy * e1z - gz * e1y, e2y = gz * e1x - gx * e1z, e2z = gx * e1y - gy * e1x;
        const cosIris = 0.74, cosPupil = state === 'charge' || state === 'fire' ? pupil : 0.93 - (1 - pupil) * 0.2;
        const hot = state === 'charge' ? clamp(1 - timer) : state === 'fire' ? 1 : 0;
        const dim = passive ? 0.55 : 1, open = 1 - blink;
        const x0 = Math.floor((cx - R * 1.12) / HX), x1 = Math.ceil((cx + R * 1.12) / HX);
        const y0 = Math.floor((cy - R * 1.12) / HY), y1 = Math.ceil((cy + R * 1.12) / HY);
        for (let hy = Math.max(0, y0); hy <= Math.min(HH - 1, y1); hy++) {
          for (let hx = Math.max(0, x0); hx <= Math.min(HW - 1, x1); hx++) {
            const x = hx * HX + HX / 2, y = hy * HY + HY / 2, nx = (x - cx) / R, ny = (y - cy) / R, d2 = nx * nx + ny * ny;
            let ch, color, alpha = dim;
            if (d2 >= 1) {
              // The socket: a dark rim of flesh around the ball.
              if (d2 > 1.25) continue;
              const v = 0.15 + 0.2 * noise(hx * 0.5, hy * 0.5 + t * 0.3);
              ch = SHADE[Math.round(v * 9)]; color = pick(lid, v);
            } else {
              const nz = Math.sqrt(1 - d2), wide = Math.sqrt(Math.max(0, 1 - nx * nx));
              const top = -wide * open * 0.74, bottom = wide * open * 0.6;
              const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
              if (ny < top || ny > bottom) {
                // Eyelid: skin with folds, lashes along the upper edge.
                const edge = ny < top ? top - ny : ny - bottom;
                let b = 0.08 + diff * 0.55 + 0.08 * Math.sin(ny * 26 + nx * 3);
                if (edge < HY / R * 1.1 && open > 0.05) {
                  // The rim of the lid, following the almond's curve.
                  const slope = (ny < top ? -1 : 1) * -nx / Math.max(0.2, wide) * open;
                  ch = Math.abs(nx) > 0.9 ? (nx < 0 ? '<' : '>') : flow(Math.atan(slope * 0.9));
                  color = '#e8a090';
                  put(screen, ch, hx * HX, hy * HY, color, 2, dim, true);
                  cells.push({ x, y, ch, color });
                  continue;
                }
                b = clamp(b); ch = FINE[Math.round(b * (FINE.length - 1))]; color = pick(lid, b);
              } else {
                const c = nx * gx + ny * gy + nz * gz;
                const spec = Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), 30);
                if (spec > 0.6) { ch = '@'; color = '#ffffff'; }
                else if (c > cosPupil) { ch = hot ? '.' : ' '; color = '#ff2040'; alpha = hot * 0.8; }
                else if (c > cosIris) {
                  const ux = nx - gx * c, uy = ny - gy * c, uz = nz - gz * c;
                  const phi = Math.atan2(ux * e2x + uy * e2y + uz * e2z, ux * e1x + uy * e1y + uz * e1z);
                  const rho = (1 - c) / (1 - cosIris);
                  const stri = 0.5 + 0.5 * Math.sin(phi * 23 + noise(phi * 3 + 10, rho * 4) * 7);
                  let b = 0.45 + 0.4 * stri * (1 - rho * 0.35) + diff * 0.2;
                  if (rho > 0.82) b *= 0.45;
                  if (rho < 0.35) b += 0.15;
                  b = clamp(b + hot * 0.3);
                  ch = FINE[Math.round(b * (FINE.length - 1))];
                  color = hot ? pick(rage, b) : pick(iris, b);
                } else {
                  let b = clamp(0.3 + diff * 0.8 - (1 - nz) * 0.2);
                  const vn = noise(nx * 5 + 20, ny * 5 + t * 0.05), anger = hits / 3 + hot * 0.5;
                  if (d2 > 0.2 && Math.abs(vn - 0.5) < 0.022 + anger * 0.03) { ch = Math.abs(nx) > Math.abs(ny) ? '~' : 's'; color = '#c0182a'; }
                  else { ch = ' .:-=+*'[Math.round(b * 6)]; color = pick(scl, 0.3 + b * 0.7); }
                }
              }
            }
            put(screen, ch, hx * HX, hy * HY, color, 2, alpha);
            if (ch !== ' ') cells.push({ x, y, ch, color });
          }
        }
        // The beam and its warning.
        if (state === 'charge' && aim) {
          const e = cast(solids(play.level), aim.x, aim.y), len = Math.hypot(e.x - cx, e.y - cy);
          for (let s = R; s < len; s += 8) if (Math.sin(t * 40) > -0.2) putAt(screen, '+', cx + aim.x * s, cy + aim.y * s, '#ff3355', 2, 0.7);
        } else if (state === 'charge') {
          const l = Math.hypot(gx, gy) || 1;
          for (let s = R; s < R + 200 * clamp(1.1 - timer); s += 10) putAt(screen, '.', cx + gx / l * s, cy + gy / l * s, '#ff8090', 2, 0.5);
        }
        if (state === 'fire' && end) {
          const a = Math.atan2(aim.y, aim.x), ch = flow(a), px = -aim.y, py = aim.x, len = Math.hypot(end.x - cx, end.y - cy);
          for (let s = R * 0.9; s < len; s += 4) {
            const bx = cx + aim.x * s, by = cy + aim.y * s, j = Math.random();
            putAt(screen, j > 0.5 ? '#' : '=', bx, by, '#ffffff', 2, 1, true);
            putAt(screen, ch, bx + px * 6, by + py * 6, '#ff3355', 2, 0.8);
            putAt(screen, ch, bx - px * 6, by - py * 6, '#ff3355', 2, 0.8);
            if (j > 0.7) putAt(screen, '.', bx + px * 11 * (j - 0.85) * 6, by + py * 11 * (j - 0.85) * 6, '#ff99aa', 2, 0.6);
          }
        }
        drawNodes(screen);
        done(screen);
      },
    };

    function drawNodes(screen) {
      for (const [k, n] of nodes.entries()) {
        if (!n.alive) { putAt(screen, 'x', n.x, n.y, '#5a3a3a', 1, 0.8); continue; }
        if (state !== 'gone') {
          const pulse = frac(t * 0.7 + k * 0.33);
          for (let s = 0.04; s < 1; s += 0.02) {
            const [x, y] = nerve(n, s), [x2, y2] = nerve(n, s + 0.01);
            const near = Math.abs(s - (1 - pulse)) < 0.05;
            putAt(screen, near ? '*' : flow(Math.atan2(y2 - y, x2 - x)), x, y, near ? '#ffd0d8' : '#7a1426', 2, near ? 1 : 0.8);
          }
        }
        const glow = 0.5 + 0.5 * Math.sin(t * 6 + k);
        const c = pick(nodeG, glow);
        const art = ['\\|/', '-O-', '/|\\'];
        art.forEach((row, ry) => [...row].forEach((ch, rx) => putAt(screen, ch, n.x + (rx - 1) * HX * 1.2, n.y + (ry - 1) * HY, c, 2, 1, ry === 1 && rx === 1)));
      }
      done(screen);
    }
  });
}
