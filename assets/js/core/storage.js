import { SAVE_KEY } from '../config.js';

const DEFAULTS = {
  lang: 'en',
  music: 5,              // 0..8
  sfx: 7,                // 0..8
  shake: true,
  flashes: true,         // white flashes and screen tearing
  scanlines: true,
  clock: false,          // a stopwatch in the level's top bar
  touchSize: 1,          // 0..2: small, medium, large touch controls
  touchShow: 'touch',    // when the touch controls are drawn: 'touch' (while a thumb is down), 'always' or 'off'
  touchSwap: false,      // jump on the left, move on the right
  vibrate: 'deaths',     // 'deaths', 'all' (jumps and landings too) or 'off'
  phoneOk: false,        // played on a touch-only device anyway, past the keyboard warning
  levels: {},            // id -> { done, deaths, best (fewest deaths in one visit), time (fastest, seconds) }
  seen: {},              // world intro cards already shown
  deaths: 0,
  time: 0,
  secrets: [],
  flawless: [],          // worlds beaten start to finish without dying
  flags: {},
};

export function loadSave() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
  } catch { /* private mode or corrupted: start fresh */ }
  // Someone who asked their device for less motion starts with the screen held still.
  const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? { shake: false, flashes: false } : {};
  return { ...structuredClone(DEFAULTS), ...calm, ...data };
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* storage full or blocked: progress just won't persist */ }
}

// Settings survive "erase progress".
const SETTINGS = ['lang', 'music', 'sfx', 'shake', 'flashes', 'scanlines', 'clock', 'touchSize', 'touchShow', 'touchSwap', 'vibrate', 'phoneOk'];

export function resetProgress(save) {
  const keep = Object.fromEntries(SETTINGS.map((k) => [k, save[k]]));
  Object.assign(save, structuredClone(DEFAULTS), keep);
  writeSave(save);
}
