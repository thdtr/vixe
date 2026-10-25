// Extras for the base campaign, and a working example of the pack API:
// packs can register new trap actions, triggers and tiles from here.

export function register({ registerAction, registerTrigger }) {
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
}
