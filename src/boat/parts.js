// Boat building blocks shared by the model, fittings and rig: dimensions and
// colours per tier, the hull outline, canvas textures (deck, sails, emblems,
// runes), decoration meshes, ropes and the figurehead.
import * as THREE from 'three';
import { toon, toonGradient, toonMaterial, outlineMaterial } from '../toon.js';
import { smoothstep } from '../util.js';
import { part, mergeParts } from '../explorer.js';

export const SAIL_U = 12, SAIL_V = 10;
export const JIB_U = 10, JIB_V = 7;     // along the luff, luff->leech
export const TOP_U = 8, TOP_V = 6;      // along the gaff, gaff->head
export const BOOM_Y = 1.55, BOOM_LEN = 3.1, MAST_Z = 0.9, MAST_BASE = 0.7;
export const SAIL_H = [6.2, 6.2, 6.9, 7.3, 7.6, 8.0];
export const MAST_TOP = [8.4, 8.4, 9.5, 9.9, 11.5, 12.3];
// Hull tiers 4-5 build a visibly bigger ship: the whole model scales up.
export const SIZE_SCALE = [1, 1, 1, 1, 1.12, 1.25];
export const MAX_TIER = 5;
export const SAIL_BASE = ['#e3d4b1', '#fbf8ef', '#fbf9f2', '#fff1cc', '#9c2f27', '#fffaf0'];
export const ROPE = '#5a4632';

export const HULL_STYLE = [
  { hull: '#8f5e2e', trim: '#cdb892', deck: '#c89b62' },
  { hull: '#7a4a22', trim: '#f2ead6', deck: '#d0a46a' },
  { hull: '#b8432f', trim: '#f5efe0', deck: '#d8ae74' },
  { hull: '#2e1f1a', trim: '#ffcf4a', deck: '#b88a55' },
  { hull: '#4a1d13', trim: '#f3e7c9', deck: '#c08a52' },   // mahogany galleon
  { hull: '#123c5c', trim: '#ffd75e', deck: '#cfa168' },   // royal flagship
];
export const GOLD = '#ffcf4a', BRASS = '#d9a441', COPPER = '#c8743a';

// ------------------------------------------------------------- hull outline
export function hullShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.15, -3.2); s.lineTo(1.15, -3.2);
  s.quadraticCurveTo(1.75, 0.6, 0, 3.8);
  s.quadraticCurveTo(-1.75, 0.6, -1.15, -3.2);
  return s;
}
export const SIDE = [];
for (let i = 0; i <= 64; i++) {
  const s = i / 64, a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
  SIDE.push([a * 1.15 + b * 1.75, a * -3.2 + b * 0.6 + c * 3.8]);
}
export function halfW(z) {
  if (z <= SIDE[0][1]) return SIDE[0][0];
  for (let i = 1; i < SIDE.length; i++) {
    if (SIDE[i][1] >= z) {
      const [x0, z0] = SIDE[i - 1], [x1, z1] = SIDE[i];
      return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0 || 1);
    }
  }
  return 0;
}
export const taper = (y) => 1 - smoothstep(0.7, -0.6, y) * 0.4;
// A point on the outside of the hull wall plus the yaw that faces outward.
export function sideAt(z, y, side, off) {
  const x = side * ((halfW(z) + 0.18) * taper(y) + off);
  const k = (halfW(z + 0.05) - halfW(z - 0.05)) / 0.1;
  const nx = side, nz = -k;
  return { x, y, z, yaw: Math.atan2(nx, nz) };
}
// offset a local (lx, ly, lz) by a side frame
export function onSide(S, lx, ly, lz) {
  const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
  return { x: S.x + lx * c + lz * s, y: S.y + ly, z: S.z - lx * s + lz * c };
}

// A vertical ribbon hugging the hull wall between y0 and y1.
export function bandGeo(y0, y1, off, uRepeat = 1) {
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
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let haloTex = null;
export function softHalo() {
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

export function deckTexture() {
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

export const sailTexCache = {};
// Compass-rose emblem, pre-squashed so it reads round on the tapered sail.
export function drawEmblem(g, S, H, { u = 0.36, v = 0.52, R = 1.05, ring = '#d4402e', inner = GOLD, a = '#d4402e', b = GOLD, fill = 'rgba(212,64,46,0.18)', points = 8 } = {}) {
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
export const WING_INK = '#1d1a22';
export function drawWing(g, S, H, { u = 0.37, v = 0.5, R = 1.35 } = {}) {
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
export function sailTexture(tier, plain = false, cloth = null, emblem = null) {
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

export function runeTexture() {
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
export function makeFlag(w, h, tri, color) {
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

export const decoMat = toonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
export const thinInk = outlineMaterial(0.025, 0x1b2233);

export function decoMesh(parts, outline = false) {
  const g = new THREE.Group();
  const geo = mergeParts(parts);
  g.add(new THREE.Mesh(geo, decoMat));
  if (outline) g.add(new THREE.Mesh(geo, thinInk));
  return g;
}

// ---- ropes: static ones are merged tubes, dynamic ones are unit cylinders re-aimed each frame
export const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
export function ropePart(a, b, sag = 0, r = 0.022, color = ROPE) {
  const curve = sag
    ? new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -sag, 0)), b)
    : new THREE.LineCurve3(a, b);
  return part(new THREE.TubeGeometry(curve, sag ? 8 : 1, r, 4, false), color);
}
export function coilPart(x, y, z, r = 0.2, color = ROPE) {
  const parts = [];
  for (let k = 0; k < 3; k++) parts.push(part(new THREE.TorusGeometry(r - k * 0.035, 0.028, 4, 14), color, { x, y: y + k * 0.045, z, rx: Math.PI / 2 }));
  return parts;
}
export const ropeMat = toonMaterial({ color: ROPE, gradientMap: toonGradient() });
export function segMesh(r = 0.022) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 5).translate(0, 0.5, 0), ropeMat);
  m.frustumCulled = false;
  return m;
}
export function setSeg(mesh, a, b) {
  mesh.position.copy(a);
  _d.subVectors(b, a);
  const L = _d.length() || 1e-3;
  mesh.scale.set(1, L, 1);
  mesh.quaternion.setFromUnitVectors(_up, _d.divideScalar(L));
}
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function figurehead(gold, winged = false) {
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
export const STUB_H = 1.7;
