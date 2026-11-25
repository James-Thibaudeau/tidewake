// Grandfather's wreck. She broke her back on a reef just past Port Haven: the
// bow is jammed up on the rocks, and the stern (with his cabin) tore away,
// swung round and settled lower in the water. One model of her (ship, reef,
// rocks) is shared by the sea view and the walkable level, so what you see
// from the boat is what you climb aboard.
//
// The walk is the first ashore level, a short, safe tutorial: row into the
// pebble cove, follow the reef up beside the hull, jump the stones onto the
// rock at the bow, climb aboard through the broken rail, walk down the deck,
// hop the caved-in hole, cross the torn planking that still hangs across the
// break and step into grandfather's cabin. The stern gallery drops you back
// onto the reef by the rowboat. Falling off the planking only means a splash
// and a walk back from the last lantern.
//
// Authored in ship space (+z = towards the bow, x = across, y up, the sea at
// y = 0); the walkable level turns it to the wreck's real heading so the
// compass, sun and swell line up with the sea outside. The stern section is
// authored where it used to be and moved by STERN.
// Follows the level contract in shapes.js, plus:
//   hints: [{ id, x, z, r, yMin?, yMax?, text, touch }]   one-time toasts by place
//   spots: { table, chest }      story interactions in the cabin ({ x, y, z, r })
//   syncStory({ journal, chestOpen })   show what's still waiting in the cabin
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, propMaterial, thinOutline, PROPS } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { noise2, smoothstep, clamp } from '../util.js';
import { obox, cyl } from './shapes.js';
import { pieceParts, rowboatParts } from './pieces.js';

const C = {
  wood: '#6a4527', dark: '#3b2614', inner: '#553620', deck: '#9a7046', deck2: '#8a6238', rib: '#7a5333',
  sail: '#e9dcbc', red: '#c8322b', brass: '#c9a44a', paper: '#efe3c4', blanket: '#8a3f36', pillow: '#efe6d2',
  glass: '#2b3a44', crate: '#a07040', barrel: '#8a5a32', band: '#4a3423', rope: '#d9c08a', rug: '#6d4a6b',
  weed: '#56613f', house: '#8a623c', paint: '#bfa56c', trim: '#e3d6b4', torn: '#24160c',
  shingle: '#a89d86', shingle2: '#968b76', wet: '#4a453f', weedRock: '#4b5536',
  rock: '#6f675e', rock2: '#5b544d', reef: '#4e4741', reef2: '#3f3934', seabed: '#7d7559',
};

// ------------------------------------------------------------- the break
// The fore section keeps everything from BRK_F forward; the stern section is
// everything aft of BRK_S, moved by STERN (about its front edge). The gap
// between them is open water over the reef.
const BRK_F = -2.9, BRK_S = -4.1, BRK_MID = (BRK_F + BRK_S) / 2;
const STERN = { dx: 2.2, dy: -1.25, dz: -3.8, yaw: 0.34, pitch: -0.04, roll: -0.2 /* at sea only */ };
function sternMatrix(roll = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(STERN.pitch, STERN.yaw, roll, 'YXZ'));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(STERN.dx, STERN.dy, BRK_S + STERN.dz), q, new THREE.Vector3(1, 1, 1));
  return m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -BRK_S));
}
const STERN_M = sternMatrix();
const _v = new THREE.Vector3();
/** Where a point of the stern section (as authored) ended up. */
function sternPt(x, y, z) {
  _v.set(x, y, z).applyMatrix4(STERN_M);
  return { x: _v.x, y: _v.y, z: _v.z };
}
/** Split a z-run of the hull at the break. */
const cut = (z0, z1) => [[z0, Math.min(z1, BRK_S)], [Math.max(z0, BRK_F), z1]].filter(([a, b]) => b - a > 0.05);

// ------------------------------------------------------------------ ground
const SEABED = -6;
function segD(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}
// the reef's spine runs along the port side from the cove to the bow
const REEF = { ax: -6, az: -19, bx: -7.5, bz: 14 };
const reefX = (z) => REEF.ax + ((REEF.bx - REEF.ax) * (z - REEF.az)) / (REEF.bz - REEF.az);
const S0 = sternPt(0, 0, BRK_S - 0.5), S1 = sternPt(0, 0, -11.5), G0 = sternPt(0, 0, -12.9);
const LAND = [
  // the reef she struck: worn rock, lower towards the stern
  { d: (x, z) => segD(x, z, REEF.ax, REEF.az, REEF.bx, REEF.bz), r: 4.4, fall: 4.5, tag: 'stone', rough: 0.3,
    top: (z) => 1.0 - 0.35 * clamp((-9 - z) / 6, 0, 1) },
  // the rock the fore section's keel is jammed on, higher towards the bow
  { d: (x, z) => segD(x, z, 0, BRK_F + 0.7, 0, 12), r: 3.4, fall: 4.5, tag: 'stone', rough: 0.25, top: (z) => 0.3 + clamp((z + 4) * 0.06, 0, 0.95) },
  // rock under the sunken stern, below the water
  { d: (x, z) => segD(x, z, S0.x, S0.z, S1.x, S1.z), r: 3.2, fall: 3, tag: 'stone', top: -0.9 },
  // a ledge of rock behind the stern gallery, joining the reef: the dry way back
  { d: (x, z) => segD(x, z, G0.x, G0.z, reefX(G0.z), G0.z), r: 1.8, fall: 3, tag: 'stone', top: 0.6, rough: 0.2 },
  // the rocks under the bow
  { d: (x, z) => Math.hypot(x - 2.5, z - 18.5), r: 4.5, fall: 2.6, tag: 'stone', top: 1.6, rough: 0.2 },
  // a little cove of pebbles where the rowboat lands
  { d: (x, z) => Math.hypot(x - REEF.ax, z + 22.5), r: 2.6, fall: 3, tag: 'sand', top: 0.55 },
];
function ground(x, z) {
  let h = SEABED + noise2(x * 0.15, z * 0.15, 3) * 0.6, tag = 'sand';
  for (const s of LAND) {
    const k = smoothstep(s.r, s.r + s.fall, s.d(x, z));
    const top = typeof s.top === 'function' ? s.top(z) : s.top;
    const rough = (s.rough || 0.1) * (noise2(x * 0.45, z * 0.45, 7) + 0.4 * noise2(x * 1.3, z * 1.3, 8));
    const hs = top + (SEABED - top) * k + rough * (1 - k);
    if (hs > h) { h = hs; tag = s.tag; }
  }
  return { h, tag };
}

// -------------------------------------------------------------- the hull
// The hull's long axis rises a little towards the bow, which is up on the rocks.
const PITCH = 0.055, Y0 = 3.905;          // hull centre line: y = Y0 + PITCH * z
const hullY = (z) => Y0 + PITCH * z;
const R_OUT = 3.3, R_IN = 3.12, HALF = 11.75; // hull radius, and half its length
// walkable decks, stern to bow: [z0, z1, top] (gallery, cabin and aft are on the stern section)
const DECKS = {
  gallery: [-12.2, -11, 2.6], cabin: [-11, -5, 2.6], aft: [-5, BRK_S, 2.6], island: [BRK_F, -1.6, 2.6],
  waist: [-0.5, 3.5, 3.0], fore1: [3.5, 6.5, 3.3], fore2: [6.5, 9.5, 3.55], bow: [9.5, 12.2, 3.8],
};
const PIT = [-1.6, -0.5, 1.9]; // caved-in deck: a shallow hole
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
const onHull = (th, lift = 0.02) => ({ x: (R_OUT + lift) * Math.sin(th), y: -(R_OUT + lift) * Math.cos(th) });
/** A repeatable 0..1 from a number. */
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

