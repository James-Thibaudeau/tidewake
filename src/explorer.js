// The player character: a short, chibi-proportioned anime explorer built from
// primitives (toon shaded + ink outlines) with simple procedural animation:
// breathing, leaning, scarf flutter, two-bone IK arms on the helm and a head
// that turns toward wherever the player is looking.
//
// The skeleton (joint groups) is built once; the look (hair, clothes, face)
// comes from an appearance profile and can be swapped at any time with
// setAppearance(). Style geometry lives in outfits.js.
import * as THREE from 'three';
import { toonGradient, outlineMaterial } from './toon.js';
import { clamp, damp, wrapAngle } from './util.js';
import { normalizeProfile, DEFAULT_PROFILE } from './cosmetics.js';
import { part, mergeParts, buildOutfit, backRadius, faceParams, acquireFace, releaseFace, faceGeometry, HIP_Y, KNEE_Y, HC, BONES } from './outfits.js';

export { part, mergeParts };

export const charMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
const inkOutline = outlineMaterial(0.022, 0x1a1420);

function inked(geo, parent, mat = charMaterial) {
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, inkOutline);
  parent.add(m, o);
  return m;
}

/** An empty group under `bone` that holds that bone's swappable look meshes. */
function lookGroup(bone) {
  const g = new THREE.Group();
  g.name = 'look';
  bone.add(g);
  return g;
}

function clearLook(g) {
  for (const o of g.children) o.geometry?.dispose();
  g.clear();
}

// -------------------------------------------------------------- the explorer
const DOWN = new THREE.Vector3(0, -1, 0);
const L1 = 0.25, L2 = 0.24; // upper arm, forearm + hand
// The scarf tail streams at most this far (radians) to either side of straight
// back, and keeps its centre line this far outside the clothes.
const TAIL_SWING = 1.1, TAIL_CLEAR = 0.03;

