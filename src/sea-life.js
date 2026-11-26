// The living sea's animals (Phase 7): a whale and a pod of dolphins, with the
// spray they throw up. Each is an actor the event director (sea-events.js)
// starts, updates every frame and drops when it says it is `done`:
//
//   actor.start({ at, boat, rng, sea })   appear at `at` ({ x, z, side })
//   actor.update(dt, ctx)                 ctx: { boat: { x, z, heading, speed }, sea, night, play(name, x, z), say(text) }
//   actor.leave()                         go now (dive, peel away)
//   actor.pos, actor.size                 where it is, and how big, for "have you seen it"
//   actor.done                            it has gone; the director can roll again
//   actor.boost                           (dolphins) the player's sail drive while they ride the bow wave
// The whale is solid: it keeps the boat out of its body through ctx.bump(x, z, r, kind, soft),
// and a breach that comes up under you or down on you knocks the hull (ctx.knock(damage, kind)).
//
// Models face +z, like the boats, and are built once and kept. The ghost ship
// is ghost-ship.js. The rules for where and when are sightings.js.
import * as THREE from 'three';
import { part, merge, propMaterial, propOutline, thinOutline } from './props.js';
import { toon } from './toon.js';
import { waveHeight } from './waves.js';
import { openWater } from './sightings.js';
import { SIGHTINGS } from './story-text.js';
import { clamp, damp, dampAngle, lerp, smoothstep, TAU } from './util.js';

const PI = Math.PI;
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** One vertex-coloured mesh and its ink outline from a list of parts. */
function inked(parts, outline = propOutline) {
  const geo = merge(parts);
  for (const p of parts) p.dispose();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, outline));
  return g;
}

// ------------------------------------------------------------------ spray
/**
 * White blobs for spouts and splashes: thrown up, pulled back down, shrinking
 * as they go. One instanced mesh, lit like everything else, so spray is dim at
 * night.
 */
export class Puffs {
  constructor(scene, max = 96) {
    this.max = max;
    this.live = [];
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), toon('#e4edf4'), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this._m = new THREE.Matrix4();
    scene.add(this.mesh);
  }

  emit(x, y, z, vx, vy, vz, size, life, grav = 9) {
    if (this.live.length >= this.max) this.live.shift();
    this.live.push({ x, y, z, vx, vy, vz, size, life, grav, t: 0 });
  }

  /** A burst at the waterline: `n` blobs thrown out and up from (x, z). */
  splash(x, z, n, out, up, size) {
    const y = waveHeight(x, z);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5, k = 0.5 + Math.random() * 0.5;
      this.emit(x + Math.cos(a) * size, y, z + Math.sin(a) * size, Math.cos(a) * out * k, up * (0.55 + Math.random() * 0.45), Math.sin(a) * out * k, size * (0.6 + Math.random() * 0.6), 0.9 + Math.random() * 0.7);
    }
  }

  update(dt) {
    const L = this.live;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life, s = p.size * Math.min(1, 0.35 + p.t / 0.18) * (1 - k * k);
      this._m.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(n, this._m);
      L[n++] = p;
    }
    L.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.live.length = 0; this.mesh.count = 0; }
}

// ------------------------------------------------------------------ whale
const WHALE = { back: '#46668a', belly: '#d9e6ec', fin: '#34506e', eye: '#141c28' };
const WHALE_SIZE = 2;                  // the model is built at half size: she is 30 m, four boat lengths
const WHALE_DEEP = -3.4 * WHALE_SIZE;  // swimming depth of the body's centre (the back is under water)
const WHALE_UP = -0.12 * WHALE_SIZE;   // …and when it comes up to blow (the back shows)
// Her body for the boat to run into, head to tail stock: [along the spine, half-breadth] in the model's own units.
const WHALE_BODY = [[4.7, 1.3], [2.6, 1.65], [0.4, 1.75], [-1.8, 1.5], [-3.9, 1.0], [-5.8, 0.55]];
const HULL = [-1, 1.5];                // the heights a boat's hull takes up, for what of her is in its way

