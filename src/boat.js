// The player's sailboat: model (with tiered visual upgrades), sailing physics,
// collisions, wake particles, and the explorer at the helm.
import * as THREE from 'three';
import { toon, toonGradient, outlineMaterial } from './toon.js';
import { waveHeight } from './waves.js';
import { clamp, damp, smoothstep, wrapAngle, lerp, TAU } from './util.js';
import { WORLD_HALF } from './config.js';
import { Explorer, part, mergeParts } from './explorer.js';

const SAIL_U = 12, SAIL_V = 10;
const BOOM_Y = 1.55, BOOM_LEN = 3.1, MAST_Z = 0.9, MAST_BASE = 0.7;
const SAIL_H = [6.2, 6.2, 6.9, 7.3];
const MAST_TOP = [8.4, 8.4, 9.5, 9.9];

// Efficiency by angle between bow and where the wind comes from (0 = into wind).
export function pointOfSail(a) {
  a = Math.abs(a);
  if (a < 0.6) return 0.05 + (a / 0.6) * 0.1;
  if (a < 1.0) return lerp(0.15, 0.78, (a - 0.6) / 0.4);
  if (a < 1.75) return lerp(0.78, 1.0, (a - 1.0) / 0.75);
  return lerp(1.0, 0.72, (a - 1.75) / (Math.PI - 1.75));
}

export function pointOfSailName(a) {
  a = Math.abs(a);
  if (a < 0.6) return 'In irons';
  if (a < 1.1) return 'Close hauled';
  if (a < 1.9) return 'Beam reach';
  if (a < 2.7) return 'Broad reach';
  return 'Running';
}

const HULL_STYLE = [
  { hull: '#8f5e2e', trim: '#cdb892', deck: '#c89b62' },
  { hull: '#7a4a22', trim: '#f2ead6', deck: '#d0a46a' },
  { hull: '#b8432f', trim: '#f5efe0', deck: '#d8ae74' },
  { hull: '#2e1f1a', trim: '#ffcf4a', deck: '#b88a55' },
];
const GOLD = '#ffcf4a', BRASS = '#d9a441', COPPER = '#c8743a';

// ------------------------------------------------------------- hull outline
function hullShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.15, -3.2); s.lineTo(1.15, -3.2);
  s.quadraticCurveTo(1.75, 0.6, 0, 3.8);
  s.quadraticCurveTo(-1.75, 0.6, -1.15, -3.2);
  return s;
}
const SIDE = [];
for (let i = 0; i <= 64; i++) {
  const s = i / 64, a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
  SIDE.push([a * 1.15 + b * 1.75, a * -3.2 + b * 0.6 + c * 3.8]);
}
function halfW(z) {
  if (z <= SIDE[0][1]) return SIDE[0][0];
  for (let i = 1; i < SIDE.length; i++) {
    if (SIDE[i][1] >= z) {
      const [x0, z0] = SIDE[i - 1], [x1, z1] = SIDE[i];
      return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0 || 1);
    }
  }
  return 0;
}
const taper = (y) => 1 - smoothstep(0.7, -0.6, y) * 0.4;
// A point on the outside of the hull wall plus the yaw that faces outward.
function sideAt(z, y, side, off) {
  const x = side * ((halfW(z) + 0.18) * taper(y) + off);
  const k = (halfW(z + 0.05) - halfW(z - 0.05)) / 0.1;
  const nx = side, nz = -k;
  return { x, y, z, yaw: Math.atan2(nx, nz) };
}
// offset a local (lx, ly, lz) by a side frame
function onSide(S, lx, ly, lz) {
  const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
  return { x: S.x + lx * c + lz * s, y: S.y + ly, z: S.z - lx * s + lz * c };
}

