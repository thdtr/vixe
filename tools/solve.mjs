// Finds a way through a level by searching inputs on the real game code, headless.
// It proves a level can be beaten, and says roughly how tight it is.
//
//   node tools/solve.mjs w1.3                 solve one level
//   node tools/solve.mjs w1 w2.4              a whole world, or several levels
//   node tools/solve.mjs w1.3 --deaths 8      as if the player had died 8 times (mercy rules)
//   node tools/solve.mjs w1.3 --replay "R20 RJ6 R10"   play a script and say what happened
//   node tools/solve.mjs w1.3 --budget 400000  search longer before giving up
//   node tools/solve.mjs w1.3 --beam 2000      sweep forward in time instead, keeping the 2000
//                                              most promising moments (finds waits and detours)
//
// A script is a list of moves, each held for a number of 1/20 s ticks: R (right), L (left),
// N (nothing), with J added to hold jump (RJ6: right and jump for 0.3 s).
// Levels with effects that act on the player (the Abyss's creatures) can't be searched.

import { loadWorlds, makePlay, step } from './sim/env.mjs';
import { snapshot, restore } from './sim/snapshot.mjs';
import { CW, CH, MAP_COLS } from '../assets/js/config.js';
import { tileOf } from '../assets/js/game/tiles.js';

const TICK = 6;                    // simulation steps per move (1/20 s)
const MOVES = [[1, false], [1, true], [0, false], [0, true], [-1, false], [-1, true]];
const NAMES = (d, j) => (d > 0 ? 'R' : d < 0 ? 'L' : 'N') + (j ? 'J' : '');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const beam = Number(opt('beam', 0)), budget = Number(opt('budget', 250000)), deaths = Number(opt('deaths', 0)), replay = opt('replay', null), limit = Number(opt('time', 60));

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

function solve(world, index) {
  const play = makePlay(world, index, deaths);
  if (play.fx.some((f) => f.update)) return { result: 'skipped', why: 'effects act on the player' };
  const heap = new Heap(), seen = new Set();
  const h = () => {
    const p = play.player, ex = exits(play);
    return ex.length ? Math.min(...ex.map(([x, y]) => Math.hypot(x - p.cx, (y - p.cy) * 1.2))) / CW : 0;
  };
  heap.push({ f: h(), g: 0, snap: snapshot(play), path: [] });
  let nodes = 0, best = Infinity, bestPath = [];
  while (heap.size && nodes < budget) {
    const n = heap.pop();
    for (const [d, j] of MOVES) {
      restore(play, n.snap);
      // Jump only matters as a fresh press: holding it on from the last move is a separate choice.
      play.app.input.jump = n.path.length ? n.path[n.path.length - 1][1] : false;
      let r = null;
      for (let i = 0; i < TICK && !r; i++) r = step(play, d, j);
      nodes++;
      if (r === 'win') return { result: 'win', time: play.time, path: [...n.path, [d, j]], nodes };
      if (r === 'dead' || play.time > limit) continue;
      const k = key(play);
      if (seen.has(k)) continue;
      seen.add(k);
      const hh = h();
      if (hh < best) { best = hh; bestPath = [...n.path, [d, j]]; }
      heap.push({ f: play.time * 10 + hh * 1.6, g: play.time, snap: snapshot(play), path: [...n.path, [d, j]] });
    }
  }
  return { result: 'unsolved', nodes, closest: best.toFixed(1), path: bestPath };
}

// Every live moment advances together, one move at a time; only the `beam` closest to an exit
// (and no two in the same spot) go on. Slower, but it never forgets to try standing still.
function sweep(world, index) {
  const play = makePlay(world, index, deaths);
  if (play.fx.some((f) => f.update)) return { result: 'skipped', why: 'effects act on the player' };
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

let failed = 0;
for (const [w, i] of targets) {
  const id = `${w.id}.${i + 1}`, name = w.levels[i].name.en;
  const t0 = performance.now();
  if (replay) {
    const r = run(makePlay(w, i, deaths), parse(replay));
    console.log(`${id} ${name}: ${r.result} at ${r.time.toFixed(2)}s`);
    if (r.result !== 'win') failed++;
    continue;
  }
  const r = beam ? sweep(w, i) : solve(w, i);
  const ms = (performance.now() - t0).toFixed(0);
  if (r.result === 'win') console.log(`${id} ${name}: solved in ${r.time.toFixed(2)}s (${r.nodes} tries, ${ms} ms)\n    ${compact(r.path)}`);
  else if (r.result === 'skipped') console.log(`${id} ${name}: skipped (${r.why})`);
  else { failed++; console.log(`${id} ${name}: NOT SOLVED (${r.nodes} tries, ${ms} ms, got within ${r.closest} cells)\n    closest: ${compact(r.path)}`); }
}
process.exit(failed ? 1 : 0);
