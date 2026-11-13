import { MAP_W, MAP_H } from '../config.js';
import { Level } from './level.js';
import { Particles } from './render.js';
import { fxDefs, makeFx } from './fx.js';

// A world's scenery without a level to play: what the menus and title cards draw behind
// their text. It runs the world's shared effects that only paint (the scene, dust, vignette)
// against a stand-in for the play scene, with the player parked out of sight.
const PAINT_ONLY = new Set(['dust', 'vignette']);

export class Backdrop {
  constructor(world, map = [], id = 'menu') {
    this.world = world;
    this.level = new Level({ map });
    this.def = { id: `${world.id}:${id}` };
    this.particles = new Particles();
    this.gravity = 1;
    this.reversed = false;
    this.time = 0;
    this.ticks = 0;
    this.player = { cx: MAP_W / 2, cy: MAP_H * 2, x: 0, y: MAP_H * 2, alive: false, facing: 1 };
    this.state = 'menu';
    const defs = fxDefs(world, {}).filter((d) => d.id === 'scene' || PAINT_ONLY.has(d.type));
    this.fx = makeFx(defs, this);
  }

  // The effects call these on the play scene; here they do nothing.
  sfx() {}
  shake() {}
  kill() {}

  update(dt) {
    this.time += dt;
    this.ticks++;
    for (const f of this.fx) f.anim?.(dt, this);
    this.particles.update(dt);
  }

  back(screen) {
    for (const f of this.fx) f.back?.(screen, this);
    this.particles.draw(screen);
  }

  front(screen) {
    for (const f of this.fx) f.front?.(screen, this);
  }
}
