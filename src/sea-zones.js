// Sea zones: how the sea changes with where you are (docs/feature-plan.md, Phase 9).
//
// Two things, both measured in world metres with Port Haven at (0, 0):
//   bands   home waters, the coastal sea and the open sea, by distance from Port Haven.
//           A band only changes the weather's odds (weather.js picks by BANDS); the open
//           sea is also drawn a shade darker (openSea).
//   zones   patches of sea with waves of their own (SEA_ZONES). Home waters are clear,
//           shallow and half as rough. Rough water is the opposite: a ring round each of
//           the two hardest landmarks to reach, and a band along the world's edge, where
//           the swell runs high under any sky (the least it can be is ROUGH.floor).
//
// The waves ask here on the CPU (waveFactors, from waves.js) and on the GPU
// (SEA_ZONE_GLSL, written out from the same table), so the boat sits on the water
// everywhere. Pure: no three.js and no DOM, so tools/check.mjs can run it in Node.
// Nothing here draws from the world's rng(): the world is as it was.
// The zones' names are writing, so they are in story-text.js (SEAS), by id.
import { smoothstep } from './util.js';
import { ROUGH, WORLD_HALF } from './config.js';

// Each zone fills a ring round its centre (x, z): full strength from `inner` to `outer`
// metres out (inner 0 = a disc), fading to nothing over `fade` metres beyond the outer
// edge and over `fadeIn` (or `fade`) inside the inner one. Fades are wide (200 m or more)
// so a boat's motion never jumps and the water shows no seam.
//   wave, swell   what the weather's wave scale and swell are multiplied by at full strength
//   shallow       1 = the clear shallows are drawn here (ocean.js)
//   severity      rough water, 1-3: sets the swell's floor and the battering (ROUGH in config.js)
//   landmark      the ring is centred on the island with this `landmark` key. The x and z
//                 here are where world.js puts it; placeSeaZones() reads them from the
//                 world itself once it is built, and tools/check.mjs holds the two together
//   edge          not a ring but a band along the world's edge: its distance is to the
//                 world's centre along the further axis, so `inner` is where the band is
//                 full. An edge band gives way inside the calm pocket of a ring listed
//                 before it, so edge rows go last
// A rough ring's hole is its calm pocket: it holds the whole island and the water you
// land from. The Reach is worst 900 m out and rough from 600 m to 1,500 m; the Rip from
// 600 m to 1,200 m. The Outer Swell fills in over the 200 m before `inner` and is full
// for the last 300 m before the edge's current (boat.js), and on through it: it starts
// 100 m further out than first planned, to stay clear of Windrest.
export const SEA_ZONES = [
  { id: 'home', x: 0, z: 0, inner: 0, outer: 1000, fade: 400, wave: 0.5, swell: 0.5, shallow: 1, severity: 0 },
  { id: 'reach', landmark: 'frost', x: -900, z: -6000, inner: 850, fadeIn: 250, outer: 950, fade: 550, wave: 1.25, swell: 1, severity: 3 },
  { id: 'rip', landmark: 'volcano', x: 5200, z: 2600, inner: 850, fadeIn: 250, outer: 950, fade: 250, wave: 1.5, swell: 1, severity: 2 },
  { id: 'swell', edge: true, x: 0, z: 0, inner: WORLD_HALF - 550, fadeIn: 200, outer: WORLD_HALF + 200, fade: 200, wave: 1, swell: 1, severity: 1 },
];

// The open sea starts this far from Port Haven. Every landmark lies beyond it.
export const OPEN_SEA = 3500;
// The open sea is drawn a shade darker, coming on over this many metres either side of
// where it starts. It ends past the world's far corner: nothing lies beyond the edge
// (the gallery's plain sea is out there, and stays plain).
const OPEN_FADE = 400, OPEN_END = Math.ceil((WORLD_HALF * Math.SQRT2) / 500) * 500 + 500;

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

/**
 * Centre each landmark's zone on the island itself, once the world is built: `islands`
 * is the world's list. A zone whose landmark isn't there stays where the table has it.
 */
