// What a level can do to you on foot besides being climbed: steam vents that
// throw you up (level.vents), basalt that crumbles a moment after you land
// on it (level.crumbles) and gusts of wind that push you (level.gusts). Any
// level can have them: generated volcanic and cold islands do, and a
// hand-built level only has to list them. Pure JS, no three.js, so the game
// (ashore.js) and the test climber (tools/check.mjs) play by the same rules;
// the art reads the state to puff, shake, drop and blow. (Ice that slides is
// a surface, not a hazard: anything tagged 'ice', controller.js.)
//
// level.vents     [{ id, x, y, z, r, lift }]  y: the top of the vent's rim;
//                 r: the mouth that throws you; lift: how high (m) it throws
//                 you above the rim. Its colliders carry `vent: id`.
// level.crumbles  [{ id, x, y, z }]  one per piece that crumbles; its
//                 colliders carry `crumble: id`.
// level.pools     [{ x, z, r, y }]  lava up high (a crater): sink below y
//                 within r of (x, z) and you've fallen in (`burned`).
// level.gusts     [{ id, x, y, z, dx, dz, along, across, up, phase }]  wind
//                 blows through a box centred on (x, z): `along` m either way
//                 along the wind's direction (dx, dz: a unit vector), `across`
//                 m either side of it, from y - 0.5 up to y + up. `phase`:
//                 how many seconds into its round it starts.
// A vent fires when you stand in its mouth. A crumbling piece shakes for
// P.crumble.hold s after you land on it, falls (its colliders drop out of the
// way) and is back P.crumble.back s later, once you're clear of where it was.
// A gust goes round and round: calm for P.gust.rest s, a warning for
// P.gust.warn s (nothing pushes yet), then it blows for P.gust.blow s and
// carries whoever is in its box along (ctl.wind).
import { overlaps } from './collide.js';

const DROP = 60; // how far down a fallen piece's colliders are moved

/** The speed (m/s) straight up that rises `lift` m, under gravity P.gravity (falling ends a launch, so no hang counts). */
export const launchSpeed = (lift, P) => Math.sqrt(2 * P.gravity * lift);

/** Move a crumbling piece's colliders up or down by dy. */
function shift(list, dy) {
  for (const c of list) {
    if (c.type === 'cyl') { c.y0 += dy; c.y1 += dy; } else if (c.type === 'obox') c.c[1] += dy;
    else { c.min[1] += dy; c.max[1] += dy; }
  }
}

/** How long one round of a gust takes (s): calm, the warning, the blow. */
export const gustRound = (P) => P.gust.rest + P.gust.warn + P.gust.blow;

/**
 * Where a gust is in its round at `clock` s (it began `phase` s in): its
 * state ('calm' | 'warn' | 'blow'), how hard it blows (k, 0-1), how long
 * until it next blows (calm, 0 while it does) and how far through its warning
 * it is (stir, 0-1). Fills and returns `out`.
 */
export function gustNow(P, clock, phase = 0, out = {}) {
  const G = P.gust, t = (clock + phase) % gustRound(P), into = t - G.rest - G.warn;
  out.state = t < G.rest ? 'calm' : into < 0 ? 'warn' : 'blow';
  out.k = into >= 0 ? Math.max(0, Math.min(1, into / G.ramp, (G.blow - into) / G.ramp)) : 0;
  out.calm = into >= 0 ? 0 : -into;
  out.stir = out.state === 'warn' ? 1 + into / G.warn : out.state === 'blow' ? 1 : 0;
  return out;
}

/** Is (x, y, z) inside gust g's box (grown by `pad` m along and across)? */
export function inGust(g, x, y, z, pad = 0) {
  const px = x - g.x, pz = z - g.z;
  return y > g.y - 0.5 && y < g.y + g.up && Math.abs(px * g.dx + pz * g.dz) < g.along + pad && Math.abs(px * g.dz - pz * g.dx) < g.across + pad;
}

