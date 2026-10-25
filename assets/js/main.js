import { STEP, COLS, ROWS, CW, CH } from './config.js';
import { Screen } from './core/screen.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { loadSave, writeSave } from './core/storage.js';
import { loadStrings, setLang, t } from './core/i18n.js';
import { loadPacks } from './core/packs.js';
import { touchIcon } from './core/icon.js';
import { Progress } from './game/progress.js';
import { hash } from './game/render.js';
import { Title } from './scenes/title.js';
import { Select } from './scenes/select.js';
import { Play } from './scenes/play.js';
import { Options } from './scenes/options.js';
import { Intro } from './scenes/intro.js';
import { Ending } from './scenes/ending.js';
import { Credits } from './scenes/credits.js';

const PHOSPHOR = '#8cffa0';
// A 60 Hz frame is exactly two steps, so the accumulator sits right on a step boundary
// and timing jitter would turn 2-2-2 into 1-3-1-3. Letting a step run this early keeps it even.
const SLACK = 0.002;
const TOUCH_SIZES = [0.85, 1, 1.25];   // small, medium, large buttons (and lanes)

// '#rrggbb' or 'rgb(r,g,b)' (a tinted color) -> 'r, g, b', for rgba() in CSS.
const triplet = (c) => (c[0] === '#' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(', ') : c.slice(4, -1));

