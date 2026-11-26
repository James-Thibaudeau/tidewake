// The score, as data: the tunes and what plays them. Kept apart from the
// player (music/score.js, audio/music.js) the way story-text.js keeps the
// writing apart. Pure: no audio, no DOM. The notation is in music/notation.js.
//
// Nobody has heard a note of this until it has been played in jukebox.html:
// a session can measure a cue but not listen to it.

// The lowest and highest note each instrument is written for (the voices
// themselves are in audio/instruments.js). `node tools/check.mjs music` holds
// every note of every cue inside these.
export const RANGES = {
  guitar: ['D2', 'B5'], // the low string dropped to D
  harp: ['C2', 'G6'],
  ukulele: ['G3', 'A5'],
  celesta: ['C4', 'C7'],
  musicbox: ['C5', 'C8'],
  marimba: ['C2', 'C6'],
  steeldrum: ['C3', 'C6'],
  squeezebox: ['F2', 'D6'],
  flute: ['C4', 'C7'],
  whistle: ['D5', 'D7'],
  fiddle: ['G3', 'E6'],
  strings: ['C2', 'C5'],
};

// The letters a rhythm pattern is written in.
export const DRUMS = { d: 'framedrum', b: 'bodhran', s: 'shaker' };

// A theme: its key, how a bar divides (`steps` to the bar, `beats` of them
// felt), and its phrases. A phrase is some bars of chords with a tune over
// them; a cue plays phrases in an order of its own.
export const THEMES = {
  // The Tidewake theme: grandfather's tune. The rest of the score borrows
  // from it. Sixteen bars: a, a again with a different ending, a middle
  // that climbs, and a home again.
  tidewake: {
    key: 'D major', steps: 8, beats: 4,
    phrases: {
      a: {
        chords: 'D | G | Bm | A',
        tune: 'D5 - - E5 F#5 - A5 - | G5 - F#5 E5 D5 - B4 - | B4 - D5 - F#5 - E5 D5 | E5 - - - - - A4 -',
      },
      a2: {
        chords: 'D | G | Em A | D',
        tune: 'D5 - - E5 F#5 - A5 - | B5 - A5 G5 F#5 - D5 - | E5 - G5 F#5 E5 - C#5 - | D5 - - - - - . .',
      },
      b: {
        chords: 'G | D | Em | A',
        tune: 'B4 - D5 - G5 - - F#5 | F#5 - E5 D5 A4 - - - | G4 - B4 - E5 - - D5 | C#5 - E5 - A5 - - -',
      },
      a3: {
        chords: 'D | G | A | D',
        tune: 'D5 - - E5 F#5 - A5 - | B5 - A5 G5 F#5 - E5 - | F#5 - E5 - C#5 - E5 - | D5 - - - - - - -',
      },
    },
  },

  // The open sea: the main theme's opening, turned to the minor and slowed
  // until it is mostly long notes.
  farwater: {
    key: 'B minor', steps: 8, beats: 4,
    phrases: {
      out: {
        chords: 'Bm | G | D | A',
        tune: 'B4 - - - D5 - - - | E5 - - - D5 - B4 - | A4 - - - - - F#4 - | E4 - - - - - - -',
      },
      back: {
        chords: 'Bm | Em | F#m | Bm',
        tune: 'B4 - - - D5 - - - | G5 - - - F#5 - E5 - | C#5 - - - - - A4 - | B4 - - - - - - -',
      },
    },
  },
};

// A cue: a theme as it is played somewhere.
//
//   form     the phrases of one full statement, in order
//   pick     instead of the whole form, how many of its phrases a statement
//            plays, chosen afresh each time (fragments)
//   rest     seconds of bed only between statements, shortest and longest
//   drift    the chords the bed wanders through while the tune rests
//   gain     the whole cue's level, set by measuring (jukebox.measure())
//   layers   bed, bass, melody, counter and rhythm. Each plays from the
//            intensity in `from` upwards (0 = always), on `voice`, at `vol`.
//            The bed holds each bar's chord with its root in octave `oct`;
//            bass and counter play a `pattern` of chord tones; the melody
//            plays the phrase's tune, moved by `shift` semitones.
export const CUES = {
  // Home waters: warm and bright, the main theme in full.
  home: {
    theme: 'tidewake', tempo: 84, gain: 0.85,
    form: ['a', 'a2', 'b', 'a3'], rest: [30, 90],
    drift: 'D | D | G | D',
    layers: {
      bed: { voice: 'strings', vol: 0.3, oct: 3 },
      bass: { voice: 'guitar', vol: 0.75, from: 1, oct: 2, pattern: '1 - - - 5 - - -' },
      melody: { voice: 'flute', vol: 1, from: 1 },
      counter: { voice: 'guitar', vol: 0.5, from: 2, oct: 3, pattern: '1 5 8 5 3 5 8 5' },
      rhythm: { vol: 0.35, from: 3, pattern: '. . s . . s s .' },
    },
  },

  // The coastal sea: sparse and wandering, a piece of the main theme at a time.
  coastal: {
    theme: 'tidewake', tempo: 72, gain: 1.25,
    form: ['a', 'a2', 'b', 'a3'], pick: 1, rest: [40, 90],
    drift: 'D | G | D | Bm',
    layers: {
      bed: { voice: 'squeezebox', vol: 0.34, oct: 3 },
      bass: { voice: 'harp', vol: 0.8, from: 1, oct: 2, pattern: '1 - - - - - - -' },
      melody: { voice: 'harp', vol: 1.5, from: 1 },
      counter: { voice: 'harp', vol: 0.6, from: 2, oct: 3, pattern: '. . 5 - 8 - 3 -' },
      rhythm: { vol: 0.25, from: 3, pattern: '. . . . s . . .' },
    },
  },

  // The open sea: wider and lonelier. Long notes, lower, more space, no pulse.
  open: {
    theme: 'farwater', tempo: 58, gain: 1,
    form: ['out', 'back'], rest: [45, 90],
    drift: 'Bm | Bm | G | Bm',
    layers: {
      bed: { voice: 'strings', vol: 0.36, oct: 2 },
      bass: { voice: 'harp', vol: 0.5, from: 2, oct: 2, pattern: '1 - - - - - - -' },
      melody: { voice: 'fiddle', vol: 1, from: 1 },
      counter: { voice: 'harp', vol: 0.35, from: 3, oct: 3, pattern: '. . . . 1 - 5 -' },
    },
  },
};
