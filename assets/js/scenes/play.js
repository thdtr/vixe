import { CW, CH, COLS, MAP_COLS, MAP_Y, MAP_W, MAP_H, PHYS, VIEW_W, VIEW_H } from '../config.js';
import { Level, overlaps } from '../game/level.js';
import { Player } from '../game/player.js';
import { Events } from '../game/events.js';
import { drawStatic, drawLive, drawBodies, drawFields, drawTide, drawPlayer, Particles } from '../game/render.js';
import { t, loc } from '../core/i18n.js';
import { Menu } from './menu.js';

// Deaths on one level (all tries, saved) before the pause menu offers to skip it.
const SKIP_AFTER = 25;

export class Play {
  constructor(app) {
    this.app = app;
    this.particles = new Particles();
    this.pauseMenu = new Menu([
      { label: () => t('menu.resume'), run: () => this.setPaused(false) },
      { label: () => t('menu.restart'), run: () => { this.setPaused(false); this.restart(); } },
      { label: () => t('menu.skip'), run: () => this.skip(), hidden: () => !this.canSkip },
      { label: () => t('menu.levels'), run: () => { app.run = null; app.go('select', { world: this.world, index: this.index }); } },
      { label: () => t('menu.options'), run: () => app.go('options', { back: this }) },
      { label: () => t('menu.title'), run: () => { app.run = null; app.go('title'); } },
    ]);
  }

  enter({ world, index }) {
    this.world = world;
    this.index = index;
    this.def = world.levels[index];
    this.attempt = 0;
    this.paused = false;
    const app = this.app;
    // A world played start to finish without a single death or restart: { world, at }
    // is the level the run expects next. Coming in anywhere else drops it.
    if (index === 0) app.run = { world: world.id, at: 0 };
    else if (app.run?.world !== world.id || app.run.at !== index) app.run = null;
    app.audio.music(world.music);
    this.reset();
    // Without thumb lanes the touch zones are invisible: say once where they are.
    if (app.input.touchDevice && !app.screen.lanes && !app.touchHinted) {
      app.touchHinted = true;
      this.say(t(app.save.touchSwap ? 'touch.hintSwap' : 'touch.hint'), 4);
    }
  }

  // Back from the options opened in the pause menu: still paused.
  resume() {
    this.app.audio.music(this.world.music);
    this.app.audio.muffle(this.paused);
  }

  // By choice, not by dying: still counts against a run without deaths.
  restart() {
    this.app.run = null;
    this.reset();
  }

  reset() {
    this.level = new Level(this.def);
    this.player = new Player(this.level.spawn);
    this.player.crown = !!this.app.save.flags.crown;
    this.events = new Events(this.def.events);
    this.time = 0;
    this.ticks = 0;
    this.state = 'play';
    this.stateT = 0;
    this.reversed = false;
    this.gravity = 1;            // which way the level pulls; a field can override it while you're in it
    this.weight = this.def.weight ?? 1;
    this.flipT = -1;
    this.dark = this.def.dark || 0;
    this.ease = 1;
    this.glitch = 0;
    this.flash = 0;
    this.shakeT = 0;
    this.freeze = 0;
    this.msg = null;
    this.sign = null;
    this.flags = {};
    this.collected = false;
    this.particles.list.length = 0;
  }

  get inputMode() { return this.paused ? 'menu' : 'play'; }

  get canSkip() {
    const rec = this.app.save.levels[this.def.id];
    return !!rec && !rec.done && (rec.deaths || 0) >= SKIP_AFTER;
  }

  setPaused(on) {
    this.paused = on;
    this.pauseMenu.index = 0;
    this.app.audio.muffle(on);
  }

  // ---- API used by traps (see events.js) ----

  // x (map pixels) puts the sound a little to the left or right, where it happened.
  sfx(name, x) { this.app.audio.play(name, Number.isFinite(x) ? (x / MAP_W * 2 - 1) * 0.3 : 0); }
  // Deaths buzz by default; jumps and landings too if the player asked for it.
  buzz(ms, death = false) {
    const v = this.app.save.vibrate;
    if (v === 'all' || (v === 'deaths' && death)) navigator.vibrate?.(ms);
  }
  shake(v) { if (this.app.save.shake) this.shakeT = Math.max(this.shakeT, v); }
  say(text, time = 2.5) { this.msg = { text: loc(text), t: time, age: 0 }; }

