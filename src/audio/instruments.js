// The score's instruments, mixed into SoundSystem (audio.js), and the reverb
// they play through. All of it is made from oscillators and noise, with no
// samples: plucked strings (a string model worked out once a note and kept),
// FM bells and mallets, a squeezebox, pipes, a fiddle, a strings pad and
// hand drums. The score that plays them is audio/music.js.
//
// One call plays one note: this.voice('flute', 74, when, seconds, volume).
// What each instrument is written for (its range) is in music/themes.js.
import { mulberry32, clamp } from '../util.js';
import { hz } from '../music/notation.js';

// kind: which method below plays it. level: its volume against the others,
// so a score can write every layer's `vol` near 1.
//   pluck   ring: seconds a low note rings; soft: 0 a bright pick, 1 a dull thumb
//   bell    ratio, index: the FM pair (how far above the note the second
//           sine sits, and how hard it bends the first); ring: seconds;
//           knock: a mallet's tap
//   pipe    breath: how much air is in the note; attack: seconds; vibrato: cents
//   drum    from, to: the skin's pitch as it falls, Hz; ring: seconds; slap: Hz of the hand's noise
export const VOICES = {
  guitar: { kind: 'pluck', ring: 2.2, soft: 0.62, level: 0.1 },
  harp: { kind: 'pluck', ring: 3.2, soft: 0.35, level: 0.09 },
  ukulele: { kind: 'pluck', ring: 0.9, soft: 0.2, level: 0.09 },
  celesta: { kind: 'bell', ratio: 4, index: 1.1, ring: 1.6, level: 0.06 },
  musicbox: { kind: 'bell', ratio: 7, index: 0.7, ring: 1.2, level: 0.05 },
  marimba: { kind: 'bell', ratio: 4, index: 1.6, ring: 0.55, knock: 0.5, level: 0.09 },
  steeldrum: { kind: 'bell', ratio: 2.005, index: 2.2, ring: 0.9, level: 0.06 },
  squeezebox: { kind: 'reed', level: 0.022 },
  flute: { kind: 'pipe', breath: 0.05, attack: 0.07, vibrato: 7, level: 0.046 },
  whistle: { kind: 'pipe', breath: 0.1, attack: 0.03, vibrato: 4, level: 0.037 },
  fiddle: { kind: 'bow', level: 0.032 },
  strings: { kind: 'pad', level: 0.016 },
  framedrum: { kind: 'drum', from: 96, to: 58, ring: 0.42, slap: 320, level: 0.1 },
  bodhran: { kind: 'drum', from: 142, to: 86, ring: 0.2, slap: 750, level: 0.1 },
  shaker: { kind: 'shake', level: 0.05 },
};
for (const [name, V] of Object.entries(VOICES)) V.name = name;

const KINDS = { pluck: 'playPluck', bell: 'playBell', reed: 'playReed', pipe: 'playPipe', bow: 'playBow', pad: 'playPad', drum: 'playDrum', shake: 'playShake' };

export class Instruments {
  /**
   * One note on one instrument: `midi` (ignored by drums) at audio time `t`
   * for `dur` seconds (plucks, bells and drums ring as long as they ring).
   * Goes to the score's bus unless `dest` says otherwise.
   */
  voice(name, midi, t, dur, vol, dest = this.scoreBus) {
    const V = VOICES[name];
    if (!V || vol <= 0) return;
    this[KINDS[V.kind]](V, midi, t, dur, vol * V.level, dest);
  }