/** A whale about 30 m long: { group, tail } with the tail on a pivot so the flukes can beat. */
export function buildWhale() {
  const body = [
    part(sph(1, 18, 12), WHALE.back, { z: 0.6, sx: 1.75, sy: 1.5, sz: 5.3, c2: WHALE.belly, split: 0.36, soft: 0.05 }),
    part(sph(1, 14, 10), WHALE.back, { y: -0.12, z: 4.1, sx: 1.6, sy: 1.34, sz: 2.5, c2: WHALE.belly, split: 0.3, soft: 0.05 }),
    part(cone(0.34, 0.75, 5), WHALE.fin, { y: 1.5, z: -1.5, rx: -0.75, sx: 0.5 }),
  ];
  for (const s of [-1, 1]) {
    body.push(
      part(sph(1, 10, 6), WHALE.fin, { x: s * 2.25, y: -0.85, z: 2.3, sx: 1.45, sy: 0.13, sz: 0.55, rz: -s * 0.5, ry: s * 0.5 }),
      part(sph(0.14, 8, 6), WHALE.eye, { x: s * 1.45, y: -0.3, z: 5.0 }),
    );
  }
  // the tail, built round its pivot: the stock tapers back to the flukes
  const tail = [part(cyl(0.3, 1.18, 4.4, 10), WHALE.back, { z: -2.1, rx: -PI / 2 })];
  for (const s of [-1, 1]) tail.push(part(sph(1, 10, 6), WHALE.fin, { x: s * 1.35, z: -4.7, sx: 1.6, sy: 0.14, sz: 0.72, ry: s * 0.55 }));
  const group = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.order = 'YXZ';
  model.scale.setScalar(WHALE_SIZE);
  const tailPivot = inked(tail);
  tailPivot.position.set(0, 0, -3.3);
  model.add(inked(body), tailPivot);
  group.add(model);
  return { group, model, tail: tailPivot };
}

/**
 * The whale: it swims slowly, coming up to blow every few seconds, breaches
 * now and then, and at last goes down with its tail in the air. Sail slowly
 * alongside and it stays up longer.
 */
export class Whale {
  constructor(scene, puffs) {
    Object.assign(this, buildWhale());
    this.puffs = puffs;
    this.pos = { x: 0, z: 0 };
    this.size = 9 * WHALE_SIZE;
    this.done = true;
    this.group.visible = false;
    scene.add(this.group);
  }

  start({ at, boat, rng, sea }) {
    this.pos.x = at.x; this.pos.z = at.z;
    // travelling much the way you are, a little across your bow
    this.heading = boat.heading - at.side * (0.25 + rng() * 0.5);
    this.sea = sea;
    this.life = 70 + rng() * 30;   // seconds it stays if nobody keeps it company
    this.age = 0;
    this.cycle = 0.6;              // seconds into the breathing cycle: it blows soon after it appears
    this.breachIn = 13 + rng() * 8;
    this.phase = 'swim'; this.t = 0;
    this.out = false; this.wet = false; this.flick = false;
    this.struck = false; this.spooked = false;
    this.y = WHALE_DEEP; this.pitch = 0; this.roll = 0;
    this.wander = rng() * 10;
    this.done = false;
    this.group.visible = true;
    this.place();
  }

  leave() { if (!this.done && this.phase !== 'sound') { this.phase = 'sound'; this.t = 0; } }
  stop() { this.done = true; this.group.visible = false; }

  place() {
    const g = this.group, m = this.model;
    g.position.set(this.pos.x, waveHeight(this.pos.x, this.pos.z) * 0.5 + this.y, this.pos.z);
    g.rotation.y = this.heading;
    m.rotation.set(this.pitch, 0, this.roll);
  }

