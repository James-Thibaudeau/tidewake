// Low-poly prop library. Each prop is one merged, vertex-coloured geometry so
// it can be drawn with a single shared toon material (and instanced).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient, toonMaterial, outlineMaterial } from './toon.js';
import { hash2 } from './util.js';

export const propMaterial = toonMaterial({ vertexColors: true, gradientMap: toonGradient() });
export const propOutline = outlineMaterial(0.07);
export const thinOutline = outlineMaterial(0.035);

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

export function part(geo, color, t = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  let localY = null, minY = 0, maxY = 0;
  if (t.c2) {
    const pp = g.attributes.position;
    localY = new Float32Array(pp.count);
    minY = Infinity; maxY = -Infinity;
    for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); localY[i] = y; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
  _q.setFromEuler(_e);
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  if (t.c2) {
    // Two-tone toon gradient: c2 on the underside, colour on top (by local height).
    const c2 = new THREE.Color(t.c2);
    const lo = t.split ?? 0.42, w = t.soft ?? 0.08;
    for (let i = 0; i < n; i++) {
      const k = THREE.MathUtils.smoothstep((localY[i] - minY) / Math.max(1e-6, maxY - minY), lo - w, lo + w);
      col[i * 3] = c2.r + (c.r - c2.r) * k; col[i * 3 + 1] = c2.g + (c.g - c2.g) * k; col[i * 3 + 2] = c2.b + (c.b - c2.b) * k;
    }
  } else {
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  }
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

// Icosphere with smooth (spherical) normals: reads as a soft round clump.
function blob(r, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}

// Star-shaped cone: alternate base vertices pulled in for a scalloped skirt.
function skirtCone(r, h, segs = 10) {
  const g = new THREE.ConeGeometry(r, h, segs, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    if (y > h / 2 - 1e-4 || (Math.abs(x) < 1e-5 && Math.abs(z) < 1e-5)) continue;
    const a = Math.atan2(z, x);
    const k = Math.round(a / (Math.PI * 2 / segs));
    const f = ((k % 2) + 2) % 2 ? 0.72 : 1.0;
    p.setX(i, x * f); p.setZ(i, z * f); p.setY(i, y + (f < 1 ? 0.18 : 0));
  }
  g.computeVertexNormals();
  return g;
}

// A drooping, serrated palm frond (double-sided, vertex-coloured base→tip).
function frond(len, droop, lift) {
  const segs = 8;
  const pos = [], col = [];
  const cb = new THREE.Color('#2c8a3c'), ct = new THREE.Color('#72d35c'), tmp = new THREE.Color();
  const spine = (u) => [u * len, Math.sin(u * Math.PI * 0.8) * lift - u * u * droop, 0];
  const width = (u) => 0.85 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.04)), 0.7);
  const push = (pts, u) => {
    tmp.copy(cb).lerp(ct, u > 0.45 ? 1 : 0.25);
    for (const q of pts) { pos.push(...q); col.push(tmp.r, tmp.g, tmp.b); }
  };
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs, u1 = (i + 1) / segs, um = Math.min(1, u1 + 0.06);
    const s0 = spine(u0), s1 = spine(u1), sm = spine(um);
    for (const side of [1, -1]) {
      const w = width((u0 + u1) / 2) * (i % 2 ? 1 : 0.85);
      const L = [sm[0], sm[1] - 0.25 * w, side * w];
      const tri = side > 0 ? [s0, s1, L] : [s0, L, s1];
      push(tri, u1);
      push([tri[0], tri[2], tri[1]], u1); // back face
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function placed(geo, t) {
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
  _q.setFromEuler(_e);
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _s.set(t.s ?? 1, t.s ?? 1, t.s ?? 1);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

function palm() {
  const parts = [];
  // ringed, curving trunk built from short frustums
  const segs = 8, H = 6.6;
  let px = 0, py = 0;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const x0 = t0 * t0 * 1.5, x1 = t1 * t1 * 1.5;
    const dy = H / segs, dx = x1 - x0;
    const len = Math.hypot(dx, dy);
    const r0 = 0.38 - t0 * 0.17, r1 = 0.38 - t1 * 0.17;
    const g = new THREE.CylinderGeometry(r1 * 0.92, r0 * 1.06, len * 1.02, 7);
    parts.push(part(g, i % 2 ? '#9b7650' : '#87653f', { x: (x0 + x1) / 2, y: py + dy / 2, rz: -Math.atan2(dx, dy) }));
    px = x1; py += dy;
  }
  const top = { x: px, y: py };
  // fronds
  for (let i = 0; i < 9; i++) {
    const g = frond(3.4 + (i % 3) * 0.35, 2.2 + (i % 2) * 0.6, 0.9);
    placed(g, { x: top.x, y: top.y - 0.1, ry: (i / 9) * Math.PI * 2 + (i % 2) * 0.2, rz: (i % 3 - 1) * 0.12 });
    parts.push(g);
  }
  // a couple of upright young fronds
  for (let i = 0; i < 3; i++) {
    const g = frond(2.0, 0.4, 1.3);
    placed(g, { x: top.x, y: top.y, ry: i * 2.1 + 0.5, rz: 0.7 });
    parts.push(g);
  }
  parts.push(part(blob(0.32, 0), '#5a3f26', { x: top.x, y: top.y - 0.05, sy: 0.7 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(part(blob(0.24, 0), i % 2 ? '#6b4a2a' : '#7d5a32', { x: top.x + Math.cos(a) * 0.32, y: top.y - 0.35, z: Math.sin(a) * 0.32 }));
  }
  return merge(parts);
}

function trunkWithBranches(h, r, color) {
  return [
    part(new THREE.CylinderGeometry(r * 0.7, r, h, 7), color, { y: h / 2 }),
    part(new THREE.CylinderGeometry(0.08, 0.14, 1.4, 5), color, { x: 0.45, y: h * 0.8, rz: -0.9 }),
    part(new THREE.CylinderGeometry(0.07, 0.12, 1.2, 5), color, { x: -0.4, y: h * 0.72, z: 0.2, rz: 0.95 }),
  ];
}

function canopy(parts, cx, cy, cz, scale, dark, mid, light, seed = 0) {
  const clumps = [
    [0, 0.2, 0, 1.7, 1], [1.15, -0.25, 0.45, 1.15, 1], [-1.05, -0.2, -0.35, 1.2, 1],
    [0.2, -0.35, 1.1, 1.05, 0], [-0.35, -0.3, -1.1, 1.0, 0], [0.35, 1.05, -0.15, 1.05, 1],
  ];
  clumps.forEach(([x, y, z, r, d], i) => {
    const top = y > 0.5;
    parts.push(part(blob(r * scale, d), top ? light : mid, {
      x: cx + x * scale, y: cy + y * scale, z: cz + z * scale, sy: 0.88, c2: dark, split: top ? 0.3 : 0.45,
    }));
  });
}

function roundTree() {
  const parts = trunkWithBranches(2.9, 0.38, '#7a5a3a');
  canopy(parts, 0, 3.9, 0, 1.0, '#3a8f38', '#55b546', '#7fd35f');
  return merge(parts);
}

function fruitTree() {
  const parts = trunkWithBranches(2.5, 0.32, '#80603d');
  canopy(parts, 0, 3.4, 0, 0.85, '#3f9a3a', '#5fbf4a', '#86d865');
  const fr = [[0.9, 3.0, 0.9], [-0.8, 3.3, 0.7], [0.3, 2.9, -1.0], [-1.0, 3.6, -0.5], [1.2, 3.7, -0.2], [0.1, 4.5, 0.9], [-0.4, 2.8, 1.1]];
  fr.forEach(([x, y, z], i) => parts.push(part(blob(0.2, 0), i % 3 ? '#e8473a' : '#ff9a2e', { x, y, z })));
  return merge(parts);
}

function birch() {
  const parts = [part(new THREE.CylinderGeometry(0.16, 0.24, 4.6, 7), '#efeae0', { y: 2.3 })];
  for (const [y, w] of [[0.8, 0.5], [1.7, 0.35], [2.6, 0.45], [3.4, 0.3]]) {
    parts.push(part(new THREE.CylinderGeometry(0.235 - y * 0.015, 0.24 - y * 0.015, 0.09, 7, 1, true, w * 6, 2.2), '#3b3633', { y }));
  }
  parts.push(part(blob(1.1, 1), '#a3d860', { y: 4.4, sy: 1.35, c2: '#6fb54a', split: 0.4 }));
  parts.push(part(blob(0.8, 0), '#b4e070', { x: 0.6, y: 5.3, z: 0.2, sy: 1.3, c2: '#79bd50' }));
  parts.push(part(blob(0.75, 0), '#94cf58', { x: -0.55, y: 3.8, z: -0.3, sy: 1.3, c2: '#64a843' }));
  return merge(parts);
}

function pine(snow = false) {
  const g = snow ? '#3f7d5a' : '#2f8a4c';
  const d = snow ? '#2b5c44' : '#1f6a3a';
  const parts = [part(new THREE.CylinderGeometry(0.18, 0.3, 1.8, 6), '#6e4f33', { y: 0.9 })];
  const tiers = [[1.9, 2.0, 2.0], [1.55, 1.9, 3.0], [1.2, 1.8, 3.95], [0.8, 1.6, 4.85]];
  tiers.forEach(([r, h, y], i) => {
    parts.push(part(skirtCone(r, h, 10), g, { y, ry: i * 0.3, c2: d, split: 0.3 }));
    if (snow) parts.push(part(skirtCone(r * 0.62, h * 0.45, 10), '#f4f8ff', { y: y + h * 0.3, ry: i * 0.3 + 0.3 }));
  });
  return merge(parts);
}

function deadTree() {
  return merge([
    part(new THREE.CylinderGeometry(0.12, 0.26, 3.6, 5), '#7d6a5a', { y: 1.8 }),
    part(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 4), '#7d6a5a', { x: 0.5, y: 2.6, rz: -0.8 }),
    part(new THREE.CylinderGeometry(0.05, 0.09, 1.3, 4), '#7d6a5a', { x: -0.4, y: 2.1, rz: 0.9 }),
    part(new THREE.CylinderGeometry(0.04, 0.06, 0.8, 4), '#6d5b4c', { x: 0.1, y: 3.5, z: 0.25, rx: 0.6 }),
  ]);
}

function bush() {
  return merge([
    part(blob(1, 1), '#5cbf50', { y: 0.45, sx: 1.2, sy: 0.75, sz: 1.2, c2: '#3d9440' }),
    part(blob(0.72, 0), '#6fcd5a', { x: 0.75, y: 0.4, z: 0.3, c2: '#45a044' }),
    part(blob(0.6, 0), '#4fae48', { x: -0.6, y: 0.35, z: -0.45, c2: '#3a8a3a' }),
  ]);
}

function berryBush() {
  const parts = [
    part(blob(0.95, 1), '#4fae4a', { y: 0.45, sx: 1.15, sy: 0.8, sz: 1.15, c2: '#347f37' }),
    part(blob(0.65, 0), '#5fbd52', { x: 0.7, y: 0.45, z: -0.3, c2: '#3d8f3c' }),
  ];
  const b = [[0.6, 0.8, 0.5], [-0.5, 0.7, 0.6], [0.1, 1.1, -0.4], [-0.8, 0.5, -0.2], [0.9, 0.6, -0.6], [0.2, 0.9, 0.85]];
  b.forEach(([x, y, z], i) => parts.push(part(blob(0.13, 0), i % 2 ? '#d8344a' : '#7a4fd0', { x, y, z })));
  return merge(parts);
}

function grassTuft() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.4;
    const h = 0.55 + (i % 3) * 0.18;
    // white→grey so per-instance colour can match each island's grass
    parts.push(part(new THREE.ConeGeometry(0.07, h, 3), '#ffffff', {
      x: Math.cos(a) * 0.12, y: h / 2, z: Math.sin(a) * 0.12, rx: Math.sin(a) * 0.45, rz: -Math.cos(a) * 0.45, c2: '#8a8a8a', split: 0.5,
    }));
  }
  return merge(parts);
}

