// Boat part: the figureheads. Each is a small carved model in the stem's own
// frame (+z out over the water, +y up), built the size of the eagle the hull
// tiers carry, so any of them sits on any hull's mount (HULL_STYLE.figure).
// The eagles (white, gilded, royal) are the tiers' own; the rest are sold in
// the paint yard (paints.js).
import * as THREE from 'three';
import { part } from '../explorer.js';
import { GOLD, decoMesh, figurehead } from './parts.js';

const SPHERE = (r) => new THREE.SphereGeometry(r, 12, 8);
const CONE = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n);
const EYE = '#1a1420';

function dolphin() {
  const blue = '#5d8fb8', belly = '#e8eef2', P = [];
  P.push(part(SPHERE(0.2), blue, { y: 0.05, z: 0.05, sx: 0.78, sy: 0.85, sz: 2.3 }));     // body
  P.push(part(SPHERE(0.17), belly, { y: -0.03, z: 0.12, sx: 0.66, sy: 0.6, sz: 2.0 }));   // pale belly
  P.push(part(SPHERE(0.15), blue, { y: 0.1, z: 0.42, sx: 0.85, sy: 0.9, sz: 1.1 }));     // melon
  P.push(part(new THREE.CylinderGeometry(0.035, 0.06, 0.2, 8), belly, { y: 0.06, z: 0.62, rx: Math.PI / 2 })); // beak
  P.push(part(CONE(0.1, 0.24, 4), blue, { y: 0.24, z: -0.02, rx: -0.5, sx: 0.3 }));      // dorsal fin
  for (const s of [-1, 1]) {
    P.push(part(CONE(0.07, 0.22, 4), blue, { x: s * 0.15, y: -0.06, z: 0.2, rz: s * 1.9, rx: 0.5, sz: 0.3 })); // flippers
    P.push(part(SPHERE(0.022), EYE, { x: s * 0.11, y: 0.14, z: 0.5 }));
    P.push(part(CONE(0.09, 0.26, 4), blue, { x: s * 0.12, y: 0.0, z: -0.46, rz: s * Math.PI / 2, rx: 0.2, sz: 0.25 })); // flukes
  }
  P.push(part(new THREE.TorusGeometry(0.1, 0.022, 5, 12), GOLD, { y: 0.06, z: 0.3, sy: 1.1 })); // a gilded collar
  return P;
}

function owl() {
  const wood = '#8c6c48', dark = '#6e5236', face = '#e4d2a8', P = [];
  P.push(part(SPHERE(0.22), wood, { y: 0.02, z: 0.02, sy: 1.15, sz: 1.1 }));              // body
  P.push(part(SPHERE(0.2), wood, { y: 0.34, z: 0.14 }));                                // head
  P.push(part(SPHERE(0.15), face, { y: 0.33, z: 0.24, sz: 0.5 }));                     // face disc
  for (const s of [-1, 1]) {
    P.push(part(CONE(0.06, 0.18, 4), dark, { x: s * 0.12, y: 0.53, z: 0.12, rz: -s * 0.35 })); // ear tufts
    P.push(part(SPHERE(0.065), GOLD, { x: s * 0.075, y: 0.36, z: 0.3, sz: 0.5 }));        // eyes
    P.push(part(SPHERE(0.03), EYE, { x: s * 0.075, y: 0.36, z: 0.33 }));
    P.push(part(SPHERE(0.15), dark, { x: s * 0.19, y: 0.02, z: -0.04, sx: 0.4, sy: 1.1, sz: 1.3, ry: s * 0.25 })); // folded wings
  }
  P.push(part(CONE(0.035, 0.1, 4), '#e89a2a', { y: 0.3, z: 0.34, rx: Math.PI / 2 + 0.5 })); // beak
  for (const s of [-1, 1]) P.push(part(CONE(0.04, 0.1, 4), GOLD, { x: s * 0.08, y: -0.22, z: 0.12, rx: Math.PI })); // talons
  return P;
}

