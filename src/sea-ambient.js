// The sea's everyday life, always on and never an "event": gulls that come out
// to wheel over the mast when you sail near land, seabirds circling over reefs,
// and fish jumping in calm water. The director (sea-events.js) owns one of
// these and calls update() every frame; clear() hides everything at once.
// Models face +z, like the boats, and their geometry is built once and shared.
import * as THREE from 'three';
import { part, merge, propMaterial, thinOutline } from './props.js';
import { waveHeight } from './waves.js';
import { clamp, damp, dampAngle, lerp, wrapAngle, TAU } from './util.js';

const PI = Math.PI;
const GULL = { white: '#f4f4f0', grey: '#9aa3ad', tip: '#2b3038', beak: '#e8b23a', eye: '#141c28' };
const FISH = { back: '#7f97a6', belly: '#eef3f5', fin: '#6a8291', eye: '#141c28' };
const SHORE_NEAR = 380;   // m from an island's shore: the gulls come out
const REEF_NEAR = 600;    // m from a reef's middle: you see its birds
const LOOK_EVERY = 0.5;   // s between looks for the nearest island and reef
const _want = new THREE.Vector3();

// --------------------------------------------------------------- models
let gullGeo = null;
function gullGeometry() {
  if (gullGeo) return gullGeo;
  const body = [
    part(new THREE.SphereGeometry(0.22, 10, 7), GULL.white, { sy: 0.95, sz: 2.6 }),
    part(new THREE.SphereGeometry(0.15, 8, 6), GULL.white, { y: 0.1, z: 0.52 }),
    part(new THREE.ConeGeometry(0.045, 0.2, 4), GULL.beak, { y: 0.08, z: 0.72, rx: PI / 2 }),
    part(new THREE.BoxGeometry(0.3, 0.04, 0.32), GULL.white, { y: 0.02, z: -0.62 }),
  ];
  for (const s of [-1, 1]) body.push(part(new THREE.SphereGeometry(0.025, 6, 4), GULL.eye, { x: s * 0.11, y: 0.14, z: 0.6 }));
  // one wing each side, built round its root so it can flap
  const wing = (s) => [
    part(new THREE.BoxGeometry(0.95, 0.05, 0.42), GULL.grey, { x: s * 0.47 }),
    part(new THREE.BoxGeometry(0.4, 0.045, 0.3), GULL.tip, { x: s * 1.12, y: 0.02, z: -0.1, ry: s * 0.25 }),
  ];
  const once = (parts) => { const g = merge(parts); for (const p of parts) p.dispose(); return g; };
  gullGeo = { body: once(body), left: once(wing(1)), right: once(wing(-1)) };
  return gullGeo;
}

let fishGeo = null;
function fishGeometry() {
  if (fishGeo) return fishGeo;
  const parts = [
    part(new THREE.SphereGeometry(0.1, 10, 7), FISH.back, { sx: 0.45, sy: 0.95, sz: 2.4, c2: FISH.belly, split: 0.45, soft: 0.08 }),
    part(new THREE.SphereGeometry(1, 6, 4), FISH.fin, { y: 0.09, z: 0.02, sx: 0.015, sy: 0.05, sz: 0.07 }),
  ];
  for (const s of [-1, 1]) {
    parts.push(
      part(new THREE.SphereGeometry(1, 6, 4), FISH.fin, { y: s * 0.045, z: -0.29, sx: 0.015, sy: 0.08, sz: 0.06, rx: -s * 0.6 }),
      part(new THREE.SphereGeometry(0.016, 6, 4), FISH.eye, { x: s * 0.04, y: 0.03, z: 0.15 }),
    );
  }
  fishGeo = merge(parts);
  for (const p of parts) p.dispose();
  return fishGeo;
}

const inked = (geo) => [new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, thinOutline)];

/**
 * A gull with a 2.9 m wingspan: { group, wings: [left, right] }. The wings are
 * pivots at the shoulders; flap them with left.rotation.z = a, right.rotation.z = -a
 * (a > 0 lifts both tips).
 */
export function buildGull() {
  const G = gullGeometry();
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  group.add(...inked(G.body));
  const wings = [[G.left, 1], [G.right, -1]].map(([geo, s]) => {
    const w = new THREE.Group();
    w.position.set(s * 0.14, 0.06, 0.05);
    w.add(...inked(geo));
    group.add(w);
    return w;
  });
  return { group, wings };
}

/** A small silver fish, about half a metre long. */
export function buildFish() {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(...inked(fishGeometry()));
  return g;
}

// --------------------------------------------------------------- birds
/** One bird: the model plus where it is, how it moves and how it flaps. */
function bird(root) {
  const b = buildGull();
  b.group.visible = false;
  root.add(b.group);
  return Object.assign(b, {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), last: new THREE.Vector3(),
    state: 'off', t: 0, heading: 0, bank: 0, flap: 0, beat: Math.random() * TAU,
    flapFor: 0, glideFor: Math.random() * 3,
    a: Math.random() * TAU, R: 9 + Math.random() * 6, y: 12 + Math.random() * 7,
    w: (0.45 + Math.random() * 0.3) * (Math.random() < 0.5 ? -1 : 1), k: Math.random() * TAU,
  });
}