function hullParts() {
  const P = [];
  const shell = (z0, z1, th0 = -Math.PI / 2, th1 = Math.PI / 2) => {
    const L = z1 - z0, zc = (z0 + z1) / 2, segs = Math.max(4, Math.round(18 * (th1 - th0) / Math.PI));
    P.push(hullPart(new THREE.CylinderGeometry(R_OUT, R_OUT, L, segs, 1, true, th0, th1 - th0), C.wood, { rx: Math.PI / 2, z: zc }));
    P.push(hullPart(flipped(new THREE.CylinderGeometry(R_IN, R_IN, L, segs, 1, true, th0, th1 - th0)), C.inner, { rx: Math.PI / 2, z: zc }));
  };
  // the port rail is broken away at the bow: drop the top of that side
  for (const [a, b] of cut(-HALF, NOTCH[0])) shell(a, b);
  shell(NOTCH[0], NOTCH[1], -Math.PI / 2 + 0.42);
  shell(NOTCH[1], HALF);
  // bow cone and transom
  P.push(hullPart(new THREE.ConeGeometry(R_OUT, 4.4, 18, 1, true, -Math.PI / 2, Math.PI), C.wood, { rx: Math.PI / 2, z: HALF + 2.2 }));
  P.push(hullPart(flipped(new THREE.ConeGeometry(R_IN, 4.2, 18, 1, true, -Math.PI / 2, Math.PI)), C.inner, { rx: Math.PI / 2, z: HALF + 2.1 }));
  P.push(hullPart(new THREE.CircleGeometry(R_OUT, 18, Math.PI, Math.PI), C.dark, { ry: Math.PI, z: -HALF - 0.02 }));
  P.push(hullPart(new THREE.CircleGeometry(R_IN, 18, Math.PI, Math.PI), C.inner, { z: -HALF + 0.02 }));
  // gunwale caps along the rim (broken off at the notch), a dark strake low on each side, the keel
  for (const s of [-1, 1]) {
    const runs = s < 0 ? [...cut(-HALF, NOTCH[0]), [NOTCH[1], HALF]] : cut(-HALF, HALF);
    for (const [z0, z1] of runs) P.push(hullPart(box(0.34, 0.2, z1 - z0), C.dark, { x: s * (R_OUT - 0.05), y: 0.05, z: (z0 + z1) / 2 }));
    for (const [z0, z1] of cut(-HALF + 0.5, HALF - 0.5)) P.push(hullPart(box(0.12, 0.22, z1 - z0), C.dark, { x: s * 2.95, y: -1.55, z: (z0 + z1) / 2, rz: s * 0.55 }));
  }
  for (const [z0, z1] of cut(-HALF - 0.3, HALF + 2.7)) P.push(hullPart(box(0.45, 0.5, z1 - z0), C.dark, { y: -R_OUT - 0.1, z: (z0 + z1) / 2 }));
  // splintered plank stubs at both ends of the broken rail
  for (const [z, rz] of [[NOTCH[0] - 0.1, 0.5], [NOTCH[0] + 0.25, -0.3], [NOTCH[1] - 0.15, 0.4]]) {
    P.push(hullPart(box(0.14, 0.9, 0.22), C.dark, { x: -R_OUT + 0.05, y: -0.75, z, rz }));
  }
  // bowsprit, snapped short and pointing up at the rocks
  P.push(part(new THREE.CylinderGeometry(0.16, 0.24, 3.2, 7), C.dark, { y: hullY(HALF) + 1.0, z: HALF + 4.2, rx: 1.15 }));
  return P;
}

/**
 * Where she broke: torn planks of different lengths sticking out past the end
 * of the hull, bare frames beyond them, splintered deck ends and a ragged
 * bulkhead closing off the dark below decks. dir points out of the break.
 */
