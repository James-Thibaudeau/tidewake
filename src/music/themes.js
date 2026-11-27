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
  horn: ['F2', 'F5'],
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

  // Sable's theme: a rakish jig in A Dorian, the minor with the bright major
  // fourth chord, so it swaggers instead of sulking. A long note and a quick
  // three, a climb to a cheeky D major, then a high turn that shows off.
  // No C or F# chords: the tow plays it in A Mixolydian (major), where those
  // would turn diminished.
  sable: {
    key: 'A dorian', steps: 6, beats: 2,
    phrases: {
      dare: {
        chords: 'Am | G | Am | D',
        tune: 'E5 - A5 A5 G5 A5 | B5 - G5 D5 - G5 | E5 - A5 A5 B5 C6 | D6 - A5 F#5 - D5',
      },
      grin: {
        chords: 'Am | G | Em D | Am',
        tune: 'E5 - A5 A5 G5 A5 | B5 - G5 D5 E5 G5 | B5 A5 G5 F#5 - D5 | A5 - E5 A4 - -',
      },
      flourish: {
        chords: 'D | G | D | Em',
        tune: 'F#5 - A5 D6 - A5 | B5 - G5 D6 - B5 | A5 - F#5 D5 E5 F#5 | G5 - E5 B4 C5 D5',
      },
      // a race won: up to the top and held
      won: {
        chords: 'G | Am',
        tune: 'D5 G5 B5 D6 - B5 | E6 - - - - -',
      },
      // a race lost: down to the bottom, with a shrug
      lost: {
        chords: 'D | Am',
        tune: 'A5 - F#5 D5 - B4 | G4 - B4 A4 - -',
      },
    },
  },
};

// A cue: a theme as it is played somewhere.
//
//   key      the key it is played in, if not the theme's own. In another mode
//            on the same note, every note and chord takes that mode's step
//            (A Dorian to A Mixolydian: C becomes C#, Am becomes A)
//   calm     true: at night it slows, loses its drums and gains a celesta
//   plain    true: no colours for rain or night (a storm, the fog)
//   quiet    true: meant to be faint, so not held to the others' loudness
//   urgent   true: it can't wait (a storm): it comes after a short hold and by
//            the quick way between keys
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
    theme: 'tempest', tempo: 126, gain: 0.8, plain: true, urgent: true,
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