  update(dt, ctx) {
    if (this.done) return;
    const b = ctx.boat, d = Math.hypot(b.x - this.pos.x, b.z - this.pos.z);
    this.age += dt; this.t += dt;
    // company: a boat keeping pace, slowly, holds it at the surface
    const company = d < 95 && Math.abs(b.speed) < 6.5;
    if (!company) this.life -= dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const S = WHALE_SIZE;
    let speed = 3.4, tailBeat = Math.sin(this.age * 1.1) * 0.22;

    if (this.phase === 'swim') {
      this.heading += Math.sin(this.age * 0.13 + this.wander) * 0.035 * dt;
      // up to blow for the first part of each breath, then under again
      const P = 8.5, u = (this.cycle % P) / P, before = ((this.cycle - dt) % P) / P;
      this.cycle += dt;
      const up = smoothstep(0, 0.1, u) * (1 - smoothstep(0.4, 0.55, u));
      this.y = damp(this.y, lerp(WHALE_DEEP, WHALE_UP, up), 3, dt);
      this.pitch = damp(this.pitch, u < 0.2 ? -0.12 : u < 0.55 ? 0.14 : 0, 2, dt);
      this.roll = damp(this.roll, 0, 3, dt);
      if (u >= 0.12 && (before < 0.12 || before > u)) this.blow(ctx);
      this.breachIn -= dt;
      const ahead = openWater(this.sea, this.pos.x + fx * 110, this.pos.z + fz * 110, 45);
      // (run into her hard and she has had enough of you)
      if (this.life <= 0 || this.age > 170 || !ahead || this.spooked) this.leave();
      else if (this.breachIn <= 0 && u > 0.7 && d > 50) { this.phase = 'breach'; this.t = 0; this.wet = false; this.struck = false; }
    } else if (this.phase === 'breach') {
      // up and out, nose first; hang; fall back on its side
      const k = this.t / 4.6;
      speed = 5.5;
      this.y = lerp(WHALE_DEEP, 0, smoothstep(0, 0.2, k)) + Math.sin(clamp((k - 0.12) / 0.62, 0, 1) * PI) * 4.9 * S - smoothstep(0.74, 1, k) * 2 * S;
      this.pitch = lerp(-1.15, 0.25, smoothstep(0.15, 0.8, k));
      this.roll = smoothstep(0.38, 0.75, k) * 1.25 * (1 - smoothstep(0.85, 1, k));
      tailBeat = 0.3;
      if (!this.out && k > 0.14) { this.out = true; this.puffs.splash(this.pos.x + fx * 5 * S, this.pos.z + fz * 5 * S, 16, 7, 9, 1.0); ctx.play('splash', this.pos.x, this.pos.z); }
      if (!this.wet && k > 0.7) {
        this.wet = true;
        this.puffs.splash(this.pos.x + fx * 2 * S, this.pos.z + fz * 2 * S, 34, 16, 16, 1.5);
        this.puffs.splash(this.pos.x - fx * 3 * S, this.pos.z - fz * 3 * S, 16, 9, 10, 1.1);
        ctx.play('breach', this.pos.x, this.pos.z);
      }
      if (k >= 1) { this.phase = 'swim'; this.out = false; this.cycle = 5; this.breachIn = 30 + Math.random() * 16; }
    } else {
      // sounding: nose down, the flukes lift clear of the water, and it slides under
      const k = this.t / 7;
      speed = lerp(3, 0.8, smoothstep(0, 0.4, k));
      this.pitch = damp(this.pitch, 1.15, 1.8, dt);
      this.roll = damp(this.roll, 0, 3, dt);
      this.y = damp(this.y, lerp(-1.4 * S, -14 * S, smoothstep(0.42, 1, k)), 3, dt);
      tailBeat = 0.3 * smoothstep(0.1, 0.4, k) * (1 - smoothstep(0.6, 0.9, k));
      if (!this.flick && k > 0.45) { this.flick = true; this.puffs.splash(this.pos.x - fx * 2 * S, this.pos.z - fz * 2 * S, 14, 5, 6, 0.8); ctx.play('splash', this.pos.x, this.pos.z); }
      if (k >= 1) { this.flick = false; this.stop(); return; }
    }

    this.pos.x += fx * speed * dt; this.pos.z += fz * speed * dt;
    this.tail.rotation.x = tailBeat;
    this.place();
    this.collide(ctx);
  }

