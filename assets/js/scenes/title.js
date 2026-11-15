import { COLS, VERSION } from '../config.js';
import { Level } from '../game/level.js';
import { drawStatic } from '../game/render.js';
import { t } from '../core/i18n.js';
import { Menu, veil } from './menu.js';
import { TITLE } from '../core/themes.js';

// The logo is drawn like a level map, so it shares the walls' look.
const LOGO = [
  '',
  '             #     #   #######   ##   ##   #######',
  '             #     #      #        # #     #',
  '              #   #       #         #      #####',
  '               # #        #        # #     #',
  '                #      #######   ##   ##   #######',
];

export class Title {
  constructor(app) {
    this.app = app;
    this.menu = new Menu([
      { label: () => t(app.progress.resume() && Object.keys(app.save.levels).length ? 'menu.continue' : 'menu.play'), run: () => app.start(app.progress.resume()) },
      { label: () => t('menu.levels'), run: () => app.go('select') },
      { label: () => t('menu.options'), run: () => app.go('options', { back: 'title' }) },
      { label: () => t('menu.credits'), run: () => app.go('credits') },
      // Phones play full screen (main.js asks on "play"); this hands the browser back.
      { label: () => t('menu.exitFullscreen'), run: () => document.exitFullscreen().catch(() => {}), hidden: () => !document.fullscreenElement },
    ]);
  }

  enter() {
    this.level = new Level({ map: LOGO });
    this.time = 0;
    // The theme fills out as the game is played through.
    this.app.audio.intensity(this.app.depth());
    this.app.audio.music(TITLE);
  }

  update(dt) {
    this.time += dt;
    this.app.backdrop(this.app.home(), LOGO).update(dt);
    this.menu.update(this.app);
  }

  draw(screen) {
    const pal = this.app.palette(), back = this.app.backdrop(this.app.home(), LOGO);
    screen.begin(pal.bg);
    back.back(screen);
    // A fifth item (exit full screen) lifts the words a row to clear the bottom line.
    const up = this.menu.visible.length > 4 ? 1 : 0;
    // A pool of dark behind the words, so the scenery never fights them.
    veil(screen, 8.6 - up, 18.4, 26, pal.bg);
    screen.cached(`title:${pal.bg}`, (l) => drawStatic(screen, l, this.level, pal));
    back.front(screen);

    const day = new Date();
    const spooky = day.getMonth() === 9 && day.getDate() === 31;
    const friday13 = day.getDay() === 5 && day.getDate() === 13;
    const tagline = t(spooky ? 'title.halloween' : friday13 ? 'title.friday13' : 'title.tagline');
    screen.center(tagline, 9 - up, pal.dim);
    this.menu.draw(screen, 11 - up, pal, this.time);

    screen.text(t(this.app.input.touchDevice ? 'title.hintTouch' : 'title.hintKeys'), 1, 19, pal.dim);
    screen.text(`v${VERSION}`, COLS - VERSION.length - 2, 19, pal.dots);
  }
}
