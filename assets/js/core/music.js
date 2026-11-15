// The music format, read into something the sequencer in audio.js can play. No Web Audio
// here: tools/check.mjs reads every track with this same code, in Node.
//
// The smallest track is a loop:
//
//   { "bpm": 100, "voices": [ { "wave": "triangle", "v": 0.3, "notes": "a1 . c2 - g1 ." } ] }
//
// Each entry in `notes` is one step, a sixteenth note (`div` steps to a beat, 4 by default):
// a note ("a1", "c#4", "bb2"), "." a rest, "-" holds the note before it. Notes joined by "+"
// sound together ("a2+c3+e3"), "!" after a note accents it and "~" plays it softly. `notes`
// may be an array, one bar per entry, which reads better in a world file.
//
// A song has sections. `seq` is the order they play in, and a voice's `notes` becomes an
// object with a pattern for each section it plays in; it rests through the others:
//
//   { "bpm": 100, "seq": "A A B A", "loop": 1, "voices": [
//       { "wave": "triangle", "v": 0.3, "notes": { "A": "a1 . a1 . c2 . a1 .", "B": "f1 . . . g1 . . ." } },
//       { "drums": true, "v": 0.5, "notes": { "A B": "k . h . s . h ." }, "layer": 1 } ] }
//
// A section lasts as long as its longest pattern, and shorter ones loop inside it. A key
// may name several sections ("A B"), and "=A" as a pattern means "the same as A". A voice
// whose `notes` is a plain string loops on its own under every section, at whatever length
// it has: a loop of 37 steps drifts against the bars and never lands the same way twice.
// `loop` is the entry of `seq` the song goes back to when it ends (0 by default), so an
// intro plays once.
//
// A drum voice ("drums": true) takes hits instead of notes, one letter each, several at
// once: "kh" is a kick and a hat. The letters come from the kit (see audio.js).
//
// Everything a voice or a track can set is listed in docs/packs.md.

const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOTE = /^([a-g])([#b]?)(-?\d)$/;
const ACCENT = 1.35, SOFT = 0.55;

// "a4" -> 69. Not a note: null.
export function midi(name) {
  const m = NOTE.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export const hz = (note) => 440 * 2 ** ((note - 69) / 12);

const words = (s) => (Array.isArray(s) ? s.join(' ') : String(s)).trim().split(/\s+/).filter(Boolean);

// One step: null (a rest), 'hold', or { notes | hits, vel }. A token that makes no sense
// is reported and played as a rest.
function token(tok, drums, say) {
  if (tok === '.') return null;
  if (tok === '-') return 'hold';
  let body = tok, vel = 1;
  if (body.endsWith('!')) { vel = ACCENT; body = body.slice(0, -1); }
  else if (body.endsWith('~')) { vel = SOFT; body = body.slice(0, -1); }
  if (drums) {
    if (/^[a-z]+$/.test(body)) return { hits: body, vel };
  } else {
    const notes = body.split('+').map(midi);
    if (notes.every((n) => n !== null)) return { notes, vel };
  }
  say(`"${tok}" is not a ${drums ? 'drum hit' : 'note'}`);
  return null;
}

// A pattern as steps: each is null or a note with `len`, how many steps it lasts. A hold
// reaches around the end of the pattern, since the pattern loops.
function pattern(source, drums, say) {
  const steps = words(source).map((tok, i) => token(tok, drums, (msg) => say(`step ${i + 1}: ${msg}`)));
  const n = steps.length;
  return steps.map((s, i) => {
    if (!s || s === 'hold') return null;
    let len = 1;
    while (len < n && steps[(i + len) % n] === 'hold') len++;
    return { ...s, len };
  });
}

// track -> { stepDur, swing, sections: [{ name, start, len }], length, loopAt, voices, problems }
// where each voice is { def, drums, free (a pattern, or null), parts (section name -> pattern) }.
// Lengths and positions are in steps. `problems` lists what looks like a mistake, in words.
export function compile(track) {
  const problems = [], div = track.div ?? 4, bar = track.bar ?? div * 4;
  const order = track.seq ? words(track.seq) : [];
  const voices = (track.voices ?? []).map((def, i) => {
    const drums = !!def.drums, who = `voice ${i + 1}`;
    const out = { def, drums, free: null, parts: {} };
    const src = def.notes;
    if (src == null) {
      problems.push(`${who} has no notes`);
    } else if (typeof src === 'string' || Array.isArray(src)) {
      out.free = pattern(src, drums, (msg) => problems.push(`${who}, ${msg}`));
      if (!out.free.length) problems.push(`${who} has no notes`);
    } else {
      for (const [key, value] of Object.entries(src)) {
        const alias = typeof value === 'string' && value.startsWith('=') ? value.slice(1).trim() : null;
        for (const name of words(key)) {
          if (!order.includes(name)) problems.push(`${who} has a pattern for "${name}", which isn't in seq`);
          if (alias === null) out.parts[name] = pattern(value, drums, (msg) => problems.push(`${who}, section ${name}, ${msg}`));
        }
      }
      // Aliases last, once everything they may point at is read.
      for (const [key, value] of Object.entries(src)) {
        if (typeof value !== 'string' || !value.startsWith('=')) continue;
        const from = out.parts[value.slice(1).trim()];
        if (!from) { problems.push(`${who}: "${value}" points at a section it has no pattern for`); continue; }
        for (const name of words(key)) out.parts[name] = from;
      }
    }
    return out;
  });

  const lens = {};
  for (const name of new Set(order)) {
    const all = voices.map((v) => v.parts[name]?.length ?? 0);
    lens[name] = Math.max(0, ...all) || bar * 4;
    if (!Math.max(0, ...all)) problems.push(`section "${name}" has no patterns`);
    if (lens[name] % bar) problems.push(`section "${name}" is ${lens[name]} steps long, not a whole number of bars (${bar} steps)`);
    voices.forEach((v, i) => {
      const n = v.parts[name]?.length;
      if (n && lens[name] % n) problems.push(`voice ${i + 1}, section ${name}: ${n} steps don't fit a section of ${lens[name]}`);
    });
  }

  const sections = [];
  let at = 0;
  for (const name of order) {
    sections.push({ name, start: at, len: lens[name] });
    at += lens[name];
  }
  const loop = Math.min(track.loop ?? 0, Math.max(0, sections.length - 1));
  return {
    stepDur: 60 / track.bpm / div, swing: track.swing ?? 0,
    sections, length: at, loopAt: sections[loop]?.start ?? 0, voices, problems,
  };
}

// Where step n of the song falls: { section, at } with `at` counted from the section's
// start. After the first pass the song goes round from loopAt. No sections: null.
export function locate(song, n) {
  if (!song.length) return null;
  let s = n;
  if (s >= song.length) s = song.loopAt + (s - song.length) % (song.length - song.loopAt);
  // Few sections: a walk is as fast as anything cleverer.
  for (const sec of song.sections) if (s < sec.start + sec.len) return { section: sec, at: s - sec.start };
  return null;
}

// What a voice starts playing at step n: { notes | hits, vel, len } or null.
export function eventAt(song, voice, n) {
  if (voice.free) return voice.free[n % voice.free.length];
  const pos = locate(song, n);
  const part = pos && voice.parts[pos.section.name];
  if (!part) return null;
  const ev = part[pos.at % part.length];
  if (!ev) return null;
  // A held note ends with its section, whatever the pattern says.
  const room = pos.section.len - pos.at;
  return ev.len > room ? { ...ev, len: room } : ev;
}
