// Checks every level of every pack in the manifest: it must load, have a start and a way out,
// name only traps, triggers and mechanisms that exist, and survive a few seconds of play
// without an error. Every track is read too: its notes must be notes, its bars whole, its
// drums in the kit. Fast enough for CI; tools/solve.mjs is the deeper check.
//
//   node tools/check.mjs

import { loadWorlds, makePlay, step } from './sim/env.mjs';
import { actions, triggers } from '../assets/js/game/events.js';
import { mechanisms } from '../assets/js/game/mechanisms.js';
import { fxTypes } from '../assets/js/game/fx.js';
import { tileOf } from '../assets/js/game/tiles.js';
import { compile, midi } from '../assets/js/core/music.js';
import { kits, kitLetters, sounds } from '../assets/js/core/audio.js';
import { TITLE, ENDING } from '../assets/js/core/themes.js';

const problems = [];
const worlds = await loadWorlds();
let count = 0;

// A track's mistakes, in words: what the reader in music.js trips on, plus the things only
// the synth would notice (a drum the kit doesn't have, a setting it has never heard of).
const TRACK = new Set(['bpm', 'div', 'bar', 'swing', 'seq', 'loop', 'kit', 'win', 'space', 'echo', 'voices']);
const VOICE = new Set(['wave', 'width', 'v', 'notes', 'drums', 'kit', 'cut', 'res', 'env', 'sweep', 'detune', 'vib', 'glide', 'tr', 'gate', 'pan', 'echo', 'space', 'layer']);
const WAVES = new Set(['sine', 'triangle', 'square', 'sawtooth', 'pulse']);
function checkTrack(track, say) {
  if (!(track?.bpm > 0) || !Array.isArray(track.voices)) return say('needs a bpm and voices');
  for (const k of Object.keys(track)) if (!TRACK.has(k)) say(`unknown setting "${k}"`);
  const song = compile(track);
  for (const p of song.problems) say(p);
  for (const tok of String(track.win ?? '').split(/\s+/).filter(Boolean)) if (midi(tok) === null) say(`win: "${tok}" is not a note`);
  if (typeof track.kit === 'string' && !kits.has(track.kit)) say(`unknown kit "${track.kit}"`);
  song.voices.forEach((v, i) => {
    const who = `voice ${i + 1}`, def = v.def;
    for (const k of Object.keys(def)) if (!VOICE.has(k)) say(`${who}: unknown setting "${k}"`);
    if (!(def.v > 0)) say(`${who} has no volume ("v")`);
    if (v.drums) {
      const kit = kitLetters(def.kit ?? track.kit);
      const hits = new Set([v.free, ...Object.values(v.parts)].flatMap((part) => (part ?? []).flatMap((ev) => [...(ev?.hits ?? '')])));
      for (const ch of hits) if (!kit.has(ch)) say(`${who}: the kit has no "${ch}"`);
    } else if (def.wave !== undefined && !WAVES.has(def.wave) && !(Array.isArray(def.wave) && def.wave.every((n) => typeof n === 'number'))) {
      say(`${who}: unknown wave ${JSON.stringify(def.wave)}`);
    }
    if (def.env && def.env.length !== 4) say(`${who}: env takes [attack, decay, sustain, release]`);
  });
}
checkTrack(TITLE, (msg) => problems.push(`title theme: ${msg}`));
checkTrack(ENDING, (msg) => problems.push(`ending theme: ${msg}`));

for (const w of worlds) {
  if (w.music) checkTrack(w.music, (msg) => problems.push(`${w.id} music: ${msg}`));
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
        if (name === 'sfx' && !sounds.has(s.sfx)) say(`unknown sound "${s.sfx}"`);
        if (['show', 'hide', 'wobble', 'fall', 'move', 'orbit', 'stop', 'swap', 'chase', 'collapse', 'typewrite'].includes(name) && !groups.has(s[name])) {
          say(`"${name}" names group "${s[name]}", which isn't on the map`);
        }
      }
    }
    // Logic that loads fine but can never happen: a trap that never fires, a door that never shows.
    const zones = new Set([...(lv.marks ?? []).join('').match(/[A-Z]/g) ?? [], ...Object.keys(lv.fields ?? {})]);
    const setFlags = new Set(), usedFlags = new Set(), shown = new Set();
    const zoneOf = (v) => typeof v === 'string' && !zones.has(v) && say(`zone "${v}" isn't on the map`);
    // An event only ever set off by { "fire": id } may hold itself back with a flag nobody sets.
    const fired = new Set((lv.events ?? []).flatMap((e) => (e.do ?? []).map((st) => st.fire).filter(Boolean)));
    for (const e of lv.events ?? []) {
      zoneOf(e.when?.zone);
      if (e.when?.flag && !fired.has(e.id)) usedFlags.add(e.when.flag);
      for (const st of e.do ?? []) {
        if (st.flag) setFlags.add(st.flag);
        if (st.fill) zoneOf(st.fill);
        if (st.field && !(lv.fields ?? {})[st.field]) say(`field "${st.field}" doesn't exist`);
        for (const k of ['show', 'typewrite']) if (st[k]) shown.add(st[k]);
      }
    }
    for (const f of [...(w.fx ?? []), ...(lv.fx ?? [])]) {
      if (f.flag) usedFlags.add(f.flag);
      if (f.exit) shown.add(f.exit);
    }
    for (const f of usedFlags) if (!setFlags.has(f)) say(`flag "${f}" is checked but never set`);
    const signs = (lv.map.join('').match(/\?/g) ?? []).length;
    if (signs > (lv.signs ?? []).length) say(`${signs} signs on the map, ${(lv.signs ?? []).length} texts`);
    for (const g of lv.hidden ?? '') {
      if (shown.has(g)) continue;
      const exitInside = (lv.marks ?? []).some((row, y) => [...row].some((ch, x) => ch === g && tileOf(lv.map[y]?.[x])?.exit))
        || (lv.words ?? []).some((x) => x.group === g && Object.values(x.text).join('').includes('>'));
      say(exitInside ? `the exit is in hidden group "${g}", which nothing shows` : `hidden group "${g}" is never shown`);
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
console.log(`ok: ${count} levels and ${worlds.filter((w) => w.music).length + 2} tracks in ${worlds.length} worlds`);
