// The kraken: the finale of the rival captain's story. Sable's sloop is held
// fast in the middle of a deep-water trench, and the player has to steer
// through the tentacles, throw a line and tow the sloop out to where the
// creature can't follow.
//
// There is no combat and no hull damage. Every tentacle announces itself (a
// dark shadow on the water and a boil of bubbles) a couple of seconds before
// it comes down, and a slam that lands simply fades out and puts you back at
// the trench edge to try again.
//
// This module owns the set piece only: tentacles, shadows, bubbles, the
// creature's eyes, the coil round the sloop and the tow line. rival.js owns
// the sloop itself (and animates it), the dialogue and what happens next.
//
//   phase 'approach'  the sloop is held at the centre; reach it and throw a line
//   phase 'tow'       line attached; haul the sloop out past site.r
//   phase 'done'      clear of the trench (opts.onRescue has been called)
import * as THREE from 'three';
import { waveHeight, waveUniforms, WAVE_GLSL } from './waves.js';
import { part, merge, propMaterial, propOutline } from './props.js';
import { clamp, lerp, smoothstep, damp, TAU } from './util.js';
import { TowLine } from './tow.js';

// ---------------------------------------------------------------- tuning
const N_TENT = 7;            // tentacles that strike (one more slot is the coil round the sloop)
const MAX_ACTIVE = 3;        // telegraphing or striking at once
const N_SEG = 22;            // body segments per tentacle
const LEN = 28;              // tentacle length (u)
const R_ROOT = 2.0, R_TIP = 0.5;
const STRIP_HALF = 13;       // the slam covers a strip this far either side of its target…
const STRIP_W = 5;           // …and this far to each side of its line
const T_TELE = 2.2, T_RISE = 0.9, T_SLAM = 0.35, T_LIE = 0.6, T_SINK = 0.9, T_DUCK = 0.5;
const HIT_WINDOW = 0.3;      // how long a landed slam can catch you
const WAIT = [1.5, 4];       // rest between strikes (s)
const RISE_FRAC = 0.66;      // how much of the tentacle stands out of the water before the slam (≈ 18u)
const SLOOP_CLEAR = 14;      // no slam this close to the held sloop
const PLAYER_CLEAR = 9;      // no telegraph starts this close to the player
const LINE_RANGE = 20, LINE_SPEED = 8;  // throwing the line
const TOW_LENGTH = 16;
const TOW_GRACE = 5;         // a breather after the line goes on: you start from a standstill
const LANTERN_RANGE = 60, LANTERN_COOLDOWN = 10;
const WAKE_MARGIN = 60;      // the creature stirs when you're within site.r + this
const N_BUBBLES = 96;

const PLUM = '#5b2a6e', PLUM_DK = '#43205a', BELLY = '#c9a0cc', SUCKER = '#f2dbe9';

// --------------------------------------------------------------- geometry
// One body segment: a lump with a pale belly on +z and two suckers on it. The
// local y axis runs along the tentacle.
function segmentGeometry() {
  const body = part(new THREE.SphereGeometry(1, 10, 8), PLUM);
  const n = body.attributes.normal, c = body.attributes.color;
  const belly = new THREE.Color(BELLY), dark = new THREE.Color(PLUM_DK);
  for (let i = 0; i < n.count; i++) {
    const z = n.getZ(i);
    if (z > 0.42) c.setXYZ(i, belly.r, belly.g, belly.b);
    else if (z < -0.72) c.setXYZ(i, dark.r, dark.g, dark.b);
  }
  const parts = [body];
  for (const s of [-1, 1]) parts.push(part(new THREE.SphereGeometry(0.2, 6, 4), SUCKER, { x: s * 0.3, z: 0.88, sz: 0.5 }));
  return merge(parts);
}

// Segment radii, and how far along the tentacle each one sits (spacing follows
// the radius so the lumps overlap evenly from root to tip).
const RADII = [], ARC = [];
{
  let sum = 0;
  for (let i = 0; i < N_SEG; i++) { const r = lerp(R_ROOT, R_TIP, Math.pow(i / (N_SEG - 1), 0.9)); RADII.push(r); sum += r; }
  const k = LEN / sum;
  let a = 0;
  for (let i = 0; i < N_SEG; i++) { ARC.push(a); a += RADII[i] * k; }
}

