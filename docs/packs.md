# Making packs

**English** · [Português](packs.pt-BR.md)

The full reference for the pack format. For the big picture, see the [README](../README.md).
Every level map is 64×18 cells, and `assets/packs/base/` holds the whole campaign as a
working example.

## Pack layout

Create `assets/packs/<id>/` and add the id to `assets/packs/manifest.json`. A broken pack
is skipped with a warning in the console, so it can never take down the base game.

**`pack.json`**

```json
{
  "id": "my-pack",
  "name": { "pt-BR": "Meu Pack", "en": "My Pack" },
  "worlds": ["world.json"],
  "script": "script.js",
  "strings": { "pt-BR": { "key": "texto" }, "en": { "key": "text" } }
}
```

`script` and `strings` are optional.

## Worlds

A world has an `id`, `name`, `tagline`, `palette`, `music` (see below) and `levels`. The
palette takes the colors `bg dots wall wallDim girder hazard exit player text accent hud dim`.

Optional fields are `requires` (`{ "world": "w4", "secrets": 4 }`), `hidden`, `code` (a
label shown instead of the level number), `ending` (a closing scene after the last level) and
`fx`, the [effects](#effects) every level of the world shares. A palette may also set the
tones the renderer otherwise derives from it: `wallLit`, `wallSide`, `wallUnder`, `shadow`, `glint`.

## Levels

| field    | what it is |
|----------|------------|
| `name`   | `{ "pt-BR": "...", "en": "..." }` |
| `map`    | 18 lines of up to 64 characters |
| `marks`  | optional layer with the same layout. `a-z` groups tiles into a moving body, `A-Z` marks the cells of a trigger zone |
| `hidden` | groups that start out invisible, e.g. `"bc"` |
| `signs`  | text for each `?`, in reading order |
| `words`  | localized solid text, `{ "at": [x, y], "text": {...}, "group": "a" }` |
| `dark`   | sight radius in cells (0 means no darkness) |
| `weight` | how hard gravity pulls (1 by default, `0.6` jumps like on the moon) |
| `fields` | zones that change how you fall while you're inside them (see below) |
| `events` | traps (see below) |
| `mechs`  | options for the [mechanisms](#mechanisms) on the map, e.g. `{ "crumble": { "delay": 0.25 } }` |
| `fx`     | [effects](#effects) for this level, on top of the world's |

Map tiles

```
#  wall            %  fake wall         &  invisible block (shows up when touched)
=  solid girder    -  one-way platform  ^ v  spikes (floor / ceiling)
*  saw             ~  acid              >  exit
?  sign            @  start             any other character is a solid letter
```

Mechanism tiles act on their own, with no events needed (see [Mechanisms](#mechanisms)):

```
░  crumbling floor (looks like a wall)   ¡  hidden spike that pops up near you
†  floor spike on a beat   ‡  ceiling spike on a beat   ↑  spring   « »  conveyor belts
```

## Fields

A field takes over gravity while the middle of the player is inside its zone, and lets go
as soon as they leave. It's keyed by a zone letter from `marks`, or covers a rect with `at`
(its name then works as a zone too). Every key is optional.

```json
"fields": {
  "A": { "gravity": -1, "weight": 0.3 },
  "wind": { "at": [1, 2, 61, 14], "push": [12, 0], "off": true }
}
```

`gravity` and `weight` replace the level's own while you're inside, and `push` carries you
along in cells per second, easing in and out at the edges. `"off": true` starts it switched
off, for the `field` action to turn on. A field that's on shows motes that flow the way it pulls.

## Events

Traps are plain data. Every condition in `when` has to hold, and the steps in `do` run in
order. The first key of each step is the action and the rest are its options.

```json
{ "when": { "zone": "A", "deaths": 2 }, "delay": 0.1,
  "do": [ { "wobble": "a" }, { "fall": "a", "land": false }, { "wait": 0.5 }, { "show": "b" } ] }
```

- **Triggers** `start`, `time`, `every`, `zone` (a letter or `[x, y, w, h]`), `jump`,
  `land`, `stand` (on top of a group), `idle`, `deaths`, `fewerDeaths`, `collected`, `flag`,
  `near` (closer than `r` cells to a group or a cell: `"a"`, `{ "group": "a", "r": 3 }` or
  `[x, y, r]`), `below` (anywhere under a group, as it is now), `past` and `before` (the
  player's column is past or before a column), `airborne` and `grounded`.
  An event fires once by default. With `"repeat": true` it fires every time it happens again.
- **Actions** `show`, `hide`, `wobble`, `fall` (`land`, `speed`, `dir`: `-1` falls up), `move`
  (`by`, `speed`, `loop`, `linear`, `wait`), `stop`, `swap` (`to`, `from`: only these tiles),
  `fill` (`with`), `gravity`, `weight`, `field` (`on`), `controls`, `speed`, `tide`, `dark`,
  `say`, `sfx`, `shake`, `glitch`, `flash`, `flag`, `fire`, `wait`, `kill`, `win`, `ease`,
  `chase`, `collapse`, `spawn` (below).
- **Stalking and fleeing** `{ "chase": "a", "axis": "x", "speed": 6, "min": [-4, 0], "max": [10, 0] }`
  makes a group follow the player along an axis (`"x"`, `"y"` or `"xy"`); with `"flee": 4` it
  keeps 4 cells away instead, like a door that won't wait. It never leaves `min`..`max`, in
  cells from where the map drew it, so a fleeing door ends up cornered.
- **Collapsing** `{ "collapse": "a", "from": "left", "rate": 9, "wobble": 0.15 }` drops a group
  column by column, starting from `"left"`, `"right"` or `"player"`, `rate` columns a second.
  The columns become groups named `a:<x>`.
- **Actors** `{ "spawn": "bolt", "at": [62, 15], "dir": [-1, 0], "speed": 18 }` fires a dart
  that flies until it hits a wall; `{ "spawn": "drop", "at": [30, 4], "warn": 0.4 }` is a
  stalactite that trembles, then falls. With `"from": "a"` the cell is counted from group `a`
  where it is now. Paired with `every` and `"repeat": true`, a spawn is a turret.
- **Moving in circles** `{ "orbit": "a", "radius": [16, 6], "period": 8, "at": 0.5 }` sends a
  group around a loop (sizes in cells, `period` in seconds per lap). `at` says where on the loop
  the group starts (`0` right, `0.25` below, `0.5` left, `0.75` above) and `"dir": -1` goes the
  other way. Sent again to a group that's already orbiting, it keeps its place and only changes
  pace or direction. `"loop": "wrap"` on a `move` starts over from the beginning instead of
  coming back, like a meteor falling again from the top.
  `show`, `fall`, `move`, `swap` and `fill` make a sound; `"quiet": true` silences them.
- **Mercy** `ease` gives every trap set off after it more time (`1.6` = wobbles 60% longer,
  moves and tides take 60% longer). Paired with `deaths` it helps whoever is stuck without
  turning the trap off: `{ "when": { "start": true, "deaths": 8 }, "do": [ { "ease": 1.6 } ] }`.
  List it first, so it lands before the level's other `start` events.

## Mechanisms

Mechanism tiles work with no events: draw them on the map and tune them per level in `mechs`.
Every option is optional.

| tile | name | options |
|------|------|---------|
| `░` | `crumble` | `delay` (0.32 s before it falls, longer with `ease`), `chain` (0.06 s per cell: the rest of the slab follows, spreading from your feet; 0 turns it off), `respawn` (seconds, 0 = never) |
| `¡` | `pop` | `reach` (1.4 cells: how close you get before it springs), `hold` (seconds up, 0 = for good), `hint` (show a faint mark) |
| `†` `‡` | `pulse` | `period` (2 s), `on` (0.8 s up), `warn` (0.45 s of flicker first), `wave` (seconds of delay per column, for ripples), `phase` |
| `↑` | `spring` | `power` (1.5 jumps) |
| `«` `»` | `belt` | `speed` (5 cells/s) |

```json
"mechs": { "crumble": { "delay": 0.25, "chain": 0 }, "pulse": { "period": 1.4, "wave": 0.1 } }
```

They only act on the static map; inside a group they keep their look and solidity. A script
adds more with `registerMechanism(name, { tiles, options, setup, update, hurts, draw })`
(`assets/js/game/mechanisms.js` is the reference), as well as new actors with
`registerActor` (`assets/js/game/actors.js`) and new kinds of group motion with
`registerMotion` (`assets/js/game/motion.js`).

## Music

```json
{ "bpm": 100, "voices": [ { "wave": "triangle", "v": 0.3, "notes": "a1 . c2 - g1 ." } ] }
```

Each entry in `notes` is a sixteenth note. `.` is a rest and `-` holds the previous note.
A voice can also take `cut`, a low-pass in Hz (e.g. `"cut": 1200`) that softens bright
waves like `sawtooth` and `square`.

## Scripts

A pack can optionally ship an ES module that exports `register(api)`. The API offers
`registerAction(name, fn)`, `registerTrigger(name, fn)` and `registerTile(char, def)`.
`assets/packs/base/script.js` is a real example. It adds the `typewrite` and `warp` actions
(`{ "warp": [x, y], "flip": true }`, where `null` keeps that axis), the `typed`
trigger, and these tiles: the `·` `°` stars, the `´` meteor tail and the `¤` wormhole mouth;
the `¦` curtain, `│` rope and `º` audience (none of them solid); the `•` footlight and `§`
sandbag (both solid); and `╱ ╲ ─ ┆ ╭ ╮ ╰ ╯` for painted scenery you can't stand on.

## Effects

Effects are procedural layers drawn behind the map, in front of it, or both. A world lists the
ones all its levels share in `fx`, and a level adds its own; a level entry with the same `id`
as a world entry is merged onto it, and `{ "id": "scene", "off": true }` drops it for that level.

```json
"fx": [ { "type": "cellar", "id": "scene" }, { "type": "texture", "pattern": "brick" },
        { "type": "dust", "count": 50 }, { "type": "vignette", "strength": 0.7 } ]
```

The core library (`assets/js/fx/`) is open to every pack:

- **Scenery** `cellar` (bricks lit by swinging bulbs, pipes, cobwebs), `foundry` (gears,
  trusses, chains, a pouring ladle, steam, furnace glow), `mirror` (an endless tunnel that
  rolls over with gravity, wireframe solids), `paper` (a notebook page: rules, margin, erased
  text, coffee ring, ink), `stage` (backdrop, valance, followspots, haze), `cosmos` (nebula,
  galaxy, ringed planet, stars, shooting stars). Without positions they furnish each level
  differently, seeded by its id.
- **Walls** `texture` fills the inside of wall masses with `pattern`: `rock`, `brick`,
  `plate`, `ink`, `planks`, `hull` or `crystal`, darker the deeper it goes, with an optional
  `shimmer` (`caustics`, `heat`, `scan`, `lamps`).
- **Atmosphere** `dust` (`kind`: `dust`, `embers`, `ash`, `snow`, `spores`, `glitter`),
  `vignette` (`strength`, `fog`: `[color, alpha]` rising from the floor), and `light`:
  darkness with colored lights and real shadows, an optional sonar, and light from any effect
  that has a `lights()` hook (the cellar's bulbs, the foundry's pour, the stage's spots).

A script registers new types with `registerFx(name, (def, play) => fx)`; `assets/js/game/fx.js`
lists the hooks an effect can have (`update`, `anim`, `back`, `front`, `lights`, `cmd`), and the
`{ "fx": "<id>", ... }` trap action talks to one. Effects draw with the glyph art kit in
`assets/js/art/` (glyph stamping on a grid twice as fine as the map, noise, color ramps), and
`assets/packs/abyss/script.js` is a pack-side example: a sky, a sea, jellyfish, a whirlpool, a
serpent, magma vents and an eye. Scenery should never use the glyphs that mean something in
play (`@ # * ^ v > $ ?`), so the eye can always tell the backdrop from the level.

A field also takes `"swim": true` (every press of jump is a stroke, as in water) and
`"motes": false` (the field stays invisible).

## Checking a level

The game's own code runs headless in Node, so a level can be tested without opening a browser.

```sh
node tools/solve.mjs w1.3            # find a way through a level (or w1 for a whole world)
node tools/solve.mjs w1.3 --beam 600 # a slower search that also finds waits and detours
node tools/solve.mjs w1.3 --replay "R20 RJ6 N10 R30"   # play a script, see what happens
node tools/format.mjs assets/packs/my-pack/world.json  # lay a world file out like the others
```

A script is a list of moves held for 1/20 s ticks: `R`, `L` or `N` (nothing), plus `J` to hold
jump. The solver prints the way it found, how long it took and how hard it had to look. Effects
that act on the player (the Abyss's creatures) can't be searched.
