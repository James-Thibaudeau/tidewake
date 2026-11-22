// Fully procedural WebAudio: ocean/wind/rain beds, sparse ambient music and
// one-shot effects. Everything is a safe no-op until unlock() is called from a
// user gesture.

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic degrees
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.soundOn = true;
    this.musicOn = true;
    this.time = 0;
    this.nextNote = 2;
    this.melody = 2;
    this.night = 0;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.build();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      console.warn('Audio unavailable', e);
      this.ctx = null;
    }
  }

  setSound(on) {
    this.soundOn = !!on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
  }

  setMusic(on) {
    this.musicOn = !!on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.3);
  }

  build() {
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = this.soundOn ? 0.55 : 0;
    this.master.connect(comp);

    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 1; this.amb.connect(this.master);

    // music bus with a feedback echo
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
    this.musicBus.connect(this.master);
    this.musicIn = c.createGain(); this.musicIn.gain.value = 1;
    const delay = c.createDelay(2); delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const wet = c.createGain(); wet.gain.value = 0.45;
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
    this.musicIn.connect(this.musicBus);
    this.musicIn.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(this.musicBus);

    // noise buffers
    const len = c.sampleRate * 2;
    this.white = c.createBuffer(1, len, c.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    const loop = (buf) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // ocean bed
    this.oceanFilter = c.createBiquadFilter(); this.oceanFilter.type = 'lowpass'; this.oceanFilter.frequency.value = 400;
    this.oceanGain = c.createGain(); this.oceanGain.gain.value = 0;
    loop(this.brown).connect(this.oceanFilter); this.oceanFilter.connect(this.oceanGain); this.oceanGain.connect(this.amb);
    // wind bed
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 700; this.windFilter.Q.value = 0.8;
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    loop(this.white).connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.amb);
    // rain bed
    this.rainFilter = c.createBiquadFilter(); this.rainFilter.type = 'highpass'; this.rainFilter.frequency.value = 2200;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    loop(this.white).connect(this.rainFilter); this.rainFilter.connect(this.rainGain); this.rainGain.connect(this.amb);
  }

  update(dt, p = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    this.time += dt;
    const speed = p.speed || 0, wind = p.wind ?? 1, rain = p.rain || 0, storm = p.storm || 0;
    if (p.night != null) this.night = p.night;
    const swell = 0.75 + 0.25 * Math.sin(this.time * 0.45) * Math.sin(this.time * 0.17 + 1);
    const port = p.inPort ? 0.6 : 1;
    this.oceanGain.gain.setTargetAtTime((0.16 + 0.08 * wind + 0.01 * Math.min(speed, 25) + storm * 0.12) * swell * port, t, 0.3);
    this.oceanFilter.frequency.setTargetAtTime(280 + wind * 220 + Math.min(speed, 25) * 18 + storm * 300, t, 0.3);
    const gust = 0.7 + 0.3 * Math.sin(this.time * 0.9) * Math.sin(this.time * 0.37);
    this.windGain.gain.setTargetAtTime((0.012 + 0.05 * Math.max(0, wind - 0.5) + storm * 0.07) * gust, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(500 + wind * 400 + gust * 300 + storm * 500, t, 0.5);
    this.rainGain.gain.setTargetAtTime(rain * 0.16, t, 0.6);

    // ambient music
    this.nextNote -= dt;
    if (this.nextNote <= 0) {
      const calm = this.night > 0.5 ? 1.5 : 1;
      this.nextNote = (1.1 + Math.random() * 2.6) * calm * (storm > 0.5 ? 1.6 : 1);
      if (this.musicOn) this.musicNote(storm);
    }
  }

  musicNote(storm) {
    const c = this.ctx, t = c.currentTime + 0.02;
    this.melody += Math.floor(Math.random() * 5) - 2;
    if (this.melody < 0) this.melody = 1;
    if (this.melody > 11) this.melody = 9;
    const deg = PENTA[this.melody % 5], oct = Math.floor(this.melody / 5);
    const root = storm > 0.5 ? 57 : 62; // A (moody) or D
    const note = root + deg + oct * 12;
    const vol = this.night > 0.5 ? 0.05 : 0.07;
    this.pluck(midi(note), t, vol);
    if (Math.random() < 0.25) this.pluck(midi(note - 12 + (Math.random() < 0.5 ? 7 : 0)), t + 0.01, vol * 0.7);
    if (Math.random() < 0.2) this.pluck(midi(note + PENTA[(this.melody + 2) % 5] - deg), t + 0.22, vol * 0.6);
  }

  pluck(freq, t, vol, dest = this.musicIn) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6);
    const g2 = c.createGain(); g2.gain.value = 0.25;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(dest);
    o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
  }

  tone(freq, t, dur, { type = 'triangle', vol = 0.15, attack = 0.01, glide = null, dest = this.sfx } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(t, dur, { type = 'lowpass', freq = 800, q = 0.7, vol = 0.3, attack = 0.005, sweep = null, buf = this.white } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ctx || !this.soundOn) return;
    try { this._play(name, opts); } catch (e) { /* never let audio break the game */ }
  }

  _play(name, opts) {
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'click':
        this.tone(1250, t, 0.05, { type: 'sine', vol: 0.06 });
        break;
      case 'coin':
        this.tone(988, t, 0.09, { type: 'square', vol: 0.035 });
        this.tone(1319, t + 0.07, 0.3, { type: 'square', vol: 0.035 });
        this.tone(2638, t + 0.07, 0.25, { type: 'sine', vol: 0.03 });
        break;
      case 'discover': {
        const notes = [74, 78, 81, 86, 90];
        notes.forEach((n, i) => this.tone(midi(n), t + i * 0.11, 0.9 - i * 0.05, { vol: 0.11 }));
        [74, 78, 81].forEach((n) => this.tone(midi(n), t + 0.6, 1.8, { type: 'sine', vol: 0.06, attack: 0.08 }));
        this.tone(midi(98), t + 0.55, 0.8, { type: 'sine', vol: 0.03 });
        break;
      }
      case 'treasure': {
        [69, 73, 76, 81, 85, 88].forEach((n, i) => this.tone(midi(n), t + i * 0.07, 0.6, { type: 'square', vol: 0.03 }));
        for (let i = 0; i < 8; i++) this.tone(midi(93 + (i % 3) * 4), t + 0.45 + i * 0.06, 0.4, { type: 'sine', vol: 0.035 });
        this.tone(midi(57), t + 0.4, 1.5, { type: 'triangle', vol: 0.1 });
        break;
      }
      case 'crash':
        this.noise(t, 0.4, { type: 'lowpass', freq: 900, sweep: 200, vol: 0.5 });
        this.tone(110, t, 0.35, { type: 'sine', vol: 0.4, glide: 40 });
        this.tone(190, t + 0.03, 0.18, { type: 'square', vol: 0.06, glide: 90 });
        break;
      case 'thunder': {
        const d = Math.max(0, opts.delay || 0), v = opts.volume ?? 1;
        const tt = t + d;
        this.noise(tt, 2.8, { type: 'lowpass', freq: 220, sweep: 60, vol: 0.55 * v, attack: 0.04, buf: this.brown });
        this.noise(tt + 0.15, 1.6, { type: 'lowpass', freq: 400, sweep: 80, vol: 0.35 * v, attack: 0.02 });
        this.noise(tt + 0.6, 2.2, { type: 'lowpass', freq: 160, vol: 0.4 * v, attack: 0.2, buf: this.brown });
        break;
      }
      case 'upgrade':
        [62, 66, 69, 74, 78].forEach((n, i) => this.tone(midi(n), t + i * 0.06, 0.35, { type: 'square', vol: 0.035 }));
        this.tone(midi(86), t + 0.32, 0.9, { type: 'triangle', vol: 0.1 });
        this.noise(t + 0.3, 0.5, { type: 'highpass', freq: 5000, vol: 0.05 });
        break;
      case 'wreck':
        [69, 65, 62, 57].forEach((n, i) => this.tone(midi(n), t + i * 0.38, 0.9, { type: 'triangle', vol: 0.12 }));
        this.tone(midi(45), t + 1.4, 2.2, { type: 'sine', vol: 0.12 });
        this.noise(t, 1.6, { type: 'lowpass', freq: 600, sweep: 120, vol: 0.3, attack: 0.1, buf: this.brown });
        break;
      case 'dock':
        for (const [dt, f] of [[0, 880], [0.45, 660]]) {
          this.tone(f, t + dt, 1.8, { type: 'sine', vol: 0.12 });
          this.tone(f * 2.76, t + dt, 0.9, { type: 'sine', vol: 0.03 });
          this.tone(f * 5.4, t + dt, 0.4, { type: 'sine', vol: 0.015 });
        }
        break;
      case 'sail':
        this.noise(t, 0.45, { type: 'bandpass', freq: 400, sweep: 1600, q: 1.2, vol: 0.18, attack: 0.05 });
        this.noise(t + 0.12, 0.12, { type: 'bandpass', freq: 900, q: 2, vol: 0.12 });
        break;
      default:
        break;
    }
  }
}
