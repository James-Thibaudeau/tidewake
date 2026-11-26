// The living sea's weather, ice and flotsam (Phase 7): a waterspout, an iceberg
// that calves, the glowing bloom and a message in a bottle. Each is an actor
// for the event director (sea-events.js), like the animals in sea-life.js:
// start(), update(dt, ctx), leave(), stop(), pos, size, done.
//
// Two of them can hurt the ship, through the director:
//   ctx.batter(x, z, r, damage)   the waterspout: inside r of it, the hull takes a beating
//   ctx.bump(x, z, r, kind)       ice: a solid lump of radius r that the boat can't sail through
// and the bloom lights the water through it:
//   ctx.glow(x, z, r, k)          a patch of glowing sea (the ocean shader's uBloom)
import * as THREE from 'three';
import { part, merge, propMaterial, propOutline, thinOutline } from './props.js';
import { toonGradient, toonMaterial } from './toon.js';
import { glowTexture } from './world.js';
import { waveHeight } from './waves.js';
import { SIGHTINGS } from './story-text.js';
import { clamp, damp, lerp, smoothstep, mulberry32, TAU } from './util.js';

const PI = Math.PI;

// --------------------------------------------------------------- waterspout
const SPOUT = { light: '#e3ecf3', mid: '#a9bac9', dark: '#6f7c8b', cloud: '#5a6472', cloud2: '#454e5b' };
const SPOUT_H = 78;

/** The funnel: a flared foot, a thin waist and a wide mouth, wound like a corkscrew so it writhes as it spins. */
function funnelGeometry() {
  const rings = 30, seg = 14, pos = [], col = [], idx = [];
  const light = new THREE.Color(SPOUT.light), mid = new THREE.Color(SPOUT.mid), dark = new THREE.Color(SPOUT.dark), c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, y = t * SPOUT_H;
    const r = 1.5 + 2.4 * Math.exp(-y / 3.2) + Math.pow(t, 2.5) * 12;
    const sway = smoothstep(0, 0.25, t) * (1 - t * 0.4);
    const cx = Math.sin(t * 7.3) * 2.6 * sway, cz = Math.cos(t * 5.1 + 1) * 2.2 * sway;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU;
      pos.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
      // pale streaks winding up it; darker where it meets the cloud
      c.copy(Math.sin(a * 2 + t * 15) > 0.25 ? light : mid).lerp(dark, Math.pow(t, 3) * 0.8);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The waterspout's model: { group, funnel, cap }. The funnel spins; the cloud it hangs from doesn't. */
export function buildWaterspout() {
  const mat = toonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const funnel = new THREE.Mesh(funnelGeometry(), mat);
  const lumps = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, d = i ? 13 : 0;
    lumps.push(part(new THREE.SphereGeometry(1, 10, 7), SPOUT.cloud, { x: Math.cos(a) * d, y: SPOUT_H + 3 + (i % 2) * 2, z: Math.sin(a) * d, sx: 15, sy: 6, sz: 13, c2: SPOUT.cloud2, split: 0.45 }));
  }
  const capGeo = merge(lumps);
  for (const p of lumps) p.dispose();
  const cap = new THREE.Mesh(capGeo, propMaterial);
  const group = new THREE.Group();
  group.add(funnel, cap);
  return { group, funnel, cap };
}

/**
 * A waterspout: a spinning column that wanders across the sea under a storm.
 * It is a hazard to steer round; sail into it and the hull takes a beating.
 */
export class Waterspout {
  constructor(scene, puffs) {
    Object.assign(this, buildWaterspout());
    this.puffs = puffs;
    this.pos = { x: 0, z: 0 };
    this.size = 12;
    this.done = true;
    this.group.visible = false;
    scene.add(this.group);
  }

  start({ at, boat, rng, sea }) {
    this.pos.x = at.x; this.pos.z = at.z;
    this.sea = sea;
    this.heading = boat.heading + at.side * (1.1 + rng() * 0.8); // across your bow
    this.wander = rng() * 10;
    this.life = 60 + rng() * 25;
    this.age = 0; this.grow = 0; this.spray = 0; this.howl = 0;
    this.phase = 'spin';
    this.done = false;
    this.group.visible = true;
    this.place();
  }

