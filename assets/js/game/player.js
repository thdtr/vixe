import { CW, CH, PHYS as P } from '../config.js';

const EPS = 0.01;
const STEP_UP = 5;
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

export class Player {
  constructor(cell) {
    this.x = cell.x * CW + (CW - P.w) / 2;
    this.y = cell.y * CH + CH - P.h;
    this.vx = 0;
    this.vy = 0;
    this.gdir = 1;            // 1: gravity pulls down, -1: up
    this.weight = 1;          // how hard gravity pulls: 0.5 is the moon
    this.drift = { x: 0, y: 0 };   // carried along by a field, in px/s
    this.push = null;              // the field's push it eases toward, in cells/s
    this.speed = 1;
    this.facing = 1;
    this.alive = true;
    this.ground = null;       // null in the air, 'static' or the Body under our feet
    this.coyote = 0;
    this.buffer = 0;
    this.jumped = false;
    this.landed = false;
    this.idle = 0;
    this.squash = 0;
    this.revealed = [];
  }

  get rect() { return { x: this.x, y: this.y, w: P.w, h: P.h }; }

  // Slightly thinner on the axis we're not moving along, so resting exactly on
  // an edge never counts as bumping into it.
  probe(axis) {
    return axis === 'x'
      ? { x: this.x, y: this.y + EPS, w: P.w, h: P.h - EPS * 2 }
      : { x: this.x + EPS, y: this.y, w: P.w - EPS * 2, h: P.h };
  }
  get cx() { return this.x + P.w / 2; }
  get cy() { return this.y + P.h / 2; }

  // ctl: { dir: -1..1, jump: held, jumpPressed }
  update(dt, ctl, level) {
    const g = this.gdir, wasGrounded = !!this.ground;

    const target = ctl.dir * P.run * this.speed;
    const accel = this.ground ? (ctl.dir ? P.accel : P.friction) : (ctl.dir ? P.airAccel : P.airDrag);
    this.vx = approach(this.vx, target, accel * this.speed * dt);
    if (ctl.dir) this.facing = ctl.dir;

    this.coyote = this.ground ? P.coyote : Math.max(0, this.coyote - dt);
    this.buffer = ctl.jumpPressed ? P.buffer : Math.max(0, this.buffer - dt);
    this.jumped = false;
    if (this.buffer > 0 && this.coyote > 0) {
      if (this.ground?.vx) this.vx += this.ground.vx;   // leap off moving things with their momentum
      this.vy = -P.jump * g;
      this.buffer = this.coyote = 0;
      this.ground = null;
      this.jumped = true;
      this.squash = -0.25;
    }

    const rising = this.vy * g < 0;
    if (rising && !ctl.jump && -this.vy * g > P.jumpCut) this.vy = -P.jumpCut * g;
    const floaty = ctl.jump && Math.abs(this.vy) < 60;
    this.vy += P.gravity * this.weight * g * (floaty ? P.apexGravity : 1) * dt;
    if (this.vy * g > P.maxFall * this.weight) this.vy = P.maxFall * this.weight * g;

    // A field's push fades in and out, so crossing its edge doesn't jerk.
    const d = this.drift, push = this.push;
    d.x = approach(d.x, (push?.[0] || 0) * CW, P.driftAccel * dt);
    d.y = approach(d.y, (push?.[1] || 0) * CH, P.driftAccel * dt);

    this.revealed.length = 0;
    this.moveX((this.vx + d.x) * dt, level);
    this.ground = this.moveY((this.vy + d.y) * dt, level);

    this.landed = !wasGrounded && !!this.ground;
    if (this.landed) this.squash = 0.3;
    this.squash = approach(this.squash, 0, dt * 2.5);
    this.idle = ctl.dir || ctl.jump ? 0 : this.idle + dt;
  }

  moveX(dx, level, ignore = null) {
    if (!dx) return;
    const g = this.gdir;
    let wall = null, lift = 0;
    this.x += dx;
    level.query(this.probe('x'), (px, py, t, i, body) => {
      if (!t.solid || (ignore && body === ignore)) return;
      if (t.hidden) this.revealed.push(i);
      // A lip of a few pixels (say, the floor next to a sinking platform) is a step, not a wall.
      const rise = g > 0 ? this.y + P.h - py : py + CH - this.y;
      if ((this.ground || this.coyote > 0) && rise > 0 && rise <= STEP_UP) lift = Math.max(lift, rise);
      else wall = dx > 0 ? Math.min(wall ?? Infinity, px - P.w) : Math.max(wall ?? -Infinity, px + CW);
    });
    if (lift && wall === null) {
      this.y -= lift * g;
      if (!level.solidAt(this.probe('x'))) return;
      this.y += lift * g;
      wall = this.x - dx;
    }
    if (wall !== null) {
      this.x = wall;
      this.vx = 0;
    }
  }

  moveY(dy, level) {
    const g = this.gdir, prev = this.y;
    let ground = null;
    this.y += dy;
    level.query(this.probe('y'), (px, py, t, i, body) => {
      if (t.oneway) {
        // Only blocks you while falling onto it from its "top" side.
        if (dy * g <= 0) return;
        if (g > 0 ? prev + P.h > py + 0.01 : prev < py + CH - 0.01) return;
      } else if (!t.solid) return;
      this.y = dy > 0 ? Math.min(this.y, py - P.h) : Math.max(this.y, py + CH);
      if (dy * g > 0) ground = body || ground || 'static';
      else if (this.vy * g < 0) this.vy = 0;
      if (t.hidden) this.revealed.push(i);
    });
    if (ground) this.vy = 0;
    return ground;
  }

  // Riding a moving body.
  carry(dx, dy, level) {
    this.moveX(dx, level, this.ground);
    this.y += dy;
  }
}