  setGravity(dir) {
    this.gravity = dir;
    this.applyFields();
  }

  // What pulls on you right now: the level's gravity, unless a field says otherwise.
  applyFields() {
    const p = this.player, f = this.level.fieldAt(p.rect);
    p.weight = f?.weight ?? this.weight;
    p.push = f?.push;
    const dir = f?.gravity ?? this.gravity;
    if (dir === p.gdir) return;
    p.gdir = dir;
    p.ground = null;
    // Bobbing on the edge of a beam flips you often: only the first flip is heard.
    if (this.time - this.flipT > 0.3) this.sfx('flip', p.cx);
    this.flipT = this.time;
  }

  kill() {
    if (this.state !== 'play') return;
    const p = this.player, save = this.app.save;
    p.alive = false;
    this.app.run = null;
    this.state = 'dead';
    this.stateT = 0.8;
    this.freeze = 0.07;
    this.attempt++;
    save.deaths++;
    const rec = save.levels[this.def.id] ??= {};
    rec.deaths = (rec.deaths || 0) + 1;
    this.app.persist();
    this.particles.burst(p.cx, p.cy, '@*#%x+.:,', 22, 260, this.world.palette.player, { life: 0.9 });
    this.particles.burst(p.cx, p.cy, '.,', 10, 140, this.world.palette.hazard, { life: 0.6 });
    this.sfx('die', p.cx);
    this.app.audio.dip();
    this.shake(0.3);
    this.buzz(35, true);
    const milestone = { 100: 'egg.d100', 404: 'egg.d404', 666: 'egg.d666', 1000: 'egg.d1000' }[save.deaths];
    if (milestone) this.say(t(milestone), 4);
    else if (rec.deaths === SKIP_AFTER && !rec.done) this.say(t('skip.hint'), 4);
  }

  get flawless() {
    const run = this.app.run;
    return !!run && run.world === this.world.id && run.at === this.index;
  }

  // The last door of a world, reached without dying once, for the first time.
  get perfectWorld() {
    return this.flawless && this.index === this.world.levels.length - 1 && !this.app.save.flawless.includes(this.world.id);
  }

  win() {
    if (this.state !== 'play') return;
    this.state = 'win';
    this.stateT = 0.55;
    if (this.perfectWorld) {   // hold the moment
      this.stateT = 2.4;
      this.say(t('flawless.done'), 2.4);
    }
    this.sfx('win', this.player.cx);
    this.particles.burst(this.player.cx, this.player.cy, '+\'.', 14, 120, this.world.palette.exit, { gravity: -80, life: 0.6 });
  }

  complete() {
    const save = this.app.save;
    const rec = save.levels[this.def.id] ??= {};
    rec.done = true;
    rec.best = Math.min(rec.best ?? Infinity, this.attempt);
    if (this.perfectWorld) save.flawless.push(this.world.id);
    if (this.flawless) this.app.run.at++;
    this.advance();
  }

  // Gives up on this level: the way on opens, the crown waits until it is beaten.
  skip() {
    this.app.save.levels[this.def.id].skipped = true;
    this.app.run = null;
    this.setPaused(false);
    this.advance();
  }

  advance() {
    const app = this.app;
    app.persist();
    const last = this.index === this.world.levels.length - 1;
    if (last && this.world.ending) return app.go('ending', { kind: this.world.ending, world: this.world });
    const next = app.progress.next(this.world, this.index);
    if (!next) return app.go('select', { world: this.world, index: this.index });
    if (next.world !== this.world) return app.go('intro', next);
    app.go('play', next, { quick: true });
  }

  // ---- loop ----

