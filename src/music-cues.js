// The music's director: which cue the game wants, and how much of it. Pure:
// no audio, no DOM, so `node tools/check.mjs music` can test it. The cues
// themselves are in music/themes.js; the player is audio/music.js.
//
// RULES is in priority order and the first row that applies wins ("Cues at
// sea" in docs/feature-plan.md). Still to come: a landmark in sight just
// under the fog.
import { MUSIC } from './config.js';

// How much of a cue plays, 1-3, from a number and the two marks it has to pass.
const level = (x, [two, three]) => (x >= three ? 3 : x >= two ? 2 : 1);
const bySpeed = (s) => level(Math.abs(s.speed || 0), [MUSIC.brisk, MUSIC.fast]);
const inStorm = (s) => (s.storm || 0) >= MUSIC.storm;

// Sable's moments (rival.musicMoment()), and their cues: what each version
// of the theme is for is in music/themes.js.
const SABLE = { meet: 'sable', race: 'sable-race', fog: 'sable-fog', pacer: 'sable-pacer', tow: 'sable-tow', kraken: 'sable-kraken' };
// A race goes up to everything while you lead or it's close, and holds one back while Sable leads.
const sableLevel = ({ kind, start, lead = 0 }) => {
  if (kind === 'kraken') return 3;
  if (start) return 1;
  if (kind === 'race') return lead > MUSIC.sableLead ? 2 : 3;
  return 2;
};

const RULES = [
  { cue: () => 'title', when: (s) => s.title, intensity: () => 2 },
  // Sable, wherever they turn up: at sea above any weather, and ashore for the foot race.
  { cue: (s) => SABLE[s.sable.kind], when: (s) => SABLE[s.sable?.kind], intensity: (s) => sableLevel(s.sable), urgent: (s) => s.sable.kind !== 'meet' && s.sable.kind !== 'tow' },
  // Ashore still has the old on-foot line (audio/ashore.js), so the sea's score stops there.
  { cue: () => null, when: (s) => s.ashore },
  // In port the weather is outside: Port Haven's own tune, or the harbour's.
  { cue: (s) => (s.homePort ? 'haven' : 'harbour'), when: (s) => s.docked, intensity: () => 2 },
  // The ghost ship: the score falls silent but for a music box, far off.
  { cue: () => 'ghost', when: (s) => s.ghost, intensity: () => 1 },
  // A storm breaking can't wait for the hold: the music should be there with the first squall.
  { cue: (s) => s.zone + '-storm', when: (s) => s.zone && inStorm(s), intensity: () => 3, urgent: true },
  { cue: () => 'storm', when: inStorm, intensity: (s) => level(s.storm, MUSIC.stormLevels), urgent: true },
  { cue: (s) => s.zone, when: (s) => s.zone, intensity: (s) => level(s.rough ?? 1, MUSIC.roughLevels) },
  { cue: () => 'fog', when: (s) => (s.fog ?? 1) < MUSIC.fog && !(s.rain > 0.2), intensity: () => 1 },
  { cue: () => 'home', when: (s) => s.band === 'home' },
  { cue: () => 'coastal', when: (s) => s.band === 'coastal' },
  { cue: () => 'open', when: (s) => s.band === 'open' },
];

/**
 * What should be playing. `s` is the situation:
 *   title, ashore, docked, homePort   where the player is (true or not)
 *   sable       what Sable is up to, or null: { kind: meet | race | fog | pacer | tow | kraken,
 *               start: true before the off (a countdown, or adrift before the tow),
 *               lead: metres Sable leads a race by (negative: behind) }
 *   ghost       the ghost ship is out there
 *   band        'home' | 'coastal' | 'open' (bandAt)
 *   zone        the rough zone the boat is well inside (an id), or null; `rough` 0-1, how far in
 *   storm, rain 0-1, and fog: the weather's own number, 1 clear down to 0.18 in thick fog
 *   night       0-1
 *   speed       the boat's
 * Returns { cue, intensity, rain, night, urgent }: a name from CUES (or null for no
 * score), 0-3 from a bed only up to every layer, and the colours of the
 * moment (a cue that has no such colour ignores them). On plain sea, the
 * faster she sails the more plays; a storm and rough water go by how bad it is.
 */
export function cueFor(s) {
  const rule = RULES.find((r) => r.when(s));
  return {
    cue: rule ? rule.cue(s) : null,
    intensity: (rule?.intensity || bySpeed)(s),
    rain: (s.rain || 0) >= MUSIC.rain,
    night: (s.night || 0) > 0.5,
    urgent: typeof rule?.urgent === 'function' ? rule.urgent(s) : !!rule?.urgent,
  };
}

/**
 * Keeps the music from flipping back and forth at the edge of a zone: a
 * newly wanted cue has to stay wanted for MUSIC.hold seconds before the
 * music follows it (MUSIC.urgentHold if it is `urgent`: a storm). Silence
 * (null, going ashore) and the first cue of all are taken at once.
 */
export class CueHold {
  constructor() {
    this.cue = undefined;
    this.next = undefined;
    this.t = 0;
  }

  /** Call each frame with the cue wanted now; returns the cue to play. */
  update(dt, wanted, urgent = false) {
    if (wanted === this.cue) { this.next = undefined; this.t = 0; return this.cue; }
    if (this.cue == null || wanted == null) { this.cue = wanted; this.t = 0; return this.cue; }
    if (wanted !== this.next) { this.next = wanted; this.t = 0; }
    this.t += dt;
    if (this.t >= (urgent ? MUSIC.urgentHold : MUSIC.hold)) { this.cue = wanted; this.next = undefined; this.t = 0; }
    return this.cue;
  }
}
