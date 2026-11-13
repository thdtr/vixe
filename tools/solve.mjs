// Finds a way through a level by searching inputs on the real game code, headless.
// It proves a level can be beaten, and says roughly how tight it is.
//
//   node tools/solve.mjs w1.3                 solve one level
//   node tools/solve.mjs w1 w2.4              a whole world, or several levels
//   node tools/solve.mjs w1.3 --deaths 8      as if the player had died 8 times (mercy rules)
//   node tools/solve.mjs w1.3 --replay "R20 RJ6 R10"   play a script and say what happened
//   node tools/solve.mjs w1.3 --budget 400000  search longer before giving up
//   node tools/solve.mjs w1 --slack            also nudge the way found by a tick here and there,
//                                              40 times: how often does it still win? (forgiveness)
//   node tools/solve.mjs w2.6 --via 24,13 34,11 24,9   head for these cells in turn, then the exit:
//                                              for routes that wander away from the door first
//   node tools/solve.mjs w1 --naive            does a mindless strategy (hold right, hop
//                                              on a rhythm...) win? Then the level has no bite.
//   node tools/solve.mjs w1.3 --patience 3     how much a second costs (default: 10, then 2, then 0.5)
//   node tools/solve.mjs w1.3 --beam 2000      sweep forward in time instead, keeping the 2000
//                                              most promising moments (finds waits and detours)
//
// Levels the search can't crack on its own (it has to wait for a door to come back, or chase
// one) keep a winning script in tools/routes.json; checking such a level replays it first, and
// says ROUTE BROKEN if it no longer wins. --search ignores the recorded routes.
//
// A script is a list of moves, each held for a number of 1/20 s ticks: R (right), L (left),
// N (nothing), with J added to hold jump (RJ6: right and jump for 0.3 s).
// Effects that act on the player must have save()/load() (see game/fx.js) to be searched.

import { loadWorlds, makePlay, step } from './sim/env.mjs';
import { snapshot, restore, searchable } from './sim/snapshot.mjs';
import { CW, CH, MAP_COLS } from '../assets/js/config.js';
import { tileOf } from '../assets/js/game/tiles.js';
import { readFileSync } from 'node:fs';

const TICK = 6;                    // simulation steps per move (1/20 s)
const MOVES = [[1, false], [1, true], [0, false], [0, true], [-1, false], [-1, true]];
const NAMES = (d, j) => (d > 0 ? 'R' : d < 0 ? 'L' : 'N') + (j ? 'J' : '');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const flag = (name) => args.includes(`--${name}`) && !!args.splice(args.indexOf(`--${name}`), 1);
const naive = flag('naive'), slack = flag('slack'), searchOnly = flag('search');
const routes = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
const via = (opt('via', '') || '').split(/\s+/).filter(Boolean).map((p) => p.split(',').map((v) => (Number(v) + 0.5) * CW * (1)));
const beam = Number(opt('beam', 0)), patiences = opt('patience', '10,2,0.5').split(',').map(Number), budget = Number(opt('budget', 250000)), deaths = Number(opt('deaths', 0)), replay = opt('replay', null), limit = Number(opt('time', 60));

class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= x.f) break; a[i] = a[p]; i = p; } a[i] = x; }
  pop() { const a = this.a, top = a[0], x = a.pop(); if (a.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1].f < a[c].f) c++; if (a[c].f >= x.f) break; a[i] = a[c]; i = c; } a[i] = x; } return top; }
  get size() { return this.a.length; }
}

// Where the ways out are now, in pixels: exits on the map and riding groups.
function exits(play) {
  const out = [], level = play.level;
  level.grid.forEach((ch, i) => { if (tileOf(ch)?.exit) out.push([(i % MAP_COLS + 0.5) * CW, (((i / MAP_COLS) | 0) + 0.5) * CH]); });
  for (const b of level.bodies.values()) {
    if (!b.visible) continue;
    for (const c of b.cells) if (tileOf(c.ch)?.exit) out.push([(c.x + 0.5) * CW + b.ox, (c.y + 0.5) * CH + b.oy]);
  }
  // No way out yet (it appears once something is done): aim for where it will be.
  if (!out.length) for (const b of level.bodies.values()) for (const c of b.cells) if (tileOf(c.ch)?.exit) out.push([(c.x + 0.5) * CW + b.ox, (c.y + 0.5) * CH + b.oy]);
  return out;
}

// Everything that tells two moments apart, coarsely.
function key(play) {
  const p = play.player, l = play.level;
  let k = `${Math.round(p.x / 3)},${Math.round(p.y / 3)},${Math.round(p.vx / 30)},${Math.round(p.vy / 60)},${p.ground ? 1 : 0},${p.gdir},${Math.floor(play.time / 0.25)}|${l.version}`;
  for (const b of l.bodies.values()) k += `,${b.visible ? Math.round(b.ox / 4) + ':' + Math.round(b.oy / 4) : 'x'}`;
  for (const e of play.events.list) k += e.done ? '1' : '0';
  k += play.events.scripts.length + JSON.stringify(play.flags);
  return k;
}

