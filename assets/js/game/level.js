import { CW, CH, MAP_COLS, MAP_ROWS, MAP_H, PHYS } from '../config.js';
import { tileOf } from './tiles.js';
import { loc } from '../core/i18n.js';

// Level data:
//   map:    18 strings of up to 64 chars (see tiles.js)
//   marks:  optional overlay with the same layout.
//           lowercase a-z: the tile below belongs to that group (a movable body)
//           uppercase A-Z: the cell belongs to that trigger zone
//   hidden: groups that start invisible, e.g. "bc"
//   signs:  texts for each "?" in reading order
//   words:  localized solid text placed on the map: { at: [x, y], text: {...}, group? }
//   fields: zones that change how you fall while you're inside them:
//           { "A": { gravity: -1, weight: 0.3, push: [dx, dy] (cells/s), off: true } }
//           A field may cover a rect instead, { "pull": { at: [x, y, w, h], ... } }:
//           its name then works as a zone too.
//   events: see events.js

const isGroup = (c) => c >= 'a' && c <= 'z';
const isZone = (c) => c >= 'A' && c <= 'Z';
const shrink = (r, e) => ({ x: r.x + e, y: r.y + e, w: r.w - e * 2, h: r.h - e * 2 });
// The cells a rect covers; an edge lying exactly on a cell line stays out.
const span = (r) => ({
  x0: Math.floor(r.x / CW), x1: Math.floor((r.x + r.w - 0.001) / CW),
  y0: Math.floor(r.y / CH), y1: Math.floor((r.y + r.h - 0.001) / CH),
});
export const overlaps = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

class Body {
  constructor(id) {
    this.id = id;
    this.cells = [];
    this.index = new Map();
    this.box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    this.ox = 0;
    this.oy = 0;
    this.vx = 0;               // how fast it moved last step, for leaping off it
    this.visible = true;
    this.motion = null;
    this.wobble = 0;
  }

  add(cell) {
    this.cells.push(cell);
    this.index.set(cell.y * MAP_COLS + cell.x, cell);
    const b = this.box;
    b.x0 = Math.min(b.x0, cell.x); b.x1 = Math.max(b.x1, cell.x);
    b.y0 = Math.min(b.y0, cell.y); b.y1 = Math.max(b.y1, cell.y);
  }

  // Empties the body and hands its cells back (they can be add()ed again later).
  take() {
    const cells = this.cells;
    this.cells = [];
    this.index.clear();
    this.box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    return cells;
  }

  // Quick rejection before testing cell by cell.
  near(r) {
    const b = this.box;
    return overlaps(b.x0 * CW + this.ox, b.y0 * CH + this.oy, (b.x1 - b.x0 + 1) * CW, (b.y1 - b.y0 + 1) * CH, r.x, r.y, r.w, r.h);
  }

  at(x, y) {
    return this.index.get(y * MAP_COLS + x);
  }

  get home() {
    return this.visible && !this.ox && !this.oy;
  }
}

export class Level {
  constructor(def) {
    this.grid = new Array(MAP_COLS * MAP_ROWS).fill(' ');
    this.bodies = new Map();
    this.zones = new Map();
    this.signs = new Map();
    this.spawn = { x: 1, y: 1 };
    this.version = 0;
    this.tide = null;                 // rising acid: { y, speed, to } in pixels
    this.fields = new Map(Object.entries(def.fields || {}).map(([id, f]) => [id, { ...f, on: !f.off }]));

    let sign = 0;
    for (let y = 0; y < MAP_ROWS; y++) {
      const row = def.map[y] || '', marks = def.marks?.[y] || '';
      for (let x = 0; x < MAP_COLS; x++) {
        let ch = row[x] || ' ';
        const mark = marks[x] || ' ', i = y * MAP_COLS + x;
        if (ch === '@') { this.spawn = { x, y }; ch = ' '; }
        if (ch === '?') this.signs.set(i, def.signs?.[sign++]);
        if (isZone(mark)) {
          if (!this.zones.has(mark)) this.zones.set(mark, new Set());
          this.zones.get(mark).add(i);
        }
        if (isGroup(mark) && ch !== ' ') this.group(mark).add({ x, y, ch });
        else this.grid[i] = ch;
      }
    }
    for (const w of def.words || []) {
      const [x0, y] = w.at;
      [...loc(w.text)].forEach((ch, k) => {
        const x = x0 + k;
        if (ch === ' ' || x >= MAP_COLS) return;
        // A grouped word owns its cells: whatever was drawn there before is replaced.
        this.grid[y * MAP_COLS + x] = w.group ? ' ' : ch;
        if (w.group) this.group(w.group).add({ x, y, ch });
      });
    }
    for (const id of def.hidden || '') this.group(id).visible = false;
    for (const [id, f] of this.fields) {
      if (!f.at) continue;
      const [x0, y0, w, h] = f.at, cells = new Set();
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.add(y * MAP_COLS + x);
      this.zones.set(id, cells);
    }
  }

