// A test pilot for rough water: `tidewake.debug.cross()` (debug.js). It sails the real
// boat through the real game, one crossing of a rough zone from outside to its calm
// pocket, straight through the worst of it, and says what that cost the hull. The damage
// targets in docs/feature-plan.md (Phase 9) are tuned with it.
//
// It is sailed one of two ways:
//   well    reefed; when a rogue wave is called it turns the bow into it, then back on course
//   badly   full sail; it turns side-on to each wave
// Either way it steers round the ice (clear weather: it can see it) and counts what it hits.
// The weather is held clear with the wind on the beam, and the waves' random stream is
// seeded, so the same call gives the same crossing.
import { SEA_ZONES } from './sea-zones.js';
import { clamp, mulberry32, wrapAngle } from './util.js';
import { growlersNear, growlerAt } from './rogue.js';

const DT = 1 / 60;

/** Bearings (radians, from the zone's centre) from which a straight run in is over open water inside the world. */
export function openSides(game, Z, n = 16) {
  const out = [], far = Z.outer + Z.fade + 60;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
    let ok = true;
    for (let d = Z.inner - (Z.fadeIn ?? Z.fade) - 40; ok && d <= far; d += 20) {
      const x = Z.x + ux * d, z = Z.z + uz * d;
      for (const s of [-70, 0, 70]) if (game.world.heightAt(x - uz * s, z + ux * s) > -6 || Math.abs(x) > 6600 || Math.abs(z) > 6600) ok = false;
    }
    if (ok) out.push(a);
  }
  return out;
}

/**
 * One crossing. opts: zone ('reach'), from (a bearing from the zone's centre, radians;
 * default: the first open side), badly (false), seed (1), waves (true: false holds the
 * rogue waves off, to see what the rest costs), max (seconds before giving up, 600).
 * Returns the share of the hull lost and where it went.
 */
export function crossing(game, opts = {}) {
  const g = game, b = g.boat, R = g.rough;
  const Z = SEA_ZONES.find((r) => r.id === (opts.zone || 'reach'));
  if (!Z || Z.edge || !Z.severity) throw new Error('cross() needs a rough zone that is a ring: reach or rip');
  const from = opts.from ?? openSides(g, Z)[0];
  if (from == null) throw new Error('No open side to come in from.');
  const badly = !!opts.badly, level = badly ? 2 : 1;
  const ux = Math.sin(from), uz = Math.cos(from), start = Z.outer + Z.fade + 50, end = Z.inner - (Z.fadeIn ?? Z.fade);
  const course = Math.atan2(-ux, -uz);

  // a fresh hull, a clear sky that stays, the wind on the beam, and nothing else out there
  if (g.paused) g.setPaused(false);
  g.mode = 'sailing';
  b.place(Z.x + ux * start, Z.z + uz * start, course);
  g.streamer.buildAll(b.pos.x, b.pos.z);
  g.state.health = b.maxHealth;
  g.weather.set('clear', true);
  g.state.dayT = 0.5;
  if (g.seaEvents) { g.seaEvents.clear(); g.seaEvents.timer = 1e9; }
  R.clear(); R.away = 0;
  R.rng = mulberry32(opts.seed ?? 1);
  R.count = { waves: 0, struck: 0, ice: 0 };
  b.sailLevel = level; b.sailVis = [0.06, 0.55, 1][level];

  const lost = { rough: 0, storm: 0, wave: 0, ice: 0, other: 0 };
  const realDamage = g.damage, realWreck = g.wreck, tiller = g.input.tiller, day = g.state.dayT;
  let wrecked = false, struck = 0, t = 0, metres = 0, off = 0;
  g.wreck = () => { wrecked = true; g.state.health = 0; };
  g.damage = (amount, kind) => {
    const before = g.state.health;
    realDamage.call(g, amount, kind);
    const took = before - g.state.health;
    if (R.count.struck > struck) { struck = R.count.struck; lost.wave += took; }
    else lost[kind in lost ? kind : 'other'] += took;
  };
  const ice = [], P = {};
  try {
    while (!wrecked && t < (opts.max || 600)) {
      const dx = Z.x - b.pos.x, dz = Z.z - b.pos.z, left = Math.hypot(dx, dz);
      if (left <= end) break;
      // hold the conditions
      g.weather.timer = 1e6; g.weather.windAngle = course + Math.PI / 2; g.weather.windDrift = 0;
      g.state.dayT = day;
      if (opts.waves === false) R.timer = 1e6;
      // where to point: along the line in, and back towards it if a wave or the ice took her off it
      // (`across` is how far to starboard of the line she is, and a heading grows to port)
      const across = (b.pos.x - Z.x) * uz - (b.pos.z - Z.z) * ux;
      let want = course + clamp(across / 60, -0.5, 0.5);
      const W = R.wave, called = W && W.passed === false;
      if (called) {
        const into = Math.atan2(-W.dx, -W.dz);
        if (!badly) want = into;
        else { const a = into + Math.PI / 2, c = into - Math.PI / 2; want = Math.abs(wrapAngle(a - b.heading)) < Math.abs(wrapAngle(c - b.heading)) ? a : c; }
      }
      // steer round the ice ahead: pass the nearest lump in the way on its nearer side
      // (with a wave called, only ice that is nearly under the bow comes first)
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading), look = called ? 12 + Math.abs(b.speed) * 1.2 : 35 + Math.abs(b.speed) * 3.5;
      let best = null, bestAhead = Infinity;
      for (const G of growlersNear(b.pos.x, b.pos.z, look + 30, ice)) {
        growlerAt(G, g.elapsed, P);
        const ahead = (P.x - b.pos.x) * fx + (P.z - b.pos.z) * fz, side = (P.x - b.pos.x) * -fz + (P.z - b.pos.z) * fx;
        if (ahead > -2 && ahead < look && Math.abs(side) < G.r + 7 && ahead < bestAhead) { best = side; bestAhead = ahead; }
      }
      if (best != null) want = b.heading + (best > 0 ? 0.7 : -0.7); // a heading grows to port: turn away from its side
      g.input.tiller = clamp(wrapAngle(b.heading - want) * 2.5, -1, 1);
      b.sailLevel = level;
      const px = b.pos.x, pz = b.pos.z;
      g.update(DT);
      metres += Math.hypot(b.pos.x - px, b.pos.z - pz);
      off = Math.max(off, Math.abs(across));
      t += DT;
    }
  } finally {
    g.damage = realDamage; g.wreck = realWreck; g.input.tiller = tiller;
    g.weather.timer = 200;
  }
  const hull = b.maxHealth, pct = (v) => Math.round((v / hull) * 1000) / 10;
  const out = {
    lost: pct(hull - g.state.health), wrecked, seconds: Math.round(t), metres: Math.round(metres), offLine: Math.round(off),
    waves: R.count.waves, struck: R.count.struck, iceHits: R.count.ice,
    from: { wave: pct(lost.wave), battering: pct(lost.rough), slams: pct(lost.storm), ice: pct(lost.ice), other: pct(lost.other) },
    hull, sailed: badly ? 'badly' : 'well', zone: Z.id, side: Math.round((from * 180) / Math.PI),
  };
  if (wrecked) g.state.health = hull;
  return out;
}
