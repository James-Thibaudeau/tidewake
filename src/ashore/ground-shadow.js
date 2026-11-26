// The explorer's shadow straight down: a soft dark disc on whatever is right
// below them, smaller and fainter the higher they are. It shows where a jump
// will come down, at every quality and with the effects off. The sun's own
// shadows (fx.js) fall at the sun's slant, and not at all with ?fx=0.
//
// It writes no depth, so the ink edges (drawn from depth) don't outline it.
import * as THREE from 'three';
import { raycast, terrainNormal } from './collide.js';

const REACH = 14;   // m: no shadow from higher up than this
const SIZE = 0.9;   // m across, standing on the ground
const DARK = 0.4;   // its opacity there
const DOWN = { x: 0, y: -1, z: 0 };
const FLAT = { x: 0, y: 1, z: 0 };
const RING = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]; // where it looks down from, in body radii

let disc = null;
/** A round soft-edged spot, dark in the middle (made once, shared). */
function softDisc() {
  if (disc) return disc;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  disc = new THREE.CanvasTexture(c);
  disc.colorSpace = THREE.SRGBColorSpace;
  return disc;
}

export class GroundShadow {
  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: '#0e1a26', map: softDisc(), transparent: true, opacity: DARK, depthWrite: false,
      // drawn just in front of the ground it lies on, never through it
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.material);
    this.mesh.renderOrder = 1;
    this._from = { x: 0, y: 0, z: 0 };
    this._n = { x: 0, y: 1, z: 0 };
    this._up = new THREE.Vector3(0, 1, 0);
    this._tilt = new THREE.Vector3();
  }

  /**
   * Lay it on what is under `at` (the explorer's feet) in `level`. It looks
   * down from the middle and from four points round the edge of the body
   * (`r`, the capsule's radius) and lies at the highest thing it finds: the
   * explorer stands on, and lands on, a ledge that only their edge is over.
   */
  update(level, at, r) {
    const o = this._from, m = this.mesh;
    let best = null;
    for (const [dx, dz] of RING) {
      o.x = at.x + dx * r; o.y = at.y + 0.05; o.z = at.z + dz * r;
      const hit = raycast(level, o, DOWN, REACH);
      if (hit.hit && (!best || hit.point.y > best.y)) best = hit.point;
    }
    // nothing below, or only the sea: none (the water moves under it)
    if (!best || best.y < (level.waterY ?? -Infinity) + 0.02) { m.visible = false; return; }
    const k = Math.min(1, Math.max(0, at.y - best.y) / REACH); // 0 standing … 1 at its reach
    m.visible = true;
    m.position.set(at.x, best.y + 0.015, at.z);
    m.scale.setScalar(SIZE * (1 - 0.5 * k));
    this.material.opacity = DARK * (1 - k) * (1 - k);
    // on the island's slopes it lies along the ground; on platforms (flat tops) level
    const g = level.groundAt(at.x, at.z);
    const n = Math.abs(g - best.y) < 0.05 ? terrainNormal(level, at.x, at.z, this._n) : FLAT;
    m.quaternion.setFromUnitVectors(this._up, this._tilt.set(n.x, n.y, n.z));
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