// A vertical ribbon hugging the hull wall between y0 and y1.
function bandGeo(y0, y1, off, uRepeat = 1) {
  const raw = hullShape().getPoints(24);
  const pts = [];
  for (const p of raw) if (!pts.length || pts[pts.length - 1].distanceTo(p) > 1e-4) pts.push(p);
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop();
  const n = pts.length;
  let total = 0; const acc = [0];
  for (let i = 1; i <= n; i++) { total += pts[i % n].distanceTo(pts[i - 1]); acc.push(total); }
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nx = (b.y - a.y), nz = -(b.x - a.x);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    for (const y of [y0, y1]) {
      const t = taper(y);
      pos.push((p.x + nx * (0.18 + off)) * t, y, p.y + nz * (0.18 + off));
      uv.push((acc[i] / total) * uRepeat, y === y0 ? 0 : 1);
    }
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let haloTex = null;
function softHalo() {
  if (haloTex) return haloTex;
  haloTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  return haloTex;
}

function deckTexture() {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const v = 0.86 + ((i * 37) % 11) / 80;
      g.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(250 * v)},${Math.round(240 * v)})`;
      g.fillRect(i * 16, 0, 16, h);
      g.fillStyle = 'rgba(70,45,20,0.55)';
      g.fillRect(i * 16, 0, 2, h);
      const j = ((i * 53) % 7) * 18;
      g.fillRect(i * 16, j, 16, 2);
      g.fillStyle = 'rgba(70,45,20,0.6)';
      g.fillRect(i * 16 + 4, j + 5, 2, 2); g.fillRect(i * 16 + 10, j + 5, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.1, 0.16);
  return t;
}

const sailTexCache = {};
function sailTexture(tier) {
  if (sailTexCache[tier]) return sailTexCache[tier];
  const H = SAIL_H[tier];
  const tex = canvasTex(256, 256, (g, S) => {
    g.fillStyle = ['#e3d4b1', '#fbf8ef', '#fbf9f2', '#fff1cc'][tier];
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(120,100,60,${Math.random() * (tier === 0 ? 0.08 : 0.04)})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    // panel seams
    g.strokeStyle = tier === 0 ? 'rgba(120,95,55,0.55)' : 'rgba(150,140,110,0.4)';
    g.lineWidth = 2;
    for (let y = 30; y < S; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    if (tier === 0) {
      for (const [x, y, w, h, c] of [[36, 150, 62, 46, '#c8b083'], [150, 58, 52, 40, '#d8c497'], [118, 196, 46, 34, '#b99d6c'], [60, 70, 30, 26, '#cfb98d']]) {
        g.fillStyle = c; g.fillRect(x, y, w, h);
        g.setLineDash([5, 4]); g.strokeStyle = '#7d6440'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
        g.setLineDash([]);
      }
    }
    if (tier >= 1) {
      // reinforced corners
      g.fillStyle = tier === 3 ? '#f3d58a' : 'rgba(200,190,160,0.6)';
      g.beginPath(); g.moveTo(0, S); g.lineTo(46, S); g.lineTo(0, S - 46); g.fill();
      g.beginPath(); g.moveTo(S, S); g.lineTo(S - 40, S); g.lineTo(S, S - 40); g.fill();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(40, 0); g.lineTo(0, 40); g.fill();
    }
    if (tier === 2) {
      g.fillStyle = '#2f6fd0'; g.fillRect(0, 150, S, 22); g.fillRect(0, 184, S, 10);
      g.fillStyle = '#d4402e'; g.fillRect(0, 175, S, 5);
    }
    if (tier === 3) {
      // compass-rose emblem, pre-squashed so it reads round on the tapered sail
      const u = 0.36, v = 0.52;
      const cx = u * S, cy = (1 - v) * S;
      const R = 1.05;
      const rx = R / (BOOM_LEN / S), ry = R / ((H * (1 - 0.55 * u)) / S);
      g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
      g.fillStyle = 'rgba(212,64,46,0.18)';
      g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#d4402e'; g.lineWidth = 9;
      g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = GOLD; g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, rx - 10, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, L = k % 2 ? rx * 0.55 : rx * 0.92, w2 = rx * 0.14;
        g.fillStyle = k % 2 ? '#d4402e' : GOLD;
        g.beginPath();
        g.moveTo(Math.cos(a) * L, Math.sin(a) * L);
        g.lineTo(Math.cos(a + Math.PI / 2) * w2, Math.sin(a + Math.PI / 2) * w2);
        g.lineTo(Math.cos(a - Math.PI / 2) * w2, Math.sin(a - Math.PI / 2) * w2);
        g.fill();
      }
      g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(0, 0, rx * 0.1, 0, Math.PI * 2); g.fill();
      g.restore();
      // gold wave trim along the foot
      g.strokeStyle = GOLD; g.lineWidth = 5;
      g.beginPath();
      for (let x = 0; x <= S; x += 4) g.lineTo(x, S - 14 + Math.sin(x * 0.12) * 5);
      g.stroke();
    }
    // edge tape
    g.strokeStyle = tier === 3 ? GOLD : tier === 0 ? 'rgba(120,95,55,0.8)' : 'rgba(170,155,120,0.8)';
    g.lineWidth = tier === 3 ? 10 : 6;
    g.strokeRect(0, 0, S, S);
  });
  sailTexCache[tier] = tex;
  return tex;
}

function runeTexture() {
  const t = canvasTex(256, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(140,250,255,1)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 4); g.lineTo(w, 4); g.moveTo(0, h - 4); g.lineTo(w, h - 4); g.stroke();
    g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const x = 16 + i * 32;
      g.beginPath();
      const k = i % 4;
      if (k === 0) { g.moveTo(x - 6, 24); g.lineTo(x, 8); g.lineTo(x + 6, 24); g.moveTo(x - 3, 17); g.lineTo(x + 3, 17); }
      if (k === 1) { g.moveTo(x, 8); g.lineTo(x, 24); g.moveTo(x, 12); g.lineTo(x + 7, 8); g.moveTo(x, 18); g.lineTo(x + 7, 14); }
      if (k === 2) { g.arc(x, 16, 7, 0, Math.PI * 2); g.moveTo(x, 9); g.lineTo(x, 23); }
      if (k === 3) { g.moveTo(x - 7, 8); g.lineTo(x + 7, 24); g.moveTo(x + 7, 8); g.lineTo(x - 7, 24); }
      g.stroke();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Waving flag/pennant: geometry extends along +z from its pivot.
function makeFlag(w, h, tri, color) {
  const geo = new THREE.PlaneGeometry(w, h, 10, 1);
  geo.rotateY(-Math.PI / 2);
  geo.translate(0, 0, w / 2);
  if (tri) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 - (p.getZ(i) / w) * 0.92));
  }
  const mat = toon(color, { side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, geo, mat, base: Float32Array.from(geo.attributes.position.array), w };
}

const decoMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
const thinInk = outlineMaterial(0.025, 0x1b2233);

function decoMesh(parts, outline = false) {
  const g = new THREE.Group();
  const geo = mergeParts(parts);
  g.add(new THREE.Mesh(geo, decoMat));
  if (outline) g.add(new THREE.Mesh(geo, thinInk));
  return g;
}

function figurehead(gold) {
  const body = gold ? GOLD : '#f4efe4', wing = gold ? '#f2b93a' : '#dcd3c0', beak = gold ? '#e89a2a' : '#e8a13a';
  const parts = [
    part(new THREE.SphereGeometry(0.2, 12, 8), body, { sx: 0.8, sy: 0.8, sz: 1.6 }),
    part(new THREE.SphereGeometry(0.15, 12, 8), body, { y: 0.2, z: 0.3 }),
    part(new THREE.ConeGeometry(0.06, 0.22, 6), beak, { y: 0.17, z: 0.5, rx: Math.PI / 2 }),
    part(new THREE.SphereGeometry(0.025, 6, 4), '#1a1420', { x: 0.1, y: 0.25, z: 0.38 }),
    part(new THREE.SphereGeometry(0.025, 6, 4), '#1a1420', { x: -0.1, y: 0.25, z: 0.38 }),
  ];
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.ConeGeometry(0.17, 0.9, 4), wing, { x: s * 0.2, y: 0.05, z: -0.2, rx: -Math.PI / 2 + 0.15, ry: s * 0.4, sz: 0.25 }));
  }
  const g = decoMesh(parts, true);
  g.position.set(0, 0.62, 3.98);
  g.rotation.x = -0.35;
  return g;
}

export class Boat {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.sailLevel = 0;
    this.sailVis = 0;
    this.rudder = 0;
    this.push = new THREE.Vector2();
    this.heel = 0; this.roll = 0; this.pitch = 0; this.y = 0;
    this.sink = 0;
    this.maxHealth = 100;
    this.boomAngle = 0;
    this.relWind = 0;
    this.efficiency = 0;
    this.hitCooldown = 0;
    this.lookYaw = null;   // world yaw the explorer should look toward (or null)
    this.lookPitch = 0;
    this.levels = { sail: 0, hull: 0, rudder: 0, keel: 0, lantern: 0, spyglass: 0 };
    this.sailH = SAIL_H[0];
    this._grip = new THREE.Vector3(); this._grip2 = new THREE.Vector3();
    this.build();
    this.buildWake();
  }

  build() {
    const g = this.group;
    const s = hullShape();
    // Hull: extruded top-view outline, tapered toward the keel, with plank banding
    const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.18, bevelSegments: 2, curveSegments: 12 });
    hullGeo.rotateX(Math.PI / 2);
    hullGeo.translate(0, 0.75, 0);
    const p = hullGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * taper(y));
      const band = Math.floor((y + 0.7) / 0.19);
      const v = band % 2 ? 0.88 : 1.0;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    hullGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    hullGeo.computeVertexNormals();
    this.hullMat = toon('#8f5e2e', { vertexColors: true });
    const hull = new THREE.Mesh(hullGeo, this.hullMat);
    const hullInk = new THREE.Mesh(hullGeo, new THREE.MeshBasicMaterial({ color: 0x1b2233, side: THREE.BackSide }));
    hullInk.scale.set(1.05, 1.05, 1.03);
    g.add(hull, hullInk);

    const rimGeo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 12 });
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.scale(1.07, 1, 1.04);
    rimGeo.translate(0, 0.98, 0);
    this.trimMat = toon('#cdb892');
    g.add(new THREE.Mesh(rimGeo, this.trimMat));

    const deckGeo = new THREE.ShapeGeometry(s, 12);
    deckGeo.rotateX(Math.PI / 2);
    deckGeo.rotateZ(Math.PI);
    deckGeo.scale(0.93, 1, 0.93);
    deckGeo.translate(0, 1.0, 0);
    this.deckMat = toon('#c89b62', { map: deckTexture() });
    g.add(new THREE.Mesh(deckGeo, this.deckMat));

    // Mast (unit height, scaled per rig tier) + boom + sail
    const woodMat = toon('#7a5432');
    this.woodMat = woodMat;
    const mastGeo = new THREE.CylinderGeometry(0.1, 0.14, 1, 8).translate(0, 0.5, 0);
    this.mast = new THREE.Mesh(mastGeo, woodMat);
    this.mastInk = new THREE.Mesh(mastGeo, thinInk);
    for (const m of [this.mast, this.mastInk]) m.position.set(0, MAST_BASE, MAST_Z);
    g.add(this.mast, this.mastInk);
    this.mastTop = new THREE.Vector3(0, MAST_TOP[0], MAST_Z);

    this.boom = new THREE.Group();
    this.boom.position.set(0, BOOM_Y, MAST_Z);
    g.add(this.boom);
    const boomBar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, BOOM_LEN + 0.1, 6), woodMat);
    boomBar.rotation.x = Math.PI / 2;
    boomBar.position.z = -BOOM_LEN / 2;
    this.boom.add(boomBar);

    this.sailGeo = new THREE.BufferGeometry();
    const n = (SAIL_U + 1) * (SAIL_V + 1);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= SAIL_V; j++) for (let i = 0; i <= SAIL_U; i++) {
      const k = j * (SAIL_U + 1) + i;
      uv[k * 2] = i / SAIL_U; uv[k * 2 + 1] = j / SAIL_V;
    }
    this.sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sailGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 0; j < SAIL_V; j++) for (let i = 0; i < SAIL_U; i++) {
      const a = j * (SAIL_U + 1) + i, b = a + 1, c = a + SAIL_U + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    this.sailGeo.setIndex(idx);
    this.sailMat = new THREE.MeshToonMaterial({ map: sailTexture(0), gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.sail = new THREE.Mesh(this.sailGeo, this.sailMat);
    this.sail.frustumCulled = false;
    this.boom.add(this.sail);

    // Jib (front sail) for upgraded rigs
    const jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.2, 0, 0, 5.6, -2.75, 0, 0.3, -2.3], 3));
    jg.setIndex([0, 1, 2]);
    jg.computeVertexNormals();
    this.jibMat = toon('#fbf8ef', { side: THREE.DoubleSide });
    this.jib = new THREE.Mesh(jg, this.jibMat);
    this.jibPivot = new THREE.Group();
    this.jibPivot.position.set(0, 1.0, 3.6);
    this.jibPivot.add(this.jib);
    g.add(this.jibPivot);
    // forestay line from bow to mast
    this.stay = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4).translate(0, 0.5, 0), toon('#4a3a2a'));
    g.add(this.stay);

    // Flag at the masthead + racing pennant (tier 2+), both stream downwind
    this.flags = [];
    const flag = makeFlag(1.5, 0.75, false, '#d64a3a');
    this.flag = flag.mesh; this.flagMat = flag.mat;
    g.add(flag.mesh); this.flags.push(flag);
    const pen = makeFlag(2.6, 0.42, true, '#2f6fd0');
    this.pennant = pen;
    g.add(pen.mesh); this.flags.push(pen);

    this.buildHullTiers();
    this.buildHelm();
    this.buildKeel();
    this.buildLanterns();
    this.buildNest();

    // The explorer
    this.explorer = new Explorer();
    g.add(this.explorer.root);
  }

  buildHullTiers() {
    const tiers = [];
    // tier 0: weathered planks with patch boards and nails
    {
      const parts = [];
      for (const [side, z, y, c] of [[1, -1.4, 0.32, '#a77a48'], [1, 1.25, 0.5, '#6e4522'], [-1, 0.5, 0.3, '#a1733f'], [-1, -2.1, 0.55, '#b0844f']]) {
        const S = sideAt(z, y, side, 0.02);
        parts.push(part(new THREE.BoxGeometry(0.55, 0.22, 0.04), c, { x: S.x, y, z: S.z, ry: S.yaw }));
        for (const [lx, ly] of [[-0.22, -0.07], [0.22, -0.07], [-0.22, 0.07], [0.22, 0.07]]) {
          const q = onSide(S, lx, ly, 0.025);
          parts.push(part(new THREE.BoxGeometry(0.035, 0.035, 0.02), '#3a2a1e', { x: q.x, y: q.y, z: q.z, ry: S.yaw }));
        }
      }
      tiers.push(decoMesh(parts));
    }
    // tier 1: painted stripe + rope fenders
    {
      const parts = [part(bandGeo(0.36, 0.48, 0.012), '#3f7fd0')];
      for (const side of [-1, 1]) for (const z of [-1.3, 0.5]) {
        const S = sideAt(z, 0.3, side, 0.14);
        parts.push(part(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 10), '#e9d7a8', { x: S.x, y: 0.3, z: S.z }));
        parts.push(part(new THREE.TorusGeometry(0.11, 0.02, 4, 10), '#b89a62', { x: S.x, y: 0.42, z: S.z, rx: Math.PI / 2 }));
        parts.push(part(new THREE.TorusGeometry(0.11, 0.02, 4, 10), '#b89a62', { x: S.x, y: 0.18, z: S.z, rx: Math.PI / 2 }));
        parts.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 4), '#8a6a3a', { x: S.x * 0.97, y: 0.75, z: S.z }));
      }
      tiers.push(decoMesh(parts));
    }
    // tiers 2 and 3: rub rail, portholes, figurehead (+ gold filigree and stern brackets)
    for (const gold of [false, true]) {
      const rail = gold ? GOLD : BRASS;
      const parts = [
        part(bandGeo(0.64, 0.75, 0.03), rail),
        part(bandGeo(0.36, 0.45, 0.012), gold ? '#7a1f1f' : '#f5efe0'),
      ];
      if (gold) parts.push(part(bandGeo(0.1, 0.15, 0.012), GOLD));
      for (const side of [-1, 1]) {
        for (const z of [-1.8, -0.6, 0.6]) {
          const S = sideAt(z, 0.54, side, 0.015);
          parts.push(part(new THREE.TorusGeometry(0.1, 0.028, 6, 16), rail, { x: S.x, y: 0.54, z: S.z, ry: S.yaw }));
          const q = onSide(S, 0, 0, -0.005);
          parts.push(part(new THREE.CircleGeometry(0.085, 14), '#24507f', { x: q.x, y: 0.54, z: q.z, ry: S.yaw }));
          const h = onSide(S, -0.03, 0.03, 0.002);
          parts.push(part(new THREE.CircleGeometry(0.025, 8), '#bfe6ff', { x: h.x, y: h.y, z: h.z, ry: S.yaw }));
        }
        if (gold) {
          for (const z of [-2.5, -1.2, 0.0, 1.2]) {
            const S = sideAt(z, 0.24, side, 0.02);
            parts.push(part(new THREE.TorusGeometry(0.15, 0.022, 4, 14, Math.PI * 1.4), GOLD, { x: S.x, y: 0.24, z: S.z, ry: S.yaw, rz: z * 1.7 }));
            parts.push(part(new THREE.SphereGeometry(0.04, 6, 4), GOLD, { x: S.x, y: 0.24, z: S.z }));
          }
          // ornate stern lantern brackets
          parts.push(part(new THREE.TorusGeometry(0.22, 0.035, 5, 16, Math.PI * 1.5), GOLD, { x: side * 1.15, y: 1.25, z: -3.3, ry: Math.PI / 2, rz: 0.6 }));
          parts.push(part(new THREE.SphereGeometry(0.07, 8, 6), GOLD, { x: side * 1.15, y: 1.5, z: -3.3 }));
          parts.push(part(new THREE.ConeGeometry(0.05, 0.16, 6), GOLD, { x: side * 1.15, y: 1.62, z: -3.3 }));
        }
      }
      const grp = decoMesh(parts);
      grp.add(figurehead(gold));
      tiers.push(grp);
    }
    this.hullTiers = tiers;
    for (const t of tiers) { t.visible = false; this.group.add(t); }
  }

  buildHelm() {
    const g = this.group;
    // tiller (tiers 0-1), angled up so the explorer can reach it
    this.tiller = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4).translate(0, 0, 0.7), this.woodMat);
    this.tiller.position.set(0, 1.15, -3.3);
    this.tiller.rotation.order = 'YXZ';
    this.tiller.rotation.x = -0.5;
    g.add(this.tiller);
    // visible rudder blade (tier 1+)
    this.rudderBlade = new THREE.Group();
    this.rudderBlade.position.set(0, 0.35, -3.42);
    this.rudderBlade.add(decoMesh([
      part(new THREE.BoxGeometry(0.08, 1.35, 0.55), '#6e4a2c', { y: -0.35, z: -0.26 }),
      part(new THREE.BoxGeometry(0.1, 0.2, 0.6), '#5b3a1f', { y: -0.98, z: -0.28 }),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), BRASS, { y: 0.2, z: 0.02 }),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), BRASS, { y: -0.3, z: 0.02 }),
    ], true));
    g.add(this.rudderBlade);
    // ship's wheel on a pedestal (tier 2+, gold at tier 3)
    this.helm = new THREE.Group();
    g.add(this.helm);
    this.helm.add(decoMesh([
      part(new THREE.BoxGeometry(0.24, 0.8, 0.2), '#6e4a2c', { y: 1.4, z: -2.36 }),
      part(new THREE.BoxGeometry(0.38, 0.08, 0.32), '#5b3a1f', { y: 1.04, z: -2.36 }),
      part(new THREE.BoxGeometry(0.28, 0.06, 0.24), '#5b3a1f', { y: 1.8, z: -2.36 }),
    ], true));
    this.wheels = [];
    for (const gold of [false, true]) {
      const metal = gold ? GOLD : BRASS, wood = gold ? '#4a2a1c' : '#8b5a2b';
      const parts = [
        part(new THREE.TorusGeometry(0.42, 0.04, 6, 26), wood),
        part(new THREE.TorusGeometry(0.42, 0.012, 4, 26), metal, { z: 0.045 }),
        part(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 10), metal, { rx: Math.PI / 2 }),
      ];
      for (let k = 0; k < 4; k++) parts.push(part(new THREE.CylinderGeometry(0.022, 0.022, 1.06, 5), wood, { rz: (k / 4) * Math.PI }));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        parts.push(part(new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6), wood, { x: Math.sin(a) * 0.58, y: Math.cos(a) * 0.58, rz: -a }));
        if (gold) parts.push(part(new THREE.SphereGeometry(0.045, 6, 4), GOLD, { x: Math.sin(a) * 0.66, y: Math.cos(a) * 0.66 }));
      }
      const w = decoMesh(parts, true);
      w.position.set(0, 1.8, -2.48);
      this.helm.add(w);
      this.wheels.push(w);
    }
    this.wheelCenter = new THREE.Vector3(0, 1.8, -2.54);
  }

  buildKeel() {
    const g = this.group;
    this.keelFin = decoMesh([
      part(new THREE.BoxGeometry(0.14, 0.75, 3.0), COPPER, { y: -0.95, z: -0.3 }),
      part(new THREE.BoxGeometry(0.18, 0.06, 3.02), '#9a5428', { y: -0.6, z: -0.3 }),
      part(bandGeo(-0.22, 0.04, 0.008), COPPER),
    ]);
    this.keelBulb = decoMesh([
      part(new THREE.SphereGeometry(0.3, 12, 8), '#4a4f57', { y: -1.38, z: -0.4, sx: 0.75, sy: 0.65, sz: 2.4 }),
    ]);
    this.runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(), color: 0x7ff6ff, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.runeBand = new THREE.Mesh(bandGeo(0.13, 0.27, 0.035, 14), this.runeMat);
    for (const m of [this.keelFin, this.keelBulb, this.runeBand]) { m.visible = false; g.add(m); }
  }

  buildLanterns() {
    const root = new THREE.Group();
    root.position.set(-0.78, 1.0, -2.95);
    this.group.add(root);
    this.lanternRoot = root;
    const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
    const post = (h, c = '#6e4a2c') => part(new THREE.CylinderGeometry(0.05, 0.06, h, 6), c, { y: h / 2 });
    this.lanterns = [];
    // tier 0: candle in a dish
    {
      const grp = decoMesh([
        post(1.0),
        part(new THREE.CylinderGeometry(0.14, 0.1, 0.04, 10), BRASS, { y: 1.02 }),
        part(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), '#f8f1dc', { y: 1.12 }),
      ], true);
      const gm = glow(0xffc870);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), gm);
      flame.position.y = 1.26;
      grp.add(flame);
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 1.3, 0), color: 0xffb860, anim: flame });
    }
    // tier 1: oil lantern
    {
      const grp = decoMesh([
        post(1.6),
        part(new THREE.BoxGeometry(0.4, 0.06, 0.4), '#2b2b33', { y: 1.62 }),
        part(new THREE.ConeGeometry(0.33, 0.28, 4), '#2b2b33', { y: 2.22, ry: Math.PI / 4 }),
        part(new THREE.TorusGeometry(0.08, 0.015, 4, 10), '#2b2b33', { y: 2.42 }),
      ], true);
      const gm = glow(0xffd27a);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), gm);
      glass.position.y = 1.86;
      grp.add(glass);
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 1.9, 0), color: 0xffc070 });
    }
    // tier 2: brass lantern with a glass globe
    {
      const parts = [
        post(1.7, BRASS),
        part(new THREE.CylinderGeometry(0.2, 0.16, 0.08, 12), BRASS, { y: 1.72 }),
        part(new THREE.ConeGeometry(0.24, 0.24, 12), BRASS, { y: 2.26 }),
        part(new THREE.SphereGeometry(0.06, 8, 6), BRASS, { y: 2.42 }),
      ];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        parts.push(part(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4), BRASS, { x: Math.cos(a) * 0.18, y: 1.95, z: Math.sin(a) * 0.18 }));
      }
      const grp = decoMesh(parts, true);
      const gm = glow(0xffdc8a);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), gm);
      globe.position.y = 1.95; globe.scale.y = 1.2;
      grp.add(globe);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softHalo(), color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.y = 1.95; halo.scale.setScalar(1.4);
      grp.add(halo);
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 1.95, 0), color: 0xffc880, halo });
    }
    // tier 3: Starlight Beacon, a floating crystal with a soft halo
    {
      const parts = [
        post(1.9, GOLD),
        part(new THREE.CylinderGeometry(0.16, 0.12, 0.06, 10), GOLD, { y: 1.92 }),
        part(new THREE.TorusGeometry(0.22, 0.025, 6, 20), GOLD, { y: 2.3, rx: Math.PI / 2 }),
      ];
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        parts.push(part(new THREE.ConeGeometry(0.03, 0.42, 5), GOLD, { x: Math.cos(a) * 0.14, y: 2.12, z: Math.sin(a) * 0.14, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 }));
      }
      const grp = decoMesh(parts, true);
      const gm = glow(0xcff6ff);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), gm);
      crystal.position.y = 2.32; crystal.scale.y = 1.6;
      grp.add(crystal);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softHalo(), color: 0x9fe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.y = 2.32; halo.scale.setScalar(2.2);
      grp.add(halo);
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 2.32, 0), color: 0xbfe6ff, halo, anim: crystal, spin: true });
    }
    for (const L of this.lanterns) { L.group.visible = false; root.add(L.group); }
    this.light = new THREE.PointLight(0xffc070, 0, 40, 1.2);
    root.add(this.light);
  }

  buildNest() {
    this.nests = [];
    for (const gold of [false, true]) {
      const rim = gold ? GOLD : '#5b3a1f';
      const parts = [
        part(new THREE.CylinderGeometry(0.52, 0.42, 0.5, 16, 1, true), gold ? '#6e3b22' : '#8b5a2b'),
        part(new THREE.CircleGeometry(0.43, 16), '#6e4522', { y: -0.24, rx: Math.PI / 2 }),
        part(new THREE.TorusGeometry(0.52, 0.045, 6, 18), rim, { y: 0.25, rx: Math.PI / 2 }),
        part(new THREE.TorusGeometry(0.47, 0.03, 6, 18), rim, { y: -0.1, rx: Math.PI / 2 }),
      ];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.785;
        parts.push(part(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4), '#5b3a1f', { x: Math.cos(a) * 0.22, y: -0.55, z: Math.sin(a) * 0.22, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 }));
      }
      if (gold) {
        parts.push(part(new THREE.TorusGeometry(0.5, 0.02, 4, 18), GOLD, { y: 0.08, rx: Math.PI / 2 }));
        parts.push(part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), GOLD, { x: 0.5, y: 0.6 }));
        parts.push(part(new THREE.SphereGeometry(0.05, 6, 4), GOLD, { x: 0.5, y: 1.06 }));
      }
      const grp = decoMesh(parts, true);
      if (gold) {
        const p = makeFlag(0.9, 0.3, true, GOLD);
        p.mesh.position.set(0.5, 0.95, 0);
        grp.add(p.mesh);
        this.flags.push(p);
        this.nestPennant = p;
      }
      grp.visible = false;
      this.group.add(grp);
      this.nests.push(grp);
    }
  }

  buildWake() {
    const N = 260;
    this.wakeN = N;
    this.wake = [];
    const geo = new THREE.BufferGeometry();
    this.wakePos = new Float32Array(N * 3);
    this.wakeAlpha = new Float32Array(N);
    this.wakeSize = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.wakeAlpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.wakeSize, 1));
    for (let i = 0; i < N; i++) this.wake.push({ x: 0, z: 0, age: 99, life: 1, size: 1, vx: 0, vz: 0 });
    this.wakeMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uLight: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; uniform vec3 uLight;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5 || vA < 0.01) discard;
          float a = step(d, 0.5) * vA; gl_FragColor = vec4(vec3(0.95,0.98,1.0) * uLight, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.wakePoints = new THREE.Points(geo, this.wakeMat);
    this.wakePoints.frustumCulled = false;
    this.wakePoints.renderOrder = 3;
    this.scene.add(this.wakePoints);
    this.wakeIdx = 0;
    this.wakeTimer = 0;
  }

  applyUpgrades(levels, values) {
    const L = (k) => clamp(levels[k] || 0, 0, 3);
    this.levels = { sail: L('sail'), hull: L('hull'), rudder: L('rudder'), keel: L('keel'), lantern: L('lantern'), spyglass: L('spyglass') };
    const lv = this.levels;
    // hull
    const hs = HULL_STYLE[lv.hull];
    this.hullMat.color.set(hs.hull);
    this.trimMat.color.set(hs.trim);
    this.deckMat.color.set(hs.deck);
    this.hullTiers.forEach((t, i) => { t.visible = i === lv.hull; });
    // sails & rig
    this.sailMat.map = sailTexture(lv.sail);
    this.sailMat.needsUpdate = true;
    this.jibMat.color.set(['#e3d4b1', '#fbf8ef', '#fbf9f2', '#fff1cc'][lv.sail]);
    this.jibPivot.visible = lv.sail >= 1;
    this.flagMat.color.set(lv.sail >= 3 ? GOLD : '#d64a3a');
    this.pennant.mesh.visible = lv.sail >= 2;
    this.pennant.mat.color.set(lv.sail >= 3 ? GOLD : '#2f6fd0');
    // helm
    this.tiller.visible = lv.rudder <= 1;
    this.rudderBlade.visible = lv.rudder >= 1;
    this.helm.visible = lv.rudder >= 2;
    this.wheels[0].visible = lv.rudder === 2;
    this.wheels[1].visible = lv.rudder === 3;
    const ex = this.explorer;
    if (lv.rudder >= 2) { ex.setControl('wheel'); ex.root.position.set(0, 1.0, -3.0); ex.root.rotation.y = 0; }
    else { ex.setControl('tiller'); ex.root.position.set(0.42, 1.0, -2.55); ex.root.rotation.y = -0.25; }
    // keel
    this.keelFin.visible = lv.keel >= 1;
    this.keelBulb.visible = lv.keel >= 2;
    this.runeBand.visible = lv.keel >= 3;
    // lantern
    this.lanterns.forEach((l, i) => { l.group.visible = i === lv.lantern; });
    this.activeLantern = this.lanterns[lv.lantern];
    this.light.position.copy(this.activeLantern.light);
    this.light.color.set(this.activeLantern.color);
    this.lanternMat = this.activeLantern.glowMat;
    // spyglass: belt spyglass, then a crow's nest
    ex.setSpyglass(lv.spyglass);
    this.nests[0].visible = lv.spyglass === 2;
    this.nests[1].visible = lv.spyglass === 3;
    this.layoutRig();

    this.maxHealth = values.hull;
    this.lanternRange = values.lantern;
  }

  layoutRig() {
    const lv = this.levels;
    this.sailH = SAIL_H[lv.sail];
    const sailTop = BOOM_Y + this.sailH + 0.08;
    let top = MAST_TOP[lv.sail];
    this.nestY = sailTop + 0.55;
    if (lv.spyglass >= 2) top = Math.max(top, this.nestY + 1.0);
    const h = top - MAST_BASE;
    this.mast.scale.y = h; this.mastInk.scale.y = h;
    this.mastTop.set(0, top, MAST_Z);
    this.flag.position.set(0, top - 0.35, MAST_Z);
    this.pennant.mesh.position.set(0, top - 1.05, MAST_Z);
    for (const n of this.nests) n.position.set(0, this.nestY, MAST_Z);
    const jibTop = top * 0.8;
    this.jib.scale.y = (jibTop - 1.0) / 5.6;
    // forestay from the bow to the jib head
    const bow = new THREE.Vector3(0, 1.1, 3.75), head = new THREE.Vector3(0, jibTop, MAST_Z);
    this.stay.position.copy(bow);
    const d = head.clone().sub(bow);
    this.stay.scale.set(1, d.length(), 1);
    this.stay.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  /** World-space point between the explorer's eyes. */
  getEyePosition(target = new THREE.Vector3()) { return this.explorer.getEyePosition(target); }

  setCharacterVisible(v) { this.explorer.root.visible = v; }

  forward(out = new THREE.Vector2()) { return out.set(Math.sin(this.heading), Math.cos(this.heading)); }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.push.set(0, 0);
    this.sink = 0;
    this.sailLevel = 0;
    this.sailVis = 0;
    for (const w of this.wake) w.age = 99;
  }

  /**
   * ctl: {steer, sailTarget}; wind: {angle, strength}; up: upgrade values.
   * Returns an array of collision events: {damage, kind}.
   */
  simulate(dt, ctl, wind, world, up) {
    const events = [];
    this.hitCooldown -= dt;
    this.rudder = damp(this.rudder, ctl.steer, 6, dt);
    // where the wind comes FROM, relative to the bow (positive = from port/left)
    this.relWind = wrapAngle(wind.angle + Math.PI - this.heading);
    this.efficiency = pointOfSail(this.relWind);
    const sailF = [0, 0.55, 1][this.sailLevel];
    let target = sailF * this.efficiency * wind.strength * 15 * up.sail;
    if (this.sailLevel > 0) target = Math.max(target, 1.2 * sailF);
    const rate = target > this.speed ? 0.45 : 0.7;
    this.speed = damp(this.speed, target, rate, dt);
    const turnRate = (0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 8)) * 0.85 * up.rudder;
    this.heading -= this.rudder * turnRate * dt;
    this.speed *= 1 - Math.abs(this.rudder) * 0.12 * dt;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += (fx * this.speed + this.push.x) * dt;
    this.pos.z += (fz * this.speed + this.push.y) * dt;
    this.push.multiplyScalar(Math.exp(-2.5 * dt));

    // world edge: a strong current pushes you back
    const edge = WORLD_HALF - 250;
    const ax = Math.abs(this.pos.x), az = Math.abs(this.pos.z);
    this.atEdge = ax > edge || az > edge;
    if (ax > edge) this.push.x -= Math.sign(this.pos.x) * (ax - edge) * 0.3 * dt * 10;
    if (az > edge) this.push.y -= Math.sign(this.pos.z) * (az - edge) * 0.3 * dt * 10;
    this.pos.x = clamp(this.pos.x, -WORLD_HALF + 20, WORLD_HALF - 20);
    this.pos.z = clamp(this.pos.z, -WORLD_HALF + 20, WORLD_HALF - 20);

    // Terrain collision: probe bow, sides and stern
    const rx = -fz, rz = fx;
    const probes = [[3.6, 0], [1.2, 1.3], [1.2, -1.3], [-2.9, 0.9], [-2.9, -0.9]];
    for (const [f, r] of probes) {
      const px = this.pos.x + fx * f + rx * r, pz = this.pos.z + fz * f + rz * r;
      const h = world.heightAt(px, pz);
      if (h > -0.7) {
        const gx = world.heightAt(px + 1, pz) - world.heightAt(px - 1, pz);
        const gz = world.heightAt(px, pz + 1) - world.heightAt(px, pz - 1);
        const gl = Math.hypot(gx, gz) || 1;
        const nx = gx / gl, nz = gz / gl; // uphill direction
        const into = (fx * nx + fz * nz) * this.speed;
        const pen = Math.min(2, (h + 0.7) * 0.6 + 0.15);
        this.pos.x -= nx * pen; this.pos.z -= nz * pen;
        if (into > 0) {
          if (into > 3.5 && this.hitCooldown <= 0) {
            events.push({ damage: (into - 3.5) * 4.5 * (1 - up.keel * 0.4), kind: 'ground', speed: into });
            this.hitCooldown = 0.8;
            this.push.set(-nx * into * 0.6, -nz * into * 0.6);
            this.speed *= -0.25;
          } else {
            this.speed *= Math.exp(-6 * dt);
          }
        }
        break;
      }
    }
    // Rocks
    const rock = world.rockHit(this.pos.x + fx * 1.5, this.pos.z + fz * 1.5, 2.2);
    if (rock) {
      let nx = this.pos.x - rock.x, nz = this.pos.z - rock.z;
      const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d;
      const into = -(fx * nx + fz * nz) * this.speed;
      const pen = rock.r + 3.6 - d;
      if (pen > 0) { this.pos.x += nx * pen * 0.5; this.pos.z += nz * pen * 0.5; }
      if (into > 3 && this.hitCooldown <= 0) {
        events.push({ damage: (into - 3) * 5 * (1 - up.keel * 0.4), kind: 'rock', speed: into });
        this.hitCooldown = 0.8;
        this.push.set(nx * into * 0.7, nz * into * 0.7);
        this.speed *= -0.3;
      } else if (into > 0) this.speed *= Math.exp(-5 * dt);
    }
    return events;
  }

  animate(dt, t, wind, healthFrac, night, up) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const x = this.pos.x, z = this.pos.z;
    const hb = waveHeight(x + fx * 3, z + fz * 3), hs = waveHeight(x - fx * 3, z - fz * 3);
    const hp = waveHeight(x - rx * 1.4, z - rz * 1.4), hst = waveHeight(x + rx * 1.4, z + rz * 1.4);
    const hc = (hb + hs + hp + hst) * 0.25;
    const lowRide = (1 - healthFrac) * 0.35;
    this.y = damp(this.y, hc - lowRide - this.sink, 8, dt);
    this.pitch = damp(this.pitch, -Math.atan2(hb - hs, 6) * 0.8, 5, dt);
    const heelTarget = Math.sign(this.relWind) * [0, 0.5, 1][this.sailLevel] * this.efficiency * wind.strength * 0.16 * (1 - up.keel * 0.5)
      + this.rudder * Math.min(1, this.speed / 10) * 0.06;
    this.heel = damp(this.heel, heelTarget, 2, dt);
    this.roll = damp(this.roll, Math.atan2(hp - hst, 2.8) * 0.7 + this.heel, 5, dt);
    this.group.position.set(x, this.y, z);
    this.group.rotation.set(this.pitch + this.sink * 0.05, this.heading, this.roll + this.sink * 0.12);

    // Sail trim and billow
    const sailTarget = [0.06, 0.55, 1][this.sailLevel];
    this.sailVis = damp(this.sailVis, sailTarget, 3, dt);
    const a = Math.abs(this.relWind);
    const boomMag = clamp((a - 0.45) * 0.55, 0.12, 1.45);
    this.boomAngle = damp(this.boomAngle, Math.sign(this.relWind || 1) * boomMag, 2.5, dt);
    this.boom.rotation.y = this.boomAngle;
    this.jibPivot.rotation.y = this.boomAngle * 0.55;
    const billow = (0.25 + this.efficiency * 0.6) * wind.strength * (this.sailVis > 0.2 ? 1 : 0.2);
    const side = -Math.sign(this.relWind || 1);
    const pos = this.sailGeo.attributes.position;
    const H = this.sailH * this.sailVis;
    for (let j = 0; j <= SAIL_V; j++) for (let i = 0; i <= SAIL_U; i++) {
      const u = i / SAIL_U, v = j / SAIL_V;
      const hgt = H * (1 - 0.55 * u) * v + 0.08;
      const flap = Math.sin(t * 9 + u * 6 + v * 3) * 0.05 * (1 - this.efficiency);
      const bx = side * billow * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1)) * 0.9 + flap;
      pos.setXYZ(j * (SAIL_U + 1) + i, bx, hgt, -u * BOOM_LEN);
    }
    pos.needsUpdate = true;
    this.sailGeo.computeVertexNormals();

    // flags and pennants stream downwind
    const downwind = wrapAngle(wind.angle - this.heading);
    for (const f of this.flags) {
      if (!f.mesh.visible) continue;
      f.mesh.rotation.y = downwind;
      const fp = f.geo.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const bz = f.base[i * 3 + 2];
        fp.setX(i, f.base[i * 3] + Math.sin(t * 10 - bz * 3) * 0.12 * bz * (1.5 / f.w + 0.3));
      }
      fp.needsUpdate = true;
    }

    // Helm: tiller / rudder blade / wheel, and where the explorer's hands go
    const tillerYaw = this.rudder * 0.5;
    this.tiller.rotation.y = tillerYaw;
    this.rudderBlade.rotation.y = tillerYaw;
    const wheelRot = -this.rudder * 2.2;
    for (const w of this.wheels) w.rotation.z = wheelRot;
    let gripR, gripL = null;
    if (this.levels.rudder >= 2) {
      const R = 0.42, c = this.wheelCenter;
      const aL = 0.95 + wheelRot * 0.5, aR = -0.95 + wheelRot * 0.5;
      gripL = this._grip2.set(c.x + Math.sin(aL) * R, c.y + Math.cos(aL) * R, c.z);
      gripR = this._grip.set(c.x + Math.sin(aR) * R, c.y + Math.cos(aR) * R, c.z);
    } else {
      const phi = 0.5, L = 1.25;
      gripR = this._grip.set(Math.sin(tillerYaw) * Math.cos(phi) * L, 1.15 + Math.sin(phi) * L, -3.3 + Math.cos(tillerYaw) * Math.cos(phi) * L);
    }
    // apparent wind for the scarf
    const ws = wind.strength * 8;
    const ax = Math.sin(wind.angle) * ws - fx * this.speed, az = Math.cos(wind.angle) * ws - fz * this.speed;
    this.explorer.update(dt, t, {
      rudder: this.rudder, speed: this.speed, roll: this.roll,
      lookRel: this.lookYaw == null ? null : wrapAngle(this.lookYaw - this.heading),
      lookPitch: this.lookPitch || 0,
      windRel: wrapAngle(Math.atan2(ax, az) - this.heading),
      windStrength: Math.hypot(ax, az) / 10,
      gripR, gripL,
    });

    // Lantern
    const Lt = this.activeLantern;
    this.light.intensity = night * 14 * (0.9 + Math.sin(t * 7) * 0.05) * (this.levels.lantern === 0 ? 0.7 : 1);
    this.light.distance = this.lanternRange || 30;
    const glowK = 0.75 + night * 0.25;
    Lt.glowMat.color.set(Lt.color).multiplyScalar(glowK).offsetHSL(0, 0, night * 0.08);
    if (Lt.halo) {
      Lt.halo.material.opacity = 0.25 + night * 0.75;
      Lt.halo.scale.setScalar((this.levels.lantern === 3 ? 2.2 : 1.4) * (1 + night * 0.6) * (1 + Math.sin(t * 2.2) * 0.04));
    }
    if (Lt.anim) {
      if (Lt.spin) { Lt.anim.rotation.y = t * 1.2; Lt.anim.position.y = 2.32 + Math.sin(t * 1.8) * 0.05; }
      else Lt.anim.scale.set(1, 1 + Math.sin(t * 13) * 0.15, 1);
    }
    if (this.runeBand.visible) this.runeMat.opacity = 0.55 + 0.35 * Math.sin(t * 1.6) + night * 0.2;

    this.updateWake(dt, fx, fz, rx, rz);
  }

  updateWake(dt, fx, fz, rx, rz) {
    const sp = Math.abs(this.speed);
    this.wakeTimer += dt * (sp * 1.6);
    while (this.wakeTimer > 1 && sp > 1) {
      this.wakeTimer -= 1;
      for (const s of [-1, 1]) {
        const w = this.wake[this.wakeIdx];
        this.wakeIdx = (this.wakeIdx + 1) % this.wakeN;
        w.x = this.pos.x - fx * 2.8 + rx * s * 1.1 + (Math.random() - 0.5) * 0.4;
        w.z = this.pos.z - fz * 2.8 + rz * s * 1.1 + (Math.random() - 0.5) * 0.4;
        w.vx = rx * s * 1.2; w.vz = rz * s * 1.2;
        w.age = 0; w.life = 1.6 + Math.random() * 1.0; w.size = 0.55 + Math.min(sp, 20) * 0.03;
      }
      // bow spray
      if (sp > 6 && Math.random() < 0.5) {
        const w = this.wake[this.wakeIdx];
        this.wakeIdx = (this.wakeIdx + 1) % this.wakeN;
        const s = Math.random() < 0.5 ? -1 : 1;
        w.x = this.pos.x + fx * 3.3 + rx * s * 0.8; w.z = this.pos.z + fz * 3.3 + rz * s * 0.8;
        w.vx = rx * s * 3; w.vz = rz * s * 3; w.age = 0; w.life = 1; w.size = 1.0;
      }
    }
    for (let i = 0; i < this.wakeN; i++) {
      const w = this.wake[i];
      w.age += dt;
      if (w.age > w.life) { this.wakeAlpha[i] = 0; continue; }
      w.x += w.vx * dt; w.z += w.vz * dt;
      w.vx *= 0.98; w.vz *= 0.98;
      const k = w.age / w.life;
      this.wakePos[i * 3] = w.x; this.wakePos[i * 3 + 1] = waveHeight(w.x, w.z) + 0.35; this.wakePos[i * 3 + 2] = w.z;
      this.wakeAlpha[i] = (1 - k) * 0.75;
      this.wakeSize[i] = w.size * (1 + k * 1.6);
    }
    const g = this.wakePoints.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}
