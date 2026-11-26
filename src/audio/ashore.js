// On-foot sound, mixed into SoundSystem (audio.js): footsteps by surface, jump
// and land, the coin chime, the chest fanfare, what an island sounds like
// (birds, crickets, gulls, wind in the rocks) and the on-foot turn of the
// score. Made from the same oscillators and noise as the rest; no samples.

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic degrees
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

// A footfall by surface (the tags in ashore/shapes.js). Each is a short burst
// of filtered noise, with a low knock where the ground is hard or hollow:
// [filter, Hz, Q, seconds, volume, knock Hz or 0]
const STEPS = {
  sand: ['lowpass', 850, 0.6, 0.12, 0.2, 0],
  grass: ['bandpass', 1700, 0.8, 0.075, 0.19, 0],
  leaf: ['bandpass', 3100, 1.3, 0.09, 0.16, 0],
  stone: ['highpass', 2300, 0.7, 0.035, 0.055, 135],
  wood: ['bandpass', 900, 2.2, 0.04, 0.07, 195],
};

// What plays on an island, by biome and by day or night: [voice, shortest and
// longest wait in seconds]. A biome without an entry sounds like `temperate`;
// each new biome adds its own line here and a voice below if it needs one.
const AMBIENCE = {
  temperate: { day: [['songbird', 2.5, 7]], night: [['cricket', 0.9, 2.6]] },
  rocky: { day: [['farGull', 6, 15], ['whistle', 5, 12]], night: [['whistle', 4, 10]] },
};

export class AshoreSounds {
  /** Called once from build(): the island ambience's own bus, spread left to right. */
  buildAshore() {
    const c = this.ctx;
    this.landBus = c.createGain(); this.landBus.gain.value = 0;
    this.landBus.connect(this.amb);
    this.landPans = [-0.65, 0, 0.65].map((v) => {
      const p = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
      if (p.pan) p.pan.value = v;
      p.connect(this.landBus);
      return p;
    });
    this.landMix = 0;   // 0 at sea → 1 ashore, eased
    this.ambT = {};     // seconds until each ambience voice next sounds
    this.landBeat = 0;  // notes since the on-foot score's last bass note
  }

  /**
   * Each frame, from update(). `biome` is the island you are on (null at
   * sea), `rain` 0-1: birds and crickets shelter from it.
   */
  updateAshore(dt, t, biome, rain = 0) {
    this.landMix += ((biome ? 1 : 0) - this.landMix) * Math.min(1, dt * 1.5);
    this.landBus.gain.setTargetAtTime(this.landMix, t, 0.4);
    if (!biome || !this.soundOn) return;
    const A = AMBIENCE[biome] || AMBIENCE.temperate;
    for (const [voice, lo, hi] of this.night > 0.5 ? A.night : A.day) {
      const k = biome + voice;
      this.ambT[k] = (this.ambT[k] ?? rand(0.3, lo)) - dt;
      if (this.ambT[k] > 0) continue;
      this.ambT[k] = rand(lo, hi);
      if (voice === 'whistle' || Math.random() > rain * 1.6) this[voice](t + 0.02, this.landPans[(Math.random() * 3) | 0]);
    }
  }

  // ------------------------------------------------------- ambience voices
  /** A small bird: a few quick notes that slide, now and then a trill. */
  songbird(t, dest) {
    const trill = Math.random() < 0.25, n = trill ? 6 : 2 + ((Math.random() * 3) | 0);
    const f0 = rand(2900, 4600), gap = trill ? 0.06 : rand(0.1, 0.17), vol = rand(0.03, 0.05);
    for (let i = 0; i < n; i++) {
      const f = f0 * (trill ? 1 : rand(0.85, 1.2));
      this.tone(f, t + i * gap, trill ? 0.05 : rand(0.07, 0.12), { type: 'sine', vol, attack: 0.012, glide: f * rand(0.75, 1.3), dest });
    }
  }