  /** A room for the music bus: an impulse of noise that dies away and darkens as it goes. */
  musicReverb() {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * 2.4);
    const buf = c.createBuffer(2, n, sr), rnd = mulberry32(77);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = Math.floor(sr * 0.012); i < n; i++) {
        const x = i / sr;
        lp += (rnd() * 2 - 1 - lp) * (0.08 + 0.6 * Math.exp(-x * 1.4));
        d[i] = lp * Math.pow(10, (-3 * x) / 1.9);
      }
    }
    const conv = c.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  // A gain that rises to `vol`, holds for the note and lets go. (Every gain here starts
  // at 0 by value as well as by event: a gain is 1 until its first event's time, and a
  // note that begins between two samples would let one sample through at full level.)
  noteGain(t, dur, vol, attack, release, dest) {
    const g = this.ctx.createGain();
    g.gain.value = 0; g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(0, t + Math.max(dur, attack), release / 3);
    g.connect(dest);
    return g;
  }

  osc(type, freq, t, end, cents = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = cents;
    o.start(t); o.stop(end);
    return o;
  }

  // A slow wobble of pitch that comes in after the note has started, on each oscillator's detune.
  vibrato(oscs, t, end, rate, cents) {
    const c = this.ctx;
    const lfo = this.osc('sine', rate, t, end);
    const g = c.createGain();
    g.gain.value = 0; g.gain.setValueAtTime(0, t + 0.18);
    g.gain.linearRampToValueAtTime(cents, t + 0.5);
    lfo.connect(g);
    for (const o of oscs) g.connect(o.detune);
  }

  // ------------------------------------------------------------ plucked
  // A plucked string (Karplus-Strong): a burst of noise going round a delay
  // one period long, losing its top each time round. Worked out in plain
  // code, because an audio graph can't loop a delay that short, and kept.
  pluckBuffer(V, midi) {
    this.plucks ??= new Map();
    const key = V.name + midi;
    if (this.plucks.has(key)) return this.plucks.get(key);
    const c = this.ctx, sr = c.sampleRate, f = hz(midi);
    const ring = V.ring * clamp(1.3 - (midi - 36) / 55, 0.4, 1.3);
    const n = Math.floor(sr * ring * 1.15);
    const D = sr / f - 0.5, P = Math.floor(D), frac = D - P; // the averaging below is half a sample of delay
    const loss = Math.pow(10, -3 / (f * ring));
    const buf = c.createBuffer(1, n, sr), out = buf.getChannelData(0), rnd = mulberry32(midi * 131 + V.name.length);
    let y = 0, mean = 0;
    for (let i = 0; i < P + 2; i++) { y += (rnd() * 2 - 1 - y) * (1 - V.soft); out[i] = y; mean += y; }
    mean /= P + 2;
    for (let i = 0; i < P + 2; i++) out[i] -= mean;
    for (let i = P + 2; i < n; i++) {
      const a = out[i - P] * (1 - frac) + out[i - P - 1] * frac;
      const b = out[i - P - 1] * (1 - frac) + out[i - P - 2] * frac;
      out[i] = loss * (a + b) * 0.5;
    }
    // every note as loud as the next over its first moments, whatever the burst was like
    const head = Math.min(n, Math.floor(sr * 0.15)), tail = Math.floor(sr * 0.05);
    let sum = 0;
    for (let i = 0; i < head; i++) sum += out[i] * out[i];
    const k = 0.3 / (Math.sqrt(sum / head) || 1);
    for (let i = 0; i < n; i++) out[i] = clamp(out[i] * k, -1, 1) * Math.min(1, (n - i) / tail);
    this.plucks.set(key, buf);
    return buf;
  }

  playPluck(V, midi, t, dur, vol, dest) {
    const c = this.ctx, buf = this.pluckBuffer(V, midi);
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(dest);
    s.start(t);
  }

  // --------------------------------------------------- bells and mallets
  playBell(V, midi, t, dur, vol, dest) {
    const c = this.ctx, f = hz(midi), ring = V.ring * clamp(1.4 - (midi - 48) / 60, 0.5, 1.4), end = t + ring + 0.1;
    const car = this.osc('sine', f, t, end), mod = this.osc('sine', f * V.ratio, t, end);
    const bend = c.createGain();
    bend.gain.setValueAtTime(V.index * f * V.ratio, t);
    bend.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.02), t + ring * 0.6);
    mod.connect(bend); bend.connect(car.frequency);
    const g = c.createGain();
    g.gain.value = 0; g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0006, t + ring);
    car.connect(g); g.connect(dest);
    if (V.knock) this.noiseTo(t, 0.03, { type: 'bandpass', freq: Math.min(4000, f * 4), vol: vol * V.knock }, dest);
  }

  // ---------------------------------------------------------- squeezebox
  // Two reeds a little out of tune with each other and one an octave up, through a box.
  playReed(V, midi, t, dur, vol, dest) {
    const c = this.ctx, f = hz(midi), end = t + dur + 0.6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const box = c.createBiquadFilter(); box.type = 'peaking'; box.frequency.value = 1100; box.Q.value = 1.2; box.gain.value = 5;
    const g = this.noteGain(t, dur, vol, 0.07, 0.16, dest);
    lp.connect(box); box.connect(g);
    this.osc('sawtooth', f, t, end, -7).connect(lp);
    this.osc('sawtooth', f, t, end, 7).connect(lp);
    const up = c.createGain(); up.gain.value = 0.18;
    this.osc('square', f * 2, t, end).connect(up); up.connect(lp);
  }

  // ------------------------------------------------- flute and tin whistle
  // A near-pure tone with a little of the octave in it, and the player's breath.
  playPipe(V, midi, t, dur, vol, dest) {
    const c = this.ctx, f = hz(midi), end = t + dur + 0.5;
    const g = this.noteGain(t, dur, vol, V.attack, 0.14, dest);
    const oscs = [[1, 1], [2, 0.18], [3, 0.05]].map(([k, level]) => {
      const o = this.osc('sine', f * k, t, end);
      const og = c.createGain(); og.gain.value = level;
      o.connect(og); og.connect(g);
      return o;
    });
    if (dur > 0.3) this.vibrato(oscs, t, end, 5, V.vibrato);
    const air = c.createBufferSource(); air.buffer = this.white; air.loop = true;
    const band = c.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = Math.min(8000, f * 2); band.Q.value = 2;
    const ag = c.createGain();
    ag.gain.setValueAtTime(V.breath * 4, t); // the chiff as the note speaks
    ag.gain.exponentialRampToValueAtTime(V.breath, t + 0.09);
    air.connect(band); band.connect(ag); ag.connect(g);
    air.start(t, (midi * 0.071) % 1.5); air.stop(end);
  }

  // --------------------------------------------------------------- fiddle
  // A bowed saw through the body of the instrument, with a vibrato that comes in late.
  playBow(V, midi, t, dur, vol, dest) {
    const c = this.ctx, f = hz(midi), end = t + dur + 0.6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.5;
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 480; body.Q.value = 1.4; body.gain.value = 5;
    const nose = c.createBiquadFilter(); nose.type = 'peaking'; nose.frequency.value = 2600; nose.Q.value = 1.8; nose.gain.value = 4;
    const g = this.noteGain(t, dur, vol, 0.08, 0.18, dest);
    lp.connect(body); body.connect(nose); nose.connect(g);
    const a = this.osc('sawtooth', f, t, end), b = this.osc('sawtooth', f, t, end, 4);
    const bg = c.createGain(); bg.gain.value = 0.5;
    a.connect(lp); b.connect(bg); bg.connect(lp);
    if (dur > 0.35) this.vibrato([a, b], t, end, 5.6, 12);
  }

  // ---------------------------------------------------------- strings pad
  // Several players on one low note: detuned saws, well filtered, slow to speak and slow to stop.
  playPad(V, midi, t, dur, vol, dest) {
    const c = this.ctx, f = hz(midi), end = t + dur + 3.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(2400, f * 4);
    const g = this.noteGain(t, dur, vol, 0.7, 1.1, dest);
    lp.connect(g);
    for (const cents of [-9, 0, 8]) this.osc('sawtooth', f, t, end, cents).connect(lp);
  }

  // ---------------------------------------------------------------- drums
  playDrum(V, midi, t, dur, vol, dest) {
    this.tone(V.from, t, V.ring, { type: 'sine', vol, attack: 0.004, glide: V.to, dest });
    this.noiseTo(t, 0.09, { type: 'lowpass', freq: V.slap, vol: vol * 0.5 }, dest);
  }

  playShake(V, midi, t, dur, vol, dest) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.white; s.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5500;
    const g = c.createGain();
    g.gain.value = 0; g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.09);
    s.connect(hp); hp.connect(g); g.connect(dest);
    s.start(t, (t * 7.3) % 1.5); s.stop(t + 0.12);
  }
}