  /**
   * She is solid. Each stretch of her body that is at the height of a hull
   * keeps the boat out of it: deep down she passes under you, at the surface
   * you sail round her, and a breach can come up beneath you. Running into
   * her at speed costs hull (half what a rock would) and sends her down; a
   * breach that catches the boat knocks it once.
   */
  collide(ctx) {
    const S = WHALE_SIZE, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), base = this.group.position.y;
    let touched = false;
    for (const [s, half] of WHALE_BODY) {
      // this stretch's height (nose up or down moves it), and how wide she is where the hull would meet her
      const y = base - s * S * sp, tall = half * S * 0.86, off = clamp(y, HULL[0], HULL[1]) - y;
      const wide = Math.sqrt(Math.max(0, 1 - (off / tall) ** 2));
      if (wide < 0.25) continue;
      const hit = ctx.bump(this.pos.x + fx * s * S * cp, this.pos.z + fz * s * S * cp, half * S * wide * 0.92, 'whale', 0.5);
      if (hit) touched = true;
      if (hit === 'hit') this.spooked = true;
    }
    if (touched && this.phase === 'breach' && !this.struck) { this.struck = true; ctx.knock(9, 'breach'); }
  }

  /** The spout: a column of mist from the top of the head, and the sound of it. */
  blow(ctx) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const S = WHALE_SIZE, x = this.pos.x + fx * 3.6 * S, z = this.pos.z + fz * 3.6 * S, y = waveHeight(x, z) + 0.8 * S;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * TAU, r = Math.random() * 1.8;
      this.puffs.emit(x, y, z, Math.cos(a) * r, 9 + Math.random() * 8, Math.sin(a) * r, 0.4 + Math.random() * 0.6, 1.6 + Math.random() * 1.1, 6);
    }
    ctx.play('spout', x, z);
  }
}

// ---------------------------------------------------------------- dolphins
const DOLPHIN = { back: '#6d8ea8', belly: '#e8f0f3', fin: '#5a7a94', eye: '#141c28' };
const POD_MAX = 8;
const RIDE_AT = 10;    // m/s (12 knots on the HUD): this fast, close by, and they come over to ride
const RIDE_KEEP = 8;   // …and they stay while you keep above this
export const BOW_BOOST = 1.08; // the sail's drive while they ride the bow wave

let dolphinGeo = null;
function dolphinGeometry() {
  if (dolphinGeo) return dolphinGeo;
  const parts = [
    part(sph(1, 12, 8), DOLPHIN.back, { sx: 0.36, sy: 0.4, sz: 1.2, c2: DOLPHIN.belly, split: 0.36, soft: 0.06 }),
    part(cone(0.12, 0.55, 6), DOLPHIN.back, { y: -0.06, z: 1.3, rx: PI / 2 }),
    part(cone(0.22, 0.55, 4), DOLPHIN.fin, { y: 0.5, z: -0.12, rx: -0.6, sx: 0.3 }),
    part(cone(0.24, 1.0, 6), DOLPHIN.back, { z: -1.45, rx: -PI / 2 }),
  ];
  for (const s of [-1, 1]) {
    parts.push(
      part(sph(1, 8, 5), DOLPHIN.fin, { x: s * 0.27, z: -1.98, sx: 0.36, sy: 0.05, sz: 0.2, ry: s * 0.55 }),
      part(sph(1, 8, 5), DOLPHIN.fin, { x: s * 0.42, y: -0.24, z: 0.42, sx: 0.34, sy: 0.05, sz: 0.16, rz: -s * 0.75, ry: s * 0.5 }),
      part(sph(0.035, 6, 4), DOLPHIN.eye, { x: s * 0.3, y: 0.03, z: 0.82 }),
    );
  }
  dolphinGeo = merge(parts);
  for (const p of parts) p.dispose();
  return dolphinGeo;
}

/** One dolphin, 2.7 m long, nose towards +z. */
export function buildDolphin() {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(dolphinGeometry(), propMaterial), new THREE.Mesh(dolphinGeometry(), thinOutline));
  return g;
}

/**
 * Pose a dolphin at phase `u` (0-1) of its leap cycle: out of the water in an
 * arc for the first part, then under. `rise` is how high the leap goes, and
 * `run` how far forward it carries (for the nose's angle). Returns true while
 * it is in the air.
 */
export function poseDolphin(g, u, rise, run) {
  const AIR = 0.44;
  if (u < AIR) {
    const k = u / AIR;
    g.position.y = Math.sin(k * PI) * rise - 0.25;
    g.rotation.x = -Math.atan2(Math.cos(k * PI) * rise * PI, run);
    return true;
  }
  const k = (u - AIR) / (1 - AIR);
  g.position.y = -0.25 - Math.sin(k * PI) * 1.5;
  g.rotation.x = Math.sin(k * TAU) * 0.2;
  return false;
}

