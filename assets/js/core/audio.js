// Every sound is synthesized on the fly: no audio files to download.

import { compile, eventAt, midi, hz } from './music.js';

// A run of notes up to the door: what winning a level sounds like. Each note is struck like
// a small bell (a triangle with a bright FM partial that fades first) and left to ring under
// the next, and the last one blooms into the whole chord. Beating the level's best time adds
// a flourish: its last two notes again, an octave up, with a sparkle on top.
const STRIKE = 0.075;
function fanfare(freqs) {
  const last = freqs.length - 1, end = last * STRIKE;
  const notes = freqs.flatMap((f, i) => [
    { wave: 'triangle', f: [f, f], d: i < last ? 0.42 : 1.1, v: 0.07, at: i * STRIKE, cut: 5200 },
    { wave: 'sine', f: [f * 2, f * 2], fm: [3.5, 0.8], d: i < last ? 0.22 : 0.6, v: 0.025, at: i * STRIKE, pan: i % 2 ? 0.25 : -0.25 },
  ]);
  // The bloom: every note at once, soft and slow, swelling under the last strike.
  const bloom = freqs.map((f, i) => ({ wave: 'sawtooth', f: [f, f], detune: 9, cut: [900, 2600], a: 0.06, hold: 0.12, d: 0.95, v: 0.016, at: end, pan: (i / Math.max(1, last) - 0.5) * 0.6 }));
  return [...notes, ...bloom, { noise: 9000, type: 'highpass', a: 0.02, d: 0.5, v: 0.006, at: end }];
}
const flourish = (freqs) => {
  const high = freqs.slice(-2).map((f) => f * 2), at = (freqs.length + 1) * STRIKE;
  return [...fanfare([...freqs, ...high]), ...[0, 1, 2].map((k) => ({ wave: 'sine', f: [high[1] * 2, high[1] * 2], fm: [2.76, 0.5], d: 0.25, v: 0.014, at: at + k * 0.06, pan: [-0.5, 0.5, 0][k] }))];
};
const DOOR = [523, 659, 784, 1046];   // without a track to say otherwise: C major

