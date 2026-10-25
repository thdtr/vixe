// Unlock rules, derived from the save. A world may declare
//   "requires": { "world": "w4", "secrets": 4 }
// otherwise it opens when the world before it is complete.

export class Progress {
  constructor(save, worlds, devMode = false) {
    this.save = save;
    this.worlds = worlds;
    this.dev = devMode;
  }

  done(level) { return !!this.save.levels[level.id]?.done; }

  // Given up on from the pause menu and not beaten since: opens the way on, but costs the crown.
  skipped(level) { return !this.done(level) && !!this.save.levels[level.id]?.skipped; }

  passed(level) { return this.done(level) || this.skipped(level); }

  complete(world) { return world.levels.every((l) => this.passed(l)); }

  skippedCount() { return this.worlds.reduce((n, w) => n + w.levels.filter((l) => this.skipped(l)).length, 0); }

  worldOpen(world) {
    if (this.dev) return true;
    // Once you've been in, a world stays open, even if an update moves its door.
    if (world.levels.some((l) => this.passed(l))) return true;
    const req = world.requires;
    if (!req) {
      const i = this.worlds.indexOf(world);
      return i === 0 || this.complete(this.worlds[i - 1]);
    }
    const dep = req.world && this.worlds.find((w) => w.id === req.world);
    if (dep && !this.complete(dep)) return false;
    return !(req.secrets && this.save.secrets.length < req.secrets);
  }

  levelOpen(world, i) {
    if (!this.worldOpen(world)) return false;
    return this.dev || i === 0 || this.passed(world.levels[i - 1]) || this.passed(world.levels[i]);
  }

  listed() {
    return this.worlds.filter((w) => !w.hidden || this.worldOpen(w));
  }

  // Display number: hidden worlds use their own code.
  code(world) {
    return world.code || String(this.worlds.filter((w) => !w.hidden).indexOf(world) + 1);
  }

  // Where "Play" should take you.
  resume() {
    for (const w of this.listed()) {
      if (!this.worldOpen(w)) continue;
      const i = w.levels.findIndex((l) => !this.passed(l));
      if (i >= 0) return { world: w, index: i };
    }
    return null;
  }

  next(world, index) {
    if (index + 1 < world.levels.length) return { world, index: index + 1 };
    const after = this.worlds.slice(this.worlds.indexOf(world) + 1).find((w) => this.worldOpen(w) && !this.complete(w));
    return after ? { world: after, index: 0 } : null;
  }

  // One '$' per level at most, either drawn on the map or hidden inside a word.
  hasSecret(level) {
    return level.map.some((row) => row.includes('$')) || (level.words || []).some((w) => Object.values(w.text).join('').includes('$'));
  }

  secretsTotal() {
    return this.worlds.reduce((n, w) => n + w.levels.filter((l) => this.hasSecret(l)).length, 0);
  }

  // Some world with an ending is behind you: the game stops hiding where its secrets are.
  finished() {
    return this.worlds.some((w) => w.ending && this.complete(w));
  }
}