/**
 * A pod of four to eight dolphins, leaping along. Sail fast near them and
 * they come over to ride your bow wave, which pulls the boat along a little
 * for as long as they stay.
 */
export class DolphinPod {
  constructor(scene, puffs) {
    this.puffs = puffs;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.fish = [];
    for (let i = 0; i < POD_MAX; i++) {
      const mesh = buildDolphin();
      this.group.add(mesh);
      this.fish.push({ mesh, air: false });
    }
    this.pos = { x: 0, z: 0 };
    this.size = 8;
    this.done = true;
    this.boost = 1;
    scene.add(this.group);
  }

  start({ at, boat, rng, sea }) {
    this.pos.x = at.x; this.pos.z = at.z;
    this.heading = boat.heading - at.side * (0.1 + rng() * 0.3); // much the way you're going, so you can catch them up
    this.sea = sea;
    this.speed = 6.5;
    this.life = 60 + rng() * 30;
    this.phase = 'roam'; this.t = 0; this.slowT = 0;
    this.boost = 1;
    this.n = 4 + Math.floor(rng() * 5);
    this.fish.forEach((f, i) => {
      f.mesh.visible = i < this.n;
      f.ox = (rng() - 0.5) * 16; f.oz = (rng() - 0.5) * 18;  // place in the pod (m), loose
      f.rx = (i % 2 ? 1 : -1) * (2.6 + rng() * 3.4); f.rz = 1 + rng() * 9; // …and at the bow: either side, a little ahead
      f.x = f.ox; f.z = f.oz;
      f.u = rng(); f.period = 2.5 + rng() * 1.1; f.rise = 1.3 + rng() * 0.8;
      f.air = false;
    });
    this.done = false;
    this.group.visible = true;
    this.place();
  }

  leave() { if (!this.done && this.phase !== 'leave') { this.phase = 'leave'; this.t = 0; this.boost = 1; } }
  stop() { this.done = true; this.boost = 1; this.group.visible = false; }

  place() {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
  }

  update(dt, ctx) {
    if (this.done) return;
    const b = ctx.boat, d = Math.hypot(b.x - this.pos.x, b.z - this.pos.z);
    this.t += dt;
    const fast = Math.abs(b.speed);
    if (this.phase === 'roam') {
      this.life -= dt;
      this.speed = damp(this.speed, 6.5, 1, dt);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      if (d < 75 && fast > RIDE_AT) { this.phase = 'ride'; this.t = 0; this.slowT = 0; this.boost = BOW_BOOST; ctx.say(SIGHTINGS.ride); ctx.play('chirp', this.pos.x, this.pos.z); }
      else if (this.life <= 0 || !openWater(this.sea, this.pos.x + fx * 60, this.pos.z + fz * 60, 25)) this.leave();
      this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt;
    } else if (this.phase === 'ride') {
      // keep station just ahead of the bow
      const tx = b.x + Math.sin(b.heading) * 7, tz = b.z + Math.cos(b.heading) * 7;
      const k = 1 - Math.exp(-1.6 * dt);
      this.pos.x += (tx - this.pos.x) * k; this.pos.z += (tz - this.pos.z) * k;
      this.heading = dampAngle(this.heading, b.heading, 2.5, dt);
      this.speed = fast;
      this.slowT = fast < RIDE_KEEP ? this.slowT + dt : 0;
      const shallow = this.sea.heightAt(this.pos.x, this.pos.z) > -5;
      if (this.slowT > 2.5 || this.t > 45 || shallow) {
        // away to the side with deeper water
        const side = this.sea.heightAt(this.pos.x - Math.cos(b.heading) * 50, this.pos.z + Math.sin(b.heading) * 50) < -8 ? 1 : -1;
        this.heading = b.heading - side * 0.7;
        ctx.say(SIGHTINGS.rideEnd);
        this.leave();
      }
    } else {
      this.speed = damp(this.speed, 9, 1.5, dt);
      this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
      if (this.t > 7) { this.stop(); return; }
    }
    this.place();

    const riding = this.phase === 'ride', diving = this.phase === 'leave' && this.t > 4.5;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    for (let i = 0; i < this.n; i++) {
      const f = this.fish[i], m = f.mesh;
      // drift between its place in the pod and its place at the bow
      f.x = damp(f.x, riding ? f.rx : f.ox, 1.2, dt); f.z = damp(f.z, riding ? f.rz : f.oz, 1.2, dt);
      // once they're leaving, each one's next dive is its last: it stays down
      if (diving && f.u >= 0.44) f.u = 0.72; else f.u = (f.u + dt / f.period) % 1;
      const air = poseDolphin(m, f.u, f.rise, Math.max(3, this.speed) * f.period * 0.44);
      m.position.x = f.x; m.position.z = f.z;
      const wx = this.pos.x + f.x * c + f.z * s, wz = this.pos.z - f.x * s + f.z * c;
      m.position.y += waveHeight(wx, wz);
      if (air !== f.air) {
        // a little spray where it leaves the water and where it goes back in
        this.puffs.splash(wx, wz, 4, 1.4, 2.2, 0.17);
        f.air = air;
      }
    }
  }
}

