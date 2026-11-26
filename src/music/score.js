// The score's sequencer: given the cue that is wanted and an intensity, it
// says what the next bar holds, a note at a time. Pure: no audio, no DOM, so
// `node tools/check.mjs music` can play every cue through on paper. The
// player that turns its bars into sound is audio/music.js.
//
// A cue plays a full statement of its theme, then rests on its bed alone for
// a while (CUES.rest), so the tune doesn't wear out on a long sail. Changes
// happen on a bar line:
//   - to a cue in the same key: the new one comes in while the old one's bed
//     dies away under it, over two bars;
//   - to another key: the tune drops out, the bed holds a bar, then one note
//     that both keys share is held for a bar, and the new cue begins (an
//     urgent cue, a storm, skips the bar of bed);
//   - to nothing (going ashore): the bed holds one quieter bar, then silence.
//
// It has a seeded RNG of its own and never touches the world's rng().
import { mulberry32 } from '../util.js';
import { THEMES, CUES, DRUMS, RANGES } from './themes.js';
import { parseKey, parseChords, parseTune, parseBars, chordTone, stepAbove, shiftChord, toMode, chordInMode, noteMidi } from './notation.js';

const compiled = new Map();

// The layers Low quality leaves out: everything but the bed, the bass and the tune.
export const EXTRAS = ['counter', 'rhythm', 'drums', 'descant', 'night'];

// The colour a cue takes in the rain: a major key turns to the Dorian on the
// same note (its third and seventh drop: wistful, with the fourth chord still
// bright). Other keys keep their notes.
const RAIN_MODE = 'dorian';
const NIGHT_SLOW = 0.85;

/**
 * A cue with its notation parsed: what nextBar() reads. Throws if the cue or
 * its theme is badly written. `colour` is { rain, night }: in the rain a cue
 * takes its minor colour and loses its drums; at night a calm cue slows,
 * loses its drums and gains a celesta on the tune. A cue marked `plain` (a
 * storm, the fog) has no colours.
 */
export function compileCue(name, colour = null) {
  const cue = CUES[name];
  if (!cue) throw new Error(`no cue called "${name}"`);
  const rain = !!colour?.rain && !cue.plain, night = !!colour?.night && !!cue.calm;
  const id = name + (rain ? '~rain' : '') + (night ? '~night' : '');
  if (compiled.has(id)) return compiled.get(id);
  const C = rain || night ? coloured(compileCue(name), rain, night) : parseCue(name, cue);
  compiled.set(id, C);
  return C;
}

function parseCue(name, cue) {
  const theme = THEMES[cue.theme];
  if (!theme) throw new Error(`cue "${name}": no theme called "${cue.theme}"`);
  // a cue can play its theme in another key of the same mode
  const from = parseKey(theme.key), keyInfo = parseKey(cue.key || theme.key);
  if (keyInfo.mode !== from.mode) throw new Error(`cue "${name}": ${cue.key} is not the mode of its theme (${theme.key})`);
  const up = (keyInfo.tonic - from.tonic + 12) % 12, semis = up > 6 ? up - 12 : up;
  const chordsOf = (text) => parseChords(text).map((bar) => bar.map((ch) => shiftChord(ch, semis)));
  const steps = theme.steps, barSec = (60 / cue.tempo) * theme.beats;
  const phrases = {};
  for (const id of cue.form) {
    const P = theme.phrases[id];
    if (!P) throw new Error(`cue "${name}": theme "${cue.theme}" has no phrase "${id}"`);
    const chords = chordsOf(P.chords), tune = parseTune(P.tune, steps).map((bar) => bar.map((n) => ({ ...n, midi: n.midi + semis })));
    if (chords.length !== tune.length) throw new Error(`theme "${cue.theme}", phrase "${id}": ${chords.length} bars of chords but ${tune.length} of tune`);
    phrases[id] = { chords, tune };
  }
  const layers = {};
  for (const [id, L] of Object.entries(cue.layers)) {
    layers[id] = { from: 0, shift: 0, ...L, steps: L.pattern ? parseBars(L.pattern, steps)[0] : null };
  }
  return {
    name, key: cue.key || theme.key, keyInfo, steps, barSec, stepSec: barSec / steps,
    gain: cue.gain ?? 1, form: cue.form, pick: cue.pick || 0, rest: cue.rest, phrases, drift: chordsOf(cue.drift), layers,
    rain: false, night: false, urgent: !!cue.urgent,
  };
}

