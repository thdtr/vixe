import { CW, CH, MAP_W, MAP_H, MAP_Y } from '../config.js';
import { overlaps } from './level.js';

// Actors: small things a trap sets loose that live on their own until they hit something.
// The { "spawn": type, ... } trap action creates one:
//
//   { "spawn": "bolt", "at": [x, y], "dir": [-1, 0], "speed": 22 }   a dart along a line
//   { "spawn": "drop", "at": [x, y], "warn": 0.5 }                   a stalactite: trembles, then falls
//
// "at" is a cell; with "from": "a" it's counted from the top-left of group a where it is
// now, so a turret riding a moving body fires from wherever it went. Packs add types with
// registerActor(name, { spawn(spec, play), update(a, dt, play), draw(a, screen, pal, play) }):
// spawn returns the actor's state (plain data), update returns false once it's gone.

export const actorTypes = {};

export function registerActor(name, def) {
  actorTypes[name] = def;
}

// Where a spec puts its actor, as the center of a cell in map pixels.
function origin(spec, play) {
  let [x, y] = spec.at ?? [0, 0];
  if (spec.from) {
    const b = play.level.group(spec.from);
    x += b.box.x0 + b.ox / CW;
    y += b.box.y0 + b.oy / CH;
  }
  return [(x + 0.5) * CW, (y + 0.5) * CH];
}

const hitsPlayer = (play, x, y, w, h) => {
  const r = play.player.rect;
  return play.player.alive && overlaps(r.x, r.y, r.w, r.h, x - w / 2, y - h / 2, w, h);
};

const blocked = (play, x, y) => play.level.solidAt({ x: x - 1, y: y - 1, w: 2, h: 2 });

registerActor('bolt', {
  spawn(spec, play) {
    const [x, y] = origin(spec, play), [dx, dy] = spec.dir ?? [1, 0], l = Math.hypot(dx, dy) || 1, v = (spec.speed ?? 20);
    play.sfx('shoot', x);
    return { x, y, vx: dx / l * v * CW, vy: dy / l * v * CH, age: 0, glyph: spec.glyph };
  },
  update(a, dt, play) {
    a.age += dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (hitsPlayer(play, a.x, a.y, 6, 6)) play.kill();
    if (a.age > 0.05 && blocked(play, a.x, a.y)) {
      play.particles.burst(a.x, a.y, "*'.", 6, 90, play.world.palette.hazard, { life: 0.3 });
      play.sfx('bonk', a.x);
      return false;
    }
    return a.x > -CW * 2 && a.x < MAP_W + CW * 2 && a.y > -CH * 2 && a.y < MAP_H + CH * 2;
  },
  draw(a, screen, pal, play) {
    const ctx = screen.ctx, sp = Math.hypot(a.vx, a.vy) || 1, ux = a.vx / sp, uy = a.vy / sp;
    const tail = Math.abs(ux) > Math.abs(uy) ? '-' : '|';
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = 0.25 * (4 - k) / 3;
      screen.glyph(tail, a.x - ux * k * 7 - CW / 2, a.y - uy * k * 9 - CH / 2 + MAP_Y, pal.hazard);
    }
    ctx.globalAlpha = 1;
    screen.glyph(a.glyph ?? '*x+x'[Math.floor(play.time * 20) % 4], a.x - CW / 2, a.y - CH / 2 + MAP_Y, pal.hazard);
  },
});

registerActor('drop', {
  spawn(spec, play) {
    const [x, y] = origin(spec, play);
    play.sfx('creak', x);
    return { x, y, vy: 0, warn: spec.warn ?? 0.45, glyph: spec.glyph ?? 'v' };
  },
  update(a, dt, play) {
    if (a.warn > 0) { a.warn -= dt; return true; }
    a.vy = Math.min(a.vy + 1500 * dt, 600);
    a.y += a.vy * dt;
    if (hitsPlayer(play, a.x, a.y + 2, 8, 10)) play.kill();
    if (blocked(play, a.x, a.y + 6)) {
      play.particles.burst(a.x, a.y + 4, "v'.,", 7, 110, play.world.palette.hazard, { angle: -Math.PI / 2, spread: 2.4, life: 0.4 });
      play.sfx('thud', a.x);
      return false;
    }
    return a.y < MAP_H + CH * 2;
  },
  draw(a, screen, pal, play) {
    const jx = a.warn > 0 ? Math.sin(play.time * 70) * 1.5 : 0;
    screen.glyph(a.glyph, a.x - CW / 2 + jx, a.y - CH / 2 + MAP_Y, pal.hazard);
    if (a.vy > 200) {
      screen.ctx.globalAlpha = 0.3;
      screen.glyph("'", a.x - CW / 2, a.y - CH + MAP_Y, pal.hazard);
      screen.ctx.globalAlpha = 1;
    }
  },
});

export class Actors {
  constructor() { this.list = []; }

  spawn(type, spec, play) {
    const def = actorTypes[type];
    if (!def) return console.warn(`[actors] unknown "${type}"`);
    this.list.push({ def, state: def.spawn(spec, play) });
  }

  update(dt, play) {
    this.list = this.list.filter((a) => a.def.update(a.state, dt, play) !== false);
  }

  draw(screen, pal, play) {
    for (const a of this.list) a.def.draw(a.state, screen, pal, play);
  }
}
