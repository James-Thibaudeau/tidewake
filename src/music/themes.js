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

  // The open sea: a journey into the unknown. E Dorian, the minor with a
  // bright fourth chord, which is where sea songs live: bold, not sad. The
  // tune leaps up a fifth and a fourth and then drives on repeated notes; its
  // third phrase climbs to the top of the fiddle before it comes home.
  farwater: {
    key: 'E dorian', steps: 8, beats: 4,
    phrases: {
      out: {
        chords: 'Em | D | G | A',
        tune: 'E4 - B4 E5 - E5 D5 E5 | F#5 - D5 A4 - A4 D5 F#5 | G5 - D5 B4 - B4 D5 G5 | A5 - G5 E5 C#5 - E5 -',
      },
      back: {
        chords: 'Em | G | D A | Em',
        tune: 'E4 - B4 E5 - E5 F#5 G5 | B5 - A5 G5 - D5 G5 B5 | A5 - F#5 D5 E5 - C#5 A4 | E5 - - B4 E5 - - -',
      },
      crest: {
        chords: 'G | A | Bm | A',
        tune: 'G5 - B5 - D6 - B5 G5 | A5 - C#6 - A5 - E5 A5 | B5 - D6 - F#5 - B5 D6 | C#6 - A5 - E5 - A5 -',
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
//   layers   bed, bass, melody, counter and rhythm, and where a cue wants
//            them `drums` (a second rhythm) and `descant` (a second
//            instrument on the tune). Each plays from the intensity in `from`
//            upwards (0 = always), on `voice`, at `vol`. The bed holds each
//            bar's chord with its root in octave `oct`; a layer with a
//            `pattern` plays it, in chord tones or in drum letters; a layer
//            without one plays the phrase's tune, moved by `shift` semitones.
export const CUES = {
  // Home waters: warm and bright, the main theme in full, at a walking pace
  // with the guitar rolling along under it.
  home: {
    theme: 'tidewake', tempo: 100, gain: 0.85,
    form: ['a', 'a2', 'b', 'a3'], rest: [20, 50],
    drift: 'D | D | G | D',
    layers: {
      bed: { voice: 'strings', vol: 0.3, oct: 3 },
      bass: { voice: 'guitar', vol: 0.75, from: 1, oct: 2, pattern: '1 - - 5 8 - 5 -' },
      melody: { voice: 'flute', vol: 1, from: 1 },
      counter: { voice: 'guitar', vol: 0.5, from: 1, oct: 3, pattern: '1 5 8 5 3 5 8 5' },
      rhythm: { vol: 0.35, from: 2, pattern: 'd . s . . s s .' },
    },
  },

  // The coastal sea: lighter than home and with more air in it, two phrases
  // of the main theme at a time on the harp.
  coastal: {
    theme: 'tidewake', tempo: 90, gain: 1.05,
    form: ['a', 'a2', 'b', 'a3'], pick: 2, rest: [25, 60],
    drift: 'D | G | D | Bm',
    layers: {
      bed: { voice: 'squeezebox', vol: 0.34, oct: 3 },
      bass: { voice: 'harp', vol: 0.8, from: 1, oct: 2, pattern: '1 - - - 5 - - -' },
      melody: { voice: 'harp', vol: 1.5, from: 1 },
      counter: { voice: 'harp', vol: 0.6, from: 1, oct: 3, pattern: '. 5 8 - 3 5 8 -' },
      rhythm: { vol: 0.3, from: 2, pattern: '. . s . . . s s' },
    },
  },

  // The open sea: a journey into the unknown. The fiddle's tune at a run
  // over a driving guitar and a rolling harp; a hand drum counts three, three
  // and two from the start, more drums join at speed, and at full sail a tin
  // whistle takes the tune up an octave.
  open: {
    theme: 'farwater', tempo: 108, gain: 1,
    form: ['out', 'back', 'crest', 'back'], rest: [20, 45],
    drift: 'Em | Em | D | Em',
    layers: {
      bed: { voice: 'strings', vol: 0.36, oct: 2 },
      bass: { voice: 'guitar', vol: 0.7, from: 1, oct: 2, pattern: '1 - 1 - 5 - 1 -' },
      melody: { voice: 'fiddle', vol: 1, from: 1 },
      counter: { voice: 'harp', vol: 0.45, from: 1, oct: 3, pattern: '1 5 8 5 3 5 8 5' },
      rhythm: { vol: 0.3, from: 1, pattern: 'b . . b . . b .' },
      drums: { vol: 0.32, from: 2, pattern: 'd . s . . s . s' },
      descant: { voice: 'whistle', vol: 0.45, from: 3, shift: 12 },
    },
  },
};