// The same cue in the rain, at night, or both.
function coloured(C, rain, night) {
  const out = { ...C, rain, night, layers: { ...C.layers } };
  for (const id of Object.keys(out.layers)) if (id !== 'bed' && out.layers[id].steps?.every((n) => DRUMS[n.what])) delete out.layers[id];
  if (rain && C.keyInfo.mode === 'major') {
    const K = C.keyInfo, chords = (rows) => rows.map((bar) => bar.map((ch) => chordInMode(ch, K, RAIN_MODE)));
    out.key = C.key.split(/\s+/)[0] + ' ' + RAIN_MODE;
    out.keyInfo = parseKey(out.key);
    out.drift = chords(C.drift);
    out.phrases = {};
    for (const [id, P] of Object.entries(C.phrases)) {
      out.phrases[id] = { chords: chords(P.chords), tune: P.tune.map((bar) => bar.map((n) => ({ ...n, midi: toMode(n.midi, K, RAIN_MODE) }))) };
    }
  }
  if (night) {
    out.barSec = C.barSec / NIGHT_SLOW;
    out.stepSec = out.barSec / C.steps;
    // a celesta on the tune, an octave up if that is still on its keys
    const M = C.layers.melody, [lo, hi] = RANGES.celesta.map(noteMidi);
    const notes = Object.values(out.phrases).flatMap((P) => P.tune.flat()).map((n) => n.midi + (M?.shift || 0));
    const shift = [12, 0, 24, -12].find((s) => notes.every((m) => m + s >= lo && m + s <= hi));
    if (M && shift !== undefined) out.layers.night = { voice: 'celesta', vol: M.vol * 0.45, from: M.from, shift: (M.shift || 0) + shift, steps: null };
  }
  return out;
}

// The note two keys share that the bed holds between them: the new key's
// tonic or fifth if the old key has it, else any note in both.
function pivotNote(from, to) {
  const order = [to.tonic, (to.tonic + 7) % 12, ...to.scale];
  const pc = order.find((n) => from.scale.includes(n)) ?? to.tonic;
  return 48 + pc;
}

export class Score {
  constructor(seed = 1) {
    this.rnd = mulberry32(seed);
    this.cue = null;    // the compiled cue playing, or null for silence
    this.want = null;   // the name of the cue asked for
    this.st = null;     // where the cue is: resting or in a statement
    this.turn = null;   // a change of key or a fade to nothing, under way
    this.tail = null;   // the last cue's bed, dying away under a new cue in its key
    this.fresh = 0;     // bars a new cue is still coming in for
    this.bar = 0;
  }

  /** Ask for a cue (or null for silence). The change is made on the next bar line. */
  setCue(name) { this.want = name || null; }

  begin(C) {
    this.cue = C;
    this.st = C && { phase: 'rest', rest: 1 + Math.floor(this.rnd() * 2), drift: 0, queue: [], phrase: null, i: 0 };
  }

  /**
   * The next bar: { cue, key, bar, seconds, phase, layers, events }. An event
   * is { voice, midi, at, dur, vol, layer } with `at` and `dur` in seconds
   * from the bar line (a drum has no midi). `intensity` 0-3 picks the layers;
   * `low` drops the layers in EXTRAS; `rests: false` plays
   * statements back to back (for listening and measuring); `rain` and
   * `night` give the cue those colours (see compileCue).
   */
  nextBar(intensity = 1, { low = false, rests = true, rain = false, night = false } = {}) {
    if (!this.turn && this.want !== (this.cue?.name ?? null)) {
      const to = this.want ? compileCue(this.want) : null;
      if (!this.cue) this.begin(to);
      else if (!to) this.turn = { kind: 'out', left: 1 };
      else if (to.key === this.cue.key) {
        this.tail = { C: this.cue, st: this.st, left: 2 };
        this.begin(to);
        this.fresh = 2;
      } else this.turn = { kind: 'key', left: to.urgent ? 1 : 2 }; // a storm skips the bar of bed and goes by the pivot alone
    }
    if (!this.cue) return { cue: null, key: null, bar: this.bar, seconds: 0.5, phase: 'silent', layers: [], events: [] };
    const C = compileCue(this.cue.name, { rain, night }); // the cue playing, in the colour of the moment

    const events = [];
    let phase, layers;
    if (this.turn) {
      const T = this.turn;
      phase = T.kind === 'out' ? 'out' : T.left === 2 ? 'leaving' : 'pivot';
      layers = C.layers.bed ? ['bed'] : [];
      if (phase === 'pivot') {
        const to = this.want ? compileCue(this.want) : null;
        const midi = to ? pivotNote(C.keyInfo, to.keyInfo) : 48 + C.keyInfo.tonic;
        for (const X of to ? [C, to] : [C]) {
          const B = X.layers.bed;
          if (B) events.push({ voice: B.voice, midi: midi + (B.oct - 3) * 12, at: 0, dur: C.barSec, vol: B.vol * X.gain * 0.6, layer: 'bed' });
        }
      } else {
        this.bed(C, this.st, C.barSec, T.kind === 'out' ? 0.5 : 0.7, events);
      }
      if (--T.left <= 0) {
        this.turn = null;
        this.begin(this.want ? compileCue(this.want) : null);
      }
    } else {
      ({ phase, layers } = this.play(C, intensity, low, rests, events));
      if (this.tail) {
        const T = this.tail;
        this.bed(T.C, T.st, C.barSec, T.left === 2 ? 0.6 : 0.25, events);
        if (--T.left <= 0) this.tail = null;
      }
    }
    return { cue: C.name, key: C.key, bar: this.bar++, seconds: C.barSec, phase, layers, events, rain: C.rain, night: C.night };
  }

