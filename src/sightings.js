// The living sea's rules (Phase 7): which events can turn up where, how one is
// picked and placed, what counts as seeing it, and the Sightings log. The
// director that runs them is sea-events.js; the things themselves are
// sea-life.js (animals), sea-wonders.js (weather, ice, the bloom, the bottle)
// and ghost-ship.js. This file imports no three.js and touches no DOM, so
// tools/check.mjs can run it in Node.
//
// state.sightings = {
//   seen: { [kind]: { n, day, near } },   how often, and when and where first
//                                         (the bottle's entry also counts those `opened`, and the `notes` read)
//   miss: { [kind]: n },                  rolls a kind could have won but didn't (the pity timer)
//   chain: null | { stage, island? },     the ghost ship's side chain (ghost-chain.js)
// }
import { WORLD_HALF } from './config.js';
import { TAU, clamp } from './util.js';

// What the director can roll. `rare` kinds get the stronger pity timer;
// `place` changes where one appears (see placeEvent); `near` is how close
// counts as seeing it, where that isn't NEAR.
export const EVENTS = {
  whale: { place: { min: 180, max: 320, clear: 80 } },            // she is 30 m long and needs sea room
  dolphins: {},
  turtles: {},
  bottle: { place: { min: 90, max: 170, clear: 30 } },           // small: it has to be close to be noticed at all
  bloom: { place: { min: 150, max: 210, clear: 40 }, near: 150 }, // a patch 170 m across the middle: you sail into it
  iceberg: { place: { min: 170, max: 300, clear: 90 } },
  waterspout: { place: { min: 190, max: 320, clear: 70 } },
  ghostShip: { rare: true },
};
// The Sightings tab's cards, in order (the crabs are seen at Archway Isle, reports.js).
export const LOG = ['whale', 'dolphins', 'turtles', 'bottle', 'bloom', 'iceberg', 'waterspout', 'ghostShip', 'archCrabs'];
// Who ashore wants to hear about each kind: a giver role from quests.js.
export const HEARS = { whale: 'chart', turtles: 'chart', dolphins: 'deliver', ghostShip: 'salvage', iceberg: 'retrieve', waterspout: 'retrieve',
  bloom: 'report', archCrabs: 'report', bottle: 'retrieve' };
// Kinds a quest board can ask for ("Sighting wanted"): the ones you can go looking for.
export const BOUNTY_KINDS = ['whale', 'dolphins', 'turtles', 'iceberg', 'bloom', 'ghostShip'];
const BOUNTY_BOOST = 4; // how much likelier a wanted kind is inside its search circle
// Seeing a kind this often earns a piece for the wardrobe.
export const MILESTONES = {
  whale: { n: 5, cosmetic: 'neck:whaleTail' },
  ghostShip: { n: 3, cosmetic: 'hat:lantern' },
};

export const NEAR = 80;                               // this close counts as seeing it
export const SPY_RANGE = [0, 340, 440, 560, 700, 850]; // …or held in the spyglass for SPY_HOLD seconds, by spyglass tier
export const SPY_HOLD = 2;
const PITY = 0.15, PITY_RARE = 0.5; // weight gained per missed roll
const SURE = 8;                     // a rare kind missed this often is picked outright

/** The sea's regions by latitude, the way world.js picks biomes: cold in the north, tropical in the south. */
export function regionAt(z) {
  const lat = -z / WORLD_HALF;
  return lat > 0.55 ? 'cold' : lat < -0.45 ? 'tropical' : 'temperate';
}

/**
 * How likely each kind is here and now (0 = can't happen).
 * ctx: { z, night (0-1), weather ('clear' | 'breezy' | 'cloudy' | 'rain' | 'storm' | 'fog'), chapter (the main story's),
 *   sea (optional: the sea zones' reading here, from seaAt in sea-zones.js: { shallow, rough }) }
 */
export function eventWeights(ctx) {
  const region = regionAt(ctx.z), w = ctx.weather, night = ctx.night > 0.6, day = ctx.night < 0.3;
  // the clear shallows of home waters, and how far into rough water this is (0-1 each)
  const home = (ctx.sea?.shallow || 0) > 0.5, rough = ctx.sea?.rough || 0;
  return {
    // whales keep to cool water, and stay down in a storm
    whale: w === 'storm' ? 0 : { cold: 1.4, temperate: 1, tropical: 0 }[region],
    // dolphins like warm water and fine weather
    dolphins: w === 'clear' || w === 'breezy' ? { cold: 0, temperate: 1, tropical: 1.3 }[region] : 0,
    // turtles: tropical water, or the clear shallows of home, where they show best; by day, and not in rain or a storm
    turtles: (region === 'tropical' || home) && day && w !== 'rain' && w !== 'storm' ? (home ? 1.5 : 1) : 0,
    // a bottle can wash up anywhere, now and then, but you'd never spot one in a storm
    bottle: w === 'storm' ? 0 : 0.35,
    // the glowing bloom: warm water, at night, and twice as likely over the home shallows
    bloom: night && w !== 'storm' ? { cold: 0, temperate: 0.5, tropical: 1 }[region] * (home ? 2 : 1) : 0,
    // icebergs calve in the cold north, in any weather
    iceberg: region === 'cold' ? 1.2 : 0,
    // waterspouts come with storms, and little else does; a storm over rough water breeds them twice as fast
    waterspout: w === 'storm' ? 3 * (1 + rough) : 0,
    // the ghost ship: any water, only at night, likelier in fog, and not before the first journal
    ghostShip: night && (ctx.chapter || 0) >= 2 ? (w === 'fog' ? 0.9 : 0.3) : 0,
  };
}

