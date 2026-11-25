// Grandfather's wreck as the first walkable level: a short, safe tutorial
// walk. Row ashore onto the shingle, walk up the beach beside the hull, jump
// up the rocks at the bow, climb aboard through the broken rail, walk down the
// deck, hop the caved-in planks (the holes are shallow, so you can always jump
// back out) and step into grandfather's cabin at the stern. A stern gallery
// drops you back onto the beach by the rowboat.
//
// Hand-built rather than generated. Authored in ship space (+z = towards the
// bow, x = across, y up, the sea at y = 0), then turned to the wreck's real
// heading so the compass, sun and swell line up with the sea outside.
// Follows the level contract in shapes.js, plus:
//   intro                        first toast on arrival
//   hints: [{ id, x, z, r, yMax?, text, touch }]   one-time toasts by place
//   spots: { table, chest }      story interactions in the cabin ({ x, y, z, r })
//   syncStory({ journal, chestOpen })   show what's still waiting in the cabin
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, propMaterial, thinOutline, PROPS } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { noise2, smoothstep } from '../util.js';
import { obox, cyl } from './shapes.js';
import { pieceParts, rowboatParts } from './pieces.js';

const C = {
  wood: '#6a4527', dark: '#3b2614', inner: '#553620', deck: '#9a7046', deck2: '#8a6238', rib: '#7a5333',
  sail: '#e9dcbc', red: '#c8322b', brass: '#c9a44a', paper: '#efe3c4', blanket: '#8a3f36', pillow: '#efe6d2',
  glass: '#2b3a44', crate: '#a07040', barrel: '#8a5a32', band: '#4a3423', rope: '#d9c08a', rug: '#6d4a6b',
  shingle: '#cdbf9f', shingle2: '#bcae8f', wet: '#a3967a', rock: '#8f877d', rock2: '#7d756b', seabed: '#b9a77a',
};

// ------------------------------------------------------------------ ground
const SEABED = -6;
function segD(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}
// a shingle spit along the port side, the shingle the hull is bedded in, and
// the rocks the bow ran up onto
const LAND = [
  { d: (x, z) => segD(x, z, -4, -19, -7.5, 14), r: 4.6, top: 1.0, fall: 5, tag: 'sand' },
  { d: (x, z) => segD(x, z, 0, -13, 0, 11), r: 3.4, top: 0.3, fall: 4.5, tag: 'sand' },
  { d: (x, z) => Math.hypot(x - 2.5, z - 18.5), r: 4.5, top: 1.6, fall: 2.6, tag: 'stone' },
];
function ground(x, z) {
  let h = SEABED + noise2(x * 0.15, z * 0.15, 3) * 0.6, tag = 'sand';
  for (const s of LAND) {
    const k = smoothstep(s.r, s.r + s.fall, s.d(x, z));
    const hs = s.top + (SEABED - s.top) * k + noise2(x * 0.35, z * 0.35, 7) * 0.1 * (1 - k);
    if (hs > h) { h = hs; tag = s.tag; }
  }
  return { h, tag };
}

// -------------------------------------------------------------- the hull
// The hull's long axis rises a little towards the bow, which is up on the rocks.
const PITCH = 0.055, Y0 = 3.905;          // hull centre line: y = Y0 + PITCH * z
const hullY = (z) => Y0 + PITCH * z;
const R_OUT = 3.3, R_IN = 3.12, HALF = 11.75; // hull radius, and half its length
// walkable decks, stern to bow: [z0, z1, top, xMin?]
const DECKS = {
  gallery: [-12.2, -11, 2.6], cabin: [-11, -5, 2.6], aft: [-5, -4.1, 2.6], island: [-2.9, -1.6, 2.6],
  waist: [-0.5, 3.5, 3.0], fore1: [3.5, 6.5, 3.3], fore2: [6.5, 9.5, 3.55], bow: [9.5, 12.2, 3.8],
};
const PITS = { aft: [-4.1, -2.9, 1.5], fore: [-1.6, -0.5, 1.9] }; // caved-in deck: shallow holes
const DW = 2.85;      // deck half-width
const NOTCH = [9.6, 11.7]; // the broken port rail at the bow, where you climb aboard

