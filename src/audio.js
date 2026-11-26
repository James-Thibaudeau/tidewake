// Fully procedural WebAudio: ocean/wind/rain beds, sparse ambient music and
// one-shot effects. Everything is a safe no-op until unlock() is called from a
// user gesture.
//
// SoundSystem is one class split over two files. This one holds the core: the
// buses, the sea's beds, the score and the one-shots heard at sea. The
// on-foot sounds (footsteps, jump and land, the coin chime, the chest fanfare,
// an island's ambience and the on-foot score) are mixed in from
// audio/ashore.js.
import { mixin } from './util.js';
import { AshoreSounds } from './audio/ashore.js';

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
    // ---- rain: several decorrelated layers that swell with gusts, plus drop grains
    this.rainBus = c.createGain(); this.rainBus.gain.value = 0; this.rainBus.connect(this.amb);
    const pan = (v) => { const p = c.createStereoPanner ? c.createStereoPanner() : c.createGain(); if (p.pan) p.pan.value = v; return p; };
    const layer = (buf, type, freq, q, vol, panV, offset) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = vol;
      const pn = pan(panV);
      src.connect(f); f.connect(g); g.connect(pn); pn.connect(this.rainBus);
      src.start(0, offset);
      return { f, g, base: vol, freq };
    };
    this.rainLayers = [
      layer(this.white, 'highpass', 3200, 0.5, 0.5, -0.6, 0.0),   // fine hiss, left
      layer(this.white, 'highpass', 2600, 0.5, 0.5, 0.6, 0.9),    // fine hiss, right
      layer(this.white, 'bandpass', 1100, 0.6, 0.55, 0.0, 0.4),   // body / wash
      layer(this.brown, 'lowpass', 380, 0.7, 0.9, 0.0, 1.1),      // heavy downpour rumble
    ];
    this.rainPanners = [pan(-0.7), pan(-0.25), pan(0.25), pan(0.7)];
    for (const p of this.rainPanners) p.connect(this.rainBus);
    this.rainLevel = 0;
    this.rainSeed = Math.random() * 100;

    // ---- storm score: a dark drone, swells and a slow pulse on their own bus
    this.stormBus = c.createGain(); this.stormBus.gain.value = 0;
    this.stormBus.connect(this.musicBus);
    const droneF = c.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 260; droneF.Q.value = 3;
    this.droneFilter = droneF;
    const droneG = c.createGain(); droneG.gain.value = 0.11;
    droneF.connect(droneG); droneG.connect(this.stormBus);
    this.drones = [];
    // A1 + a slightly sour fifth + a minor-second rub, detuned saws
    for (const [n, det] of [[33, -7], [33, 6], [40, -3], [34, 9], [45, 0]]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = midi(n); o.detune.value = det;
      const g = c.createGain(); g.gain.value = n === 34 ? 0.25 : n === 45 ? 0.35 : 0.6;
      o.connect(g); g.connect(droneF); o.start();
      this.drones.push(o);
    }
    this.nextStormHit = 3;
    this.nextSwell = 6;
    this.nextStormNote = 2;
    this.stormMix = 0;
    this.buildAshore();
  }

  update(dt, p = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    this.time += dt;
    const speed = p.speed || 0, wind = p.wind ?? 1, rain = p.rain || 0, storm = p.storm || 0;
    if (p.night != null) this.night = p.night;
    const swell = 0.75 + 0.25 * Math.sin(this.time * 0.45) * Math.sin(this.time * 0.17 + 1);
    // in port, and from an island's paths, the sea is further off
    this.updateAshore(dt, t, p.ashore || null, rain);
    const port = (p.inPort ? 0.6 : 1) * (1 - this.landMix * 0.4);
    this.oceanGain.gain.setTargetAtTime((0.16 + 0.08 * wind + 0.01 * Math.min(speed, 25) + storm * 0.12) * swell * port, t, 0.3);
    this.oceanFilter.frequency.setTargetAtTime(280 + wind * 220 + Math.min(speed, 25) * 18 + storm * 300, t, 0.3);
    const gust = 0.7 + 0.3 * Math.sin(this.time * 0.9) * Math.sin(this.time * 0.37);
    this.windGain.gain.setTargetAtTime((0.012 + 0.05 * Math.max(0, wind - 0.5) + storm * 0.07) * gust, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(500 + wind * 400 + gust * 300 + storm * 500, t, 0.5);
    this.updateRain(dt, t, rain, wind, storm, p.inPort);

    // music: the gentle plucks give way to the storm score
    this.stormMix += (Math.min(1, Math.max(0, (storm - 0.25) / 0.55)) - this.stormMix) * Math.min(1, dt * 0.4);
    this.stormBus.gain.setTargetAtTime(this.stormMix * 0.7, t, 0.8);
    this.nextNote -= dt;
    if (this.nextNote <= 0) {
      const calm = this.night > 0.5 ? 1.5 : 1;
      // on foot the same line moves along a little quicker, on a mallet (audio/ashore.js)
      const land = this.landMix > 0.5;
      this.nextNote = (land ? 0.8 + Math.random() * 1.7 : 1.1 + Math.random() * 2.6) * calm;
      if (this.musicOn && Math.random() > this.stormMix) { if (land) this.landNote(storm); else this.musicNote(storm); }
    }
    if (this.stormMix > 0.05 && this.musicOn) this.updateStormScore(dt, t);
  }

  updateRain(dt, t, rain, wind, storm, inPort) {
    // gusty, uneven intensity rather than a flat hiss
    const T = this.time + this.rainSeed;
    const gust = 0.72 + 0.18 * Math.sin(T * 0.53) * Math.sin(T * 0.21 + 2.0) + 0.1 * Math.sin(T * 1.7 + Math.sin(T * 0.4) * 2.0);
    const surge = Math.max(0, Math.sin(T * 0.11 + 1.3)) * 0.25 * storm;
    this.rainLevel = rain * (gust + surge);
    this.rainBus.gain.setTargetAtTime(this.rainLevel * 0.2 * (inPort ? 0.8 : 1), t, 0.25);
    const L = this.rainLayers;
    L[0].f.frequency.setTargetAtTime(L[0].freq + 900 * Math.sin(T * 0.37), t, 0.5);
    L[1].f.frequency.setTargetAtTime(L[1].freq + 900 * Math.sin(T * 0.29 + 1.5), t, 0.5);
    L[0].g.gain.setTargetAtTime(L[0].base * (0.7 + 0.3 * Math.sin(T * 0.8)), t, 0.3);
    L[1].g.gain.setTargetAtTime(L[1].base * (0.7 + 0.3 * Math.sin(T * 0.67 + 2.0)), t, 0.3);
    L[2].f.frequency.setTargetAtTime(900 + 500 * gust + 400 * storm, t, 0.6);
    L[3].g.gain.setTargetAtTime(L[3].base * (0.15 + storm * 0.85) * (0.8 + surge), t, 0.6);

    if (rain < 0.05 || !this.soundOn) return;
    // individual drops: patter on the water and heavier taps on the deck/sail
    const c = this.ctx;
    const n = this.poisson(dt * (30 + 150 * rain) * (gust + surge));
    for (let i = 0; i < n && i < 12; i++) {
      const tt = t + Math.random() * dt;
      const pn = this.rainPanners[(Math.random() * 4) | 0];
      if (Math.random() < 0.82) {
        this.grain(tt, 0.012 + Math.random() * 0.02, 'bandpass', 2400 + Math.random() * 5000, 2 + Math.random() * 3, (0.1 + Math.random() * 0.18) * rain, pn);
      } else {
        // a fat drop hitting wood/canvas: short pitched tap
        const o = c.createOscillator(); o.type = 'sine';
        const f0 = 500 + Math.random() * 900;
        o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, tt + 0.05);
        const g = c.createGain(); g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(0.08 * rain, tt + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.07);
        o.connect(g); g.connect(pn); o.start(tt); o.stop(tt + 0.09);
      }
    }
  }

  grain(t, dur, type, freq, q, vol, dest) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.8); s.stop(t + dur + 0.02);
  }

  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 20) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (Math.random() * 2 - 1)));
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  // Dark, tense storm score: drone breathing, irregular low pulses,
  // dissonant swells and a creeping minor-key line.
  updateStormScore(dt, t) {
    const c = this.ctx, m = this.stormMix;
    // the drone's filter opens and closes like a heavy breath
    this.droneFilter.frequency.setTargetAtTime(180 + 260 * (0.5 + 0.5 * Math.sin(this.time * 0.23)) * m, t, 0.5);
    // slowly bend the minor-second voice for an uneasy beating
    this.drones[3].detune.setTargetAtTime(9 + 25 * Math.sin(this.time * 0.13), t, 1.0);

    this.nextStormHit -= dt;
    if (this.nextStormHit <= 0) {
      this.nextStormHit = 1.4 + Math.random() * 1.6 + (Math.random() < 0.25 ? 2.5 : 0);
      // heartbeat-like double thud
      for (const [o, v] of [[0, 1], [0.32, 0.6]]) {
        const tt = t + o;
        this.tone(58, tt, 0.9, { type: 'sine', vol: 0.22 * v * m, glide: 36, dest: this.stormBus });
        this.noiseTo(tt, 0.25, { type: 'lowpass', freq: 180, vol: 0.12 * v * m, buf: this.brown }, this.stormBus);
      }
    }
    this.nextSwell -= dt;
    if (this.nextSwell <= 0) {
      this.nextSwell = 7 + Math.random() * 7;
      // a cluster of close, sour intervals swelling up and dying away
      const root = [45, 44, 46, 41][(Math.random() * 4) | 0];
      for (const iv of [0, 1, 6, 12]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(root + iv);
        o.detune.value = (Math.random() - 0.5) * 18;
        const f = c.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 3); f.frequency.linearRampToValueAtTime(250, t + 6);
        const g = c.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.03 * m, t + 3);
        g.gain.linearRampToValueAtTime(0.0, t + 6.5);
        o.connect(f); f.connect(g); g.connect(this.stormBus);
        o.start(t); o.stop(t + 6.6);
      }
    }
    this.nextStormNote -= dt;
    if (this.nextStormNote <= 0) {
      this.nextStormNote = 2.2 + Math.random() * 3;
      // phrygian-ish: root, b2, b3, 4, b5, 5, b6
      const SCALE = [0, 1, 3, 5, 6, 7, 8];
      const deg = SCALE[(Math.random() * SCALE.length) | 0];
      const n = 57 + deg + (Math.random() < 0.3 ? 12 : 0);
      this.tone(midi(n), t, 2.6, { type: 'sine', vol: 0.06 * m, attack: 0.35, dest: this.stormBus });
      this.tone(midi(n) * 1.004, t, 2.6, { type: 'triangle', vol: 0.025 * m, attack: 0.4, dest: this.stormBus });
      if (Math.random() < 0.35) this.tone(midi(n - 1), t + 0.9, 2.2, { type: 'sine', vol: 0.045 * m, attack: 0.3, dest: this.stormBus });
    }
  }

  noiseTo(t, dur, opts, dest) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = opts.buf || this.white; s.loop = true;
    const f = c.createBiquadFilter(); f.type = opts.type || 'lowpass'; f.frequency.value = opts.freq || 800;
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
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
      case 'slam': {
        // the bow punching into a wall of water: deep thump + heavy splash
        const v = Math.min(1, opts.volume ?? 1);
        this.tone(70, t, 0.5, { type: 'sine', vol: 0.35 * v, glide: 38 });
        this.noise(t, 0.9, { type: 'lowpass', freq: 1400, sweep: 300, vol: 0.32 * v, attack: 0.02 });
        this.noise(t + 0.05, 1.4, { type: 'bandpass', freq: 2200, sweep: 700, q: 0.6, vol: 0.2 * v, attack: 0.06 });
        this.noise(t, 0.35, { type: 'lowpass', freq: 300, vol: 0.3 * v, buf: this.brown });
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
      case 'hoot': {
        // an owl: one short note, then a longer one that falls away
        const v = Math.min(1, opts.volume ?? 1);
        for (const [dt, dur] of [[0, 0.24], [0.34, 0.62]]) {
          this.tone(392, t + dt, dur, { type: 'sine', vol: 0.2 * v, attack: 0.05, glide: 349 });
          this.tone(784, t + dt, dur * 0.8, { type: 'sine', vol: 0.025 * v, attack: 0.05, glide: 698 });
        }
        break;
      }
      case 'gull': {
        // a gull taking off: two quick, falling cries
        const v = Math.min(1, opts.volume ?? 1);
        for (const [dt, dur] of [[0, 0.22], [0.3, 0.32]]) {
          this.tone(1250, t + dt, dur, { type: 'triangle', vol: 0.1 * v, attack: 0.02, glide: 720 });
          this.tone(2500, t + dt, dur * 0.7, { type: 'sine', vol: 0.02 * v, attack: 0.02, glide: 1500 });
        }
        break;
      }
      // ---- the living sea (sea-events.js); opts.volume falls off with distance
      case 'sighting':
        // something for the book: three soft rising notes
        [76, 81, 88].forEach((n, i) => this.tone(midi(n), t + i * 0.13, 1.1, { type: 'sine', vol: 0.09, attack: 0.03 }));
        this.tone(midi(64), t, 1.6, { type: 'triangle', vol: 0.05, attack: 0.1 });
        break;
      case 'spout': {
        // a whale's blow: a long breath of air and water
        const v = Math.min(1, opts.volume ?? 1);
        this.noise(t, 1.3, { type: 'bandpass', freq: 1500, sweep: 500, q: 0.8, vol: 0.3 * v, attack: 0.08 });
        this.noise(t + 0.05, 0.9, { type: 'highpass', freq: 3200, vol: 0.07 * v, attack: 0.1 });
        break;
      }
      case 'splash': {
        const v = Math.min(1, opts.volume ?? 1);
        this.noise(t, 0.8, { type: 'lowpass', freq: 1800, sweep: 400, vol: 0.28 * v, attack: 0.02 });
        this.noise(t + 0.04, 1.0, { type: 'bandpass', freq: 2600, sweep: 900, q: 0.6, vol: 0.14 * v, attack: 0.05 });
        break;
      }
      case 'breach': {
        // a whale coming down: a deep boom under a long wash of spray
        const v = Math.min(1, opts.volume ?? 1);
        this.tone(62, t, 0.9, { type: 'sine', vol: 0.4 * v, glide: 34 });
        this.noise(t, 1.6, { type: 'lowpass', freq: 1500, sweep: 250, vol: 0.4 * v, attack: 0.02 });
        this.noise(t + 0.1, 2.4, { type: 'bandpass', freq: 2400, sweep: 600, q: 0.5, vol: 0.2 * v, attack: 0.1 });
        this.noise(t, 0.6, { type: 'lowpass', freq: 260, vol: 0.35 * v, buf: this.brown });
        break;
      }
      case 'whirl': {
        // a waterspout: a rising and falling rush of wind
        const v = Math.min(1, opts.volume ?? 1);
        this.noise(t, 2.6, { type: 'bandpass', freq: 500, sweep: 1100, q: 1.4, vol: 0.3 * v, attack: 0.9 });
        this.noise(t, 2.6, { type: 'lowpass', freq: 180, vol: 0.28 * v, attack: 0.6, buf: this.brown });
        break;
      }
      case 'crack': {
        // ice letting go: a sharp report, then a long low groan
        const v = Math.min(1, opts.volume ?? 1);
        this.noise(t, 0.16, { type: 'highpass', freq: 2400, vol: 0.5 * v, attack: 0.002 });
        this.noise(t + 0.05, 0.5, { type: 'bandpass', freq: 900, sweep: 300, q: 0.8, vol: 0.35 * v, attack: 0.005 });
        this.tone(88, t + 0.1, 1.8, { type: 'sine', vol: 0.3 * v, attack: 0.05, glide: 46 });
        this.noise(t + 0.15, 1.8, { type: 'lowpass', freq: 240, vol: 0.3 * v, attack: 0.1, buf: this.brown });
        break;
      }
      case 'rogue': {
        // a rogue wave standing up: a low roar that swells for four seconds, with a hiss of
        // breaking water coming in over the top of it
        const v = Math.min(1, opts.volume ?? 1);
        this.noise(t, 4.6, { type: 'lowpass', freq: 110, sweep: 340, vol: 0.32 * v, attack: 3.6, buf: this.brown });
        this.noise(t + 1.2, 3.4, { type: 'bandpass', freq: 500, sweep: 1700, q: 0.7, vol: 0.1 * v, attack: 2.6 });
        this.tone(55, t, 4.4, { type: 'sine', vol: 0.13 * v, attack: 3.4, glide: 82 });
        break;
      }
      case 'chirp': {
        // dolphins: a few quick rising whistles
        const v = Math.min(1, opts.volume ?? 1);
        for (const [dt, f] of [[0, 2200], [0.12, 2700], [0.27, 2400], [0.38, 3100]]) this.tone(f, t + dt, 0.11, { type: 'sine', vol: 0.06 * v, attack: 0.015, glide: f * 1.5 });
        break;
      }
      case 'ghost': {
        // a ship's bell, a long way off and slightly wrong
        const v = Math.min(1, opts.volume ?? 1);
        for (const [dt, f] of [[0, 311], [1.3, 311]]) {
          this.tone(f, t + dt, 3.2, { type: 'sine', vol: 0.1 * v, attack: 0.02 });
          this.tone(f * 2.41, t + dt, 2.2, { type: 'sine', vol: 0.03 * v, attack: 0.02 });
          this.tone(f * 1.06, t + dt, 2.8, { type: 'sine', vol: 0.04 * v, attack: 0.3 });
        }
        break;
      }
      case 'sail':
        this.noise(t, 0.45, { type: 'bandpass', freq: 400, sweep: 1600, q: 1.2, vol: 0.18, attack: 0.05 });
        this.noise(t + 0.12, 0.12, { type: 'bandpass', freq: 900, q: 2, vol: 0.12 });
        break;
      default:
        this.playAshore(name, opts, t);
        break;
    }
  }
}
mixin(SoundSystem, AshoreSounds);