// A sound is a list of parts played together. A part is a tone gliding from f[0] to f[1] Hz,
// or filtered noise (noise: the filter's frequency, or [from, to] for a sweep; type: 'lowpass'
// by default, 'highpass' or 'bandpass'; q: how narrow). d is how long it lasts, v how loud,
// a its attack (4 ms unless set), hold how long it stays at full before dying away, and at a
// delay before it starts, all seconds. pan puts the part to one side (-1 to 1).
// A tone may also have:
//   wave    'sine', 'triangle', 'square', 'sawtooth' or 'pulse' (width: 0.25 by default)
//   cut     a lowpass on it, in Hz, or [from, to] to open or close it as it sounds (q: resonance)
//   detune  cents between two copies of it, a little apart: thicker, and it beats
//   fm      [ratio, index]: a second wave at f * ratio bends its pitch, index * f Hz deep, and
//           fades away faster than the tone does: bells, glass, metal
//   vib     [cents, rate]: a wobble in pitch
//   lin     glide in a straight line instead of the ear's curve
// Sounds are layered the way the soundtrack is: a body (the pitch), a transient (the click or
// the scuff that says when it happened) and air (noise that says what it's made of).
const SFX = {
  // ---- the player
  // A puff of the suit's jet: a hiss rising through a bandpass, a soft rising blip, and a low push.
  jump: [
    { noise: [700, 2600], type: 'bandpass', q: 1.1, a: 0.006, d: 0.13, v: 0.15 },
    { wave: 'triangle', f: [260, 520], cut: 2400, d: 0.085, v: 0.067 },
    { wave: 'sine', f: [95, 150], d: 0.06, v: 0.067 },
  ],
  // Boots on the floor: a short low knock and a scuff of dust.
  land: [
    { wave: 'sine', f: [140, 52], d: 0.08, v: 0.074 },
    { noise: [1600, 260], d: 0.07, v: 0.068 },
    { noise: 3200, type: 'bandpass', q: 2, d: 0.018, v: 0.02 },
  ],
  // Broken: a hit, a burst that darkens as it scatters, a falling growl, glass, and a stutter.
  die: [
    { wave: 'sine', f: [190, 36], d: 0.4, v: 0.21 },
    { noise: [7000, 240], d: 0.38, v: 0.2 },
    { wave: 'sawtooth', f: [440, 42], detune: 24, cut: [3200, 180], d: 0.5, v: 0.084 },
    { noise: 6500, type: 'highpass', d: 0.11, v: 0.054 },
    { wave: 'square', f: [1320, 1320], cut: 3000, d: 0.025, v: 0.023, at: 0.03 },
    { wave: 'square', f: [990, 990], cut: 3000, d: 0.025, v: 0.019, at: 0.065 },
    { wave: 'square', f: [660, 660], cut: 3000, d: 0.03, v: 0.015, at: 0.1 },
  ],
  win: fanfare(DOOR),
  record: flourish(DOOR),

  // ---- secrets
  // The secret itself: the old two notes, as glass bells, with a shimmer and a breath under them.
  coin: [
    { wave: 'sine', f: [988, 988], fm: [3.5, 1.1], d: 0.16, v: 0.044 },
    { wave: 'triangle', f: [988, 988], d: 0.09, v: 0.025 },
    { wave: 'sine', f: [1319, 1319], fm: [3.5, 1.1], d: 0.55, v: 0.047, at: 0.075 },
    { wave: 'triangle', f: [1319, 1319], d: 0.4, v: 0.025, at: 0.075 },
    { wave: 'sine', f: [2637, 2637], fm: [2.76, 0.6], d: 0.4, v: 0.011, at: 0.13, pan: -0.4 },
    { wave: 'sine', f: [3951, 3951], fm: [2.76, 0.6], d: 0.35, v: 0.0076, at: 0.18, pan: 0.4 },
    { noise: 9500, type: 'highpass', a: 0.03, d: 0.5, v: 0.008, at: 0.08 },
    { wave: 'sine', f: [330, 660], a: 0.02, d: 0.3, v: 0.019 },
  ],
  // A buried one, glimpsed as you walk into its wall: barely there, high and far.
  glint: [
    { wave: 'sine', f: [2637, 2637], fm: [2.76, 0.4], a: 0.01, d: 0.45, v: 0.017, pan: -0.2 },
    { wave: 'sine', f: [3520, 3520], fm: [2.76, 0.4], a: 0.01, d: 0.4, v: 0.012, at: 0.07, pan: 0.2 },
    { noise: 10000, type: 'highpass', a: 0.04, d: 0.35, v: 0.0077 },
  ],

  // ---- traps and scenery
  // Machinery waking: a clunk, a motor winding up through a low filter, a catch letting go.
  trap: [
    { wave: 'square', f: [120, 55], cut: 900, d: 0.2, v: 0.1 },
    { noise: [900, 180], d: 0.14, v: 0.11 },
    { noise: 2600, type: 'bandpass', q: 4, d: 0.025, v: 0.07 },
    { wave: 'sawtooth', f: [62, 74], cut: 420, a: 0.02, d: 0.26, v: 0.06 },
  ],
  // Something appears or goes: a round blip and a click.
  pop: [
    { wave: 'sine', f: [880, 340], d: 0.065, v: 0.08 },
    { noise: 2400, type: 'bandpass', q: 2, d: 0.015, v: 0.04 },
  ],
  // A knock on wood: the head on a hidden block, a dart on a wall, a locked door.
  bonk: [
    { wave: 'triangle', f: [270, 150], d: 0.1, v: 0.21 },
    { wave: 'sine', f: [560, 310], d: 0.045, v: 0.062 },
    { noise: 1300, type: 'bandpass', q: 2.2, d: 0.03, v: 0.11 },
  ],
  // Something heavy comes down: a deep hit, its dust, and rubble settling a moment later.
  thud: [
    { wave: 'sine', f: [95, 32], d: 0.32, v: 0.14 },
    { noise: [1000, 110], d: 0.26, v: 0.14 },
    { wave: 'triangle', f: [58, 40], d: 0.22, v: 0.052 },
    { noise: 700, type: 'bandpass', q: 1.2, d: 0.14, v: 0.037, at: 0.05 },
    { noise: 2200, type: 'bandpass', q: 3, d: 0.02, v: 0.016, at: 0.11 },
  ],
  // Gravity turns over: a rising whoosh, a little phasey, with a swell under it.
  flip: [
    { wave: 'sine', f: [180, 900], detune: 30, d: 0.28, v: 0.075 },
    { noise: [400, 3200], type: 'bandpass', q: 2, a: 0.03, d: 0.3, v: 0.08 },
    { wave: 'triangle', f: [90, 450], cut: 1500, d: 0.25, v: 0.04 },
  ],
  // The picture tears: bits of tone at the wrong pitch, all at once, and static.
  glitch: [
    { noise: 5500, type: 'highpass', d: 0.07, v: 0.097 },
    { wave: 'square', f: [1760, 1760], d: 0.02, v: 0.031 },
    { wave: 'square', f: [311, 311], d: 0.02, v: 0.035, at: 0.025 },
    { wave: 'square', f: [2489, 2489], d: 0.015, v: 0.026, at: 0.045 },
    { wave: 'sawtooth', f: [60, 1900], lin: true, cut: 3500, d: 0.07, v: 0.031, at: 0.05 },
    { wave: 'square', f: [98, 98], cut: 1200, d: 0.03, v: 0.035, at: 0.09 },
  ],
  // A key struck on a typewriter: the hammer and the bar coming back.
  type: [
    { noise: 3600, type: 'bandpass', q: 1.6, d: 0.02, v: 0.063 },
    { wave: 'sine', f: [1900, 1100], d: 0.012, v: 0.017 },
    { noise: 900, type: 'bandpass', q: 2, d: 0.03, v: 0.025, at: 0.012 },
  ],
  // A field switches on: mains hum climbing up to its pitch, with a buzz in it.
  hum: [
    { wave: 'sawtooth', f: [55, 110], detune: 12, cut: [300, 1300], a: 0.02, d: 0.42, v: 0.075, vib: [10, 6] },
    { wave: 'sine', f: [110, 220], d: 0.36, v: 0.1 },
    { wave: 'square', f: [220, 440], cut: 900, d: 0.3, v: 0.02 },
  ],
  // Through a wormhole: a falling swirl, the other side opening upward, and wind between.
  warp: [
    { wave: 'sine', f: [1800, 120], d: 0.32, v: 0.085, vib: [40, 14] },
    { noise: [5000, 300], type: 'bandpass', q: 3, d: 0.36, v: 0.06 },
    { wave: 'triangle', f: [200, 1600], cut: 4000, d: 0.22, v: 0.045, at: 0.12 },
  ],
  // Sonar in the Echo: one long pure note, and the wall answering it.
  ping: [
    { wave: 'sine', f: [1480, 1440], a: 0.006, d: 0.6, v: 0.062 },
    { wave: 'sine', f: [2960, 2880], d: 0.18, v: 0.011 },
    { wave: 'sine', f: [1480, 1440], a: 0.01, d: 0.45, v: 0.022, at: 0.28, pan: -0.3 },
    { wave: 'sine', f: [1480, 1440], a: 0.01, d: 0.35, v: 0.0089, at: 0.56, pan: 0.3 },
  ],
  // Into the sea: the slap, the body of water closing, and bubbles coming up.
  splash: [
    { noise: [3500, 500], d: 0.36, v: 0.11 },
    { noise: 1200, type: 'bandpass', q: 1, d: 0.2, v: 0.067, at: 0.015 },
    { wave: 'sine', f: [500, 140], d: 0.16, v: 0.037 },
    { wave: 'sine', f: [420, 950], d: 0.04, v: 0.022, at: 0.08, pan: -0.3 },
    { wave: 'sine', f: [600, 1300], d: 0.035, v: 0.018, at: 0.15, pan: 0.3 },
    { wave: 'sine', f: [380, 820], d: 0.04, v: 0.015, at: 0.23 },
  ],
  // The leviathan: a throat, a sub that shakes the floor, and the water it pushes.
  roar: [
    { wave: 'sawtooth', f: [64, 38], detune: 22, cut: [900, 220], q: 3, a: 0.05, d: 1.3, v: 0.11, vib: [35, 9] },
    { noise: [900, 200], a: 0.05, d: 1.1, v: 0.15 },
    { wave: 'square', f: [93, 50], cut: 600, d: 1.0, v: 0.034, at: 0.1 },
    { wave: 'sine', f: [42, 30], a: 0.08, d: 1.2, v: 0.14 },
  ],
  // The eye fires: a saw tearing upward through an opening filter, a hiss, and its weight.
  beam: [
    { wave: 'sawtooth', f: [140, 1100], detune: 30, cut: [600, 5000], d: 0.45, v: 0.048 },
    { noise: [2000, 6000], type: 'highpass', d: 0.4, v: 0.055 },
    { wave: 'sine', f: [70, 60], d: 0.4, v: 0.082 },
  ],
  // ...and gathers itself first: a rising whine that swells instead of striking.
  charge: [
    { wave: 'sine', f: [220, 880], a: 0.5, d: 0.8, v: 0.032, vib: [25, 8] },
    { wave: 'triangle', f: [110, 440], cut: 1500, a: 0.4, d: 0.8, v: 0.024 },
    { noise: [500, 4000], type: 'bandpass', q: 4, a: 0.6, d: 0.8, v: 0.021 },
  ],
  // The ground about to give: a deep grind with stones knocking in it.
  rumble: [
    { noise: 170, a: 0.05, d: 0.7, v: 0.21 },
    { wave: 'sine', f: [46, 34], a: 0.06, d: 0.7, v: 0.021 },
    { noise: 450, type: 'bandpass', q: 1, d: 0.5, v: 0.021 },
    { noise: 1800, type: 'bandpass', q: 3, d: 0.02, v: 0.014, at: 0.2 },
  ],
  // A plank or a cable taking weight: a rasp that drags.
  creak: [
    { wave: 'sawtooth', f: [72, 56], cut: 650, q: 6, a: 0.02, d: 0.26, v: 0.07, vib: [70, 23] },
    { wave: 'triangle', f: [140, 118], d: 0.2, v: 0.035 },
    { noise: 900, d: 0.06, v: 0.06 },
  ],
  // The floor breaks up: a crack, the crumbling body, and pieces landing one by one.
  crumble: [
    { noise: 3000, type: 'bandpass', q: 1.5, d: 0.02, v: 0.08 },
    { noise: [1500, 280], d: 0.4, v: 0.21 },
    { wave: 'triangle', f: [92, 40], d: 0.3, v: 0.1 },
    ...[0.06, 0.12, 0.2, 0.29].map((at, i) => ({ noise: 2400 + i * 500, type: 'bandpass', q: 3, d: 0.02, v: 0.05 - i * 0.008, at, pan: [-0.3, 0.2, -0.1, 0.3][i] })),
  ],
  // A blade springs out of the floor: a metal ring and a hiss.
  spike: [
    { wave: 'sine', f: [2200, 2150], fm: [1.41, 1.2], d: 0.13, v: 0.031 },
    { wave: 'square', f: [1800, 600], cut: 4000, d: 0.05, v: 0.028 },
    { noise: 6500, type: 'highpass', d: 0.05, v: 0.063 },
  ],
  // A spring: the boing, wobbling as it settles.
  spring: [
    { wave: 'sine', f: [180, 720], d: 0.2, v: 0.13, vib: [90, 18] },
    { wave: 'square', f: [360, 1440], cut: 2000, d: 0.1, v: 0.025 },
    { wave: 'triangle', f: [90, 180], d: 0.12, v: 0.05 },
    { noise: 2000, type: 'bandpass', q: 2, d: 0.015, v: 0.04 },
  ],
  // A dart leaves its turret: a puff and a short whistle.
  shoot: [
    { noise: [4000, 1500], type: 'bandpass', q: 2, d: 0.08, v: 0.11 },
    { wave: 'square', f: [900, 300], cut: 2500, d: 0.08, v: 0.035 },
    { noise: 1500, type: 'bandpass', q: 3, d: 0.015, v: 0.05 },
  ],

  // ---- the menus: dry, quiet, and out of the way
  tick: [
    { wave: 'sine', f: [2400, 2200], d: 0.03, v: 0.035 },
    { noise: 6000, type: 'bandpass', q: 3, d: 0.01, v: 0.03 },
  ],
  select: [
    { wave: 'triangle', f: [660, 660], d: 0.09, v: 0.017 },
    { wave: 'triangle', f: [990, 990], d: 0.2, v: 0.017, at: 0.055 },
    { wave: 'sine', f: [1980, 1980], fm: [3.5, 0.5], d: 0.16, v: 0.0034, at: 0.055 },
  ],
};