  // One bar of the cue playing: its bed, and the tune's layers while a statement is on.
  play(C, intensity, low, rests, events) {
    const st = this.st, L = C.layers;
    if (st.phase === 'rest') {
      if (st.rest <= 0 && intensity >= (L.melody?.from ?? 1)) {
        st.phase = 'play';
        st.queue = C.pick ? this.pickPhrases(C) : [...C.form];
        st.phrase = st.queue.shift();
        st.i = 0;
      } else st.rest--;
    }
    const k = this.fresh ? (this.fresh-- === 2 ? 0.6 : 0.85) : 1;
    if (st.phase === 'rest') {
      this.bed(C, st, C.barSec, k, events);
      return { phase: 'rest', layers: L.bed ? ['bed'] : [] };
    }

    const P = C.phrases[st.phrase];
    const chords = P.chords[st.i], chordAt = (step) => chords[Math.min(chords.length - 1, Math.floor((step / C.steps) * chords.length))];
    const on = Object.keys(L).filter((id) => L[id].from <= intensity && !(low && EXTRAS.includes(id)));
    for (const id of on) {
      const Y = L[id], vol = Y.vol * C.gain * k;
      if (id === 'bed') this.chord(Y, chords, C.barSec, vol, events);
      else if (!Y.steps) { // the tune, or a second instrument doubling it
        for (const n of P.tune[st.i]) {
          const midi = n.midi + Y.shift, at = n.step * C.stepSec + this.rnd() * 0.012;
          const v = vol * (0.88 + this.rnd() * 0.2) * (n.step === 0 ? 1.08 : 1);
          // now and then a long note is leaned into from the note above
          const grace = stepAbove(midi, C.keyInfo);
          if (n.step > 0 && n.len >= 2 && this.rnd() < 0.12 && grace <= noteMidi(RANGES[Y.voice][1])) events.push({ voice: Y.voice, midi: grace, at: at - 0.08, dur: 0.08, vol: v * 0.55, layer: id });
          events.push({ voice: Y.voice, midi, at, dur: n.len * C.stepSec * 0.96, vol: v, layer: id });
        }
      } else if (Y.steps.every((n) => DRUMS[n.what])) {
        for (const n of Y.steps) events.push({ voice: DRUMS[n.what], midi: null, at: n.step * C.stepSec, dur: 0, vol: vol * (0.8 + this.rnd() * 0.3), layer: id });
      } else {
        for (const n of Y.steps) {
          events.push({ voice: Y.voice, midi: chordTone(chordAt(n.step), n.what, Y.oct), at: n.step * C.stepSec + this.rnd() * 0.01, dur: n.len * C.stepSec, vol: vol * (0.85 + this.rnd() * 0.2), layer: id });
        }
      }
    }
    if (++st.i >= P.chords.length) {
      st.i = 0;
      st.phrase = st.queue.shift() ?? null;
      if (!st.phrase) {
        st.phase = 'rest';
        st.rest = rests ? Math.ceil((C.rest[0] + this.rnd() * (C.rest[1] - C.rest[0])) / C.barSec) : 1;
      }
    }
    return { phase: 'play', layers: on };
  }

  // A cue's bed for one bar of `seconds`, over the chords the cue is on.
  bed(C, st, seconds, k, events) {
    if (!C.layers.bed) return; // a cue with no bed (the ghost ship's) rests in silence
    const chords = st.phase === 'play' ? C.phrases[st.phrase].chords[st.i] : C.drift[st.drift++ % C.drift.length];
    this.chord(C.layers.bed, chords, seconds, C.layers.bed.vol * C.gain * k, events);
  }

  chord(B, chords, seconds, vol, events) {
    const part = seconds / chords.length;
    chords.forEach((ch, i) => {
      for (const t of ['1', '3', '5']) events.push({ voice: B.voice, midi: chordTone(ch, t, B.oct), at: i * part, dur: part, vol, layer: 'bed' });
    });
  }

  pickPhrases(C) {
    const from = Math.floor(this.rnd() * (C.form.length - C.pick + 1));
    return C.form.slice(from, from + C.pick);
  }
}
