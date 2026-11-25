// The ghost ship (Phase 7): a pale, see-through ship with green lanterns that
// sails silently past at night. She has no wake, doesn't ride the swell and
// makes no sound. Follow her, not too close, and she leads you to something
// she left behind; come alongside and she fades, as she does at first light.
//
// An actor for the event director (sea-events.js), like the animals in
// sea-life.js: start(), update(dt, ctx), leave(), pos, size, done. When she has
// led you somewhere, `cacheAt` is where, and the director puts the find there.
//
// She is drawn in two passes so that she reads as one see-through shell and
// not as a tangle of overlapping sails: first her depth alone, then her colour
// wherever that depth is in front. Both passes come after the sea and the
// islands, so nothing behind her is cut away.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowBoost } from './toon.js';
import { glowTexture } from './world.js';
import { openWater, clearPath, clearHeading } from './sightings.js';
import { SIGHTINGS } from './story-text.js';
import { clamp, damp } from './util.js';

const PI = Math.PI;
const C = { hull: '#9fdcc8', deck: '#c9f2e2', sail: '#e4fff3', spar: '#b6ead8', lamp: '#8dffb9' };
const SPEED = 6.2;       // m/s: a little slower than a small boat under full sail
const TOO_CLOSE = 38;    // nearer than this and she fades
const FOLLOWING = 340;   // within this of her when she stops, you were following

/** Give every vertex of a geometry one colour, and drop what the merge doesn't share. */
function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => geo.applyMatrix4(new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));

/** The hull: sections lofted from stern to bow, with a deck. Bow towards +z. */
function hullGeometry() {
  const N = 14, pos = [], idx = [];
  // each section: keel, turn of the bilge and rail, port and starboard
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -8.5 + t * 18;
    const w = 3.1 * Math.pow(Math.sin(Math.min(1, t * 1.25 + 0.45) * PI * 0.5), 0.8) * (t > 0.62 ? Math.pow(Math.max(0, 1 - (t - 0.62) / 0.38), 0.75) : 1) + 0.04;
    const sheer = 2.3 + 2.2 * Math.pow(Math.abs(t - 0.45) * 1.7, 2.2) + (t < 0.2 ? (0.2 - t) * 7 : 0); // high at the stern castle and the bow
    const keel = -1.6 + Math.pow(Math.max(0, t - 0.75) * 4, 2) * 1.5;
    pos.push(-w, sheer, z, -w * 0.82, keel * 0.35, z, 0, keel, z, w * 0.82, keel * 0.35, z, w, sheer, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 5, b = a + 5;
    for (let k = 0; k < 4; k++) idx.push(a + k, a + k + 1, b + k, b + k, a + k + 1, b + k + 1);
    idx.push(a + 4, a, b + 4, b + 4, a, b); // the deck, rail to rail
  }
  idx.push(0, 1, 2, 0, 2, 3, 0, 3, 4); // the transom
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/** A square sail hanging from its yard: bellied, with a torn foot. */
function sailGeometry(w, h, seed) {
  const g = new THREE.PlaneGeometry(w, h, 8, 5), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = x / w + 0.5, v = y / h + 0.5;
    let yy = y;
    // the foot hangs in rags: every other strip is torn short
    if (v < 0.01) yy += (0.12 + 0.5 * Math.abs(Math.sin(u * 9.3 + seed * 2.1)) * (Math.sin(u * 23 + seed) > 0 ? 1 : 0.25)) * h * 0.42;
    p.setXYZ(i, x * (0.9 + 0.1 * v), yy, Math.sin(u * PI) * Math.sin(Math.min(1, (1 - v) * 1.3) * PI * 0.5) * w * 0.14);
  }
  g.computeVertexNormals();
  return g;
}

/** Where her three lanterns hang (ship space). */
const LAMPS = [[0, 6.3, -8.2], [1.9, 4.4, 1.5], [0, 4.6, 9.3]];

