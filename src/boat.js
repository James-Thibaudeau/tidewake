// A sailboat: model (with tiered visual upgrades), sailing physics,
// collisions, wake particles, and the explorer at the helm. The player's boat
// is `new Boat(scene)`; a second, computer-sailed boat (the rival's redwing) is
// `new Boat(scene, { npc: true, profile, livery })`.
import * as THREE from 'three';
import { toon, toonGradient, toonMaterial, outlineMaterial, glowBoost } from './toon.js';
import { waveHeight } from './waves.js';
import { clamp, damp, smoothstep, wrapAngle, lerp, TAU } from './util.js';
import { WORLD_HALF } from './config.js';
import { Wake } from './wake.js';
import { Explorer, part, mergeParts } from './explorer.js';

const SAIL_U = 12, SAIL_V = 10;
const JIB_U = 10, JIB_V = 7;     // along the luff, luff->leech
const TOP_U = 8, TOP_V = 6;      // along the gaff, gaff->head
const BOOM_Y = 1.55, BOOM_LEN = 3.1, MAST_Z = 0.9, MAST_BASE = 0.7;
const SAIL_H = [6.2, 6.2, 6.9, 7.3, 7.6, 8.0];
const MAST_TOP = [8.4, 8.4, 9.5, 9.9, 11.5, 12.3];
// Hull tiers 4-5 build a visibly bigger ship: the whole model scales up.
export const SIZE_SCALE = [1, 1, 1, 1, 1.12, 1.25];
const MAX_TIER = 5;
const SAIL_BASE = ['#e3d4b1', '#fbf8ef', '#fbf9f2', '#fff1cc', '#9c2f27', '#fffaf0'];
const ROPE = '#5a4632';

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
  { hull: '#4a1d13', trim: '#f3e7c9', deck: '#c08a52' },   // mahogany galleon
  { hull: '#123c5c', trim: '#ffd75e', deck: '#cfa168' },   // royal flagship
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
// Compass-rose emblem, pre-squashed so it reads round on the tapered sail.
function drawEmblem(g, S, H, { u = 0.36, v = 0.52, R = 1.05, ring = '#d4402e', inner = GOLD, a = '#d4402e', b = GOLD, fill = 'rgba(212,64,46,0.18)', points = 8 } = {}) {
  const cx = u * S, cy = (1 - v) * S;
  const rx = R / (BOOM_LEN / S), ry = R / ((H * (1 - 0.55 * u)) / S);
  g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
  g.fillStyle = fill;
  g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
  g.strokeStyle = ring; g.lineWidth = 9;
  g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = inner; g.lineWidth = 4;
  g.beginPath(); g.arc(0, 0, rx - 10, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < points; k++) {
    const ang = (k / points) * Math.PI * 2, L = k % 2 ? rx * 0.55 : rx * 0.92, w2 = rx * 0.14;
    g.fillStyle = k % 2 ? a : b;
    g.beginPath();
    g.moveTo(Math.cos(ang) * L, Math.sin(ang) * L);
    g.lineTo(Math.cos(ang + Math.PI / 2) * w2, Math.sin(ang + Math.PI / 2) * w2);
    g.lineTo(Math.cos(ang - Math.PI / 2) * w2, Math.sin(ang - Math.PI / 2) * w2);
    g.fill();
  }
  g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(0, 0, rx * 0.1, 0, Math.PI * 2); g.fill();
  g.restore();
}

