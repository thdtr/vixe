// Unifies keyboard, gamepad and touch into a small set of actions.
// held(a): currently down. pressed(a): went down since the last step.

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyJ: 'jump',
  Enter: 'confirm', NumpadEnter: 'confirm',
  Escape: 'pause', KeyP: 'pause',
  Backspace: 'back', KeyX: 'back',
  KeyR: 'restart',
};
const REPEATABLE = new Set(['left', 'right', 'up', 'down']);
const PAD_BUTTONS = { 0: 'jump', 1: 'back', 2: 'restart', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const HOLD = 0.5;                      // seconds to hold a button for its data-hold action

export class Input {
  constructor(screen, touchLayer) {
    this.keys = new Set();
    this.pad = new Set();
    this.touches = new Map();          // pointerId -> action
    this.down = new Set();
    this.taps = [];                    // { x, y, x0, y0 }: released at x,y after landing at x0,y0
    this.point = null;                 // the finger (or mouse) down on the canvas, if any
    this.button = null;                // the touch button being held, if any
    this.typed = '';                   // recent printable keys, for whoever is listening
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    this.touchLayer = touchLayer;
    this.mode = 'menu';                // 'play', 'menu', or 'preview' (a menu with the touch controls showing)
    this.swap = false;                 // jump on the left half, move on the right

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.touches.clear(); });

    // Outside play the canvas is tapped, and taps land on release: a finger that
    // slides off what it touched takes the touch back (see menu.js).
    const canvas = screen.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.touchDevice = true;
      if (this.mode === 'play') return;
      const { x, y } = screen.toView(e.clientX, e.clientY);
      this.point = { id: e.pointerId, x, y, x0: x, y0: y };
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.point?.id === e.pointerId) Object.assign(this.point, screen.toView(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointerup', (e) => {
      if (this.point?.id !== e.pointerId) return;
      const { x0, y0 } = this.point;
      this.taps.push({ ...screen.toView(e.clientX, e.clientY), x0, y0 });
      this.point = null;
    });
    canvas.addEventListener('pointercancel', () => { this.point = null; });

    // The whole left half steers (split between the two pads), the right half jumps.
    // Swapped, the halves trade places.
    const [padL, padR, padJ] = touchLayer.querySelectorAll('.pad');
    this.pads = [[padL, 'left'], [padR, 'right'], [padJ, 'jump']];
    const zone = (e) => {
      if (e.clientX >= innerWidth / 2 !== this.swap) return 'jump';
      const split = (padL.getBoundingClientRect().right + padR.getBoundingClientRect().left) / 2;
      return e.clientX < split ? 'left' : 'right';
    };
    touchLayer.addEventListener('pointerdown', (e) => {
      this.touchDevice = true;
      const { action, hold } = e.target.dataset;
      if (action) {
        // Buttons act on release; held for HOLD seconds they do their data-hold action instead.
        this.button = { el: e.target, id: e.pointerId, action, hold, at: performance.now(), fired: false };
        e.target.classList.add('on');
        e.target.setPointerCapture?.(e.pointerId);
        return;
      }
      const a = zone(e);
      this.touches.set(e.pointerId, a);
      this.down.add(a);
      touchLayer.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    touchLayer.addEventListener('pointermove', (e) => {
      if (!this.touches.has(e.pointerId)) return;
      const prev = this.touches.get(e.pointerId), a = zone(e);
      // Sliding a thumb between left and right switches direction; jump stays put.
      if (prev !== 'jump' && a !== 'jump' && a !== prev) {
        this.touches.set(e.pointerId, a);
        this.down.add(a);
      }
    });
    const lift = (e, cancel) => {
      this.touches.delete(e.pointerId);
      if (this.button?.id !== e.pointerId) return;
      if (!cancel && !this.button.fired) this.down.add(this.button.action);
      this.releaseButton();
    };
    touchLayer.addEventListener('pointerup', (e) => lift(e, false));
    touchLayer.addEventListener('pointercancel', (e) => lift(e, true));
  }

  onKey(e, isDown) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = KEYS[e.code];
    if (isDown) {
      if (e.key.length === 1) this.typed = (this.typed + e.key.toLowerCase()).slice(-16);
      else if (e.key.startsWith('Arrow')) this.typed = (this.typed + e.key[5].toUpperCase()).slice(-16);
    }
    if (!a) return;
    e.preventDefault();
    if (isDown) {
      if (!e.repeat || REPEATABLE.has(a)) this.down.add(a);
      this.keys.add(a);
    } else {
      this.keys.delete(a);
    }
  }

  releaseButton() {
    this.button?.el.classList.remove('on');
    this.button = null;
  }

  setMode(mode) {
    this.mode = mode;
    this.touches.clear();
    this.point = null;
    this.releaseButton();
    this.touchLayer.hidden = !this.showTouch;
    this.touchLayer.classList.toggle('preview', mode === 'preview');
  }

  get showTouch() { return this.touchDevice && (this.mode === 'play' || this.mode === 'preview'); }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set();
    for (const p of pads) {
      if (!p) continue;
      for (const [i, a] of Object.entries(PAD_BUTTONS)) if (p.buttons[i]?.pressed) now.add(a);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.4) now.add('left');
      if (ax > 0.4) now.add('right');
      if (ay < -0.6) now.add('up');
      if (ay > 0.6) now.add('down');
    }
    for (const a of now) if (!this.pad.has(a)) this.down.add(a);
    this.pad = now;
    if (this.touchLayer.hidden === this.showTouch) this.setMode(this.mode);
    const b = this.button;
    if (b?.hold && !b.fired && performance.now() - b.at >= HOLD * 1000) {
      b.fired = true;
      this.down.add(b.hold);
    }
    if (!this.touchLayer.hidden) {
      const on = new Set(this.touches.values());
      for (const [el, a] of this.pads) el.classList.toggle('on', on.has(a));
    }
  }

  held(a) {
    if (this.keys.has(a) || this.pad.has(a)) return true;
    for (const t of this.touches.values()) if (t === a) return true;
    return false;
  }

  pressed(a) { return this.down.has(a); }

  // -1, 0 or 1 from two opposite actions: pressed this step, or with how = 'held', down now.
  axis(neg, pos, how = 'pressed') { return (this[how](pos) ? 1 : 0) - (this[how](neg) ? 1 : 0); }

  // For presses that come from outside the devices, like the browser's back button.
  press(a) { this.down.add(a); }

  tap() { return this.taps.shift() || null; }

  // Menus accept Space as well as Enter.
  confirmed() { return this.pressed('confirm') || this.pressed('jump'); }
  backed() { return this.pressed('back') || this.pressed('pause'); }

  consume(code) {
    if (!this.typed.endsWith(code)) return false;
    this.typed = '';
    return true;
  }

  endStep() {
    this.down.clear();
    this.taps.length = 0;
  }
}