function run(play, moves) {
  for (const [d, j, n] of moves) {
    for (let i = 0; i < n * TICK; i++) {
      const r = step(play, d, j);
      if (r) return { result: r, time: play.time };
    }
  }
  return { result: 'timeout', time: play.time };
}

const parse = (s) => s.trim().split(/\s+/).map((tok) => {
  const m = /^([RLN])(J?)(\d+)$/.exec(tok);
  if (!m) throw new Error(`bad move "${tok}"`);
  return [m[1] === 'R' ? 1 : m[1] === 'L' ? -1 : 0, !!m[2], Number(m[3])];
});

const compact = (moves) => {
  const out = [];
  for (const [d, j] of moves) {
    const last = out[out.length - 1];
    if (last && last[0] === d && last[1] === j) last[2]++;
    else out.push([d, j, 1]);
  }
  return out.map(([d, j, n]) => NAMES(d, j) + n).join(' ');
};

function solve(world, index, patience) {
  const play = makePlay(world, index, deaths);
  if (!searchable(play)) return { result: 'skipped', why: 'an effect acts on the player and can\'t be rewound' };
  const heap = new Heap(), seen = new Set();
  // Waypoints (cells -> pixels): the search aims for each in turn, then for the exit.
  const points = via.map(([x, y]) => [x, y / CW * CH]);
  const legs = points.map((q, i) => (i + 1 < points.length ? Math.hypot(points[i + 1][0] - q[0], (points[i + 1][1] - q[1]) * 1.2) / CW : 0));
  let stage = 0;
  const h = () => {
    const p = play.player;
    if (stage < points.length) {
      const [x, y] = points[stage];
      return Math.hypot(x - p.cx, (y - p.cy) * 1.2) / CW + legs.slice(stage).reduce((a, b) => a + b, 0) + 20;
    }
    const ex = exits(play);
    return ex.length ? Math.min(...ex.map(([x, y]) => Math.hypot(x - p.cx, (y - p.cy) * 1.2))) / CW : 0;
  };
  const reached = () => {
    const [x, y] = points[stage], p = play.player;
    return Math.hypot(x - p.cx, y - p.cy) < 12;
  };
  heap.push({ f: h(), g: 0, snap: snapshot(play), path: [], stage: 0 });
  let nodes = 0, best = Infinity, bestPath = [];
  while (heap.size && nodes < budget) {
    const n = heap.pop();
    for (const [d, j] of MOVES) {
      restore(play, n.snap);
      stage = n.stage;
      // Jump only matters as a fresh press: holding it on from the last move is a separate choice.
      play.app.input.jump = n.path.length ? n.path[n.path.length - 1][1] : false;
      let r = null;
      for (let i = 0; i < TICK && !r; i++) r = step(play, d, j);
      nodes++;
      if (r === 'win') return { result: 'win', time: play.time, path: [...n.path, [d, j]], nodes };
      if (r === 'dead' || play.time > limit) continue;
      if (stage < points.length && reached()) stage++;
      const k = `${stage}:${key(play)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const hh = h();
      if (hh < best) { best = hh; bestPath = [...n.path, [d, j]]; }
      heap.push({ f: play.time * patience + hh * 1.6, g: play.time, snap: snapshot(play), path: [...n.path, [d, j]], stage });
    }
  }
  return { result: 'unsolved', nodes, closest: best.toFixed(1), path: bestPath };
}

// Every live moment advances together, one move at a time; only the `beam` closest to an exit
// (and no two in the same spot) go on. Slower, but it never forgets to try standing still.
function sweep(world, index) {
  const play = makePlay(world, index, deaths);
  if (!searchable(play)) return { result: 'skipped', why: 'an effect acts on the player and can\'t be rewound' };
  const dist = () => {
    const p = play.player, ex = exits(play);
    return ex.length ? Math.min(...ex.map(([x, y]) => Math.hypot(x - p.cx, (y - p.cy) * 1.2))) / CW : 0;
  };
  let layer = [{ snap: snapshot(play), path: [] }], nodes = 0, best = Infinity, bestPath = [];
  while (layer.length && play.time <= limit) {
    const next = new Map();
    for (const n of layer) {
      for (const [d, j] of MOVES) {
        restore(play, n.snap);
        play.app.input.jump = n.path.length ? n.path[n.path.length - 1][1] : false;
        let r = null;
        for (let i = 0; i < TICK && !r; i++) r = step(play, d, j);
        nodes++;
        if (r === 'win') return { result: 'win', time: play.time, path: [...n.path, [d, j]], nodes };
        if (r === 'dead') continue;
        const p = play.player;
        const k = key(play).replace(/^[^|]*\|/, `${Math.round(p.x / 5)},${Math.round(p.y / 5)},${Math.sign(Math.round(p.vy / 80))},${p.ground ? 1 : 0},${p.gdir}|`);
        const h = dist();
        if (!next.has(k) || next.get(k).h > h) next.set(k, { h, snap: snapshot(play), path: [...n.path, [d, j]] });
      }
    }
    layer = [...next.values()].sort((a, b) => a.h - b.h).slice(0, beam);
    if (layer[0] && layer[0].h < best) { best = layer[0].h; bestPath = layer[0].path; }
  }
  return { result: 'unsolved', nodes, closest: best.toFixed(1), path: bestPath };
}

const worlds = await loadWorlds();
const targets = args.flatMap((a) => {
  const w = worlds.find((x) => x.id === a);
  if (w) return w.levels.map((_, i) => [w, i]);
  const [wid, n] = a.split('.'), ww = worlds.find((x) => x.id === wid);
  if (!ww || !ww.levels[n - 1]) throw new Error(`no level "${a}"`);
  return [[ww, n - 1]];
});

// Mindless ways to play: if one of these wins, the level isn't asking anything of you.
const NAIVE = [
  ['hold right', 'R1200'],
  ['hold right and jump', 'RJ1200'],
  ...[3, 5, 7, 9, 12, 16].map((k) => [`right, hop every ${k / 20} s`, Array(80).fill(`RJ3 R${k}`).join(' ')]),
  ...[3, 5, 7, 9, 12, 16].map((k) => [`right, full jump every ${k / 20} s`, Array(60).fill(`RJ9 R${k}`).join(' ')]),
  ['hold left', 'L1200'],
  ...[5, 9].map((k) => [`left, hop every ${k / 20} s`, Array(80).fill(`LJ3 L${k}`).join(' ')]),
];

let failed = 0;
if (naive) {
  for (const [w, i] of targets) {
    const id = `${w.id}.${i + 1}`, wins = NAIVE.filter(([, script]) => run(makePlay(w, i, deaths), parse(script)).result === 'win').map(([n]) => n);
    console.log(`${id} ${w.levels[i].name.en}: ${wins.length ? 'BEATEN BY ' + wins.join('; ') : 'holds up'}`);
    if (wins.length) failed++;
  }
  process.exit(failed ? 1 : 0);
}
for (const [w, i] of targets) {
  const id = `${w.id}.${i + 1}`, name = w.levels[i].name.en;
  const t0 = performance.now();
  if (replay) {
    const r = run(makePlay(w, i, deaths), parse(replay));
    console.log(`${id} ${name}: ${r.result} at ${r.time.toFixed(2)}s`);
    if (r.result !== 'win') failed++;
    continue;
  }
  // A recorded route proves the level in a moment; one that stopped winning is news.
  const route = !searchOnly && !beam && !via.length && routes[id];
  if (route) {
    const rr = run(makePlay(w, i, deaths), parse(route));
    if (rr.result === 'win') { console.log(`${id} ${name}: won by its recorded route in ${rr.time.toFixed(2)}s`); continue; }
    console.log(`${id} ${name}: ROUTE BROKEN (${rr.result} at ${rr.time.toFixed(2)}s), searching instead`);
  }
  // Hurry first; if that fails, try again willing to wait longer and longer.
  let r;
  for (const p of beam ? [0] : patiences) {
    r = beam ? sweep(w, i) : solve(w, i, p);
    if (r.result !== 'unsolved') break;
  }
  const ms = (performance.now() - t0).toFixed(0);
  if (r.result === 'win') {
    let note = '';
    if (slack) {
      // Re-time the way found: each move held a tick shorter or longer, at random.
      let rng = 7, ok = 0;
      const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const moves = parse(compact(r.path));
      for (let k = 0; k < 40; k++) {
        const nudged = moves.map(([d, j, n]) => [d, j, Math.max(1, n + (rand() < 0.3 ? (rand() < 0.5 ? -1 : 1) : 0))]);
        nudged.push([0, false, 40]);
        if (run(makePlay(w, i, deaths), nudged).result === 'win') ok++;
      }
      note = `, slack ${Math.round(ok / 40 * 100)}%`;
    }
    console.log(`${id} ${name}: solved in ${r.time.toFixed(2)}s (${r.nodes} tries, ${ms} ms${note})\n    ${compact(r.path)}`);
  }
  else if (r.result === 'skipped') console.log(`${id} ${name}: skipped (${r.why})`);
  else { failed++; console.log(`${id} ${name}: NOT SOLVED (${r.nodes} tries, ${ms} ms, got within ${r.closest} cells)\n    closest: ${compact(r.path)}`); }
}
process.exit(failed ? 1 : 0);