/** Flap for a second or two, then glide a while; always flap when `hard`. */
function flapWings(b, dt, hard) {
  if (b.flapFor > 0) b.flapFor -= dt;
  else if ((b.glideFor -= dt) <= 0) { b.flapFor = 0.8 + Math.random() * 1.4; b.glideFor = 1.5 + Math.random() * 3; }
  const on = hard || b.flapFor > 0 ? 1 : 0;
  b.flap = damp(b.flap, on, 4, dt);
  b.beat += dt * 17;
  const a = 0.1 + Math.sin(b.beat) * 0.6 * b.flap;
  b.wings[0].rotation.z = a; b.wings[1].rotation.z = -a;
}

/** Face along the velocity, nose with the climb, banked into the turn. */
function faceFlight(b, dt) {
  const v = b.vel, flat = Math.hypot(v.x, v.z);
  if (flat > 0.5) {
    const h = Math.atan2(v.x, v.z), turn = wrapAngle(h - b.heading) / Math.max(dt, 1e-3);
    b.heading = dampAngle(b.heading, h, 6, dt);
    b.bank = damp(b.bank, clamp(-Math.atan(flat * turn / 9.8), -0.8, 0.8), 3, dt);
  }
  const g = b.group;
  g.position.copy(b.pos);
  g.rotation.set(clamp(-Math.atan2(v.y, Math.max(flat, 1)), -0.6, 0.6), b.heading, b.bank);
}

// --------------------------------------------------------------- the ambient sea
export class SeaAmbient {
  constructor(scene, puffs) {
    this.puffs = puffs;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.followers = [0, 1, 2].map(() => bird(this.root));
    this.circlers = [0, 1, 2].map(() => bird(this.root));
    for (const c of this.circlers) { c.R = 25 + Math.random() * 15; c.y = 22 + Math.random() * 8; c.w = (0.18 + Math.random() * 0.12) * Math.sign(c.w); }
    this.fish = buildFish();
    this.fish.visible = false;
    this.root.add(this.fish);
    this.clear();
  }

  /** Hide everything at once (port, ashore, a new voyage). */
  clear() {
    for (const b of [...this.followers, ...this.circlers]) { b.state = 'off'; b.group.visible = false; }
    this.fish.visible = false;
    this.jump = null;
    this.jumpIn = 5 + Math.random() * 7;
    this.lookIn = 0;
    this.island = null; this.reef = null;
    this.callIn = 0;
    this.time = 0;
  }

  /** The nearest island (by its shore) and reef, if close enough. Twice a second, not every frame. */
  look(world, x, z) {
    let best = SHORE_NEAR, isle = null;
    for (const I of world.islands) {
      if (I.isReef) continue;
      const d = Math.hypot(I.x - x, I.z - z) - (I.r ?? I.bound);
      if (d < best) { best = d; isle = I; }
    }
    let near = REEF_NEAR, reef = null;
    for (const R of world.reefs || []) {
      const d = Math.hypot(R.x - x, R.z - z);
      if (d < near) { near = d; reef = R; }
    }
    this.island = isle; this.reef = reef;
  }

  update(dt, ctx) {
    dt = Math.min(dt, 0.1);
    if (dt <= 0) return;
    this.time += dt;
    const b = ctx.boat;
    if ((this.lookIn -= dt) <= 0) { this.lookIn = LOOK_EVERY; this.look(ctx.world, b.x, b.z); }
    const day = ctx.night < 0.5;
    this.follow(dt, ctx, day && ctx.storm < 0.5 ? this.island : null);
    this.circle(dt, day ? this.reef : null);
    this.leap(dt, ctx);
  }

