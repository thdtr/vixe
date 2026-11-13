import { clamp, mix } from './math.js';

// '#rrggbb' or 'rgb(r,g,b)' -> [r, g, b]
export const rgb = (c) => {
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  return c.match(/\d+/g).slice(0, 3).map(Number);
};
export const hex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

// Blends two colors: blend(a, b, 0) is a, blend(a, b, 1) is b.
const blends = new Map();
export function blend(a, b, t) {
  const key = `${a}${b}${t}`;
  let out = blends.get(key);
  if (!out) {
    const x = rgb(a), y = rgb(b);
    out = hex(mix(x[0], y[0], t), mix(x[1], y[1], t), mix(x[2], y[2], t));
    if (blends.size > 4000) blends.clear();
    blends.set(key, out);
  }
  return out;
}

// n evenly spaced colors through the stops.
export function gradient(stops, n = 12) {
  const cs = stops.map(rgb), out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * (cs.length - 1), k = Math.min(cs.length - 2, Math.floor(t)), f = t - k;
    out.push(hex(...[0, 1, 2].map((j) => mix(cs[k][j], cs[k + 1][j], f))));
  }
  return out;
}

// The color at v (0..1) along a gradient.
export const pick = (list, v) => list[Math.round(clamp(v) * (list.length - 1))];
