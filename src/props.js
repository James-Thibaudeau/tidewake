// Low-poly prop library. Each prop is one merged, vertex-coloured geometry so
// it can be drawn with a single shared toon material (and instanced).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient, outlineMaterial } from './toon.js';
import { hash2 } from './util.js';

export const propMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
export const propOutline = outlineMaterial(0.07);
export const thinOutline = outlineMaterial(0.035);

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

export function part(geo, color, t = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
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

export function merge(parts) {
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

// Deterministic jitter so shared corners move together (keeps meshes closed).
function jitter(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const hx = Math.round(x * 100), hy = Math.round(y * 100), hz = Math.round(z * 100);
    const r1 = hash2(hx + hz * 7, hy, seed) - 0.5;
    const r2 = hash2(hy + hx * 3, hz, seed + 1) - 0.5;
    const r3 = hash2(hz + hy * 5, hx, seed + 2) - 0.5;
    p.setXYZ(i, x + r1 * amt, y + r2 * amt, z + r3 * amt);
  }
  geo.computeVertexNormals();
  return geo;
}

function palm() {
  const trunk = new THREE.CylinderGeometry(0.2, 0.36, 6.5, 6, 6);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const t = (tp.getY(i) + 3.25) / 6.5;
    tp.setX(i, tp.getX(i) + t * t * 1.4);
  }
  trunk.computeVertexNormals();
  const parts = [part(trunk, '#9b7650', { y: 3.25 })];
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.ConeGeometry(0.55, 3.8, 4);
    leaf.translate(0, 1.9, 0);
    leaf.scale(1, 1, 0.3);
    leaf.rotateZ(-(Math.PI / 2 + 0.38 + (i % 2) * 0.15));
    leaf.rotateY((i / 7) * Math.PI * 2 + 0.3);
    parts.push(part(leaf, i % 2 ? '#3d9e44' : '#4fbf4e', { x: 1.4, y: 6.4 }));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(part(new THREE.IcosahedronGeometry(0.26, 0), '#6b4a2a', { x: 1.4 + Math.cos(a) * 0.35, y: 6.1, z: Math.sin(a) * 0.35 }));
  }
  return merge(parts);
}

function roundTree() {
  return merge([
    part(new THREE.CylinderGeometry(0.25, 0.38, 2.8, 6), '#7a5a3a', { y: 1.4 }),
    part(new THREE.IcosahedronGeometry(1.9, 1), '#5cbf4a', { y: 3.7, sy: 0.85 }),
    part(new THREE.IcosahedronGeometry(1.25, 1), '#4aa83e', { x: 1.0, y: 3.1, z: 0.6 }),
  ]);
}

function pine(snow = false) {
  const g = snow ? '#3f7d5a' : '#2f8a4c';
  const parts = [part(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), '#6e4f33', { y: 0.8 })];
  const tiers = [[1.7, 2.4, 2.3], [1.3, 2.1, 3.6], [0.9, 1.9, 4.8]];
  for (const [r, h, y] of tiers) {
    parts.push(part(new THREE.ConeGeometry(r, h, 7), g, { y }));
    if (snow) parts.push(part(new THREE.ConeGeometry(r * 0.55, h * 0.42, 7), '#f4f8ff', { y: y + h * 0.31 }));
  }
  return merge(parts);
}

function deadTree() {
  return merge([
    part(new THREE.CylinderGeometry(0.12, 0.26, 3.6, 5), '#7d6a5a', { y: 1.8 }),
    part(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 4), '#7d6a5a', { x: 0.5, y: 2.6, rz: -0.8 }),
    part(new THREE.CylinderGeometry(0.05, 0.09, 1.3, 4), '#7d6a5a', { x: -0.4, y: 2.1, rz: 0.9 }),
  ]);
}

function bush() {
  return merge([
    part(new THREE.IcosahedronGeometry(1, 0), '#4caf50', { y: 0.35, sx: 1.2, sy: 0.75, sz: 1.2 }),
    part(new THREE.IcosahedronGeometry(0.7, 0), '#5fc15a', { x: 0.7, y: 0.3, z: 0.3 }),
  ]);
}

function flower() {
  const parts = [];
  const cols = ['#ff6f91', '#ffd54a', '#ffffff', '#b388ff'];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    parts.push(part(new THREE.IcosahedronGeometry(0.22, 0), cols[i % 4], { x: Math.cos(a) * 0.6, y: 0.25, z: Math.sin(a) * 0.6 }));
  }
  parts.push(part(new THREE.IcosahedronGeometry(0.5, 0), '#4caf50', { y: 0.1, sy: 0.5 }));
  return merge(parts);
}

function rock(color = '#8f8a84', seed = 3) {
  const g = jitter(new THREE.DodecahedronGeometry(1, 0), 0.45, seed);
  return merge([part(g, color, { y: 0.25 })]);
}

function seaStack() {
  const body = jitter(new THREE.CylinderGeometry(0.7, 1.0, 1, 7, 3).toNonIndexed(), 0.12, 9);
  const top = jitter(new THREE.CylinderGeometry(0.78, 0.7, 0.07, 7, 1).toNonIndexed(), 0.04, 4);
  return merge([part(body, '#8a8178', { y: 0.5 }), part(top, '#6fae55', { y: 1.0 })]);
}

