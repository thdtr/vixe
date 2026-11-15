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
// The floating stick, in CSS px at medium size (--size scales them).
const DEAD = 8;                        // a thumb this far from where it landed starts walking
const REACH = 20;                      // the stick's center trails a thumb dragged further than this

export class Input {
  constructor(screen, touchLayer) {
    this.keys = new Set();
    this.pad = new Set();
    this.touches = new Map();          // pointerId -> { kind: 'stick' | 'jump', ox, dir }
    this.down = new Set();
    this.taps = [];                    // { x, y, x0, y0 }: released at x,y after landing at x0,y0
    this.point = null;                 // the finger (or mouse) down on the canvas, if any
    this.button = null;                // the touch button being held, if any
    this.typed = '';                   // recent printable keys, for whoever is listening
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    this.touchLayer = touchLayer;
    this.mode = 'menu';                // 'play', 'menu', or 'preview' (a menu with the touch controls showing)
    this.swap = false;                 // jump on the left half, move on the right
    this.size = 1;                     // touch control size (main.js, from the options)
    this.show = 'touch';               // when the touch controls are drawn: 'touch', 'always' or 'off'

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.clearTouches(); });

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

    // Touch in play: one half of the screen is a floating stick, the other jumps.
    // The stick is born wherever the thumb lands and walks once the thumb slides
    // sideways; dragged far, its center trails the thumb, so turning around is
    // always a short slide. Nothing is drawn until a thumb is down (see style.css).
    // Swapped, the halves trade places.
    this.stick = touchLayer.querySelector('.stick');
    this.knob = this.stick.querySelector('i');
    this.ring = touchLayer.querySelector('.tap');
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
      e.preventDefault();
      touchLayer.setPointerCapture?.(e.pointerId);
      if (e.clientX >= innerWidth / 2 !== this.swap) {
        this.touches.set(e.pointerId, { kind: 'jump' });
        this.down.add('jump');
        this.place(this.ring, e.clientX, e.clientY);
        this.ring.classList.remove('on');
        void this.ring.offsetWidth;    // restart the pulse
        this.ring.classList.add('on');
        return;
      }
      // One stick at a time: a second thumb on the same side takes it over.
      for (const [id, t] of this.touches) if (t.kind === 'stick') this.touches.delete(id);
      this.touches.set(e.pointerId, { kind: 'stick', ox: e.clientX, dir: 0 });
      this.place(this.stick, e.clientX, e.clientY);
      this.knob.style.transform = '';
      this.stick.classList.add('on');
    });
    touchLayer.addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (t?.kind !== 'stick') return;
      const reach = REACH * this.size, dead = DEAD * this.size;
      let dx = e.clientX - t.ox;
      if (Math.abs(dx) > reach) {
        t.ox = e.clientX - Math.sign(dx) * reach;
        this.place(this.stick, t.ox, null);
        dx = Math.sign(dx) * reach;
      }
      const dir = dx > dead ? 1 : dx < -dead ? -1 : 0;
      if (dir && dir !== t.dir) this.down.add(dir > 0 ? 'right' : 'left');
      t.dir = dir;
      this.knob.style.transform = `translateX(${dx}px)`;
    });
    const lift = (e, cancel) => {
      const t = this.touches.get(e.pointerId);
      this.touches.delete(e.pointerId);
      if (t?.kind === 'stick') this.stick.classList.remove('on');
      if (t?.kind === 'jump' && ![...this.touches.values()].some((o) => o.kind === 'jump')) this.ring.classList.remove('on');
      if (t) this.rest();
      if (this.button?.id !== e.pointerId) return;
      if (!cancel && !this.button.fired) this.down.add(this.button.action);
      this.releaseButton();
    };
    touchLayer.addEventListener('pointerup', (e) => lift(e, false));
    touchLayer.addEventListener('pointercancel', (e) => lift(e, true));
    addEventListener('resize', () => this.rest());
  }

  // Where the controls wait while no thumb is down: drawn there when they are
  // always shown, and in the touch options. Shown only on touch, they fade out
  // where they were let go instead.
  rest() {
    if (this.show !== 'always' && this.mode !== 'preview') return;
    const r = 64 * this.size, y = innerHeight - r - 6;
    const near = r + 14, far = innerWidth - r - 14;
    if (!this.stick.classList.contains('on')) {
      this.place(this.stick, this.swap ? far : near, y);
      this.knob.style.transform = '';
    }
    if (!this.ring.classList.contains('on')) this.place(this.ring, this.swap ? near : far, y);
  }

  // Centers a touch control on a point (y null: keep its height).
  place(el, x, y) {
    el.style.left = `${x}px`;
    if (y !== null) el.style.top = `${y}px`;
  }

  clearTouches() {
    this.touches.clear();
    this.stick?.classList.remove('on');
    this.ring?.classList.remove('on');
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
    this.clearTouches();
    this.point = null;
    this.releaseButton();
    this.touchLayer.hidden = !this.showTouch;
    this.touchLayer.classList.toggle('preview', mode === 'preview');
    this.rest();
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
  }

  // Something here can shake in the hand: a phone, or a controller with motors.
  get buzzes() {
    if (this.touchDevice && 'vibrate' in navigator) return true;
    return [...(navigator.getGamepads?.() ?? [])].some((p) => p?.vibrationActuator);
  }

  // A controller's motors, where it has them: a tap for a jump, a jolt for a death.
  rumble(ms, strong = false) {
    for (const p of navigator.getGamepads?.() ?? []) {
      p?.vibrationActuator?.playEffect?.('dual-rumble', {
        duration: Math.max(60, ms * 4), strongMagnitude: strong ? 0.9 : 0.15, weakMagnitude: strong ? 0.7 : 0.3,
      })?.catch?.(() => {});
    }
  }

  held(a) {
    if (this.keys.has(a) || this.pad.has(a)) return true;
    for (const t of this.touches.values()) {
      if (t.kind === 'jump' ? a === 'jump' : (a === 'left' && t.dir < 0) || (a === 'right' && t.dir > 0)) return true;
    }
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