function seaSerpent() {
  const green = '#3d8a6a', pale = '#bfe0b0', P = [];
  // the neck rises out of the stem in an S, thinning to the head
  const pts = [[0, -0.1, -0.45], [0, -0.04, -0.25], [0, 0.04, -0.05], [0, 0.14, 0.12], [0, 0.27, 0.24], [0, 0.4, 0.3]];
  pts.forEach(([x, y, z], i) => {
    P.push(part(SPHERE(0.15 - i * 0.012), green, { x, y, z }));
    P.push(part(CONE(0.05, 0.12, 4), GOLD, { x, y: y + 0.15 - i * 0.012, z: z - 0.02, rx: -0.3 })); // spines
  });
  P.push(part(SPHERE(0.14), green, { y: 0.47, z: 0.42, sx: 0.9, sy: 0.75, sz: 1.5 }));   // head
  P.push(part(SPHERE(0.1), pale, { y: 0.4, z: 0.5, sx: 0.85, sy: 0.5, sz: 1.5 }));        // jaw
  for (const s of [-1, 1]) {
    P.push(part(SPHERE(0.035), GOLD, { x: s * 0.09, y: 0.53, z: 0.5 }));                  // eyes
    P.push(part(SPHERE(0.017), EYE, { x: s * 0.1, y: 0.535, z: 0.525 }));
    P.push(part(CONE(0.08, 0.26, 3), GOLD, { x: s * 0.12, y: 0.52, z: 0.25, rx: -Math.PI / 2 + 0.5, rz: s * 0.7, sz: 0.3 })); // frills
    P.push(part(CONE(0.02, 0.1, 4), '#f4efe4', { x: s * 0.05, y: 0.38, z: 0.6, rx: Math.PI }));  // fangs
  }
  return P;
}

function mermaid() {
  const skin = '#e8b48a', hair = '#b8432f', tail = '#2f9a8a', fin = '#5ac0b0', top = '#f0a0a8', P = [];
  // the tail curls back under the stem, the body leans out over the water
  P.push(part(SPHERE(0.15), tail, { y: -0.12, z: -0.32, sy: 0.8, sz: 1.8, rx: 0.4 }));
  P.push(part(SPHERE(0.11), tail, { y: -0.2, z: -0.62, sy: 0.7, sz: 1.4, rx: 0.9 }));
  for (const s of [-1, 1]) P.push(part(CONE(0.1, 0.24, 4), fin, { x: s * 0.09, y: -0.32, z: -0.8, rz: s * 1.2, rx: 0.4, sz: 0.25 }));
  P.push(part(SPHERE(0.14), tail, { y: 0.0, z: 0.0, sx: 1.05, sy: 0.9, sz: 1.2 }));      // hips
  P.push(part(new THREE.TorusGeometry(0.13, 0.02, 5, 14), GOLD, { y: 0.06, z: 0.04, rx: Math.PI / 2 - 0.3 })); // a gold belt
  P.push(part(SPHERE(0.12), skin, { y: 0.17, z: 0.14, sx: 1.05, sy: 1.2 }));             // body
  P.push(part(SPHERE(0.1), top, { y: 0.22, z: 0.2, sx: 1.15, sy: 0.55, sz: 0.85 }));      // a shell top
  P.push(part(SPHERE(0.1), skin, { y: 0.4, z: 0.3 }));                                  // head
  P.push(part(SPHERE(0.115), hair, { y: 0.43, z: 0.26, sz: 1.05 }));                    // hair, swept back
  P.push(part(SPHERE(0.1), hair, { y: 0.32, z: 0.1, sx: 1.1, sy: 1.4, sz: 0.9 }));
  P.push(part(SPHERE(0.08), hair, { y: 0.2, z: -0.02, sx: 1.2, sy: 1.2, sz: 0.8 }));
  for (const s of [-1, 1]) {
    P.push(part(SPHERE(0.017), EYE, { x: s * 0.04, y: 0.42, z: 0.39 }));
    P.push(part(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 6), skin, { x: s * 0.13, y: 0.2, z: 0.02, rx: 0.9, rz: s * 0.2 })); // arms swept back
  }
  P.push(part(new THREE.TorusGeometry(0.06, 0.015, 4, 10), GOLD, { y: 0.52, z: 0.28, rx: Math.PI / 2 + 0.3 })); // a little crown
  return P;
}

const BUILD = {
  whiteEagle: () => figurehead(false),
  gildedEagle: () => figurehead(true),
  royalEagle: () => figurehead(true, true),
  dolphin: () => decoMesh(dolphin(), true),
  owl: () => decoMesh(owl(), true),
  seaSerpent: () => decoMesh(seaSerpent(), true),
  mermaid: () => decoMesh(mermaid(), true),
};

/** A figurehead by id, at the mount's origin, or null for one there isn't. */
export function buildFigure(id) { return BUILD[id]?.() || null; }

/** A hull's figurehead mount (HULL_STYLE.figure): the stem's place and scale, with the tier's own carving on it. */
export function figureMount(figure) {
  const mount = new THREE.Group();
  mount.position.set(0, figure.at.y, figure.at.z);
  mount.rotation.x = figure.at.tilt;
  mount.scale.setScalar(figure.scale);
  const base = buildFigure(figure.base);
  mount.add(base);
  return { mount, base };
}