// Sounds heard over and over drift a little in pitch (noise: in brightness) on each play,
// so they don't drone. Iconic ones like coin, win and die always sound the same.
const VARY = { jump: 0.04, tick: 0.03, bonk: 0.05, land: 0.15, thud: 0.12, type: 0.2, creak: 0.1, crumble: 0.12, spike: 0.08, shoot: 0.1, pop: 0.06, trap: 0.06 };

// How much of a sound rings in the room (see `space` in a track). The interface is dry:
// it isn't in the room. Anything not listed gets ROOM.
const ROOM = 0.22;
const WET = {
  tick: 0, select: 0, type: 0, jump: 0.1, land: 0.3, die: 0.45, win: 0.4, coin: 0.4, record: 0.4, thud: 0.6, trap: 0.4,
  crumble: 0.45, roar: 0.7, ping: 0.8, rumble: 0.6, splash: 0.5, warp: 0.45, beam: 0.5, bonk: 0.35, spring: 0.3,
  glint: 0.7, glitch: 0.15,
};

// The room when a track doesn't describe one: a small, dull one.
const PLAIN = { time: 0.7, cut: 2600 };

// Drum kits: what each letter of a drum pattern plays, as sound parts. A track picks one
// with "kit" (a name, or its own table); letters a kit leaves out come from "std".
const KITS = {
  std: {
    k: [{ wave: 'sine', f: [150, 42], d: 0.22, v: 1 }, { noise: 2200, d: 0.012, v: 0.3 }],                                   // kick
    s: [{ noise: 2200, type: 'bandpass', q: 0.7, d: 0.15, v: 0.9 }, { wave: 'triangle', f: [210, 150], d: 0.08, v: 0.4 }],     // snare
    h: [{ noise: 8000, type: 'highpass', d: 0.03, v: 0.35 }],                                                                  // closed hat
    o: [{ noise: 7000, type: 'highpass', d: 0.22, v: 0.3 }],                                                                   // open hat
    c: [0, 0.011, 0.023].map((at, i) => ({ noise: 1300, type: 'bandpass', q: 1.2, d: i < 2 ? 0.02 : 0.13, v: 0.6, at })),      // clap
    t: [{ wave: 'sine', f: [170, 85], d: 0.2, v: 0.8 }],                                                                       // tom
    r: [{ wave: 'triangle', f: [900, 700], d: 0.025, v: 0.5 }, { noise: 4000, type: 'bandpass', d: 0.02, v: 0.2 }],            // rim
    x: [{ noise: [9000, 5000], type: 'highpass', d: 0.9, v: 0.3 }],                                                            // crash
    b: [{ wave: 'sine', f: [90, 38], d: 0.6, v: 1 }],                                                                          // a long, low boom
    m: [{ noise: 5500, type: 'bandpass', q: 1.5, a: 0.015, d: 0.06, v: 0.3 }],                                                 // shaker
  },
  // The Foundry: an anvil for a snare, steam for hats, a pipe struck now and then.
  metal: {
    k: [{ wave: 'sine', f: [130, 38], d: 0.26, v: 1 }, { noise: 900, d: 0.05, v: 0.5 }],
    s: [{ wave: 'square', f: [1245, 1230], d: 0.09, v: 0.1 }, { wave: 'square', f: [1877, 1860], d: 0.07, v: 0.07 }, { noise: 3000, type: 'bandpass', q: 1.5, d: 0.11, v: 0.5 }],
    h: [{ noise: 6000, type: 'highpass', d: 0.025, v: 0.3 }],
    o: [{ noise: 5000, type: 'highpass', a: 0.05, d: 0.3, v: 0.28 }],
    p: [{ wave: 'triangle', f: [1320, 1300], d: 0.25, v: 0.16 }, { wave: 'sine', f: [1986, 1975], d: 0.12, v: 0.06 }],
  },
  // Between the Lines: a typewriter. Keys for hats, the space bar for a kick, the carriage
  // slapping home for a snare, its bell (d) and the long zip of a line break (z).
  type: {
    k: [{ noise: 500, d: 0.05, v: 0.7 }, { wave: 'sine', f: [110, 60], d: 0.08, v: 0.7 }],
    s: [{ noise: 1800, type: 'bandpass', q: 0.9, d: 0.07, v: 0.7 }, { noise: 4500, d: 0.012, v: 0.3 }],
    h: [{ noise: 3500, d: 0.015, v: 0.5 }, { wave: 'square', f: [2400, 1800], d: 0.008, v: 0.05 }],
    d: [{ wave: 'sine', f: [2093, 2093], d: 0.6, v: 0.22 }, { wave: 'sine', f: [5274, 5274], d: 0.18, v: 0.05 }],
    z: [{ noise: [900, 4200], type: 'bandpass', q: 2.5, d: 0.2, v: 0.4 }],
  },
  // Orbit, the Abyss: everything rounded off. A heartbeat, a blip, a breath.
  soft: {
    k: [{ wave: 'sine', f: [85, 44], d: 0.3, v: 1 }],
    s: [{ noise: 1500, type: 'bandpass', q: 0.6, a: 0.02, d: 0.2, v: 0.5 }],
    h: [{ wave: 'sine', f: [3136, 3136], d: 0.03, v: 0.24 }, { noise: 9000, type: 'highpass', d: 0.02, v: 0.24 }],
    o: [{ noise: 6000, type: 'highpass', a: 0.08, d: 0.4, v: 0.16 }],
    r: [{ wave: 'sine', f: [1568, 1500], d: 0.04, v: 0.3 }],
  },
};