/** Swap each triangle's winding (and normals) so a surface shows from the inside. */
function flipped(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) {
    for (const a of [p, n]) for (let c = 0; c < 3; c++) { const t = a[i + 3 + c]; a[i + 3 + c] = a[i + 6 + c]; a[i + 6 + c] = t; }
  }
  for (let k = 0; k < n.length; k++) n[k] = -n[k];
  return g;
}
/** A part in hull space (centre line along z at y = 0), tilted onto the hull's line. */
function hullPart(geo, color, t) {
  const g = part(geo, color, t);
  g.rotateX(-PITCH);
  g.translate(0, Y0, 0);
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function hullParts() {
  const P = [];
  const shell = (z0, z1, th0 = -Math.PI / 2, th1 = Math.PI / 2) => {
    const L = z1 - z0, zc = (z0 + z1) / 2, segs = Math.max(4, Math.round(18 * (th1 - th0) / Math.PI));
    P.push(hullPart(new THREE.CylinderGeometry(R_OUT, R_OUT, L, segs, 1, true, th0, th1 - th0), C.wood, { rx: Math.PI / 2, z: zc }));
    P.push(hullPart(flipped(new THREE.CylinderGeometry(R_IN, R_IN, L, segs, 1, true, th0, th1 - th0)), C.inner, { rx: Math.PI / 2, z: zc }));
  };
  // the port rail is broken away at the bow: drop the top of that side
  shell(-HALF, NOTCH[0]);
  shell(NOTCH[0], NOTCH[1], -Math.PI / 2 + 0.42);
  shell(NOTCH[1], HALF);
  // bow cone and transom
  P.push(hullPart(new THREE.ConeGeometry(R_OUT, 4.4, 18, 1, true, -Math.PI / 2, Math.PI), C.wood, { rx: Math.PI / 2, z: HALF + 2.2 }));
  P.push(hullPart(flipped(new THREE.ConeGeometry(R_IN, 4.2, 18, 1, true, -Math.PI / 2, Math.PI)), C.inner, { rx: Math.PI / 2, z: HALF + 2.1 }));
  P.push(hullPart(new THREE.CircleGeometry(R_OUT, 18, Math.PI, Math.PI), C.dark, { ry: Math.PI, z: -HALF - 0.02 }));
  P.push(hullPart(new THREE.CircleGeometry(R_IN, 18, Math.PI, Math.PI), C.inner, { z: -HALF + 0.02 }));
  // gunwale caps along the rim, broken off at the notch
  for (const s of [-1, 1]) {
    const runs = s < 0 ? [[-HALF, NOTCH[0]], [NOTCH[1], HALF]] : [[-HALF, HALF]];
    for (const [z0, z1] of runs) P.push(hullPart(box(0.34, 0.2, z1 - z0), C.dark, { x: s * (R_OUT - 0.05), y: 0.05, z: (z0 + z1) / 2 }));
    // a dark strake low along each side, and the keel
    P.push(hullPart(box(0.12, 0.22, HALF * 2 - 1), C.dark, { x: s * 2.95, y: -1.55, z: 0, rz: s * 0.55 }));
  }
  P.push(hullPart(box(0.45, 0.5, HALF * 2 + 3), C.dark, { y: -R_OUT - 0.1, z: 1.2 }));
  // splintered plank stubs at both ends of the broken rail
  for (const [z, rz] of [[NOTCH[0] - 0.1, 0.5], [NOTCH[0] + 0.25, -0.3], [NOTCH[1] - 0.15, 0.4]]) {
    P.push(hullPart(box(0.14, 0.9, 0.22), C.dark, { x: -R_OUT + 0.05, y: -0.75, z, rz }));
  }
  // bowsprit, snapped short and pointing up at the rocks
  P.push(part(new THREE.CylinderGeometry(0.16, 0.24, 3.2, 7), C.dark, { y: hullY(HALF) + 1.0, z: HALF + 4.2, rx: 1.15 }));
  return P;
}

function deckParts() {
  const P = [];
  const planks = (z0, z1, top, x0 = -DW, x1 = DW, cA = C.deck, cB = C.deck2) => {
    const d = z1 - z0, n = Math.max(1, Math.round(d / 0.55));
    for (let i = 0; i < n; i++) {
      const w = x1 - x0 - (i % 3 === 1 ? 0.25 : 0);
      P.push(part(box(w, 0.14, d / n - 0.04), i % 2 ? cA : cB, { x: (x0 + x1) / 2 + (i % 3 === 1 ? 0.12 : 0), y: top - 0.07, z: z0 + (d / n) * (i + 0.5) }));
    }
  };
  for (const [k, [z0, z1, top]] of Object.entries(DECKS)) {
    if (k === 'gallery') planks(z0, z1, top, -2.4, 2.4);
    else if (k === 'bow') planks(z0, z1, top, -3.25, DW);
    else planks(z0, z1, top);
  }
  // risers where the deck steps up towards the bow
  for (const [z, lo, hi] of [[-0.5, 2.6, 3.0], [3.5, 3.0, 3.3], [6.5, 3.3, 3.55], [9.5, 3.55, 3.8]]) {
    P.push(part(box(DW * 2, hi - lo, 0.1), C.dark, { y: (lo + hi) / 2, z }));
  }
  // the caved-in holes: dark planks at the bottom and dark faces all round
  for (const [z0, z1, floor] of Object.values(PITS)) {
    planks(z0, z1, floor, -2.5, 2.5, '#5a3b22', '#4e321c');
    for (const [z, top] of [[z0, z0 < -3 ? 2.6 : 2.6], [z1, z1 > -1 ? 3.0 : 2.6]]) {
      P.push(part(box(DW * 2, top - floor, 0.12), C.inner, { y: (floor + top) / 2, z: z + (z === z0 ? 0.06 : -0.06) }));
    }
    for (const s of [-1, 1]) P.push(part(box(0.24, 2.6 - floor + 0.4, 0.3), C.rib, { x: s * 2.45, y: (floor + 2.8) / 2, z: (z0 + z1) / 2, rz: s * 0.25 }));
    // splintered plank ends sticking out over the hole
    P.push(part(box(0.5, 0.1, 0.4), C.deck2, { x: -1.6, y: 2.56, z: z0 + 0.15, rx: 0.25 }));
    P.push(part(box(0.4, 0.1, 0.35), C.deck, { x: 1.9, y: 2.56, z: z1 - 0.15, rx: -0.2 }));
  }
  // mast stump with a scrap of red pennant
  P.push(part(new THREE.CylinderGeometry(0.36, 0.42, 4.6, 9), C.dark, { y: 3.0 + 2.3, z: 1.5 }));
  P.push(part(new THREE.ConeGeometry(0.44, 0.6, 7), '#d9c7a0', { y: 7.8, z: 1.5, rx: 0.5 }));
  P.push(part(box(0.06, 0.7, 1.3), C.red, { y: 7.0, z: 2.2, ry: 0.15, rx: 0.1 }));
  P.push(part(new THREE.TorusGeometry(0.55, 0.08, 5, 12), C.rope, { y: 3.08, x: -0.9, z: 2.6, rx: Math.PI / 2 }));
  // torn sail slumped over the starboard rail
  P.push(part(box(2.6, 0.08, 3.4, 3, 1, 3), C.sail, { x: 3.2, y: 3.6, z: 1.2, rz: -1.05, ry: 0.1 }));
  // a barrel and a crate on the foredeck (you can hop onto them)
  barrelParts(P, 2.0, 3.3, 5.0);
  P.push(part(box(0.95, 0.95, 0.95), C.crate, { x: -1.9, y: 3.3 + 0.475, z: 4.6, ry: 0.35 }));
  P.push(part(box(1.0, 0.06, 1.0), '#7a5030', { x: -1.9, y: 3.3 + 0.96, z: 4.6, ry: 0.35 }));
  return P;
}

function barrelParts(P, x, y, z) {
  P.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10), C.barrel, { x, y: y + 0.45, z }));
  for (const dy of [0.18, 0.72]) P.push(part(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 10), C.band, { x, y: y + dy, z }));
}

