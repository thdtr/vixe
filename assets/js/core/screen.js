import { CW, CH, COLS, VIEW_W, VIEW_H, FONT } from '../config.js';

// Thumb lanes: on touch screens the picture shrinks a little so each thumb
// gets a lane beside it, and the controls never sit on top of the level.
const LANE = 104;          // ideal lane width, CSS px
const LANE_MIN = 88;       // narrower than this and the lanes are not worth it
const MIN_SCALE = 0.8;     // never shrink text below ~13px to make room
const ROOM_BELOW = 96;     // a band this tall under the picture already fits the pads

// A 640x360 virtual grid of glyphs, scaled to fit the window at native
// resolution so text stays sharp at any size.
export class Screen {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.layer = document.createElement('canvas');
    this.lctx = this.layer.getContext('2d');
    this.layerKey = null;
    this.scale = 1;
    this.tint = null;
    this.tintCache = new Map();
    this.thumbs = false;     // wants thumb lanes
    this.laneSize = 1;
    this.lanes = false;      // got them (the screen may be too narrow)
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    this.resize();
  }

  // size: scales the ideal lane, for bigger or smaller buttons.
  setThumbs(on, size = 1) {
    if (on === this.thumbs && size === this.laneSize) return;
    this.thumbs = on;
    this.laneSize = size;
    this.resize();
  }

  resize() {
    // The body is padded by the safe area; fit inside that, not the whole viewport.
    const vv = visualViewport, pad = getComputedStyle(document.body);
    const w = (vv ? vv.width : innerWidth) - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const h = (vv ? vv.height : innerHeight) - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
    let k = Math.min(w / VIEW_W, h / VIEW_H), lane = 0;
    if (this.thumbs) {
      const ideal = LANE * this.laneSize;
      const laned = Math.min(k, Math.max(MIN_SCALE, (w - 2 * ideal) / VIEW_W));
      if ((h - VIEW_H * k) / 2 >= ROOM_BELOW * this.laneSize) {
        lane = Math.floor(ideal);   // a tall screen: the pads sit under the picture, nothing shrinks
      } else if ((w - VIEW_W * laned) / 2 >= LANE_MIN) {
        k = laned;
        lane = Math.floor((w - Math.floor(VIEW_W * k)) / 2);
      }
    }
    this.lanes = lane > 0;
    const cssW = Math.floor(VIEW_W * k), cssH = Math.floor(VIEW_H * k);
    // The touch controls (style.css) read the lane width from here.
    document.body.classList.toggle('lanes', this.lanes);
    if (this.lanes) document.documentElement.style.setProperty('--lane', `${lane}px`);
    else document.documentElement.style.removeProperty('--lane');
    // Past 2x the glyphs look the same, and every frame costs more battery.
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.layer]) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    }
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.scale = this.canvas.width / VIEW_W;
    this.layerKey = null;
  }

  // Converts client coordinates (pointer events) to virtual pixels.
  toView(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * VIEW_W, y: (clientY - r.top) / r.height * VIEW_H };
  }

  prepare(ctx) {
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }

  begin(bg, ox = 0, oy = 0) {
    const ctx = this.ctx;
    this.prepare(ctx);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color(bg);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(Math.round(ox), Math.round(oy));
  }

  // Redraws the cached layer only when its key changes (or after a resize).
  cached(key, draw, ox = 0, oy = 0) {
    if (key !== this.layerKey) {
      const l = this.lctx;
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.clearRect(0, 0, this.layer.width, this.layer.height);
      this.prepare(l);
      draw(l);
      this.layerKey = key;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.layer, Math.round(ox * this.scale), Math.round(oy * this.scale));
    ctx.restore();
  }

  glyph(ch, x, y, color, ctx = this.ctx) {
    ctx.fillStyle = this.color(color);
    ctx.fillText(ch, x + CW / 2, y + CH / 2 + 1);
  }

  text(str, col, row, color, ctx = this.ctx) {
    ctx.fillStyle = this.color(color);
    // The bottom row has nothing below it: lift it until descenders (j, p, y) fit.
    this.descent ??= ctx.measureText('gjpqy').actualBoundingBoxDescent;
    const y = Math.min(row * CH + CH / 2 + 1, VIEW_H - this.descent - 1);
    for (let i = 0; i < str.length; i++) {
      if (str[i] !== ' ') ctx.fillText(str[i], (col + i) * CW + CW / 2, y);
    }
  }

  // width: center as if the text were that long (text that types itself out stays put).
  center(str, row, color, width = str.length) {
    this.text(str, Math.floor((COLS - width) / 2), row, color);
  }

  fill(x, y, w, h, color, alpha = 1, ctx = this.ctx) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color(color);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  // Optional monochrome filter: every color is mapped to the tint by luminance.
  setTint(hex) {
    this.tint = hex;
    this.tintCache.clear();
    this.layerKey = null;
  }

  color(c) {
    if (!this.tint || c[0] !== '#') return c;
    let out = this.tintCache.get(c);
    if (!out) {
      const [r, g, b] = rgb(c), [tr, tg, tb] = rgb(this.tint);
      const l = 0.12 + 0.88 * Math.min(1, (0.3 * r + 0.59 * g + 0.11 * b) / 200);
      out = `rgb(${tr * l | 0},${tg * l | 0},${tb * l | 0})`;
      this.tintCache.set(c, out);
    }
    return out;
  }
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
