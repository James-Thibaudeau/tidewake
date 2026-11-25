// The player character: a cartoon explorer with roughly real proportions (about
// four and a half heads tall), built from primitives (toon shaded + ink
// outlines) and animated procedurally. At the helm the arms reach for the
// tiller or wheel with two-bone IK; on foot the feet follow a stride and the
// legs are solved from them, so the knees, hips and shoulders move the way a
// body does rather than swinging on their own.
//
// The skeleton (joint groups) is built once; the look (hair, clothes, face)
// comes from an appearance profile and can be swapped at any time with
// setAppearance(). Style geometry lives in outfits.js.
import * as THREE from 'three';
import { toonGradient, toonMaterial, outlineMaterial } from './toon.js';
import { clamp, damp, wrapAngle } from './util.js';
import { normalizeProfile, DEFAULT_PROFILE } from './cosmetics.js';
import {
  part, mergeParts, buildOutfit, backRadius, faceParams, acquireFace, releaseFace, faceGeometry, BONES,
  HIP_Y, KNEE_Y, ANKLE_Y, HIP_X, TORSO_Y, SHOULDER_X, SHOULDER_Y, NECK_Y, ARM_L1, ARM_L2, HC, HEAD_SCALE,
} from './outfits.js';

export { part, mergeParts };

export const charMaterial = toonMaterial({ vertexColors: true, gradientMap: toonGradient() });
// The head is drawn at HEAD_SCALE, so its line is authored wider to match the body's
const inkOutline = outlineMaterial(0.016, 0x1a1420);
const headOutline = outlineMaterial(0.016 / HEAD_SCALE, 0x1a1420);

function inked(geo, parent, mat = charMaterial, ink = inkOutline) {
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, ink);
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
const TAU = Math.PI * 2;
const L1 = ARM_L1, L2 = ARM_L2;
const TH = HIP_Y - KNEE_Y, SH = KNEE_Y - ANKLE_Y, LEG = TH + SH; // thigh, shin
const TORSO_UP = TORSO_Y - HIP_Y; // the torso sits on the pelvis
// The scarf tail streams at most this far (radians) to either side of straight
// back, and keeps its centre line this far outside the clothes.
const TAIL_SWING = 1.1, TAIL_CLEAR = 0.03;

const frac = (x) => x - Math.floor(x);
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Poses in the air, as [trailing side, leading side] at each of: rising, over
// the top, falling. Legs: [ankle below the hips, ankle forward, sole pitch].
// Arms: [shoulder swing (− forward and up), spread out from the body, elbow].
const AIR_LEG = {
  rise: [[0.72, -0.2, 0.95], [0.43, 0.24, 0.1]],
  top: [[0.62, -0.17, 0.7], [0.5, 0.2, 0.3]],
  fall: [[0.71, -0.11, 0.35], [0.735, 0.14, -0.12]],
};
const AIR_ARM = {
  rise: [[0.75, 0.3, -0.7], [-2.0, 0.2, -1.0]],
  top: [[-0.05, 0.8, -0.7], [-0.9, 0.7, -0.85]],
  fall: [[-0.45, 1.15, -0.7], [-0.6, 1.1, -0.75]],
};
/** Blend an air pose: m 0 trailing → 1 leading side, rise +1 rising → −1 falling. */
function airPose(T, m, rise, out) {
  const k = Math.abs(rise), B = rise >= 0 ? T.rise : T.fall;
  for (let i = 0; i < 3; i++) {
    const top = lerp(T.top[0][i], T.top[1][i], m);
    out[i] = lerp(top, lerp(B[0][i], B[1][i], m), k);
  }
  return out;
}

/**
 * How high the ankle rides for a sole pitched by `pitch` (toes down > 0):
 * the foot rolls over the ball going up onto the toes, and over the heel
 * when the toes lift.
 */
const ankleRise = (pitch) => (pitch >= 0
  ? 0.012 + 0.058 * Math.cos(pitch) + 0.115 * Math.sin(pitch)
  : ANKLE_Y * Math.cos(pitch) - 0.05 * Math.sin(pitch));

/**
 * One foot's place in the stride at phase p (0..1; it touches down at 0 and
 * stays on the ground until `duty`). A is the reach of the step and `run`
 * goes 0 walk → 1 sprint. Fills o = { z, y, pitch }: fore/aft of the hips,
 * lift off the ground, and the sole's pitch.
 */
