// Firework sounds, mixed into SoundSystem (audio.js): the whoosh of a rocket going
// up, a shell's boom, the crackle of the ones that pop again, and a port's cheer.
// Made from the same noise and oscillators as the rest; no samples. Each takes
// opts.volume (0-1, by distance) and opts.delay in seconds: fireworks.js makes a boom
// late by how far off the burst is, as game.js does the thunder.

export class FireworkSounds {
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
        // a crack, a thump you feel, and the sound rolling away over the water;
        // opts.soft: a willow or a crackle opens with less of a bang
        const k = opts.soft ? 0.6 : 1;
        this.noise(tt, 0.08, { type: 'highpass', freq: 1700, vol: 0.34 * v * k, attack: 0.002 });
        this.tone(98, tt, 0.55, { type: 'sine', vol: 0.38 * v * k, attack: 0.004, glide: 38 });
        this.noise(tt, 0.5, { type: 'lowpass', freq: 950, sweep: 170, vol: 0.3 * v * k, attack: 0.004 });
        this.noise(tt + 0.06, 1.7, { type: 'lowpass', freq: 230, sweep: 70, vol: 0.3 * v, attack: 0.04, buf: this.brown });
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
