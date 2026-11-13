import { CW, CH, MAP_H, PHYS } from '../config.js';

// How a group (a movable body, see level.js) moves. A trap action puts a motion on a body,
// { type, ...state }, and every step the body's type works out where it is now:
//
//   step(body, m, dt, level, player) -> { x, y, wrapped?, landed? }
//
// x and y are the body's new offset in pixels from where the map drew it. Set
// body.motion = null to stop. Packs add types with registerMotion(name, step).

export const motions = {
  // Drops (or rises, dir -1) and lands on static ground, unless land is false.
  fall(b, m, dt, level) {
    m.vy = Math.min(m.vy + PHYS.bodyGravity * dt, PHYS.bodyMaxFall);
    let y = b.oy + m.vy * dt * m.dir;
    if (m.land && level.bodyBlocked(b, b.ox, y)) {
      y = m.dir > 0 ? Math.floor(y / CH) * CH : Math.ceil(y / CH) * CH;
      while (level.bodyBlocked(b, b.ox, y) && Math.abs(y - b.oy) >= 1) y -= CH * m.dir;
      b.motion = null;
      return { x: b.ox, y, landed: true };
    }
    if (Math.abs(y) > MAP_H + CH * 2) {
      b.visible = false;
      b.motion = null;
    }
    return { x: b.ox, y };
  },

  // From where it was to `by` cells away; loops back and forth, or wraps to the start.
  move(b, m, dt) {
    const was = m.t;
    m.t += dt * m.speed / m.len;
    let p = m.t, wrapped = false;
    if (m.loop === 'wrap') {
      wrapped = Math.floor(p) > Math.floor(was);
      p %= 1;
    } else if (m.loop) {
      p %= 2;
      if (p > 1) p = 2 - p;
    } else if (p >= 1) {
      p = 1;
      b.motion = null;
    }
    const e = m.loop || m.linear ? p : p * p * (3 - 2 * p);
    return { x: m.fx + (m.tx - m.fx) * e, y: m.fy + (m.ty - m.fy) * e, wrapped };
  },

  // Round and round a point.
  orbit(b, m, dt) {
    m.a += dt * m.dir * Math.PI * 2 / m.period;
    return { x: m.cx + Math.cos(m.a) * m.rx, y: m.cy + Math.sin(m.a) * m.ry };
  },

  // Follows the player along an axis, or with flee keeps `gap` away from them, never leaving
  // [min, max] (offsets from where it started): a ceiling that stalks you, a door that won't wait.
  chase(b, m, dt, level, player) {
    const step = (axis) => {
      const k = axis === 'x' ? 0 : 1, pos = k ? b.oy : b.ox;
      const centre = (k ? (b.box.y0 + b.box.y1 + 1) * CH : (b.box.x0 + b.box.x1 + 1) * CW) / 2 + pos;
      const d = centre - (k ? player.cy : player.cx);
      let goal = pos - d;
      if (m.flee) goal = Math.abs(d) < m.gap ? pos + Math.sign(d || 1) * m.gap - d : pos;
      goal = Math.max(m.min[k], Math.min(m.max[k], goal));
      const v = m.v[k], want = Math.sign(goal - pos) * Math.min(m.speed, Math.abs(goal - pos) * 8);
      m.v[k] = v + Math.max(-m.accel * dt, Math.min(m.accel * dt, want - v));
      return pos + m.v[k] * dt;
    };
    return { x: m.axis.includes('x') ? step('x') : b.ox, y: m.axis.includes('y') ? step('y') : b.oy };
  },
};

export function registerMotion(name, step) {
  motions[name] = step;
}
