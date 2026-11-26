// The score's notation: note names, chords, keys, and the small text format
// the themes are written in (music/themes.js). Pure: no audio, no DOM.
//
// A tune is bars split by `|`, each bar a row of equal steps:
//
//   'D5 - - E5 F#5 - A5 - | G5 - F#5 E5 D5 - B4 -'
//
//   D5 F#4 Bb3   a note (name, optional # or b, octave; middle C is C4)
//   -            hold the note before it one more step
//   .            a rest
//
// A pattern is written the same way, but in chord tones, so one pattern fits
// any chord: `1` the root, `3` the third, `5` the fifth, `8` the root an
// octave up, `0` the fifth below the root. A rhythm is a pattern of drum
// letters (music/themes.js says which letter is which drum).
//
// Chords are one per bar, or two sharing it: 'D | G | Em A | D'.

const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// The scale of each mode, in semitones above its tonic, and how far its tonic
// sits above the major key with the same notes (D major and B minor: 9).
export const MODES = {
  major: { scale: [0, 2, 4, 5, 7, 9, 11], above: 0 },
  dorian: { scale: [0, 2, 3, 5, 7, 9, 10], above: 2 },
  phrygian: { scale: [0, 1, 3, 5, 7, 8, 10], above: 4 },
  lydian: { scale: [0, 2, 4, 6, 7, 9, 11], above: 5 },
  mixolydian: { scale: [0, 2, 4, 5, 7, 9, 10], above: 7 },
  minor: { scale: [0, 2, 3, 5, 7, 8, 10], above: 9 },
};

// A chord's third and fifth above its root, by what follows the root's name.
const CHORDS = { '': [4, 7], m: [3, 7], sus2: [2, 7], sus4: [5, 7], dim: [3, 6], 5: [7, 7] };

export const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const noteName = (midi) => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);

/** 0-11 for 'D', 'F#', 'Bb'; throws on anything else. */
export function pitchClass(name) {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) throw new Error(`"${name}" is not a note name`);
  return (STEPS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** 'F#4' → 66. */
export function noteMidi(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`"${name}" is not a note`);
  return pitchClass(m[1]) + (Number(m[2]) + 1) * 12;
}

/** 'D major', 'E dorian' → { tonic: 0-11, mode, scale: the seven pitch classes, home: the major key with the same notes }. */
export function parseKey(key) {
  const [name, mode = 'major'] = key.trim().split(/\s+/);
  const M = MODES[mode];
  if (!M) throw new Error(`"${key}": no mode called "${mode}"`);
  const tonic = pitchClass(name);
  return { tonic, mode, scale: M.scale.map((s) => (tonic + s) % 12), home: (tonic - M.above + 12) % 12 };
}

/**
 * How far to move a tune written in `from` so it sits in `to`, in semitones
 * (-5 to 6): the distance between the major keys that share their notes. D
 * major to B minor is 0 (the same notes); D major to G mixolydian is -2.
 */
export function keyShift(to, from = 'D major') {
  const d = (parseKey(to).home - parseKey(from).home + 12) % 12;
  return d > 6 ? d - 12 : d;
}

/** 'Bm' → { root: 11, tones: [0, 3, 7] } (semitones above the root). */
export function parseChord(name) {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  const shape = m && CHORDS[m[2]];
  if (!shape) throw new Error(`"${name}" is not a chord this score knows`);
  return { name, root: pitchClass(m[1]), tones: [0, ...shape] };
}

/**
 * 'D | G | Em A | D' → one row per bar; each row is the bar's chords in
 * order, and they share the bar equally.
 */
export function parseChords(text) {
  return bars(text).map((bar) => bar.map(parseChord));
}

const bars = (text) => text.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));

/**
 * A tune or a pattern → its bars, each a list of { step, len, what } where
 * `what` is the token ('F#4', '5', 's') and len counts the holds after it.
 * Every bar must have `steps` tokens.
 */
export function parseBars(text, steps) {
  return bars(text).map((tokens, b) => {
    if (tokens.length !== steps) throw new Error(`bar ${b + 1} has ${tokens.length} steps, not ${steps}: "${tokens.join(' ')}"`);
    const out = [];
    tokens.forEach((what, step) => {
      if (what === '.') return;
      if (what === '-') {
        const last = out[out.length - 1];
        if (!last || last.step + last.len !== step) throw new Error(`bar ${b + 1}: a hold ("-") with no note before it`);
        last.len++;
      } else out.push({ step, len: 1, what });
    });
    return out;
  });
}

/** A tune → its bars of { step, len, midi }. */
export function parseTune(text, steps) {
  return parseBars(text, steps).map((bar) => bar.map(({ step, len, what }) => ({ step, len, midi: noteMidi(what) })));
}

/**
 * The note a pattern's token means over a chord, with the chord's root put
 * in octave `oct` (so `1` over D in octave 2 is D2).
 */
export function chordTone(chord, token, oct) {
  const root = chord.root + (oct + 1) * 12;
  switch (token) {
    case '1': return root;
    case '3': return root + chord.tones[1];
    case '5': return root + chord.tones[2];
    case '8': return root + 12;
    case '0': return root + chord.tones[2] - 12;
    default: throw new Error(`"${token}" is not a chord tone (1, 3, 5, 8 or 0)`);
  }
}

/** The next note of `key`'s scale above `midi` (for a grace note). */
export function stepAbove(midi, key) {
  for (let n = midi + 1; n <= midi + 3; n++) if (key.scale.includes(n % 12)) return n;
  return midi + 2;
}