function breakParts(zEnd, dir, deckTop, seed) {
  const P = [];
  for (let i = 0; i < 17; i++) {
    const th = -Math.PI / 2 + 0.1 + (i * (Math.PI - 0.2)) / 16;
    const len = 0.25 + hash(i + seed) * 1.7;
    P.push(hullPart(box(0.6, 0.1, len), i % 3 ? C.wood : C.deck2, { ...onHull(th, -0.09), z: zEnd + (dir * len) / 2 - dir * 0.05, rz: th, rx: dir * (hash(i * 3 + seed) - 0.5) * 0.25 }));
  }
  // bare frames (ribs) standing out past the planking, one broken short
  for (const [k, arc, rot] of [[0.45, Math.PI, 0], [1.25, Math.PI * 0.62, 0.15]]) {
    P.push(hullPart(new THREE.TorusGeometry(R_IN - 0.05, 0.13, 4, 14, arc), C.rib, { z: zEnd + dir * k, rz: Math.PI + rot }));
  }
  // deck planks snapped off at different lengths
  for (let i = 0; i < 6; i++) {
    const x = -2.4 + i * 0.95, len = 0.2 + hash(i * 7 + seed) * 0.9;
    P.push(part(box(0.86, 0.12, len), i % 2 ? C.deck : C.deck2, { x, y: deckTop - 0.06 - hash(i + seed * 2) * 0.12, z: zEnd + (dir * len) / 2, rx: dir * hash(i * 5 + seed) * 0.2 }));
  }
  // a bulkhead closing off the hold below the deck, its lower edge following the hull
  const yTop = deckTop - 0.15 - hullY(zEnd), b = Math.asin(clamp(-yTop / R_IN, -1, 1));
  const shape = new THREE.Shape();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + b + ((Math.PI - 2 * b) * i) / n, r = R_IN - 0.06 - (i % 2) * 0.12;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const bulk = new THREE.ShapeGeometry(shape);
  P.push(hullPart(bulk.clone(), C.torn, { z: zEnd - dir * 0.2, ry: dir > 0 ? 0 : Math.PI }));
  P.push(hullPart(bulk, C.inner, { z: zEnd - dir * 0.22, ry: dir > 0 ? Math.PI : 0 }));
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
  // the caved-in hole: dark planks at the bottom and dark faces all round
  const [z0, z1, floor] = PIT;
  planks(z0, z1, floor, -2.5, 2.5, '#5a3b22', '#4e321c');
  for (const [z, top] of [[z0, 2.6], [z1, 3.0]]) {
    P.push(part(box(DW * 2, top - floor, 0.12), C.inner, { y: (floor + top) / 2, z: z + (z === z0 ? 0.06 : -0.06) }));
  }
  for (const s of [-1, 1]) P.push(part(box(0.24, 2.6 - floor + 0.4, 0.3), C.rib, { x: s * 2.45, y: (floor + 2.8) / 2, z: (z0 + z1) / 2, rz: s * 0.25 }));
  P.push(part(box(0.5, 0.1, 0.4), C.deck2, { x: -1.6, y: 2.56, z: z0 + 0.15, rx: 0.25 }));
  P.push(part(box(0.4, 0.1, 0.35), C.deck, { x: 1.9, y: 2.56, z: z1 - 0.15, rx: -0.2 }));
  // mast stump with a scrap of red pennant
  P.push(part(new THREE.CylinderGeometry(0.36, 0.42, 4.6, 9), C.dark, { y: 3.0 + 2.3, z: 1.5 }));
  P.push(part(new THREE.ConeGeometry(0.44, 0.6, 7), '#d9c7a0', { y: 7.8, z: 1.5, rx: 0.5 }));
  P.push(part(box(0.06, 0.7, 1.3), C.red, { y: 7.0, z: 2.2, ry: 0.15, rx: 0.1 }));
  P.push(part(new THREE.TorusGeometry(0.55, 0.08, 5, 12), C.rope, { y: 3.08, x: -0.9, z: 2.6, rx: Math.PI / 2 }));
  // torn sail slumped over the starboard rail
  P.push(part(jagged(new THREE.BoxGeometry(0.9, 0.07, 3.0, 2, 1, 4), 0.12, 21), C.sail, { x: 2.9, y: hullY(1.2) + 0.15, z: 1.2, rz: -0.35 }));
  P.push(part(jagged(new THREE.BoxGeometry(2.4, 0.07, 3.2, 4, 1, 4), 0.16, 22), '#ddcfae', { x: 3.55, y: hullY(1.2) - 1.1, z: 1.0, rz: -1.42, ry: 0.05 }));
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
    P.push(part(box(0.2, H, 6), C.house, { x: s * 2.95, y: F + H / 2, z: -8 }, { c2: C.dark, split: 0.15 }));
    for (const z of [-9.4, -6.6]) {
      P.push(part(box(0.06, 0.7, 0.9), C.glass, { x: s * 3.06, y: F + 1.5, z }));
      P.push(part(box(0.08, 0.86, 0.12), C.dark, { x: s * 3.07, y: F + 1.5, z: z - 0.5 }), part(box(0.08, 0.86, 0.12), C.dark, { x: s * 3.07, y: F + 1.5, z: z + 0.5 }));
    }
  }
  // front wall with the door; back wall opening onto the stern gallery
  for (const [z, door] of [[-5, 0.75], [-11, 1.0]]) {
    const w = DW + 0.2 - door;
    for (const s of [-1, 1]) P.push(part(box(w, H, 0.2), C.house, { x: s * (door + w / 2), y: F + H / 2, z }, { c2: C.dark, split: 0.15 }));
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
  // a chair, knocked over
  P.push(part(box(0.5, 0.08, 0.5), C.deck2, { x: T.x + 0.4, y: F + 0.28, z: T.z + 1.1, rx: 1.3, ry: 0.3 }));
  P.push(part(box(0.5, 0.6, 0.08), C.deck2, { x: T.x + 0.3, y: F + 0.05, z: T.z + 1.45, rx: 1.45, ry: 0.3 }));
  // grandfather's bunk; the chest is pulled half out from under it
  P.push(part(box(1.1, 0.25, 2.3), C.deck2, { x: 2.3, y: 3.05, z: -8.6 }));
  P.push(part(box(1.0, 0.16, 2.1), C.blanket, { x: 2.3, y: 3.24, z: -8.5 }));
  P.push(part(box(0.7, 0.16, 0.45), C.pillow, { x: 2.35, y: 3.32, z: -9.45 }));
  for (const dz of [-1.05, 1.05]) P.push(part(box(0.1, 0.5, 0.1), C.dark, { x: 1.82, y: F + 0.25, z: -8.6 + dz }));
  // a shelf of books by the gallery door (some fallen), a rug and a hanging lamp
  P.push(part(box(1.3, 0.08, 0.3), C.dark, { x: -1.95, y: 4.2, z: -10.75 }));
  ['#7a2e2a', '#2e4a6a', '#5a6a2e'].forEach((c, i) => P.push(part(box(0.14, 0.34 + (i % 2) * 0.06, 0.24), c, { x: -2.45 + i * 0.2, y: 4.42, z: -10.75, rz: i === 2 ? 0.4 : 0 })));
  ['#7a5a2a', '#4a2e5a'].forEach((c, i) => P.push(part(box(0.3, 0.06, 0.22), c, { x: -1.6 + i * 0.5, y: F + 0.04, z: -10.3 + i * 0.3, ry: i * 0.9 })));
  P.push(part(new THREE.CylinderGeometry(1.3, 1.3, 0.02, 16), C.rug, { y: F + 0.01, z: -7.8, sx: 1, sz: 0.7 }));
  P.push(part(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), C.dark, { x: LAMP.x, y: TOP - 0.17, z: LAMP.z }));
  P.push(part(box(0.22, 0.3, 0.22), C.brass, { x: LAMP.x, y: TOP - 0.5, z: LAMP.z }));
  // stern gallery rails, open in the middle where you can drop to the reef
  for (const s of [-1, 1]) {
    P.push(part(box(0.1, 0.8, 1.2), C.dark, { x: s * 2.35, y: F + 0.4, z: -11.6 }));
    P.push(part(box(1.4, 0.8, 0.1), C.dark, { x: s * 1.7, y: F + 0.4, z: -12.15 }));
    P.push(part(box(0.12, 0.14, 0.9), C.deck2, { x: s * 1.0, y: F + 0.2, z: -12.5, rx: 0.9 })); // the broken bit hanging down
  }
  P.push(part(box(4.9, 0.25, 1.3), C.dark, { y: F - 0.25, z: -11.6 }));
  return P;
}

// ------------------------------------------------------------- the rocks
function rockParts() {
  const P = [];
  // the rock the bow leans on, with stones to climb (stone pieces reach down into the water)
  P.push(...pieceParts({ kind: 'block', carved: true, cx: SHELF.cx, cz: SHELF.cz, hx: SHELF.hx, hz: SHELF.hz, top: SHELF.top, base: -1, rot: 0 }));
  for (const b of BOULDERS) P.push(...pieceParts({ kind: 'stone', cx: b.x, cz: b.z, r: b.r, top: b.top, rot: 0 }));
  // rough boulders heaped round the rock's sides (kept below its top, so the walk is unchanged)
  LUMPS.forEach(([x, y, z, sc], i) => {
    P.push(part(jagged(new THREE.DodecahedronGeometry(1, 0), 0.22, 60 + i), i % 2 ? C.rock : C.rock2, { x, y, z, s: sc, sy: sc * 0.85, ry: i * 1.3 }));
  });
  // the reef's teeth: dark rocks breaking the surface all round her, and the
  // ones she broke on, standing in the gap between the halves
  for (const [x, y, z, sc, sy] of TEETH) {
    const i = Math.round(x * 7 + z * 3);
    P.push(part(jagged(new THREE.DodecahedronGeometry(1, 0), 0.25, 90 + i), hash(i) > 0.5 ? C.reef : C.reef2, { x, y, z, s: sc, sy: sc * sy, ry: hash(i + 1) * 6, rz: (hash(i + 2) - 0.5) * 0.6 }));
    if (y < 0.4) P.push(part(new THREE.CylinderGeometry(sc * 0.95, sc * 1.05, 0.12, 7), C.weedRock, { x, y: 0.02, z, ry: hash(i + 3) * 6 }));
  }
  return P;
}
const SHELF = { cx: -4.7, cz: (NOTCH[0] + NOTCH[1]) / 2, hx: 1.5, hz: (NOTCH[1] - NOTCH[0]) / 2, top: 3.6 };
// rough boulders heaped round the bow rock: [x, y, z, size]
const LUMPS = [[-6.0, 1.0, 10.0, 1.3], [-6.0, 0.8, 11.7, 1.2], [-4.6, 1.0, 9.2, 1.4], [-5.9, 2.4, 9.4, 0.85],
  [-3.6, 1.1, 9.3, 1.1], [-6.3, 2.2, 10.9, 0.9], [-4.2, 0.7, 12.4, 1.0], [-7.0, 0.5, 9.0, 0.8]];