function cabinParts() {
  const P = [];
  const F = 2.6, TOP = CABIN_TOP, H = TOP - F;
  // deckhouse walls (side windows are dark panes with frames)
  for (const s of [-1, 1]) {
    P.push(part(box(0.2, H, 6), C.wood, { x: s * 2.95, y: F + H / 2, z: -8 }, { c2: C.dark, split: 0.15 }));
    for (const z of [-9.4, -6.6]) {
      P.push(part(box(0.06, 0.7, 0.9), C.glass, { x: s * 3.06, y: F + 1.5, z }));
      P.push(part(box(0.08, 0.86, 0.12), C.dark, { x: s * 3.07, y: F + 1.5, z: z - 0.5 }), part(box(0.08, 0.86, 0.12), C.dark, { x: s * 3.07, y: F + 1.5, z: z + 0.5 }));
    }
  }
  // front wall with the door; back wall opening onto the stern gallery
  for (const [z, door] of [[-5, 0.75], [-11, 1.0]]) {
    const w = DW + 0.2 - door;
    for (const s of [-1, 1]) P.push(part(box(w, H, 0.2), C.wood, { x: s * (door + w / 2), y: F + H / 2, z }, { c2: C.dark, split: 0.15 }));
    P.push(part(box(door * 2, TOP - LINTEL, 0.2), C.wood, { y: (TOP + LINTEL) / 2, z }));
    P.push(part(box(door * 2 + 0.3, 0.12, 0.3), C.dark, { y: LINTEL, z }));
  }
  // the storm tore the roof off: only its beams are left (and the camera can look in)
  for (const z of [-10.3, -7.9]) P.push(part(box(6.4, 0.2, 0.22), C.dark, { y: TOP + 0.1, z }));
  P.push(part(box(3.2, 0.2, 0.22), C.dark, { x: -1.6, y: TOP + 0.1, z: -5.7 }));
  P.push(part(box(1.4, 0.18, 0.2), C.dark, { x: 2.4, y: TOP + 0.02, z: -5.7, rz: -0.35 }));
  for (const [x, z, w] of [[-2.3, -9.9, 1.4], [2.1, -10.7, 1.0]]) P.push(part(box(w, 0.08, 0.55), C.wood, { x, y: TOP + 0.24, z }));
  // chart table (the journal and spyglass lie on it until found)
  const T = SPOTS.table;
  P.push(part(box(1.4, 0.1, 1.0), C.deck, { x: T.x, y: 3.45, z: T.z }));
  for (const [dx, dz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) P.push(part(box(0.1, 0.85, 0.1), C.dark, { x: T.x + dx, y: F + 0.42, z: T.z + dz }));
  P.push(part(box(0.9, 0.012, 0.65), C.paper, { x: T.x + 0.15, y: 3.51, z: T.z + 0.05, ry: 0.12 }));
  P.push(part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), '#2a2430', { x: T.x - 0.5, y: 3.55, z: T.z - 0.3 }));
  P.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 6), C.pillow, { x: T.x + 0.55, y: 3.58, z: T.z - 0.35 }));
  // a chair, pushed back
  P.push(part(box(0.5, 0.08, 0.5), C.deck2, { x: T.x + 0.2, y: F + 0.5, z: T.z + 0.95, ry: 0.3 }));
  P.push(part(box(0.5, 0.6, 0.08), C.deck2, { x: T.x + 0.12, y: F + 0.85, z: T.z + 1.2, ry: 0.3 }));
  // grandfather's bunk; the chest is pulled half out from under it
  P.push(part(box(1.1, 0.25, 2.3), C.deck2, { x: 2.3, y: 3.05, z: -8.6 }));
  P.push(part(box(1.0, 0.16, 2.1), C.blanket, { x: 2.3, y: 3.24, z: -8.5 }));
  P.push(part(box(0.7, 0.16, 0.45), C.pillow, { x: 2.35, y: 3.32, z: -9.45 }));
  for (const dz of [-1.05, 1.05]) P.push(part(box(0.1, 0.5, 0.1), C.dark, { x: 1.82, y: F + 0.25, z: -8.6 + dz }));
  // a shelf of books by the gallery door, a rug and a hanging lamp
  P.push(part(box(1.3, 0.08, 0.3), C.dark, { x: -1.95, y: 4.2, z: -10.75 }));
  ['#7a2e2a', '#2e4a6a', '#5a6a2e', '#7a5a2a', '#4a2e5a'].forEach((c, i) => P.push(part(box(0.14, 0.34 + (i % 2) * 0.06, 0.24), c, { x: -2.45 + i * 0.2, y: 4.42, z: -10.75, rz: i === 4 ? 0.3 : 0 })));
  P.push(part(new THREE.CylinderGeometry(1.3, 1.3, 0.02, 16), C.rug, { y: F + 0.01, z: -7.8, sx: 1, sz: 0.7 }));
  P.push(part(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), C.dark, { x: LAMP.x, y: TOP - 0.17, z: LAMP.z }));
  P.push(part(box(0.22, 0.3, 0.22), C.brass, { x: LAMP.x, y: TOP - 0.5, z: LAMP.z }));
  // stern gallery rails, open in the middle where you can drop to the beach
  for (const s of [-1, 1]) {
    P.push(part(box(0.1, 0.8, 1.2), C.dark, { x: s * 2.35, y: F + 0.4, z: -11.6 }));
    P.push(part(box(1.4, 0.8, 0.1), C.dark, { x: s * 1.7, y: F + 0.4, z: -12.15 }));
    P.push(part(box(0.12, 0.14, 0.9), C.deck2, { x: s * 1.0, y: F + 0.2, z: -12.5, rx: 0.9 })); // the broken bit hanging down
  }
  P.push(part(box(4.9, 0.25, 1.3), C.dark, { y: F - 0.25, z: -11.6 }));
  return P;
}

