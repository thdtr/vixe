// Content packs. The base game is just the first pack; DLCs are more folders
// in assets/packs/ listed in manifest.json. A pack is:
//
//   pack.json   { id, name, worlds: ["w1.json", ...], strings?, script? }
//   wN.json     a world: { id, name, palette, music, requires?, hidden?, levels: [...] }
//   script      optional ES module exporting register(api) to add new tiles, trap
//               actions, triggers, level effects (game/fx.js), motions (game/motion.js),
//               mechanisms (game/mechanisms.js) or actors (game/actors.js).
//
// A broken pack is skipped with a warning; it never takes the base game down.

import { registerTile } from '../game/tiles.js';
import { actions, triggers } from '../game/events.js';
import { mergeStrings } from './i18n.js';
import { registerFx } from '../game/fx.js';
import { registerMotion } from '../game/motion.js';
import { registerMechanism } from '../game/mechanisms.js';
import { registerActor } from '../game/actors.js';

const api = {
  registerTile,
  registerAction: (name, fn) => { actions[name] = fn; },
  registerTrigger: (name, fn) => { triggers[name] = fn; },
  registerFx,
  registerMotion,
  registerMechanism,
  registerActor,
};

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function loadPacks(base) {
  const manifest = await json(`${base}manifest.json`);
  const worlds = [];
  for (const id of manifest.packs) {
    try {
      const dir = `${base}${id}/`;
      const pack = await json(`${dir}pack.json`);
      // The script downloads alongside the worlds; it registers once they're all in.
      const [list, script] = await Promise.all([
        Promise.all(pack.worlds.map((file) => json(dir + file))),
        pack.script && import(new URL(dir + pack.script, document.baseURI)),
      ]);
      if (pack.strings) mergeStrings(pack.strings);
      script?.register?.(api);
      for (const w of list) {
        w.levels.forEach((lv, i) => { lv.id ??= `${w.id}.${i + 1}`; });
        worlds.push(w);
      }
    } catch (err) {
      console.warn(`[packs] "${id}" skipped:`, err);
    }
  }
  return worlds;
}