export function placeSeaZones(islands) {
  SEA_ZONES.forEach((Z, i) => {
    const I = Z.landmark && islands.find((x) => x.landmark === Z.landmark);
    if (!I) return;
    Z.x = I.x; Z.z = I.z;
    ZONE_AT[i * 2] = I.x; ZONE_AT[i * 2 + 1] = I.z;
  });
}

const fadeIn = (Z) => Z.fadeIn ?? Z.fade;
const hasPocket = (Z) => !!Z.severity && Z.inner > 0 && !Z.edge;

/** How far (x, z) is from zone `i`, the way that zone measures it. */
export function zoneDistance(i, x, z) {
  const dx = x - ZONE_AT[i * 2], dz = z - ZONE_AT[i * 2 + 1];
  return SEA_ZONES[i].edge ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
}

/** How strongly a zone holds `d` metres from its centre: 1 inside its ring, 0 past the fades. */
export function zoneStrength(Z, d) {
  const out = 1 - smoothstep(Z.outer, Z.outer + Z.fade, d);
  return Z.inner > 0 ? out * smoothstep(Z.inner - fadeIn(Z), Z.inner, d) : out;
}

/**
 * What the wave scale and the swell are multiplied by at a point, into out[0] and
 * out[1], and the least the swell is there whatever the weather, into out[2].
 * This is the one the waves call for every sample, so it makes nothing new.
 */
export function waveFactors(x, z, out) {
  let wave = 1, swell = 1, floor = 0, calm = 1;
  for (let i = 0; i < SEA_ZONES.length; i++) {
    const Z = SEA_ZONES[i], d = zoneDistance(i, x, z);
    let k = zoneStrength(Z, d);
    if (Z.edge) k *= calm;
    else if (hasPocket(Z) && d < Z.inner) calm *= smoothstep(Z.inner - fadeIn(Z), Z.inner, d);
    if (k <= 0) continue;
    wave *= 1 + (Z.wave - 1) * k;
    swell *= 1 + (Z.swell - 1) * k;
    if (Z.severity) floor = Math.max(floor, ROUGH.floor[Z.severity] * k);
  }
  out[0] = wave; out[1] = swell; out[2] = floor;
  return out;
}

/** How much of the open sea's darker water there is `d` metres from Port Haven (0-1). */
export function openSea(d) {
  return smoothstep(OPEN_SEA - OPEN_FADE, OPEN_SEA + OPEN_FADE, d) * (1 - smoothstep(OPEN_END, OPEN_END + OPEN_FADE, d));
}

/**
 * The sea at a point:
 *   shallow    how much of the clear shallows (0-1)
 *   rough      how far into rough water you are (0-1), its `severity` (1-3) and which
 *              zone that is (`roughZone`, an id); where two overlap, the one with the
 *              heavier swell
 *   zone       the zone you are in (an id from SEA_ZONES), or null in plain sea
 *   wave, swell   the factors the waves use there, and `floor`, the least the swell is
 *   open       how much of the open sea's darker water (0-1)
 */
export function seaAt(x, z, out = {}) {
  let shallow = 0, rough = 0, severity = 0, roughZone = null, zone = null, top = 0, wave = 1, swell = 1, floor = 0, calm = 1;
  for (let i = 0; i < SEA_ZONES.length; i++) {
    const Z = SEA_ZONES[i], d = zoneDistance(i, x, z);
    let k = zoneStrength(Z, d);
    if (Z.edge) k *= calm;
    else if (hasPocket(Z) && d < Z.inner) calm *= smoothstep(Z.inner - fadeIn(Z), Z.inner, d);
    if (k <= 0) continue;
    wave *= 1 + (Z.wave - 1) * k;
    swell *= 1 + (Z.swell - 1) * k;
    if (Z.shallow) shallow = Math.max(shallow, k * Z.shallow);
    if (Z.severity && ROUGH.floor[Z.severity] * k > floor) { floor = ROUGH.floor[Z.severity] * k; rough = k; severity = Z.severity; roughZone = Z.id; }
    if (k > top) { top = k; zone = Z.id; }
  }
  out.shallow = shallow; out.rough = rough; out.severity = severity; out.roughZone = roughZone;
  out.zone = top >= 0.5 ? zone : null;
  out.wave = wave; out.swell = swell; out.floor = floor;
  out.open = openSea(Math.hypot(x, z));
  return out;
}

