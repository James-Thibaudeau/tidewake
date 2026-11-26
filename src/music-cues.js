// The music's director: which cue the game wants, and how much of it. Pure:
// no audio, no DOM, so `node tools/check.mjs music` can test it. The cues
// themselves are in music/themes.js; the player is audio/music.js.
//
// RULES is in priority order and the first row that applies wins. Later
// parts of the score add rows above the bands (Sable, storms, rough water,
// fog, a landmark in sight: see "Cues at sea" in docs/feature-plan.md).
import { MUSIC } from './config.js';

const RULES = [
  // Ashore still has the old on-foot line (audio/ashore.js), so the sea's score stops there.
  { cue: null, when: (s) => s.ashore },
  { cue: 'home', when: (s) => s.band === 'home' },
  { cue: 'coastal', when: (s) => s.band === 'coastal' },
  { cue: 'open', when: (s) => s.band === 'open' },
];

/**
 * What should be playing. `s` is the situation: { band: 'home' | 'coastal' |
 * 'open', ashore: true on foot, speed: the boat's }. Returns { cue,
 * intensity }: a name from CUES (or null for no score) and 0-3, from a bed
 * only up to every layer. The faster she sails, the more plays.
 */
export function cueFor(s) {
  const rule = RULES.find((r) => r.when(s));
  const speed = Math.abs(s.speed || 0);
  const intensity = speed >= MUSIC.fast ? 3 : speed >= MUSIC.brisk ? 2 : 1;
  return { cue: rule ? rule.cue : null, intensity };
}

/**
 * Keeps the music from flipping back and forth at the edge of a zone: a
 * newly wanted cue has to stay wanted for MUSIC.hold seconds before the
 * music follows it. Silence (null, going ashore) and the first cue of all
 * are taken at once.
 */
export class CueHold {
  constructor() {
    this.cue = undefined;
    this.next = undefined;
    this.t = 0;
  }

  /** Call each frame with the cue wanted now; returns the cue to play. */
  update(dt, wanted) {
    if (wanted === this.cue) { this.next = undefined; this.t = 0; return this.cue; }
    if (this.cue == null || wanted == null) { this.cue = wanted; this.t = 0; return this.cue; }
    if (wanted !== this.next) { this.next = wanted; this.t = 0; }
    this.t += dt;
    if (this.t >= MUSIC.hold) { this.cue = wanted; this.next = undefined; this.t = 0; }
    return this.cue;
  }
}