// ----------------------------------------------------------- the beach
function rockParts() {
  const P = [];
  // the rock the bow leans on, with stones to climb (stone pieces reach down into the sand)
  P.push(...pieceParts({ kind: 'block', carved: true, cx: SHELF.cx, cz: SHELF.cz, hx: SHELF.hx, hz: SHELF.hz, top: SHELF.top, base: -1, rot: 0 }));
  for (const b of BOULDERS) P.push(...pieceParts({ kind: 'stone', cx: b.x, cz: b.z, r: b.r, top: b.top, rot: 0 }));
  return P;
}
const SHELF = { cx: -4.7, cz: (NOTCH[0] + NOTCH[1]) / 2, hx: 1.5, hz: (NOTCH[1] - NOTCH[0]) / 2, top: 3.6 };
const BOULDERS = [{ x: -6.8, z: 14.0, r: 1.0, top: 1.85 }, { x: -5.0, z: 12.75, r: 1.0, top: 2.75 }];
const SPOTS = { table: { x: -1.9, z: -7.6 }, chest: { x: 1.35, z: -8.75 } };
// The deckhouse is low and roofless so the follow camera can see in over its walls.
const CABIN_TOP = 4.7, LINTEL = 4.5;
const LAMP = { x: 2.3, z: -8.2 }; // hangs over the bunk, out of the way

