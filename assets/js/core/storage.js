import { SAVE_KEY } from '../config.js';

const DEFAULTS = {
  lang: 'en',
  music: 5,              // 0..8
  sfx: 7,                // 0..8
  shake: true,
  scanlines: true,
  touchSize: 1,          // 0..2: small, medium, large touch controls
  touchShow: 'touch',    // when the touch controls are drawn: 'touch' (while a thumb is down), 'always' or 'off'
  touchSwap: false,      // jump on the left, move on the right
  vibrate: 'deaths',     // 'deaths', 'all' (jumps and landings too) or 'off'
  levels: {},            // id -> { done, deaths, best }
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
  return { ...structuredClone(DEFAULTS), ...data };
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch { /* storage full or blocked: progress just won't persist */ }
}

// Settings survive "erase progress".
const SETTINGS = ['lang', 'music', 'sfx', 'shake', 'scanlines', 'touchSize', 'touchShow', 'touchSwap', 'vibrate'];

export function resetProgress(save) {
  const keep = Object.fromEntries(SETTINGS.map((k) => [k, save[k]]));
  Object.assign(save, structuredClone(DEFAULTS), keep);
  writeSave(save);
}
