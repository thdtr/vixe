import { COLS, ROWS } from '../config.js';
import { t } from '../core/i18n.js';
import { ENDING } from '../core/themes.js';

export class Credits {
  constructor(app) { this.app = app; }

  enter() {
    this.time = 0;
    // After an ending its music plays on; from the title, the credits bring it in.
    this.app.audio.intensity(3);
    this.app.audio.music(ENDING);
  }

  update(dt) {
    const input = this.app.input;
    this.time += dt;
    this.app.backdrop(this.app.home()).update(dt);
    if (this.time > 0.4 && (input.confirmed() || input.backed() || input.tap())) this.app.go('title');
  }

  draw(screen) {
    const pal = this.app.palette();
    screen.begin(pal.bg);
    this.app.backdrop(this.app.home()).paint(screen, 0.78);
    const lines = t('credits.body').split('\n');
    const top = Math.floor((ROWS - lines.length) / 2);
    lines.forEach((line, i) => {
      // Lines starting with "#" are headings.
      const heading = line.startsWith('#');
      const text = heading ? line.slice(1).trim().toUpperCase() : line;
      screen.center(text, top + i, heading ? pal.accent : pal.text);
    });
    const sweep = Math.floor(this.time * 14) % (COLS + 20);
    screen.text('^', sweep, 19, pal.hazard);
  }
}