function footCycle(p, duty, A, run, o) {
  const strike = -0.38 * (1 - 0.6 * run), toeOff = 0.6 + 0.3 * run;
  if (p < duty) {
    // planted: the ground carries it back at a steady rate while the foot
    // rolls from the heel, flat, then up onto the toe
    const u = p / duty;
    o.z = A * (0.85 - 1.9 * u);
    o.y = 0;
    o.pitch = strike * Math.max(0, 1 - u / 0.22) + toeOff * sstep(0.5, 1, u);
  } else {
    // swinging through: the heel kicks up behind (high at a run), the knee
    // drives forward and the foot reaches out for the next step
    const v = (p - duty) / (1 - duty);
    o.z = A * (-1.05 + 1.9 * (0.65 * v * v * (3 - 2 * v) + 0.35 * v));
    const peak = 0.5 - 0.17 * run;
    const w = v < peak ? v / peak : (1 - v) / (1 - peak);
    o.y = (0.06 + 0.3 * run) * Math.sin(w * Math.PI / 2) ** 1.4 * Math.min(1, A / 0.3);
    o.pitch = lerp(toeOff, strike, sstep(0.25, 0.95, v));
  }
  return o;
}

export class Explorer {
  constructor(profile = DEFAULT_PROFILE) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(1);
    this.buildSkeleton();
    this.setAppearance(profile);
    this.headYaw = 0; this.headPitch = 0; this.twist = 0; this.lean = 0;
    this.glance = 0; this.glanceTimer = 3; this.glanceTarget = 0;
    this.control = 'tiller';
    // 'helm' (on the boat, hands on tiller/wheel), 'ground' (on foot) or
    // 'preview' (standing idle for the character creator).
    this.pose = 'helm';
    this.gait = 0;        // stride phase, in cycles (two steps per cycle)
    this.stride = 0;      // 0 walk → 1 sprint, smoothed
    this.move = 0;        // 0 standing → 1 stepping, smoothed
    this.air = 0;         // 0 grounded → 1 airborne, smoothed
    this.rise = 0;        // +1 rising → −1 falling, smoothed
    this.lead = 1;        // which leg leads a jump (1 left, −1 right)
    this.crouch = 0;      // how far the hips have sunk into a landing (m)
    this.crouchV = 0;
    this.stretch = 0;     // take-off stretch, decays
    this.push = 0;        // lean from speeding up (+) or braking (−)
    this.squash = 0;      // (kept for callers) the landing strength last asked for
    this.moveSpeed = 0;   // fallback ground speed when the caller passes none (console testing)
    this._grounded = true; this._vy = 0; this._speed = 0; this._landK = 0;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._m = new THREE.Matrix4(); this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion();
    this._qc = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._tm = new THREE.Matrix4(); this._tp = new THREE.Vector3();
    this._foot = { z: 0, y: 0, pitch: 0 };
    this._air = [0, 0, 0];
    this.tailYaw = Math.PI;
  }

  /** Joint groups, the spyglass and the face decal: everything that doesn't change with the outfit. */
  buildSkeleton() {
    const R = this.root;
    const look = {};
    // ---- pelvis: carries the legs and the torso, so the hips can bob, sway
    // and sink while the feet stay where they're planted
    const pelvis = new THREE.Group();
    pelvis.position.y = HIP_Y;
    R.add(pelvis);
    this.pelvis = pelvis;

    // ---- legs: hip → knee → ankle
    this.legs = {};
    for (const [name, s] of [['left', 1], ['right', -1]]) {
      const hip = new THREE.Group();
      hip.position.set(s * HIP_X, 0, 0);
      pelvis.add(hip);
      const knee = new THREE.Group();
      knee.position.y = -TH;
      hip.add(knee);
      const foot = new THREE.Group();
      foot.position.y = -SH;
      knee.add(foot);
      this.legs[name] = { hip, knee, foot, side: s };
      look[s > 0 ? 'hipL' : 'hipR'] = lookGroup(hip);
      look[s > 0 ? 'kneeL' : 'kneeR'] = lookGroup(knee);
      look[s > 0 ? 'footL' : 'footR'] = lookGroup(foot);
    }

    // ---- torso (pivots at the hips so it can twist and lean)
    const torso = new THREE.Group();
    torso.position.y = TORSO_UP;
    pelvis.add(torso);
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
    this.spyglass.position.set(-0.185, 0.07, -0.03);
    this.spyglass.rotation.set(0.25, 0, 0.3);
    this.spyglass.scale.setScalar(0.8);
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

    // ---- arms (shoulder → elbow): IK at the helm, swung freely on foot
    this.arms = {};
    for (const [name, s] of [['left', 1], ['right', -1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * SHOULDER_X, SHOULDER_Y, 0);
      torso.add(shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -L1;
      shoulder.add(elbow);
      this.arms[name] = { shoulder, elbow, side: s };
      look[s > 0 ? 'shL' : 'shR'] = lookGroup(shoulder);
      look[s > 0 ? 'elL' : 'elR'] = lookGroup(elbow);
    }

    // ---- head: turns at the top of the neck. Hair, hats and the face are
    // modelled large and drawn at HEAD_SCALE.
    const head = new THREE.Group();
    head.position.y = NECK_Y;
    torso.add(head);
    this.head = head;
    const fit = new THREE.Group();
    fit.scale.setScalar(HEAD_SCALE);
    head.add(fit);
    look.head = lookGroup(fit);

    // face decal on a sphere cap just in front of the skin
    // (its shape follows the head shape; see setAppearance)
    const faceGeo = faceGeometry('round');
    this.faceShape = 'round';
    this.faceMat = toonMaterial({
      gradientMap: toonGradient(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const face = new THREE.Mesh(faceGeo, this.faceMat);
    face.renderOrder = 1;
    fit.add(face);
    this.faceMesh = face;

    this.eye = new THREE.Object3D();
    this.eye.position.set(0, HC - 0.02, 0.3);
    fit.add(this.eye);
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
        inked(geo, g, charMaterial, k === 'head' ? headOutline : inkOutline);
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

  /** Free what this explorer owns and take it out of the scene (shared materials and cached faces stay). */
  dispose() {
    for (const k of BONES) clearLook(this.looks[k]);
    this.spyglass.traverse((o) => o.geometry?.dispose());
    this.faceMesh.geometry.dispose();
    if (this.faceKey) { releaseFace(this.faceKey); this.faceKey = null; }
    this.faceMat.map = null;
    this.faceMat.dispose();
    this.root.removeFromParent();
  }

  setControl(kind) { this.control = kind; }

  /** 'helm' | 'ground' | 'preview'. */
  setPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.stride = 0; this.move = 0; this.air = 0; this.rise = 0; this.squash = 0;
    this.crouch = 0; this.crouchV = 0; this.stretch = 0; this.push = 0; this._landK = 0;
    this._grounded = true; this._vy = 0; this._speed = 0;
    this.pelvis.position.set(0, HIP_Y, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.root.rotation.x = 0; this.root.rotation.z = 0;
    for (const A of Object.values(this.arms)) { A.shoulder.rotation.set(0, 0, 0); A.elbow.rotation.set(0, 0, 0); }
    const base = this.root.userData.baseScale;
    if (base) this.root.scale.setScalar(base);
  }

  /** Sink into a landing (or a wind-up before a jump); `k` is roughly the impact strength 0..1. */
  land(k = 1) { this.squash = clamp(k, 0, 1); this._landK = Math.max(this._landK, this.squash); }
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

  /**
   * Two-bone leg IK: put the ankle at (ax, ay, az) and turn the sole to
   * `pitch` (toes down > 0) and `yaw` (toes out), all in root space. Call
   * after the pelvis has been placed for this frame.
   */
  solveLeg(L, ax, ay, az, pitch = 0, yaw = 0) {
    const P = this.pelvis;
    const T = this._v.set(ax, ay, az).sub(P.position).applyQuaternion(this._qc.copy(P.quaternion).invert());
    const d = T.sub(L.hip.position);
    const len = clamp(d.length(), 0.25, LEG - 0.003);
    const dir = d.normalize();
    const a = Math.acos(clamp((TH * TH + len * len - SH * SH) / (2 * TH * len), -1, 1));
    // the knee points the way the toes do
    const pole = this._v2.set(Math.sin(yaw) + L.side * 0.06, 0, Math.cos(yaw));
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const upper = this._v3.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(pole, Math.sin(a)).normalize();
    L.hip.quaternion.setFromUnitVectors(DOWN, upper);
    // the shin, from the knee to the ankle, in the thigh's space
    const shin = dir.multiplyScalar(len).addScaledVector(upper, -TH).normalize()
      .applyQuaternion(this._qa.copy(L.hip.quaternion).invert());
    L.knee.quaternion.setFromUnitVectors(DOWN, shin);
    // the foot keeps its own angle to the ground whatever the leg is doing
    this._qa.copy(P.quaternion).multiply(L.hip.quaternion).multiply(L.knee.quaternion).invert();
    L.foot.quaternion.copy(this._qa).multiply(this._qb.setFromEuler(this._e.set(pitch, yaw, 0, 'YXZ')));
  }

  /** Convert a point in boat space into torso space. */
  toTorso(p, out) {
    this.root.updateMatrix();
    this.pelvis.updateMatrix();
    this.torso.updateMatrix();
    this._m.multiplyMatrices(this.root.matrix, this.pelvis.matrix).multiply(this.torso.matrix).invert();
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
    const tiller = this.control === 'tiller';
    const breath = Math.sin(t * 2.3);

    // lean into turns, stay roughly upright against the boat's roll. The feet
    // stay flat on the deck: the hips shift over them and the knees give.
    const leanT = ctx.rudder * Math.min(1, Math.abs(ctx.speed) / 8) * 0.14 - ctx.roll * 0.45;
    this.lean = damp(this.lean, leanT, 4, dt);
    this.root.rotation.z = 0;
    this.root.rotation.x = 0;
    const P = this.pelvis;
    // a braced stance: knees soft, lower at the tiller to reach it
    const sink = (tiller ? 0.075 : 0.035) + Math.abs(this.lean) * 0.12;
    P.position.set(-Math.sin(this.lean) * HIP_Y * 0.85, HIP_Y - sink + breath * 0.004, 0);
    P.rotation.set(0, 0, this.lean * 0.8);
    this.solveLeg(this.legs.left, 0.125, ANKLE_Y, 0.035, 0, 0.24);
    this.solveLeg(this.legs.right, -0.125, ANKLE_Y, -0.03, 0, -0.24);

    // breathing
    this.torso.position.y = TORSO_UP + breath * 0.005;
    this.torso.scale.set(1 + breath * 0.008, 1 + breath * 0.012, 1 + breath * 0.008);

    // where to look: player's look direction, else idle glances
    const baseYaw = this.root.rotation.y;
    const look = this.updateLook(dt, ctx);
    const twistT = clamp(look * 0.35, -0.5, 0.5);
    const headT = clamp(look - twistT, -1.4, 1.4);
    this.twist = damp(this.twist, twistT, 5, dt);
    this.headYaw = damp(this.headYaw, headT, 7, dt);
    this.headPitch = damp(this.headPitch, clamp(ctx.lookPitch || 0, -0.5, 0.6), 6, dt);
    const bend = tiller ? 0.16 : 0.05; // lean in over the tiller
    this.torso.rotation.set(bend + Math.sin(t * 2.3 + 1) * 0.01, this.twist, this.lean * 0.2);
    this.head.rotation.set(-this.headPitch - bend * 0.7 + Math.sin(t * 1.1) * 0.02, this.headYaw, Math.sin(t * 0.7) * 0.03 - this.lean * 0.5, 'YXZ');

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
      // relaxed: hand resting on the hip by the satchel, swaying a little
      T.set(0.25, 0.07 + Math.sin(t * 1.7) * 0.01, 0.07 + Math.sin(t * 1.3) * 0.02);
      this.solveArm(this.arms.left, T, pole.set(1, 0.2, -0.8), k);
    }
  }

  /**
   * On foot (and the creator's idle preview). ctx (all optional):
   * { footSpeed: horizontal m/s, grounded: bool, vy: vertical m/s,
   *   lookRel, lookPitch, windRel, windStrength, turn: yaw rate for leaning }
   */
  updateGround(dt, t, ctx = {}) {
    dt = Math.min(dt, 1 / 20);
    const speed = ctx.footSpeed ?? this.moveSpeed;
    const grounded = ctx.grounded ?? true;
    const vy = ctx.vy ?? 0;

    // ---- take-off and touch-down
    if (this._grounded && !grounded && vy > 2) {
      this.stretch = 1;
      // lead with the leg that is swinging through; from a standstill, take turns
      this.lead = this.move > 0.3 ? (frac(this.gait) > 0.5 ? 1 : -1) : -this.lead;
    }
    if (!this._grounded && grounded && this._vy < -1.5) this.land(clamp(-this._vy / 20, 0.12, 1));
    this._grounded = grounded;
    if (!grounded) this._vy = vy;
    // the hips sink into a landing on a spring, and come back up past level
    if (this._landK) { this.crouchV += this._landK * 8; this._landK = 0; }
    const W = 17, Z = 0.6;
    this.crouchV += (-W * W * this.crouch - 2 * Z * W * this.crouchV) * dt;
    this.crouch = clamp(this.crouch + this.crouchV * dt, -0.02, 0.3);
    const crouch = this.crouch, down = Math.max(0, crouch);

    // ---- smoothed drivers
    const run = this.stride = damp(this.stride, sstep(1.2, 6.5, speed), 8, dt);
    const move = this.move = damp(this.move, clamp(speed / 0.9, 0, 1), 10, dt);
    const air = this.air = damp(this.air, grounded ? 0 : 1, grounded ? 16 : 9, dt);
    const rise = this.rise = damp(this.rise, clamp(vy / 6, -1, 1), 14, dt);
    const land = 1 - air;
    this.stretch = Math.max(0, this.stretch - dt * 4);
    const accel = dt > 0 ? (speed - this._speed) / dt : 0;
    this._speed = speed;
    this.push = damp(this.push, clamp(accel * 0.012, -0.2, 0.2) * land, 6, dt);

    // ---- stride: step length and cadence follow the ground speed, so the
    // planted foot stays put on the ground instead of skating
    const A = 0.17 + 0.27 * clamp(speed / 4.2, 0, 1);
    const duty = 0.62 - 0.28 * run;                    // share of the cycle each foot spends planted
    const freq = Math.min(2.9, (speed * duty) / (1.9 * A));
    this.gait += freq * dt * (grounded ? 1 : 0.35);
    const ph = this.gait;
    const mid = Math.cos(TAU * (ph - duty / 2));       // +1 over the left foot, −1 over the right
    const reach = Math.cos(TAU * (ph + 0.04));         // +1 as the left foot reaches forward
    const idle = Math.sin(t * 0.55) * (1 - move);      // slow weight shift when standing

    // ---- pelvis: carried lower the longer the stride, lowest over the planted
    // foot and highest between steps; it swings and tips with the legs
    const P = this.pelvis;
    const carry = Math.max(0.012, HIP_Y - (Math.sqrt(LEG * LEG - A * A) + 0.1)) * move;
    const bob = -(0.01 + 0.024 * run) * Math.cos(2 * TAU * (ph - duty / 2)) * move;
    const breath = Math.sin(t * 2.3) * (1 - move);
    const hipYaw = -(0.1 + 0.07 * run) * reach * move * land;
    const hipRoll = (0.045 * (1 - 0.5 * run) * mid * move + idle * 0.03) * land;
    const py = HIP_Y - (carry - bob) * land - crouch + breath * 0.003 - Math.abs(idle) * 0.006;
    P.position.set(((0.022 - 0.015 * run) * mid * move + idle * 0.014) * land, py, 0);
    P.rotation.set(0, hipYaw, hipRoll);

    // ---- legs: each foot follows its path through the stride (or tucks and
    // reaches in the air) and the leg is solved from it
    const F = this._foot;
    const asym = 0.15 + 0.85 * clamp(speed / 2.5, 0, 1); // a running jump scissors; a standing one doesn't
    for (const L of Object.values(this.legs)) {
      const s = L.side;
      footCycle(frac(ph + (s > 0 ? 0 : 0.5)), duty, A, run, F);
      // standing ↔ stepping
      let x = s * lerp(0.1, 0.085 - 0.04 * run, move);
      let y = lerp(ANKLE_Y, ankleRise(F.pitch) + F.y, move);
      let z = lerp(s * 0.018, F.z, move);
      let pitch = F.pitch * move;
      let yaw = s * lerp(0.16, 0.05, move);
      if (air > 0.001) {
        // rising: the lead knee drives up while the other leg trails, toes
        // pointed. Over the top both tuck; falling, they reach for the ground.
        const m = 0.5 + 0.5 * (s === this.lead ? asym : -asym);
        const a = airPose(AIR_LEG, m, rise, this._air);
        x = lerp(x, s * (0.09 + Math.max(0, -rise) * 0.03), air);
        y = lerp(y, py - a[0], air); z = lerp(z, a[1], air);
        pitch = lerp(pitch, a[2], air); yaw = lerp(yaw, s * 0.08, air);
      }
      this.solveLeg(L, x, y, z, pitch, yaw);
    }

    // ---- torso: leans with speed and into a push-off, folds into a landing,
    // and turns its shoulders against the hips
    const leanX = 0.03 * move + 0.2 * run + this.push + down * 1.5
      + air * (rise > 0 ? -0.1 * rise : -0.2 * rise);
    const look = this.updateLook(dt, ctx);
    const twistT = clamp(look * 0.35, -0.5, 0.5);
    const headT = clamp(look - twistT * 0.7, -1.4, 1.4);
    this.twist = damp(this.twist, twistT, 8, dt);
    this.headYaw = damp(this.headYaw, headT, 7, dt);
    this.headPitch = damp(this.headPitch, clamp((ctx.lookPitch || 0) - run * 0.1, -0.5, 0.6), 6, dt);
    const counter = -hipYaw * 1.9;
    this.torso.position.y = TORSO_UP + breath * 0.005;
    this.torso.scale.set(1 + breath * 0.008, 1 + breath * 0.012, 1 + breath * 0.008);
    this.torso.rotation.set(leanX, this.twist + counter, -hipRoll * 1.5);
    // the head stays level and looks where it's going while the body works under it
    this.head.rotation.set(
      -this.headPitch - leanX * 0.65 + Math.sin(t * 1.1) * 0.02 * (1 - move),
      this.headYaw - (hipYaw + counter) * 0.85,
      Math.sin(t * 0.7) * 0.03 * (1 - move) + hipRoll * 0.5, 'YXZ');

    // lean into turns; a little stretch on take-off and squash on landing
    this.lean = damp(this.lean, clamp(-(ctx.turn || 0) * 0.06 * (0.3 + run), -0.28, 0.28), 6, dt);
    this.root.rotation.z = this.lean;
    this.root.rotation.x = 0;
    const base = this.root.userData.baseScale ?? (this.root.userData.baseScale = this.root.scale.x);
    const sq = down * 0.22 - this.stretch * 0.07 * air;
    this.root.scale.set(base * (1 + sq * 0.5), base * (1 - sq), base * (1 + sq * 0.5));

    // scarf trails behind when moving, streams with the wind when still
    const str = clamp((ctx.windStrength ?? 0.3) + run * 1.2 + move * 0.3 + air * 0.6, 0, 2);
    const wrel = ctx.windRel != null ? wrapAngle(ctx.windRel - this.twist - this.root.rotation.y) : Math.PI;
    this.aimTail(dt, t, str, move > 0.3 || air > 0.2 ? Math.PI : wrel);

    // ---- arms: swing from the shoulder against the legs, elbows folding up
    // as the pace rises; thrown up for a jump and out for balance on the way down
    const ka = 1 - Math.exp(-18 * dt);
    const up = Math.max(0, rise), dn = Math.max(0, -rise);
    for (const A2 of Object.values(this.arms)) {
      const s = A2.side;
      const fwd = -s * reach * move;                    // + as this arm swings forward
      let shX = 0.1 * run - (0.32 + 0.6 * run) * fwd + Math.sin(t * 1.3 + s) * 0.03 * (1 - move) + down * 1.4;
      let shZ = s * (0.08 + 0.1 * run + down * 1.6);
      let elX = -(0.2 + 1.2 * run + (0.12 + 0.3 * run) * fwd + down * 0.9);
      let elZ = -s * 0.22 * run;
      if (air > 0.001) {
        // the arm opposite the lead knee drives up; from a standing jump both go up
        const m = 0.5 + 0.5 * (s === -this.lead ? asym : -asym);
        const a = airPose(AIR_ARM, m, rise, this._air);
        const flap = Math.sin(t * 13 + s) * 0.08 * dn;
        const both = (1 - asym) * up * 1.5;
        shX = lerp(shX, a[0] - both + flap, air); shZ = lerp(shZ, s * (a[1] + flap), air);
        elX = lerp(elX, a[2], air); elZ = lerp(elZ, 0, air);
      }
      const S = A2.shoulder.rotation, E = A2.elbow.rotation;
      S.set(lerp(S.x, shX, ka), 0, lerp(S.z, shZ, ka));
      E.set(lerp(E.x, elX, ka), 0, lerp(E.z, elZ, ka));
    }
  }

}
