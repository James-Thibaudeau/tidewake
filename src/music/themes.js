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

  // The storm: a reel in a hurry. The tune runs, falls back on its first
  // note and runs again; the middle climbs a step at a time, like the seas.
  tempest: {
    key: 'B minor', steps: 8, beats: 4,
    phrases: {
      gale: {
        chords: 'Bm | G | A | Bm',
        tune: 'B4 - F#5 - E5 D5 C#5 D5 | B4 - G5 - F#5 E5 D5 E5 | C#5 - A5 - G5 F#5 E5 C#5 | D5 - B4 - B4 - - -',
      },
      surge: {
        chords: 'G | A | Bm | F#m',
        tune: 'D5 - G5 - B5 - A5 G5 | E5 - A5 - C#6 - B5 A5 | F#5 - B5 - D6 - C#6 B5 | A5 - F#5 - C#5 - F#5 -',
      },
    },
  },

  // Rough water: heavy and rolling, in six. Each zone plays it in a key and
  // on instruments of its own.
  rollers: {
    key: 'E minor', steps: 6, beats: 2,
    phrases: {
      heave: {
        chords: 'Em | D | C | D',
        tune: 'E5 - - G5 - A5 | F#5 - - D5 - A4 | G5 - - E5 - C5 | D5 - - F#5 - A5',
      },
      haul: {
        chords: 'Em | G | D | Em',
        tune: 'B5 - - A5 - G5 | D5 - - G5 - B5 | A5 - - F#5 - D5 | E5 - - - - -',
      },
    },
  },

  // Fog: still and uncertain. D Lydian, whose first four notes are all a
  // whole tone apart, so nothing in it settles. Few notes, far between.
  mist: {
    key: 'D lydian', steps: 8, beats: 4,
    phrases: {
      drift: {
        chords: 'D | E | D | E',
        tune: 'A5 - - - . . G#5 - | F#5 - - - - - . . | . . D5 - - - E5 - | G#5 - - - - - - -',
      },
      listen: {
        chords: 'D | Bm | E | D',
        tune: '. . F#5 - - - E5 - | D5 - - - - - . . | . . G#5 - - - B5 - | A5 - - - - - - -',
      },
    },
  },
};

