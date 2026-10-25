// Extras for the base campaign, and a working example of the pack API:
// packs can register new trap actions, triggers and tiles from here.

import { CW, CH, PHYS } from '../../js/config.js';

export function register({ registerAction, registerTrigger, registerTile }) {
  // Types a group onto the map one cell at a time, in reading order.
  //   { "typewrite": "a", "rate": 9 }   (cells per second)
  registerAction('typewrite', (play, id, step) => {
    const body = play.level.group(id);
    const cells = body.take().sort((a, b) => a.y - b.y || a.x - b.x);
    body.visible = true;
    const pause = 1 / (step.rate ?? 9);
    play.events.script(cells.flatMap((cell) => [{ _key: [id, cell] }, { wait: pause }]));
  });

  registerAction('_key', (play, [id, cell]) => {
    play.level.group(id).add(cell);
    if (cell.ch !== '_') play.sfx('type');
  });

  // Fires when a word is typed on a physical keyboard: { "typed": ["porta", "door"] }
  registerTrigger('typed', (play, words) => words.some((w) => play.app.input.consume(w)));

  // Orbit: stars to look at, a meteor's tail (never solid) and the mouth of a wormhole.
  registerTile('·', { glyph: '·', color: 'dots' });
  registerTile('°', { color: 'dim', anim: '°'.repeat(30) + '+*+·' });
  registerTile('´', { glyph: '´', color: 'accent' });
  registerTile('¤', { color: 'exit', anim: 'O0o0' });

  // Backstage: curtain folds and ropes (never solid), the audience down in the pit,
  // footlights set into the stage floor and the sandbags that hold the scenery up.
  registerTile('¦', { glyph: '¦', color: 'wallDim' });
  registerTile('│', { glyph: '│', color: 'dim' });
  registerTile('º', { color: 'dim', anim: 'º'.repeat(60) + 'o' });
  registerTile('•', { solid: true, color: 'accent', anim: '•'.repeat(40) + '·' });
  registerTile('§', { solid: true, glyph: '§', color: 'girder' });
  // Painted flats: scenery you can look at but never stand on.
  for (const ch of '╱╲─┆╭╮╰╯') registerTile(ch, { glyph: ch, color: 'dots' });

  // Throws you to another cell and keeps your speed: { "warp": [x, y], "flip": true }
  // null keeps that axis, so [null, 2] drops you back in from the top, right where you fell.
  // Land beside the other mouth, not inside its zone, or you'll be sent straight back.
  registerAction('warp', (play, [x, y], step) => {
    const p = play.player, pal = play.world.palette;
    play.particles.burst(p.cx, p.cy, "o0'.", 10, 120, pal.exit, { gravity: 0, life: 0.4 });
    if (step.flip) play.setGravity(-play.gravity);
    if (x != null) p.x = x * CW + (CW - PHYS.w) / 2;
    if (y != null) p.y = p.gdir > 0 ? y * CH + CH - PHYS.h : y * CH;
    p.ground = null;
    play.particles.burst(p.cx, p.cy, "o0'.", 10, 120, pal.exit, { gravity: 0, life: 0.4 });
    play.sfx('warp', p.cx);
  });
}
