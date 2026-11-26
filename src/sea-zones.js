// Sea zones: how the sea changes with where you are (docs/feature-plan.md, Phase 9).
//
// Two things, both measured in world metres with Port Haven at (0, 0):
//   bands   home waters, the coastal sea and the open sea, by distance from Port Haven.
//           A band only changes the weather's odds (weather.js picks by BANDS).
//   zones   patches of sea with waves of their own (SEA_ZONES). Home waters are the one
//           zone so far: clear, shallow and half as rough. Rough water round the far
//           landmarks (9.2) is more rows in the same table.
//
// The waves ask here on the CPU (waveFactors, from waves.js) and on the GPU
// (SEA_ZONE_GLSL, written out from the same table), so the boat sits on the water
// everywhere. Pure: no three.js and no DOM, so tools/check.mjs can run it in Node.
// Nothing here draws from the world's rng(): the world is as it was.
import { smoothstep } from './util.js';

// Each zone fills a ring round its centre (x, z): full strength from `inner` to `outer`
// metres out (inner 0 = a disc), fading to nothing over `fade` metres beyond each edge.
// Fades are wide (200 m or more) so a boat's motion never jumps and the water shows no seam.
//   wave, swell   what the weather's wave scale and swell are multiplied by at full strength
//   shallow       1 = the clear shallows are drawn here (ocean.js)
//   severity      rough water, 1-3 (none yet: seaAt().rough stays 0 until 9.2 adds its rows)
export const SEA_ZONES = [
  { id: 'home', name: 'Home waters', x: 0, z: 0, inner: 0, outer: 1000, fade: 400, wave: 0.5, swell: 0.5, shallow: 1, severity: 0 },
];

// The open sea starts this far from Port Haven. Every landmark lies beyond it.
export const OPEN_SEA = 3500;

// What a band does to the weather: how much likelier a storm or rain is as the next
// weather (1 = the coastal sea, which is the table in weather.js as it stands), and how
// long a storm lasts, in seconds. No storm ever starts in home waters.
// The share of time spent in a storm that these give: none at home, 7.7% on the coast
// and 16.3% in the open sea, where storms are also longer. (Doubling both weights as
// well as lengthening storms gave 21%, nearer three times the coast's than twice.)
export const BANDS = {
  home: { storm: 0, rain: 0.5, stormFor: [80, 170] },
  coastal: { storm: 1, rain: 1, stormFor: [80, 170] },
  open: { storm: 1.5, rain: 1.5, stormFor: [120, 220] },
};

// Where each zone's centre is, as the shaders get it (uSeaZone): x, z for each row.
export const ZONE_AT = new Float32Array(SEA_ZONES.flatMap((Z) => [Z.x, Z.z]));

/** How strongly a zone holds `d` metres from its centre: 1 inside its ring, 0 past the fades. */
export function zoneStrength(Z, d) {
  const out = 1 - smoothstep(Z.outer, Z.outer + Z.fade, d);
  return Z.inner > 0 ? out * smoothstep(Z.inner - Z.fade, Z.inner, d) : out;
}

/**
 * What the wave scale and the swell are multiplied by at a point, into out[0] and out[1].
 * This is the one the waves call for every sample, so it makes nothing new.
 */
export function waveFactors(x, z, out) {
  let wave = 1, swell = 1;
  for (let i = 0; i < SEA_ZONES.length; i++) {
    const Z = SEA_ZONES[i];
    const k = zoneStrength(Z, Math.hypot(x - ZONE_AT[i * 2], z - ZONE_AT[i * 2 + 1]));
    if (k <= 0) continue;
    wave *= 1 + (Z.wave - 1) * k;
    swell *= 1 + (Z.swell - 1) * k;
  }
  out[0] = wave; out[1] = swell;
  return out;
}

/**
 * The sea at a point: `shallow` (how much of the clear shallows, 0-1), `rough` (how much
 * of a rough zone, 0-1) and its `severity`, the `zone` you are in (an id from SEA_ZONES,
 * or null in plain sea), and the `wave` and `swell` factors the waves use there.
 */
export function seaAt(x, z, out = {}) {
  let shallow = 0, rough = 0, severity = 0, zone = null, top = 0, wave = 1, swell = 1;
  for (let i = 0; i < SEA_ZONES.length; i++) {
    const Z = SEA_ZONES[i];
    const k = zoneStrength(Z, Math.hypot(x - ZONE_AT[i * 2], z - ZONE_AT[i * 2 + 1]));
    if (k <= 0) continue;
    wave *= 1 + (Z.wave - 1) * k;
    swell *= 1 + (Z.swell - 1) * k;
    if (Z.shallow) shallow = Math.max(shallow, k * Z.shallow);
    if (Z.severity && k > rough) { rough = k; severity = Z.severity; }
    if (k > top) { top = k; zone = Z.id; }
  }
  out.shallow = shallow; out.rough = rough; out.severity = severity;
  out.zone = top >= 0.5 ? zone : null;
  out.wave = wave; out.swell = swell;
  return out;
}

/** 'home', 'coastal' or 'open': home waters reach to the middle of their fade. */
export function bandAt(x, z) {
  const d = Math.hypot(x, z);
  if (zoneStrength(SEA_ZONES[0], d) >= 0.5) return 'home';
  return d >= OPEN_SEA ? 'open' : 'coastal';
}

/**
 * The next weather, from a list of choices (a weather may be listed twice to make it
 * likelier), weighted by the band the boat is in. `rnd` is a random number in 0-1.
 */
export function pickByBand(options, band, rnd) {
  const B = BANDS[band] || BANDS.coastal;
  const weight = (type) => B[type] ?? 1;
  let total = 0;
  for (const o of options) total += weight(o);
  if (!(total > 0)) return options[0];
  let at = rnd * total;
  for (const o of options) {
    at -= weight(o);
    if (at < 0) return o;
  }
  return options[options.length - 1];
}

// ---- the same table for the shaders
const f = (v) => v.toFixed(6);
const strengthGlsl = (Z) => (Z.inner > 0 ? `smoothstep(${f(Z.inner - Z.fade)}, ${f(Z.inner)}, d) * ` : '')
  + `(1.0 - smoothstep(${f(Z.outer)}, ${f(Z.outer + Z.fade)}, d))`;

// Include once in any shader that asks for the waves (waves.js does, in WAVE_GLSL).
// A point `p` is in the space being drawn; uSeaOrigin is where that space's origin lies
// in the world (ashore, a level is drawn round its own island).
export const SEA_ZONE_GLSL = /* glsl */ `
uniform vec2 uSeaOrigin;
uniform vec2 uSeaZone[${SEA_ZONES.length}];
// What the wave scale (x) and the swell (y) are multiplied by at p.
vec2 seaWaveK(vec2 p) {
  vec2 w = p + uSeaOrigin; vec2 k = vec2(1.0); float d;
${SEA_ZONES.map((Z, i) => `  d = distance(w, uSeaZone[${i}]); k *= mix(vec2(1.0), vec2(${f(Z.wave)}, ${f(Z.swell)}), ${strengthGlsl(Z)}); // ${Z.id}`).join('\n')}
  return k;
}
// How much of the clear shallows there is at p.
float seaShallowK(vec2 p) {
  vec2 w = p + uSeaOrigin; float s = 0.0; float d;
${SEA_ZONES.map((Z, i) => (Z.shallow ? `  d = distance(w, uSeaZone[${i}]); s = max(s, ${f(Z.shallow)} * ${strengthGlsl(Z)}); // ${Z.id}` : '')).filter(Boolean).join('\n')}
  return s;
}
`;