// Sable's theme. The director plays it from the moment the Redwing turns
// up (the horn sting comes first, before the sails are in sight) until
// Sable sails off: an encounter, a race, the tow and the kraken. Races are
// `plain`: in the rain they keep their drums.
Object.assign(CUES, {
  // Sable coming to meet you: the jig at an easy swagger.
  sable: {
    theme: 'sable', tempo: 96, gain: 1,
    form: ['dare', 'grin', 'flourish', 'grin'], rest: [8, 20],
    drift: 'Am | G | Am | D',
    layers: {
      bed: { voice: 'strings', vol: 0.3, oct: 3 },
      bass: { voice: 'guitar', vol: 0.75, from: 1, oct: 2, pattern: '1 - 5 8 - 5' },
      melody: { voice: 'fiddle', vol: 1, from: 1 },
      counter: { voice: 'harp', vol: 0.45, from: 1, oct: 3, pattern: '. 3 5 . 3 5' },
      rhythm: { vol: 0.32, from: 2, pattern: 'b . s b . s' },
      descant: { voice: 'whistle', vol: 0.4, from: 3, shift: 12 },
    },
  },

  // A race: the full jig at tempo, with drums. The director turns it up to
  // everything while you're ahead or neck and neck, and down one while Sable leads.
  'sable-race': {
    theme: 'sable', tempo: 116, gain: 0.9, plain: true, urgent: true,
    form: ['dare', 'grin', 'flourish', 'grin'], rest: [3, 8],
    drift: 'Am | Am | G | D',
    layers: {
      bed: { voice: 'strings', vol: 0.32, oct: 3 },
      bass: { voice: 'guitar', vol: 0.8, from: 0, oct: 2, pattern: '1 - 5 8 - 5' },
      melody: { voice: 'fiddle', vol: 1, from: 1 },
      counter: { voice: 'harp', vol: 0.45, from: 1, oct: 3, pattern: '8 3 5 8 3 5' },
      rhythm: { vol: 0.34, from: 1, pattern: 'b . s b s s' },
      drums: { vol: 0.32, from: 2, pattern: 'd . . d . .' },
      descant: { voice: 'whistle', vol: 0.42, from: 3, shift: 12 },
    },
  },

  // The fog run: nothing to see, so only the bass line and a heartbeat.
  'sable-fog': {
    theme: 'sable', tempo: 84, gain: 1.4, plain: true, urgent: true,
    form: ['dare', 'grin', 'flourish', 'grin'], rest: [3, 8],
    drift: 'Am | Am | G | D',
    layers: {
      bed: { voice: 'strings', vol: 0.4, oct: 2 },
      bass: { voice: 'guitar', vol: 0.9, from: 1, oct: 2, pattern: '1 - 5 8 - 5' },
      rhythm: { vol: 0.4, from: 0, pattern: 'd d . . . .' },
    },
  },

  // The foot race ashore: quick and light, a tin whistle over a ukulele.
  'sable-pacer': {
    theme: 'sable', tempo: 120, gain: 1, plain: true, urgent: true,
    form: ['dare', 'grin', 'flourish', 'grin'], rest: [3, 8],
    drift: 'Am | G | Am | D',
    layers: {
      bed: { voice: 'strings', vol: 0.22, oct: 3 },
      bass: { voice: 'guitar', vol: 0.6, from: 0, oct: 2, pattern: '1 . . 5 . .' },
      melody: { voice: 'whistle', vol: 1, from: 1, shift: 12 },
      counter: { voice: 'ukulele', vol: 0.55, from: 1, oct: 4, pattern: '. 1 3 . 1 3' },
      rhythm: { vol: 0.3, from: 2, pattern: 's . s s . s' },
    },
  },

  // The tow: Sable's jig slowed to an air and turned major. Tired and kind.
  'sable-tow': {
    theme: 'sable', key: 'A mixolydian', tempo: 44, gain: 1.3, calm: true,
    form: ['dare', 'grin', 'flourish', 'grin'], rest: [15, 35],
    drift: 'Am | G | Am | D',
    layers: {
      bed: { voice: 'strings', vol: 0.34, oct: 3 },
      bass: { voice: 'harp', vol: 0.8, from: 1, oct: 2, pattern: '1 - - 5 - -' },
      melody: { voice: 'fiddle', vol: 0.95, from: 1 },
      counter: { voice: 'guitar', vol: 0.45, from: 2, oct: 3, pattern: '. 5 8 . 5 3' },
    },
  },

  // The kraken: Sable's theme down in the deep, huge and slow, under the
  // storm's drums and the squeezebox's stabs.
  'sable-kraken': {
    theme: 'sable', tempo: 42, gain: 1.15, plain: true, urgent: true,
    form: ['dare', 'grin', 'flourish', 'grin'], rest: [6, 14],
    drift: 'Am | Am | G | Am',
    layers: {
      bed: { voice: 'strings', vol: 0.4, oct: 2 },
      bass: { voice: 'guitar', vol: 0.85, from: 0, oct: 2, pattern: '1 1 . 1 1 .' },
      rhythm: { vol: 0.42, from: 0, pattern: 'd . . d . b' },
      melody: { voice: 'strings', vol: 1.6, from: 1, shift: -24 },
      descant: { voice: 'guitar', vol: 0.6, from: 1, shift: -12 },
      counter: { voice: 'squeezebox', vol: 0.8, from: 2, oct: 3, pattern: '. . 5 . . 5' },
      drums: { vol: 0.34, from: 2, pattern: '. b s . b s' },
    },
  },
});

// Rough water in a storm: the zone's cue, quicker, over the storm's drums.
for (const zone of ['reach', 'rip', 'swell']) {
  const Z = CUES[zone];
  CUES[zone + '-storm'] = {
    ...Z, tempo: Math.round(Z.tempo * 1.2), plain: true, urgent: true,
    layers: { ...Z.layers, rhythm: { vol: 0.42, from: 0, pattern: 'd . b d . b' }, drums: { vol: 0.34, from: 0, pattern: '. s s . s s' } },
  };
}

// A phrase played once over whatever cue is on, in its key. Either `steps`
// of the key's scale above its tonic in octave `oct` (7 = the octave), each
// held `each` seconds; or a `phrase` of a `theme` (its first `bars`, or all),
// at `tempo`, moved by `shift` semitones and into the key that shares the
// playing cue's notes, as the one-shots are.
export const STINGS = {
  // a whale breaching: long and low
  whale: { voice: 'strings', oct: 2, steps: [0, 4, 5, 4, 0], each: 1.7, vol: 1.6 },
  // Sable's horn, faint on the wind, before the crimson sails are in sight
  'sable-horn': { voice: 'horn', theme: 'sable', phrase: 'dare', bars: 2, tempo: 88, shift: -12, vol: 0.7 },
  // a race won, or lost
  'sable-won': { voice: 'fiddle', theme: 'sable', phrase: 'won', tempo: 116, shift: 0, vol: 1.1 },
  'sable-lost': { voice: 'fiddle', theme: 'sable', phrase: 'lost', tempo: 116, shift: 0, vol: 1.1 },
};
