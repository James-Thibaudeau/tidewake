// Rough water's two hazards, as rules (docs/feature-plan.md, Phase 9.3): rogue waves and
// ice growlers. rough-water.js runs them in the game; this file only says when a wave
// comes, where from, when it strikes and what it costs, and where the ice lies.
// Pure: no three.js and no DOM, so tools/check.mjs can run it in Node. Nothing here
// draws from the world's rng(): the caller hands in a random stream of its own, and the
// ice is placed by hashing.
//
// A rogue wave is one tall ridge (its shape is rogueShape in waves.js, which adds it to
// the sea). It is launched off the bow, to one side, so that its crest reaches where the
// boat will be a few seconds on: time to see it, reef, and turn the bow into it.
//   W = { x, z      the middle of its crest, on the map
//         dx, dz    the way it runs (a unit vector)
//         full      its full height in metres; h is its height now
//         size      1 for the Reach's, less in gentler zones (ROGUE.size)
//         side      which way it comes from, as a key for the words (bearingKey)
//         t         seconds since it was launched
//         passed    false until its crest has gone by the boat; then the seconds since
//         hitK      how squarely it caught the boat (1 = under the full crest; less if it
//                   had not finished rising, or the boat was out near its end)
//         done      true once it has run out }
// What a strike costs is a share of the hull's full strength, so it weighs as much on
// the best ship as on the first: by how squarely it was met (the end of the boat or the
// side of it), how much sail was up, and the keel.
import { ROGUE, ROUGH, GROWLERS } from './config.js';
import { hash2, lerp, smoothstep, TAU } from './util.js';
import { rogueShape } from './waves.js';
import { seaAt } from './sea-zones.js';

/**
 * Seconds until the next rogue wave where the zone is at its worst (the clock is run at
 * the zone's strength, so they are rarer in its fades). `first`: the one that meets you
 * on the way in, which comes sooner (ROGUE.first is the roughest zone's; a gentler zone's
 * is as much longer as its waves are rarer). Returns Infinity where there are none.
 */
export function rogueGap(severity, rng, first = false) {
  const E = ROGUE.every[severity];
  if (!E) return Infinity;
  const slower = E[0] / ROGUE.every[ROGUE.every.length - 1][0];
  const [lo, hi] = first ? [ROGUE.first[0] * slower, ROGUE.first[1] * slower] : E;
  return lo + rng() * (hi - lo);
}

/** Which way something lies, `rel` radians off the bow (positive = to starboard): a key for the words. */
export function bearingKey(rel) {
  const a = Math.abs(rel), side = rel < 0 ? 'port' : 'starboard';
  if (a < 0.3) return 'ahead';
  if (a > 2.8) return 'astern';
  return side + (a < 1.1 ? 'Bow' : a < 2.0 ? 'Beam' : 'Quarter');
}

/** How fast a wave runs: its own pace, or enough to catch a boat that is running before it. */
const pace = (W, boat) => Math.max(ROGUE.speed, (boat.vx || 0) * W.dx + (boat.vz || 0) * W.dz + ROGUE.close);

/**
 * Launch a wave at a boat: { x, z, heading, vx, vz }. It comes from `rel` radians off
 * the bow (positive = starboard; picked from ROGUE.off on either side if not given), and
 * is placed so its crest reaches where the boat will be ROGUE.warn seconds from now.
 */
export function launchRogue(boat, rng, severity = 3, rel = null) {
  if (rel == null) rel = (rng() < 0.5 ? -1 : 1) * lerp(ROGUE.off[0], ROGUE.off[1], rng());
  const fx = Math.sin(boat.heading), fz = Math.cos(boat.heading);
  // towards where it comes from: the bow turned `rel` to starboard, which is (-fz, fx)
  const sx = fx * Math.cos(rel) - fz * Math.sin(rel), sz = fz * Math.cos(rel) + fx * Math.sin(rel);
  const size = ROGUE.size[severity] || 1;
  const W = { x: 0, z: 0, dx: -sx, dz: -sz, full: ROGUE.height * size, h: 0, size, rel, side: bearingKey(rel), t: 0, passed: false, hitK: 0, done: false };
  const T = ROGUE.warn, run = pace(W, boat) * T;
  W.x = boat.x + (boat.vx || 0) * T - W.dx * run;
  W.z = boat.z + (boat.vz || 0) * T - W.dz * run;
  return W;
}

/**
 * Carry a wave on by `dt` seconds. Returns true in the one step its crest passes the
 * boat with the boat under it (W.hitK says how squarely); a crest that passes clear of
 * the boat, off either end, is a miss and returns false like any other step.
 */
