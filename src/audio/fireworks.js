// Firework sounds, mixed into SoundSystem (audio.js): the whoosh of a rocket going
// up, a shell's boom, the crackle of the ones that pop again, and a port's cheer.
// Made from the same noise and oscillators as the rest; no samples. Each takes
// opts.volume (0-1, by distance) and opts.delay in seconds: fireworks.js makes a boom
// late by how far off the burst is, as game.js does the thunder.

export class FireworkSounds {
  /**
   * Filtered noise that dies away slowly: up to `vol` in `attack` seconds, then falling by
   * about two thirds every `fade` seconds until `dur` is up. (noise() in audio.js drops
   * off much faster, which suits a splash and leaves a boom with no tail.)
   */
  rumble(t, dur, { type = 'lowpass', freq = 400, sweep = null, q = 0.7, vol = 0.3, attack = 0.02, fade = dur / 4, buf = this.white, dest = this.sfx } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = c.createGain();
    g.gain.value = 0; g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(0, t + attack, fade);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  /**
   * Where the booms go: through a limiter of their own. A volley of three is then one
   * big boom, not three added up past what the speakers can take.
   */
  boomBus() {
    if (this.fwBus?.context === this.ctx) return this.fwBus;
    const c = this.ctx, limit = c.createDynamicsCompressor();
    limit.threshold.value = -9; limit.knee.value = 6; limit.ratio.value = 16; limit.attack.value = 0.002; limit.release.value = 0.3;
    this.fwBus = c.createGain();
    this.fwBus.connect(limit); limit.connect(this.sfx);
    return this.fwBus;
  }

  /** Plays `name` if it is one of these and says so; audio.js asks here before the on-foot sounds. */
  playFirework(name, opts, t) {
    const v = Math.min(1, opts.volume ?? 1), tt = t + Math.max(0, opts.delay || 0);
    switch (name) {
      case 'rocket':
        // the fuse spits, then a rush of air that climbs as the rocket does
        this.noise(tt, 0.2, { type: 'highpass', freq: 3200, vol: 0.14 * v, attack: 0.004 });
        this.noise(tt, 1.35, { type: 'bandpass', freq: 520, sweep: 2500, q: 1.5, vol: 0.32 * v, attack: 0.15 });
        this.tone(640, tt + 0.05, 1.25, { type: 'sine', vol: 0.04 * v, attack: 0.25, glide: 1500 });
        return true;
      case 'boom': {
        // A shell bursting overhead, in four parts. The crack is the report itself. The
        // body is the thump: low enough to feel, with enough above 200 Hz that a laptop's
        // speakers still carry it (a sine at 40 Hz alone is silence on them, and what is
        // left is a small pop). Then the sound rolls away over the water for three
        // seconds, and comes back off it twice.
        // opts.soft: a willow or a crackle opens with less of a bang
        // (the limiter evens out what goes into it, so distance is squared to still be heard as distance)
        const k = opts.soft ? 0.55 : 1, far = v * v, dest = this.boomBus();
        this.rumble(tt, 0.16, { type: 'lowpass', freq: 6000, sweep: 700, vol: 1.1 * far * k, attack: 0.001, fade: 0.035, dest });
        this.tone(170, tt, 0.9, { type: 'triangle', vol: 0.75 * far * k, attack: 0.003, glide: 48, dest });
        this.tone(250, tt, 0.45, { type: 'triangle', vol: 0.4 * far * k, attack: 0.002, glide: 85, dest });
        this.tone(72, tt, 1.3, { type: 'sine', vol: 0.7 * far * k, attack: 0.004, glide: 30, dest });
        this.rumble(tt, 1.0, { type: 'lowpass', freq: 1100, sweep: 160, vol: 1.0 * far * k, attack: 0.003, fade: 0.2, dest });
        // rolling away…
        this.rumble(tt + 0.04, 3.4, { type: 'lowpass', freq: 420, sweep: 80, vol: 0.9 * far, attack: 0.05, fade: 0.8, buf: this.brown, dest });
        this.rumble(tt + 0.08, 2.8, { type: 'bandpass', freq: 520, sweep: 220, q: 0.5, vol: 0.3 * far, attack: 0.06, fade: 0.65, dest });
        // …and back off the water
        this.rumble(tt + 0.36, 1.2, { type: 'lowpass', freq: 650, sweep: 140, vol: 0.34 * far, attack: 0.02, fade: 0.28, dest });
        this.rumble(tt + 0.8, 1.6, { type: 'lowpass', freq: 420, sweep: 100, vol: 0.2 * far, attack: 0.05, fade: 0.4, dest });
        // the sparks themselves
        this.rumble(tt + 0.08, 1.5, { type: 'highpass', freq: 4200, vol: 0.03 * far * k, attack: 0.12, fade: 0.45, dest });
        return true;
      }
      case 'crackle':
        // opts.pops: seconds after the boom at which a spark pops; each is a small sharp tick
        for (const p of opts.pops || []) {
          const at = tt + p + Math.random() * 0.03;
          this.noise(at, 0.045, { type: 'highpass', freq: 3200 + Math.random() * 2600, vol: (0.08 + Math.random() * 0.06) * v, attack: 0.001 });
          this.noise(at, 0.09, { type: 'bandpass', freq: 1100 + Math.random() * 500, q: 1.2, vol: 0.055 * v, attack: 0.002 });
        }
        return true;
      case 'cheer': {
        // a crowd on a harbor wall, some way off: a swell of voices, a few whoops, clapping
        this.noise(tt, 2.8, { type: 'bandpass', freq: 850, sweep: 1150, q: 0.8, vol: 0.13 * v, attack: 0.55 });
        this.noise(tt + 0.1, 2.4, { type: 'bandpass', freq: 1900, q: 1.1, vol: 0.06 * v, attack: 0.7 });
        for (let i = 0; i < 5; i++) {
          const at = tt + 0.15 + Math.random() * 1.5, f = 430 + Math.random() * 260;
          this.tone(f, at, 0.3 + Math.random() * 0.2, { type: 'triangle', vol: 0.028 * v, attack: 0.06, glide: f * (1.5 + Math.random() * 0.4) });
        }
        for (let i = 0; i < 22; i++) this.noise(tt + 0.4 + Math.random() * 2.1, 0.03, { type: 'bandpass', freq: 1900 + Math.random() * 900, q: 1.5, vol: 0.05 * v, attack: 0.001 });
        return true;
      }
      default:
        return false;
    }
  }
}