export class Explorer {
  constructor(profile = DEFAULT_PROFILE) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(1.15);
    this.buildSkeleton();
    this.setAppearance(profile);
    this.headYaw = 0; this.headPitch = 0; this.twist = 0; this.lean = 0;
    this.glance = 0; this.glanceTimer = 3; this.glanceTarget = 0;
    this.control = 'tiller';
    // 'helm' (on the boat, hands on tiller/wheel), 'ground' (on foot) or
    // 'preview' (standing idle for the character creator).
    this.pose = 'helm';
    this.gait = 0;        // walk-cycle phase (radians)
    this.stride = 0;      // 0 idle → 1 full run, smoothed
    this.air = 0;         // 0 grounded → 1 airborne, smoothed
    this.squash = 0;      // landing squash, decays
    this.moveSpeed = 0;   // fallback ground speed when the caller passes none (console testing)
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._m = new THREE.Matrix4(); this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion();
    this._tm = new THREE.Matrix4(); this._tp = new THREE.Vector3();
    this.tailYaw = Math.PI;
  }

  /** Joint groups, the spyglass and the face decal: everything that doesn't change with the outfit. */
  buildSkeleton() {
    const R = this.root;
    const look = {};
    // ---- legs: hip → knee joints so the explorer can walk, run and jump
    this.legs = {};
    for (const [name, s] of [['left', 1], ['right', -1]]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, HIP_Y, 0);
      R.add(hip);
      const knee = new THREE.Group();
      knee.position.y = KNEE_Y - HIP_Y;
      hip.add(knee);
      this.legs[name] = { hip, knee, side: s };
      look[s > 0 ? 'hipL' : 'hipR'] = lookGroup(hip);
      look[s > 0 ? 'kneeL' : 'kneeR'] = lookGroup(knee);
    }

    // ---- torso (pivots at the hips so it can twist and lean)
    const torso = new THREE.Group();
    torso.position.y = 0.48;
    R.add(torso);
    this.torso = torso;
    look.torso = lookGroup(torso);

    // brass spyglass on the belt (shown once the spyglass is upgraded)
    const sg = mergeParts([
      part(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 10), '#e0a943'),
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), '#8a5a1e', { y: 0.12 }),
      part(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), '#8a5a1e', { y: -0.06 }),
    ]);
    this.spyglass = new THREE.Group();
    inked(sg, this.spyglass);
    this.spyglass.position.set(-0.26, 0.08, -0.04);
    this.spyglass.rotation.set(0.25, 0, 0.35);
    this.spyglass.visible = false;
    torso.add(this.spyglass);

    // ---- scarf tail: two segments that flutter (hidden for tail-less neckwear;
    // where it hangs from comes from the outfit, see setAppearance)
    this.scarfTail = new THREE.Group();
    torso.add(this.scarfTail);
    this.scarfTail2 = new THREE.Group();
    this.scarfTail2.position.z = 0.21;
    this.scarfTail.add(this.scarfTail2);
    look.tail1 = lookGroup(this.scarfTail);
    look.tail2 = lookGroup(this.scarfTail2);

    // ---- arms (shoulder → elbow), driven by two-bone IK
    this.arms = {};
    for (const [name, s] of [['left', 1], ['right', -1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.255, 0.46, 0);
      torso.add(shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -L1;
      shoulder.add(elbow);
      this.arms[name] = { shoulder, elbow, side: s };
      look[s > 0 ? 'shL' : 'shR'] = lookGroup(shoulder);
      look[s > 0 ? 'elL' : 'elR'] = lookGroup(elbow);
    }

    // ---- head (big chibi head; hair and hat come from the outfit)
    const head = new THREE.Group();
    head.position.y = 0.58;
    torso.add(head);
    this.head = head;
    look.head = lookGroup(head);

    // face decal on a sphere cap just in front of the skin
    // (its shape follows the head shape; see setAppearance)
    const faceGeo = faceGeometry('round');
    this.faceShape = 'round';
    this.faceMat = new THREE.MeshToonMaterial({
      gradientMap: toonGradient(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const face = new THREE.Mesh(faceGeo, this.faceMat);
    face.renderOrder = 1;
    head.add(face);
    this.faceMesh = face;

    this.eye = new THREE.Object3D();
    this.eye.position.set(0, HC - 0.02, 0.3);
    head.add(this.eye);
    this.looks = look;
  }

  /**
   * Dress the explorer from an appearance profile (see cosmetics.js). Safe to
   * call every frame-ish: rebuilds only the look meshes and keeps the pose.
   */
  setAppearance(profile) {
    const p = normalizeProfile(profile);
    this.profile = p;
    const { parts, tail } = buildOutfit(p);
    for (const k of BONES) {
      const g = this.looks[k];
      clearLook(g);
      if (parts[k].length) {
        const geo = mergeParts(parts[k]);
        for (const pt of parts[k]) pt.dispose();
        inked(geo, g);
      }
    }
    if (p.head !== this.faceShape) {
      this.faceMesh.geometry.dispose();
      this.faceMesh.geometry = faceGeometry(p.head);
      this.faceShape = p.head;
    }
    this.scarfTail.visible = tail.visible;
    this.scarfTail.position.set(0.02, tail.anchor.y, tail.anchor.z);
    this.scarfTail2.position.z = tail.seg2Z;
    this.tailLen2 = tail.len2;
    this.tailBack = tail.back;
    // face: shared, cached textures
    const fp = faceParams(p);
    const key = JSON.stringify(fp);
    if (key !== this.faceKey) {
      const { tex } = acquireFace(fp);
      if (this.faceKey) releaseFace(this.faceKey);
      this.faceKey = key;
      this.faceMat.map = tex;
      this.faceMat.needsUpdate = true;
    }
    return p;
  }

  setControl(kind) { this.control = kind; }

  /** 'helm' | 'ground' | 'preview'. Leaving the helm relaxes the legs. */
  setPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.stride = 0; this.air = 0; this.squash = 0;
    for (const L of Object.values(this.legs)) { L.hip.rotation.set(0, 0, 0); L.knee.rotation.set(0, 0, 0); }
    this.torso.rotation.x = 0;
    const base = this.root.userData.baseScale;
    if (base) this.root.scale.setScalar(base);
  }

  /** Squash on landing; `k` is roughly the impact strength 0..1. */
  land(k = 1) { this.squash = Math.max(this.squash, clamp(k, 0, 1)); }
  setSpyglass(tier) { this.spyglass.visible = tier >= 1; }

  getEyePosition(target) { return this.eye.getWorldPosition(target); }

  /** Two-bone IK: point the arm's hand at a target given in torso space. */
  solveArm(arm, T, pole, k) {
    const S = arm.shoulder.position;
    const d = this._v.subVectors(T, S);
    const len = clamp(d.length(), 0.08, L1 + L2 - 0.005);
    const dir = d.normalize();
    const cosA = clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1);
    const a = Math.acos(cosA);
    const po = this._v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const upper = this._v3.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(po, Math.sin(a)).normalize();
    // elbow position and forearm direction
    const ex = S.x + upper.x * L1, ey = S.y + upper.y * L1, ez = S.z + upper.z * L1;
    const hx = S.x + dir.x * len, hy = S.y + dir.y * len, hz = S.z + dir.z * len;
    this._qa.setFromUnitVectors(DOWN, upper);
    arm.shoulder.quaternion.slerp(this._qa, k);
    const fore = this._v.set(hx - ex, hy - ey, hz - ez).normalize().applyQuaternion(this._qb.copy(arm.shoulder.quaternion).invert());
    this._qa.setFromUnitVectors(DOWN, fore);
    arm.elbow.quaternion.slerp(this._qa, k);
  }

  /** Convert a point in boat space into torso space. */
  toTorso(p, out) {
    this.root.updateMatrix();
    this.torso.updateMatrix();
    this._m.multiplyMatrices(this.root.matrix, this.torso.matrix).invert();
    return out.copy(p).applyMatrix4(this._m);
  }

  /**
   * Stream the scarf tail toward `yaw` (π = straight back) with wind strength
   * `str`. The tail stays behind the explorer and is lifted just enough to
   * ride over the clothes (outfits.js backProfile) rather than through them.
   */
  aimTail(dt, t, str, yaw) {
    const A = this.scarfTail, B = this.scarfTail2;
    const target = Math.PI + clamp(wrapAngle(yaw - Math.PI), -TAIL_SWING, TAIL_SWING);
    this.tailYaw = damp(this.tailYaw, target, 5, dt);
    const rx = clamp(1.55 - str * 0.8, 0.15, 1.55) + Math.sin(t * 9) * 0.08 * str; // hangs when calm
    const ry = this.tailYaw + Math.sin(t * 7.3) * 0.15 * str;
    B.rotation.set(Math.sin(t * 11 + 1) * 0.35 * str - 0.1, Math.sin(t * 8.7) * 0.3 * str, 0);
    if (!A.visible || this.tailClears(rx, ry)) return;
    // bisect for the steepest hang that still clears
    let lo = -0.3, hi = rx;
    for (let i = 0; i < 7; i++) {
      const m = (lo + hi) / 2;
      if (this.tailClears(m, ry)) lo = m; else hi = m;
    }
    this.tailClears(lo, ry);
  }

  /** Pose the tail's first segment; does the whole tail clear the clothes? */
  tailClears(rx, ry) {
    const A = this.scarfTail, B = this.scarfTail2, p = this._tp;
    A.rotation.set(rx, ry, 0, 'YXZ');
    A.updateMatrix();
    B.updateMatrix();
    const m2 = this._tm.multiplyMatrices(A.matrix, B.matrix);
    for (let i = 1; i <= 7; i++) {
      if (i <= 4) p.set(0, 0, B.position.z * i / 4).applyMatrix4(A.matrix);
      else p.set(0, 0, this.tailLen2 * (i - 4) / 3).applyMatrix4(m2);
      if (Math.hypot(p.x, p.z) < backRadius(this.tailBack, p.y) + TAIL_CLEAR) return false;
    }
    return true;
  }

  /**
   * ctx: { rudder, speed, roll, lookRel (radians relative to bow, or null), lookPitch,
   *        windRel (apparent wind direction relative to bow, heading convention), windStrength,
   *        gripR, gripL (boat-space Vector3, gripL may be null) }
   */
  update(dt, t, ctx) {
    if (this.pose === 'helm') this.updateHelm(dt, t, ctx);
    else this.updateGround(dt, t, ctx);
  }

  /** Head and torso twist toward ctx.lookRel (relative to the root), or idle glances. */
  updateLook(dt, ctx) {
    const baseYaw = this.root.rotation.y;
    let look = 0;
    if (ctx.lookRel != null) look = wrapAngle(ctx.lookRel - baseYaw);
    else {
      this.glanceTimer -= dt;
      if (this.glanceTimer <= 0) {
        if (this.glanceTarget !== 0) { this.glanceTarget = 0; this.glanceTimer = 3 + Math.random() * 5; }
        else { this.glanceTarget = (Math.random() - 0.5) * 2.2; this.glanceTimer = 1.2 + Math.random() * 1.5; }
      }
      look = this.glanceTarget;
    }
    return look;
  }

  updateHelm(dt, t, ctx) {
    const k = 1 - Math.exp(-12 * dt);
    // breathing + bob
    const breath = Math.sin(t * 2.3);
    this.torso.position.y = 0.48 + breath * 0.006;
    this.torso.scale.set(1 + breath * 0.008, 1 + breath * 0.012, 1 + breath * 0.008);

    // where to look: player's look direction, else idle glances
    const baseYaw = this.root.rotation.y;
    const look = this.updateLook(dt, ctx);
    const twistT = clamp(look * 0.35, -0.5, 0.5);
    const headT = clamp(look - twistT, -1.4, 1.4);
    this.twist = damp(this.twist, twistT, 5, dt);
    this.headYaw = damp(this.headYaw, headT, 7, dt);
    this.headPitch = damp(this.headPitch, clamp(ctx.lookPitch || 0, -0.5, 0.6), 6, dt);
    this.torso.rotation.y = this.twist;
    this.head.rotation.set(-this.headPitch + Math.sin(t * 1.1) * 0.02, this.headYaw, Math.sin(t * 0.7) * 0.03, 'YXZ');

    // lean into turns, stay roughly upright against the boat's roll
    const leanT = ctx.rudder * Math.min(1, Math.abs(ctx.speed) / 8) * 0.14 - ctx.roll * 0.45;
    this.lean = damp(this.lean, leanT, 4, dt);
    this.root.rotation.z = this.lean;
    this.root.rotation.x = Math.sin(t * 2.3 + 1) * 0.01;

    // scarf tail streams with the apparent wind
    const wrel = wrapAngle(ctx.windRel - this.twist - baseYaw);
    const str = clamp(ctx.windStrength, 0, 2);
    this.aimTail(dt, t, str, wrel);

    // arms
    const T = this._handT || (this._handT = new THREE.Vector3());
    const pole = this._pole || (this._pole = new THREE.Vector3());
    if (ctx.gripR) {
      this.toTorso(ctx.gripR, T);
      this.solveArm(this.arms.right, T, pole.set(-1, -0.3, -0.6), k);
    }
    if (ctx.gripL) {
      this.toTorso(ctx.gripL, T);
      this.solveArm(this.arms.left, T, pole.set(1, -0.3, -0.6), k);
    } else {
      // relaxed: hand resting on the satchel, swaying a little
      T.set(0.3, 0.12 + Math.sin(t * 1.7) * 0.01, 0.1 + Math.sin(t * 1.3) * 0.02);
      this.solveArm(this.arms.left, T, pole.set(1, 0.2, -0.8), k);
    }
  }

  /**
   * On foot (and the creator's idle preview). ctx (all optional):
   * { footSpeed: horizontal m/s, grounded: bool, vy: vertical m/s,
   *   lookRel, lookPitch, windRel, windStrength, turn: yaw rate for leaning }
   */
  updateGround(dt, t, ctx = {}) {
    const k = 1 - Math.exp(-12 * dt);
    const speed = ctx.footSpeed ?? this.moveSpeed;
    const grounded = ctx.grounded ?? true;
    const vy = ctx.vy ?? 0;
    // stride: 0 idle, ~0.5 walking (≈2.5 m/s), 1 running (≈6 m/s)
    this.stride = damp(this.stride, clamp(speed / 6, 0, 1), 8, dt);
    this.air = damp(this.air, grounded ? 0 : 1, grounded ? 18 : 10, dt);
    this.squash = Math.max(0, this.squash - dt * 4);
    const st = this.stride, air = this.air;

    // cadence: steps per second rise with speed, but sub-linearly
    if (grounded) this.gait += dt * (4 + 7 * st) * Math.min(1, speed * 1.5);
    const g = this.gait;
    const swing = Math.sin(g) * (0.25 + 0.55 * st) * Math.min(1, speed * 1.2) * (1 - air);

    // ---- legs: thigh swings, knee bends on the back-swing; tucked in the air
    for (const L of Object.values(this.legs)) {
      const ph = L.side > 0 ? g : g + Math.PI;
      const sw = L.side > 0 ? swing : -swing;
      const lift = Math.max(0, -Math.cos(ph)) * (0.4 + 0.9 * st) * Math.min(1, speed * 1.2);
      // airborne: knees up while rising, legs reach down while falling
      const tuck = vy > 0 ? 0.55 : 0.2;
      const hipX = -sw * (1 - air) + air * -tuck * (L.side > 0 ? 1.1 : 0.7);
      const kneeX = lift * (1 - air) + air * (vy > 0 ? 1.0 : 0.45) * (L.side > 0 ? 1.1 : 0.8);
      L.hip.rotation.x = damp(L.hip.rotation.x, hipX, 20, dt);
      L.knee.rotation.x = damp(L.knee.rotation.x, kneeX, 20, dt);
      L.hip.rotation.z = damp(L.hip.rotation.z, air * L.side * 0.08, 10, dt);
    }

    // ---- torso: bob twice per cycle, lean forward with speed, breathe when still
    const breath = Math.sin(t * 2.3) * (1 - st);
    const bob = Math.abs(Math.cos(g)) * 0.03 * st * (1 - air);
    this.torso.position.y = 0.48 + breath * 0.006 + bob - this.squash * 0.06;
    this.torso.scale.set(1 + breath * 0.008, 1 + breath * 0.012, 1 + breath * 0.008);
    this.torso.rotation.x = damp(this.torso.rotation.x, st * 0.22 + air * (vy > 0 ? -0.1 : 0.12), 6, dt);
    const look = this.updateLook(dt, ctx);
    const twistT = clamp(look * 0.35, -0.5, 0.5) + swing * 0.18;
    const headT = clamp(look - twistT * 0.7, -1.4, 1.4);
    this.twist = damp(this.twist, twistT, 8, dt);
    this.headYaw = damp(this.headYaw, headT, 7, dt);
    this.headPitch = damp(this.headPitch, clamp((ctx.lookPitch || 0) - st * 0.15, -0.5, 0.6), 6, dt);
    this.torso.rotation.y = this.twist;
    this.head.rotation.set(-this.headPitch + Math.sin(t * 1.1) * 0.02 * (1 - st), this.headYaw, Math.sin(t * 0.7) * 0.03 * (1 - st), 'YXZ');

    // lean into turns; landing squash on the whole body
    this.lean = damp(this.lean, clamp(-(ctx.turn || 0) * 0.06 * st, -0.25, 0.25), 6, dt);
    this.root.rotation.z = this.lean;
    this.root.rotation.x = 0;
    const base = this.root.userData.baseScale ?? (this.root.userData.baseScale = this.root.scale.x);
    const sq = this.squash * 0.18;
    this.root.scale.set(base * (1 + sq * 0.5), base * (1 - sq), base * (1 + sq * 0.5));

    // scarf trails behind when moving, streams with the wind when still
    const str = clamp((ctx.windStrength ?? 0.3) + st * 1.2 + air * 0.6, 0, 2);
    const wrel = ctx.windRel != null ? wrapAngle(ctx.windRel - this.twist - this.root.rotation.y) : Math.PI;
    this.aimTail(dt, t, str, st > 0.15 || air > 0.2 ? Math.PI : wrel);

    // ---- arms swing opposite the legs; fling up in the air
    const T = this._handT || (this._handT = new THREE.Vector3());
    const pole = this._pole || (this._pole = new THREE.Vector3());
    for (const [name, A] of Object.entries(this.arms)) {
      const s = A.side;
      const armSw = (name === 'left' ? -swing : swing) * 0.55;
      const up = air * (vy > 0 ? 0.32 : 0.18);
      T.set(
        s * (0.31 + air * 0.12 + st * 0.02),
        0.04 + up + Math.abs(armSw) * 0.12 + st * 0.06 + Math.sin(t * 1.7 + s) * 0.008 * (1 - st),
        armSw * 0.45 + st * 0.05,
      );
      this.solveArm(A, T, pole.set(s * 0.4, 0, -1), k);
    }
  }
}
