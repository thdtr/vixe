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
    this.confirming = false;
    this.touchItem = { label: () => `${t('opt.touchControls')}  >`, run: () => this.open('touch'), hidden: () => !app.input.touchDevice };
    this.menus = {
      main: new Menu([
        {
          label: () => `${t('opt.language')}  < ${t('lang.name')} >`,
          adjust: (d) => { s.lang = cycle(LANGS, s.lang, d); this.changed(); },
        },
        { label: () => `${t('opt.music')}  < ${bar(s.music)} >`, adjust: (d) => { s.music = clamp(s.music + d); this.changed(); } },
        { label: () => `${t('opt.sfx')}  < ${bar(s.sfx)} >`, adjust: (d) => { s.sfx = clamp(s.sfx + d); this.changed(); app.audio.play('jump'); } },
        { label: () => `${t('opt.shake')}  ${t(s.shake ? 'opt.on' : 'opt.off')}`, adjust: toggle('shake') },
        { label: () => `${t('opt.scanlines')}  ${t(s.scanlines ? 'opt.on' : 'opt.off')}`, adjust: toggle('scanlines') },
        this.touchItem,
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
      // Shown with the touch controls on screen, so every change can be seen.
      touch: new Menu([
        {
          label: () => `${t('opt.touch')}  < ${t(s.touchLayout === 'full' ? 'opt.touchFull' : 'opt.touchLanes')} >`,
          adjust: () => { s.touchLayout = s.touchLayout === 'full' ? 'lanes' : 'full'; this.changed(); },
        },
        {
          label: () => `${t('opt.touchSize')}  < ${t(['opt.small', 'opt.medium', 'opt.large'][s.touchSize])} >`,
          adjust: (d) => { s.touchSize = cycle([0, 1, 2], s.touchSize, d); this.changed(); },
        },
        {
          label: () => `${t('opt.touchAlpha')}  < ${bar(s.touchAlpha)} >`,
          adjust: (d) => { s.touchAlpha = clamp(s.touchAlpha + d); this.changed(); },
        },
        {
          label: () => `${t('opt.touchSwap')}  < ${t(s.touchSwap ? 'opt.leftHand' : 'opt.rightHand')} >`,
          adjust: toggle('touchSwap'),
        },
        {
          label: () => `${t('opt.vibrate')}  < ${t(`opt.vibrate.${s.vibrate}`)} >`,
          adjust: (d) => { s.vibrate = cycle(['deaths', 'all', 'off'], s.vibrate, d); this.changed(); if (s.vibrate !== 'off') navigator.vibrate(30); },
          hidden: () => !('vibrate' in navigator),
        },
        { label: () => t('menu.back'), run: () => this.open('main') },
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
    this.menus.main.index = this.page === 'touch' ? this.menus.main.visible.indexOf(this.touchItem) : 0;
    this.menus.touch.index = 0;
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
    if (this.app.input.backed()) return this.page === 'touch' ? this.open('main') : this.leave();
    const menu = this.menus[this.page], before = menu.index;
    menu.update(this.app);
    if (menu.index !== before) this.confirming = false;
  }

  draw(screen) {
    const pal = this.app.palette(), menu = this.menus[this.page];
    screen.begin(pal.bg);
    screen.center(t(this.page === 'touch' ? 'opt.touchControls' : 'menu.options'), 2, pal.hud);
    menu.draw(screen, menu.visible.length > 7 ? 4 : 5, pal, this.time);
  }
}
