import { CW, CH, COLS } from '../config.js';

// A vertical list of options, driven by keys, pad or taps.
// item: { label: () => string, run?: () => void, adjust?: (dir) => void, hidden?: () => bool }
export class Menu {
  constructor(items) {
    this.items = items;
    this.index = 0;
    this.hits = [];
    this.held = -1;          // item under a finger that is still down
  }

  hitAt(x, y) {
    return this.hits.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
  }

  // The item a touch both landed on and is now over (or was lifted from).
  touched(p) {
    const hit = this.hitAt(p.x, p.y);
    return hit && hit.index === this.hitAt(p.x0, p.y0)?.index ? hit : null;
  }

  get visible() {
    return this.items.filter((it) => !it.hidden?.());
  }

  update(app) {
    const input = app.input, items = this.visible;
    if (this.index >= items.length) this.index = 0;
    const move = input.axis('up', 'down');
    if (move) {
      this.index = (this.index + move + items.length) % items.length;
      app.audio.play('tick');
    }
    const item = items[this.index];
    const side = input.axis('left', 'right');
    if (side && item.adjust) {
      item.adjust(side);
      app.audio.play('tick');
    }
    if (input.confirmed()) this.activate(item, app);
    let tap;
    while ((tap = input.tap())) {
      const hit = this.touched(tap);
      if (!hit) continue;
      this.index = hit.index;
      const tapped = items[hit.index];
      // Settings: the left half of the line turns it down, the right half up.
      if (tapped.adjust && !tapped.run) {
        tapped.adjust(tap.x < hit.x + hit.w / 2 ? -1 : 1);
        app.audio.play('tick');
      } else {
        this.activate(tapped, app);
      }
    }
    const held = input.point && this.touched(input.point);
    this.held = held ? held.index : -1;
  }

  activate(item, app) {
    app.audio.play('select');
    if (item.run) item.run();
    else item.adjust?.(1);
  }

  draw(screen, row, pal, time, gap = 1) {
    this.hits = [];
    this.visible.forEach((item, i) => {
      const label = item.label();
      const r = row + i * (gap + 1);
      const col = Math.floor((COLS - label.length) / 2);
      const selected = i === this.index;
      const hit = { x: (col - 5) * CW, y: r * CH - gap * CH / 2, w: (label.length + 10) * CW, h: CH * (gap + 1), index: i };
      if (i === this.held) screen.fill(hit.x, hit.y + 2, hit.w, hit.h - 4, pal.accent, 0.16);
      screen.text(label, col, r, selected || i === this.held ? pal.accent : pal.text);
      if (selected) screen.glyph('@', (col - 3) * CW + Math.sin(time * 6) * 1.5, r * CH, pal.player);
      this.hits.push(hit);
    });
  }
}