const BOULDERS = [{ x: -6.8, z: 14.0, r: 1.0, top: 1.85 }, { x: -5.0, z: 12.75, r: 1.0, top: 2.75 }];
// rocks in the water: [x, y, z, size, squash]. Out to starboard, along the reef's edge and in the break.
const TEETH = [
  [6.0, -0.2, 6.5, 1.5, 1.2], [7.5, -0.4, 0.5, 1.2, 1.4], [5.8, 0.1, -3.4, 1.3, 1.1], [8.5, -0.6, -8.0, 1.6, 1.0],
  [6.5, -0.3, 12.0, 1.1, 1.5], [9.5, -0.5, 4.0, 0.9, 1.3], [5.4, -0.2, -10.5, 1.0, 1.2], [3.2, 0.3, -15.5, 1.1, 1.0],
  [-1.6, 0.3, -5.0, 1.2, 1.3], [3.6, -0.1, -4.2, 1.4, 1.5], [0.6, -0.5, -4.9, 0.9, 1.1],
  [-12.0, -0.3, 2.0, 1.2, 1.1], [-12.2, -0.4, -8.0, 1.0, 1.3], [-11.5, -0.2, 9.5, 1.1, 1.0], [-10.8, -0.5, -16.0, 1.3, 1.0],
  [-9.5, -0.3, -24.0, 0.9, 1.2], [-1.2, -0.4, -21.0, 1.0, 1.1], [1.5, -0.6, -19.0, 0.8, 1.4],
];
const SPOTS = { table: { x: -1.9, z: -7.6 }, chest: { x: 1.35, z: -8.75 } };
// The deckhouse is low and roofless so the follow camera can see in over its walls.
const CABIN_TOP = 4.7, LINTEL = 4.5;
const LAMP = { x: 2.3, z: -8.2 }; // hangs over the bunk, out of the way

// Sea stacks round the bow, in ship space. At sea they're the wreck's rocks
// (drawn, and the boat bumps into them); ashore they stand in the same places.
export const WRECK_STACKS = [
  { x: 5, z: 24, r: 4.5, h: 15 }, { x: -3, z: 22.5, r: 3, h: 8 }, { x: 9.5, z: 17.5, r: 2.6, h: 5 },
  { x: 1, z: 28.5, r: 2.4, h: 4 }, { x: -8.5, z: 19.5, r: 1.8, h: 2.5 }, { x: 11, z: 25, r: 2, h: 3 },
];
/** Circles (ship space) the boat can't sail into: both halves of the hull, the reef, the rocks under the bow. */
export const WRECK_SOLID = [
  ...[-1, 3.5, 8, 12.5].map((z) => ({ x: 0, z, r: 3.9 })), { x: 0, z: 15.5, r: 3 },
  ...[-5.5, -8.5, -11.5].map((z) => ({ ...sternPt(0, 0, z), r: 3.8 })),
  ...[-15, -9, -3, 3, 9, 13].map((z) => ({ x: reefX(z), z, r: 5 })),
  { x: REEF.ax, z: -20.5, r: 2.8 }, { x: 2.5, z: 18.5, r: 5 }, { x: 4, z: -4, r: 2.4 },
];
/** Where the boat stops to climb aboard: astern, off the pebble cove. */
export const WRECK_MOORING = { x: -2, z: -29 };

function terrainMesh() {
  const X0 = -26, X1 = 26, Z0 = -32, Z1 = 30, S = 0.75;
  const nx = Math.round((X1 - X0) / S) + 1, nz = Math.round((Z1 - Z0) / S) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  const cs = Object.fromEntries(['shingle', 'shingle2', 'wet', 'weedRock', 'reef', 'reef2', 'seabed'].map((k) => [k, new THREE.Color(C[k])]));
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * S, z = Z0 + j * S, k = j * nx + i;
    const { h, tag } = ground(x, z);
    hs[k] = h;
    pos[k * 3] = x; pos[k * 3 + 1] = Math.max(h, -7); pos[k * 3 + 2] = z;
    const n = noise2(x * 0.5, z * 0.5, 4);
    if (h < -0.4) tmp.copy(cs.seabed);
    else if (h < 0.3) tmp.copy(cs.wet).lerp(cs.weedRock, 0.5 + 0.5 * n);   // wet, weedy tideline
    else if (tag === 'stone') tmp.copy(cs.reef).lerp(cs.reef2, 0.5 + 0.5 * Math.sin(h * 3.1 + n * 3));
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
  terrainMat ||= toonMaterial({ vertexColors: true, gradientMap: toonGradient() }, { rim: false });
  const m = new THREE.Mesh(g, terrainMat);
  m.name = 'wreck:reef';
  return m;
}
let terrainMat = null;

// ------------------------------------------------------------ fine detail
/** A rod from a to b ([x, y, z] each): ropes, spars. */
function rod(a, b, r, color, segs = 5) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.CylinderGeometry(r, r, d.length(), segs, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return part(g, color);
}
/** A gull standing at (x, y, z) facing ry. */
function gullParts(x, y, z, ry) {
  const P = [
    part(new THREE.SphereGeometry(0.16, 8, 6), '#f4f1ea', { y: 0.2, sz: 1.7 }),
    part(new THREE.SphereGeometry(0.1, 8, 6), '#f4f1ea', { y: 0.36, z: 0.22 }),
    part(new THREE.ConeGeometry(0.035, 0.14, 5), '#f2c14a', { y: 0.35, z: 0.36, rx: Math.PI / 2 }),
    part(new THREE.BoxGeometry(0.06, 0.12, 0.42), '#9aa3ad', { x: 0.13, y: 0.23, z: -0.05, rz: -0.2 }),
    part(new THREE.BoxGeometry(0.06, 0.12, 0.42), '#9aa3ad', { x: -0.13, y: 0.23, z: -0.05, rz: 0.2 }),
    part(new THREE.BoxGeometry(0.14, 0.04, 0.16), '#3a3f46', { y: 0.2, z: -0.34 }),
    part(new THREE.BoxGeometry(0.03, 0.12, 0.03), '#f2a04a', { x: 0.05, y: 0.05 }),
    part(new THREE.BoxGeometry(0.03, 0.12, 0.03), '#f2a04a', { x: -0.05, y: 0.05 }),
  ];
  for (const g of P) g.rotateY(ry).translate(x, y, z);
  return P;
}

