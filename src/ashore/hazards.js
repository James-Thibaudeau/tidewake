// What a level can do to you on foot besides being climbed: steam vents that
// throw you up (level.vents) and basalt that crumbles a moment after you land
// on it (level.crumbles). Any level can have them: generated volcanic islands
// do, and a hand-built level only has to list them. Pure JS, no three.js, so
// the game (ashore.js) and the test climber (tools/check.mjs) play by the
// same rules; the art reads the state to puff, shake and drop.
//
// level.vents     [{ id, x, y, z, r, lift }]  y: the top of the vent's rim;
//                 r: the mouth that throws you; lift: how high (m) it throws
//                 you above the rim. Its colliders carry `vent: id`.
// level.crumbles  [{ id, x, y, z }]  one per piece that crumbles; its
//                 colliders carry `crumble: id`.
// level.pools     [{ x, z, r, y }]  lava up high (a crater): sink below y
//                 within r of (x, z) and you've fallen in (`burned`).
// A vent fires when you stand in its mouth. A crumbling piece shakes for
// P.crumble.hold s after you land on it, falls (its colliders drop out of the
// way) and is back P.crumble.back s later, once you're clear of where it was.
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
    this.clock = 0;
    this.ev = { launched: null, cracked: null, fell: null, back: null, burned: false };
  }

  /**
   * One frame, after the controller has moved. Returns what happened (the
   * same object each time): launched (a vent), cracked, fell, back (a
   * piece), burned (in a pool of lava).
   */
  update(dt, ctl) {
    const ev = this.ev, P = this.P, p = ctl.pos;
    ev.launched = ev.cracked = ev.fell = ev.back = null;
    ev.burned = this.pools.some((q) => p.y < q.y - 0.3 && Math.hypot(p.x - q.x, p.z - q.z) < q.r);
    this.clock += dt;
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