  leave() { if (!this.done && this.phase !== 'lift') { this.phase = 'lift'; this.age = 0; } }
  stop() { this.done = true; this.group.visible = false; }

  place() {
    const g = this.group, k = this.grow, lift = this.phase === 'lift' ? smoothstep(0, 1, this.age / 4.5) : 0;
    g.position.set(this.pos.x, lift * 30, this.pos.z);
    this.funnel.scale.set(lerp(1, 0.12, lift) * (0.4 + 0.6 * k), Math.max(0.02, k), lerp(1, 0.12, lift) * (0.4 + 0.6 * k));
    // it reaches down from the cloud as it forms
    this.funnel.position.y = (1 - k) * SPOUT_H;
    this.cap.scale.setScalar(0.5 + 0.5 * k);
    this.cap.position.y = (1 - (0.5 + 0.5 * k)) * SPOUT_H - lift * 30;
  }

  update(dt, ctx) {
    if (this.done) return;
    this.age += dt;
    this.funnel.rotation.y -= dt * 3.4;
    this.cap.rotation.y -= dt * 0.15;
    if (this.phase === 'lift') {
      this.grow = damp(this.grow, 0.6, 1, dt);
      if (this.age > 4.5) { this.stop(); return; }
      this.place();
      return;
    }
    this.grow = damp(this.grow, 1, 0.8, dt);
    this.heading += Math.sin(this.age * 0.21 + this.wander) * 0.13 * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * 4.4 * dt; this.pos.z += fz * 4.4 * dt;
    this.life -= dt;
    // spray whipped round its foot
    this.spray -= dt;
    if (this.spray <= 0 && this.grow > 0.7) {
      this.spray = 0.09;
      const a = Math.random() * TAU, r = 3 + Math.random() * 2.5, x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      this.puffs.emit(x, waveHeight(x, z) + 0.2, z, Math.sin(a) * 8 + Math.cos(a) * 2, 4 + Math.random() * 5, -Math.cos(a) * 8 + Math.sin(a) * 2, 0.5 + Math.random() * 0.6, 0.8 + Math.random() * 0.5, 7);
    }
    this.howl -= dt;
    if (this.howl <= 0) { this.howl = 2.4; ctx.play('whirl', this.pos.x, this.pos.z); }
    if (this.grow > 0.8) ctx.batter(this.pos.x, this.pos.z, 7.5, 13);
    if (this.life <= 0 || this.sea.heightAt(this.pos.x + fx * 25, this.pos.z + fz * 25) > -5) this.leave();
    this.place();
  }
}

// ------------------------------------------------------------------ iceberg
const ICE = { top: '#f7fcff', lit: '#dcf0fa', shade: '#7fbcdd', deep: '#4f9fca' };

/**
 * A blade of ice: a prism of a few flat sides, narrowing to a slanted top.
 * Every face is flat and takes its own tone: white on top, pale where it
 * faces the light, blue in the shade and bluer towards the water. `at` is
 * where it stands, `lean` how far its top is pushed over, `slant` which way
 * the top slopes down, `tip` how small the top is beside the foot (0 = a point).
 */