// The foremast stands (snapped) on the foredeck, off the walking line.
const FOREMAST = { x: 0, z: 8.0, base: 3.55, top: 11.4, swing: 0.95 };
// The fallen yard lies across the waist (low enough to step over).
const YARD = { a: [-1.0, 3.16, 3.3], b: [2.6, 3.16, 2.5], r: 0.16 };

/** Planking, weed, portholes, a breach, rigging, gulls and a stern lantern. */
function detailParts() {
  const P = [];
  // plank seams (strakes) along both sides; the port one breaks at the notch
  const strake = (th, z0, z1) => { for (const [a, b] of cut(z0, z1)) P.push(hullPart(box(0.18, 0.07, b - a), C.dark, { ...onHull(th), z: (a + b) / 2, rz: th })); };
  for (const th of [0.48, 0.88]) { strake(th, -HALF, HALF); strake(-th, -HALF, HALF); }
  strake(1.25, -HALF, HALF); strake(-1.25, -HALF, NOTCH[0]); strake(-1.25, NOTCH[1], HALF);
  // weed and barnacles along the old waterline
  for (const t0 of [0.62, -0.97]) for (const [a, b] of cut(-HALF + 0.2, HALF - 0.2)) {
    P.push(hullPart(new THREE.CylinderGeometry(R_OUT + 0.03, R_OUT + 0.03, b - a, 3, 1, true, t0, 0.35), C.weed, { rx: Math.PI / 2, z: (a + b) / 2 }));
  }
  for (let i = 0; i < 18; i++) {
    const th = (i % 2 ? 1 : -1) * (0.7 + (i * 0.37) % 0.25), z = -HALF + 1 + ((i * 7.3) % (HALF * 2 - 2));
    if (z > BRK_S - 0.3 && z < BRK_F + 0.3) continue;
    P.push(hullPart(new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.04, 0), i % 3 ? '#cfc8b4' : '#8d9a6a', { ...onHull(th, 0.05), z }));
  }
  // portholes below the deck
  for (const s of [-1, 1]) for (const z of [-9.4, -6.6, 0.4, 4.2, 7.6]) {
    P.push(hullPart(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 12), C.brass, { ...onHull(s * 1.1, 0.02), z, rz: s * 1.1 }));
    P.push(hullPart(new THREE.CylinderGeometry(0.19, 0.19, 0.09, 12), C.glass, { ...onHull(s * 1.1, 0.04), z, rz: s * 1.1 }));
  }
  // a breach in the starboard side where a rock went in, splinters round it
  P.push(hullPart(box(1.5, 0.08, 2.2), C.torn, { ...onHull(0.92, 0.03), z: 2.6, rz: 0.92 }));
  for (const [dz, dt, rx] of [[-1.1, 0.12, 0.4], [1.15, -0.1, -0.5], [0.2, 0.25, 0.2], [-0.3, -0.2, -0.3]]) {
    P.push(hullPart(box(0.12, 0.1, 0.8), C.deck2, { ...onHull(0.92 + dt, 0.08), z: 2.6 + dz, rz: 0.92, rx }));
  }
  // rigging: shrouds from the stump to the rails, ratlines on the port side, a snapped stay on deck
  const top = [0, 7.45, 1.5];
  const rail = (s, z) => [s * (R_OUT - 0.08), hullY(z) + 0.05, z];
  for (const s of [-1, 1]) for (const z of [0.4, 2.4]) P.push(rod(top, rail(s, z), 0.035, C.rope, 4));
  for (const t of [0.22, 0.36, 0.5, 0.64]) {
    const a = rail(-1, 0.4), b = rail(-1, 2.4);
    P.push(rod(a.map((v, i) => top[i] + (v - top[i]) * t), b.map((v, i) => top[i] + (v - top[i]) * t), 0.025, C.rope, 4));
  }
  P.push(rod([0.15, 7.3, 1.75], [0.5, 3.36, 5.9], 0.035, C.rope, 4));
  P.push(rod([0.4, 3.36, 5.9], [1.3, 3.36, 6.3], 0.035, C.rope, 4));
  // the foremast, snapped higher up: its yard still crossed, a tattered sail hanging from it
  const FM = FOREMAST;
  P.push(part(new THREE.CylinderGeometry(0.3, 0.38, FM.top - FM.base, 9), C.dark, { x: FM.x, y: (FM.base + FM.top) / 2, z: FM.z }));
  P.push(part(new THREE.ConeGeometry(0.34, 0.5, 7), '#d9c7a0', { x: FM.x, y: FM.top + 0.1, z: FM.z, rx: -0.45, rz: 0.3 }));
  P.push(part(box(1.6, 0.14, 0.5), C.dark, { x: FM.x, y: FM.top - 1.9, z: FM.z })); // crosstree
  const ya = [-3.4, FM.top - 1.0, FM.z + 0.35], yb = [3.2, FM.top - 2.15, FM.z + 0.35];
  const sail = [rod(ya, yb, 0.14, C.dark, 7)];
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7, x = ya[0] + (yb[0] - ya[0]) * t, y = ya[1] + (yb[1] - ya[1]) * t;
    const len = [2.4, 1.6, 2.9, 1.1, 2.2, 0.8, 1.7][i];
    sail.push(part(jagged(new THREE.BoxGeometry(0.98, len, 0.06, 1, 3, 1), 0.08, 40 + i), i % 3 ? C.sail : '#ddcfae',
      { x, y: y - len / 2 - 0.1, z: FM.z + 0.45 + (i % 2) * 0.05, rz: Math.atan2(yb[1] - ya[1], yb[0] - ya[0]), rx: 0.08 * ((i % 3) - 1) }));
  }
  // the yard has swung round on its mast, so the sail shows from the side
  for (const g of sail) P.push(g.translate(-FM.x, 0, -FM.z).rotateY(FM.swing).translate(FM.x, 0, FM.z));
  const fTop = [FM.x, FM.top - 1.9, FM.z];
  for (const s of [-1, 1]) for (const z of [FM.z - 0.8, FM.z + 1.0]) P.push(rod(fTop, rail(s, z), 0.035, C.rope, 4));
  for (const t of [0.25, 0.42, 0.59, 0.76]) {
    const a = rail(1, FM.z - 0.8), b = rail(1, FM.z + 1.0);
    P.push(rod(a.map((v, i) => fTop[i] + (v - fTop[i]) * t), b.map((v, i) => fTop[i] + (v - fTop[i]) * t), 0.025, C.rope, 4));
  }
  P.push(rod([FM.x, FM.top - 0.4, FM.z], top, 0.03, C.rope, 4)); // the stay between the masts
  // a faded painted stripe below the rail (broken at the notch), and the stem post
  const stripe = (sgn, z0, z1) => { for (const [a, b] of cut(z0, z1)) P.push(hullPart(new THREE.CylinderGeometry(R_OUT + 0.025, R_OUT + 0.025, b - a, 2, 1, true, sgn > 0 ? 1.3 : -1.45, 0.15), C.paint, { rx: Math.PI / 2, z: (a + b) / 2 })); };
  stripe(1, -HALF, HALF); stripe(-1, -HALF, NOTCH[0]); stripe(-1, NOTCH[1], HALF);
  P.push(rod([0, hullY(HALF) - 2.2, HALF + 3.3], [0, hullY(HALF) + 0.4, HALF + 4.5], 0.2, C.dark, 6));
  P.push(rod([0, hullY(HALF) + 0.4, HALF + 4.5], [0, hullY(HALF) + 1.5, HALF + 4.4], 0.18, C.dark, 6));
  // stern: windows either side of the gallery door, trim along the gallery
  for (const s of [-1, 1]) {
    P.push(part(box(0.75, 0.6, 0.06), C.glass, { x: s * 1.95, y: 3.75, z: -11.12 }));
    P.push(part(box(0.95, 0.1, 0.08), C.trim, { x: s * 1.95, y: 4.1, z: -11.13 }), part(box(0.95, 0.1, 0.08), C.trim, { x: s * 1.95, y: 3.4, z: -11.13 }));
    P.push(part(box(0.08, 0.8, 0.08), C.trim, { x: s * 1.95 - 0.45, y: 3.75, z: -11.13 }), part(box(0.08, 0.8, 0.08), C.trim, { x: s * 1.95 + 0.45, y: 3.75, z: -11.13 }));
    P.push(part(box(0.06, 0.1, 1.2), C.trim, { x: s * 2.41, y: 3.42, z: -11.6 }));
  }
  P.push(part(box(4.9, 0.12, 0.08), C.trim, { y: 2.42, z: -12.26 }));
  P.push(part(box(4.9, 0.1, 0.06), C.paint, { y: 2.2, z: -12.27 }));
  for (const s of [-1, 1]) P.push(part(box(1.4, 0.1, 0.06), C.trim, { x: s * 1.7, y: 3.42, z: -12.2 }));
  // the fallen yard, a bundle of torn sail still lashed to it
  P.push(rod(YARD.a, YARD.b, YARD.r, C.dark, 8));
  P.push(part(jagged(new THREE.BoxGeometry(1.7, 0.36, 0.5, 3, 1, 2), 0.09, 31), C.sail, { x: 1.1, y: 3.3, z: 2.82, ry: 0.22 }));
  // stern lantern on a bracket at the gallery corner
  P.push(rod([2.35, 2.6, -12.15], [2.35, 3.75, -12.15], 0.05, C.dark, 5));
  P.push(part(box(0.3, 0.38, 0.3), C.brass, { x: 2.35, y: 3.95, z: -12.15 }));
  P.push(part(box(0.24, 0.26, 0.32), '#f4e2a8', { x: 2.35, y: 3.95, z: -12.15 }));
  P.push(part(new THREE.ConeGeometry(0.22, 0.18, 4), C.brass, { x: 2.35, y: 4.23, z: -12.15, ry: Math.PI / 4 }));
  // gulls: on the stump, a roof beam, the rail and the bow
  P.push(...gullParts(0.05, 7.72, 1.45, 2.4), ...gullParts(-1.6, CABIN_TOP + 0.2, -10.3, 0.9),
    ...gullParts(R_OUT - 0.05, hullY(6) + 0.15, 6.2, -1.3), ...gullParts(0.2, hullY(HALF) + 0.25, HALF + 0.6, 0.2));
  return P;
}