class App {
  constructor() {
    this.screen = new Screen(document.getElementById('screen'));
    this.input = new Input(this.screen, document.getElementById('touch'));
    this.audio = new Audio();
    this.save = loadSave();
    // Same query as the "rotate your device" card in style.css.
    this.portrait = matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 599px)');
    this.clock = 0;
    this.transition = null;
    this.scene = null;
  }

  async boot() {
    // Only iOS needs it, and only before the game is added to the home screen.
    if (navigator.standalone === false) touchIcon();
    setLang(this.save.lang);
    await loadStrings('assets/i18n/');
    this.worlds = await loadPacks('assets/packs/');
    const params = new URLSearchParams(location.search);
    if (params.has('dev')) window.app = this;
    this.progress = new Progress(this.save, this.worlds, params.has('dev'));
    this.scenes = {
      title: new Title(this), select: new Select(this), play: new Play(this), options: new Options(this),
      intro: new Intro(this), ending: new Ending(this), credits: new Credits(this),
    };
    this.applySettings();

    const unlock = () => {
      this.audio.unlock();
      this.guardBack();
    };
    // A touch only counts as a gesture on pointerup, so the first tap needs both.
    addEventListener('pointerdown', unlock);
    addEventListener('pointerup', unlock);
    addEventListener('keydown', unlock);
    addEventListener('popstate', () => this.onBack());
    document.addEventListener('visibilitychange', () => {
      this.audio.suspend(document.hidden);
      if (document.hidden) {
        this.persist();
        if (this.scene === this.scenes.play && this.scene.state === 'play') this.scene.setPaused(true);
      }
    });

    document.body.classList.add('ready');
    // Dev shortcut: ?dev&play=w1.3 jumps straight into a level.
    const world = this.worlds.find((w) => w.levels.some((l) => l.id === params.get('play')));
    if (params.has('dev') && world) this.enter('play', { world, index: world.levels.findIndex((l) => l.id === params.get('play')) });
    else this.enter('title', {});
    let last = performance.now(), acc = 0;
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.clock += dt;
      acc += dt;
      this.input.poll();
      this.fitScreen();
      while (acc >= STEP - SLACK) {
        this.update(STEP);
        this.input.endStep();
        acc -= STEP;
      }
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // target: a scene name (entered fresh) or a scene object (resumed as it was).
  go(target, args = {}, { quick = false } = {}) {
    if (this.transition) return;
    this.transition = { t: 0, dur: quick ? 0.22 : 0.4, swapped: false, target, args };
  }

  // Into a level, by way of its world's title card the first time; no level: the level select.
  start(at) {
    this.fullscreen();
    if (!at) return this.go('select');
    this.go(at.index === 0 && !this.save.seen[at.world.id] ? 'intro' : 'play', at);
  }

  enter(target, args) {
    this.audio.muffle(false);   // a paused level muffles it again in Play.resume
    if (typeof target === 'string') {
      this.scene = this.scenes[target];
      this.scene.enter?.(args);
    } else {
      this.scene = target;
      target.resume?.();
    }
  }

  update(dt) {
    const tr = this.transition;
    if (tr) {
      tr.t += dt;
      if (!tr.swapped && tr.t >= tr.dur / 2) {
        tr.swapped = true;
        this.enter(tr.target, tr.args);
      }
      if (tr.t >= tr.dur) this.transition = null;
      if (!tr.swapped) return;
    }
    if (this.scene === this.scenes.play) this.save.time += dt;
    if (this.input.consume('UUDDLRLRba')) {
      this.save.flags.phosphor = !this.save.flags.phosphor;
      this.applySettings();
      this.persist();
      this.audio.play('glitch');
    }
    const mode = this.scene.inputMode || 'menu';
    if (this.input.mode !== mode) this.input.setMode(mode);
    this.scene.update(dt);
  }

  draw() {
    this.scene.draw(this.screen);
    if (this.transition) this.drawWipe();
    // Letterbox bars wear the current world's background, the touch controls its colors.
    const world = this.scene.world || this.scene.at?.world;
    const pal = world ? world.palette : this.palette();
    const bg = this.screen.color(pal.bg);
    if (bg !== this.bg) {
      this.bg = bg;
      document.body.style.background = bg;
      document.querySelector('meta[name=theme-color]').content = bg;
      const touch = document.getElementById('touch').style;
      touch.setProperty('--ui', triplet(this.screen.color(pal.hud)));
      touch.setProperty('--glow', triplet(this.screen.color(pal.accent)));
    }
  }

  // Columns of glyphs sweep across, cover the screen, then pull away.
  drawWipe() {
    const { t, dur } = this.transition;
    const s = this.screen, ctx = s.ctx, pal = this.palette();
    const p = t / dur, cover = p < 0.5 ? p * 2 : (1 - p) * 2;
    ctx.setTransform(s.scale, 0, 0, s.scale, 0, 0);
    for (let c = 0; c < COLS; c++) {
      const edge = cover * 1.35 - (c / COLS) * 0.25 - hash(c, 3) * 0.1;
      if (edge <= 0) continue;
      const h = Math.min(ROWS, Math.ceil(edge * ROWS));
      s.fill(c * CW, 0, CW, h * CH, pal.bg);
      if (h < ROWS) s.glyph('#%=-:.'[Math.min(5, ROWS - h)], c * CW, h * CH, pal.dim);
    }
  }

  // The menus wear the colors of the furthest world you've reached.
  palette() {
    const open = this.progress.listed().filter((w) => this.progress.worldOpen(w) && !w.hidden);
    return (open[open.length - 1] || this.worlds[0]).palette;
  }

  applySettings() {
    const s = this.save;
    setLang(s.lang);
    this.audio.setVolumes(s.music / 8, s.sfx / 8);
    document.body.classList.toggle('scanlines', s.scanlines);
    this.screen.setTint(s.flags.phosphor ? PHOSPHOR : null);
    document.querySelector('#rotate p').textContent = t('rotate');
    document.querySelector('#touch .jump').textContent = t('touch.jump');
    const touch = document.getElementById('touch').style;
    touch.setProperty('--size', TOUCH_SIZES[s.touchSize]);
    touch.setProperty('--alpha', s.touchAlpha / 5);
    document.body.classList.toggle('swap', s.touchSwap);
    this.input.swap = s.touchSwap;
    this.fitScreen();
  }

  // Thumb lanes on touch screens, unless the player asked for the full picture.
  // Checked every frame too: a touch can reveal a touch screen late.
  fitScreen() {
    this.screen.setThumbs(this.input.touchDevice && this.save.touchLayout !== 'full', TOUCH_SIZES[this.save.touchSize]);
  }

  // The back button (Android's, a swipe from the edge, the browser's) works like
  // Esc: it pauses, or goes back one screen. Only on the title does it leave.
  // The guard entry is pushed on a user gesture, or browsers skip it on back.
  guardBack() {
    if (!history.state?.vixe) history.pushState({ vixe: true }, '');
  }

  onBack() {
    if (this.scene === this.scenes.title && !this.transition) history.back();
    else this.input.press('pause');
  }

  persist() {
    writeSave(this.save);
  }

  fullscreen() {
    const el = document.documentElement;
    if (!this.input.touchDevice || document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => Math.min(screen.width, screen.height) < 600 && screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  }
}

const app = new App();
app.boot().catch((err) => {
  console.error(err);
  document.getElementById('boot').textContent = `:(  ${err.message || err}`;
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

console.log(
  '%c\n   ^^^^^^^^^^\n   @  > ?\n   ##########\n\n%cvocê está lendo o código. eu também estou lendo você.\nyou are reading the code. I am reading you too.\n',
  'color:#e0533d;font:14px monospace', 'color:#8a7f70;font:12px monospace',
);
