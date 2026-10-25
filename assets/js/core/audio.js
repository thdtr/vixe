// Every sound is synthesized on the fly: no audio files to download.

const SFX = {
  jump:    [{ wave: 'square', f: [240, 480], d: 0.08, v: 0.07 }],
  land:    [{ noise: 700, d: 0.05, v: 0.12 }],
  die:     [{ noise: 2400, d: 0.3, v: 0.3 }, { wave: 'sawtooth', f: [320, 38], d: 0.4, v: 0.1 }],
  win:     [523, 659, 784, 1046].map((f, i) => ({ wave: 'triangle', f: [f, f], d: 0.12, v: 0.12, at: i * 0.07 })),
  trap:    [{ wave: 'square', f: [110, 40], d: 0.22, v: 0.12 }, { noise: 400, d: 0.15, v: 0.1 }],
  pop:     [{ wave: 'square', f: [1300, 300], d: 0.05, v: 0.06 }],
  bonk:    [{ wave: 'triangle', f: [180, 90], d: 0.1, v: 0.2 }],
  thud:    [{ noise: 300, d: 0.18, v: 0.25 }],
  flip:    [{ wave: 'sine', f: [200, 900], d: 0.25, v: 0.12 }],
  coin:    [{ wave: 'square', f: [988, 988], d: 0.06, v: 0.06 }, { wave: 'square', f: [1319, 1319], d: 0.2, v: 0.06, at: 0.06 }],
  tick:    [{ wave: 'square', f: [880, 880], d: 0.025, v: 0.04 }],
  select:  [{ wave: 'square', f: [440, 880], d: 0.07, v: 0.06 }],
  glitch:  [{ noise: 5000, d: 0.08, v: 0.12 }, { wave: 'square', f: [60, 2000], d: 0.06, v: 0.05, at: 0.05 }],
  type:    [{ noise: 3500, d: 0.015, v: 0.05 }],
  hum:     [{ wave: 'sine', f: [90, 180], d: 0.3, v: 0.12 }, { wave: 'triangle', f: [360, 720], d: 0.25, v: 0.04 }],
  warp:    [{ wave: 'sine', f: [1800, 120], d: 0.3, v: 0.1 }, { wave: 'triangle', f: [200, 1600], d: 0.2, v: 0.05, at: 0.12 }],
};

