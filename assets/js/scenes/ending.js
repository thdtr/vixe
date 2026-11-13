import { CW, CH, COLS } from '../config.js';
import { t } from '../core/i18n.js';
import { drawFigure, pose } from '../game/render.js';

const clock = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s) % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export class Ending {
  constructor(app) { this.app = app; }

  enter({ kind, world }) {
    const app = this.app, save = app.save, progress = app.progress;
    this.kind = kind;
    this.world = world;
    this.time = 0;
    this.chars = 0;
    this.lines = t(`ending.${kind}`).split('\n');
    if (kind === 'true') {
      // Skipped levels hold the crown back, and the game says so instead of hiding it.
      const skipped = progress.skippedCount();
      if (skipped) this.lines.push('', t('ending.skipped', { n: skipped }));
      else save.flags.crown = true;
    } else {
      const secret = app.worlds.find((w) => w.hidden && w.requires?.world === app.worlds.find((x) => x.ending === kind)?.id);
      const found = save.secrets.length, total = progress.secretsTotal();
      if (secret && progress.worldOpen(secret)) this.lines.push('', t('ending.door'));
      else if (found < total) this.lines.push('', t('ending.missing', { n: total - found }));
      else this.lines.push('');
      this.lines.push(t('ending.challenge'));
    }
    this.lines.push('', t('ending.stats', { deaths: save.deaths, time: clock(save.time) }));
    this.total = this.lines.join('').length;
    app.persist();
    app.audio.music(null);
  }

  update(dt) {
    const input = this.app.input;
    this.time += dt;
    this.app.backdrop(this.world ?? this.app.home()).update(dt);
    const before = this.chars;
    this.chars = Math.min(this.total, this.chars + dt * 28);
    if (Math.floor(this.chars / 3) > Math.floor(before / 3)) this.app.audio.play('type');
    if (input.confirmed() || input.tap() || input.backed()) {
      if (this.chars < this.total) this.chars = this.total;
      else this.app.go('credits');
    }
  }

  draw(screen) {
    const app = this.app, pal = this.world?.palette || app.palette();
    screen.begin(pal.bg);
    // The world you just left, fading back as the words come in.
    app.backdrop(this.world ?? app.home()).paint(screen, Math.max(0.7, 1 - this.time * 0.15));
    let left = Math.floor(this.chars);
    const top = Math.max(1, Math.floor((16 - this.lines.length) / 2));
    this.lines.forEach((line, i) => {
      if (left <= 0) return;
      const shown = line.slice(0, left);
      left -= line.length;
      screen.center(shown, top + i, i === this.lines.length - 1 ? pal.dim : this.kind === 'true' ? pal.accent : pal.text, line.length);
    });

    // A small epilogue: the '@' finally walks somewhere without being lied to.
    const x = ((this.time * 22) % (COLS * CW + 40)) - 20;
    for (let c = 0; c < COLS; c++) screen.glyph(c % 2 ? '=' : '-', c * CW, 18 * CH, pal.dots);
    const walking = { ground: true, vx: 22, gdir: 1, stride: this.time * 22 };
    drawFigure(screen, x + CW / 2, 18 * CH, { pose: pose(walking), color: pal.player, crown: app.save.flags.crown ? pal.exit : null });
    if (this.chars >= this.total && Math.sin(this.time * 5) > 0) screen.text('>', COLS - 3, 19, pal.exit);
  }
}