  update(dt) {
    const input = this.app.input;
    if (this.paused) {
      if (input.backed()) this.setPaused(false);
      else this.pauseMenu.update(this.app);
      return;
    }
    // Pause on request, and while the device is upright and the level hidden behind the rotate card.
    if (input.pressed('pause') || this.app.portrait.matches) return this.setPaused(true);
    if (input.pressed('restart') && this.state === 'play') return this.restart();
    if (input.consume('iddqd') || input.consume('idkfa')) this.say(t('egg.cheat'), 3);

    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
    if (this.msg) this.msg.age += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.glitch = Math.max(0, this.glitch - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.particles.update(dt);
    if (this.freeze > 0) { this.freeze -= dt; return; }

    if (this.state === 'dead') {
      if ((this.stateT -= dt) <= 0) this.reset();
      return;
    }
    if (this.state === 'win') {
      this.time += dt;
      if ((this.stateT -= dt) <= 0) this.complete();
      return;
    }
    this.step(dt, input);
  }

  step(dt, input) {
    const p = this.player, pal = this.world.palette;
    this.time += dt;
    this.ticks++;

    const bodies = this.level.update(dt, p);
    if (bodies === 'crush') return this.kill();
    if (bodies === 'land') { this.sfx('thud'); this.shake(0.12); }

    let dir = input.axis('left', 'right', 'held');
    if (this.reversed) dir = -dir;
    const jump = input.held('jump') || input.held('up');
    this.applyFields();
    p.update(dt, { dir, jump, jumpPressed: input.pressed('jump') || input.pressed('up') }, this.level);

    for (const i of p.revealed) {
      if (this.level.grid[i] !== '&') continue;
      this.level.set(i, '#');
      this.sfx('bonk', (i % MAP_COLS) * CW + CW / 2);
      this.particles.burst((i % MAP_COLS) * CW + CW / 2, ((i / MAP_COLS) | 0) * CH + CH / 2, '.\'', 6, 80, pal.wall, { life: 0.4 });
    }
    const feet = p.gdir > 0 ? p.y + PHYS.h : p.y;
    if (p.jumped) {
      this.sfx('jump', p.cx);
      this.buzz(12);
      this.particles.burst(p.cx, feet, '.', 3, 40, pal.dots, { gravity: 0, life: 0.3 });
    }
    if (p.landed) {
      this.sfx('land', p.cx);
      this.buzz(8);
      this.particles.burst(p.cx, feet, '.,', 4, 50, pal.wall, { angle: -Math.PI / 2 * p.gdir, spread: 2.4, life: 0.3 });
    }
    if (p.idle > 20 && this.ticks % 100 === 0) {
      this.particles.burst(p.cx + 4, p.y, 'zZ', 1, 12, pal.dim, { angle: -1.2, spread: 0.4, gravity: -6, life: 1.6 });
    }

    this.collected = false;
    this.touch();
    if (this.state !== 'play') return;
    if (p.y > MAP_H + CH * 2 || p.y < -CH * 3) return this.kill();
    if (this.level.tide && p.y + PHYS.h > this.level.tide.y + 7) return this.kill();
    this.events.update(dt, this);
  }

  // What the player is overlapping: hazards, exits, signs, pickups.
  touch() {
    const p = this.player, r = p.rect, level = this.level;
    let dead = false, exit = false;
    this.sign = null;
    level.query(r, (px, py, tile, i, body, cell) => {
      const box = tile.hazard || tile.exit;
      if (box) {
        const [x, y, w, h] = box;
        if (overlaps(r.x, r.y, r.w, r.h, px + x, py + y, w, h)) tile.hazard ? dead = true : exit = true;
      } else if (tile.sign && i >= 0) {
        this.sign = level.signs.get(i);
      } else if (tile.pickup) {
        if (cell) cell.ch = ' '; else level.set(i, ' ');
        this.collect(px, py);
      }
    });
    if (dead) this.kill();
    else if (exit) this.win();
  }

  collect(x, y) {
    const save = this.app.save;
    this.collected = true;
    // Already in the save from an earlier try: the ghost just pops, no fanfare.
    if (save.secrets.includes(this.def.id)) {
      this.sfx('pop', x + CW / 2);
      this.particles.burst(x + CW / 2, y + CH / 2, '.\'', 6, 80, this.world.palette.dim, { life: 0.4 });
      return;
    }
    save.secrets.push(this.def.id);
    this.app.persist();
    this.sfx('coin', x + CW / 2);
    this.say(t('secret.found', { n: save.secrets.length, total: this.app.progress.secretsTotal() }), 3);
    this.particles.burst(x + CW / 2, y + CH / 2, '$*.', 12, 120, this.world.palette.exit, { gravity: 100 });
  }

  // ---- drawing ----

  draw(screen) {
    const pal = this.world.palette, ctx = screen.ctx;
    const k = this.shakeT > 0 ? Math.min(1, this.shakeT * 8) * 3 : 0;
    const ox = (Math.random() - 0.5) * k * 2, oy = (Math.random() - 0.5) * k * 2;
    screen.begin(pal.bg, ox, oy);
    screen.cached(`${this.def.id}:${this.level.key}`, (l) => drawStatic(screen, l, this.level, pal), ox, oy);
    const found = this.app.save.secrets.includes(this.def.id);
    drawLive(screen, this.level, pal, this.time, found);
    drawBodies(screen, this.level, pal, this.time, found);
    if (this.level.fields.size) drawFields(screen, this.level, pal, this.time);

    const p = this.player;
    if (this.state === 'play') drawPlayer(screen, p, pal);
    else if (this.state === 'win') drawPlayer(screen, p, pal, Math.max(0, this.stateT / 0.55));
    this.particles.draw(screen);
    if (this.level.tide) drawTide(screen, this.level.tide, pal, this.time);

    if (this.dark) this.drawDark(screen, pal);
    if (this.glitch > 0) this.drawGlitch(screen, pal);
    ctx.setTransform(screen.scale, 0, 0, screen.scale, 0, 0);
    this.drawHud(screen, pal);
    if (this.flash > 0) screen.fill(0, 0, VIEW_W, VIEW_H, pal.player, Math.min(0.8, this.flash * 4));
    if (this.paused) {
      screen.fill(0, 0, VIEW_W, VIEW_H, pal.bg, 0.86);
      screen.center(t('hud.paused'), 4, pal.dim);
      this.pauseMenu.draw(screen, 7, pal, this.app.clock);
      if (this.app.input.touchDevice) screen.center(t('hud.holdRestart'), 18, pal.dim);
    }
  }

  drawDark(screen, pal) {
    const ctx = screen.ctx, p = this.player;
    const x = p.cx, y = p.cy + MAP_Y, r = this.dark * CW;
    const g = ctx.createRadialGradient(x, y, r * 0.35, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, screen.color(pal.bg));
    ctx.fillStyle = g;
    ctx.fillRect(-8, MAP_Y, MAP_W + 16, MAP_H);
  }

  // Tears the picture into shifted strips and sprinkles junk glyphs.
  drawGlitch(screen, pal) {
    const ctx = screen.ctx, c = screen.canvas, s = screen.scale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 4; i++) {
      const y = Math.random() * c.height, h = (4 + Math.random() * 24) * s;
      ctx.drawImage(c, 0, y, c.width, h, (Math.random() - 0.5) * 24 * s, y, c.width, h);
    }
    ctx.restore();
    for (let i = 0; i < 14; i++) {
      const gx = (Math.random() * COLS | 0) * CW, gy = ((Math.random() * 18 | 0) + 1) * CH;
      screen.glyph('#%&$@!?/\\|'[Math.random() * 11 | 0], gx, gy, Math.random() < 0.5 ? pal.hazard : pal.accent);
    }
  }

  drawHud(screen, pal) {
    const code = `${this.app.progress.code(this.world)}-${this.index + 1}`;
    screen.text(code, 1, 0, pal.accent);
    screen.text(loc(this.def.name).toUpperCase(), code.length + 2, 0, pal.hud);
    const deaths = `${t('hud.deaths')} ${this.attempt}`;
    const right = this.app.input.touchDevice && !this.app.screen.lanes ? 6 : 1;   // room for the pause button
    screen.text(deaths, COLS - deaths.length - right, 0, this.attempt ? pal.hazard : pal.dim);
    // Once the game is over, a star rides along while the whole world is still deathless.
    if (this.flawless && this.app.progress.finished()) screen.glyph('*', (COLS - deaths.length - right - 2) * CW, 0, pal.exit);

    const line = this.msg ? this.msg.text.slice(0, Math.floor(this.msg.age * 45) + 1) : loc(this.sign);
    if (line) screen.center(line, 19, this.msg ? pal.accent : pal.text);
  }
}
