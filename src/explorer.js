// The player character: a short, chibi-proportioned anime explorer built from
// primitives (toon shaded + ink outlines) with simple procedural animation:
// breathing, leaning, scarf flutter, two-bone IK arms on the helm and a head
// that turns toward wherever the player is looking.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient, outlineMaterial } from './toon.js';
import { clamp, damp, wrapAngle } from './util.js';

// ------------------------------------------------------------ geometry helpers
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** Bake a primitive into a vertex-coloured, non-indexed part. */
export function part(geo, color, t = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ');
  _q.setFromEuler(_e);
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function mergeParts(parts) {
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

export const charMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
const inkOutline = outlineMaterial(0.022, 0x1a1420);

function inked(geo, parent, mat = charMaterial) {
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, inkOutline);
  parent.add(m, o);
  return m;
}

// ----------------------------------------------------------------- palette
const C = {
  skin: '#ffd8b4', skinShade: '#f4b994', hair: '#6e3318', hair2: '#8f4a22',
  hat: '#e6cf92', hatBand: '#7a4a24', shirt: '#f7f0dd', vest: '#4f7d3a', vest2: '#3c6430',
  shorts: '#c79f63', belt: '#5b3a1f', buckle: '#ffd24a', sock: '#ffffff', boot: '#6e4224',
  sole: '#35200f', scarf: '#e8413a', scarf2: '#c22f2a', satchel: '#a9743c', satchel2: '#7f5428',
  brass: '#e0a943', glove: '#8a5a32',
};

// ------------------------------------------------------------------- face
function faceTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const eye = (cx, flip) => {
    const cy = S * 0.56;
    // sclera
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx, cy, 19, 27, 0, 0, Math.PI * 2); g.fill();
    // iris with a warm two-tone gradient
    const gr = g.createLinearGradient(0, cy - 24, 0, cy + 24);
    gr.addColorStop(0, '#3b1f0e'); gr.addColorStop(0.55, '#7a3d16'); gr.addColorStop(1, '#d48a3a');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(cx + flip * 1.5, cy + 3, 15, 23, 0, 0, Math.PI * 2); g.fill();
    // pupil
    g.fillStyle = '#1a0c05';
    g.beginPath(); g.ellipse(cx + flip * 1.5, cy + 4, 7, 12, 0, 0, Math.PI * 2); g.fill();
    // highlights
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(cx - 6 + flip * 1.5, cy - 7, 6.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx + 6 + flip * 1.5, cy + 12, 3, 0, Math.PI * 2); g.fill();
    // upper lash line with an outer flick
    g.strokeStyle = '#24110a'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.ellipse(cx, cy + 2, 21, 28, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.beginPath();
    g.moveTo(cx + flip * 19, cy - 14); g.lineTo(cx + flip * 27, cy - 20); g.stroke();
    // lower lid hint
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(cx, cy, 18, 26, 0, Math.PI * 0.3, Math.PI * 0.7); g.stroke();
    // brow
    g.strokeStyle = '#5a2810'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - 16 * flip, cy - 42); g.quadraticCurveTo(cx, cy - 50, cx + 18 * flip, cy - 43); g.stroke();
  };
  eye(S * 0.33, -1);
  eye(S * 0.67, 1);
  // blush
  g.fillStyle = 'rgba(255, 110, 110, 0.42)';
  for (const x of [S * 0.24, S * 0.76]) { g.beginPath(); g.ellipse(x, S * 0.74, 17, 8, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(230, 80, 80, 0.55)'; g.lineWidth = 2;
  for (const x of [S * 0.24, S * 0.76]) for (const d of [-7, 0, 7]) {
    g.beginPath(); g.moveTo(x + d - 2, S * 0.76); g.lineTo(x + d + 3, S * 0.72); g.stroke();
  }
  // nose + grin
  g.fillStyle = '#e8a383';
  g.beginPath(); g.ellipse(S * 0.5, S * 0.7, 3, 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7a2a1e';
  g.beginPath(); g.moveTo(S * 0.455, S * 0.79); g.quadraticCurveTo(S * 0.5, S * 0.86, S * 0.545, S * 0.79); g.closePath(); g.fill();
  g.fillStyle = '#ff8a7a';
  g.beginPath(); g.ellipse(S * 0.5, S * 0.825, 9, 3, 0, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// -------------------------------------------------------------- the explorer
const DOWN = new THREE.Vector3(0, -1, 0);
const L1 = 0.25, L2 = 0.24; // upper arm, forearm + hand

export class Explorer {
  constructor() {
    this.root = new THREE.Group();
    this.root.scale.setScalar(1.15);
    this.build();
    this.headYaw = 0; this.headPitch = 0; this.twist = 0; this.lean = 0;
    this.glance = 0; this.glanceTimer = 3; this.glanceTarget = 0;
    this.control = 'tiller';
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._m = new THREE.Matrix4(); this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion();
  }

  build() {
    const R = this.root;
    // ---- legs, socks and chunky boots (static, on the deck)
    const legs = [];
    for (const s of [-1, 1]) {
      const x = s * 0.1;
      legs.push(
        part(new THREE.SphereGeometry(0.1, 12, 8), C.boot, { x, y: 0.075, z: 0.045, sx: 1.05, sy: 0.75, sz: 1.55 }),
        part(new THREE.BoxGeometry(0.2, 0.04, 0.33), C.sole, { x, y: 0.02, z: 0.04 }),
        part(new THREE.CylinderGeometry(0.088, 0.095, 0.09, 12), C.boot, { x, y: 0.16 }),
        part(new THREE.TorusGeometry(0.088, 0.018, 5, 12), C.sole, { x, y: 0.2, rx: Math.PI / 2 }),
        part(new THREE.CylinderGeometry(0.066, 0.072, 0.1, 10), C.sock, { x, y: 0.25 }),
        part(new THREE.CylinderGeometry(0.056, 0.062, 0.14, 10), C.skin, { x, y: 0.35 }),
        part(new THREE.CylinderGeometry(0.105, 0.1, 0.13, 12), C.shorts, { x: x * 1.05, y: 0.45 }),
        part(new THREE.TorusGeometry(0.1, 0.014, 5, 12), C.shorts, { x: x * 1.05, y: 0.39, rx: Math.PI / 2 }),
      );
    }
    inked(mergeParts(legs), R);

    // ---- torso (pivots at the hips so it can twist and lean)
    const torso = new THREE.Group();
    torso.position.y = 0.48;
    R.add(torso);
    this.torso = torso;
    const tp = [
      part(new THREE.CylinderGeometry(0.235, 0.225, 0.14, 16), C.shorts, { y: 0.03 }),
      part(new THREE.CylinderGeometry(0.245, 0.245, 0.055, 16), C.belt, { y: 0.11 }),
      part(new THREE.BoxGeometry(0.085, 0.065, 0.03), C.buckle, { y: 0.11, z: 0.245 }),
      part(new THREE.BoxGeometry(0.045, 0.03, 0.035), C.belt, { y: 0.11, z: 0.25 }),
      part(new THREE.CylinderGeometry(0.205, 0.235, 0.38, 16), C.shirt, { y: 0.32 }),
      part(new THREE.SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.shirt, { y: 0.5, sy: 0.55 }),
      // open-front vest
      part(new THREE.CylinderGeometry(0.228, 0.255, 0.33, 16, 1, true, 0.5, Math.PI * 2 - 1.0), C.vest, { y: 0.3 }),
      part(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 16, 1, true, 0.5, Math.PI * 2 - 1.0), C.vest2, { y: 0.145 }),
      // collar
      part(new THREE.ConeGeometry(0.07, 0.09, 3), C.shirt, { x: 0.07, y: 0.53, z: 0.13, rx: 1.1, rz: -0.3 }),
      part(new THREE.ConeGeometry(0.07, 0.09, 3), C.shirt, { x: -0.07, y: 0.53, z: 0.13, rx: 1.1, rz: 0.3 }),
      // satchel strap across the chest (right shoulder → left hip)
      part(new THREE.BoxGeometry(0.045, 0.62, 0.02), C.satchel2, { y: 0.3, z: 0.232, rz: 0.72 }),
      part(new THREE.BoxGeometry(0.045, 0.62, 0.02), C.satchel2, { y: 0.3, z: -0.232, rz: -0.72 }),
      // satchel on the left hip
      part(new THREE.BoxGeometry(0.08, 0.16, 0.2), C.satchel, { x: 0.28, y: 0.06, z: 0.02 }),
      part(new THREE.BoxGeometry(0.09, 0.07, 0.21), C.satchel2, { x: 0.285, y: 0.12, z: 0.02 }),
      part(new THREE.BoxGeometry(0.03, 0.035, 0.035), C.buckle, { x: 0.33, y: 0.09, z: 0.02 }),
      // neck
      part(new THREE.CylinderGeometry(0.06, 0.07, 0.09, 10), C.skin, { y: 0.56 }),
    ];
    for (const s of [-1, 1]) {
      tp.push(
        part(new THREE.BoxGeometry(0.09, 0.08, 0.025), C.vest2, { x: s * 0.13, y: 0.27, z: 0.218, ry: s * 0.55 }),
        part(new THREE.BoxGeometry(0.095, 0.03, 0.03), C.vest, { x: s * 0.13, y: 0.31, z: 0.222, ry: s * 0.55 }),
        part(new THREE.SphereGeometry(0.012, 6, 4), C.buckle, { x: s * 0.13, y: 0.3, z: 0.24, ry: s * 0.55 }),
      );
    }
    inked(mergeParts(tp), torso);

    // brass spyglass on the belt (shown once the spyglass is upgraded)
    const sg = mergeParts([
      part(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 10), C.brass),
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), '#8a5a1e', { y: 0.12 }),
      part(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), '#8a5a1e', { y: -0.06 }),
    ]);
    this.spyglass = new THREE.Group();
    inked(sg, this.spyglass);
    this.spyglass.position.set(-0.26, 0.08, -0.04);
    this.spyglass.rotation.set(0.25, 0, 0.35);
    this.spyglass.visible = false;
    torso.add(this.spyglass);

    // ---- scarf with a two-segment fluttering tail
    const scarf = mergeParts([
      part(new THREE.TorusGeometry(0.12, 0.058, 8, 18), C.scarf, { y: 0.54, rx: Math.PI / 2 + 0.12 }),
      part(new THREE.SphereGeometry(0.065, 8, 6), C.scarf2, { x: 0.08, y: 0.5, z: 0.1 }),
    ]);
    inked(scarf, torso);
    this.scarfTail = new THREE.Group();
    this.scarfTail.position.set(0.02, 0.52, -0.1);
    torso.add(this.scarfTail);
    const segGeo = mergeParts([part(new THREE.BoxGeometry(0.11, 0.028, 0.22), C.scarf, { z: 0.11 })]);
    const seg2Geo = mergeParts([
      part(new THREE.BoxGeometry(0.1, 0.026, 0.2), C.scarf, { z: 0.1 }),
      part(new THREE.BoxGeometry(0.1, 0.03, 0.03), C.scarf2, { z: 0.19 }),
    ]);
    inked(segGeo, this.scarfTail);
    this.scarfTail2 = new THREE.Group();
    this.scarfTail2.position.z = 0.21;
    inked(seg2Geo, this.scarfTail2);
    this.scarfTail.add(this.scarfTail2);

    // ---- arms (shoulder → elbow), driven by two-bone IK
    this.arms = {};
    for (const [name, s] of [['left', 1], ['right', -1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.255, 0.46, 0);
      torso.add(shoulder);
      inked(mergeParts([
        part(new THREE.SphereGeometry(0.09, 10, 8), C.shirt, { y: -0.02 }),
        part(new THREE.CylinderGeometry(0.088, 0.08, 0.12, 10), C.shirt, { y: -0.07 }),
        part(new THREE.TorusGeometry(0.08, 0.012, 5, 10), C.vest, { y: -0.13, rx: Math.PI / 2 }),
        part(new THREE.CylinderGeometry(0.052, 0.048, 0.14, 10), C.skin, { y: -0.19 }),
      ]), shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -L1;
      shoulder.add(elbow);
      inked(mergeParts([
        part(new THREE.SphereGeometry(0.05, 8, 6), C.skin),
        part(new THREE.CylinderGeometry(0.048, 0.043, 0.15, 10), C.skin, { y: -0.08 }),
        part(new THREE.CylinderGeometry(0.052, 0.052, 0.045, 10), C.glove, { y: -0.16 }),
        part(new THREE.SphereGeometry(0.062, 10, 8), C.glove, { y: -0.205, sx: 0.9, sz: 1.1 }),
        part(new THREE.SphereGeometry(0.03, 6, 4), C.glove, { x: s * -0.045, y: -0.19, z: 0.04 }),
      ]), elbow);
      this.arms[name] = { shoulder, elbow, side: s };
    }

    // ---- head: big chibi head, spiky hair and a pith helmet
    const head = new THREE.Group();
    head.position.y = 0.58;
    torso.add(head);
    this.head = head;
    const HC = 0.3; // head centre height within the head group
    const hp = [
      part(new THREE.SphereGeometry(0.32, 24, 18), C.skin, { y: HC, sy: 0.95, sz: 0.97 }),
      part(new THREE.SphereGeometry(0.06, 8, 6), C.skinShade, { x: 0.31, y: HC - 0.02, sx: 0.6 }),
      part(new THREE.SphereGeometry(0.06, 8, 6), C.skinShade, { x: -0.31, y: HC - 0.02, sx: 0.6 }),
    ];
    // hair cap, tilted so the fringe sits high on the forehead
    const cap = part(new THREE.SphereGeometry(0.338, 20, 12, 0, Math.PI * 2, 0, 1.55), C.hair, { rx: -0.28 });
    cap.translate(0, HC + 0.012, -0.012);
    hp.push(cap);
    // fringe
    const fringe = [[-0.2, 0.08, -0.25], [-0.1, 0.03, -0.08], [0.0, 0.05, 0.05], [0.1, 0.03, 0.12], [0.2, 0.08, 0.28]];
    for (const [x, lift, rz] of fringe) {
      hp.push(part(new THREE.ConeGeometry(0.075, 0.24, 5), C.hair, { x, y: HC + 0.05 + lift, z: 0.29 - Math.abs(x) * 0.25, rx: Math.PI - 0.35, rz }));
    }
    // side locks
    for (const s of [-1, 1]) {
      hp.push(part(new THREE.ConeGeometry(0.07, 0.26, 5), C.hair, { x: s * 0.3, y: HC - 0.05, z: 0.06, rz: s * -0.25 + Math.PI, rx: -0.1 }));
      hp.push(part(new THREE.ConeGeometry(0.06, 0.2, 5), C.hair2, { x: s * 0.32, y: HC + 0.02, z: -0.1, rz: s * -(Math.PI / 2 + 0.5) }));
    }
    // spiky back tufts
    const tufts = [[-0.2, 0.12], [0, 0.18], [0.2, 0.1], [-0.12, -0.02], [0.12, -0.04], [0, 0.04]];
    for (const [x, y] of tufts) {
      hp.push(part(new THREE.ConeGeometry(0.085, 0.3, 5), (x + y) % 0.2 > 0.05 ? C.hair2 : C.hair,
        { x, y: HC + y, z: -0.27, rx: -Math.PI / 2 - 0.35 + y, rz: x * 1.4 }));
    }
    // a cheeky ahoge poking out the back of the helmet
    hp.push(part(new THREE.ConeGeometry(0.04, 0.22, 4), C.hair, { x: 0.05, y: HC + 0.34, z: -0.22, rx: -0.9, rz: -0.3 }));
    // pith helmet (built upright, then tipped back so the face shows)
    const hat = mergeParts([
      part(new THREE.SphereGeometry(0.355, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), C.hat, { y: 0.16, sy: 0.82, sz: 1.08 }),
      part(new THREE.CylinderGeometry(0.36, 0.362, 0.075, 20, 1, true), C.hatBand, { y: 0.195 }),
      part(new THREE.CylinderGeometry(0.53, 0.56, 0.03, 26), C.hat, { y: 0.16, sz: 1.12 }),
      part(new THREE.TorusGeometry(0.545, 0.015, 4, 26), '#c9ad6e', { y: 0.16, rx: Math.PI / 2, sy: 1.12 }),
      part(new THREE.SphereGeometry(0.045, 8, 6), C.hatBand, { y: 0.46 }),
      part(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6), C.hatBand, { y: 0.43 }),
    ]);
    hat.rotateX(-0.2);
    hat.translate(0, HC, -0.02);
    hp.push(hat);
    inked(mergeParts(hp), head);

    // face decal on a sphere cap just in front of the skin
    const faceGeo = new THREE.SphereGeometry(0.32, 24, 16, Math.PI / 2 - 0.75, 1.5, Math.PI / 2 - 0.55, 1.1);
    faceGeo.scale(1.014, 0.964, 0.984);
    faceGeo.translate(0, HC, 0);
    const faceMat = new THREE.MeshToonMaterial({
      map: faceTexture(), gradientMap: toonGradient(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.renderOrder = 1;
    head.add(face);

    this.eye = new THREE.Object3D();
    this.eye.position.set(0, HC - 0.02, 0.3);
    head.add(this.eye);
  }

  setControl(kind) { this.control = kind; }
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
   * ctx: { rudder, speed, roll, lookRel (radians relative to bow, or null), lookPitch,
   *        windRel (apparent wind direction relative to bow, heading convention), windStrength,
   *        gripR, gripL (boat-space Vector3, gripL may be null) }
   */
  update(dt, t, ctx) {
    const k = 1 - Math.exp(-12 * dt);
    // breathing + bob
    const breath = Math.sin(t * 2.3);
    this.torso.position.y = 0.48 + breath * 0.006;
    this.torso.scale.set(1 + breath * 0.008, 1 + breath * 0.012, 1 + breath * 0.008);

    // where to look: player's look direction, else idle glances
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
    this.scarfTail.rotation.set(clamp(1.25 - str * 0.6, 0.15, 1.3) + Math.sin(t * 9) * 0.08 * str, wrel + Math.sin(t * 7.3) * 0.15 * str, 0, 'YXZ');
    this.scarfTail2.rotation.set(Math.sin(t * 11 + 1) * 0.35 * str - 0.1, Math.sin(t * 8.7) * 0.3 * str, 0);

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
}