  /** Gulls out from `isle` to wheel over the mast; with no island, they go home. */
  follow(dt, ctx, isle) {
    const b = ctx.boat, fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const cx = b.x - fx * 4, cz = b.z - fz * 4;   // a little behind the mast
    let arrived = false;
    for (const g of this.followers) {
      if (isle && g.state !== 'in') {
        if (g.state === 'off') {
          // in from the island's side, high up, already flying towards you
          const dx = isle.x - b.x, dz = isle.z - b.z, d = Math.hypot(dx, dz) || 1, s = (Math.random() - 0.5) * 30;
          g.pos.set(b.x + (dx / d) * (90 + Math.random() * 40) - (dz / d) * s, 26 + Math.random() * 6, b.z + (dz / d) * (90 + Math.random() * 40) + (dx / d) * s);
          g.vel.set(-dx / d * 10, -1, -dz / d * 10);
          g.heading = Math.atan2(g.vel.x, g.vel.z); g.bank = 0;
          g.group.visible = true;
          arrived = true;
        }
        g.state = 'in'; g.t = 0; g.home = isle;
        g.last.set(NaN, 0, 0);
      } else if (!isle && g.state === 'in') { g.state = 'out'; g.t = 0; }
      if (g.state === 'off') continue;
      g.t += dt;
      const desired = _want;
      if (g.state === 'in') {
        // wheel round the point over the boat; steer for it, matching its speed
        g.a += g.w * dt;
        const tx = cx + Math.cos(g.a) * g.R, tz = cz + Math.sin(g.a) * g.R;
        const ty = g.y + Math.sin(this.time * 0.5 + g.k) * 1.5;
        if (Number.isNaN(g.last.x)) g.last.set(tx, ty, tz);
        desired.set((tx - g.last.x) / dt, (ty - g.last.y) / dt, (tz - g.last.z) / dt);
        g.last.set(tx, ty, tz);
        desired.x += (tx - g.pos.x) * 1.2; desired.y += (ty - g.pos.y) * 1.2; desired.z += (tz - g.pos.z) * 1.2;
        const top = Math.abs(b.speed) + 16;
        if (desired.length() > top) desired.setLength(top);
      } else {
        // peel away up and back towards land, then gone
        const home = g.home, dx = home ? home.x - g.pos.x : -fx, dz = home ? home.z - g.pos.z : -fz, d = Math.hypot(dx, dz) || 1;
        desired.set(dx / d * 14, 5, dz / d * 14);
        if (g.t > 6) { g.state = 'off'; g.group.visible = false; continue; }
      }
      g.vel.x = damp(g.vel.x, desired.x, 2.5, dt); g.vel.y = damp(g.vel.y, desired.y, 2.5, dt); g.vel.z = damp(g.vel.z, desired.z, 2.5, dt);
      g.pos.addScaledVector(g.vel, dt);
      faceFlight(g, dt);
      flapWings(g, dt, g.state === 'out' || g.vel.y > 2);
    }
    // a cry when they come, and now and then while they stay
    const lead = this.followers.find((g) => g.state === 'in');
    if (arrived) this.callIn = 4;   // once they're over the boat
    if (lead && (this.callIn -= dt) <= 0) {
      ctx.play('gull', lead.pos.x, lead.pos.z);
      this.callIn = 20 + Math.random() * 20;
    }
  }

  /** Seabirds round and round over a reef, high up. */
  circle(dt, reef) {
    for (const g of this.circlers) {
      if (!reef) { g.group.visible = false; continue; }
      g.a += g.w * dt;
      const R = g.R, y = g.y + Math.sin(this.time * 0.4 + g.k) * 2;
      g.pos.set(reef.x + Math.cos(g.a) * R, y, reef.z + Math.sin(g.a) * R);
      // along the circle: the velocity is its tangent
      g.vel.set(-Math.sin(g.a) * R * g.w, Math.cos(this.time * 0.4 + g.k) * 0.8, Math.cos(g.a) * R * g.w);
      if (!g.group.visible) { g.heading = Math.atan2(g.vel.x, g.vel.z); g.bank = 0; g.group.visible = true; }
      faceFlight(g, dt);
      flapWings(g, dt, false);
    }
  }

  /** Now and then in calm water a fish jumps near the boat, with a little splash out and in. */
  leap(dt, ctx) {
    const f = this.fish, j = this.jump;
    if (j) {
      j.t += dt;
      const u = Math.min(1, j.t / 0.9), run = 2.5, rise = 1.1;
      const x = j.x + j.dx * (u - 0.5) * run, z = j.z + j.dz * (u - 0.5) * run;
      f.position.set(x, waveHeight(x, z) - 0.1 + Math.sin(u * PI) * rise, z);
      f.rotation.set(-Math.atan2(Math.cos(u * PI) * rise * PI, run), j.h, Math.sin(j.t * 30) * 0.08);
      if (u >= 1) {
        this.puffs.splash(x, z, 3, 1.2, 1.8, 0.12);
        f.visible = false;
        this.jump = null;
      }
      return;
    }
    if ((this.jumpIn -= dt) > 0) return;
    this.jumpIn = 5 + Math.random() * 7;
    if (ctx.wave >= 0.55) return;
    const b = ctx.boat, a = b.heading + (Math.random() - 0.5) * PI * 1.3, d = lerp(14, 40, Math.random());
    const x = b.x + Math.sin(a) * d, z = b.z + Math.cos(a) * d;
    if (ctx.world.heightAt(x, z) >= -6) return;
    const h = Math.random() * TAU, dx = Math.sin(h), dz = Math.cos(h);
    this.jump = { x, z, h, dx, dz, t: 0 };
    this.puffs.splash(x - dx * 1.25, z - dz * 1.25, 3, 1.2, 1.8, 0.12);
    f.position.set(x - dx * 1.25, waveHeight(x, z) - 0.1, z - dz * 1.25);
    f.visible = true;
  }
}
