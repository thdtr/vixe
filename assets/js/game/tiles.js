// Map characters and what they mean. Packs can add their own with registerTile().
//
//   hazard / exit: hitbox inside the cell as [x, y, w, h]
//   anim: glyph frames cycled over time
//   color: palette role used to draw it

const tiles = {
  '#': { solid: true, wall: true },
  '%': { wall: true },                                   // looks like a wall, isn't one
  '&': { solid: true, hidden: true },                    // solid, invisible until touched
  '=': { solid: true, glyph: '=', color: 'girder' },
  '-': { oneway: true, glyph: '-', color: 'girder' },
  '^': { hazard: [1, 9, 8, 9], glyph: '^', color: 'hazard' },
  'v': { hazard: [1, 0, 8, 9], glyph: 'v', color: 'hazard' },
  '*': { hazard: [1, 3, 8, 12], color: 'hazard', anim: '*x+x' },
  '~': { hazard: [0, 8, 10, 10], color: 'hazard', anim: '~-~^' },
  '>': { exit: [2, 2, 6, 14], glyph: '>' },
  '?': { sign: true, glyph: '?', color: 'accent' },
  '$': { pickup: true, glyph: '$' },
};

// Anything else that isn't blank is a solid letter. Words are floors too.
const TEXT = { solid: true, color: 'text' };

export function tileOf(ch) {
  if (ch === ' ') return null;
  return tiles[ch] || TEXT;
}

export function registerTile(ch, def) {
  tiles[ch] = def;
}