// A cue: a theme as it is played somewhere.
//
//   key      the key it is played in, if not the theme's own (the same mode)
//   calm     true: at night it slows, loses its drums and gains a celesta
//   plain    true: no colours for rain or night (a storm, the fog)
//   quiet    true: meant to be faint, so not held to the others' loudness
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
    theme: 'tidewake', tempo: 100, gain: 0.85, calm: true,
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
    theme: 'tidewake', tempo: 90, gain: 1.05, calm: true,
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

  // The title screen: the main theme in full, with everything on it.
  title: {
    theme: 'tidewake', tempo: 96, gain: 0.9, plain: true,
    form: ['a', 'a2', 'b', 'a3'], rest: [6, 14],
    drift: 'D | G | D | A',
    layers: {
      bed: { voice: 'strings', vol: 0.3, oct: 3 },
      bass: { voice: 'guitar', vol: 0.7, from: 1, oct: 2, pattern: '1 - - 5 8 - 5 -' },
      melody: { voice: 'flute', vol: 1, from: 1 },
      counter: { voice: 'harp', vol: 0.5, from: 1, oct: 3, pattern: '1 5 8 5 3 5 8 5' },
      descant: { voice: 'celesta', vol: 0.4, from: 2, shift: 12 },
      rhythm: { vol: 0.3, from: 2, pattern: '. . s . . s s .' },
    },
  },

  // In port: the main theme taken easily on the squeezebox, as someone on
  // the quay might play it.
  harbour: {
    theme: 'tidewake', tempo: 80, gain: 1, calm: true,
    form: ['a', 'a2', 'b', 'a3'], rest: [12, 30],
    drift: 'D | G | D | A',
    layers: {
      bed: { voice: 'strings', vol: 0.24, oct: 3 },
      bass: { voice: 'guitar', vol: 0.7, from: 1, oct: 2, pattern: '1 - - - 5 - - -' },
      melody: { voice: 'squeezebox', vol: 1.5, from: 1 },
      counter: { voice: 'guitar', vol: 0.45, from: 1, oct: 3, pattern: '. 5 8 5 . 5 8 5' },
    },
  },

  // Port Haven: the same, but on the guitar. Home.
  haven: {
    theme: 'tidewake', tempo: 80, gain: 1.3, calm: true,
    form: ['a', 'a2', 'b', 'a3'], rest: [12, 30],
    drift: 'D | G | D | A',
    layers: {
      bed: { voice: 'strings', vol: 0.24, oct: 3 },
      bass: { voice: 'guitar', vol: 0.7, from: 1, oct: 2, pattern: '1 - - - 5 - - -' },
      melody: { voice: 'guitar', vol: 1.5, from: 1 },
      counter: { voice: 'harp', vol: 0.45, from: 1, oct: 3, pattern: '. 5 8 5 . 5 8 5' },
    },
  },

  // A storm: driving and dark, and a thrill. The squeezebox has the tune,
  // the guitar hammers the root, and the drums never stop.
  storm: {
    theme: 'tempest', tempo: 126, gain: 0.8, plain: true,
    form: ['gale', 'gale', 'surge', 'gale'], rest: [8, 20],
    drift: 'Bm | Bm | G | A',
    layers: {
      bed: { voice: 'strings', vol: 0.4, oct: 2 },
      bass: { voice: 'guitar', vol: 0.8, from: 0, oct: 2, pattern: '1 1 . 1 1 . 1 5' },
      rhythm: { vol: 0.4, from: 0, pattern: 'd . . d . . d .' },
      melody: { voice: 'squeezebox', vol: 1.6, from: 1, shift: -12 },
      counter: { voice: 'squeezebox', vol: 0.9, from: 1, oct: 3, pattern: '. . 5 . . . 5 .' },
      drums: { vol: 0.36, from: 2, pattern: '. b s b . b s b' },
      descant: { voice: 'fiddle', vol: 0.7, from: 3 },
    },
  },

  // Fog: no pulse. A bowed drone, a celesta a long way off, and a bell.
  fog: {
    theme: 'mist', tempo: 60, gain: 1.4, plain: true,
    form: ['drift', 'listen'], pick: 1, rest: [10, 25],
    drift: 'D | D | E | D',
    layers: {
      bed: { voice: 'strings', vol: 0.7, oct: 2 },
      melody: { voice: 'celesta', vol: 1, from: 1 },
      counter: { voice: 'musicbox', vol: 0.5, from: 1, oct: 5, pattern: '. . . . . . 5 -' },
    },
  },

  // The Frostspire Reach: glassy and cold. Bells over low strings.
  reach: {
    theme: 'rollers', key: 'B minor', tempo: 58, gain: 1,
    form: ['heave', 'haul'], rest: [10, 25],
    drift: 'Em | Em | C | D',
    layers: {
      bed: { voice: 'strings', vol: 0.4, oct: 2 },
      bass: { voice: 'harp', vol: 0.8, from: 0, oct: 2, pattern: '1 - - 5 - -' },
      melody: { voice: 'celesta', vol: 1.2, from: 1 },
      counter: { voice: 'harp', vol: 0.45, from: 1, oct: 3, pattern: '. 5 8 . 5 3' },
      descant: { voice: 'musicbox', vol: 0.5, from: 2, shift: 12 },
      rhythm: { vol: 0.35, from: 2, pattern: 'd . . b . .' },
    },
  },

  // The Cinder Rip: hot and low. Marimbas and hand drums.
  rip: {
    theme: 'rollers', key: 'C minor', tempo: 66, gain: 0.9,
    form: ['heave', 'haul'], rest: [10, 25],
    drift: 'Em | Em | C | D',
    layers: {
      bed: { voice: 'strings', vol: 0.36, oct: 2 },
      bass: { voice: 'marimba', vol: 0.9, from: 0, oct: 2, pattern: '1 - 1 5 - 1' },
      melody: { voice: 'marimba', vol: 1.2, from: 1, shift: -12 },
      counter: { voice: 'marimba', vol: 0.5, from: 1, oct: 3, pattern: '. 5 8 . 5 8' },
      rhythm: { vol: 0.4, from: 1, pattern: 'd . b d b .' },
      drums: { vol: 0.3, from: 2, pattern: '. s s . s s' },
    },
  },

  // The Outer Swell: wide and slow, a long way from anywhere. A fiddle over the deep.
  swell: {
    theme: 'rollers', key: 'D minor', tempo: 50, gain: 1,
    form: ['heave', 'haul'], rest: [10, 25],
    drift: 'Em | Em | C | D',
    layers: {
      bed: { voice: 'strings', vol: 0.42, oct: 2 },
      bass: { voice: 'harp', vol: 0.8, from: 0, oct: 2, pattern: '1 - - 5 - -' },
      melody: { voice: 'fiddle', vol: 1, from: 1 },
      counter: { voice: 'harp', vol: 0.45, from: 1, oct: 3, pattern: '1 5 8 5 3 5' },
      rhythm: { vol: 0.3, from: 3, pattern: 'd . . . . .' },
    },
  },

  // The ghost ship: the score falls silent, and somewhere out there a music
  // box plays grandfather's tune, slightly out of tune with itself.
  ghost: {
    theme: 'tidewake', tempo: 66, gain: 0.5, plain: true, quiet: true,
    form: ['a', 'a2', 'b', 'a3'], pick: 1, rest: [8, 20],
    drift: 'D | D | D | D',
    layers: {
      melody: { voice: 'musicbox', vol: 1, from: 0, shift: 12.3 },
      descant: { voice: 'musicbox', vol: 0.6, from: 0, shift: 11.8 },
    },
  },
};

// Rough water in a storm: the zone's cue, quicker, over the storm's drums.
for (const zone of ['reach', 'rip', 'swell']) {
  const Z = CUES[zone];
  CUES[zone + '-storm'] = {
    ...Z, tempo: Math.round(Z.tempo * 1.2), plain: true,
    layers: { ...Z.layers, rhythm: { vol: 0.42, from: 0, pattern: 'd . b d . b' }, drums: { vol: 0.34, from: 0, pattern: '. s s . s s' } },
  };
}

// A phrase played once over whatever cue is on, in its key: `steps` are
// steps of the key's scale above its tonic in octave `oct` (7 = the octave),
// each held `each` seconds.
export const STINGS = {
  // a whale breaching: long and low
  whale: { voice: 'strings', oct: 2, steps: [0, 4, 5, 4, 0], each: 1.7, vol: 1.6 },
};