  group(id) {
    if (!this.bodies.has(id)) this.bodies.set(id, new Body(id));
    return this.bodies.get(id);
  }

  // Outside the map: walls on the sides, open air above and below.
  at(x, y) {
    if (x < 0 || x >= MAP_COLS) return '#';
    if (y < 0 || y >= MAP_ROWS) return ' ';
    return this.grid[y * MAP_COLS + x];
  }

  set(i, ch) {
    this.grid[i] = ch;
    this.version++;
  }

  // Changes whenever the cached picture of the static map would be stale.
  get key() {
    let k = String(this.version);
    for (const b of this.bodies.values()) k += b.home ? 'h' : 'm';
    return k;
  }

  // Calls fn(px, py, tile, index, body, cell) for every tile overlapping the rect.
  query(r, fn) {
    const { x0, x1, y0, y1 } = span(r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tileOf(this.at(x, y));
        if (t) fn(x * CW, y * CH, t, x >= 0 && x < MAP_COLS && y >= 0 && y < MAP_ROWS ? y * MAP_COLS + x : -1, null, null);
      }
    }
    for (const b of this.bodies.values()) {
      if (!b.visible || !b.near(r)) continue;
      for (const c of b.cells) {
        const px = c.x * CW + b.ox, py = c.y * CH + b.oy;
        if (overlaps(px, py, CW, CH, r.x, r.y, r.w, r.h)) fn(px, py, tileOf(c.ch), -1, b, c);
      }
    }
  }

  solidAt(r, except = null) {
    let hit = false;
    this.query(r, (px, py, t, i, b) => { if (t.solid && b !== except) hit = true; });
    return hit;
  }

  inZone(id, r) {
    if (Array.isArray(id)) {
      const [x, y, w, h] = id;
      return overlaps(r.x, r.y, r.w, r.h, x * CW, y * CH, w * CW, h * CH);
    }
    const cells = this.zones.get(id);
    if (!cells) return false;
    const { x0, x1, y0, y1 } = span(r);
    for (let y = Math.max(0, y0); y <= Math.min(MAP_ROWS - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(MAP_COLS - 1, x1); x++) {
        if (cells.has(y * MAP_COLS + x)) return true;
      }
    }
    return false;
  }

  // The field you're in (by your middle), the first one listed when they overlap.
  fieldAt(r) {
    const mid = { x: r.x + r.w / 2 - 0.5, y: r.y + r.h / 2 - 0.5, w: 1, h: 1 };
    for (const [id, f] of this.fields) if (f.on && this.inZone(id, mid)) return f;
    return null;
  }

  zoneCells(id) {
    return [...(this.zones.get(id) || [])];
  }

  // Would the body, moved to (ox, oy), hit static ground?
  bodyBlocked(b, ox, oy) {
    for (const c of b.cells) {
      if (!tileOf(c.ch)?.solid) continue;
      const r = { x: c.x * CW + ox + 0.5, y: c.y * CH + oy, w: CW - 1, h: CH };
      const x0 = Math.floor(r.x / CW), x1 = Math.floor((r.x + r.w) / CW);
      const y0 = Math.floor(r.y / CH), y1 = Math.floor((r.y + r.h - 0.001) / CH);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (y >= 0 && y < MAP_ROWS && x >= 0 && x < MAP_COLS && tileOf(this.grid[y * MAP_COLS + x])?.solid) return true;
        }
      }
    }
    return false;
  }

  // Moves bodies, carrying whoever stands on them. Returns 'crush' if the
  // player got squeezed against something solid, 'land' when a body lands.
  update(dt, player) {
    let result = null;
    const tide = this.tide;
    if (tide?.speed) tide.y = Math.max(tide.to, tide.y - tide.speed * CH * dt);
    for (const b of this.bodies.values()) {
      if (b.wobble > 0) b.wobble = Math.max(0, b.wobble - dt);
      const m = b.motion;
      if (!m) { b.vx = 0; continue; }
      let nx = b.ox, ny = b.oy, wrapped = false;

      if (m.type === 'fall') {
        m.vy = Math.min(m.vy + PHYS.bodyGravity * dt, PHYS.bodyMaxFall);
        ny += m.vy * dt * m.dir;
        if (m.land && this.bodyBlocked(b, nx, ny)) {
          ny = m.dir > 0 ? Math.floor(ny / CH) * CH : Math.ceil(ny / CH) * CH;
          while (this.bodyBlocked(b, nx, ny) && Math.abs(ny - b.oy) >= 1) ny -= CH * m.dir;
          b.motion = null;
          result ??= 'land';
        } else if (Math.abs(ny) > MAP_H + CH * 2) {
          b.visible = false;
          b.motion = null;
        }
      } else if (m.type === 'move') {
        const was = m.t;
        m.t += dt * m.speed / m.len;
        let p = m.t;
        if (m.loop === 'wrap') {
          // Back to the start in one jump, like a meteor that falls again from the top.
          wrapped = Math.floor(p) > Math.floor(was);
          p %= 1;
        } else if (m.loop) {
          p %= 2;
          if (p > 1) p = 2 - p;
        } else if (p >= 1) {
          p = 1;
          b.motion = null;
        }
        const e = m.loop || m.linear ? p : p * p * (3 - 2 * p);
        nx = m.fx + (m.tx - m.fx) * e;
        ny = m.fy + (m.ty - m.fy) * e;
      } else if (m.type === 'orbit') {
        m.a += dt * m.dir * Math.PI * 2 / m.period;
        nx = m.cx + Math.cos(m.a) * m.rx;
        ny = m.cy + Math.sin(m.a) * m.ry;
      }

      const dx = nx - b.ox, dy = ny - b.oy;
      b.ox = nx;
      b.oy = ny;
      b.vx = wrapped ? 0 : dx / dt;
      if (wrapped) { if (player.ground === b) player.ground = null; continue; }
      if (!b.visible || !player.alive || (!dx && !dy)) continue;
      if (player.ground === b) {
        player.carry(dx, dy, this);
        if (this.solidAt(shrink(player.rect, 0.5), b)) { result = 'crush'; continue; }
      }
      if (this.push(b, player, dx, dy)) result = 'crush';
    }
    return result;
  }

  // Shoves the player out of a body that moved into them.
  push(b, player, dx, dy) {
    const r = shrink(player.rect, 0.01);
    let lo = Infinity, hi = -Infinity, hit = false;
    for (const c of b.cells) {
      if (!tileOf(c.ch)?.solid) continue;
      const px = c.x * CW + b.ox, py = c.y * CH + b.oy;
      if (!overlaps(px, py, CW, CH, r.x, r.y, r.w, r.h)) continue;
      hit = true;
      if (Math.abs(dy) >= Math.abs(dx)) { lo = Math.min(lo, py); hi = Math.max(hi, py + CH); }
      else { lo = Math.min(lo, px); hi = Math.max(hi, px + CW); }
    }
    if (!hit) return false;
    if (Math.abs(dy) >= Math.abs(dx)) player.y = dy > 0 ? hi : lo - PHYS.h;
    else player.x = dx > 0 ? hi : lo - PHYS.w;
    return this.solidAt(shrink(player.rect, 0.5), b);
  }
}