export function stepRogue(W, dt, boat) {
  if (W.done) return false;
  const c = pace(W, boat);
  W.x += W.dx * c * dt; W.z += W.dz * c * dt;
  W.t += dt;
  let struck = false;
  if (W.passed === false) {
    let qx = boat.x - W.x, qz = boat.z - W.z;
    // the crest keeps its middle on the boat: the ridge slides along its own length
    const slide = (qz * W.dx - qx * W.dz) * (1 - Math.exp(-ROGUE.follow * dt));
    W.x -= W.dz * slide; W.z += W.dx * slide;
    qx = boat.x - W.x; qz = boat.z - W.z;
    const ahead = qx * W.dx + qz * W.dz; // how far the boat still is in front of the crest
    W.h = W.full * smoothstep(0, ROGUE.rise, W.t);
    if (ahead <= 0) {
      W.passed = 0;
      W.hitK = rogueShape(0, qz * W.dx - qx * W.dz) * (W.h / W.full);
      struck = W.hitK > 0.05;
    } else if (W.t > ROGUE.warn * 5) W.passed = 0; // it never came up with the boat: let it go
  } else {
    W.passed += dt;
    W.h = W.full * (1 - smoothstep(0, ROGUE.fade, W.passed));
    if (W.passed >= ROGUE.fade) { W.done = true; W.h = 0; }
  }
  return struck;
}

/**
 * What a strike costs. `heading` is the boat's, `sailLevel` 0-2, `keel` its resistance
 * (0-1; half of it counts, as for the battering).
 *   share   of the hull's full strength (multiply by the hull for hull points)
 *   side    0 = met with the bow or the stern, 1 = taken on the side
 *   from    +1 if it came from port (it throws the boat to starboard), -1 from starboard
 *   shove   m/s the boat is thrown, the way the wave runs
 */
export function rogueToll(W, heading, sailLevel, keel) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const along = fx * W.dx + fz * W.dz;          // -1 sailing straight into it, +1 running straight before it
  const across = W.dx * -fz + W.dz * fx;        // how much of its run is to starboard
  const side = smoothstep(ROGUE.bowOn[0], ROGUE.bowOn[1], Math.abs(across));
  const angle = lerp(along > 0 ? ROGUE.stern : 1, ROGUE.beam, side);
  const sail = ROGUE.sail[sailLevel] ?? 1, k = W.size * W.hitK;
  return {
    share: ROGUE.share * k * angle * sail * (1 - keel * ROUGH.keel),
    side, angle, from: across >= 0 ? 1 : -1,
    shove: ROGUE.shove * k * side * (sail / ROGUE.sail[2]),
  };
}

// ---------------------------------------------------------------- ice growlers
const SEED = 9311;
const cells = new Map(); // what each square of sea holds, worked out once: a growler's numbers, or null
const sea = {};

/** The growler in square (i, j) of the sea, or null: { id, x, z (its place), r, drift, w, w2, p, p2, turn }. */
export function growlerIn(i, j) {
  const id = i * 4096 + j;
  let G = cells.get(id);
  if (G !== undefined) return G;
  G = null;
  const C = GROWLERS.cell, h = (n) => hash2(i, j, SEED + n);
  const x = (i + 0.2 + h(1) * 0.6) * C, z = (j + 0.2 + h(2) * 0.6) * C;
  seaAt(x, z, sea);
  if (sea.roughZone === GROWLERS.zone && h(0) < GROWLERS.chance * smoothstep(GROWLERS.from, GROWLERS.from + 0.3, sea.rough)) {
    const w = TAU / lerp(GROWLERS.period[0], GROWLERS.period[1], h(4));
    G = { id, x, z, r: lerp(GROWLERS.r[0], GROWLERS.r[1], h(3) * h(3)), drift: GROWLERS.drift * (0.5 + 0.5 * h(5)),
      w: w * (h(6) < 0.5 ? -1 : 1), w2: w * 0.63, p: h(7) * TAU, p2: h(8) * TAU, turn: h(9) * TAU };
  }
  cells.set(id, G);
  return G;
}

/** Where a growler is at time `t` (seconds): it wanders round its place. Writes out.x and out.z. */
export function growlerAt(G, t, out = {}) {
  out.x = G.x + Math.cos(t * G.w + G.p) * G.drift;
  out.z = G.z + Math.sin(t * G.w2 + G.p2) * G.drift;
  return out;
}

/** Every growler whose place is within `range` metres of (x, z), in no particular order. */
export function growlersNear(x, z, range = GROWLERS.see, out = []) {
  out.length = 0;
  const C = GROWLERS.cell, r2 = range * range;
  for (let i = Math.floor((x - range) / C); i <= Math.floor((x + range) / C); i++) {
    for (let j = Math.floor((z - range) / C); j <= Math.floor((z + range) / C); j++) {
      const G = growlerIn(i, j);
      if (G && (G.x - x) ** 2 + (G.z - z) ** 2 < r2) out.push(G);
    }
  }
  return out;
}