// ----------------------------------------------------------- water decals
// Soft discs that lie on the waves: tentacle shadows, splash rings, the
// creature's bulk and its eyes. Scale the mesh for size; rotate it about y.
const decalVert = /* glsl */ `
${WAVE_GLSL}
uniform float uLift;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y = waveHeight(wp.xz) + uLift;
  vec4 mvPosition = viewMatrix * wp;
  mvPosition.z += 0.5; // just proud of the water so crests don't slice it
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const decalFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;  // the disc itself
uniform float uRim;    // a pale, churning ring near its edge
uniform float uSoft;   // where the edge starts to fade (0..1 of the radius)
uniform float uTime;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec2 q = vUv - 0.5;
  float d = length(q) * 2.0;
  float body = (1.0 - smoothstep(uSoft, 1.0, d)) * uAlpha;
  float ang = atan(q.y, q.x);
  float ring = (1.0 - smoothstep(0.0, 0.15, abs(d - (0.74 + 0.05 * sin(ang * 9.0 + uTime * 3.0))))) * uRim;
  float a = max(body, ring);
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uColor, vec3(0.86, 0.93, 0.97), ring / max(a, 1e-4) * step(body, ring)), a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function decalMaterial(color, { soft = 0.35, lift = 0.12 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...waveUniforms,
      uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uRim: { value: 0 },
      uSoft: { value: soft }, uLift: { value: lift },
    },
    vertexShader: decalVert, fragmentShader: decalFrag,
    transparent: true, depthWrite: false, fog: true,
  });
}

const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _P = new THREE.Vector3();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const ease = (u) => { const k = clamp(u, 0, 1); return k * k * (3 - 2 * k); };

export class Kraken {
  /**
   * site: { x, z, r } — the trench; r is how far you must tow the sloop to
   * be clear. opts: { onRescue(), onCaught() }.
   */
  constructor(game, sloop, site, opts = {}) {
    this.game = game;
    this.sloop = sloop;
    this.site = site;
    this.opts = opts;
    this.phase = 'approach';
    this.caught = false;       // true while the "caught" fade is running
    this.tow = null;
    this.awake = false;
    this.entryAngle = null;    // the side of the trench the player first came in from
    this.open = 0;             // how far the creature's eyes are open
    this.lanternCd = 0;
    this.time = 0;
    this.h0 = sloop.heading || 0;
    this.coil = { on: true, drop: 0 };
    this.disposed = false;
    this.build();
    sloop.place(site.x, site.z, this.h0);
  }

  /** True while the line is made fast and the sloop is still inside the trench. */
  get towing() { return this.phase === 'tow' && !!this.tow; }

  // ------------------------------------------------------------- building
  build() {
    const scene = this.game.scene;
    this.root = new THREE.Group();
    this.root.name = 'kraken';
    scene.add(this.root);
    this.own = []; // geometries and materials to free

    // every tentacle (and the coil) in two draw calls: body + ink outline
    this.segGeo = segmentGeometry();
    const count = (N_TENT + 1) * N_SEG;
    this.body = new THREE.InstancedMesh(this.segGeo, propMaterial, count);
    this.ink = new THREE.InstancedMesh(this.segGeo, propOutline, count);
    this.ink.instanceMatrix = this.body.instanceMatrix;
    for (const m of [this.body, this.ink]) { m.frustumCulled = false; this.root.add(m); }
    for (let i = 0; i < count; i++) this.body.setMatrixAt(i, _zero);
    this.own.push(this.segGeo);

    // decals
    this.discGeo = new THREE.RingGeometry(0.0001, 1, 20, 3).rotateX(-Math.PI / 2);
    this.bigGeo = new THREE.RingGeometry(0.0001, 1, 48, 10).rotateX(-Math.PI / 2);
    this.own.push(this.discGeo, this.bigGeo);
    const decal = (geo, color, o, order) => {
      const mat = decalMaterial(color, o);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false;
      this.root.add(mesh);
      this.own.push(mat);
      return mesh;
    };
    // the creature below: a great dark shape and two slow eyes
    this.bulk = decal(this.bigGeo, '#070d1f', { soft: 0.15, lift: 0.05 }, 3);
    this.bulk.scale.set(58, 1, 58);
    this.eyes = [-1, 1].map((side) => ({
      side, x: this.site.x, z: this.site.z, blink: 2 + Math.random() * 3,
      glow: decal(this.discGeo, '#ffc64a', { soft: 0.55, lift: 0.1 }, 4),
      pupil: decal(this.discGeo, '#1a0a18', { soft: 0.7, lift: 0.14 }, 5),
    }));

    this.tentacles = [];
    for (let i = 0; i < N_TENT; i++) {
      this.tentacles.push({
        slot: i, state: 'wait', t: 0, wait: 1 + i * 0.8, seed: i * 1.7,
        tx: 0, tz: 0, dx: 1, dz: 0, bub: 0, hitOpen: false, e0: 0, th0: 0,
        shadow: decal(this.discGeo, '#081226', { soft: 0.3 }, 4),
        splash: decal(this.discGeo, '#081226', { soft: 0.3, lift: 0.16 }, 5),
        splashT: -1,
      });
    }

    // bubbles (and the spray off a slam)
    this.bubGeo = new THREE.SphereGeometry(1, 6, 4);
    this.bubMat = new THREE.MeshBasicMaterial({ color: '#e6f3ff', transparent: true, opacity: 0.85, depthWrite: false });
    this.bubMesh = new THREE.InstancedMesh(this.bubGeo, this.bubMat, N_BUBBLES);
    this.bubMesh.count = 0; this.bubMesh.frustumCulled = false; this.bubMesh.renderOrder = 6;
    this.root.add(this.bubMesh);
    this.bubbles = [];
    this.own.push(this.bubGeo, this.bubMat);

    // the lantern's flash
    this.flashGeo = new THREE.SphereGeometry(1, 16, 10);
    this.flashMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.flash = new THREE.Mesh(this.flashGeo, this.flashMat);
    this.flash.visible = false; this.flash.frustumCulled = false; this.flash.renderOrder = 7;
    this.flashT = -1;
    this.root.add(this.flash);
    this.own.push(this.flashGeo, this.flashMat);
  }

  // ------------------------------------------------------------ the prompt
  /** Contextual action while sailing in the trench: { prompt, action? } or null. */
  interaction(x, z, speed) {
    if (this.caught || this.phase === 'done' || this.disposed) return null;
    if (this.phase === 'approach') {
      const s = this.sloop.pos;
      if (Math.hypot(s.x - x, s.z - z) < LINE_RANGE) {
        if (Math.abs(speed) >= LINE_SPEED) return { prompt: 'Slow down to throw a line' };
        return { prompt: 'Throw Sable a line', action: () => this.attach() };
      }
    }
    if (this.lanternCd <= 0 && this.threatNear(x, z)) return { prompt: 'Raise your lantern', action: () => this.raiseLantern() };
    return null;
  }

  attach() {
    if (this.phase !== 'approach' || this.caught || this.disposed) return;
    this.tow = new TowLine(this.game.scene, this.game.boat, this.sloop, { length: TOW_LENGTH });
    this.coil.on = false;   // the coil slides off as the line comes taut
    this.phase = 'tow';
    this.grace = TOW_GRACE;
    for (const T of this.tentacles) if (this.threatening(T)) this.flinch(T);
    this.game.audio.play('treasure');
  }

  /** The light makes nearby tentacles flinch away and sink. */
  raiseLantern() {
    if (this.lanternCd > 0 || this.caught || this.disposed) return;
    const b = this.game.boat.pos;
    this.lanternCd = LANTERN_COOLDOWN;
    for (const T of this.tentacles) {
      if (!this.threatening(T) || this.stripDist(T, b.x, b.z) > LANTERN_RANGE) continue;
      this.flinch(T);
    }
    this.flashT = 0;
    this.game.audio.play('upgrade');
  }

  threatening(T) { return T.state === 'tele' || T.state === 'rise' || T.state === 'slam'; }

  threatNear(x, z) {
    for (const T of this.tentacles) if (this.threatening(T) && this.stripDist(T, x, z) < LANTERN_RANGE) return true;
    return false;
  }

  flinch(T) {
    if (T.state === 'tele') { this.rest(T); return; }
    const p = this.pose(T);
    T.e0 = p.e; T.th0 = p.theta;
    T.state = 'duck'; T.t = 0; T.hitOpen = false;
  }

  // ----------------------------------------------------------------- update
  update(dt, elapsed = 0) {
    if (this.disposed) return;
    const g = this.game, b = g.boat, site = this.site;
    this.time = elapsed;
    const px = b.pos.x, pz = b.pos.z;
    const dC = Math.hypot(px - site.x, pz - site.z);
    this.awake = this.phase !== 'done' && dC < site.r + WAKE_MARGIN;
    if (this.awake && this.entryAngle == null) this.entryAngle = Math.atan2(pz - site.z, px - site.x);
    this.lanternCd = Math.max(0, this.lanternCd - dt);
    this.grace = Math.max(0, (this.grace || 0) - dt);

    if (this.phase === 'approach') this.holdSloop();
    this.tow?.update(dt);

    if (!this.caught) {
      if (this.phase === 'tow' && dC > site.r) this.rescue();
      const active = this.tentacles.reduce((n, T) => n + (this.threatening(T) ? 1 : 0), 0);
      let room = this.awake && this.grace <= 0 ? MAX_ACTIVE - active : 0;
      for (const T of this.tentacles) {
        const was = T.state;
        this.stepTentacle(T, dt, room > 0);
        if (was === 'wait' && T.state === 'tele') room--;
        if (this.caught) break; // a slam landed on the player this frame
      }
    }

    this.drawTentacles();
    this.drawCoil(dt);
    this.body.instanceMatrix.needsUpdate = true;
    this.drawDecals(dt, px, pz);
    this.updateBubbles(dt);
    this.updateFlash(dt);
  }

  /** The sloop, pinned at the centre, swinging slowly on the coil. */
  holdSloop() {
    const s = this.sloop;
    s.pos.x = this.site.x; s.pos.z = this.site.z;
    s.heading = this.h0 + Math.sin(this.time * 0.3) * 0.35;
    s.speed = 0; s.sailLevel = 0; s.rudder = 0;
    s.push?.set(0, 0);
  }

  rescue() {
    this.phase = 'done';
    for (const T of this.tentacles) {
      if (T.state === 'tele') this.rest(T);
      else if (T.state === 'rise' || T.state === 'slam') this.flinch(T);
    }
    this.opts.onRescue?.();
  }

  // -------------------------------------------------------------- tentacles
  rest(T) {
    T.state = 'wait'; T.t = 0; T.hitOpen = false;
    T.wait = WAIT[0] + Math.random() * (WAIT[1] - WAIT[0]);
  }

  stepTentacle(T, dt, canStart) {
    T.t += dt;
    switch (T.state) {
      case 'wait':
        if (T.t >= T.wait && canStart && this.pickTarget(T)) { T.state = 'tele'; T.t = 0; T.bub = 0; }
        break;
      case 'tele': {
        // a boil of bubbles over the strip, thickest where it will break the surface
        const grow = 0.35 + 0.65 * ease(T.t / T_TELE);
        T.bub += dt * 12;
        while (T.bub >= 1) {
          T.bub -= 1;
          const along = (Math.random() * Math.random() * 2 - 1) * STRIP_HALF * grow, across = (Math.random() * 2 - 1) * STRIP_W * 0.8 * grow;
          const x = T.tx + T.dx * along - T.dz * across, z = T.tz + T.dz * along + T.dx * across;
          this.bubble(x, waveHeight(x, z) + 0.1, z, 0, 2 + Math.random() * 1.5, 0, 0.7 + Math.random() * 0.5, 0.12 + Math.random() * 0.2);
        }
        if (T.t >= T_TELE) { T.state = 'rise'; T.t = 0; }
        break;
      }
      case 'rise':
        if (T.t >= T_RISE) { T.state = 'slam'; T.t = 0; }
        break;
      case 'slam':
        if (T.t >= T_SLAM) { T.state = 'lie'; T.t = 0; T.hitOpen = true; this.splash(T); }
        break;
      case 'lie':
        if (T.hitOpen) {
          if (T.t <= HIT_WINDOW) this.hitTest(T); else T.hitOpen = false;
        }
        if (T.t >= T_LIE) { T.state = 'sink'; T.t = 0; }
        break;
      case 'sink':
        if (T.t >= T_SINK) this.rest(T);
        break;
      case 'duck':
        if (T.t >= T_DUCK) this.rest(T);
        break;
    }
  }

  /** Distance from (x, z) to a tentacle's strip (the line its slam lies along). */
  stripDist(T, x, z) {
    const k = clamp((x - T.tx) * T.dx + (z - T.tz) * T.dz, -STRIP_HALF, STRIP_HALF);
    return Math.hypot(x - (T.tx + T.dx * k), z - (T.tz + T.dz * k));
  }

  /** Choose where the next slam falls. Returns false if nowhere fair turned up. */
  pickTarget(T) {
    const g = this.game, b = g.boat, site = this.site, s = this.sloop.pos;
    const px = b.pos.x, pz = b.pos.z;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const rnd = Math.random, sign = () => (rnd() < 0.5 ? -1 : 1);
    const held = this.phase === 'approach';
    for (let k = 0; k < 14; k++) {
      let tx, tz;
      if (!held) {
        if (rnd() < 0.6) {
          // where the player will be when it lands, set off to one side: its near end
          // reaches the player's course about half the time, and a touch of helm clears it
          const lead = (2.6 + rnd()) * Math.max(Math.abs(b.speed), 3), side = sign() * (STRIP_HALF + rnd() * 9);
          tx = px + fx * lead - fz * side; tz = pz + fz * lead + fx * side;
        } else {
          const ahead = 25 + rnd() * 45, side = sign() * (10 + rnd() * 25);
          tx = px + fx * ahead - fz * side; tz = pz + fz * ahead + fx * side;
        }
      } else if (rnd() < 0.65) {
        // between the player and the sloop, off the straight line
        const t = 0.2 + rnd() * 0.7, lx = s.x - px, lz = s.z - pz, l = Math.hypot(lx, lz) || 1;
        const side = sign() * (6 + rnd() * 32);
        tx = px + lx * t - (lz / l) * side; tz = pz + lz * t + (lx / l) * side;
      } else {
        const a = rnd() * TAU, r = 35 + rnd() * 95;
        tx = site.x + Math.cos(a) * r; tz = site.z + Math.sin(a) * r;
      }
      if (Math.hypot(tx - site.x, tz - site.z) > site.r + 20) continue;
      // the strip lies roughly across the player's path
      const a = b.heading + sign() * Math.PI / 2 + (rnd() - 0.5) * 1.2;
      const C = { tx, tz, dx: Math.sin(a), dz: Math.cos(a) };
      if (this.stripDist(C, px, pz) < PLAYER_CLEAR) continue;
      if (this.stripDist(C, s.x, s.z) < (held ? SLOOP_CLEAR : 8)) continue;
      if (this.tentacles.some((O) => O !== T && O.state !== 'wait' && Math.hypot(O.tx - tx, O.tz - tz) < 12)) continue;
      T.tx = tx; T.tz = tz; T.dx = C.dx; T.dz = C.dz;
      return true;
    }
    return false;
  }

  /** How a tentacle stands right now: e (fraction out of the water), theta (lean from upright), curl, sink. */
  pose(T) {
    const P = this._pose || (this._pose = { e: 0, theta: 0, curl: 0, sink: 0, lying: false, sway: 0 });
    P.sink = 0; P.lying = false; P.sway = 0;
    switch (T.state) {
      case 'rise': {
        const u = 1 - Math.pow(1 - clamp(T.t / T_RISE, 0, 1), 3);
        P.e = RISE_FRAC * u; P.theta = -0.12 * u; P.curl = 2.4; P.sway = 1;
        break;
      }
      case 'slam': {
        const u = Math.pow(clamp(T.t / T_SLAM, 0, 1), 2);
        P.e = lerp(RISE_FRAC, 1, u); P.theta = lerp(-0.12, Math.PI / 2 + 0.03, u); P.curl = lerp(2.4, 0.1, u);
        P.lying = u > 0.6;
        break;
      }
      case 'lie':
        P.e = 1; P.theta = Math.PI / 2 + 0.03; P.curl = 0.1; P.lying = true;
        break;
      case 'sink': {
        const u = clamp(T.t / T_SINK, 0, 1);
        P.e = 1; P.theta = Math.PI / 2 + 0.03; P.curl = 0.1; P.lying = true; P.sink = -u * u * 5.5;
        break;
      }
      case 'duck': {
        const u = ease(T.t / T_DUCK);
        P.e = T.e0 * (1 - u); P.theta = T.th0 * (1 - u * 0.5); P.curl = 2.4;
        break;
      }
      default:
        P.e = 0; P.theta = 0; P.curl = 0;
    }
    return P;
  }

  /** One segment's instance matrix: y along the tentacle, belly (+z) to the inside of the curl. */
  setSegment(index, x, y, z, theta, dx, dz, r) {
    const s = Math.sin(theta), c = Math.cos(theta);
    _Y.set(s * dx, c, s * dz);
    _Z.set(c * dx, -s, c * dz);
    _X.crossVectors(_Y, _Z);
    _m.makeBasis(_X.multiplyScalar(r), _Y.multiplyScalar(r * 0.95), _Z.multiplyScalar(r));
    _m.setPosition(x, y, z);
    this.body.setMatrixAt(index, _m);
  }

  drawTentacles() {
    for (const T of this.tentacles) {
      const base = T.slot * N_SEG;
      const P = this.pose(T);
      if (P.e <= 0.001) {
        if (T.drawn) { for (let i = 0; i < N_SEG; i++) this.body.setMatrixAt(base + i, _zero); T.drawn = false; }
        continue;
      }
      T.drawn = true;
      // it breaks the surface at one end of the strip and comes down along it
      const bx = T.tx - T.dx * STRIP_HALF, bz = T.tz - T.dz * STRIP_HALF;
      const wy = waveHeight(bx, bz);
      const hidden = (1 - P.e) * LEN, vis = P.e * LEN;
      let x = bx, y = wy, z = bz, prev = 0;
      for (let i = 0; i < N_SEG; i++) {
        const w = ARC[i] - hidden, r = RADII[i];
        if (w < 0) { this.setSegment(base + i, bx, wy + w + P.sink, bz, 0, T.dx, T.dz, r); continue; } // still under water
        const u = w / vis;
        const th = P.theta + P.curl * Math.pow(smoothstep(0.45, 1, u), 1.3) + P.sway * Math.sin(this.time * 2.6 + T.seed + u * 3) * 0.07;
        const ds = w - prev; prev = w;
        const sn = Math.sin(th);
        x += sn * T.dx * ds; y += Math.cos(th) * ds; z += sn * T.dz * ds;
        let ry = y;
        if (P.lying) ry = Math.max(ry, waveHeight(x, z) + r * 0.35);
        this.setSegment(base + i, x, ry + P.sink, z, th, T.dx, T.dz, r);
      }
    }
  }

  /** The thick arm coiled over the sloop's foredeck (visual only); it slides off when the line is thrown. */
  drawCoil(dt) {
    const C = this.coil, base = N_TENT * N_SEG;
    C.drop = clamp(C.drop + (C.on ? -dt * 3 : dt / 1.2), 0, 1);
    if (C.drop >= 1) {
      if (C.drawn) { for (let i = 0; i < N_SEG; i++) this.body.setMatrixAt(base + i, _zero); C.drawn = false; }
      return;
    }
    C.drawn = true;
    const K = this.sloop.sizeScale || 1, M = this.sloop.group.matrixWorld;
    // boat space: up the port side, over the foredeck, down to starboard
    const A = 1.9, ZC = 2.0, TOP = 1.95, UP = 3.5, ARCH = Math.PI * A, TAIL = 2.6, total = UP + ARCH + TAIL;
    const at = (d, out) => {
      if (d < UP) return out.set(-A, -3.3 + d, ZC);
      if (d < UP + ARCH) { const a = Math.PI - (d - UP) / A; return out.set(Math.cos(a) * A, 0.2 + Math.sin(a) * TOP, ZC); }
      const k = (d - UP - ARCH) / TAIL;
      return out.set(A + k * 0.8, 0.2 - k * 2.1, ZC + k * 0.5);
    };
    const drop = C.drop * C.drop, breathe = 1 + Math.sin(this.time * 1.8) * 0.04;
    for (let i = 0; i < N_SEG; i++) {
      const d = (i / (N_SEG - 1)) * total, r = lerp(0.95, 0.4, i / (N_SEG - 1)) * breathe;
      at(d, _P); at(Math.min(total, d + 0.2), _Y);
      _Y.sub(_P);
      if (_Y.lengthSq() < 1e-8) at(d - 0.2, _Y).negate().add(_P); // the very last segment: look back instead
      _Y.normalize();
      // belly to the hull: toward the arch's centre, squared up against the tangent
      _Z.set(-_P.x, 0.2 - _P.y, 0).addScaledVector(_Y, -(_Z.dot(_Y)));
      if (_Z.lengthSq() < 1e-6) _Z.set(1, 0, 0);
      _Z.normalize();
      _X.crossVectors(_Y, _Z);
      _P.x += drop * 1.5; _P.y -= drop * 7;
      _P.multiplyScalar(K);
      _m.makeBasis(_X.multiplyScalar(r * K), _Y.multiplyScalar(r * K), _Z.multiplyScalar(r * K));
      _m.setPosition(_P);
      _m.premultiply(M);
      this.body.setMatrixAt(base + i, _m);
    }
  }

  // -------------------------------------------------------------- the slam
  splash(T) {
    const g = this.game, b = g.boat.pos;
    const d = this.stripDist(T, b.x, b.z);
    g.audio.play('slam', { volume: clamp(1.1 - d / 110, 0.12, 0.9) });
    g.cam.shake = Math.max(g.cam.shake, 0.6 * clamp(1 - d / 55, 0, 1));
    T.splashT = 0;
    for (let i = 0; i < 16; i++) {
      const along = (Math.random() * 2 - 1) * STRIP_HALF, across = (Math.random() * 2 - 1) * 2.2;
      const x = T.tx + T.dx * along - T.dz * across, z = T.tz + T.dz * along + T.dx * across;
      const out = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4);
      this.bubble(x, waveHeight(x, z) + 0.3, z, -T.dz * out, 5 + Math.random() * 6, T.dx * out, 0.7 + Math.random() * 0.5, 0.2 + Math.random() * 0.35, 14);
    }
  }

  hitTest(T) {
    if (this.caught || this.phase === 'done') return;
    const b = this.game.boat.pos;
    const along = (b.x - T.tx) * T.dx + (b.z - T.tz) * T.dz, across = (b.x - T.tx) * -T.dz + (b.z - T.tz) * T.dx;
    if (Math.abs(along) <= STRIP_HALF + 1 && Math.abs(across) <= STRIP_W) this.catch();
  }

  /** A slam landed on the player: no damage, just back to the edge of the trench to try again. */
  async catch() {
    if (this.caught) return;
    this.caught = true;
    const g = this.game, site = this.site;
    g.cam.shake = 1.2;
    g.audio.play('crash');
    await g.ui.fade(1, 0.4);
    if (!this.disposed) {
      this.tow?.dispose(); this.tow = null;
      this.phase = 'approach';
      this.coil.on = true; this.coil.drop = 0;
      this.sloop.place(site.x, site.z, this.h0);
      const b = g.boat;
      const a = this.entryAngle ?? Math.atan2(b.pos.z - site.z, b.pos.x - site.x);
      const cx = Math.cos(a), cz = Math.sin(a), heading = Math.atan2(-cx, -cz);
      b.place(site.x + cx * (site.r + 10), site.z + cz * (site.r + 10), heading);
      g.cam.yaw = heading; g.cam.lastLook = -10;
      this.tentacles.forEach((T, i) => { this.rest(T); T.wait = 1.5 + i * 0.7; T.splashT = -1; });
      this.bubbles.length = 0;
      this.lanternCd = 0;
      this.opts.onCaught?.();
    }
    await g.ui.fade(0, 0.5);
    this.caught = false;
  }

  // ----------------------------------------------------------------- decals
  drawDecals(dt, px, pz) {
    const site = this.site;
    this.open = damp(this.open, this.awake ? 1 : 0, this.awake ? 0.9 : 1.6, dt);
    const o = this.open;
    // the bulk under the sloop (it lets go, and sinks, once the sloop is clear)
    this.bulk.visible = o > 0.01;
    this.bulk.position.set(site.x, 0, site.z);
    this.bulk.material.uniforms.uAlpha.value = 0.55 * o;
    // the eyes look up from between the sloop and you
    let lx = px - site.x, lz = pz - site.z;
    const l = Math.hypot(lx, lz) || 1; lx /= l; lz /= l;
    const reach = Math.min(17, l * 0.5);
    for (const E of this.eyes) {
      const ex = site.x + lx * reach - lz * 6.5 * E.side, ez = site.z + lz * reach + lx * 6.5 * E.side;
      E.x = damp(E.x, ex, 1.2, dt); E.z = damp(E.z, ez, 1.2, dt);
      E.blink -= dt;
      if (E.blink < -0.18) E.blink = 2.5 + Math.random() * 4;
      const lid = (E.blink < 0 ? 0.12 : 1) * o;
      const rot = Math.atan2(lx, lz); // long axis across the line of sight
      for (const [m, sx, sz, a] of [[E.glow, 3.0, 1.7, 0.9], [E.pupil, 0.55, 1.45, 0.95]]) {
        m.visible = o > 0.02;
        m.position.set(E.x, 0, E.z);
        m.rotation.y = rot;
        m.scale.set(sx, 1, Math.max(0.05, sz * lid));
        m.material.uniforms.uAlpha.value = a * o;
      }
    }
    // each tentacle's shadow (the warning) and splash ring
    for (const T of this.tentacles) {
      const sh = T.shadow, U = sh.material.uniforms;
      let a = 0, grow = 1, rim = 0;
      if (T.state === 'tele') { const u = T.t / T_TELE; a = 0.62 * Math.min(1, u * 2.5); grow = 0.35 + 0.65 * ease(u); rim = 0.75 * ease((u - 0.3) / 0.7); }
      else if (T.state === 'rise' || T.state === 'slam') { a = 0.62; rim = 0.75; }
      else if (T.state === 'lie') { const k = 1 - T.t / T_LIE; a = 0.62 * k; rim = 0.75 * k; }
      else if (T.state === 'duck') { const k = 1 - T.t / T_DUCK; a = 0.5 * k; }
      sh.visible = a > 0.01;
      if (sh.visible) {
        sh.position.set(T.tx, 0, T.tz);
        sh.rotation.y = Math.atan2(-T.dz, T.dx);
        sh.scale.set((STRIP_HALF + 1.5) * grow, 1, (STRIP_W + 1) * grow);
        U.uAlpha.value = a; U.uRim.value = rim;
      }
      const sp = T.splash;
      if (T.splashT >= 0) {
        T.splashT += dt;
        const k = T.splashT / 0.9;
        if (k >= 1) { T.splashT = -1; sp.visible = false; }
        else {
          sp.visible = true;
          sp.position.set(T.tx, 0, T.tz);
          sp.rotation.y = Math.atan2(-T.dz, T.dx);
          sp.scale.set((STRIP_HALF + 2) * (1 + k * 0.5), 1, (STRIP_W + 2) * (1 + k * 1.4));
          sp.material.uniforms.uRim.value = 0.9 * (1 - k) * (1 - k);
        }
      } else sp.visible = false;
    }
  }

  // ---------------------------------------------------------------- bubbles
  bubble(x, y, z, vx, vy, vz, life, r, gravity = 0) {
    if (this.bubbles.length >= N_BUBBLES) this.bubbles.shift();
    this.bubbles.push({ x, y, z, vx, vy, vz, life, max: life, r, gravity });
  }

  updateBubbles(dt) {
    const B = this.bubbles;
    let n = 0;
    for (let i = B.length - 1; i >= 0; i--) {
      const p = B[i];
      p.life -= dt;
      if (p.life <= 0) { B.splice(i, 1); continue; }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of B) {
      const k = p.life / p.max, r = p.r * (0.5 + 0.5 * Math.sin(Math.min(1, (1 - k) * 4) * Math.PI / 2)) * (k < 0.2 ? k * 5 : 1);
      _m.compose(_P.set(p.x, p.y, p.z), _q.identity(), _s.setScalar(r));
      this.bubMesh.setMatrixAt(n++, _m);
    }
    this.bubMesh.count = n;
    this.bubMesh.instanceMatrix.needsUpdate = true;
  }

  updateFlash(dt) {
    if (this.flashT < 0) return;
    this.flashT += dt;
    const k = this.flashT / 0.6, b = this.game.boat;
    if (k >= 1) { this.flashT = -1; this.flash.visible = false; return; }
    this.flash.visible = true;
    this.flash.position.set(b.pos.x, (b.y || 0) + 2.5, b.pos.z);
    this.flash.scale.setScalar(lerp(2, 28, 1 - (1 - k) * (1 - k)));
    this.flashMat.opacity = 0.55 * (1 - k);
  }

  // ---------------------------------------------------------------- dispose
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.tow?.dispose(); this.tow = null;
    this.game.scene.remove(this.root);
    this.body.dispose(); this.ink.dispose(); this.bubMesh.dispose();
    for (const o of this.own) o.dispose();
    this.own.length = 0;
    this.bubbles.length = 0;
  }
}