// Sounds heard over and over drift a little in pitch (noise: in brightness) on each play,
// so they don't drone. Iconic ones like coin, win and die always sound the same.
const VARY = { jump: 0.04, tick: 0.03, bonk: 0.05, land: 0.15, thud: 0.12, type: 0.2 };

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function freq(token) {
  const m = /^([a-g])(#?)(\d)$/.exec(token);
  if (!m) return 0;
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// Drops whatever a param was gliding toward and goes on from where it is now.
function hold(param, now) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.volumes = { music: 0.5, sfx: 0.8 };
    this.track = null;
    this.song = null;           // the track playing now: its scheduler and its own gain
    this.lastPlayed = {};
  }

  // Browsers only allow audio after a user gesture.
  // iOS also leaves the context "interrupted" after a call or a trip away from the page.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Plays along with whatever the player is already listening to instead of stopping it
    // (Safari; other browsers don't have the API yet).
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    const ctx = this.ctx = new AC();
    // A limiter on the way out keeps stacked sounds from clipping. Only peaks reach the
    // threshold; the master gain undoes the compressor's built-in makeup gain (about +2.6 dB).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.74;
    this.master.connect(limiter);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    // The music goes through a filter and a gain of its own, so pausing and dying
    // can pull it back without touching the volume setting (see muffle and dip).
    this.open = ctx.sampleRate / 2;
    this.musicLp = ctx.createBiquadFilter();
    this.musicLp.frequency.value = this.open;
    this.musicDuck = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.musicLp).connect(this.musicDuck).connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.setVolumes(this.volumes.music, this.volumes.sfx);
    if (this.track) this.music(this.track, true);
  }

  setVolumes(music, sfx) {
    this.volumes = { music, sfx };
    if (!this.ctx) return;
    // Squared so each step of the bar sounds like the same change; eased so it doesn't click.
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music * music * 0.5, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(sfx * sfx, now, 0.02);
  }

  suspend(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend(); else this.ctx.resume();
  }

  // Paused, the music sounds muffled and quieter, as if from the next room.
  muffle(on) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicLp.frequency.setTargetAtTime(on ? 700 : this.open, now, 0.08);
    hold(this.musicDuck.gain, now);
    this.musicDuck.gain.setTargetAtTime(on ? 0.5 : 1, now, 0.08);
  }

  // The music ducks under a death and comes back right after.
  dip() {
    if (!this.ctx) return;
    const g = this.musicDuck.gain, now = this.ctx.currentTime;
    hold(g, now);
    g.setTargetAtTime(0.35, now, 0.02);
    g.setTargetAtTime(1, now + 0.35, 0.25);
  }

  // pan: -1 (left) to 1 (right). Without a stereo panner (old Safari) it stays centered.
  play(name, pan = 0) {
    const parts = SFX[name];
    if (!parts || !this.ctx || this.volumes.sfx <= 0) return;
    // The same sound twice at once (two traps going off in one frame) would only play
    // louder and phasey, so the second one is dropped.
    const now = performance.now();
    if (now - (this.lastPlayed[name] ?? -Infinity) < 20) return;
    this.lastPlayed[name] = now;
    const t0 = this.ctx.currentTime;
    const k = 1 + (Math.random() * 2 - 1) * (VARY[name] || 0);
    let bus = this.sfxBus;
    if (pan && this.ctx.createStereoPanner) {
      bus = this.ctx.createStereoPanner();
      bus.pan.value = pan;
      bus.connect(this.sfxBus);
    }
    for (const p of parts) this.voice(p, t0 + (p.at || 0), bus, k);
  }

  voice(p, t, bus, k = 1) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    // A few ms of attack: starting at full volume clicks, mostly on square and saw waves.
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(p.v, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p.d);
    gain.connect(bus);
    let src;
    if (p.noise) {
      src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = p.noise * k;
      src.connect(lp).connect(gain);
    } else {
      src = ctx.createOscillator();
      src.type = p.wave;
      src.frequency.setValueAtTime(p.f[0] * k, t);
      if (p.f[1] !== p.f[0]) src.frequency.exponentialRampToValueAtTime(p.f[1] * k, t + p.d);
      src.connect(gain);
    }
    src.start(t);
    src.stop(t + p.d + 0.02);
  }

  // A tiny step sequencer. A track is { bpm, voices: [{ wave, v, notes, cut? }] }
  // where notes is a space separated list of 16th steps: "a2", "." rest, "-" hold,
  // and cut (Hz) is an optional low-pass that softens bright waves.
  music(track, force = false) {
    if (track === this.track && !force) return;
    this.track = track;
    if (!this.ctx) return;
    // The old track keeps going while it fades out, so it ends instead of being cut off,
    // and the new one comes in as the old one is nearly gone.
    const old = this.song, now = this.ctx.currentTime;
    this.song = null;
    if (old) {
      old.out.gain.setTargetAtTime(0, now, 0.1);
      setTimeout(() => { clearInterval(old.timer); old.out.disconnect(); }, 1000);
    }
    if (track) this.song = this.sequence(track, now + (old ? 0.3 : 0.1));
  }

  sequence(track, start) {
    const out = this.ctx.createGain();
    out.connect(this.musicBus);
    const voices = track.voices.map((v) => {
      let to = out;
      if (v.cut) {
        to = this.ctx.createBiquadFilter();
        to.frequency.value = v.cut;
        to.connect(out);
      }
      return { ...v, to, steps: v.notes.trim().split(/\s+/) };
    });
    const stepDur = 60 / track.bpm / 4;
    let step = 0, next = start;
    const schedule = () => {
      while (next < this.ctx.currentTime + 0.15) {
        for (const v of voices) {
          const tok = v.steps[step % v.steps.length];
          const f = freq(tok);
          if (!f || this.volumes.music <= 0) continue;   // muted: keeps time, plays nothing
          let len = 1;
          while (v.steps[(step + len) % v.steps.length] === '-') len++;
          this.voice({ wave: v.wave, f: [f, f], d: len * stepDur * 0.95, v: v.v }, next, v.to);
        }
        step++;
        next += stepDur;
      }
    };
    schedule();
    return { out, timer: setInterval(schedule, 40) };
  }
}
