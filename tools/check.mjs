// Checks every level of every pack in the manifest: it must load, have a start and a way out,
// name only traps, triggers and mechanisms that exist, and survive a few seconds of play
// without an error. Fast enough for CI; tools/solve.mjs is the deeper check.
//
//   node tools/check.mjs

import { loadWorlds, makePlay, step } from './sim/env.mjs';
import { actions, triggers } from '../assets/js/game/events.js';
import { mechanisms } from '../assets/js/game/mechanisms.js';
import { fxTypes } from '../assets/js/game/fx.js';
import { tileOf } from '../assets/js/game/tiles.js';

const problems = [];
const worlds = await loadWorlds();
let count = 0;

for (const w of worlds) {
  for (const [ix, lv] of w.levels.entries()) {
    const id = `${w.id}.${ix + 1}`, say = (msg) => problems.push(`${id} ${lv.name?.en ?? ''}: ${msg}`);
    count++;
    if (lv.map.length > 18 || lv.map.some((r) => [...r].length > 64)) say('map is larger than 64x18');
    if (lv.map.join('').split('@').length !== 2) say('needs exactly one @');
    const words = (lv.words ?? []).map((x) => Object.values(x.text).join('')).join('');
    if (![...lv.map.join('') + words].some((ch) => tileOf(ch)?.exit)) say('has no exit');
    const groups = new Set((lv.marks ?? []).join('').match(/[a-z]/g) ?? []);
    for (const x of lv.words ?? []) if (x.group) groups.add(x.group);
    for (const e of lv.events ?? []) {
      for (const k of Object.keys(e.when ?? {})) if (!triggers[k]) say(`unknown trigger "${k}"`);
      for (const s of e.do ?? []) {
        const name = Object.keys(s)[0];
        if (!actions[name]) say(`unknown action "${name}"`);
        if (['show', 'hide', 'wobble', 'fall', 'move', 'orbit', 'stop', 'swap', 'chase', 'collapse', 'typewrite'].includes(name) && !groups.has(s[name])) {
          say(`"${name}" names group "${s[name]}", which isn't on the map`);
        }
      }
    }
    for (const name of Object.keys(lv.mechs ?? {})) {
      if (!mechanisms[name]) { say(`unknown mechanism "${name}"`); continue; }
      for (const o of Object.keys(lv.mechs[name])) if (!(o in mechanisms[name].options)) say(`mechanism "${name}" has no option "${o}"`);
    }
    for (const f of [...(w.fx ?? []), ...(lv.fx ?? [])]) if (f.type && !fxTypes[f.type]) say(`unknown effect "${f.type}"`);
    try {
      const play = makePlay(w, ix);
      for (let i = 0; i < 360 && play.state === 'play'; i++) step(play, 0, false);
    } catch (err) {
      say(`crashed: ${err.stack.split('\n').slice(0, 3).join(' / ')}`);
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`ok: ${count} levels in ${worlds.length} worlds`);