export class Hazards {
  /** level: colliders, groundAt and the lists above; P: the ASHORE constants. */
  constructor(level, P) {
    this.level = level;
    this.P = P;
    const own = {};
    for (const c of level.colliders) if (c.crumble) (own[c.crumble] ||= []).push(c);
    this.vents = (level.vents || []).map((v) => ({ ...v, cool: 0, fired: -1 }));
    this.crumbles = (level.crumbles || []).map((c) => ({ ...c, state: 'solid', t: 0, colliders: own[c.id] || [] }));
    this.byId = Object.fromEntries(this.crumbles.map((c) => [c.id, c]));
    this.pools = level.pools || [];
    // each with where it is in its round (gustNow): state, k, calm, stir
    this.gusts = (level.gusts || []).map((g) => ({ ...g, state: 'calm', k: 0, calm: 0, stir: 0 }));
    this.clock = 0;
    this.ev = { launched: null, cracked: null, fell: null, back: null, burned: false, gust: null, wind: null };
    this.stepGusts(null);
  }

  /** Where every gust is in its round, and what the wind does to the controller (if given). */
  stepGusts(ctl) {
    const G = this.P.gust, ev = this.ev;
    let wx = 0, wz = 0;
    for (const g of this.gusts) {
      const was = g.state;
      gustNow(this.P, this.clock, g.phase, g);
      if (!ctl) continue;
      if (g.state === 'warn' && was === 'calm') {
        // the nearest gust that has just begun to stir (for its sound)
        const d = Math.hypot(ctl.pos.x - g.x, ctl.pos.y - g.y, ctl.pos.z - g.z);
        if (!ev.gust || d < ev.gust.far) { g.far = d; ev.gust = g; }
      }
      if (g.k > 0 && inGust(g, ctl.pos.x, ctl.pos.y, ctl.pos.z)) { wx += g.dx * G.push * g.k; wz += g.dz * G.push * g.k; ev.wind = g; }
    }
    if (ctl) { ctl.wind.x = wx; ctl.wind.z = wz; }
  }

  /** The gust whose box holds (x, y, z), or null. */
  gustAt(x, y, z, pad = 0) { return this.gusts.find((g) => inGust(g, x, y, z, pad)) || null; }

  /**
   * One frame, after the controller has moved. Returns what happened (the
   * same object each time): launched (a vent), cracked, fell, back (a
   * piece), burned (in a pool of lava), gust (one nearby that has begun to
   * stir), wind (the gust that is pushing you).
   */
  update(dt, ctl) {
    const ev = this.ev, P = this.P, p = ctl.pos;
    ev.launched = ev.cracked = ev.fell = ev.back = ev.gust = ev.wind = null;
    ev.burned = this.pools.some((q) => p.y < q.y - 0.3 && Math.hypot(p.x - q.x, p.z - q.z) < q.r);
    this.clock += dt;
    this.stepGusts(ctl);
    const on = ctl.grounded ? ctl.groundOn : null;
    for (const v of this.vents) {
      v.cool -= dt;
      if (on?.vent !== v.id || v.cool > 0 || Math.hypot(p.x - v.x, p.z - v.z) > v.r) continue;
      ctl.launch(launchSpeed(v.lift, P));
      v.cool = P.vent.cooldown;
      v.fired = this.clock;
      ev.launched = v;
    }
    const hit = on?.crumble ? this.byId[on.crumble] : null;
    if (hit?.state === 'solid') { hit.state = 'shaking'; hit.t = 0; ev.cracked = hit; }
    for (const c of this.crumbles) {
      if (c.state === 'solid') continue;
      c.t += dt;
      if (c.state === 'shaking') {
        if (c.t < P.crumble.hold) continue;
        c.state = 'fallen'; c.t = 0;
        shift(c.colliders, -DROP);
        ev.fell = c;
      } else if (c.t >= P.crumble.back) {
        // back where it was, unless you're standing in the way: then try again shortly
        shift(c.colliders, DROP);
        if (overlaps(this.level, p, P.radius, P.height)) { shift(c.colliders, -DROP); c.t = P.crumble.back - 0.25; continue; }
        c.state = 'solid'; c.t = 0;
        ev.back = c;
      }
    }
    return ev;
  }

  /** Everything back as it was (a respawn, or the test climber's retry). */
  reset() {
    for (const c of this.crumbles) {
      if (c.state === 'fallen') shift(c.colliders, DROP);
      c.state = 'solid'; c.t = 0;
    }
    for (const v of this.vents) v.cool = 0;
  }
}
