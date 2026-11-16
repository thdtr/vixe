import { CW, CH, COLS } from '../config.js';
import { t, loc } from '../core/i18n.js';
import { TITLE } from '../core/themes.js';
import { stopwatch } from './menu.js';

const GRID_COL = 27;     // where level cells start
const CELL = 4;          // width of a level cell
const REST = 0.4;        // seconds the cursor rests on a world before its music starts
const backLabel = () => `< ${t('menu.back')}`;

export class Select {
  constructor(app) {
    this.app = app;
    this.row = 0;
    this.col = 0;
    this.held = null;        // target under a finger that is still down
  }

  enter({ world, index } = {}) {
    const worlds = this.app.progress.listed();
    if (world && worlds.includes(world)) {
      this.row = worlds.indexOf(world);
      this.col = index ?? 0;
    } else {
      const at = this.app.progress.resume();
      this.row = at ? worlds.indexOf(at.world) : 0;
      this.col = at ? at.index : 0;
    }
    this.time = 0;
    this.heard = -1;         // the row the cursor was on last step,
    this.rest = 0;           // and how long it has rested there
    this.app.audio.mod('far', true);
  }

  get worlds() { return this.app.progress.listed(); }

  // The world under the cursor is heard as well as seen, from behind its door. Only once
  // the cursor rests there, so running down the list doesn't start seven songs.
  listen(dt) {
    const app = this.app, shown = this.worlds[this.row];
    if (this.heard !== this.row) { this.heard = this.row; this.rest = 0; }
    if ((this.rest += dt) < REST) return;
    const open = app.progress.worldOpen(shown) && shown.music;
    app.audio.intensity(open ? 0 : app.depth());
    app.audio.music(open ? shown.music : TITLE);
  }

  update(dt) {
    const app = this.app, input = app.input, worlds = this.worlds;
    this.time += dt;
    const shown = worlds[this.row];
    if (app.progress.worldOpen(shown)) app.backdrop(shown).update(dt);
    this.listen(dt);
    if (input.backed()) return app.go('title');
    const dy = input.axis('up', 'down');
    const dx = input.axis('left', 'right');
    if (dx || dy) {
      this.row = (this.row + dy + worlds.length) % worlds.length;
      const n = worlds[this.row].levels.length;
      this.col = Math.min(n - 1, Math.max(0, this.col + dx));
      app.audio.play('tick');
    }
    // A tap counts where the finger lands and lifts on the same target. The
    // first tap on a level selects it; the play button (or a second tap) starts it.
    let tap;
    while ((tap = input.tap())) {
      const target = this.targetAt(tap.x, tap.y);
      if (!target || target !== this.targetAt(tap.x0, tap.y0)) continue;
      if (target === 'back') return app.go('title');
      if (target === 'play') return this.start();
      const [w, c] = target.split(':').map(Number);
      const col = c < 0 ? Math.min(this.col, worlds[w].levels.length - 1) : c;
      if (w === this.row && col === this.col) {
        if (c >= 0) return this.start();
        continue;
      }
      this.row = w;
      this.col = col;
      app.audio.play('tick');
    }
    const p = input.point, held = p && this.targetAt(p.x, p.y);
    this.held = held && held === this.targetAt(p.x0, p.y0) ? held : null;
    if (input.confirmed()) this.start();
  }

  // Six worlds sit two rows apart; more squeeze in, the last one at row 13 at most, so a
  // clear row is left above the level info at row 15.
  get gap() { return Math.min(2, 10 / (this.worlds.length - 1)); }

  rowOf(i) { return 3 + i * this.gap; }

  // What a point lands on: 'back', 'play', or 'world:level' (level -1 is the
  // world's name). Each world owns the whole band between its neighbors.
  targetAt(x, y) {
    if (y < 3 * CH && x < (backLabel().length + 3) * CW) return 'back';
    const b = this.playBox();
    if (this.app.progress.levelOpen(this.worlds[this.row], this.col) && x >= b.x && x < b.x + b.w && y >= b.y) return 'play';
    const w = Math.floor((y / CH - 3) / this.gap + 0.5);
    if (w < 0 || w >= this.worlds.length) return null;
    const c = Math.max(-1, Math.floor((x / CW - GRID_COL + 0.5) / CELL));
    return c < this.worlds[w].levels.length ? `${w}:${c}` : null;
  }

  playBox() {
    const label = `${t('select.play')}  >`;
    const col = Math.floor((COLS - label.length) / 2);
    return { label, col, x: (col - 4) * CW, y: 17 * CH, w: (label.length + 8) * CW };
  }