function terrainMesh() {
  const X0 = -26, X1 = 26, Z0 = -32, Z1 = 30, S = 0.75;
  const nx = Math.round((X1 - X0) / S) + 1, nz = Math.round((Z1 - Z0) / S) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  const cs = Object.fromEntries(['shingle', 'shingle2', 'wet', 'rock', 'rock2', 'seabed'].map((k) => [k, new THREE.Color(C[k])]));
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * S, z = Z0 + j * S, k = j * nx + i;
    const { h, tag } = ground(x, z);
    hs[k] = h;
    pos[k * 3] = x; pos[k * 3 + 1] = Math.max(h, -7); pos[k * 3 + 2] = z;
    const n = noise2(x * 0.5, z * 0.5, 4);
    if (h < -0.4) tmp.copy(cs.seabed);
    else if (tag === 'stone' && h > 0.3) tmp.copy(cs.rock).lerp(cs.rock2, 0.5 + 0.5 * Math.sin(h * 2.1 + n * 2));
    else if (h < 0.35) tmp.copy(cs.wet);
    else tmp.copy(n > 0.1 ? cs.shingle2 : cs.shingle);
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (hs[a] < -5 && hs[b] < -5 && hs[c] < -5 && hs[d] < -5) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, toonMaterial({ vertexColors: true, gradientMap: toonGradient() }, { rim: false }));
  m.name = 'terrain';
  return m;
}