function shard(sides, r, h, { at = [0, 0], lean = [0, 0], slant = 0, tip = 0.3, foot = -2.5, seed = 1 } = {}) {
  const rnd = mulberry32(seed * 7919 + 11);
  const turn = rnd() * TAU, rings = [[foot, 1.06, 0, 0], [h * 0.42, 0.86, 0.45, 0], [h, tip, 1, 0.34]];
  // each corner keeps its own bearing and reach all the way up, so the edges run straight
  const corner = Array.from({ length: sides }, (_, i) => [turn + ((i + (rnd() - 0.5) * 0.5) / sides) * TAU, 0.8 + rnd() * 0.4]);
  const ring = ([y, k, push, drop]) => corner.map(([a, reach]) => new THREE.Vector3(
    at[0] + lean[0] * push + Math.cos(a) * r * reach * k,
    y - drop * h * (0.5 + 0.5 * Math.cos(a - slant)),
    at[1] + lean[1] * push + Math.sin(a) * r * reach * k));
  const R = rings.map(ring), tris = [];
  for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tris.push([R[k][i], R[k + 1][i], R[k][j]], [R[k][j], R[k + 1][i], R[k + 1][j]]);
  }
  // the top: a fan from its middle (a single slanted face when the top is flat)
  const top = R[R.length - 1], mid = top.reduce((m, v) => m.add(v), new THREE.Vector3()).multiplyScalar(1 / sides);
  for (let i = 0; i < sides; i++) tris.push([top[i], mid, top[(i + 1) % sides]]);
  const pos = [], col = [], n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const cTop = new THREE.Color(ICE.top), cLit = new THREE.Color(ICE.lit), cShade = new THREE.Color(ICE.shade), cDeep = new THREE.Color(ICE.deep), c = new THREE.Color();
  for (const [p0, p1, p2] of tris) {
    n.crossVectors(e1.subVectors(p1, p0), e2.subVectors(p2, p0)).normalize();
    const y = (p0.y + p1.y + p2.y) / 3;
    if (n.y > 0.55) c.copy(cTop);
    else c.copy(cShade).lerp(cLit, smoothstep(-0.5, 0.6, n.x * 0.75 + n.z * 0.45 + n.y * 0.5)).lerp(cDeep, (1 - smoothstep(0, 4.5, y)) * 0.55);
    for (const v of [p0, p1, p2]) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

let chunkGeo = null;
function chunkGeometry() {
  if (chunkGeo) return chunkGeo;
  // a growler: a flat-topped lump one unit across, scaled to each piece
  chunkGeo = shard(5, 1, 0.75, { tip: 0.6, foot: -0.7, slant: 1, seed: 7 });
  chunkGeo.computeBoundingSphere();
  return chunkGeo;
}

function inkedIce(parts, outline) {
  const geo = merge(parts);
  for (const p of parts) p.dispose();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, outline));
  return g;
}

// the berg's solid parts, as circles in its own space: [x, z, r]
const BERG_ROCKS = [[0, 0, 8.5], [-6, 2.5, 7], [6.5, -4, 4.5], [2, 6, 7.5], [-8.5, -5.5, 3.2]];
const SLAB = { x: 11.5, z: 1, r: 3.6 };
const CHUNKS = 5;

/** The iceberg's model: { group, berg, slab } with the slab on a pivot at the waterline, ready to fall away. */
export function buildIceberg() {
  const berg = inkedIce([
    shard(5, 7.8, 21, { lean: [1.6, -1.2], slant: 0.6, tip: 0.16, seed: 1 }),                  // the great blade
    shard(6, 7.6, 10.5, { at: [-6, 2.5], lean: [-1.2, 0.4], slant: 3.4, tip: 0.5, seed: 2 }),   // its shoulder
    shard(4, 4.6, 15, { at: [6.5, -4], lean: [0.8, -0.6], slant: 5, tip: 0.1, seed: 3 }),       // a second spire
    shard(6, 8.2, 3.4, { at: [2, 6], slant: 1.6, tip: 0.72, seed: 4 }),                         // a low shelf at its foot
    shard(4, 3.3, 6.5, { at: [-8.5, -5.5], lean: [-0.6, -0.4], slant: 2.2, tip: 0.2, seed: 5 }),
  ], propOutline);
  const slab = inkedIce([shard(4, 3.5, 14, { at: [1.2, 0], lean: [0.5, 0], slant: 0, tip: 0.42, foot: -1.3, seed: 6 })], propOutline);
  slab.position.set(SLAB.x - 1.2, -1.2, SLAB.z);
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  group.add(berg, slab);
  return { group, berg, slab };
}