  start() {
    const app = this.app, world = this.worlds[this.row];
    if (!app.progress.levelOpen(world, this.col)) {
      app.audio.play('bonk');
      return;
    }
    app.audio.play('select');
    app.start({ world, index: this.col });
  }

  draw(screen) {
    const app = this.app, pal = app.palette(), progress = app.progress, save = app.save;
    screen.begin(pal.bg);
    // The world under the cursor, seen through a dark glass.
    const shown = this.worlds[this.row];
    if (progress.worldOpen(shown)) app.backdrop(shown).paint(screen, 0.72);
    screen.center(t('select.title'), 1, pal.hud);

    // Under a finger: a soft block behind whatever will be chosen on release.
    const held = this.held?.split(':').map(Number);
    if (held) {
      const r = this.rowOf(held[0]);
      if (held[1] < 0) screen.fill(CW, r * CH - 6, 25 * CW, CH + 12, pal.accent, 0.16);
      else screen.fill((GRID_COL + held[1] * CELL - 1) * CW, r * CH - 6, CELL * CW, CH + 12, pal.accent, 0.16);
    }
    if (this.held === 'back') screen.fill(CW / 2, CH - 6, (backLabel().length + 1) * CW, CH + 12, pal.accent, 0.16);

    const finished = progress.finished();
    this.worlds.forEach((w, i) => {
      const r = this.rowOf(i), open = progress.worldOpen(w);
      const name = open ? loc(w.name).toUpperCase() : t('select.lockedWorld');
      screen.text(progress.code(w), 2, r, open ? w.palette.accent : pal.dim);
      screen.text(name.slice(0, 20), 5, r, i === this.row ? pal.text : pal.dim);
      // After the ending, each finished world has a slot for a run without deaths.
      if (finished && open && progress.complete(w)) screen.glyph('*', 25 * CW, r * CH, save.flawless.includes(w.id) ? pal.exit : pal.dim);
      w.levels.forEach((lv, j) => {
        const c = GRID_COL + j * CELL;
        const isOpen = progress.levelOpen(w, j), done = progress.done(lv);
        const label = isOpen ? String(j + 1).padStart(2, '0') : '--';
        screen.text(label, c, r, done ? pal.text : progress.skipped(lv) ? pal.hazard : isOpen ? pal.accent : pal.dim);
        if (save.secrets.includes(lv.id)) screen.glyph('$', (c + 2) * CW, r * CH - 6, pal.exit);
        else if (finished && isOpen && progress.hasSecret(lv)) screen.glyph('$', (c + 2) * CW, r * CH - 6, pal.dim);
        if (i === this.row && j === this.col) {
          const blink = Math.sin(this.time * 8) > -0.3;
          if (blink) {
            screen.glyph('[', (c - 1) * CW, r * CH, pal.player);
            screen.glyph(']', (c + 2) * CW, r * CH, pal.player);
          }
        }
      });
    });

    const world = this.worlds[this.row], lv = world.levels[this.col];
    const open = progress.levelOpen(world, this.col);
    const rec = save.levels[lv.id];
    const info = 15;
    if (open) {
      screen.center(`${progress.code(world)}-${this.col + 1}  ${loc(lv.name).toUpperCase()}`, info, pal.text);
      if (rec) {
        // Levels beaten before the stopwatch existed have no time yet.
        const stats = rec.done
          ? t('select.stats', { deaths: rec.deaths || 0, best: rec.best ?? 0 }) + (rec.time ? `   ${t('select.time', { time: stopwatch(rec.time) })}` : '')
          : t(rec.skipped ? 'select.skipped' : 'select.tries', { deaths: rec.deaths || 0 });
        screen.center(stats, info + 1, pal.dim);
      }
      const b = this.playBox();
      screen.fill(b.x + 2 * CW, 18 * CH - 6, b.w - 4 * CW, CH + 12, pal.accent, this.held === 'play' ? 0.32 : 0.14);
      screen.text(b.label, b.col, 18, pal.accent);
    } else {
      screen.center(t('select.locked'), info, pal.dim);
    }
    if (save.secrets.length || finished) {
      screen.text(`$ ${save.secrets.length}/${progress.secretsTotal()}`, COLS - 9, 19, pal.exit);
    }
    if (!app.input.touchDevice) screen.text(t('select.hintKeys'), 1, 19, pal.dim);
    screen.text(backLabel(), 1, 1, pal.text);
    const deaths = `${t('hud.deaths')} ${save.deaths}`;
    screen.text(deaths, COLS - deaths.length - 1, 1, pal.dim);
  }
}
