import { t, loc } from '../core/i18n.js';

// Title card shown the first time you enter a world.
export class Intro {
  constructor(app) { this.app = app; }

  enter(at) {
    this.at = at;
    this.time = 0;
    this.typed = 0;
    this.app.save.seen[at.world.id] = true;
    this.app.persist();
    this.app.audio.music(null);
  }

  update(dt) {
    const input = this.app.input;
    this.time += dt;
    const line = loc(this.at.world.tagline);
    const n = Math.min(line.length, Math.floor(Math.max(0, this.time - 0.6) * 30));
    if (n > this.typed) {
      this.typed = n;
      if (line[n - 1] !== ' ') this.app.audio.play('type');
    }
    if (this.time > 1.2 && (input.confirmed() || input.tap() || input.backed()) || this.time > 2.6 + line.length / 30) {
      this.app.go('play', this.at);
    }
  }

  draw(screen) {
    const w = this.at.world, pal = w.palette;
    screen.begin(pal.bg);
    const head = t('intro.world', { n: this.app.progress.code(w) });
    screen.center(head.split('').join(' '), 7, pal.dim);
    const name = loc(w.name).toUpperCase();
    const shown = name.slice(0, Math.ceil(Math.min(1, this.time * 2.5) * name.length));
    screen.center(shown, 9, pal.accent, name.length);
    screen.center('-'.repeat(Math.round(Math.min(1, this.time * 1.6) * (name.length + 4))), 10, pal.dots);
    const tagline = loc(w.tagline);
    screen.center(tagline.slice(0, this.typed), 12, pal.text, tagline.length);
  }
}