/**
 * An iceberg that calves: a slab splits off with a crack and a great splash,
 * and for a while there is loose ice in the water round it. The berg and its
 * pieces are solid; in the end it rolls over and goes down.
 */
export class Iceberg {
  constructor(scene, puffs) {
    Object.assign(this, buildIceberg());
    this.puffs = puffs;
    this.scene = scene;
    this.chunks = [];
    for (let i = 0; i < CHUNKS; i++) {
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(chunkGeometry(), propMaterial), new THREE.Mesh(chunkGeometry(), thinOutline));
      mesh.visible = false;
      scene.add(mesh);
      this.chunks.push({ mesh, r: 0 });
    }
    this.pos = { x: 0, z: 0 };
    this.size = 14;
    this.done = true;
    this.group.visible = false;
    scene.add(this.group);
  }

  start({ at, boat, rng }) {
    this.pos.x = at.x; this.pos.z = at.z;
    // the side that will break away faces you
    this.yaw = Math.atan2(boat.x - at.x, boat.z - at.z) - PI / 2 + (rng() - 0.5) * 0.8;
    this.drift = rng() * TAU;
    this.calveIn = 9 + rng() * 6;
    this.life = 95 + rng() * 25;   // after it calves
    this.age = 0; this.t = 0;
    this.phase = 'float';
    this.sink = 0; this.roll = 0; this.fall = 0;
    this.slab.visible = true;
    for (const c of this.chunks) { c.mesh.visible = false; c.r = 0; }
    this.rng = rng;
    this.done = false;
    this.group.visible = true;
    this.place();
  }

  leave() { if (!this.done && this.phase !== 'founder') { this.phase = 'founder'; this.t = 0; } }
  stop() {
    this.done = true;
    this.group.visible = false;
    for (const c of this.chunks) c.mesh.visible = false;
  }

  /** A point in the berg's own space, out in the world. */
  world(x, z) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.pos.x + x * c + z * s, this.pos.z - x * s + z * c];
  }

  place() {
    const g = this.group;
    g.position.set(this.pos.x, Math.sin(this.age * 0.5) * 0.25 - this.sink, this.pos.z);
    g.rotation.set(Math.sin(this.age * 0.37) * 0.015, this.yaw, Math.sin(this.age * 0.43) * 0.02 + this.roll);
    // the slab leans out, slowly and then all at once, and goes under
    const k = this.fall;
    this.slab.rotation.z = -k * k * 1.5;
    this.slab.position.y = -1.2 - smoothstep(0.75, 1, k) * 5;
  }

  update(dt, ctx) {
    if (this.done) return;
    const b = ctx.boat, d = Math.hypot(b.x - this.pos.x, b.z - this.pos.z);
    this.age += dt; this.t += dt;
    this.pos.x += Math.sin(this.drift) * 0.45 * dt; this.pos.z += Math.cos(this.drift) * 0.45 * dt;

    if (this.phase === 'float') {
      this.calveIn -= dt;
      // it waits a little for you to be watching, but not for ever
      if (this.calveIn <= 0 || (this.age > 4 && d < 150)) {
        this.phase = 'calve'; this.t = 0;
        ctx.play('crack', this.pos.x, this.pos.z);
        if (d < 420) ctx.say(SIGHTINGS.calve);
      }
    } else if (this.phase === 'calve') {
      this.fall = clamp(this.t / 2.6, 0, 1);
      if (this.fall >= 1) {
        this.phase = 'adrift'; this.t = 0;
        this.slab.visible = false;
        const [sx, sz] = this.world(SLAB.x + 7, SLAB.z);
        this.puffs.splash(sx, sz, 30, 12, 13, 1.1);
        this.puffs.splash(sx, sz, 14, 5, 7, 0.8);
        ctx.play('breach', sx, sz);
        // what's left of the slab comes up as loose ice and spreads out
        this.chunks.forEach((c, i) => {
          const a = this.yaw + PI / 2 + (i / (CHUNKS - 1) - 0.5) * 2.6 + (this.rng() - 0.5) * 0.4, v = 3 + this.rng() * 3.5;
          Object.assign(c, { x: sx, z: sz, vx: Math.sin(a) * v, vz: Math.cos(a) * v, r: 1.5 + this.rng() * 1.3, spin: (this.rng() - 0.5) * 0.4, phase: this.rng() * TAU, k: 0 });
          c.mesh.visible = true;
          c.mesh.rotation.y = this.rng() * TAU;
        });
      }
    } else if (this.phase === 'adrift') {
      this.life -= dt;
      if (this.life <= 0) this.leave();
    } else {
      // foundering: it rolls onto its side and slides under
      const k = this.t / 8;
      this.roll = smoothstep(0, 0.6, k) * 0.95;
      this.sink = smoothstep(0.25, 1, k) * 24;
      if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) && k < 0.85) this.puffs.splash(...this.world((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 12), 8, 4, 6, 0.8);
      if (this.t - dt < 0.3 && this.t >= 0.3) ctx.play('breach', this.pos.x, this.pos.z);
      if (k >= 1) { this.stop(); return; }
    }

    // loose ice: it bobs, drifts apart, and after a while melts away
    const melting = this.phase === 'founder';
    for (const c of this.chunks) {
      if (!c.mesh.visible) continue;
      c.k = melting ? c.k - dt / 5 : Math.min(1, c.k + dt / 1.2);
      if (c.k <= 0) { c.mesh.visible = false; c.r = 0; continue; }
      c.x += c.vx * dt; c.z += c.vz * dt;
      c.vx *= Math.exp(-0.35 * dt); c.vz *= Math.exp(-0.35 * dt);
      c.mesh.position.set(c.x, waveHeight(c.x, c.z) + Math.sin(this.age * 1.3 + c.phase) * 0.15 - (1 - c.k) * c.r, c.z);
      c.mesh.rotation.y += c.spin * dt;
      c.mesh.scale.setScalar(c.r);
      if (c.k > 0.6) ctx.bump(c.x, c.z, c.r * 0.95, 'ice');
    }
    // the berg itself, while it still stands above the water
    if (this.sink < 6) {
      for (const [x, z, r] of BERG_ROCKS) ctx.bump(...this.world(x, z), r, 'ice');
      if (this.slab.visible && this.fall < 0.5) ctx.bump(...this.world(SLAB.x, SLAB.z), SLAB.r, 'ice');
    }
    this.place();
  }
}