// ---------------------------------------------------------- colliders
// An axis-aligned box in ship space as an obox (it turns with the ship).
const B = (x0, x1, y0, y1, z0, z1, tag = 'wood') => obox((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, 0, tag);

function shipColliders() {
  const out = [];
  for (const [k, [z0, z1, top]] of Object.entries(DECKS)) {
    if (k === 'gallery') out.push(B(-2.4, 2.4, top - 0.15, top, z0, z1));
    else out.push(B(k === 'bow' ? -3.3 : -DW, DW, 0, top, z0, z1));
  }
  for (const [z0, z1, floor] of Object.values(PITS)) out.push(B(-DW, DW, 0, floor, z0, z1));
  // hull sides: as high as the rail, except the deckhouse (to the roof) and the broken bit at the bow
  const sides = [[-11, -5, CABIN_TOP], [-5, -0.5], [-0.5, 3.5], [3.5, 6.5], [6.5, NOTCH[0]], [NOTCH[0], 12.2]];
  for (const [z0, z1, top] of sides) {
    for (const s of [-1, 1]) {
      const t = top ?? (s < 0 && z0 === NOTCH[0] ? 3.4 : hullY(z1) + 0.05);
      out.push(B(s < 0 ? -3.3 : DW, s < 0 ? -DW : 3.3, 0, t, z0, z1));
    }
  }
  out.push(B(-2.95, 2.95, 0, 4.6, 12.2, 12.5)); // inside of the bow
  // cabin: front wall with a door, back wall with the gallery door, half a roof
  for (const [z, door] of [[-5, 0.75], [-11, 1.0]]) {
    for (const s of [-1, 1]) out.push(B(s < 0 ? -3.05 : door, s < 0 ? -door : 3.05, 2.6, CABIN_TOP, z - 0.1, z + 0.1));
    out.push(B(-door, door, LINTEL, CABIN_TOP, z - 0.1, z + 0.1));
  }
  // furniture
  const T = SPOTS.table;
  out.push(B(T.x - 0.7, T.x + 0.7, 2.6, 3.5, T.z - 0.5, T.z + 0.5));
  out.push(B(1.75, 2.85, 2.6, 3.32, -9.75, -7.45));
  out.push(B(SPOTS.chest.x - 0.28, SPOTS.chest.x + 0.28, 2.6, 3.05, SPOTS.chest.z - 0.4, SPOTS.chest.z + 0.4));
  // gallery rails (not the middle)
  for (const s of [-1, 1]) {
    out.push(B(s < 0 ? -2.45 : 2.25, s < 0 ? -2.25 : 2.45, 2.6, 3.4, -12.2, -11));
    out.push(B(s < 0 ? -2.4 : 1.0, s < 0 ? -1.0 : 2.4, 2.6, 3.4, -12.2, -12.1));
  }
  // mast stump, barrel, crate
  out.push(cyl(0, 1.5, 0.42, 3.0, 7.6, 'wood'));
  out.push(cyl(2.0, 5.0, 0.44, 3.3, 4.2, 'wood'));
  out.push(obox(-1.9, 3.3 + 0.48, 4.6, 0.48, 0.48, 0.48, 0.35, 'wood'));
  // rocks: the shelf by the bow, the stones up to it, the big stack
  out.push(B(SHELF.cx - SHELF.hx, SHELF.cx + SHELF.hx, -1, SHELF.top, SHELF.cz - SHELF.hz, SHELF.cz + SHELF.hz, 'stone'));
  for (const b of BOULDERS) out.push(cyl(b.x, b.z, b.r, -1, b.top, 'stone'));
  out.push(cyl(4.5, 21.5, 3.1, -2, 8, 'stone'));
  return out;
}

// -------------------------------------------------------------- level
/**
 * Build the walkable wreck. W is world.wreck ({ x, z, heading, ... }).
 * opts: { quality }
 */
export function buildWreckLevel(W, opts = {}) {
  const th = W.heading || 0, cs = Math.cos(th), sn = Math.sin(th);
  // ship space → level space (same rotation as group.rotation.y = th)
  const toL = (x, z) => ({ x: x * cs + z * sn, z: -x * sn + z * cs });
  const toS = (x, z) => ({ x: x * cs - z * sn, z: x * sn + z * cs });
  const P = (x, y, z, extra = {}) => ({ ...toL(x, z), y, ...extra });

  const group = new THREE.Group();
  group.name = 'ashore:wreck';
  group.rotation.y = th;
  const own = [];

  const terrain = terrainMesh();
  group.add(terrain);
  own.push(terrain.geometry, terrain.material);

  // rowboat at the water's edge astern (towards your ship), +x out to sea
  let rz = -19;
  while (rz > -30 && ground(-4, rz).h > 0.25) rz -= 0.25;
  const rowboat = { x: -4, y: Math.max(0, ground(-4, rz + 0.6).h), z: rz + 0.6, rot: Math.PI / 2 };

  const parts = [...hullParts(), ...deckParts(), ...cabinParts(), ...rockParts(), ...rowboatParts(rowboat)];
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  const ship = new THREE.Mesh(merged, propMaterial), outline = new THREE.Mesh(merged, thinOutline);
  ship.name = 'wreck';
  group.add(ship, outline);
  own.push(merged);

  // shared props: the rock stack the bow ran onto, boulders and driftwood
  const shared = [];
  const prop = (name, x, y, z, s, ry = 0, sy = s) => {
    if (!PROPS[name]) return;
    const m = new THREE.Mesh(PROPS[name], propMaterial);
    m.position.set(x, y, z); m.scale.set(s, sy, s); m.rotation.y = ry;
    const o = new THREE.Mesh(PROPS[name], thinOutline);
    o.position.copy(m.position); o.scale.copy(m.scale); o.rotation.copy(m.rotation);
    group.add(m, o);
    shared.push(m, o);
  };
  prop('seaStack', 4.5, -2, 21.5, 3.2, 0.4, 10);
  for (const [x, z, s, ry] of [[1, 15.5, 1.6, 0.3], [6.5, 17, 1.9, 1.2], [-0.5, 20.5, 1.4, 2.1], [7.5, 21, 1.2, 0.7], [3.5, 13.8, 1.1, 2.6], [-9.5, 6, 0.9, 0.4], [-10.5, -6, 0.8, 1.9]]) {
    prop('rock', x, ground(x, z).h - 0.25, z, s, ry);
  }
  for (const [x, z, ry] of [[-6.2, -20.5, 0.4], [-2.2, -21.2, 1.1]]) prop('barrel', x, ground(x, z).h - 0.05, z, 0.55, ry);
  prop('crate', -6.6, ground(-6.6, -18).h - 0.05, -18, 0.6, 0.5);

  // what's still waiting in the cabin: his journal and spyglass, and the chest
  const T = SPOTS.table, K = SPOTS.chest;
  const findGeo = merge2([
    part(box(0.42, 0.06, 0.3), '#5b3a26', { x: T.x - 0.15, y: 3.53, z: T.z + 0.1, ry: -0.2 }),
    part(box(0.36, 0.02, 0.26), C.paper, { x: T.x - 0.15, y: 3.57, z: T.z + 0.1, ry: -0.2 }),
    part(new THREE.CylinderGeometry(0.045, 0.06, 0.55, 8), C.brass, { x: T.x + 0.35, y: 3.56, z: T.z + 0.15, rz: Math.PI / 2, ry: 0.5 }),
  ]);
  own.push(findGeo);
  const finds = new THREE.Group();
  finds.add(new THREE.Mesh(findGeo, propMaterial), new THREE.Mesh(findGeo, thinOutline));
  group.add(finds);
  let chest = null;
  if (PROPS.chest) {
    chest = new THREE.Group();
    chest.add(new THREE.Mesh(PROPS.chest, propMaterial), new THREE.Mesh(PROPS.chest, thinOutline));
    chest.position.set(K.x, 2.6, K.z);
    chest.rotation.y = -Math.PI / 2;
    chest.scale.setScalar(0.5);
    group.add(chest);
  }
  // the hanging lamp glows a little, day or night
  const lamp = new THREE.PointLight(0xffc878, opts.quality === 'low' ? 0 : 2.5, 7, 1.5);
  lamp.position.set(LAMP.x, CABIN_TOP - 0.55, LAMP.z);
  group.add(lamp);

  // ---- colliders, turned into level space
  const colliders = shipColliders().map((c) => {
    if (c.type === 'cyl') { const p = toL(c.x, c.z); return { ...c, x: p.x, z: p.z }; }
    const p = toL(c.c[0], c.c[2]);
    return { ...c, c: [p.x, c.c[1], p.z], rot: c.rot + th };
  });
  const rb = toL(rowboat.x, rowboat.z);
  colliders.push(obox(rb.x, rowboat.y + 0.2, rb.z, 1.7, 0.25, 0.7, rowboat.rot + th, 'wood'));

  // ---- route markers (ship space → level space)
  const sp = { x: -3.0, z: rowboat.z + 3.6 };
  const spawn = P(sp.x, ground(sp.x, sp.z).h, sp.z, { yaw: th });
  const exit = P(rowboat.x, rowboat.y, rowboat.z, { r: 2.8 });
  const checkpoints = [
    P(SHELF.cx - 0.9, SHELF.top, SHELF.cz - 0.4, { id: 'cp0' }),
    P(-2.2, DECKS.waist[2], 2.9, { id: 'cp1' }),
  ];
  const coins = [];
  const coin = (x, y, z, value = 1) => coins.push(P(x, y, z, { id: 'c' + coins.length, value }));
  for (const z of [-15, -10.5, -6, -1.5, 3, 7.5]) {
    const x = -4 - 3.5 * (z + 19) / 33 - 0.6;
    coin(x, ground(x, z).h, z);
  }
  for (const b of BOULDERS) coin(b.x, b.top, b.z);
  coin(SHELF.cx + 0.4, SHELF.top, SHELF.cz + 0.3);
  coin(0.2, DECKS.bow[2], 11);
  coin(-1.0, DECKS.fore2[2], 8);
  coin(1.0, DECKS.fore1[2], 5.6);
  coin(-1.2, DECKS.waist[2], 0.6);
  coin(0, DECKS.island[2], -2.25);
  coin(1.2, PITS.fore[2], -1.05, 2);
  coin(1.0, PITS.aft[2], -3.5, 2);
  coin(0, DECKS.gallery[2], -11.6);
  const caches = [P(-1.7, PITS.aft[2], -3.5, { id: 'g0', value: 20 })];

  const level = {
    group,
    colliders,
    groundAt: (x, z) => { const s = toS(x, z); const h = ground(s.x, s.z).h; return h < -0.55 ? -Infinity : h; },
    groundTag: (x, z) => { const s = toS(x, z); return ground(s.x, s.z).tag; },
    waterY: 0,
    bounds: { r: 31 },
    spawn,
    exit,
    checkpoints,
    coins,
    caches,
    chests: [],
    summit: P(0, DECKS.cabin[2], -8),
    intro: null, // set by Ashore (depends on touch)
    hints: [
      { id: 'jump', ...P(-7.6, 0, 12.6), r: 3.0, text: 'Press Space to jump up the rocks', touch: 'Tap ▲ to jump up the rocks' },
      { id: 'gap', ...P(0, 0, 0.5), r: 1.7, yMin: 2.8, text: 'The deck has caved in. Jump across the holes!', touch: 'The deck has caved in. Jump across the holes!' },
      { id: 'pit', ...P(0, 0, -2.3), r: 2.6, yMax: 2.2, text: "Just a little drop. Jump back out!", touch: "Just a little drop. Jump back out!" },
      { id: 'cabin', ...P(0, 0, -6.2), r: 1.5, yMin: 2.4, text: "Grandfather's cabin. Look around!", touch: "Grandfather's cabin. Look around!" },
    ],
    spots: {
      table: P(T.x, 2.6, T.z, { r: 1.9 }),
      chest: P(K.x, 2.6, K.z, { r: 1.7 }),
    },
    syncStory({ journal = false, chestOpen = false } = {}) {
      finds.visible = journal;
      if (chest) chest.rotation.x = chestOpen ? -0.15 : 0;
    },
    dispose() {
      group.removeFromParent();
      for (const o of own) o.dispose();
      lamp.dispose?.();
    },
  };
  return level;
}

function merge2(parts) {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}