function pebble() {
  const g = jitter(new THREE.DodecahedronGeometry(0.35, 0), 0.12, 21);
  return merge([part(g, '#b3a996', { y: 0.05, sy: 0.55 })]);
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

// One of grandfather's old beach camps: a weathered tent, a stone cairn and a
// tall pole with his red pennant, so it can be spotted from the water.
function camp() {
  const CANVAS = '#e3d3ad', CANVAS2 = '#cdb98c', POLE = '#5b3c22', RED = '#c8322b', STONE = '#9a938a', STONE2 = '#7f786f';
  const P = [];
  // A-frame tent: a 3-sided prism lying along z
  P.push(part(new THREE.CylinderGeometry(1.6, 1.6, 3.4, 3, 1), CANVAS, { rx: -Math.PI / 2, y: 0.8 })); // ridge up: the corner at +z turns to +y
  P.push(part(new THREE.BoxGeometry(0.9, 1.2, 0.05), '#4a3423', { y: 0.6, z: 1.72 }));        // dark doorway
  P.push(part(new THREE.BoxGeometry(0.1, 2.3, 0.1), POLE, { y: 1.15, z: 1.75 }));
  P.push(part(new THREE.BoxGeometry(0.1, 2.3, 0.1), POLE, { y: 1.15, z: -1.75 }));
  P.push(part(new THREE.BoxGeometry(2.6, 0.06, 0.9), CANVAS2, { x: 0.2, y: 0.03, z: 2.6, ry: 0.2 })); // flap on the sand
  // cairn of stacked stones
  const cairn = [[0.9, 0.45], [0.75, 0.42], [0.6, 0.38], [0.45, 0.32], [0.3, 0.26]];
  let y = 0;
  cairn.forEach(([r, h], i) => {
    P.push(part(new THREE.DodecahedronGeometry(r, 0), i % 2 ? STONE2 : STONE, { x: 3.2, y: y + h * 0.5, z: 0.6, sy: h / r, ry: i * 0.7 }));
    y += h * 0.85;
  });
  // flag pole with the red pennant (tall enough to see from the sea)
  P.push(part(new THREE.CylinderGeometry(0.09, 0.12, 7.5, 6), POLE, { x: -2.6, y: 3.75, z: -0.6 }));
  P.push(part(new THREE.BoxGeometry(0.05, 1.1, 2.0), RED, { x: -2.6, y: 6.8, z: 0.45 }));
  P.push(part(new THREE.SphereGeometry(0.16, 6, 4), '#d9b44a', { x: -2.6, y: 7.55, z: -0.6 }));
  // a crate and a cold campfire ring
  P.push(part(new THREE.BoxGeometry(0.9, 0.9, 0.9), '#a07040', { x: 1.9, y: 0.45, z: -2.3, ry: 0.5 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P.push(part(new THREE.DodecahedronGeometry(0.22, 0), STONE2, { x: -0.4 + Math.cos(a) * 0.65, y: 0.12, z: 3.9 + Math.sin(a) * 0.65 }));
  }
  P.push(part(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 5), '#3b2614', { x: -0.4, y: 0.12, z: 3.9, rz: Math.PI / 2, ry: 0.6 }));
  return merge(P);
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
    deadTree: deadTree(), bush: bush(), flower: flower(), birch: birch(), fruitTree: fruitTree(),
    berryBush: berryBush(), grassTuft: grassTuft(), pebble: pebble(), rock: rock(), darkRock: rock('#4d4440', 7),
    snowRock: rock('#c9d3dc', 11), seaStack: seaStack(), hut: hut(), lighthouse: lighthouse(),
    pillar: pillar(), barrel: barrel(), crate: crate(), chest: chest(), bigTree: bigTree(), arch: arch(),
    camp: camp(),
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