/** The swell at a place, given the weather's: the zone's share of it, or its floor if that is more. */
export const swellAt = (sea, weatherSwell) => Math.max(weatherSwell * sea.swell, sea.floor);

/**
 * Hull points a second that rough water takes: `sea` from seaAt, `sailLevel` 0-2 (less
 * with the sails reefed), `keel` the keel's resistance (0-1), of which only part counts.
 */
export function roughDamage(sea, sailLevel, keel) {
  if (!sea.severity) return 0;
  return ROUGH.batter[sea.severity] * sea.rough * ROUGH.sail[sailLevel] * (1 - keel * ROUGH.keel);
}

const goldSea = {};
/**
 * What sunken treasure or salvage lying at (x, z) is worth, against the same find in
 * plain sea: 1 there, rising to ROUGH.gold in the worst of a rough zone.
 */
export function goldBonus(x, z) {
  return 1 + (ROUGH.gold - 1) * seaAt(x, z, goldSea).rough;
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

// ---- the same table for the shaders: one line a zone, in the table's order
const f = (v) => v.toFixed(6);
const inGlsl = (Z) => `smoothstep(${f(Z.inner - fadeIn(Z))}, ${f(Z.inner)}, d)`;
function zoneGlsl(Z, i) {
  const d = Z.edge ? `max(abs(w.x - uSeaZone[${i}].x), abs(w.y - uSeaZone[${i}].y))` : `distance(w, uSeaZone[${i}])`;
  let line = `  d = ${d}; s = ${Z.inner > 0 ? inGlsl(Z) + ' * ' : ''}(1.0 - smoothstep(${f(Z.outer)}, ${f(Z.outer + Z.fade)}, d))${Z.edge ? ' * calm' : ''};`;
  if (Z.wave !== 1 || Z.swell !== 1) line += ` k.xy *= mix(vec2(1.0), vec2(${f(Z.wave)}, ${f(Z.swell)}), s);`;
  if (Z.shallow) line += ` look.x = max(look.x, ${f(Z.shallow)} * s);`;
  if (Z.severity) line += ` k.z = max(k.z, ${f(ROUGH.floor[Z.severity])} * s); look.y = max(look.y, ${f(Z.severity / 3)} * s);`;
  if (hasPocket(Z)) line += ` calm *= ${inGlsl(Z)};`;
  return `${line} // ${Z.id}`;
}

// Include once in any shader that asks for the waves (waves.js does, in WAVE_GLSL).
// A point `p` is in the space being drawn; uSeaOrigin is where that space's origin lies
// in the world (ashore, a level is drawn round its own island). uSeaFloor is how much of
// the swell's floor is let through (waves.js, updateWaves: less ashore).
export const SEA_ZONE_GLSL = /* glsl */ `
uniform vec2 uSeaOrigin;
uniform vec2 uSeaZone[${SEA_ZONES.length}];
uniform float uSeaFloor;
// The sea at p. k: what the wave scale (x) and the swell (y) are multiplied by, and the
// least the swell is (z). look: how much to draw of the clear shallows (x), of rough
// water (y: 1 at the worst of the roughest zone) and of the open sea's darker water (z).
void seaZones(vec2 p, out vec3 k, out vec3 look) {
  vec2 w = p + uSeaOrigin; float d; float s; float calm = 1.0;
  k = vec3(1.0, 1.0, 0.0); look = vec3(0.0);
${SEA_ZONES.map(zoneGlsl).join('\n')}
  k.z *= uSeaFloor;
  d = length(w); look.z = smoothstep(${f(OPEN_SEA - OPEN_FADE)}, ${f(OPEN_SEA + OPEN_FADE)}, d) * (1.0 - smoothstep(${f(OPEN_END)}, ${f(OPEN_END + OPEN_FADE)}, d));
}
vec3 seaWaveK(vec2 p) { vec3 k; vec3 look; seaZones(p, k, look); return k; }
`;
