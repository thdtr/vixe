import { blend, rgb } from '../art/color.js';

// The twelve colors a world names (see docs/packs.md), plus the tones the renderer derives
// from them: lit tops, receding undersides, shadow under ledges. A palette may set any of
// these itself.
const cache = new WeakMap();
const luma = (c) => { const [r, g, b] = rgb(c); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

export function tones(pal) {
  let t = cache.get(pal);
  if (!t) {
    t = {
      wallLit: pal.wallLit ?? pal.wall,
      wallSide: pal.wallSide ?? blend(pal.wall, pal.bg, 0.22),
      wallUnder: pal.wallUnder ?? blend(pal.wall, pal.bg, 0.5),
      shadow: pal.shadow ?? blend(pal.bg, '#000000', 0.55),
      glint: pal.glint ?? blend(pal.hazard, '#ffffff', 0.55),
      ghost: blend(pal.player, pal.bg, 0.7),
      // On a light page a shadow is a smudge, not a hole.
      shade: luma(pal.bg) > 0.5 ? 0.35 : 1,
    };
    cache.set(pal, t);
  }
  return t;
}