// ------------------------------------------------------------------ turtles
const TURTLE = { shell: '#5d7a4a', plate: '#4a6339', skin: '#d9cf9a', skin2: '#b9ad74', eye: '#141c28' };
const LINE_MAX = 7;

let turtleGeo = null;
function turtleGeometry() {
  if (turtleGeo) return turtleGeo;
  const parts = [
    part(sph(1, 12, 8), TURTLE.shell, { sx: 0.56, sy: 0.3, sz: 0.72, c2: TURTLE.skin2, split: 0.3, soft: 0.05 }),
    part(sph(1, 8, 5), TURTLE.plate, { y: 0.17, sx: 0.36, sy: 0.16, sz: 0.5 }),
    part(sph(0.17, 8, 6), TURTLE.skin, { y: 0.08, z: 0.82, sz: 1.25 }),
    part(cone(0.07, 0.26, 5), TURTLE.skin, { y: -0.02, z: -0.8, rx: -PI / 2 }),
  ];
  for (const s of [-1, 1]) {
    parts.push(
      part(sph(1, 8, 5), TURTLE.skin, { x: s * 0.62, y: -0.06, z: 0.36, sx: 0.46, sy: 0.05, sz: 0.19, ry: s * 0.5, rz: -s * 0.15 }),
      part(sph(1, 8, 5), TURTLE.skin, { x: s * 0.44, y: -0.08, z: -0.56, sx: 0.24, sy: 0.05, sz: 0.15, ry: -s * 0.7 }),
      part(sph(0.03, 6, 4), TURTLE.eye, { x: s * 0.12, y: 0.13, z: 0.92 }),
    );
  }
  turtleGeo = merge(parts);
  for (const p of parts) p.dispose();
  return turtleGeo;
}

/** One sea turtle, about 1.6 m long, nose towards +z. */
export function buildTurtle() {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(turtleGeometry(), propMaterial), new THREE.Mesh(turtleGeometry(), thinOutline));
  return g;
}

/**
 * A slow line of sea turtles, coming up for air. Sail among them slowly and
 * one swims along beside you for a while; come in fast, or bump one, and they
 * all dive.
 */