// -------------------------------------------------------------------- bloom
/**
 * The glowing bloom: a wide patch of sea that shines blue at night, and makes
 * your wake shine too while you're in it. Nothing to do but look. There is no
 * model: the light is drawn by the ocean itself (ctx.glow).
 */
export class Bloom {
  constructor() {
    this.pos = { x: 0, z: 0 };
    this.size = 170;
    this.done = true;
    this.wake = 0;   // how much the boat's wake should glow (0-1): it is in the patch
  }

  start({ at, rng }) {
    this.pos.x = at.x; this.pos.z = at.z;
    this.size = 160 + rng() * 30;
    this.drift = rng() * TAU;
    this.life = 100 + rng() * 40;
    this.k = 0; this.wake = 0;
    this.told = false;
    this.phase = 'glow';
    this.done = false;
  }

  leave() { if (!this.done) this.phase = 'fade'; }
  stop() { this.done = true; this.k = 0; this.wake = 0; }

  update(dt, ctx) {
    if (this.done) return;
    const b = ctx.boat, inside = Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < this.size * 0.9;
    this.pos.x += Math.sin(this.drift) * 0.4 * dt; this.pos.z += Math.cos(this.drift) * 0.4 * dt;
    if (this.phase === 'glow') {
      this.k = Math.min(1, this.k + dt / 4);
      // it lingers while you're in it, and goes out with the night
      this.life -= inside ? dt * 0.3 : dt;
      if (inside && !this.told && this.k > 0.6) { this.told = true; ctx.say(SIGHTINGS.bloomIn); }
      if (this.life <= 0 || ctx.night < 0.4) this.leave();
    } else {
      this.k -= dt / 6;
      if (this.k <= 0) { ctx.glow(0, 0, 0, 0); this.stop(); return; }
    }
    this.wake = damp(this.wake, inside ? this.k : 0, 1.5, dt);
    ctx.glow(this.pos.x, this.pos.z, this.size, this.k);
  }
}

