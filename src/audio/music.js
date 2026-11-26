// The score's player, mixed into SoundSystem (audio.js). It asks the
// sequencer (music/score.js) for a bar at a time and writes its notes onto
// the audio context's own clock a little ahead of time, so the beat holds
// even when a frame is slow. The game only says which cue it wants and how
// much of it (music-cues.js); the change is made on the next bar line.
//
// The instruments are in audio/instruments.js, the tunes in music/themes.js.
import { MUSIC } from '../config.js';
import { CueHold } from '../music-cues.js';
import { Score } from '../music/score.js';
import { keyShift, parseKey, MODES } from '../music/notation.js';
import { STINGS } from '../music/themes.js';

export class MusicPlayer {
  /** Called once from build(). `musicSeed` can be set first to get the same performance twice. */
  buildMusic() {
    const c = this.ctx;
    this.scoreBus = c.createGain(); this.scoreBus.gain.value = MUSIC.level;
    this.scoreBus.connect(this.musicIn);
    this.score = new Score(this.musicSeed ?? ((Math.random() * 1e9) | 0));
    this.cueHold = new CueHold();
    this.barAt = 0;          // audio time of the next bar line
    this.intensity = 1;      // 0-3: a bed only, up to every layer
    this.lastBar = null;     // the bar most lately written out
    this.musicForce = null;  // { cue, intensity } from debug.music() or the jukebox, instead of the game's
    this.musicRests = true;  // false: statements back to back (the jukebox, measuring)
    this.colour = { rain: false, night: false };
  }

  /**
   * Each frame, from update(). `want` is { cue, intensity } from cueFor(),
   * or null for no score.
   */
  updateMusic(dt, t, want) {
    const held = this.cueHold.update(dt, want ? want.cue : null);
    const F = this.musicForce;
    this.score.setCue(F ? F.cue : held);
    this.intensity = F?.intensity ?? want?.intensity ?? 1;
    this.colour = { rain: F?.rain ?? !!want?.rain, night: F?.night ?? !!want?.night };
    // the on-foot line takes over from it for now
    this.scoreBus.gain.setTargetAtTime(F ? MUSIC.level : MUSIC.level * (1 - this.landMix), t, 0.6);
    if (this.musicOn) this.writeMusic(t, t + MUSIC.ahead);
  }

  /** Write out every bar that starts before `until` (audio time). */
  writeMusic(now, until) {
    if (this.barAt < now) this.barAt = now + 0.05;
    while (this.barAt < until) {
      const bar = this.score.nextBar(this.intensity, { low: this.musicLow, rests: this.musicRests, ...this.colour });
      for (const e of bar.events) this.voice(e.voice, e.midi, this.barAt + e.at, e.dur, e.vol);
      bar.at = this.barAt;
      this.lastBar = bar;
      this.barAt += bar.seconds;
    }
  }

  /**
   * Play this cue whatever the game wants (intensity 0-3, or none to leave
   * that to the game; `colour` { rain, night } likewise); no argument hands
   * it back.
   */
  forceMusic(cue, intensity, colour = {}) {
    this.musicForce = cue === undefined ? null : { cue, intensity, ...colour };
  }

  /**
   * A phrase played once over whatever is on, in its key (STINGS in
   * music/themes.js): the whale's long low notes as it breaches.
   */
  musicPhrase(name, volume = 1) {
    const S = STINGS[name];
    if (!this.ctx || !this.musicOn || !S) return;
    const key = parseKey(this.lastBar?.key || 'D major'), t = this.ctx.currentTime + 0.1;
    S.steps.forEach((step, i) => {
      const midi = (S.oct + 1) * 12 + key.tonic + MODES[key.mode].scale[step % 7] + 12 * Math.floor(step / 7);
      this.voice(S.voice, midi, t + i * S.each, S.each * 1.1, S.vol * volume);
    });
  }

  /**
   * Semitones to move a one-shot written in D so it sits in the key of the
   * cue playing: the discovery fanfare, the treasure chime and the rest are
   * played in the music's key instead of on top of it.
   */
  keyShift() {
    const key = this.musicOn && this.lastBar?.key;
    return key ? keyShift(key) : 0;
  }

  /** What is playing, for debug.music() and the jukebox. */
  musicState() {
    const b = this.lastBar;
    return {
      cue: b?.cue ?? null, wanted: this.score.want, forced: !!this.musicForce, intensity: this.intensity,
      phase: b?.phase ?? 'silent', layers: b?.layers ?? [], key: b?.key ?? null, bar: b?.bar ?? 0, on: this.musicOn,
      rain: !!b?.rain, night: !!b?.night,
    };
  }
}