// plain = the same cloth without emblems/stripes (for the jib and topsail).
// cloth = a dye (CSS hex) that replaces the tier's own cloth colour. On a dark
// or saturated dye the seams go darker and the trim turns cream and gold, so
// every tier's decoration still reads.
// A wing emblem for a livery's mainsail: a dark swept wing with a gold and
// cream shoulder bar, squashed like drawEmblem so it sits right on the taper.
const WING_INK = '#1d1a22';
function drawWing(g, S, H, { u = 0.37, v = 0.5, R = 1.35 } = {}) {
  const cx = u * S, cy = (1 - v) * S;
  const rx = R / (BOOM_LEN / S), ry = R / ((H * (1 - 0.55 * u)) / S);
  g.save(); g.translate(cx, cy); g.scale(rx, ry);
  g.fillStyle = WING_INK;
  g.beginPath();
  g.moveTo(-1.0, 0.2);
  g.quadraticCurveTo(-0.3, -0.75, 1.05, -0.9);   // leading edge, out to the tip
  g.lineTo(0.6, -0.44); g.lineTo(0.92, -0.32);   // three feather tips down the trailing edge
  g.lineTo(0.4, -0.02); g.lineTo(0.68, 0.16);
  g.lineTo(0.14, 0.32); g.lineTo(0.36, 0.54);
  g.quadraticCurveTo(-0.5, 0.66, -1.0, 0.2);
  g.fill();
  // the shoulder bar
  g.save(); g.translate(-0.56, 0.08); g.rotate(-0.55);
  g.fillStyle = GOLD; g.beginPath(); g.ellipse(0, 0, 0.3, 0.13, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3e7c9'; g.beginPath(); g.ellipse(0.04, 0.2, 0.26, 0.06, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.restore();
}

// emblem: a livery's own mark in place of the tier's stripes and roses ('wing')
function sailTexture(tier, plain = false, cloth = null, emblem = null) {
  const key = tier + (plain ? 'p' : '') + (cloth || '') + (emblem || '');
  if (sailTexCache[key]) return sailTexCache[key];
  const H = SAIL_H[tier];
  const CREAM = '#f3e7c9';
  let dk = false; // a dyed cloth too dark for the tier's usual pale-cloth trim
  if (cloth) { const c = new THREE.Color(cloth); dk = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.5; }
  const tex = canvasTex(256, 256, (g, S) => {
    g.fillStyle = cloth || SAIL_BASE[tier];
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = dk ? `rgba(20,5,10,${Math.random() * 0.09})`
        : tier === 4 ? `rgba(40,10,5,${Math.random() * 0.08})` : `rgba(120,100,60,${Math.random() * (tier === 0 ? 0.08 : 0.04)})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    // panel seams (finer, doubled-stitch seams on the top rigs)
    g.strokeStyle = dk ? 'rgba(25,5,10,0.42)'
      : tier === 0 ? 'rgba(120,95,55,0.55)' : tier === 4 ? 'rgba(60,15,10,0.45)' : tier === 5 ? 'rgba(190,150,70,0.45)' : 'rgba(150,140,110,0.4)';
    g.lineWidth = 2;
    const step = tier >= 4 ? 22 : 30;
    for (let y = step; y < S; y += step) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      if (tier >= 4) { g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, y + 4); g.lineTo(S, y + 4); g.stroke(); g.globalAlpha = 1; }
    }
    if (tier >= 4) {
      // vertical cloth panels
      g.strokeStyle = dk ? 'rgba(25,5,10,0.22)' : tier === 4 ? 'rgba(60,15,10,0.25)' : 'rgba(190,150,70,0.25)'; g.lineWidth = 1.5;
      for (let x = 32; x < S; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
    }
    if (tier === 0) {
      // patches: off-cuts of the same cloth when it's dyed, stitched in cream
      const tint = (k) => '#' + new THREE.Color(cloth).lerp(new THREE.Color(k < 0 ? '#000000' : '#ffffff'), Math.abs(k)).getHexString();
      const patches = cloth ? [tint(-0.22), tint(0.14), tint(-0.32), tint(0.07)] : ['#c8b083', '#d8c497', '#b99d6c', '#cfb98d'];
      for (const [i, [x, y, w, h]] of [[36, 150, 62, 46], [150, 58, 52, 40], [118, 196, 46, 34], [60, 70, 30, 26]].entries()) {
        g.fillStyle = patches[i]; g.fillRect(x, y, w, h);
        g.setLineDash([5, 4]); g.strokeStyle = dk ? CREAM : '#7d6440'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
        g.setLineDash([]);
      }
    }
    if (tier >= 1) {
      // reinforced corners
      g.fillStyle = tier === 3 || tier === 5 ? '#f3d58a' : tier === 4 || dk ? CREAM : 'rgba(200,190,160,0.6)';
      g.beginPath(); g.moveTo(0, S); g.lineTo(46, S); g.lineTo(0, S - 46); g.fill();
      g.beginPath(); g.moveTo(S, S); g.lineTo(S - 40, S); g.lineTo(S, S - 40); g.fill();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(40, 0); g.lineTo(0, 40); g.fill();
    }
    if (tier === 2 && !plain && !emblem) {
      // racing stripes (cream and gold on a dark dye, where blue and red would sink in)
      g.fillStyle = dk ? CREAM : '#2f6fd0'; g.fillRect(0, 150, S, 22); g.fillRect(0, 184, S, 10);
      g.fillStyle = dk ? GOLD : '#d4402e'; g.fillRect(0, 175, S, 5);
    }
    const paleRose = { ring: CREAM, inner: GOLD, a: CREAM, b: GOLD, fill: 'rgba(243,231,201,0.18)' };
    if (tier === 3 && !plain && !emblem) drawEmblem(g, S, H, dk ? paleRose : {});
    if (tier === 4 && !plain && !emblem) {
      // cream bands with gold piping, and a cream/gold rose
      g.fillStyle = '#f3e7c9'; g.fillRect(0, 196, S, 16); g.fillRect(0, 222, S, 6);
      g.fillStyle = GOLD; g.fillRect(0, 193, S, 3); g.fillRect(0, 212, S, 3);
      drawEmblem(g, S, H, { R: 1.0, ...paleRose });
    }
    if (tier === 5 && !plain && !emblem) {
      // a big navy-and-gold sunburst rose on white-gold silk
      g.fillStyle = 'rgba(255,207,74,0.16)'; g.fillRect(0, 0, S, S);
      drawEmblem(g, S, H, dk ? { R: 1.55, v: 0.5, ...paleRose, points: 16 }
        : { R: 1.55, v: 0.5, ring: '#173a63', inner: GOLD, a: '#173a63', b: GOLD, fill: 'rgba(23,58,99,0.14)', points: 16 });
    }
    if (emblem === 'wing') {
      // a dark band along the foot of every sail, and the wing on the main
      g.fillStyle = WING_INK; g.fillRect(0, S - 40, S, 26);
      g.fillStyle = '#f3e7c9'; g.fillRect(0, S - 44, S, 3);
      if (!plain) drawWing(g, S, H);
    }
    if (tier === 3 || tier === 5) {
      // gold wave trim along the foot
      g.strokeStyle = GOLD; g.lineWidth = 5;
      g.beginPath();
      for (let x = 0; x <= S; x += 4) g.lineTo(x, S - 14 + Math.sin(x * 0.12) * 5);
      g.stroke();
    }
    if (tier >= 4) {
      // two rows of reef points with little dangling ties
      for (const ry of [S - 44, S - 78]) {
        for (let x = 10; x < S; x += 16) {
          g.fillStyle = tier === 4 || dk ? CREAM : '#7a5a2a';
          g.fillRect(x - 1.5, ry - 1.5, 3, 3);
          g.strokeStyle = g.fillStyle; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(x, ry); g.lineTo(x + 1, ry + 7); g.stroke();
        }
      }
    }
    // edge tape / bolt rope
    g.strokeStyle = tier >= 3 ? GOLD : dk ? (tier === 0 ? 'rgba(25,5,10,0.6)' : 'rgba(243,231,201,0.85)')
      : tier === 0 ? 'rgba(120,95,55,0.8)' : 'rgba(170,155,120,0.8)';
    g.lineWidth = tier >= 3 ? 10 : 6;
    g.strokeRect(0, 0, S, S);
    if (tier >= 4) { g.strokeStyle = 'rgba(90,70,50,0.9)'; g.lineWidth = 3; g.strokeRect(5, 5, S - 10, S - 10); }
  });
  sailTexCache[key] = tex;
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

const decoMat = toonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
const thinInk = outlineMaterial(0.025, 0x1b2233);

function decoMesh(parts, outline = false) {
  const g = new THREE.Group();
  const geo = mergeParts(parts);
  g.add(new THREE.Mesh(geo, decoMat));
  if (outline) g.add(new THREE.Mesh(geo, thinInk));
  return g;
}

// ---- ropes: static ones are merged tubes, dynamic ones are unit cylinders re-aimed each frame
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function ropePart(a, b, sag = 0, r = 0.022, color = ROPE) {
  const curve = sag
    ? new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -sag, 0)), b)
    : new THREE.LineCurve3(a, b);
  return part(new THREE.TubeGeometry(curve, sag ? 8 : 1, r, 4, false), color);
}
function coilPart(x, y, z, r = 0.2, color = ROPE) {
  const parts = [];
  for (let k = 0; k < 3; k++) parts.push(part(new THREE.TorusGeometry(r - k * 0.035, 0.028, 4, 14), color, { x, y: y + k * 0.045, z, rx: Math.PI / 2 }));
  return parts;
}
const ropeMat = toonMaterial({ color: ROPE, gradientMap: toonGradient() });
function segMesh(r = 0.022) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 5).translate(0, 0.5, 0), ropeMat);
  m.frustumCulled = false;
  return m;
}
function setSeg(mesh, a, b) {
  mesh.position.copy(a);
  _d.subVectors(b, a);
  const L = _d.length() || 1e-3;
  mesh.scale.set(1, L, 1);
  mesh.quaternion.setFromUnitVectors(_up, _d.divideScalar(L));
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function figurehead(gold, winged = false) {
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
    if (winged) {
      // great swept-back wings, three feathered layers each
      for (let k = 0; k < 3; k++) {
        parts.push(part(new THREE.ConeGeometry(0.2 - k * 0.03, 1.3 - k * 0.25, 4), k === 1 ? '#fff2b8' : wing,
          { x: s * (0.35 + k * 0.08), y: 0.25 + k * 0.12, z: -0.55 - k * 0.05, rx: -Math.PI / 2 + 0.55 + k * 0.12, ry: s * (0.9 - k * 0.12), sz: 0.22 }));
      }
      parts.push(part(new THREE.TorusGeometry(0.12, 0.025, 5, 12), GOLD, { y: 0.42, z: 0.28, rx: Math.PI / 2 }));
    }
  }
  const g = decoMesh(parts, true);
  g.position.set(0, 0.62, 3.98);
  g.rotation.x = -0.35;
  return g;
}

// The mast of a dismasted boat: this much of it is left standing.
const STUB_H = 1.7;

export class Boat {
  /**
   * opts.npc      not the player's boat: no PointLights (adding lights at
   *               runtime recompiles every shader), lantern glow meshes only
   * opts.profile  appearance profile for the explorer at the helm
   * opts.livery   { hull, trim, deck, sail, flag, pennant } colours that
   *               replace the tier colours (see setLivery)
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.npc = !!opts.npc;
    this.profile = opts.profile || null;
    this.livery = opts.livery || null;
    this.dismasted = false;
    this.up = null;        // upgrade values { sail, rudder, keel, hull, lantern }: an NPC's driver reads and writes these
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
    // Everything that makes up the ship lives in `model`, which scales up with the
    // big hull tiers. The explorer stays on the unscaled group so he keeps his size.
    this.model = new THREE.Group();
    this.group.add(this.model);
    this.sizeScale = 1;
    const g = this.model;
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
    this.sailMat = toonMaterial({ map: sailTexture(0), gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.sail = new THREE.Mesh(this.sailGeo, this.sailMat);
    this.sail.frustumCulled = false;
    this.boom.add(this.sail);

    // Jib: luff along the forestay, tack at the bow (or bowsprit), clew sheeted to leeward
    this.jibGeo = this.makeSailGrid(JIB_U, JIB_V, true);
    this.jibMat = toonMaterial({ map: sailTexture(1), gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.jib = new THREE.Mesh(this.jibGeo, this.jibMat);
    this.jib.frustumCulled = false;
    g.add(this.jib);
    // Gaff topsail above the main (sail tiers 4-5): lives on the boom so it swings with it
    this.topGeo = this.makeSailGrid(TOP_U, TOP_V, false);
    this.topMat = toonMaterial({ map: sailTexture(4), gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.topsail = new THREE.Mesh(this.topGeo, this.topMat);
    this.topsail.frustumCulled = false;
    this.boom.add(this.topsail);
    // standing rigging (rebuilt on upgrade) + running rigging (re-aimed every frame)
    this.rig = new THREE.Group();
    g.add(this.rig);
    this.mainSheet = segMesh(0.02);
    this.jibSheet = segMesh(0.018);
    this.jibSheetSlack = segMesh(0.016);
    g.add(this.mainSheet, this.jibSheet, this.jibSheetSlack);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3();
    this._q = new THREE.Quaternion();

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

    this.buildAnchor();

    // The explorer
    this.explorer = this.profile ? new Explorer(this.profile) : new Explorer();
    this.group.add(this.explorer.root);
  }

  /** Grandfather's anchor, hung at the starboard bow once it's fitted. */
  buildAnchor() {
    const IRON = '#3c434c', IRON2 = '#5b6570';
    const P = [
      part(new THREE.CylinderGeometry(0.045, 0.05, 0.9, 6), IRON),                            // shank
      part(new THREE.TorusGeometry(0.09, 0.025, 4, 10), IRON2, { y: 0.52 }),                   // ring
      part(new THREE.CylinderGeometry(0.032, 0.032, 0.62, 5), '#6b4a2b', { y: 0.36, rz: Math.PI / 2 }), // wooden stock
      part(new THREE.TorusGeometry(0.28, 0.045, 5, 12, Math.PI), IRON, { y: -0.2, rz: Math.PI }), // arms
      part(new THREE.SphereGeometry(0.07, 6, 4), IRON2, { y: -0.47 }),                         // crown
    ];
    for (const s of [-1, 1]) P.push(part(new THREE.ConeGeometry(0.09, 0.2, 4), IRON2, { x: s * 0.28, y: -0.13, rz: s * -0.25 }));
    const anchor = decoMesh(P, true);
    anchor.position.set(0.98, 0.42, 2.85);
    anchor.rotation.set(0.12, 0.3, 0.22);
    anchor.scale.setScalar(1.7); // big enough to read from the chase camera
    // the rope from the cathead to the ring
    const rope = decoMesh([ropePart(V3(0.6, 1.2, 3.15), V3(0.98, 1.3, 2.95), 0.05, 0.025)]);
    this.anchorStowed = new THREE.Group();
    this.anchorStowed.add(anchor, rope);
    // dropped: a chain running from the bow down into the water
    const chain = decoMesh([ropePart(V3(0.62, 1.05, 3.35), V3(1.0, -1.8, 5.0), 0.25, 0.035, '#4a525c')]);
    this.anchorDown = chain;
    this.anchorStowed.visible = false;
    this.anchorDown.visible = false;
    this.model.add(this.anchorStowed, this.anchorDown);
    this.anchorState = 'none';
  }

  /** 'none' (no anchor yet) | 'stowed' (at the bow) | 'down' (dropped, chain in the water). */
  setAnchor(state) {
    this.anchorState = state;
    this.anchorStowed.visible = state === 'stowed';
    this.anchorDown.visible = state === 'down';
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
      const parts = [];
      for (const side of [-1, 1]) for (const z of [-1.3, 0.5]) {
        const S = sideAt(z, 0.3, side, 0.14);
        parts.push(part(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 10), '#e9d7a8', { x: S.x, y: 0.3, z: S.z }));
        parts.push(part(new THREE.TorusGeometry(0.11, 0.02, 4, 10), '#b89a62', { x: S.x, y: 0.42, z: S.z, rx: Math.PI / 2 }));
        parts.push(part(new THREE.TorusGeometry(0.11, 0.02, 4, 10), '#b89a62', { x: S.x, y: 0.18, z: S.z, rx: Math.PI / 2 }));
        parts.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 4), '#8a6a3a', { x: S.x * 0.97, y: 0.75, z: S.z }));
      }
      const grp = decoMesh(parts);
      // the stripe is its own mesh so a livery's trim colour can repaint it
      this.stripeMat = toon('#3f7fd0', { side: THREE.DoubleSide });
      grp.add(new THREE.Mesh(bandGeo(0.36, 0.48, 0.012), this.stripeMat));
      tiers.push(grp);
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
    // tiers 4 and 5: galleon and royal flagship (the whole model also scales up)
    for (const royal of [false, true]) tiers.push(this.grandHull(royal));
    this.hullTiers = tiers;
    for (const t of tiers) { t.visible = false; this.model.add(t); }
  }

  grandHull(royal) {
    const gold = GOLD, accent = royal ? '#1d8c8c' : '#f3e7c9', dark = royal ? '#0c2a40' : '#2a120c';
    const parts = [
      // double gold stripes with a coloured band between them
      part(bandGeo(0.66, 0.76, 0.03), gold),
      part(bandGeo(0.5, 0.6, 0.015), accent),
      part(bandGeo(0.42, 0.48, 0.03), gold),
      part(bandGeo(0.08, 0.14, 0.015), gold),
    ];
    for (const side of [-1, 1]) {
      // a row of gold portholes
      for (const z of [-2.2, -1.3, -0.4, 0.5, 1.4]) {
        const S = sideAt(z, 0.3, side, 0.015);
        parts.push(part(new THREE.TorusGeometry(0.085, 0.024, 6, 14), gold, { x: S.x, y: 0.3, z: S.z, ry: S.yaw }));
        const q = onSide(S, 0, 0, -0.005);
        parts.push(part(new THREE.CircleGeometry(0.07, 12), royal ? '#ffd88a' : '#24507f', { x: q.x, y: 0.3, z: q.z, ry: S.yaw }));
      }
      // gold scrollwork at the bow
      for (const [z, y, r] of [[2.6, 0.55, 0.22], [3.05, 0.6, 0.16], [2.2, 0.2, 0.18]]) {
        const S = sideAt(z, y, side, 0.03);
        parts.push(part(new THREE.TorusGeometry(r, 0.03, 4, 16, Math.PI * 1.5), gold, { x: S.x, y, z: S.z, ry: S.yaw, rz: z * 2.1 }));
      }
      // deck lockers and lashed barrels
      parts.push(part(new THREE.BoxGeometry(0.42, 0.3, 0.7), dark, { x: side * 0.78, y: 1.15, z: -1.25 }));
      parts.push(part(new THREE.BoxGeometry(0.46, 0.05, 0.74), gold, { x: side * 0.78, y: 1.31, z: -1.25 }));
      parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10), '#9c6b3a', { x: side * 0.7, y: 1.21, z: 2.05 }));
      parts.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 10), '#3a2a1e', { x: side * 0.7, y: 1.32, z: 2.05 }));
      parts.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 10), '#3a2a1e', { x: side * 0.7, y: 1.1, z: 2.05 }));
      // stern lantern brackets
      parts.push(part(new THREE.TorusGeometry(0.24, 0.035, 5, 16, Math.PI * 1.5), gold, { x: side * 1.18, y: 1.3, z: -3.35, ry: Math.PI / 2, rz: 0.6 }));
      parts.push(part(new THREE.SphereGeometry(0.08, 8, 6), gold, { x: side * 1.18, y: 1.58, z: -3.35 }));
    }
    // carved transom: stern windows with a little gallery and balusters
    parts.push(part(new THREE.BoxGeometry(2.1, 0.62, 0.06), dark, { y: 0.55, z: -3.43 }));
    for (const x of [-0.6, 0, 0.6]) {
      parts.push(part(new THREE.BoxGeometry(0.36, 0.34, 0.03), royal ? '#ffd88a' : '#ffcf7a', { x, y: 0.56, z: -3.47 }));
      parts.push(part(new THREE.TorusGeometry(0.2, 0.025, 4, 4), gold, { x, y: 0.56, z: -3.48, rz: Math.PI / 4, sx: 1.0, sy: 1.0 }));
    }
    parts.push(part(new THREE.BoxGeometry(2.3, 0.07, 0.42), dark, { y: 0.18, z: -3.62 }));
    parts.push(part(new THREE.BoxGeometry(2.32, 0.05, 0.05), gold, { y: 0.48, z: -3.82 }));
    for (let k = 0; k < 9; k++) parts.push(part(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 5), gold, { x: -1.08 + k * 0.27, y: 0.33, z: -3.81 }));
    parts.push(part(new THREE.TorusGeometry(0.32, 0.04, 5, 18, Math.PI), gold, { y: 0.88, z: -3.44 }));
    // bowsprit with a gilded tip and a bobstay to the stem
    parts.push(part(new THREE.CylinderGeometry(0.07, 0.11, 2.3, 8), royal ? '#5b3a1f' : '#6e4a2c', { y: 1.37, z: 4.32, rx: Math.PI / 2 - 0.36 }));
    parts.push(part(new THREE.SphereGeometry(0.1, 8, 6), gold, { y: 1.77, z: 5.42 }));
    parts.push(part(new THREE.CylinderGeometry(0.115, 0.115, 0.08, 10), gold, { y: 1.2, z: 3.85, rx: Math.PI / 2 - 0.36 }));
    const grp = decoMesh(parts);
    const fig = figurehead(true, royal);
    if (royal) fig.scale.setScalar(1.25);
    grp.add(fig);
    return grp;
  }

  buildHelm() {
    const g = this.model;
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
    // rudder tiers 2..5
    const specs = [
      { R: 0.42, wood: '#8b5a2b', metal: BRASS, knob: null, n: 8 },
      { R: 0.42, wood: '#4a2a1c', metal: GOLD, knob: GOLD, n: 8 },
      { R: 0.52, wood: '#3b2214', metal: BRASS, knob: BRASS, n: 10 },
      { R: 0.55, wood: '#5a3018', metal: GOLD, knob: GOLD, n: 12, gilded: true },
    ];
    for (const sp of specs) {
      const { R, wood, metal } = sp;
      const parts = [
        part(new THREE.TorusGeometry(R, 0.04 + (R - 0.42) * 0.12, 6, 30), wood),
        part(new THREE.TorusGeometry(R, 0.012, 4, 30), metal, { z: 0.045 }),
        part(new THREE.CylinderGeometry(0.09 + (R - 0.42) * 0.3, 0.09, 0.14, 12), metal, { rx: Math.PI / 2 }),
      ];
      if (sp.gilded) {
        parts.push(part(new THREE.TorusGeometry(R * 0.55, 0.02, 4, 24), GOLD, { z: 0.03 }));
        parts.push(part(new THREE.TorusGeometry(R + 0.05, 0.015, 4, 30), GOLD, { z: -0.03 }));
      }
      for (let k = 0; k < sp.n / 2; k++) parts.push(part(new THREE.CylinderGeometry(0.022, 0.022, R * 2 + 0.22, 5), sp.gilded ? GOLD : wood, { rz: (k / (sp.n / 2)) * Math.PI }));
      for (let k = 0; k < sp.n; k++) {
        const a = (k / sp.n) * TAU;
        parts.push(part(new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6), wood, { x: Math.sin(a) * (R + 0.16), y: Math.cos(a) * (R + 0.16), rz: -a }));
        if (sp.knob) parts.push(part(new THREE.SphereGeometry(0.045, 6, 4), sp.knob, { x: Math.sin(a) * (R + 0.24), y: Math.cos(a) * (R + 0.24) }));
      }
      const w = decoMesh(parts, true);
      w.position.set(0, 1.8, -2.48);
      w.userData.R = R;
      this.helm.add(w);
      this.wheels.push(w);
    }
    // compass binnacle ahead of the gilded wheel (rudder tier 5)
    const bin = [
      part(new THREE.CylinderGeometry(0.16, 0.22, 0.75, 10), '#3a2014', { y: 1.38, z: -1.85 }),
      part(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 14), GOLD, { y: 1.78, z: -1.85 }),
      part(new THREE.SphereGeometry(0.21, 14, 8, 0, TAU, 0, Math.PI / 2), '#bfe6ff', { y: 1.8, z: -1.85 }),
      part(new THREE.TorusGeometry(0.21, 0.025, 6, 16), GOLD, { y: 1.82, z: -1.85, rx: Math.PI / 2 }),
      part(new THREE.SphereGeometry(0.06, 8, 6), GOLD, { y: 2.03, z: -1.85 }),
    ];
    for (const sd of [-1, 1]) bin.push(part(new THREE.SphereGeometry(0.08, 8, 6), sd < 0 ? '#d4402e' : '#2fa04a', { x: sd * 0.32, y: 1.8, z: -1.85 }));
    this.binnacle = decoMesh(bin, true);
    g.add(this.binnacle);
    this.wheelCenter = new THREE.Vector3(0, 1.8, -2.54);
  }

  buildKeel() {
    const g = this.model;
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
    // tier 4: twin bilge keels and riveted copper sheathing at the waterline
    const bilge = [];
    for (const side of [-1, 1]) {
      bilge.push(part(new THREE.BoxGeometry(0.1, 0.55, 2.4), COPPER, { x: side * 0.72, y: -0.62, z: -0.4, rz: side * 0.45 }));
      for (let z = -2.9; z <= 3.0; z += 0.32) {
        if (halfW(z) < 0.2) continue;
        for (const y of [-0.12, 0.0]) {
          const S = sideAt(z, y, side, 0.02);
          bilge.push(part(new THREE.SphereGeometry(0.028, 5, 3), '#e8a060', { x: S.x, y, z: S.z }));
        }
      }
    }
    bilge.push(part(bandGeo(-0.18, 0.06, 0.012), '#b8652e'));
    this.keelBilge = decoMesh(bilge);
    // tier 5: soft teal glow skirting the waterline
    const glowTex = canvasTex(8, 64, (gx, w, h) => {
      const gr = gx.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      gx.fillStyle = gr; gx.fillRect(0, 0, w, h);
    });
    this.waterGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x3ff0d8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.waterGlow = new THREE.Mesh(bandGeo(-0.35, 0.45, 0.25), this.waterGlowMat);
    for (const m of [this.keelFin, this.keelBulb, this.runeBand, this.keelBilge, this.waterGlow]) { m.visible = false; g.add(m); }
  }

  buildLanterns() {
    const root = new THREE.Group();
    root.position.set(-0.78, 1.0, -2.95);
    this.model.add(root);
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
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 1.95, 0), color: 0xffc880, halo, haloSize: 1.4 });
    }
    const haloSprite = (color, size) => {
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: softHalo(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      h.scale.setScalar(size);
      return h;
    };
    // Starlight Beacon: a floating crystal with a soft halo (tier 3, and the stern light of tier 5)
    const starlight = () => {
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
      const halo = haloSprite(0x9fe8ff, 2.2);
      halo.position.y = 2.32;
      grp.add(halo);
      return { group: grp, glowMat: gm, light: new THREE.Vector3(0, 2.32, 0), color: 0xbfe6ff, halo, haloSize: 2.2, anim: crystal, spin: true, animY: 2.32 };
    };
    this.lanterns.push(starlight());
    // tier 4: twin brass lanterns, one at the stern and one at the bow
    {
      const brass = (h) => {
        const parts = [
          post(h, '#3b2214'),
          part(new THREE.CylinderGeometry(0.24, 0.2, 0.08, 12), BRASS, { y: h + 0.02 }),
          part(new THREE.ConeGeometry(0.29, 0.3, 12), BRASS, { y: h + 0.62 }),
          part(new THREE.TorusGeometry(0.09, 0.02, 4, 10), BRASS, { y: h + 0.84 }),
          part(new THREE.TorusGeometry(0.22, 0.02, 4, 16), BRASS, { y: h + 0.3, rx: Math.PI / 2 }),
        ];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          parts.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 4), BRASS, { x: Math.cos(a) * 0.21, y: h + 0.3, z: Math.sin(a) * 0.21 }));
        }
        const grp = decoMesh(parts, true);
        const gm = glow(0xffd98a);
        const globe = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.44, 12), gm);
        globe.position.y = h + 0.3;
        grp.add(globe);
        const halo = haloSprite(0xffc070, 1.6);
        halo.position.y = h + 0.3;
        grp.add(halo);
        return { grp, gm, halo, y: h + 0.3 };
      };
      const st = brass(1.7), bw = brass(1.0);
      const bowRoot = new THREE.Group();
      bowRoot.position.set(0.62, 1.0, 2.6);
      bowRoot.add(bw.grp);
      bowRoot.visible = false;
      this.model.add(bowRoot);
      this.lanterns.push({
        group: st.grp, glowMat: st.gm, light: new THREE.Vector3(0, st.y, 0), color: 0xffc878, halo: st.halo, haloSize: 1.6,
        extra: { group: bowRoot, glowMat: bw.gm, halo: bw.halo, haloSize: 1.5, color: 0xffc878, light: new THREE.Vector3(0.62, 1.0 + bw.y, 2.6) },
      });
    }
    // tier 5: Starlight stern beacon + the "Lighthouse Heart" crowning the mast
    {
      const stern = starlight();
      const heart = new THREE.Group();
      heart.add(decoMesh([
        part(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 12), GOLD),
        part(new THREE.TorusGeometry(0.34, 0.03, 6, 24), GOLD, { y: 0.42, rx: Math.PI / 2 }),
        part(new THREE.TorusGeometry(0.34, 0.02, 6, 24), GOLD, { y: 0.42 }),
        part(new THREE.ConeGeometry(0.06, 0.25, 6), GOLD, { y: 0.92 }),
      ], true));
      const hm = glow(0xfff1c8);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), hm);
      crystal.position.y = 0.42; crystal.scale.y = 1.5;
      heart.add(crystal);
      const halo = haloSprite(0xffe7a8, 4.5);
      halo.position.y = 0.42;
      heart.add(halo);
      heart.visible = false;
      this.model.add(heart);
      this.heart = heart;
      stern.extra = { group: heart, glowMat: hm, halo, haloSize: 4.5, color: 0xffe9b8, light: new THREE.Vector3(0, 10, MAST_Z), anim: crystal, spin: true, animY: 0.42 };
      this.lanterns.push(stern);
    }
    for (const L of this.lanterns) { L.group.visible = false; root.add(L.group); }
    // An NPC boat casts no light of its own: a scene's light count is baked
    // into every shader, so lights that come and go would recompile them all.
    this.light = this.light2 = null;
    if (this.npc) return;
    this.light = new THREE.PointLight(0xffc070, 0, 40, 1.2);
    root.add(this.light);
    // second light for the bow lantern / masthead heart (always present so shaders don't recompile)
    this.light2 = new THREE.PointLight(0xffc070, 0, 40, 1.2);
    this.model.add(this.light2);
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
      this.model.add(grp);
      this.nests.push(grp);
    }
    // tier 4+: a brass telescope mounted on the nest rim
    const tube = (len, r, metal) => [
      part(new THREE.CylinderGeometry(r, r * 1.25, len, 10), metal, { rx: Math.PI / 2 }),
      part(new THREE.CylinderGeometry(r * 1.35, r * 1.35, len * 0.12, 10), '#3b2214', { z: len * 0.15, rx: Math.PI / 2 }),
      part(new THREE.TorusGeometry(r * 1.3, r * 0.25, 4, 12), GOLD, { z: len * 0.5 }),
      part(new THREE.TorusGeometry(r * 1.05, r * 0.2, 4, 12), GOLD, { z: -len * 0.5 }),
    ];
    const mount = decoMesh([
      ...tube(0.9, 0.06, BRASS).map((g) => g.translate(0, 0.42, 0.25).rotateX(-0.15)),
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), '#3b2214', { y: 0.22, z: 0.2 }),
    ], true);
    mount.position.set(0.42, 0.1, 0.15);
    mount.rotation.y = 0.5;
    mount.visible = false;
    this.nests[1].add(mount);
    this.nestScope = mount;
    // tier 5: an ornate long telescope on a tripod on the quarterdeck
    const legs = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.3;
      legs.push(part(new THREE.CylinderGeometry(0.025, 0.03, 1.25, 5), '#3b2214', { x: Math.cos(a) * 0.28, y: 0.58, z: Math.sin(a) * 0.28, rx: Math.sin(a) * 0.24, rz: -Math.cos(a) * 0.24 }));
      legs.push(part(new THREE.SphereGeometry(0.035, 5, 4), GOLD, { x: Math.cos(a) * 0.43, y: 0.02, z: Math.sin(a) * 0.43 }));
    }
    legs.push(part(new THREE.SphereGeometry(0.07, 8, 6), GOLD, { y: 1.18 }));
    legs.push(...tube(1.5, 0.075, GOLD).map((g) => g.rotateX(-0.22).translate(0, 1.3, 0.1)));
    this.deckScope = decoMesh(legs, true);
    this.deckScope.position.set(-0.85, 1.0, -2.2);
    this.deckScope.rotation.y = 0.35;
    this.deckScope.visible = false;
    this.model.add(this.deckScope);
  }

  buildWake() {
    this.wake = new Wake(this.scene);
    this.wakeMat = this.wake.material; // game.js feeds it the scene light
  }

  // An indexed grid of (u+1)*(v+1) vertices with uvs; positions are written every frame.
  makeSailGrid(nu, nv, swapUV) {
    const geo = new THREE.BufferGeometry();
    const n = (nu + 1) * (nv + 1);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      if (swapUV) { uv[k * 2] = j / nv; uv[k * 2 + 1] = i / nu; } else { uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv; }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    return geo;
  }

  applyUpgrades(levels, values) {
    const L = (k) => clamp(levels[k] || 0, 0, MAX_TIER);
    this.levels = { sail: L('sail'), hull: L('hull'), rudder: L('rudder'), keel: L('keel'), lantern: L('lantern'), spyglass: L('spyglass') };
    const lv = this.levels;
    this._values = values;
    // hull (tiers 4-5 also make the whole ship bigger)
    this.hullTiers.forEach((t, i) => { t.visible = i === lv.hull; });
    this.sizeScale = SIZE_SCALE[lv.hull];
    this.model.scale.setScalar(this.sizeScale);
    this.hasBowsprit = lv.hull >= 4;
    // sails & rig
    this.jib.visible = lv.sail >= 1;
    this.topsail.visible = lv.sail >= 4;
    this.pennant.mesh.visible = lv.sail >= 2;
    for (const p of this.extraPennants || []) p.mesh.visible = lv.sail >= 4;
    // helm
    this.tiller.visible = lv.rudder <= 1;
    this.rudderBlade.visible = lv.rudder >= 1;
    this.helm.visible = lv.rudder >= 2;
    this.wheels.forEach((w, i) => { w.visible = i === lv.rudder - 2; });
    this.binnacle.visible = lv.rudder >= 5;
    this.wheelR = lv.rudder >= 2 ? this.wheels[lv.rudder - 2].userData.R : 0.42;
    const ex = this.explorer, k = this.sizeScale;
    // only place the explorer at the helm while they're aboard (a story find
    // ashore, like the spyglass, applies upgrades too)
    const aboard = ex.root.parent === this.group;
    if (lv.rudder >= 2) { ex.setControl('wheel'); if (aboard) { ex.root.position.set(0, 1.0 * k, -3.0 * k); ex.root.rotation.y = 0; } }
    else { ex.setControl('tiller'); if (aboard) { ex.root.position.set(0.42 * k, 1.0 * k, -2.55 * k); ex.root.rotation.y = -0.25; } }
    // keel
    this.keelFin.visible = lv.keel >= 1;
    this.keelBulb.visible = lv.keel >= 2;
    this.runeBand.visible = lv.keel >= 3;
    this.runeMat.color.set(lv.keel >= 5 ? 0x3ff0d8 : 0x7ff6ff);
    this.keelBilge.visible = lv.keel >= 4;
    this.waterGlow.visible = lv.keel >= 5;
    // lantern
    this.lanterns.forEach((l, i) => {
      l.group.visible = i === lv.lantern;
      if (l.extra) l.extra.group.visible = i === lv.lantern;
    });
    this.activeLantern = this.lanterns[lv.lantern];
    if (this.light) {
      this.light.position.copy(this.activeLantern.light);
      this.light.color.set(this.activeLantern.color);
    }
    this.lanternMat = this.activeLantern.glowMat;
    // spyglass: belt spyglass, then a crow's nest, a mounted scope and a deck telescope
    ex.setSpyglass(lv.spyglass);
    this.nests[0].visible = lv.spyglass === 2;
    this.nests[1].visible = lv.spyglass >= 3;
    this.nestScope.visible = lv.spyglass >= 4;
    this.deckScope.visible = lv.spyglass >= 5;
    this.layoutRig();
    this.applyColors();
    this.applyDismast();

    this.maxHealth = values.hull;
    this.lanternRange = values.lantern;
  }

  /** Hull paint, sail cloth and flags: the tier's own colours, or the livery's where it names one. */
  applyColors() {
    const lv = this.levels, Lv = this.livery || {};
    const hs = HULL_STYLE[lv.hull];
    this.hullMat.color.set(Lv.hull || hs.hull);
    this.trimMat.color.set(Lv.trim || hs.trim);
    this.deckMat.color.set(Lv.deck || hs.deck);
    this.stripeMat.color.set(Lv.trim || '#3f7fd0');
    const cloth = Lv.sail || null;
    const mark = Lv.emblem || null;
    this.sailMat.map = sailTexture(lv.sail, false, cloth, mark);
    this.sailMat.needsUpdate = true;
    this.jibMat.map = sailTexture(lv.sail, true, cloth, mark);
    this.jibMat.needsUpdate = true;
    this.topMat.map = sailTexture(lv.sail, true, cloth, mark);
    this.topMat.needsUpdate = true;
    this.flagMat.color.set(Lv.flag || (lv.sail >= 3 ? GOLD : '#d64a3a'));
    this.pennant.mat.color.set(Lv.pennant || (lv.sail === 4 ? '#9c2f27' : lv.sail >= 3 ? GOLD : '#2f6fd0'));
    for (const p of this.extraPennants || []) p.mat.color.set(Lv.pennant || (lv.sail === 4 ? '#9c2f27' : GOLD));
    this.wreckClothMat?.color.set(cloth || SAIL_BASE[lv.sail]);
  }

  /**
   * Repaint the boat. livery: { hull, trim, deck, sail, flag, pennant, emblem } (CSS
   * hex, each optional; `sail` dyes every sail), or null for the tier's look.
   */
  setLivery(livery) {
    this.livery = livery || null;
    this.applyColors();
  }

  /** Mast gone by the board: a broken stub, no sails or rigging, a spar and canvas across the deck. */
  setDismasted(on) {
    on = !!on;
    if (on === this.dismasted) return;
    this.dismasted = on;
    if (on) { this.buildWreckage(); this.sailLevel = 0; }
    // un-breaking the mast is a full re-rig (applyUpgrades ends with applyDismast)
    if (!on && this._values) this.applyUpgrades(this.levels, this._values);
    else this.applyDismast();
  }

  /** Show or hide what a dismasting takes away. Runs after every applyUpgrades, which re-shows parts by tier. */
  applyDismast() {
    const on = this.dismasted;
    for (const m of [this.boom, this.rig, this.mainSheet, this.flag]) m.visible = !on;
    if (this.wreckage) this.wreckage.visible = on;
    if (!on) return;
    for (const m of [this.jib, this.jibSheet, this.jibSheetSlack, this.pennant.mesh, this.heart, ...this.nests,
      ...(this.extraPennants || []).map((p) => p.mesh)]) m.visible = false;
    this.mast.scale.y = this.mastInk.scale.y = STUB_H;
  }

  buildWreckage() {
    if (this.wreckage) return;
    const WOOD = '#7a5432', top = MAST_BASE + STUB_H;
    const parts = [];
    // splintered top of the stub
    for (const [x, z, h, r] of [[0.05, 0.03, 0.42, 0.06], [-0.05, 0.04, 0.3, 0.05], [0.0, -0.06, 0.24, 0.05], [0.06, -0.04, 0.16, 0.04]]) {
      parts.push(part(new THREE.ConeGeometry(r, h, 4), WOOD, { x, y: top + h / 2 - 0.04, z: MAST_Z + z, ry: x * 9 }));
    }
    // the rest of the mast: fallen aft and to starboard, its head over the side
    const a = V3(0.1, 1.5, MAST_Z - 0.35), b = V3(2.7, 0.9, -2.3); // resting on the rail
    const mid = a.clone().lerp(b, 0.5), len = a.distanceTo(b);
    const q = new THREE.Quaternion().setFromUnitVectors(_up, b.clone().sub(a).normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.12, len, 7), WOOD, { x: mid.x, y: mid.y, z: mid.z, rx: e.x, ry: e.y, rz: e.z }));
    parts.push(part(new THREE.ConeGeometry(0.12, 0.3, 4), WOOD, { x: a.x - 0.05, y: a.y + 0.04, z: a.z + 0.14, rx: 1.9, rz: 0.5 }));
    // the gaff, snapped off and lying across the foredeck
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.06, 2.3, 6), WOOD, { x: -0.25, y: 1.1, z: MAST_Z + 1.35, rx: Math.PI / 2, rz: 0.75 }));
    // tangled rigging trailing over the side
    parts.push(ropePart(V3(0.3, 1.25, MAST_Z - 0.2), V3(1.5, 0.95, -0.2), 0.2, 0.02));
    parts.push(ropePart(V3(1.25, 1.02, -0.9), V3(1.9, -0.2, -2.9), 0.25, 0.02));
    parts.push(ropePart(V3(-0.2, 1.3, MAST_Z + 0.2), V3(-1.25, 1.02, 1.9), 0.18, 0.02));
    const wood = decoMesh(parts, true);
    // sailcloth heaped round the stub and dragged over the rail with the mast
    const cloth = [];
    for (const [x, y, z, sx, sy, sz, ry] of [
      [0.25, 1.12, MAST_Z - 0.7, 0.95, 0.2, 0.75, 0.3], [0.85, 1.16, MAST_Z - 1.35, 0.8, 0.24, 0.6, -0.4],
      [-0.35, 1.1, MAST_Z - 0.15, 0.6, 0.16, 0.7, 0.9], [1.45, 0.98, -1.25, 0.6, 0.2, 0.75, 0.2],
      [1.9, 0.72, -1.8, 0.4, 0.42, 0.8, 0.5], [0.45, 1.3, MAST_Z - 1.0, 0.5, 0.2, 0.4, 1.2],
    ]) cloth.push(part(new THREE.SphereGeometry(1, 10, 6), '#ffffff', { x, y, z, sx, sy, sz, ry }));
    const clothGeo = mergeParts(cloth);
    this.wreckClothMat = toon(this.livery?.sail || SAIL_BASE[this.levels.sail], { vertexColors: true });
    const heap = new THREE.Mesh(clothGeo, this.wreckClothMat);
    const heapInk = new THREE.Mesh(clothGeo, thinInk);
    this.wreckage = new THREE.Group();
    this.wreckage.add(wood, heap, heapInk);
    this.model.add(this.wreckage);
  }

  /** Show or hide the whole boat (the model and its wake). */
  setVisible(on) {
    this.group.visible = !!on;
    this.wake.mesh.visible = !!on;
  }

  /** Take the boat out of the scene and free what it owns (shared caches and materials stay). */
  dispose() {
    this.explorer.dispose();
    this.scene.remove(this.group);
    this.scene.remove(this.wake.mesh);
    this.wake.mesh.geometry.dispose();
    this.wake.material.dispose();
    const shared = new Set([decoMat, thinInk, ropeMat]);
    const geos = new Set(), mats = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !o.isSprite) geos.add(o.geometry); // every sprite shares one geometry
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) if (!shared.has(m)) mats.add(m);
    });
    for (const g of geos) g.dispose();
    // textures made for this boat alone (sail and halo textures are shared caches)
    for (const m of [this.deckMat, this.runeMat, this.waterGlowMat]) m.map?.dispose();
    for (const m of mats) m.dispose();
  }

  layoutRig() {
    const lv = this.levels;
    this.sailH = SAIL_H[lv.sail];
    const sailTop = BOOM_Y + this.sailH + 0.08;
    let top = MAST_TOP[lv.sail];
    // the gaff topsail's head sits just under the masthead
    this.topHead = lv.sail >= 4 ? top - 0.75 : sailTop;
    this.nestY = (lv.sail >= 4 ? this.topHead : sailTop) + 0.55;
    if (lv.spyglass >= 2) top = Math.max(top, this.nestY + 1.0);
    const h = top - MAST_BASE;
    this.mast.scale.y = h; this.mastInk.scale.y = h;
    this.mastTop.set(0, top, MAST_Z);
    this.flag.position.set(0, top - 0.35, MAST_Z);
    this.pennant.mesh.position.set(0, top - 1.05, MAST_Z);
    for (const n of this.nests) n.position.set(0, this.nestY, MAST_Z);
    this.heart.position.set(0, top + 0.05, MAST_Z);
    if (this.lanterns[5].extra) this.lanterns[5].extra.light.set(0, top + 0.47, MAST_Z);
    if (lv.lantern === 5) this.flag.position.y = top - 0.6;

    // ---- forestay, jib geometry anchors
    this.tack = this.hasBowsprit ? V3(0, 1.77, 5.42) : V3(0, 1.12, 3.74);
    this.stayHead = V3(0, top - 0.5, MAST_Z + 0.08);
    const jibHeadY = Math.min(top - 1.0, BOOM_Y + this.sailH * 0.92);
    const t = (jibHeadY - this.tack.y) / (this.stayHead.y - this.tack.y);
    this.jibHead = this.tack.clone().lerp(this.stayHead, t);
    this.stayAxis = this.stayHead.clone().sub(this.tack).normalize();
    // clew (centred, before swinging): about 60% of the way from tack to mast, low over the deck
    this.clew0 = V3(0, 1.5 + (this.hasBowsprit ? 0.2 : 0), MAST_Z + 0.35 + (this.hasBowsprit ? 0.5 : 0));
    this.jibCleat = (side) => this._c.set(side * 1.0, 1.08, MAST_Z - 0.15);

    // ---- standing rigging, merged into one mesh
    for (const c of [...this.rig.children]) { this.rig.remove(c); c.geometry?.dispose(); }
    const R = [];
    const r = 0.02;
    // forestay (with a bobstay under the bowsprit)
    R.push(ropePart(this.tack, this.stayHead, 0, 0.024));
    if (this.hasBowsprit) R.push(ropePart(V3(0, 1.75, 5.4), V3(0, 0.25, 3.78), 0, 0.022));
    // shrouds: two per side from the hounds to chainplates on the rail
    const hounds = V3(0, top - 0.95, MAST_Z);
    const chain = [];
    for (const side of [-1, 1]) {
      const pair = [];
      for (const z of [MAST_Z + 0.25, MAST_Z - 0.75]) {
        const cp = V3(side * (halfW(z) + 0.12), 1.08, z);
        R.push(ropePart(V3(side * 0.1, hounds.y, MAST_Z), cp, 0, r));
        R.push(part(new THREE.BoxGeometry(0.05, 0.28, 0.1), BRASS, { x: cp.x, y: 0.98, z: cp.z }));
        pair.push(cp);
      }
      chain.push([side, pair]);
    }
    // ratlines between the shrouds (sail tier 3+)
    if (lv.sail >= 3) {
      for (const [side, [a, b]] of chain) {
        const ta = V3(side * 0.1, hounds.y, MAST_Z);
        for (let y = 1.55; y < hounds.y - 1.2; y += 0.42) {
          const fa = (y - a.y) / (ta.y - a.y), fb = (y - b.y) / (ta.y - b.y);
          const pa = a.clone().lerp(ta, fa), pb = b.clone().lerp(ta, fb);
          R.push(ropePart(pa, pb, 0.03, 0.012));
        }
      }
    }
    // twin backstays to the stern quarters
    for (const side of [-1, 1]) R.push(ropePart(V3(0, top - 0.3, MAST_Z), V3(side * 0.98, 1.12, -3.05), 0, r));
    // halyards running down the mast to cleats
    for (const side of [-1, 1]) {
      R.push(ropePart(V3(side * 0.13, top - 0.2, MAST_Z + 0.04), V3(side * 0.13, 1.25, MAST_Z + 0.04), 0, 0.012));
      R.push(part(new THREE.BoxGeometry(0.05, 0.04, 0.16), '#3b2214', { x: side * 0.16, y: 1.25, z: MAST_Z + 0.04 }));
    }
    // topsail halyard + gaff peak lift (tiers 4-5)
    if (lv.sail >= 4) R.push(ropePart(V3(0.05, top - 0.15, MAST_Z - 0.05), V3(0.05, this.topHead, MAST_Z - 0.05), 0, 0.012));
    // coiled ropes on deck
    R.push(...coilPart(0.45, 1.02, MAST_Z - 0.45, 0.2), ...coilPart(-0.45, 1.02, MAST_Z - 0.45, 0.18));
    R.push(...coilPart(0.75, 1.02, -1.95, 0.2), ...coilPart(-0.55, 1.02, 2.75, 0.17));
    const rigMesh = new THREE.Mesh(mergeParts(R), decoMat);
    rigMesh.frustumCulled = false;
    this.rig.add(rigMesh);

    // extra pennants on the backstays for the grand rigs
    if (!this.extraPennants) {
      this.extraPennants = [];
      for (const side of [-1, 1]) {
        const p = makeFlag(1.4, 0.3, true, GOLD);
        this.model.add(p.mesh); this.flags.push(p); this.extraPennants.push(p);
      }
    }
    this.extraPennants.forEach((p, i) => {
      const side = i ? 1 : -1;
      p.mesh.position.set(side * 0.55, top * 0.62, MAST_Z - 1.6);
      p.mesh.visible = lv.sail >= 4;
    });
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
    this.wake.reset();
  }

  /**
   * ctl: {steer, drive?}; wind: {angle, strength}; up: upgrade values.
   * Returns an array of collision events: {damage, kind}.
   */
  simulate(dt, ctl, wind, world, up) {
    const events = [];
    this.hitCooldown -= dt;
    this.rudder = damp(this.rudder, ctl.steer, 6, dt);
    // where the wind comes FROM, relative to the bow (positive = from port/left)
    this.relWind = wrapAngle(wind.angle + Math.PI - this.heading);
    this.efficiency = pointOfSail(this.relWind);
    // Thrust follows how much canvas is actually up (sailVis eases between
    // settings), so reefing or furling eases the drive off instead of cutting it.
    const sailF = clamp((this.sailVis - 0.06) / 0.94, 0, 1);
    const drive = ctl.drive ?? 1; // scales the sail's thrust (a boat in tow, a paced rival)
    let target = sailF * this.efficiency * wind.strength * 15 * up.sail * drive;
    if (this.sailLevel > 0) target = Math.max(target, 1.2 * sailF * drive);
    // Hull drag grows with speed: a fast boat sheds speed noticeably, but a
    // slow one coasts on for a good while (roughly 10-15 s to glide to a stop).
    const rate = target > this.speed ? 0.45 : 0.1 + Math.abs(this.speed) * 0.011;
    this.speed = damp(this.speed, target, rate, dt);
    const turnRate = (0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 8)) * 0.85 * up.rudder;
    this.heading -= this.rudder * turnRate * dt;
    this.speed *= 1 - Math.abs(this.rudder) * 0.08 * dt;

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
    const k = this.sizeScale;
    const probes = [[3.6, 0], [1.2, 1.3], [1.2, -1.3], [-2.9, 0.9], [-2.9, -0.9]];
    for (const [f0, r0] of probes) {
      const f = f0 * k, r = r0 * k;
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
    const rock = world.rockHit(this.pos.x + fx * 1.5 * k, this.pos.z + fz * 1.5 * k, 2.2 * k);
    if (rock) {
      let nx = this.pos.x - rock.x, nz = this.pos.z - rock.z;
      const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d;
      const into = -(fx * nx + fz * nz) * this.speed;
      const pen = rock.r + 3.6 * k - d;
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
    const K = this.sizeScale;
    const hb = waveHeight(x + fx * 3 * K, z + fz * 3 * K), hs = waveHeight(x - fx * 3 * K, z - fz * 3 * K);
    const hp = waveHeight(x - rx * 1.4 * K, z - rz * 1.4 * K), hst = waveHeight(x + rx * 1.4 * K, z + rz * 1.4 * K);
    const hc = (hb + hs + hp + hst) * 0.25;
    const lowRide = (1 - healthFrac) * 0.35;
    this.y = damp(this.y, hc - lowRide - this.sink, 8, dt);
    this.pitch = damp(this.pitch, -Math.atan2(hb - hs, 6 * K) * 0.8, 5, dt);
    const heelTarget = Math.sign(this.relWind) * [0, 0.5, 1][this.sailLevel] * this.efficiency * wind.strength * 0.16 * (1 - up.keel * 0.5)
      + this.rudder * Math.min(1, this.speed / 10) * 0.06;
    this.heel = damp(this.heel, heelTarget, 2, dt);
    this.roll = damp(this.roll, Math.atan2(hp - hst, 2.8 * K) * 0.7 + this.heel, 5, dt);
    this.group.position.set(x, this.y, z);
    this.group.rotation.set(this.pitch + this.sink * 0.05, this.heading, this.roll + this.sink * 0.12);

    // Sail trim and billow
    const sailTarget = [0.06, 0.55, 1][this.sailLevel];
    this.sailVis = damp(this.sailVis, sailTarget, 1.8, dt);
    const a = Math.abs(this.relWind);
    const boomMag = clamp((a - 0.45) * 0.55, 0.12, 1.45);
    this.boomAngle = damp(this.boomAngle, Math.sign(this.relWind || 1) * boomMag, 2.5, dt);
    this.boom.rotation.y = this.boomAngle;
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
    this.updateTopsail(t, side, billow);
    this.updateJib(t, side, wind);
    this.updateSheets(side);

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
      const R = this.wheelR, c = this.wheelCenter;
      const aL = 0.95 + wheelRot * 0.5, aR = -0.95 + wheelRot * 0.5;
      gripL = this._grip2.set(c.x + Math.sin(aL) * R, c.y + Math.cos(aL) * R, c.z).multiplyScalar(K);
      gripR = this._grip.set(c.x + Math.sin(aR) * R, c.y + Math.cos(aR) * R, c.z).multiplyScalar(K);
    } else {
      const phi = 0.5, L = 1.25;
      gripR = this._grip.set(Math.sin(tillerYaw) * Math.cos(phi) * L, 1.15 + Math.sin(phi) * L, -3.3 + Math.cos(tillerYaw) * Math.cos(phi) * L).multiplyScalar(K);
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
    if (this.light) {
      this.light.intensity = night * 14 * (0.9 + Math.sin(t * 7) * 0.05) * (this.levels.lantern === 0 ? 0.7 : 1);
      this.light.distance = this.lanternRange || 30;
    }
    const glowK = (0.75 + night * 0.25) * glowBoost.value;
    Lt.glowMat.color.set(Lt.color).multiplyScalar(glowK).offsetHSL(0, 0, night * 0.08);
    const animLamp = (E) => {
      if (E.halo) {
        E.halo.material.opacity = 0.25 + night * 0.75;
        E.halo.scale.setScalar((E.haloSize || 1.4) * (1 + night * 0.6) * (1 + Math.sin(t * 2.2) * 0.04));
      }
      if (E.anim) {
        if (E.spin) { E.anim.rotation.y = t * 1.2; E.anim.position.y = (E.animY ?? 2.32) + Math.sin(t * 1.8) * 0.05; }
        else E.anim.scale.set(1, 1 + Math.sin(t * 13) * 0.15, 1);
      }
    };
    animLamp(Lt);
    const X = Lt.extra;
    if (X) {
      X.glowMat.color.set(X.color).multiplyScalar(glowK).offsetHSL(0, 0, night * 0.08);
      animLamp(X);
      if (this.light2) {
        this.light2.position.copy(X.light);
        this.light2.color.set(X.color);
        this.light2.intensity = night * 12 * (0.92 + Math.sin(t * 5.3) * 0.04);
        this.light2.distance = (this.lanternRange || 30) * 0.8;
      }
    } else if (this.light2) this.light2.intensity = 0;
    if (this.runeBand.visible) {
      const pulse = this.levels.keel >= 5 ? 0.5 + 0.5 * Math.sin(t * 2.4) : 0.5 + 0.5 * Math.sin(t * 1.6);
      this.runeMat.opacity = 0.35 + 0.45 * pulse + night * 0.2;
    }
    if (this.waterGlow.visible) {
      this.waterGlowMat.opacity = (0.25 + 0.2 * Math.sin(t * 2.4 + 1) + night * 0.35) * (0.6 + 0.4 * Math.min(1, Math.abs(this.speed) / 10));
    }

    this.updateWake(dt, fx, fz);
  }

  // Gaff topsail: a triangle from the main's head edge up to the masthead, on the boom.
  updateTopsail(t, side, billow) {
    if (!this.topsail.visible) return;
    const vis = clamp((this.sailVis - 0.06) / 0.94, 0, 1);
    const H = this.sailH * this.sailVis;
    const Ay = H + 0.08, Cy = 0.45 * H + 0.08, Cz = -BOOM_LEN * 0.92;
    const By = Ay + (this.topHead - BOOM_Y - Ay) * vis;
    const p = this.topGeo.attributes.position;
    for (let j = 0; j <= TOP_V; j++) for (let i = 0; i <= TOP_U; i++) {
      const u = i / TOP_U, v = j / TOP_V;
      const ey = Ay + (Cy - Ay) * u, ez = Cz * u;
      const y = ey + (By - ey) * v, z = ez * (1 - v);
      const bx = side * billow * 0.45 * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v + 0.15)) * (1 - v * 0.6)
        + Math.sin(t * 8 + u * 5 + v * 4) * 0.03 * (1 - this.efficiency);
      p.setXYZ(j * (TOP_U + 1) + i, bx, y, z);
    }
    p.needsUpdate = true;
    this.topGeo.computeVertexNormals();
  }

  // Jib: luff on the forestay, clew swings around the stay to leeward, rolls up when furled.
  updateJib(t, side, wind) {
    if (!this.jib.visible) return;
    const T = this.tack, Hd = this.jibHead;
    const swing = this.boomAngle * 0.85;
    this._q.setFromAxisAngle(this.stayAxis, swing);
    const C = this._a.copy(this.clew0).sub(T).applyQuaternion(this._q).add(T);
    const vis = clamp(this.sailVis * 1.05, 0.05, 1);
    // leeward normal of the sail plane
    const e1 = this._b.copy(Hd).sub(T), e2 = this._c.copy(C).sub(T);
    const n = e1.clone().cross(e2).normalize();
    if (n.x * side < 0) n.negate();
    const bil = (0.12 + this.efficiency * 0.35) * wind.strength * vis;
    const p = this.jibGeo.attributes.position;
    for (let j = 0; j <= JIB_V; j++) for (let i = 0; i <= JIB_U; i++) {
      const u = i / JIB_U, v = (j / JIB_V) * vis;
      // luff point and leech point at this height
      const lx = T.x + (Hd.x - T.x) * u, ly = T.y + (Hd.y - T.y) * u, lz = T.z + (Hd.z - T.z) * u;
      const ex = C.x + (Hd.x - C.x) * u, ey = C.y + (Hd.y - C.y) * u, ez = C.z + (Hd.z - C.z) * u;
      const b = bil * Math.sin(Math.PI * (j / JIB_V)) * (1 - u) * 1.4 + Math.sin(t * 9 + u * 6 + v * 4) * 0.025 * (1 - this.efficiency) * v;
      p.setXYZ(j * (JIB_U + 1) + i, lx + (ex - lx) * v + n.x * b, ly + (ey - ly) * v + n.y * b, lz + (ez - lz) * v + n.z * b);
    }
    p.needsUpdate = true;
    this.jibGeo.computeVertexNormals();
    this.jibClew = this._jc || (this._jc = new THREE.Vector3());
    this.jibClew.set(T.x + (C.x - T.x) * vis, T.y + (C.y - T.y) * vis, T.z + (C.z - T.z) * vis);
  }

  // Running rigging: main sheet from the boom end, jib sheets from the clew.
  updateSheets(side) {
    const b = this.boomAngle, zl = -BOOM_LEN + 0.15;
    const end = this._a.set(zl * Math.sin(b), BOOM_Y - 0.06, MAST_Z + zl * Math.cos(b));
    setSeg(this.mainSheet, this._b.set(0, 1.04, MAST_Z - BOOM_LEN + 0.3), end);
    const jv = this.jib.visible;
    this.jibSheet.visible = this.jibSheetSlack.visible = jv;
    if (!jv || !this.jibClew) return;
    setSeg(this.jibSheet, this.jibCleat(side).clone(), this.jibClew);
    // the windward sheet hangs slack across the deck
    const w = this.jibCleat(-side).clone();
    const mid = this._b.copy(w).lerp(this.jibClew, 0.5); mid.y = Math.max(1.06, mid.y - 0.5);
    setSeg(this.jibSheetSlack, w, mid);
  }

  updateWake(dt, fx, fz) {
    const x = this.pos.x, z = this.pos.z;
    const k = this.sizeScale;
    this.wake.update(dt, x - fx * 2.9 * k, z - fz * 2.9 * k, x + fx * (this.hasBowsprit ? 3.5 : 3.2) * k, z + fz * (this.hasBowsprit ? 3.5 : 3.2) * k, fx, fz, this.speed);
  }
}
