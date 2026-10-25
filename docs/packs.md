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
label shown instead of the level number) and `ending` (a closing scene after the last level).

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

Map tiles

```
#  wall            %  fake wall         &  invisible block (shows up when touched)
=  solid girder    -  one-way platform  ^ v  spikes (floor / ceiling)
*  saw             ~  acid              >  exit
?  sign            @  start             any other character is a solid letter
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
  `land`, `stand` (on top of a group), `idle`, `deaths`, `fewerDeaths`, `collected`, `flag`.
  An event fires once by default. With `"repeat": true` it fires every time it happens again.
- **Actions** `show`, `hide`, `wobble`, `fall` (`land`, `speed`, `dir`: `-1` falls up), `move`
  (`by`, `speed`, `loop`, `linear`, `wait`), `stop`, `swap` (`to`, `from`: only these tiles),
  `fill` (`with`), `gravity`, `weight`, `field` (`on`), `controls`, `speed`, `tide`, `dark`,
  `say`, `sfx`, `shake`, `glitch`, `flash`, `flag`, `fire`, `wait`, `kill`, `win`, `ease`.
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