  /** A cricket: a short run of dry, high pulses. */
  cricket(t, dest) {
    const f = rand(4000, 4600), n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      this.tone(f, t + i * 0.055, 0.035, { type: 'sine', vol: 0.02, attack: 0.004, dest });
      this.tone(f * 2, t + i * 0.055, 0.03, { type: 'sine', vol: 0.006, attack: 0.004, dest });
    }
  }

  /** A gull some way off: the take-off cry (audio.js 'gull'), softer and lower. */
  farGull(t, dest) {
    const n = 1 + ((Math.random() * 3) | 0), f = rand(980, 1180);
    for (let i = 0; i < n; i++) {
      const dur = rand(0.22, 0.36);
      this.tone(f, t + i * 0.36, dur, { type: 'triangle', vol: 0.05, attack: 0.03, glide: f * 0.6, dest });
    }
  }

  /** Wind finding a gap in the rocks: a thin note that swells and dies away. */
  whistle(t, dest) {
    const c = this.ctx, dur = rand(2.2, 3.6), f0 = rand(620, 1050);
    const s = c.createBufferSource(); s.buffer = this.white; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.linearRampToValueAtTime(f0 * rand(1.08, 1.3), t + dur * 0.45);
    f.frequency.linearRampToValueAtTime(f0 * 0.92, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rand(0.1, 0.2), t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- music
  /**
   * The score on foot: the same wandering pentatonic line as at sea
   * (musicNote), a fourth lower on a soft mallet, with a bass note under
   * every few so it walks along with you.
   */
  landNote(storm) {
    const t = this.ctx.currentTime + 0.02;
    this.melody += Math.floor(Math.random() * 5) - 2;
    if (this.melody < 0) this.melody = 1;
    if (this.melody > 11) this.melody = 9;
    const deg = PENTA[this.melody % 5], oct = Math.floor(this.melody / 5);
    const root = storm > 0.5 ? 52 : 57; // E (moody) or A: a fourth under the sea's A and D
    const vol = this.night > 0.5 ? 0.036 : 0.052;
    this.mallet(midi(root + deg + oct * 12), t, vol);
    if (Math.random() < 0.3) this.mallet(midi(root + PENTA[(this.melody + 2) % 5] + oct * 12), t + 0.16, vol * 0.6);
    if (++this.landBeat >= 3) {
      this.landBeat = Math.random() < 0.4 ? 1 : 0;
      this.tone(midi(root - 12 + (Math.random() < 0.35 ? 7 : 0)), t, 1.4, { type: 'sine', vol: vol * 1.1, attack: 0.02, dest: this.musicIn });
    }
  }

  /** A soft mallet note (a thumb piano, near enough): a round tone with a quick, bright knock on top. */
  mallet(freq, t, vol) {
    this.tone(freq, t, 1.1, { type: 'sine', vol, attack: 0.006, dest: this.musicIn });
    this.tone(freq * 2, t, 0.5, { type: 'triangle', vol: vol * 0.22, attack: 0.004, dest: this.musicIn });
    this.tone(freq * 3.93, t, 0.09, { type: 'sine', vol: vol * 0.3, attack: 0.002, dest: this.musicIn });
  }

  // ------------------------------------------------------------- one-shots
  /** One footfall on `surface`, at volume k (about 1 walking, more at a run). */
  footfall(t, surface, k) {
    const [type, freq, q, dur, vol, knock] = STEPS[surface] || STEPS.grass;
    const tune = rand(0.86, 1.16);
    this.noise(t, dur, { type, freq: freq * tune, q, vol: vol * k, attack: 0.004, sweep: type === 'lowpass' ? freq * 0.5 : null });
    if (knock) this.tone(knock * tune, t, 0.07, { type: 'sine', vol: 0.08 * k, attack: 0.003, glide: knock * 0.6 });
  }

  /** The on-foot one-shots. Returns false for a name it doesn't know. */
  playAshore(name, opts, t) {
    const v = Math.min(1.5, opts.volume ?? 1);
    switch (name) {
      case 'step':
        this.footfall(t, opts.surface, v);
        return true;
      case 'jump':
        // a small push off the ground and the air going by
        this.tone(240, t, 0.11, { type: 'sine', vol: 0.08 * v, attack: 0.008, glide: 430 });
        this.noise(t, 0.16, { type: 'bandpass', freq: 600, sweep: 1700, q: 1.1, vol: 0.1 * v, attack: 0.03 });
        return true;
      case 'land':
        // both feet, and a thump that grows with the fall (volume 0-1)
        this.footfall(t, opts.surface, 1.1 + v * 0.5);
        this.footfall(t + 0.03, opts.surface, 0.8 + v * 0.4);
        if (v > 0.25) this.tone(105, t, 0.2, { type: 'sine', vol: 0.22 * (v - 0.2), attack: 0.004, glide: 48 });
        return true;
      case 'chime': {
        // a coin: a small bell that climbs the scale while you keep collecting (opts.n: coins in a row)
        const n = Math.min(opts.n || 0, 9), f = midi(84 + PENTA[n % 5] + 12 * Math.floor(n / 5));
        this.tone(f, t, 0.5, { type: 'sine', vol: 0.06 });
        this.tone(f * 2.76, t, 0.22, { type: 'sine', vol: 0.018 });
        this.tone(f * 2, t + 0.05, 0.3, { type: 'triangle', vol: 0.02 });
        return true;
      }
      case 'fanfare': {
        // a chest: three rising notes and a chord that rings on, with a glitter over it
        [62, 66, 69].forEach((n, i) => {
          this.tone(midi(n), t + i * 0.13, 0.3, { type: 'triangle', vol: 0.07 });
          this.tone(midi(n), t + i * 0.13, 0.26, { type: 'square', vol: 0.014 });
        });
        for (const n of [62, 66, 69, 74]) this.tone(midi(n), t + 0.42, 1.7, { type: 'triangle', vol: 0.034, attack: 0.015 });
        this.tone(midi(50), t + 0.42, 1.8, { type: 'sine', vol: 0.06, attack: 0.02 });
        for (let i = 0; i < 7; i++) this.tone(midi(86 + PENTA[(i * 2) % 5]), t + 0.55 + i * 0.07, 0.35, { type: 'sine', vol: 0.02 });
        return true;
      }
      default:
        return false;
    }
  }
}