export class Turtles {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.line = [];
    for (let i = 0; i < LINE_MAX; i++) {
      const mesh = buildTurtle();
      mesh.scale.setScalar(1.25);
      this.group.add(mesh);
      this.line.push({ mesh });
    }
    this.pos = { x: 0, z: 0 };
    this.size = 14;
    this.done = true;
    scene.add(this.group);
  }

  start({ at, boat, rng, sea }) {
    this.sea = sea;
    this.heading = boat.heading + at.side * (0.9 + rng() * 0.6); // across your course, so you meet the line
    this.n = 5 + Math.floor(rng() * 3);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.line.forEach((t, i) => {
      t.mesh.visible = i < this.n;
      // strung out along their course, a few metres apart, none quite in line
      const back = (i - (this.n - 1) / 2) * (6.5 + rng() * 2), off = (rng() - 0.5) * 5;
      t.x = at.x - fx * back + fz * off; t.z = at.z - fz * back - fx * off;
      t.phase = rng() * TAU; t.depth = 0; t.yaw = this.heading + (rng() - 0.5) * 0.3;
    });
    this.life = 75 + rng() * 30;
    this.phase = 'swim'; this.t = 0;
    this.calm = 0;         // seconds a slow boat has been among them
    this.friend = null;    // the one that comes along with you
    this.friendT = 0;
    this.done = false;
    this.group.visible = true;
    this.pose(0, boat);
  }

  leave() { if (!this.done && this.phase !== 'dive') { this.phase = 'dive'; this.t = 0; this.friend = null; } }
  stop() { this.done = true; this.group.visible = false; }

  /** Move and draw every turtle; returns how near the nearest is to the boat (not counting the one keeping you company). */
  pose(dt, b) {
    const fast = Math.abs(b.speed), diving = this.phase === 'dive';
    let near = Infinity, cx = 0, cz = 0;
    for (let i = 0; i < this.n; i++) {
      const t = this.line[i], m = t.mesh;
      if (t !== this.friend) near = Math.min(near, Math.hypot(t.x - b.x, t.z - b.z));
      let speed = 1.1, want = this.heading;
      if (t === this.friend) {
        // alongside, a few metres off the beam
        const tx = b.x - Math.cos(b.heading) * 5.5 * t.side + Math.sin(b.heading) * 1.5, tz = b.z + Math.sin(b.heading) * 5.5 * t.side + Math.cos(b.heading) * 1.5;
        want = Math.atan2(tx - t.x, tz - t.z);
        speed = Math.min(5.2, Math.hypot(tx - t.x, tz - t.z) * 0.9 + fast * 0.6);
      }
      t.yaw = dampAngle(t.yaw, want, 1.6, dt);
      t.x += Math.sin(t.yaw) * speed * dt; t.z += Math.cos(t.yaw) * speed * dt;
      // up for a breath, then just under, each in its own time; once they dive they stay down
      const breath = Math.sin(this.t * 0.55 + t.phase);
      t.depth = damp(t.depth, diving ? 3.2 : breath > 0.2 ? 0 : 0.42, diving ? 1.1 : 2, dt);
      m.position.set(t.x, waveHeight(t.x, t.z) - 0.1 - t.depth, t.z);
      m.rotation.set(diving ? Math.min(0.7, this.t * 0.6) : Math.sin(this.t * 0.9 + t.phase) * 0.06, t.yaw, Math.sin(this.t * 1.3 + t.phase) * 0.08);
      cx += t.x; cz += t.z;
    }
    this.pos.x = cx / this.n; this.pos.z = cz / this.n;
    return near;
  }

  update(dt, ctx) {
    if (this.done) return;
    const b = ctx.boat, fast = Math.abs(b.speed);
    this.t += dt;
    const near = this.pose(dt, b);
    if (this.phase === 'dive') { if (this.t > 3.5) this.stop(); return; }
    this.life -= dt;
    if (near < 2.3) { ctx.say(SIGHTINGS.turtlesBump); ctx.play('splash', b.x, b.z); this.leave(); return; }
    if (near < 24 && fast > 7) { ctx.say(SIGHTINGS.turtlesFast); this.leave(); return; }
    // a boat going gently among them: after a moment, one comes along
    this.calm = near < 15 && fast < 5 && fast > 0.8 ? this.calm + dt : 0;
    if (!this.friend && this.calm > 3 && this.friendT === 0) {
      const nearest = (a, t) => (Math.hypot(t.x - b.x, t.z - b.z) < Math.hypot(a.x - b.x, a.z - b.z) ? t : a);
      this.friend = this.line.slice(0, this.n).reduce(nearest);
      // which side of the boat it is on already (right is (-cos h, sin h))
      this.friend.side = Math.sign((this.friend.x - b.x) * -Math.cos(b.heading) + (this.friend.z - b.z) * Math.sin(b.heading)) || 1;
      this.life += 25;
      ctx.say(SIGHTINGS.turtleFriend);
    }
    if (this.friend) { this.friendT += dt; if (this.friendT > 28 || fast > 7.5) this.friend = null; }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    if (this.life <= 0 || !openWater(this.sea, this.pos.x + fx * 40, this.pos.z + fz * 40, 20)) this.leave();
  }
}
