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
?  sign            @  start             $  secret
any other character is a solid letter
```

A level holds one secret at most, and a secret should be hidden. A `$` with no open air in
any of the eight cells around it (walls, fake walls or solid tiles all round) is **buried**:
it's drawn as part of the wall until the player walks into a fake wall next to it, then it
glints into view. So bury it behind a `%`, like the pocket left of the start in 1-6:

```
%%%
$%%  @
####
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

A world's `music` is a track. The game's own themes (`assets/js/core/themes.js`) are written
the same way, and so are the seven worlds, which make good examples.

```json
{ "bpm": 100, "voices": [ { "wave": "triangle", "v": 0.3, "notes": "a1 . c2 - g1 ." } ] }
```

Each entry in `notes` is a sixteenth note: a note (`a1`, `c#4`, `bb2`), `.` for a rest, or `-`
to hold the note before it. Notes joined by `+` sound together (`a2+c3+e3`), `!` after a note
accents it and `~` plays it softly. `notes` may be an array of strings, one bar each.

**Sections.** A song is more than a loop once it has `seq`, the order its sections play in.
A voice's `notes` then holds a pattern for each section it plays in, and it rests through the
others:

```json
{ "bpm": 100, "seq": "I A A B A", "loop": 1, "voices": [
    { "wave": "triangle", "v": 0.3,
      "notes": { "I": "a1 - - - . . . .", "A": "a1 . a1 . c2 . a1 .", "B": "f1 . . . g1 . . ." } },
    { "drums": true, "v": 0.2, "layer": 1, "notes": { "A B": "k . h . s . h ." } } ] }
```

A section lasts as long as its longest pattern, and shorter ones loop inside it. A key may name
several sections (`"A B"`), and `"=A"` as a pattern means "the same as A". `loop` is the entry
of `seq` the song returns to when it ends, so an intro plays once. A voice whose `notes` is a
plain string (or array) keeps looping under every section at its own length: a loop of 37 steps
drifts against the bars and never lands the same way twice.

**Drums.** A voice with `"drums": true` takes hits instead of notes, one letter each, several at
once (`kh` is a kick and a hat). The standard kit has `k` kick, `s` snare, `h` hat, `o` open hat,
`c` clap, `t` tom, `r` rim, `x` crash, `b` a long low boom and `m` shaker. `"kit"`, on the track
or on a voice, swaps sounds in: `metal` (an anvil for a snare, steam for hats, `p` a struck
pipe), `type` (a typewriter: keys, space bar, carriage, `d` its bell, `z` a line break) or
`soft` (everything rounded off). It can also be a table of your own, `{ "k": [ ...parts ] }`,
in the format of the sound effects at the top of `assets/js/core/audio.js`.

**A voice** can set:

| setting | what it does |
|---------|--------------|
| `wave` | `sine`, `triangle`, `square`, `sawtooth`, `pulse` (`width` wide, 0.25 by default), or a list of harmonics such as `[1, 0.5, 0.3]` |
| `v` | how loud |
| `env` | `[attack, decay, sustain, release]`: seconds, with sustain from 0 to 1. Without it a note is plucked, dying away over its length |
| `gate` | how much of its steps a note sounds for (0.95 by default; 0.5 is staccato) |
| `cut`, `res` | a low-pass in Hz that softens bright waves, and its resonance in dB |
| `sweep` | `[from, to, seconds]`: a filter of the note's own that closes (or opens) as it sounds |
| `detune` | cents between two copies of the wave, for a wider sound |
| `vib` | `[cents, hz]` of vibrato |
| `glide` | seconds a note takes to slide from the one before |
| `tr` | transposes the voice, in semitones |
| `pan` | from -1 (left) to 1 (right) |
| `echo`, `space` | how much of the voice goes to the track's echo and to its room, from 0 to 1 |
| `layer` | the intensity it comes in at (below), or `[from, to]` |

**A track** can set `bpm`, `div` (steps to a beat, 4 by default), `bar` (steps to a bar, 16 by
default; a waltz is 12), `swing` (how late every other step lands, 0 to 0.5), `seq`, `loop`,
`kit`, and:

- `echo`: `{ "steps": 3, "feedback": 0.5, "cut": 2800 }`, repeats that bounce from ear to ear.
- `space`: `{ "time": 1.8, "cut": 3500, "mix": 1 }`, the room the track plays in: how long it
  rings and how dull it is. The level's sound effects ring in the same room, so a world sounds
  like one place.
- `win`: the notes that play when a level is won (`"a4 c5 e5 a5"`), in the track's key.

**Layers.** The game plays a world's track at an intensity from 0 to 3 that rises through its
levels: the first ones hear only the voices with no `layer`, and the last level hears
everything. Give the bones of the track no layer, and bring in drums, harmonies and extras at
1, 2 and 3. The level select and a world's title card play it at 0, from behind a door.

`node tools/check.mjs` reads every track: a token that isn't a note, a bar that is a step
short, a drum the kit doesn't have and a misspelled setting are all reported.

## Scripts

A pack can optionally ship an ES module that exports `register(api)`. The API offers
`registerAction(name, fn)`, `registerTrigger(name, fn)` and `registerTile(char, def)`.
`assets/packs/base/script.js` is a real example. It adds the `typewrite` and `warp` actions
(`{ "warp": [x, y], "flip": true }`, where `null` keeps that axis), the `typed`
trigger (a word typed on a keyboard, in the language being played:
`{ "typed": { "pt-BR": ["saída"], "en": ["exit"] } }`; `p` pauses, so a word with a `p` in it
can never be typed in a level), and these tiles: the `·` `°` stars, the `´` meteor tail and
the `¤` wormhole mouth;
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
node tools/solve.mjs w2.6 --via "24,13 34,11 24,9"     # aim for these cells in turn, then the exit
node tools/solve.mjs w1 --naive        # can mindless play (hold right, hop on a beat) win? It shouldn't
node tools/solve.mjs w1 --human        # only taps a thumb can do: jump held for 0.1 s or more
node tools/check.mjs                   # every level loads, no trap, zone or flag is dead, every track reads
node tools/format.mjs assets/packs/my-pack/world.json  # lay a world file out like the others
```

A script is a list of moves held for 1/20 s ticks: `R`, `L` or `N` (nothing), plus `J` to hold
jump. The solver prints the way it found, how long it took and how hard it had to look; `--slack`
adds how often that way still wins when its timing is nudged. Effects that act on the player
need `save()` and `load()` (see `assets/js/game/fx.js`) to be searched.

The search presses jump for a single tick when it suits it, which no thumb can do: a level may
be winnable only that way. `--human` holds every press for 0.1 s or more, so what it finds a
person can play. If it finds nothing where the plain search does, give it room before believing
it (`--patience 3` with a bigger `--budget`, `--beam`, or waypoints on every ledge with `--via`,
which is what works most often), then look at the level.

Some levels make the search wander off (a door that runs, a route that leads away from the exit
first). `tools/routes.json` keeps a winning script for each of them, and checking those levels
replays it: if a change breaks one, the solver says **ROUTE BROKEN**. When you add such a level,
find a way with `--human` and `--beam` or `--via`, check it with `--replay`, and add it to the
file. Every route there is one a person's taps can play.