// ------------------------------------------------------------------- bottle
let bottleGeo = null;
function bottleGeometry() {
  if (bottleGeo) return bottleGeo;
  const glass = '#3f9a6a', glass2 = '#2c7a52';
  const parts = [
    part(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 10), glass, { y: 0.17, c2: glass2, split: 0.35 }),
    part(new THREE.SphereGeometry(0.11, 10, 6), glass2, { sy: 0.4 }),
    part(new THREE.ConeGeometry(0.11, 0.14, 10), glass, { y: 0.41 }),
    part(new THREE.CylinderGeometry(0.04, 0.045, 0.16, 8), glass, { y: 0.48 }),
    part(new THREE.CylinderGeometry(0.042, 0.036, 0.07, 8), '#c9a26a', { y: 0.585 }),
    // the rolled paper, seen through the glass
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 6), '#fff4dc', { y: 0.18, x: 0.07, sx: 0.5 }),
  ];
  bottleGeo = merge(parts);
  for (const p of parts) p.dispose();
  return bottleGeo;
}

/** The bottle's model: { group, glint }. Built three times life size, so it can be found at all. */
export function buildBottle() {
  const body = new THREE.Group();
  body.add(new THREE.Mesh(bottleGeometry(), propMaterial), new THREE.Mesh(bottleGeometry(), thinOutline));
  body.scale.setScalar(3);
  body.position.y = -0.55;
  const tilt = new THREE.Group();
  tilt.add(body);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff6d8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glint.position.y = 0.9;
  const group = new THREE.Group();
  group.add(tilt, glint);
  return { group, tilt, glint };
}

/**
 * A message in a bottle, bobbing on the swell with a glint you can see from a
 * way off. It does nothing but wait: stop beside it and the director offers
 * to haul it up (sea-events.js decides what's inside).
 */
export class Bottle {
  constructor(scene) {
    Object.assign(this, buildBottle());
    this.pos = { x: 0, z: 0 };
    this.size = 4;
    this.done = true;
    this.group.visible = false;
    scene.add(this.group);
  }

  start({ at, rng }) {
    this.pos.x = at.x; this.pos.z = at.z;
    this.life = 150;
    this.age = rng() * 10;
    this.down = 0;
    this.phase = 'bob';
    this.done = false;
    this.group.visible = true;
    this.update(0, { boat: { x: at.x + 999, z: at.z } });
  }

  leave() { if (!this.done) this.phase = 'sink'; }
  stop() { this.done = true; this.group.visible = false; }

  update(dt, ctx) {
    if (this.done) return;
    const b = ctx.boat, d = Math.hypot(b.x - this.pos.x, b.z - this.pos.z);
    this.age += dt;
    if (this.phase === 'sink') { this.down += dt * 1.2; if (this.down > 2) { this.stop(); return; } }
    else {
      this.life -= dt;
      // it's gone when nobody is near to see it go
      if (this.life <= 0 && (d > 220 || this.life < -150)) { this.stop(); return; }
    }
    const t = this.age;
    this.group.position.set(this.pos.x, waveHeight(this.pos.x, this.pos.z) + Math.sin(t * 1.7) * 0.12 - this.down, this.pos.z);
    this.tilt.rotation.set(Math.sin(t * 1.1) * 0.25, t * 0.2, 0.95 + Math.sin(t * 1.4) * 0.2);
    // a sharp flash every second or two, as the glass catches the light
    const flash = Math.pow(Math.max(0, Math.sin(t * 3.7)), 10);
    this.glint.scale.setScalar(0.9 + flash * 5.5);
    this.glint.material.opacity = (0.25 + flash * 0.75) * (this.phase === 'sink' ? 0 : 1);
  }
}
