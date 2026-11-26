// The jukebox (jukebox.html): a page for listening to the score, as the
// gallery is a page for looking at the art. Not part of the game, and it
// never touches the save. Every cue is a button; a cue chosen while another
// plays comes in on the next bar line, so a change can be heard. Each
// instrument can be played by itself.
//
// From the console: jukebox.help(). jukebox.measure() plays every cue
// through an offline audio context and says how loud each came out, which
// is all a session that can't listen has to go on.
import { SoundSystem } from '../audio.js';
import { VOICES } from '../audio/instruments.js';
import { CUES, RANGES, DRUMS, STINGS } from './themes.js';
import { noteMidi, noteName, parseKey } from './notation.js';

const HELP = `jukebox
  play(cue, intensity?)   play a cue (${Object.keys(CUES).join(' | ')}); the change comes on the next bar line.
                          intensity 0-3: a bed only, up to every layer (default: the slider's)
  stop()                  fade to silence on the next bar line
  set({ intensity, rests, low, volume, rain, night })   rests: true = the long rests on the bed between
                          statements, as in the game (default false, so there is always a tune to hear); low: the
                          Low quality score; volume: 1 = as loud as in the game; rain, night: the cue's colours
                          (a cue with no such colour plays as it is)
  sting(name?)            a one-off phrase over whatever is on, in its key: sting('whale')
  note(voice, note?)      one note on one instrument: note('fiddle', 'A4'); no note = a run up its range
  state()                 what is playing: cue, intensity, phase, layers, key, bar
  measure(seconds?, cues?, colour?)   every cue (or those named) at full intensity through an offline context
                          (default 60 s each): its loudness (RMS, dB), its peak, and whether it clipped.
                          colour: { rain, night }. Works with the tab hidden`;

const A = new SoundSystem();
const set = { intensity: 2, rests: false, low: false, volume: 1, rain: false, night: false };
let cue = null, timer = null, last = 0;
const drums = Object.values(DRUMS);

function ready() {
  A.unlock();
  if (!A.ctx) return false;
  A.musicRests = set.rests;
  A.musicLow = set.low;
  A.master.gain.setTargetAtTime(0.55 * set.volume, A.ctx.currentTime, 0.05);
  if (!timer) {
    last = A.ctx.currentTime;
    timer = setInterval(() => {
      const t = A.ctx.currentTime;
      A.updateMusic(t - last, t, null);
      A.writeMusic(t, t + 1.2); // further ahead than the game writes: a hidden tab's timers are slow
      last = t;
      paint();
    }, 60);
  }
  return true;
}

const force = () => A.forceMusic(cue, set.intensity, { rain: set.rain, night: set.night });

function play(name, intensity = set.intensity) {
  if (name != null && !CUES[name]) return `No cue called "${name}". Choose from: ${Object.keys(CUES).join(', ')}.`;
  if (!ready()) return 'No sound here: this browser gave no audio context.';
  cue = name ?? null;
  set.intensity = intensity;
  force();
  paint();
  return state();
}

function note(voice, name) {
  if (!VOICES[voice]) return `No instrument called "${voice}". Choose from: ${Object.keys(VOICES).join(', ')}.`;
  if (!ready()) return 'No sound here.';
  const t = A.ctx.currentTime + 0.05;
  if (drums.includes(voice)) {
    [0, 0.5, 0.75, 1, 1.5].forEach((at) => A.voice(voice, null, t + at, 0, 1));
    return voice;
  }
  if (name) { A.voice(voice, noteMidi(name), t, 1.2, 1); return `${voice} ${name}`; }
  // a run up a D major scale from the bottom of its range, then a long note
  const [lo, hi] = RANGES[voice].map(noteMidi), scale = parseKey('D major').scale;
  const run = [];
  for (let m = lo; m <= hi && run.length < 15; m++) if (scale.includes(m % 12)) run.push(m);
  run.forEach((m, i) => A.voice(voice, m, t + i * 0.3, 0.28, 1));
  A.voice(voice, run[Math.floor(run.length / 2)], t + run.length * 0.3 + 0.2, 2, 1);
  return `${voice} ${noteName(run[0])} to ${noteName(run[run.length - 1])}`;
}

const state = () => (A.ctx ? { ...A.musicState(), ...set } : { cue: null, phase: 'not started', ...set });

/** Every cue (or `only`) at full intensity, offline: how loud it is and whether it clips. */
async function measure(seconds = 60, only = Object.keys(CUES), colour = {}) {
  const rows = [];
  for (const name of only) {
    const sr = 44100, ctx = new OfflineAudioContext(2, sr * seconds, sr);
    const S = new SoundSystem();
    S.musicSeed = 7;
    S.ctx = ctx;
    S.build();
    S.musicRests = false;
    S.forceMusic(name, 3, colour);
    S.updateMusic(0, 0, null);
    S.writeMusic(0, seconds);
    const buf = await ctx.startRendering();
    let sum = 0, peak = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
    }
    const dB = (x) => Math.round(200 * Math.log10(x || 1e-9)) / 10;
    rows.push({ cue: name, rms: dB(Math.sqrt(sum / (2 * buf.length))), peak: dB(peak), clipped: peak >= 1, bars: S.lastBar.bar + 1, quiet: !!CUES[name].quiet });
  }
  return rows;
}