let ghostGeo = null;
function ghostGeometry() {
  if (ghostGeo) return ghostGeo;
  const parts = [tint(hullGeometry(), C.hull)];
  const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  // the stern castle and its rail, a deck house, the bowsprit
  parts.push(tint(at(box(4.4, 1.5, 3.4), 0, 3.6, -6.6), C.deck), tint(at(box(4.8, 0.25, 3.8), 0, 4.45, -6.6), C.spar));
  parts.push(tint(at(box(2.2, 1.1, 2.6), 0, 3.0, -1.6), C.deck));
  parts.push(tint(at(cyl(0.1, 0.17, 6.5), 0, 4.2, 11.4, 1.2), C.spar));
  // two masts with yards and ragged square sails, a smaller one at the stern
  const masts = [[2.4, 17, [[12.2, 8.6, 5.6], [7.4, 6.6, 4.0]]], [-3.6, 15, [[10.8, 7.6, 5.0], [6.6, 5.6, 3.4]]], [-7.2, 9.5, [[7.6, 4.4, 3.4]]]];
  let seed = 1;
  for (const [z, h, sails] of masts) {
    parts.push(tint(at(cyl(0.11, 0.2, h), 0, 2.2 + h / 2, z), C.spar));
    for (const [y, w, sh] of sails) {
      parts.push(tint(at(cyl(0.07, 0.07, w + 0.6), 0, y + 2.2, z + 0.12, 0, 0, PI / 2), C.spar));
      parts.push(tint(at(sailGeometry(w, sh, seed++), 0, y + 2.2 - sh / 2, z + 0.16), C.sail));
    }
    parts.push(tint(at(cyl(0.5, 0.36, 0.5, 8), 0, 2.2 + h * 0.8, z), C.spar)); // crow's nest
    parts.push(tint(at(box(0.05, 0.7, 1.5), 0, 2.2 + h - 0.45, z - 0.8), C.sail)); // a pennant, hanging limp
  }
  // stays from the mastheads to the bowsprit and the stern
  const stay = (x0, y0, z0, x1, y1, z1) => {
    const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = d.length();
    const g = cyl(0.03, 0.03, len, 4);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return tint(at(g, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), C.spar);
  };
  parts.push(stay(0, 19, 2.4, 0, 5.6, 14.2), stay(0, 17, -3.6, 0, 19, 2.4), stay(0, 11.6, -7.2, 0, 17, -3.6), stay(0, 11.6, -7.2, 0, 5.2, -8.6));
  for (const s of [-1, 1]) parts.push(stay(s * 3, 2.7, 1.2, 0, 16, 2.4), stay(s * 2.9, 2.8, -4.6, 0, 14.5, -3.6));
  // the lanterns themselves: brighter than the rest of her
  for (const [x, y, z] of LAMPS) parts.push(tint(at(new THREE.SphereGeometry(0.34, 8, 6), x, y, z), C.lamp), tint(at(cyl(0.03, 0.03, 0.7, 4), x, y + 0.6, z), C.spar));
  ghostGeo = mergeGeometries(parts);
  ghostGeo.computeBoundingSphere();
  for (const p of parts) p.dispose();
  return ghostGeo;
}

/**
 * The ghost ship's model: { group, setFade(k, time) }. k = 0 is gone, 1 is
 * as solid as she gets.
 */
export function buildGhostShip() {
  const geo = ghostGeometry();
  // pass one: depth only (drawn with the see-through things, after the sea)
  const veil = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, side: THREE.DoubleSide }));
  veil.renderOrder = 6;
  // pass two: her colour where that depth is nearest; brighter on edges turned away from you
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGhostN;\nvarying vec3 vGhostV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGhostN = normalize(normalMatrix * normal);\nvGhostV = -(modelViewMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGhostN;\nvarying vec3 vGhostV;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat ghostRim = 1.0 - abs(dot(normalize(vGhostN), normalize(vGhostV)));\ndiffuseColor.a *= 0.42 + 0.58 * ghostRim * ghostRim;\ndiffuseColor.rgb *= 0.8 + 0.5 * ghostRim;');
  };
  mat.customProgramCacheKey = () => 'ghostShip';
  const body = new THREE.Mesh(geo, mat);
  body.renderOrder = 7;
  const group = new THREE.Group();
  group.add(veil, body);
  const glows = LAMPS.map(([x, y, z]) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7dffb0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.set(x, y, z);
    glow.renderOrder = 8;
    group.add(glow);
    return glow;
  });
  function setFade(k, time = 0) {
    const on = k > 0.01;
    group.visible = on;
    mat.opacity = 0.62 * k;
    glows.forEach((glow, i) => {
      const flick = 1 + Math.sin(time * 2.3 + i * 2.1) * 0.08 + Math.sin(time * 5.7 + i) * 0.04;
      glow.material.opacity = k * 0.85;
      glow.material.color.set(0x7dffb0).multiplyScalar(Math.min(glowBoost.value, 1.6));
      glow.scale.setScalar(5.5 * flick);
    });
  }
  setFade(0);
  return { group, setFade };
}

export class GhostShip {
  constructor(scene) {
    Object.assign(this, buildGhostShip());
    this.pos = { x: 0, z: 0 };
    this.size = 12;
    this.done = true;
    this.cacheAt = null;
    scene.add(this.group);
  }

  start({ at: where, boat, rng, sea }) {
    this.pos.x = where.x; this.pos.z = where.z;
    this.sea = sea;
    this.cacheAt = null;
    // She sails across your bow and on towards a spot she means to lead you to:
    // open water some way off, with a clear run to it.
    this.lead = null;
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
      else if (ctx.night < 0.45) this.leave(SIGHTINGS.dawn, ctx);
      else if (this.lead) {
        if (Math.hypot(this.lead.x - this.pos.x, this.lead.z - this.pos.z) < 14) {
          if (following) { this.cacheAt = { x: this.lead.x, z: this.lead.z }; this.leave(SIGHTINGS.led, ctx); } else this.leave();
        } else if (this.age > 300) this.leave();
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