const LOOKAHEAD = 0.25;   // seconds of music scheduled ahead of the clock
const TICK = 40;          // ms between looks at the clock

// Drops whatever a param was gliding toward and goes on from where it is now.
function hold(param, now) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
}

const songs = new WeakMap();
function read(track) {
  let song = songs.get(track);
  if (!song) {
    song = compile(track);
    for (const p of song.problems) console.warn(`[music] ${p}`);
    songs.set(track, song);
  }
  return song;
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.volumes = { music: 0.5, sfx: 0.8 };
    this.track = null;
    this.song = null;           // the track playing now: its scheduler and its own gain
    this.level = 0;             // how much of the track is heard (see "layer" in docs/packs.md)
    this.mods = {};             // what stands between the music and the listener: pause, water, far
    this.lastPlayed = {};
  }

  // Browsers only allow audio after a user gesture.
  // iOS also leaves the context "interrupted" after a call or a trip away from the page.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Plays along with whatever the player is already listening to instead of stopping it
    // (Safari; other browsers don't have the API yet).
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    this.attach(new AC());
  }

  // Builds the mixer on a context: unlock() hands it a live one, a test an offline one.
  attach(ctx) {
    this.ctx = ctx;
    this.waves = new Map();
    this.rooms = new Map();
    // A limiter on the way out keeps stacked sounds from clipping. Only peaks reach the
    // threshold; the master gain undoes the compressor's built-in makeup gain (about +2.6 dB).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.74;
    this.master.connect(limiter);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    // The music goes through a filter and a gain of its own, so pausing and dying
    // can pull it back without touching the volume setting (see mod and dip).
    // The sound effects have the filter only: under water everything is dull.
    this.open = ctx.sampleRate / 2;
    this.musicLp = ctx.createBiquadFilter();
    this.musicLp.frequency.value = this.open;
    this.musicDuck = ctx.createGain();
    this.sfxLp = ctx.createBiquadFilter();
    this.sfxLp.frequency.value = this.open;
    this.sfxBus.connect(this.sfxLp).connect(this.master);
    this.musicBus.connect(this.musicLp).connect(this.musicDuck).connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.setVolumes(this.volumes.music, this.volumes.sfx);
    this.furnish(this.track?.space);
    this.shade(0);
    if (this.track) this.music(this.track, true);
  }

  setVolumes(music, sfx) {
    this.volumes = { music, sfx };
    if (!this.ctx) return;
    // Squared so each step of the bar sounds like the same change; eased so it doesn't click.
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music * music * 0.5, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(sfx * sfx, now, 0.02);
  }

  suspend(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend(); else this.ctx.resume();
  }

  // Something comes between the music and the listener, or goes away:
  //   pause  the music sounds muffled and quieter, as if from the next room
  //   water  the player is under it: music and effects both go dull
  //   far    a menu: the music waits behind a door
  mod(name, on) {
    if (!!this.mods[name] === !!on) return;
    this.mods[name] = !!on;
    this.shade();
  }

  muffle(on) { this.mod('pause', on); }

  // Nothing in the way any more.
  clear() {
    this.mods = {};
    this.shade();
  }

  get duck() { return (this.mods.pause ? 0.5 : 1) * (this.mods.far ? 0.8 : 1); }

  // Sets the filters and the music's level to what the mods ask for, over `ease` seconds.
  shade(ease = 0.08) {
    if (!this.ctx) return;
    const m = this.mods, now = this.ctx.currentTime;
    const cut = m.pause ? 700 : m.water ? 1300 : m.far ? 2600 : this.open;
    const set = (param, v) => (ease ? param.setTargetAtTime(v, now, ease) : param.setValueAtTime(v, now));
    set(this.musicLp.frequency, cut);
    set(this.sfxLp.frequency, m.water ? 1500 : this.open);
    hold(this.musicDuck.gain, now);
    set(this.musicDuck.gain, this.duck);
  }

  // The music ducks under a death and comes back right after.
  dip() {
    if (!this.ctx) return;
    const g = this.musicDuck.gain, now = this.ctx.currentTime;
    hold(g, now);
    g.setTargetAtTime(0.35 * this.duck, now, 0.02);
    g.setTargetAtTime(this.duck, now + 0.35, 0.25);
  }

  // How much of the track is heard: voices with a "layer" come in as this goes up.
  intensity(level) {
    if (level === this.level) return;
    this.level = level;
    if (this.ctx) this.song?.layers(level, this.ctx.currentTime, 0.9);
  }

  // pan: -1 (left) to 1 (right). Without a stereo panner (old Safari) it stays centered.
  // vol scales the whole sound: a long fall lands harder than a hop.
  play(name, pan = 0, vol = 1) {
    const parts = this.doors?.[name] || SFX[name];
    if (!parts || !this.ctx || this.volumes.sfx <= 0) return;
    // The same sound twice at once (two traps going off in one frame) would only play
    // louder and phasey, so the second one is dropped.
    const now = performance.now();
    if (now - (this.lastPlayed[name] ?? -Infinity) < 20) return;
    this.lastPlayed[name] = now;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const k = 1 + (Math.random() * 2 - 1) * (VARY[name] || 0);
    let bus = this.sfxBus;
    const wet = (WET[name] ?? ROOM) * this.wet;
    if ((pan && ctx.createStereoPanner) || wet) {
      bus = pan && ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (bus.pan) bus.pan.value = pan;
      bus.connect(this.sfxBus);
      if (wet) {
        const send = ctx.createGain();
        send.gain.value = wet;
        bus.connect(send).connect(this.sfxRoom);
      }
    }
    for (const p of parts) this.voice(p, t0 + (p.at || 0), bus, k, vol);
  }

  voice(p, t, bus, k = 1, vol = 1) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    // A few ms of attack: starting at full volume clicks, mostly on square and saw waves.
    // Silent from the moment it exists, too: a source may start a sample before `t`.
    const attack = p.a ?? 0.004, hold = p.hold ?? 0;
    const end = t + Math.max(p.d, attack + hold + 0.005);
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(p.v * vol, t + attack);
    if (hold) gain.gain.setValueAtTime(p.v * vol, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    if (p.pan && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = p.pan;
      gain.connect(pan).connect(bus);
    } else {
      gain.connect(bus);
    }
    const sources = [];
    const stop = end + 0.02;
    // Glides follow the ear (a curve) unless asked to go in a straight line.
    const glide = (param, from, to) => {
      param.setValueAtTime(from, t);
      if (to === from) return;
      if (p.lin) param.linearRampToValueAtTime(to, t + p.d);
      else param.exponentialRampToValueAtTime(to, t + p.d);
    };
    if (p.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      // Each play starts somewhere else in the noise, so repeats don't sound copied.
      const offset = Math.random() * (this.noiseBuf.duration - 0.05);
      const filter = ctx.createBiquadFilter();
      const [from, to] = Array.isArray(p.noise) ? p.noise : [p.noise, p.noise];
      filter.type = p.type || 'lowpass';
      if (p.q) filter.Q.value = p.q;
      glide(filter.frequency, from * k, to * k);
      src.connect(filter).connect(gain);
      src.start(t, offset);
      src.stop(stop);
      return;
    }
    // A tone: through its own filter if it has one, as one wave or two a little apart.
    let into = gain;
    if (p.cut) {
      const f = ctx.createBiquadFilter(), [from, to] = Array.isArray(p.cut) ? p.cut : [p.cut, p.cut];
      if (p.q) f.Q.value = p.q;
      f.frequency.setValueAtTime(from, t);
      if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + p.d);
      f.connect(gain);
      into = f;
    }
    const twins = p.detune ? [-p.detune / 2, p.detune / 2] : [0];
    let level = into;
    if (twins.length > 1) {
      level = ctx.createGain();
      level.gain.value = Math.SQRT1_2;
      level.connect(into);
    }
    const wave = p.wave === 'pulse' ? this.wave(p) : null;
    const tones = twins.map((cents) => {
      const o = ctx.createOscillator();
      if (wave) o.setPeriodicWave(wave); else o.type = p.wave || 'triangle';
      glide(o.frequency, p.f[0] * k, p.f[1] * k);
      if (cents) o.detune.setValueAtTime(cents, t);
      o.connect(level);
      return o;
    });
    sources.push(...tones);
    if (p.fm) {
      // A modulator at a fixed ratio above the tone, its depth fading out well before the
      // tone does: the strike is bright, the ring is pure.
      const [ratio, index] = p.fm, m = ctx.createOscillator(), depth = ctx.createGain();
      glide(m.frequency, p.f[0] * k * ratio, p.f[1] * k * ratio);
      depth.gain.setValueAtTime(index * p.f[0] * k, t);
      depth.gain.exponentialRampToValueAtTime(Math.max(1, index * p.f[0] * k * 0.02), t + Math.max(0.02, p.d * 0.5));
      m.connect(depth);
      for (const o of tones) depth.connect(o.frequency);
      sources.push(m);
    }
    if (p.vib) {
      const [cents, rate = 5] = p.vib, lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = rate;
      depth.gain.value = cents;
      lfo.connect(depth);
      for (const o of tones) depth.connect(o.detune);
      sources.push(lfo);
    }
    for (const o of sources) {
      o.start(t);
      o.stop(stop);
    }
  }

  // A room's echo, made up: noise that dies away over `time` seconds and loses its
  // brightness (above `cut` Hz) as it goes. Kept, since worlds are visited again.
  impulse({ time = PLAIN.time, cut = PLAIN.cut } = {}) {
    const key = `${time}:${cut}`;
    let buf = this.rooms.get(key);
    if (!buf) {
      const ctx = this.ctx, n = Math.ceil(ctx.sampleRate * time);
      buf = ctx.createBuffer(2, n, ctx.sampleRate);
      const start = 1 - Math.exp(-2 * Math.PI * Math.min(cut * 3, ctx.sampleRate * 0.45) / ctx.sampleRate);
      const end = 1 - Math.exp(-2 * Math.PI * cut * 0.3 / ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        let low = 0;
        for (let i = 0; i < n; i++) {
          const u = i / n;
          low += (Math.random() * 2 - 1 - low) * (start + (end - start) * u);
          data[i] = low * Math.exp(-6.9 * u);          // 60 dB down by the end
        }
      }
      this.rooms.set(key, buf);
    }
    return buf;
  }

  // The sound effects ring in the same room as the music. A new room takes over from the
  // old one, which is left to finish whatever was still ringing in it.
  furnish(space) {
    const ctx = this.ctx, old = this.sfxRoom;
    this.wet = space?.mix ?? 1;
    this.sfxRoom = ctx.createConvolver();
    this.sfxRoom.buffer = this.impulse(space || PLAIN);
    this.sfxRoom.connect(this.sfxBus);
    if (old) setTimeout(() => old.disconnect(), 4000);
  }

  // A track is described in music.js and docs/packs.md. The level's music carries on
  // from one level to the next: asking for the track that is playing changes nothing.
  music(track, force = false) {
    if (track === this.track && !force) return;
    const sameRoom = JSON.stringify(track?.space) === JSON.stringify(this.track?.space);
    this.track = track;
    if (!this.ctx) return;
    // The old track keeps going while it fades out, so it ends instead of being cut off,
    // and the new one comes in as the old one is nearly gone.
    const old = this.song, now = this.ctx.currentTime;
    this.song = null;
    if (old) {
      old.out.gain.setTargetAtTime(0, now, 0.12);
      setTimeout(() => old.stop(), 1200);
    }
    if (!sameRoom) this.furnish(track?.space);
    // The level's way out sings in the key of its music.
    const door = track?.win ? String(track.win).trim().split(/\s+/).map(midi).filter((n) => n !== null).map(hz) : [];
    this.doors = door.length ? { win: fanfare(door), record: flourish(door) } : null;
    if (track) {
      const song = this.song = this.sequence(track, now + (old ? 0.35 : 0.1));
      song.timer = setInterval(() => song.run(this.ctx.currentTime + LOOKAHEAD), TICK);
    }
  }

  // The step sequencer: a channel strip for each voice, an echo and a room for the song,
  // and run(until), which schedules every note that starts before that time.
  sequence(track, start) {
    const ctx = this.ctx, song = read(track), live = [];
    const out = ctx.createGain();
    out.connect(this.musicBus);

    let room = null;
    if (track.space) {
      room = ctx.createConvolver();
      room.buffer = this.impulse(track.space);
      room.connect(out);
    }
    const echo = track.echo ? this.echo(track.echo, song.stepDur, out) : null;

    const send = (from, to, amount) => {
      const g = ctx.createGain();
      g.gain.value = amount;
      from.connect(g).connect(to);
    };
    const strips = song.voices.map(({ def, drums }) => {
      const input = ctx.createGain();
      let node = input;
      if (def.cut) {
        const f = ctx.createBiquadFilter();
        f.frequency.value = def.cut;
        if (def.res) f.Q.value = def.res;
        node.connect(f);
        node = f;
      }
      if (def.pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = def.pan;
        node.connect(p);
        node = p;
      }
      // The gate is the voice's layer coming in and out.
      const gate = ctx.createGain();
      node.connect(gate).connect(out);
      if (def.echo && echo) send(gate, echo, def.echo);
      if (def.space && room) send(gate, room, def.space);
      let vib = null;
      if (def.vib) {
        const [cents, rate = 5] = [].concat(def.vib), lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        vib = ctx.createGain();
        vib.gain.value = cents;
        lfo.connect(vib);
        lfo.start();
        live.push(lfo);
      }
      const [lo, hi] = Array.isArray(def.layer) ? def.layer : [def.layer ?? 0, Infinity];
      const kit = drums ? { ...KITS.std, ...kitOf(def.kit ?? track.kit) } : null;
      return { def, input, gate, vib, lo, hi, kit, on: true, last: 0 };
    });

    const layers = (level, at, fade = 0) => {
      for (const s of strips) {
        s.on = level >= s.lo && level <= s.hi;
        if (fade) s.gate.gain.setTargetAtTime(s.on ? 1 : 0, at, fade / 3);
        else s.gate.gain.setValueAtTime(s.on ? 1 : 0, at);
      }
    };
    layers(this.level, 0);

    let n = 0;
    // Swing: every other step lands late.
    const when = (k) => start + (k + (k % 2 ? song.swing : 0)) * song.stepDur;
    const run = (until) => {
      for (; when(n) < until; n++) {
        const t = when(n);
        // Fell behind (the page was asleep): skip what was missed instead of piling it up.
        // Muted: keeps time, plays nothing.
        if (t < ctx.currentTime - 0.05 || this.volumes.music <= 0) continue;
        song.voices.forEach((v, i) => {
          const s = strips[i], ev = s.on && eventAt(song, v, n);
          if (!ev) return;
          if (v.drums) this.hit(s, ev, t);
          else this.tone(s, ev, t, ev.len * song.stepDur);
        });
      }
    };
    run(ctx.currentTime + LOOKAHEAD);
    return {
      out, run, layers, timer: 0,
      stop() {
        clearInterval(this.timer);
        for (const node of live) node.stop();
        out.disconnect();
      },
    };
  }

  // Repeats bouncing from one ear to the other, `steps` apart, each `feedback` as loud as
  // the one before, with everything above `cut` Hz taken off. Returns where voices send to.
  echo({ steps = 3, feedback = 0.5, cut = 2800 }, stepDur, out) {
    const ctx = this.ctx, input = ctx.createGain(), tone = ctx.createBiquadFilter();
    tone.frequency.value = cut;
    input.connect(tone);
    const [left, right] = [-0.6, 0.6].map((side) => {
      const delay = ctx.createDelay(2), level = ctx.createGain();
      delay.delayTime.value = steps * stepDur;
      level.gain.value = feedback;
      delay.connect(level);
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = side;
        delay.connect(pan).connect(out);
      } else {
        delay.connect(out);
      }
      return { delay, level };
    });
    tone.connect(left.delay);
    left.level.connect(right.delay);
    right.level.connect(left.delay);
    return input;
  }

  // A voice's own wave shape, for "pulse" and lists of harmonics; null for the built-in ones.
  wave(def) {
    const w = def.wave;
    if (typeof w === 'string' && w !== 'pulse') return null;
    const key = Array.isArray(w) ? w.join(',') : `pulse:${def.width ?? 0.25}`;
    let wave = this.waves.get(key);
    if (!wave) {
      let real, imag;
      if (Array.isArray(w)) {
        imag = Float32Array.from([0, ...w]);
        real = new Float32Array(imag.length);
      } else {
        // A pulse `width` wide, as its Fourier series.
        const width = def.width ?? 0.25;
        real = new Float32Array(32);
        imag = new Float32Array(32);
        for (let h = 1; h < 32; h++) real[h] = Math.sin(Math.PI * h * width) / h;
      }
      wave = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(key, wave);
    }
    return wave;
  }

  // One note (or chord) of a voice, `dur` seconds long.
  tone(s, ev, t, dur) {
    const ctx = this.ctx, d = s.def, gain = ctx.createGain(), g = gain.gain;
    const twins = d.detune ? [-d.detune / 2, d.detune / 2] : [0];
    const peak = d.v * ev.vel / Math.sqrt(ev.notes.length * twins.length);
    const length = Math.max(0.02, dur * (d.gate ?? 0.95)), off = t + length;
    let end;
    g.value = 0;
    g.setValueAtTime(0, t);
    if (d.env) {
      // Attack, decay to a sustain level, and a release once the note is let go.
      const [a, dec, sus, rel] = d.env;
      if (length <= a) {
        g.linearRampToValueAtTime(peak * length / a, off);
      } else {
        g.linearRampToValueAtTime(peak, t + a);
        if (length <= a + dec) {
          g.linearRampToValueAtTime(peak * (1 - (1 - sus) * (length - a) / dec), off);
        } else {
          g.linearRampToValueAtTime(peak * sus, t + a + dec);
          g.setValueAtTime(peak * sus, off);
        }
      }
      g.setTargetAtTime(0, off, rel / 4);
      end = off + rel * 1.5;
    } else {
      // Plucked: a few ms of attack (starting at full volume clicks), then it dies away.
      g.linearRampToValueAtTime(peak, t + 0.004);
      g.exponentialRampToValueAtTime(0.0001, off);
      end = off + 0.02;
    }
    let to = gain;
    if (d.sweep) {
      // A filter of its own that closes (or opens) as the note sounds.
      const [from, target, time = 0.2] = d.sweep, f = ctx.createBiquadFilter();
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(target, t + time);
      if (d.res) f.Q.value = d.res;
      f.connect(gain);
      to = f;
    }
    gain.connect(s.input);
    const wave = this.wave(d);
    for (const note of ev.notes) {
      const f = hz(note + (d.tr ?? 0));
      for (const cents of twins) {
        const o = ctx.createOscillator();
        if (wave) o.setPeriodicWave(wave); else o.type = d.wave ?? 'triangle';
        if (d.glide && s.last) {
          o.frequency.setValueAtTime(s.last, t);
          o.frequency.exponentialRampToValueAtTime(f, t + d.glide);
        } else {
          o.frequency.setValueAtTime(f, t);
        }
        if (cents) o.detune.setValueAtTime(cents, t);
        if (s.vib) s.vib.connect(o.detune);
        o.connect(to);
        o.start(t);
        o.stop(end);
      }
      s.last = f;
    }
  }

  // A drum hit: every letter is a sound from the kit.
  hit(s, ev, t) {
    for (const ch of ev.hits) {
      for (const p of s.kit[ch] ?? []) this.voice(p, t + (p.at || 0), s.input, 1, s.def.v * ev.vel);
    }
  }
}

const kitOf = (kit) => (typeof kit === 'string' ? KITS[kit] : kit) ?? {};

// For tools/check.mjs: the kits there are, the letters a drum voice may use with one,
// and the sounds a trap may ask for.
export const kits = new Set(Object.keys(KITS));
export const kitLetters = (kit) => new Set(Object.keys({ ...KITS.std, ...kitOf(kit) }));
export const sounds = new Set(Object.keys(SFX));