/** Wreckage floating and stranded in the break and on the seaward side (ship space, not moved). */
function flotsamParts() {
  const P = [];
  P.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10), C.barrel, { x: 6.8, y: -0.05, z: 3.5, rz: Math.PI / 2, ry: 0.6 }));
  P.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10), C.barrel, { x: 2.6, y: -0.1, z: -5.6, rz: Math.PI / 2, ry: 2.0 }));
  for (const [x, z, len, ry, c] of [[7.4, -2.5, 2.4, 0.5, C.deck2], [6.2, -5.4, 1.6, -0.3, C.deck], [-0.6, -6.2, 2.0, 1.1, C.deck2],
    [3.0, -3.6, 1.3, 2.4, C.wood], [9.0, -12.0, 1.8, 0.9, C.deck], [-3.0, -4.4, 1.2, -0.7, C.wood]]) {
    P.push(part(box(0.26, 0.1, len), c, { x, y: 0.02, z, ry, rz: (hash(x + z) - 0.5) * 0.2 }));
  }
  // a broken spar caught across the rocks in the gap
  P.push(rod([-1.4, 0.9, -5.0], [3.2, 0.5, -4.4], 0.17, C.dark, 7));
  P.push(part(new THREE.TorusGeometry(0.4, 0.06, 4, 10), C.rope, { x: 0.8, y: 0.03, z: -5.8, rx: Math.PI / 2 }));
  return P;
}

