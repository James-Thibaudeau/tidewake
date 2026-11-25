// A tow line: one boat pulling another on a rope. Used when Sable's sloop is
// dismasted, and again to haul it clear of the kraken.
//
// The line only moves the towed boat (position, heading, speed, sails
// furled); whoever owns that boat still calls its animate(). It never
// touches the lead boat: slowing the tug down is the caller's business.
import * as THREE from 'three';
import { toonMaterial, toonGradient } from './toon.js';
import { waveHeight } from './waves.js';
import { damp, dampAngle } from './util.js';

const SEGS = 8;            // rope segments
const ROPE_R = 0.06;       // a hawser, thicker than the rigging so it reads from the chase camera
const STERN = 3.0, BOW = 3.6, DECK = 1.1; // where the line is made fast (boat units, × sizeScale)
const REEL = 30;           // fastest the slack is taken up (u/s), so a long first pull isn't a teleport
const TURN = 1.5;          // how quickly the towed boat swings to follow the rope

const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

export class TowLine {
  /** lead, towed: Boats. opts: { length } of the rope, stern cleat to bow. */
  constructor(scene, lead, towed, { length = 16 } = {}) {
    this.scene = scene;
    this.lead = lead;
    this.towed = towed;
    this.length = length;
    this.taut = false;
    this.geo = new THREE.CylinderGeometry(ROPE_R, ROPE_R, 1, 5).translate(0, 0.5, 0);
    this.mat = toonMaterial({ color: '#5a4632', gradientMap: toonGradient() });
    this.group = new THREE.Group();
    this.segs = [];
    for (let i = 0; i < SEGS; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.frustumCulled = false;
      this.group.add(m);
      this.segs.push(m);
    }
    scene.add(this.group);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this._p = new THREE.Vector3(); this._q = new THREE.Vector3();
    this.update(0);
  }

  /** The two ends of the rope: the lead's stern cleat and the towed boat's bow. */
  ends() {
    const L = this.lead, T = this.towed;
    const kl = L.sizeScale || 1, kt = T.sizeScale || 1;
    this._a.set(L.pos.x - Math.sin(L.heading) * STERN * kl, (L.y || 0) + DECK * kl, L.pos.z - Math.cos(L.heading) * STERN * kl);
    this._b.set(T.pos.x + Math.sin(T.heading) * BOW * kt, (T.y || 0) + DECK * kt, T.pos.z + Math.cos(T.heading) * BOW * kt);
  }

  /** Keep the towed boat within the rope's length behind the lead, turn it to follow, draw the rope. */
  update(dt) {
    const T = this.towed, A = this._a, B = this._b;
    this.ends();
    let dx = A.x - B.x, dz = A.z - B.z;
    let d = Math.hypot(dx, dz);
    T.sailLevel = 0;
    T.rudder = 0;
    this.taut = d > this.length;
    if (this.taut && dt > 0) {
      // dragged along the line, bow first
      const pull = Math.min(d - this.length, REEL * dt);
      T.pos.x += (dx / d) * pull; T.pos.z += (dz / d) * pull;
      T.speed = damp(T.speed, pull / dt, 4, dt);
      T.heading = dampAngle(T.heading, Math.atan2(A.x - T.pos.x, A.z - T.pos.z), TURN, dt);
      this.ends();
      dx = A.x - B.x; dz = A.z - B.z; d = Math.hypot(dx, dz);
    } else if (dt > 0) {
      // slack: she sits where she is while the way comes off her
      T.speed = damp(T.speed, 0, 2, dt);
    }

    // a sagging curve: nearly straight under load, drooping to the water when slack
    const slack = Math.max(0, this.length - d);
    const sag = 0.35 + slack * 0.55;
    const cx = (A.x + B.x) / 2, cz = (A.z + B.z) / 2, cy = (A.y + B.y) / 2 - sag * 2;
    const P = this._p, Q = this._q;
    P.copy(A);
    for (let i = 0; i < SEGS; i++) {
      const t = (i + 1) / SEGS, u = 1 - t;
      Q.set(u * u * A.x + 2 * u * t * cx + t * t * B.x, u * u * A.y + 2 * u * t * cy + t * t * B.y, u * u * A.z + 2 * u * t * cz + t * t * B.z);
      if (i < SEGS - 1) Q.y = Math.max(Q.y, waveHeight(Q.x, Q.z) + 0.05);
      const m = this.segs[i];
      m.position.copy(P);
      _d.subVectors(Q, P);
      const len = _d.length() || 1e-3;
      m.scale.set(1, len, 1);
      m.quaternion.setFromUnitVectors(_up, _d.divideScalar(len));
      P.copy(Q);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.geo.dispose();
    this.mat.dispose();
    this.segs.length = 0;
  }
}
