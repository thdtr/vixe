// A headless copy of the game: the real level, player, trap and mechanism code running in
// Node with no screen and no sound, driven by scripted input. Used by tools/solve.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Just enough of a browser for code that makes canvases while setting up (light, glows).
const noop = () => {};
const ctx2d = new Proxy({}, {
  get: (_, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'getTransform' ? () => ({ e: 0, f: 0 }) : noop),
  set: () => true,
});
globalThis.document ??= { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0 }), documentElement: {} };
globalThis.navigator ??= {};

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const json = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
const load = (p) => import(pathToFileURL(ROOT + p).href);

const { STEP } = await load('assets/js/config.js');
const { Play } = await load('assets/js/scenes/play.js');
const { registerTile } = await load('assets/js/game/tiles.js');
const { actions, triggers } = await load('assets/js/game/events.js');
const { registerFx } = await load('assets/js/game/fx.js');
const { mergeStrings } = await load('assets/js/core/i18n.js');
await load('assets/js/fx/index.js');
export { STEP };

// Every world of every pack in the manifest, scripts registered, as the game loads them.
export async function loadWorlds() {
  const api = { registerTile, registerFx, registerAction: (n, f) => { actions[n] = f; }, registerTrigger: (n, f) => { triggers[n] = f; } };
  const worlds = [];
  for (const id of json('assets/packs/manifest.json').packs) {
    const dir = `assets/packs/${id}/`, pack = json(dir + 'pack.json');
    if (pack.strings) mergeStrings(pack.strings);
    if (pack.script) (await load(dir + pack.script)).register?.(api);
    for (const file of pack.worlds) {
      const w = json(dir + file);
      w.levels.forEach((lv, i) => { lv.id ??= `${w.id}.${i + 1}`; });
      worlds.push(w);
    }
  }
  return worlds;
}

// The controls for one step: { dir: -1 | 0 | 1, jump: held }.
export class ScriptedInput {
  constructor() { this.dir = 0; this.jump = false; this.was = false; }
  set(dir, jump) { this.was = this.jump; this.dir = dir; this.jump = jump; }
  axis() { return this.dir; }
  held(a) { return (a === 'jump') && this.jump; }
  pressed(a) { return a === 'jump' && this.jump && !this.was; }
  consume() { return false; }
  backed() { return false; }
}

const sink = new Proxy({}, { get: () => noop });

// A play scene on a level, as the game would start it, minus the screen.
export function makePlay(world, index, deaths = 0) {
  const save = { levels: {}, secrets: [], flags: {}, deaths: 0, seen: {}, flawless: [], vibrate: 'off', shake: false, time: 0 };
  const app = {
    input: new ScriptedInput(), audio: sink, save, persist: noop, go: noop, run: null, touchHinted: true,
    screen: { lanes: false }, portrait: { matches: false },
    progress: { code: () => world.id, secretsTotal: () => 0, next: () => null, finished: () => false },
  };
  const play = new Play(app);
  play.enter({ world, index });
  play.attempt = deaths;    // mercy rules ("deaths": n) see this many earlier tries
  play.reset();
  play.attempt = deaths;
  return play;
}

// One fixed step of the level with the given controls. Returns 'win', 'dead' or null.
export function step(play, dir, jump) {
  play.app.input.set(dir, jump);
  if (play.state === 'play') play.step(STEP, play.app.input);
  return play.state === 'win' ? 'win' : play.state === 'dead' ? 'dead' : null;
}