/** jitter that keeps shared corners together (like props.js) */
function jagged(geo, amt, seed) {
  const g = geo.toNonIndexed(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = (k) => noise2(x * 13.1 + k, z * 11.7 + y * 7.3, seed + k);
    p.setXYZ(i, x + n(1) * amt, y + n(2) * amt, z + n(3) * amt);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------- the planks over the break
// Torn deck planking still hangs between the halves, stepping down to the stern.
const BRIDGE_N = 5;
function bridgePlanks() {
  const A = { x: -0.1, y: DECKS.island[2], z: BRK_F + 0.05 };
  const Bp = sternPt(0.1, DECKS.aft[2], BRK_S - 0.1);
  const dx = Bp.x - A.x, dz = Bp.z - A.z, len = Math.hypot(dx, dz), rot = Math.atan2(dx, dz);
  const out = [];
  for (let i = 0; i < BRIDGE_N; i++) {
    const t = (i + 0.5) / BRIDGE_N;
    const top = A.y + (Bp.y - A.y) * ((i + 1) / (BRIDGE_N + 1));
    out.push({ x: A.x + dx * t, z: A.z + dz * t, top, hz: len / BRIDGE_N / 2 + 0.06, hx: 0.55, rot });
  }
  return out;
}

// -------------------------------------------------------------- the model
/**
 * The broken ship on her reef, in ship space (+z towards the bow, sea at y = 0).
 * opts.sea: the stern section also rolls onto its side, and the bow section
 * leans a little (ashore the decks stay level to walk on).
 * Returns { group, terrain, ship, outline, stern (group in pre-break ship
 * space: put things that sit in the cabin here), props, geos }.
 */
export function buildWreckModel(opts = {}) {
  const group = new THREE.Group();
  group.name = 'wreck';
  const terrain = terrainMesh();
  group.add(terrain);
  // sort the ship's parts into the two halves by where they sit
  const fore = [...rockParts(), ...flotsamParts(), ...breakParts(BRK_F, -1, DECKS.island[2], 3)];
  const aft = [...breakParts(BRK_S, 1, DECKS.aft[2], 11)];
  for (const g of [...hullParts(), ...deckParts(), ...cabinParts(), ...detailParts()]) {
    g.computeBoundingBox();
    ((g.boundingBox.min.z + g.boundingBox.max.z) / 2 < BRK_MID ? aft : fore).push(g);
  }
  // the hanging planks across the break
  for (const b of bridgePlanks()) {
    const g = part(jagged(new THREE.BoxGeometry(b.hx * 2, 0.12, b.hz * 2 - 0.08, 2, 1, 2), 0.04, 70 + b.top * 10), b.top > 2.2 ? C.deck : C.deck2, { y: b.top - 0.06 });
    g.rotateY(b.rot).translate(b.x, 0, b.z);
    fore.push(g);
  }
  const foreGeo = merge2(fore), aftGeo = merge2(aft);
  const ship = new THREE.Mesh(foreGeo, propMaterial), outline = new THREE.Mesh(foreGeo, thinOutline);
  ship.name = 'wreck:ship';
  const sternShip = new THREE.Mesh(aftGeo, propMaterial), sternOutline = new THREE.Mesh(aftGeo, thinOutline);
  sternShip.name = 'wreck:stern';
  // the stern section: authored in place, moved as one piece
  const sternOuter = new THREE.Group();
  sternOuter.matrixAutoUpdate = false;
  sternOuter.matrix.copy(sternMatrix(opts.sea ? STERN.roll : 0));
  const stern = new THREE.Group();
  sternOuter.add(stern);
  stern.add(sternShip, sternOutline);
  group.add(ship, outline, sternOuter);
  if (opts.sea) ship.rotation.z = outline.rotation.z = 0.07; // the bow section settles onto the reef side
  // boulders round the bow rock, the barrels and crate that washed up in the cove
  const props = [];
  const prop = (name, x, y, z, sc, ry = 0) => {
    if (!PROPS[name]) return;
    const m = new THREE.Mesh(PROPS[name], propMaterial), o = new THREE.Mesh(PROPS[name], thinOutline);
    for (const k of [m, o]) { k.position.set(x, y, z); k.scale.setScalar(sc); k.rotation.y = ry; }
    group.add(m, o);
    props.push(m, o);
  };
  for (const [x, z, sc, ry] of [[1, 15.5, 1.6, 0.3], [6.5, 17, 1.9, 1.2], [-0.5, 19.8, 1.4, 2.1], [3.5, 13.8, 1.1, 2.6], [-10.5, 6, 0.9, 0.4], [-11, -6, 0.8, 1.9], [-6, 18, 1.2, 0.8]]) {
    prop('rock', x, ground(x, z).h - 0.25, z, sc, ry);
  }
  for (const [x, z, ry] of [[-7.6, -21.6, 0.4], [-4.4, -22.4, 1.1]]) prop('barrel', x, ground(x, z).h - 0.05, z, 0.55, ry);
  prop('crate', -7.8, ground(-7.8, -19.6).h - 0.05, -19.6, 0.6, 0.5);
  return { group, terrain, ship, outline, sternShip, sternOutline, stern, props, geos: [terrain.geometry, foreGeo, aftGeo] };
}

// ---------------------------------------------------------- colliders
// An axis-aligned box in ship space as an obox (it turns with the ship).
const B = (x0, x1, y0, y1, z0, z1, tag = 'wood') => obox((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, 0, tag);

/** Colliders in ship space; those aft of the break are moved with the stern. */
function shipColliders() {
  const fore = [], aft = [];
  const add = (c) => ((c.type === 'cyl' ? c.z : c.c[2]) < BRK_MID ? aft : fore).push(c);
  for (const [k, [z0, z1, top]] of Object.entries(DECKS)) {
    if (k === 'gallery') add(B(-2.4, 2.4, top - 0.15, top, z0, z1));
    else add(B(k === 'bow' ? -3.3 : -DW, DW, 0, top, z0, z1));
  }
  add(B(-DW, DW, 0, PIT[2], PIT[0], PIT[1]));
  // hull sides: as high as the rail, except the deckhouse (to the roof) and the broken bit at the bow
  const sides = [[-11, -5, CABIN_TOP], [-5, BRK_S], [BRK_F, -0.5], [-0.5, 3.5], [3.5, 6.5], [6.5, NOTCH[0]], [NOTCH[0], 12.2]];
  for (const [z0, z1, top] of sides) {
    for (const s of [-1, 1]) {
      const t = top ?? (s < 0 && z0 === NOTCH[0] ? 3.4 : hullY(z1) + 0.05);
      add(B(s < 0 ? -3.3 : DW, s < 0 ? -DW : 3.3, 0, t, z0, z1));
    }
  }
  add(B(-2.95, 2.95, 0, 4.6, 12.2, 12.5)); // inside of the bow
  // cabin: front wall with a door, back wall with the gallery door
  for (const [z, door] of [[-5, 0.75], [-11, 1.0]]) {
    for (const s of [-1, 1]) add(B(s < 0 ? -3.05 : door, s < 0 ? -door : 3.05, 2.6, CABIN_TOP, z - 0.1, z + 0.1));
    add(B(-door, door, LINTEL, CABIN_TOP, z - 0.1, z + 0.1));
  }
  // furniture
  const T = SPOTS.table;
  add(B(T.x - 0.7, T.x + 0.7, 2.6, 3.5, T.z - 0.5, T.z + 0.5));
  add(B(1.75, 2.85, 2.6, 3.32, -9.75, -7.45));
  add(B(SPOTS.chest.x - 0.28, SPOTS.chest.x + 0.28, 2.6, 3.05, SPOTS.chest.z - 0.4, SPOTS.chest.z + 0.4));
  // gallery rails (not the middle)
  for (const s of [-1, 1]) {
    add(B(s < 0 ? -2.45 : 2.25, s < 0 ? -2.25 : 2.45, 2.6, 3.4, -12.2, -11));
    add(B(s < 0 ? -2.4 : 1.0, s < 0 ? -1.0 : 2.4, 2.6, 3.4, -12.2, -12.1));
  }
  // mast stumps, barrel, crate
  add(cyl(0, 1.5, 0.42, 3.0, 7.6, 'wood'));
  add(cyl(FOREMAST.x, FOREMAST.z, 0.4, FOREMAST.base, FOREMAST.top, 'wood'));
  add(cyl(2.0, 5.0, 0.44, 3.3, 4.2, 'wood'));
  add(obox(-1.9, 3.3 + 0.48, 4.6, 0.48, 0.48, 0.48, 0.35, 'wood'));
  // rocks: the shelf by the bow, the stones up to it, the boulders, the stacks
  add(B(SHELF.cx - SHELF.hx, SHELF.cx + SHELF.hx, -1, SHELF.top, SHELF.cz - SHELF.hz, SHELF.cz + SHELF.hz, 'stone'));
  for (const b of BOULDERS) add(cyl(b.x, b.z, b.r, -1, b.top, 'stone'));
  for (const [x, y, z, sc] of LUMPS) add(cyl(x, z, sc * 0.8, -1, y + sc * 0.7, 'stone'));
  for (const R of WRECK_STACKS) add(cyl(R.x, R.z, R.r * 0.92, -2, R.h, 'stone'));
  // the fallen yard on the waist
  const { a, b, r } = YARD, dx = b[0] - a[0], dz = b[2] - a[2];
  add(obox((a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2, Math.hypot(dx, dz) / 2, r, r, Math.atan2(-dz, dx), 'wood'));
  // move the stern's colliders to where it ended up (yaw and offset; its small pitch only shifts heights)
  const moved = aft.map((c) => {
    if (c.type === 'cyl') { const p = sternPt(c.x, (c.y0 + c.y1) / 2, c.z); const dy = p.y - (c.y0 + c.y1) / 2; return { ...c, x: p.x, z: p.z, y0: c.y0 + dy, y1: c.y1 + dy }; }
    const p = sternPt(c.c[0], c.c[1], c.c[2]);
    return { ...c, c: [p.x, p.y, p.z], rot: c.rot + STERN.yaw };
  });
  // the planks across the break (already placed)
  const planks = bridgePlanks().map((b) => obox(b.x, b.top - 0.08, b.z, b.hx, 0.08, b.hz, b.rot, 'wood'));
  return [...fore, ...moved, ...planks];
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
  const PS = (x, y, z, extra = {}) => { const p = sternPt(x, y, z); return P(p.x, p.y, p.z, extra); }; // in the stern section

  const group = new THREE.Group();
  group.name = 'ashore:wreck';
  group.rotation.y = th;
  const own = [];

  // the same ship (and reef) you see from the sea
  const model = buildWreckModel();
  group.add(model.group);
  own.push(...model.geos);

  // rowboat at the water's edge in the cove astern (towards your ship), +x out to sea
  let rz = -20;
  while (rz > -30 && ground(REEF.ax, rz).h > 0.25) rz -= 0.25;
  const rowboat = { x: REEF.ax, y: Math.max(0, ground(REEF.ax, rz + 0.6).h), z: rz + 0.6, rot: Math.PI / 2 };
  const boatGeo = merge2(rowboatParts(rowboat));
  own.push(boatGeo);
  group.add(new THREE.Mesh(boatGeo, propMaterial), new THREE.Mesh(boatGeo, thinOutline));

  // the sea stacks round the bow (at sea these are the wreck's rocks)
  if (PROPS.seaStack) {
    for (const R of WRECK_STACKS) {
      const m = new THREE.Mesh(PROPS.seaStack, propMaterial), o = new THREE.Mesh(PROPS.seaStack, thinOutline);
      for (const k of [m, o]) { k.position.set(R.x, -2, R.z); k.scale.set(R.r, R.h + 2, R.r); k.rotation.y = (R.x * 13.7 + R.z) % 6.283; }
      group.add(m, o);
    }
  }

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
  model.stern.add(finds);
  let chest = null;
  if (PROPS.chest) {
    chest = new THREE.Group();
    chest.add(new THREE.Mesh(PROPS.chest, propMaterial), new THREE.Mesh(PROPS.chest, thinOutline));
    chest.position.set(K.x, 2.6, K.z);
    chest.rotation.y = -Math.PI / 2;
    chest.scale.setScalar(0.5);
    model.stern.add(chest);
  }
  // the hanging lamp glows a little, day or night
  const lamp = new THREE.PointLight(0xffc878, opts.quality === 'low' ? 0 : 2.5, 7, 1.5);
  lamp.position.set(LAMP.x, CABIN_TOP - 0.55, LAMP.z);
  model.stern.add(lamp);

  // ---- colliders, turned into level space
  const colliders = shipColliders().map((c) => {
    if (c.type === 'cyl') { const p = toL(c.x, c.z); return { ...c, x: p.x, z: p.z }; }
    const p = toL(c.c[0], c.c[2]);
    return { ...c, c: [p.x, c.c[1], p.z], rot: c.rot + th };
  });
  const rb = toL(rowboat.x, rowboat.z);
  colliders.push(obox(rb.x, rowboat.y + 0.2, rb.z, 1.7, 0.25, 0.7, rowboat.rot + th, 'wood'));

  // ---- route markers (ship space → level space)
  const sp = { x: REEF.ax + 1, z: rowboat.z + 3.6 };
  const spawn = P(sp.x, ground(sp.x, sp.z).h, sp.z, { yaw: th });
  const exit = P(rowboat.x, rowboat.y, rowboat.z, { r: 2.8 });
  const floor = sternPt(0, DECKS.cabin[2], -8).y; // the cabin floor, where the stern settled
  const checkpoints = [
    P(SHELF.cx - 0.9, SHELF.top, SHELF.cz - 0.4, { id: 'cp0' }),
    P(-2.2, DECKS.waist[2], 2.9, { id: 'cp1' }),
    P(2.3, DECKS.island[2], -2.3, { id: 'cp2' }),
  ];
  const coins = [];
  const coin = (p, value = 1) => coins.push({ ...p, id: 'c' + coins.length, value });
  for (const z of [-14, -9.5, -5, -0.5, 4, 8]) {
    const x = reefX(z);
    coin(P(x, ground(x, z).h, z));
  }
  for (const b of BOULDERS) coin(P(b.x, b.top, b.z));
  coin(P(SHELF.cx + 0.4, SHELF.top, SHELF.cz + 0.3));
  coin(P(0.2, DECKS.bow[2], 11));
  coin(P(-1.0, DECKS.fore2[2], 8));
  coin(P(1.0, DECKS.fore1[2], 5.6));
  coin(P(-1.2, DECKS.waist[2], 0.6));
  coin(P(0, DECKS.island[2], -2.25));
  coin(P(1.2, PIT[2], -1.05), 2);
  const bp = bridgePlanks()[1];
  coin(P(bp.x, bp.top, bp.z), 2);
  coin(PS(0, DECKS.gallery[2], -11.6));
  const caches = [{ ...P(-1.7, PIT[2], -1.05), id: 'g0', value: 20 }];

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
    summit: PS(0, DECKS.cabin[2], -8),
    hints: [
      { id: 'jump', ...P(-7.6, 0, 12.6), r: 3.0, text: 'Press Space to jump up the rocks', touch: 'Tap ▲ to jump up the rocks' },
      { id: 'gap', ...P(0, 0, 0.5), r: 1.7, yMin: 2.8, text: 'The deck has caved in. Jump across the hole!', touch: 'The deck has caved in. Jump across the hole!' },
      { id: 'pit', ...P(0, 0, -1.05), r: 2.4, yMax: 2.3, text: 'Just a little drop. Jump back out!', touch: 'Just a little drop. Jump back out!' },
      { id: 'break', ...P(0, 0, -2.4), r: 1.4, yMin: 2.4, text: 'She broke in two on these rocks. Cross the planks to the stern.', touch: 'She broke in two on these rocks. Cross the planks to the stern.' },
      { id: 'cabin', ...PS(0, 0, -6.2), r: 1.5, yMin: floor - 0.4, text: "Grandfather's cabin. Look around!", touch: "Grandfather's cabin. Look around!" },
    ],
    spots: {
      table: PS(T.x, 2.6, T.z, { r: 1.9 }),
      chest: PS(K.x, 2.6, K.z, { r: 1.7 }),
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
