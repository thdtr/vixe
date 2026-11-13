// Formats world files the way they're written by hand: maps one row per line, short
// things on one line, long things broken up. Run after editing a world with a script:
//
//   node tools/format.mjs assets/packs/base/w1.json [more files...]

import { readFileSync, writeFileSync } from 'node:fs';

const WIDTH = 180;
const ROWS = new Set(['map', 'marks']);

const inline = (v) => JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']').replace(/\{ /g, '{').replace(/ \}/g, '}');

function fmt(v, pad, key) {
  const inner = pad + '  ';
  if (Array.isArray(v) && ROWS.has(key)) return `[\n${v.map((r) => inner + JSON.stringify(r)).join(',\n')}\n${pad}]`;
  const one = inline(v);
  if (v === null || typeof v !== 'object' || pad.length + one.length + (key ? key.length + 4 : 0) <= WIDTH && key !== 'levels' && key !== 'palette') return one;
  if (key === 'palette') {
    const entries = Object.entries(v).map(([k, c]) => `${JSON.stringify(k)}: ${JSON.stringify(c)}`), lines = [];
    for (let i = 0; i < entries.length; i += 4) lines.push(inner + entries.slice(i, i + 4).join(', '));
    return `{\n${lines.join(',\n')}\n${pad}}`;
  }
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + fmt(x, inner)).join(',\n')}\n${pad}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner, k)}`).join(',\n')}\n${pad}}`;
}

export const format = (data) => fmt(data, '') + '\n';

for (const file of process.argv.slice(2)) {
  writeFileSync(file, format(JSON.parse(readFileSync(file, 'utf8'))));
}