/** Can this kind ever turn up at this latitude, given the right hour and weather? */
export function canHappenAt(kind, z) {
  for (const night of [0, 1]) for (const weather of ['clear', 'fog', 'storm']) if (eventWeights({ z, night, weather, chapter: 9 })[kind] > 0) return true;
  return false;
}

/**
 * Sightings a board has asked for make their kind likelier inside their
 * search circle (never where or when it couldn't happen at all). `weights`
 * is changed in place; bounties: [{ kind, x, z, r }]. Returns true if the
 * boat at (x, z) is inside one, so the director can look harder.
 */
export function applyBounties(weights, bounties, x, z) {
  let inside = false;
  for (const b of bounties) {
    if (Math.hypot(b.x - x, b.z - z) > b.r) continue;
    inside = true;
    if (weights[b.kind] > 0) weights[b.kind] *= BOUNTY_BOOST;
  }
  return inside;
}

/**
 * Pick a kind by weight. A kind that could have been picked and wasn't gains
 * weight for next time (`miss` is updated in place), so the rare ones turn up
 * for everybody in the end. Returns null when nothing can happen here.
 */
export function pickKind(rng, weights, miss = {}) {
  const kinds = Object.keys(EVENTS).filter((k) => weights[k] > 0);
  if (!kinds.length) return null;
  const w = kinds.map((k) => weights[k] * (1 + (miss[k] || 0) * (EVENTS[k].rare ? PITY_RARE : PITY)));
  let pick = kinds.find((k) => EVENTS[k].rare && (miss[k] || 0) >= SURE) || null;
  if (!pick) {
    let roll = rng() * w.reduce((a, b) => a + b, 0);
    pick = kinds[kinds.length - 1];
    for (let i = 0; i < kinds.length; i++) { roll -= w[i]; if (roll < 0) { pick = kinds[i]; break; } }
  }
  for (const k of kinds) miss[k] = k === pick ? 0 : (miss[k] || 0) + 1;
  return pick;
}

/** Seconds of sailing until the next roll: three to six minutes. */
export const nextRoll = (rng) => 180 + rng() * 180;

/**
 * Is there open, deep water for `clear` metres round (x, z)?
 * sea: { heightAt(x, z), rockHit(x, z, r), islands? } (the World)
 */
export function openWater(sea, x, z, clear = 60) {
  const lim = WORLD_HALF - 350;
  if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
  if (sea.heightAt(x, z) > -8 || sea.rockHit(x, z, clear)) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    if (sea.heightAt(x + Math.cos(a) * clear, z + Math.sin(a) * clear) > -8) return false;
  }
  for (const I of sea.islands || []) if (Math.hypot(I.x - x, I.z - z) < (I.bound || I.r || 0) + clear * 0.5) return false;
  return true;
}

/** Open water all the way from a to b (sampled every 30 m). */
export function clearPath(sea, a, b, clear = 40) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 30));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!openWater(sea, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, clear)) return false;
  }
  return true;
}

/**
 * Where an event appears: 150-300 m off, on the bow quarter (so it's seen but
 * not in your path), in open water. boat: { x, z, heading }, with forward =
 * (sin h, cos h). Returns { x, z, side (+1 right, -1 left), dist }, or null if
 * there's no room here.
 */
export function placeEvent(rng, sea, boat, { min = 150, max = 300, clear = 60, tries = 24 } = {}) {
  for (let t = 0; t < tries; t++) {
    const side = rng() < 0.5 ? -1 : 1;
    // 20-60° off the bow; the last few tries look further round
    const off = (0.35 + rng() * 0.7) * (t < tries - 6 ? 1 : 1.8);
    const a = boat.heading - side * off, dist = min + rng() * (max - min);
    const x = boat.x + Math.sin(a) * dist, z = boat.z + Math.cos(a) * dist;
    if (openWater(sea, x, z, clear)) return { x, z, side, dist };
  }
  return null;
}

/**
 * A heading out of `from` with `len` metres of open water ahead, as near to
 * `prefer` as there is. Returns the heading, or null.
 */
export function clearHeading(sea, from, len, prefer, clear = 40) {
  for (let k = 0; k < 16; k++) {
    const h = prefer + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (TAU / 16);
    if (clearPath(sea, from, { x: from.x + Math.sin(h) * len, z: from.z + Math.cos(h) * len }, clear)) return h;
  }
  return null;
}

/**
 * Write one sighting into the log (`seen`, updated in place). info: { day, near }.
 * Returns { n, first, milestone } where milestone is set when this sighting earns it.
 */
export function recordSighting(seen, kind, info = {}) {
  const first = !seen[kind];
  const s = seen[kind] ||= { n: 0, day: info.day || 1, near: info.near || '' };
  s.n = clamp((s.n || 0) + 1, 1, 9999);
  const M = MILESTONES[kind];
  return { n: s.n, first, milestone: M && s.n === M.n ? M : null };
}
