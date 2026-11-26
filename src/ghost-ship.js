// The ghost ship (Phase 7): a pale, see-through ship with green lanterns that
// sails silently past at night. She has no wake, doesn't ride the swell and
// makes no sound. Follow her, not too close, and she leads you to something
// she left behind; come alongside and she fades, as she does at first light.
//
// An actor for the event director (sea-events.js), like the animals in
// sea-life.js: start(), update(dt, ctx), leave(), pos, size, done. When she has
// led you somewhere, `cacheAt` is where, and the director puts the find there.
// Once her side chain has begun (ghost-chain.js) the director hands her a
// `cove` to make for instead, and `ledTo` says you followed her to it.
//
// Her model, and how she is drawn see-through, is ghost-model.js.
import { buildGhostShip } from './ghost-model.js';
import { openWater, clearPath, clearHeading } from './sightings.js';
import { SIGHTINGS } from './story-text.js';
import { clamp, damp } from './util.js';

const SPEED = 6.2;       // m/s: a little slower than a small boat under full sail
const TOO_CLOSE = 38;    // nearer than this and she fades
const FOLLOWING = 340;   // within this of her when she stops, you were following

export class GhostShip {
  constructor(scene) {
    Object.assign(this, buildGhostShip());
    this.pos = { x: 0, z: 0 };
    this.size = 12;
    this.done = true;
    this.cacheAt = null;
    scene.add(this.group);
  }

  start({ at: where, boat, rng, sea, cove = null }) {
    this.pos.x = where.x; this.pos.z = where.z;
    this.sea = sea;
    this.cacheAt = null; this.ledTo = null;
    // She sails across your bow and on towards a spot she means to lead you to:
    // the island her chain points at, or else open water some way off with a
    // clear run to it.
    this.lead = cove;
    this.toCove = !!cove;
    const across = boat.heading + where.side * (0.5 + rng() * 0.5);
    for (let t = 0; t < 30 && !this.lead; t++) {
      const a = across + (rng() - 0.5) * 1.6, d = 650 + rng() * 300;
      const spot = { x: where.x + Math.sin(a) * d, z: where.z + Math.cos(a) * d };
      if (openWater(sea, spot.x, spot.z, 70) && clearPath(sea, this.pos, spot, 50)) this.lead = spot;
    }
    this.heading = this.lead ? Math.atan2(this.lead.x - where.x, this.lead.z - where.z) : clearHeading(sea, this.pos, 420, across, 50) ?? across;
    this.life = 90 + rng() * 30; // how long she sails if she has nowhere to lead you
    this.age = 0;
    this.fade = 0;
    this.phase = 'sail';
    this.done = false;
    this.place(0);
  }

  /** Fade away. `why` is a line to say if you're near enough to have been watching. */
  leave(why = null, ctx = null) {
    if (this.done || this.phase === 'leave') return;
    this.phase = 'leave';
    if (why && ctx && Math.hypot(ctx.boat.x - this.pos.x, ctx.boat.z - this.pos.z) < 420) ctx.say(why);
  }
  stop() { this.done = true; this.fade = 0; this.setFade(0); }

  place(time) {
    const g = this.group;
    // she doesn't ride the swell: a slow, even sway, a hand's breadth above the water
    g.position.set(this.pos.x, 0.35 + Math.sin(time * 0.5) * 0.12, this.pos.z);
    g.rotation.set(Math.sin(time * 0.4) * 0.015, this.heading, Math.sin(time * 0.33) * 0.03);
    this.setFade(this.fade, time);
  }

  update(dt, ctx) {
    if (this.done) return;
    const b = ctx.boat, d = Math.hypot(b.x - this.pos.x, b.z - this.pos.z);
    this.age += dt;
    if (this.phase === 'sail') {
      this.fade = damp(this.fade, 1, 0.7, dt);
      // she waits for a ship that is following and has fallen behind
      const following = this.lead && d < FOLLOWING;
      const speed = following && d > 190 ? SPEED * 0.6 : SPEED;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      this.pos.x += fx * speed * dt; this.pos.z += fz * speed * dt;
      if (d < TOO_CLOSE) this.leave(SIGHTINGS.tooClose, ctx);
      // (with a ship close behind her she holds on a little into the dawn)
      else if (ctx.night < (following ? 0.12 : 0.45)) this.leave(SIGHTINGS.dawn, ctx);
      else if (this.lead) {
        if (Math.hypot(this.lead.x - this.pos.x, this.lead.z - this.pos.z) < 14) {
          if (!following) this.leave();
          else if (this.toCove) { this.ledTo = this.lead; this.leave(); }
          else { this.cacheAt = { x: this.lead.x, z: this.lead.z }; this.leave(SIGHTINGS.led, ctx); }
        } else if (this.age > (this.toCove ? 420 : 300)) this.leave();
      } else {
        this.life -= dt;
        if (this.life <= 0 || !openWater(this.sea, this.pos.x + fx * 70, this.pos.z + fz * 70, 40)) this.leave();
      }
    } else {
      this.fade = clamp(this.fade - dt / 3, 0, 1);
      this.pos.x += Math.sin(this.heading) * SPEED * 0.5 * dt; this.pos.z += Math.cos(this.heading) * SPEED * 0.5 * dt;
      if (this.fade <= 0) { this.stop(); return; }
    }
    this.place(this.age);
  }
}