function hut() {
  return merge([
    part(new THREE.BoxGeometry(3, 2.2, 3), '#ead7b0', { y: 1.1 }),
    part(new THREE.ConeGeometry(2.7, 1.9, 4), '#c2573f', { y: 3.15, ry: Math.PI / 4 }),
    part(new THREE.BoxGeometry(0.8, 1.3, 0.1), '#5a3b25', { y: 0.65, z: 1.52 }),
    part(new THREE.BoxGeometry(0.6, 0.6, 0.1), '#7fc8ff', { x: 0.9, y: 1.4, z: 1.52 }),
    part(new THREE.BoxGeometry(3.2, 0.25, 3.2), '#9b7650', { y: 0.12 }),
  ]);
}

function lighthouse() {
  return merge([
    part(new THREE.CylinderGeometry(2.3, 2.7, 2, 10), '#cfc6b4', { y: 1 }),
    part(new THREE.CylinderGeometry(1.5, 2.0, 3, 10), '#f4efe6', { y: 3.5 }),
    part(new THREE.CylinderGeometry(1.25, 1.5, 3, 10), '#d64a3a', { y: 6.5 }),
    part(new THREE.CylinderGeometry(1.05, 1.25, 3, 10), '#f4efe6', { y: 9.5 }),
    part(new THREE.CylinderGeometry(1.75, 1.75, 0.3, 10), '#3b3b4a', { y: 11.15 }),
    part(new THREE.CylinderGeometry(0.95, 0.95, 1.5, 8), '#ffe9a8', { y: 12.05 }),
    part(new THREE.ConeGeometry(1.25, 1.3, 10), '#d64a3a', { y: 13.45 }),
  ]);
}

function pillar() {
  return merge([
    part(new THREE.CylinderGeometry(0.8, 0.9, 7, 8), '#ddd3bc', { y: 3.5 }),
    part(new THREE.BoxGeometry(2.1, 0.5, 2.1), '#cfc4aa', { y: 7.2 }),
    part(new THREE.BoxGeometry(2.1, 0.5, 2.1), '#cfc4aa', { y: 0.25 }),
  ]);
}

function barrel() {
  return merge([
    part(new THREE.CylinderGeometry(0.62, 0.62, 1.4, 10), '#a0703c'),
    part(new THREE.CylinderGeometry(0.66, 0.66, 0.14, 10), '#4b3a2a', { y: 0.45 }),
    part(new THREE.CylinderGeometry(0.66, 0.66, 0.14, 10), '#4b3a2a', { y: -0.45 }),
  ]);
}

function crate() {
  return merge([
    part(new THREE.BoxGeometry(1.4, 1.4, 1.4), '#c29358'),
    part(new THREE.BoxGeometry(1.46, 0.2, 1.46), '#7a5a3a', { y: 0.55 }),
    part(new THREE.BoxGeometry(1.46, 0.2, 1.46), '#7a5a3a', { y: -0.55 }),
  ]);
}

function chest() {
  return merge([
    part(new THREE.BoxGeometry(1.7, 0.9, 1.1), '#8b5a2b', { y: 0.45 }),
    part(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 8, 1, false, 0, Math.PI), '#9b6a33', { y: 0.9, rz: Math.PI / 2 }),
    part(new THREE.BoxGeometry(0.18, 1.0, 1.16), '#ffd54a', { x: -0.55, y: 0.5 }),
    part(new THREE.BoxGeometry(0.18, 1.0, 1.16), '#ffd54a', { x: 0.55, y: 0.5 }),
    part(new THREE.BoxGeometry(0.3, 0.35, 0.1), '#ffd54a', { y: 0.8, z: 0.58 }),
  ]);
}

function bigTree() {
  return merge([
    part(new THREE.CylinderGeometry(0.5, 1.0, 5, 8), '#6e4f33', { y: 2.5 }),
    part(new THREE.CylinderGeometry(0.18, 0.35, 3, 5), '#6e4f33', { x: 1.0, y: 4.6, rz: -0.7 }),
    part(new THREE.CylinderGeometry(0.18, 0.35, 3, 5), '#6e4f33', { x: -0.9, y: 4.4, rz: 0.8 }),
    part(new THREE.IcosahedronGeometry(2.6, 1), '#4fb44a', { y: 6.8 }),
    part(new THREE.IcosahedronGeometry(1.9, 1), '#5fca55', { x: 2.2, y: 6.0, z: 0.5 }),
    part(new THREE.IcosahedronGeometry(1.9, 1), '#3f9a3e', { x: -2.0, y: 6.2, z: -0.6 }),
    part(new THREE.IcosahedronGeometry(1.7, 1), '#58c04f', { x: 0.3, y: 8.4, z: 1.0 }),
  ]);
}

function arch() {
  const parts = [];
  const segs = 9;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI;
    const g = jitter(new THREE.DodecahedronGeometry(1, 0), 0.35, i + 20);
    parts.push(part(g, i % 2 ? '#9a8f86' : '#8a8178', { x: Math.cos(a) * 6, y: Math.sin(a) * 7, s: 2.1 }));
  }
  return merge(parts);
}

export const PROPS = {};
export function initProps() {
  if (PROPS.palm) return PROPS;
  Object.assign(PROPS, {
    palm: palm(), roundTree: roundTree(), pine: pine(false), snowPine: pine(true),
    deadTree: deadTree(), bush: bush(), flower: flower(), rock: rock(), darkRock: rock('#4d4440', 7),
    snowRock: rock('#c9d3dc', 11), seaStack: seaStack(), hut: hut(), lighthouse: lighthouse(),
    pillar: pillar(), barrel: barrel(), crate: crate(), chest: chest(), bigTree: bigTree(), arch: arch(),
  });
  return PROPS;
}

export function propMesh(name, outline = true) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(PROPS[name], propMaterial);
  g.add(m);
  if (outline) g.add(new THREE.Mesh(PROPS[name], thinOutline));
  return g;
}
