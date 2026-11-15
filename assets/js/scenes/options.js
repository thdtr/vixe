import { LANGS, t } from '../core/i18n.js';
import { resetProgress } from '../core/storage.js';
import { Menu } from './menu.js';

const bar = (v) => `[${'#'.repeat(v)}${'-'.repeat(8 - v)}]`;
const clamp = (v) => Math.max(0, Math.min(8, v));
// Steps through a list of choices, wrapping around.
const cycle = (list, v, d) => list[(list.indexOf(v) + d + list.length) % list.length];

export class Options {
  constructor(app) {
    this.app = app;
    const s = app.save;
    const toggle = (key) => () => { s[key] = !s[key]; this.changed(); };
    const onOff = (key) => ({ label: () => `${t(`opt.${key}`)}  ${t(s[key] ? 'opt.on' : 'opt.off')}`, adjust: toggle(key) });
    // An item that opens another page; `page` is how the cursor finds its way back to it.
    const page = (name, key, hidden) => ({ label: () => `${t(key)}  >`, run: () => this.open(name), hidden, page: name });
    const back = { label: () => t('menu.back'), run: () => this.open('main') };
    this.confirming = false;
    this.menus = {
      main: new Menu([
        {
          label: () => `${t('opt.language')}  < ${t('lang.name')} >`,
          adjust: (d) => { s.lang = cycle(LANGS, s.lang, d); this.changed(); },
        },
        { label: () => `${t('opt.music')}  < ${bar(s.music)} >`, adjust: (d) => { s.music = clamp(s.music + d); this.changed(); } },
        { label: () => `${t('opt.sfx')}  < ${bar(s.sfx)} >`, adjust: (d) => { s.sfx = clamp(s.sfx + d); this.changed(); app.audio.play('jump'); } },
        page('screen', 'opt.screen'),
        page('touch', 'opt.touchControls', () => !app.input.touchDevice),
        {
          // A phone buzzes and a controller rumbles: shown when there is one of them.
          label: () => `${t('opt.vibrate')}  < ${t(`opt.vibrate.${s.vibrate}`)} >`,
          adjust: (d) => {
            s.vibrate = cycle(['deaths', 'all', 'off'], s.vibrate, d);
            this.changed();
            if (s.vibrate === 'off') return;
            navigator.vibrate?.(30);
            app.input.rumble(30, true);
          },
          hidden: () => !app.input.buzzes,
        },
        {
          label: () => t(this.confirming ? 'opt.resetConfirm' : 'opt.reset'),
          run: () => {
            if (!this.confirming) { this.confirming = true; return; }
            this.confirming = false;
            resetProgress(s);
            app.applySettings();
            app.audio.play('die');
          },
        },
        { label: () => t('menu.back'), run: () => this.leave() },
      ]),
      // What the picture does: shaking and flashing can be switched off, the stopwatch on.
      screen: new Menu([onOff('shake'), onOff('flashes'), onOff('scanlines'), onOff('clock'), back]),
      // Shown with the touch controls on screen, so every change can be seen.
      touch: new Menu([
        {
          label: () => `${t('opt.touchShow')}  < ${t(`opt.show.${s.touchShow}`)} >`,
          adjust: (d) => { s.touchShow = cycle(['touch', 'always', 'off'], s.touchShow, d); this.changed(); },
        },
        {
          label: () => `${t('opt.touchSize')}  < ${t(['opt.small', 'opt.medium', 'opt.large'][s.touchSize])} >`,
          adjust: (d) => { s.touchSize = cycle([0, 1, 2], s.touchSize, d); this.changed(); },
        },
        {
          label: () => `${t('opt.touchSwap')}  < ${t(s.touchSwap ? 'opt.leftHand' : 'opt.rightHand')} >`,
          adjust: toggle('touchSwap'),
        },
        back,
      ]),
    };
  }

  enter({ back = 'title' } = {}) {
    this.back = back;
    this.page = null;
    this.open('main');
    this.time = 0;
  }

  // The touch page leaves the controls visible underneath (see input.js).
  get inputMode() { return this.page === 'touch' ? 'preview' : 'menu'; }

  open(page) {
    // Coming back from a page, the cursor waits on the item that opened it.
    const main = this.menus.main;
    main.index = Math.max(0, main.visible.findIndex((item) => item.page === this.page));
    if (page !== 'main') this.menus[page].index = 0;
    this.page = page;
    this.confirming = false;
  }

  changed() {
    this.app.applySettings();
    this.app.persist();
  }

  leave() {
    this.app.go(this.back);
  }

  update(dt) {
    this.time += dt;
    this.app.backdrop(this.app.home()).update(dt);
    if (this.app.input.backed()) return this.page === 'main' ? this.leave() : this.open('main');
    const menu = this.menus[this.page], before = menu.index;
    menu.update(this.app);
    if (menu.index !== before) this.confirming = false;
  }

  draw(screen) {
    const pal = this.app.palette(), menu = this.menus[this.page];
    const title = { main: 'menu.options', screen: 'opt.screen', touch: 'opt.touchControls' }[this.page];
    screen.begin(pal.bg);
    this.app.backdrop(this.app.home()).paint(screen, 0.8);
    screen.center(t(title), 2, pal.hud);
    menu.draw(screen, menu.visible.length > 7 ? 4 : 5, pal, this.time);
  }
}