// ----------------------------------------------------------------- the page
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const cueButtons = {};
const status = el('pre', { textContent: 'Choose a cue.' });
const report = el('pre');

function paint() {
  for (const [name, b] of Object.entries(cueButtons)) b.classList.toggle('on', name === String(cue) && !!timer);
  for (const { key, input, out } of sliders) { input.value = set[key]; out.textContent = set[key]; }
  const s = state();
  status.textContent = s.phase === 'not started' ? 'Choose a cue.'
    : `playing: ${s.cue ?? 'silence'}${s.wanted !== s.cue ? `  →  ${s.wanted ?? 'silence'} on the next bar` : ''}\n`
      + `key: ${s.key ?? '-'}   bar: ${s.bar}   ${s.phase}   layers: ${s.layers.join(', ') || '-'}   intensity: ${s.intensity}${s.rain ? '   in the rain' : ''}${s.night ? '   at night' : ''}`;
}

const sliders = []; // kept in step with `set`, which the console can change too

function slider(text, key, min, max, step, onInput) {
  const out = el('span', { textContent: set[key] });
  const input = el('input', { type: 'range', min, max, step, value: set[key] });
  input.addEventListener('input', () => { set[key] = Number(input.value); onInput(); paint(); });
  sliders.push({ key, input, out });
  return el('label', {}, text, input, out);
}

function tick(text, key) {
  const input = el('input', { type: 'checkbox', checked: set[key] });
  input.addEventListener('change', () => { set[key] = input.checked; if (A.ctx) { ready(); force(); } });
  return el('label', {}, input, text);
}

function build() {
  const main = document.querySelector('main');
  const cues = el('div', { className: 'row' });
  for (const name of [...Object.keys(CUES), null]) {
    const b = el('button', { className: 'big', textContent: name ?? 'Silence' });
    b.addEventListener('click', () => play(name));
    cueButtons[String(name)] = b;
    cues.append(b);
  }
  const voices = el('div', { className: 'row' });
  for (const name of Object.keys(VOICES)) {
    const b = el('button', { textContent: name });
    b.addEventListener('click', () => note(name));
    voices.append(b);
  }
  const stings = el('div', { className: 'row' });
  for (const name of Object.keys(STINGS)) {
    const b = el('button', { textContent: name });
    b.addEventListener('click', () => window.jukebox.sting(name));
    stings.append(b);
  }
  const measureBtn = el('button', { textContent: 'Measure every cue' });
  measureBtn.addEventListener('click', async () => {
    report.textContent = 'Measuring…';
    const rows = await measure();
    report.textContent = rows.map((r) => `${r.cue.padEnd(12)} loudness ${String(r.rms).padStart(6)} dB   peak ${String(r.peak).padStart(6)} dB${r.clipped ? '   CLIPPED' : ''}${r.quiet ? '   (meant to be faint)' : ''}`).join('\n');
  });
  main.append(
    el('h1', { textContent: 'Tidewake jukebox' }),
    el('p', { textContent: 'The game\'s score, a cue at a time. Choose another cue while one plays and it comes in on the next bar line.' }),
    el('h2', { textContent: 'Cues' }), cues, status,
    el('h2', { textContent: 'How it plays' }),
    el('div', { className: 'row' },
      slider('Intensity', 'intensity', 0, 3, 1, () => { if (timer) force(); }),
      slider('Volume', 'volume', 0, 4, 0.5, () => { if (A.ctx) ready(); }),
      tick('Long rests between statements, as in the game', 'rests'),
      tick('Low quality', 'low'),
      tick('Rain', 'rain'),
      tick('Night', 'night')),
    el('p', { className: 'small', textContent: 'Intensity: 0 is the bed alone, 3 is every layer. Volume 1 is as loud as the music is in the game, where it sits under the sea. Rain and night are colours: they change on the next bar, and a cue without one plays as it is.' }),
    el('h2', { textContent: 'One-off phrases' }), stings,
    el('p', { className: 'small', textContent: 'Played once over whatever cue is on, in its key. The whale\'s is what the score plays when a whale breaches.' }),
    el('h2', { textContent: 'Instruments' }), voices,
    el('p', { className: 'small', textContent: 'Each plays a run up its range, then one long note.' }),
    el('h2', { textContent: 'Levels' }), el('div', { className: 'row' }, measureBtn), report,
  );
}

build();
window.jukebox = { play, stop: () => play(null), set: (o) => { Object.assign(set, o); if (A.ctx) { ready(); force(); } paint(); return state(); }, sting: (name = 'whale') => (ready() ? (A.musicPhrase(name), name) : 'No sound here.'), note, state, measure, help: () => { console.log(HELP); return HELP; }, audio: A };
