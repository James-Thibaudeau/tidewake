// Geometry for cold islands' level pieces (pieces.js hands them over by kind
// and style): ice floes in the moat, steps and drifts of snow over rock, snowy
// ledges hung with icicles (and the rests between climbs, each with its
// snowman), shelves of ice, the flat snow-laden tops of pines, the great snow
// pine that holds the chest, the summit's cairn, and the pole a gust's pennant
// flies from. Built like pieces.js: vertex-coloured parts in level space.
// The frozen moat, the pond, the pennants and the snow in the air are
// cold-life.js.
import * as THREE from 'three';
import { part, jitter, skirtCone } from '../props.js';

const C = {
  snow: '#f4f8ff', snowShade: '#cfdcec', snowBlue: '#b9cbe2',
  ice: '#c4e9f6', iceDeep: '#78b9d8', iceLight: '#ecfaff', iceEdge: '#9ad1ea',
  rock: '#8d97a3', rockDark: '#687482', rockTop: '#a4adb8',
  needle: '#3f7d5a', needleDark: '#2b5c44', trunk: '#6e4f33', trunkDark: '#553b25',
  pole: '#6e4a2b', poleDark: '#553b25', coal: '#2a2c33', carrot: '#f08a3c', scarf: '#d8433a',
};

/** A local part turned by the piece's rot and moved to its centre (as in pieces.js). */
function placed(geo, color, p, t = {}, extra = {}) {
  const g = part(geo, color, { ...t, ...extra });
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}

const seedOf = (p) => Math.floor(Math.abs(p.cx * 13.1 + p.cz * 7.3)) % 997;

/** Icicles hanging under an edge: along local x from x0 to x1 at depth z, their roots at y. */
function icicles(p, x0, x1, y, z, seed, every = 0.34) {
  const P = [];
  for (let x = x0 + 0.12, i = 0; x < x1 - 0.1; x += every * (0.75 + 0.5 * Math.abs(Math.sin(seed + i * 1.7))), i++) {
    const len = 0.22 + 0.42 * Math.abs(Math.sin(seed * 0.7 + i * 2.3));
    P.push(placed(new THREE.ConeGeometry(0.055 + len * 0.07, len, 5), i % 3 ? C.ice : C.iceLight, p, { x, y: y - len / 2, z: z + 0.04 * Math.sin(i * 5), rx: Math.PI }, { c2: C.iceEdge, split: 0.5 }));
  }
  return P;
}

/** A mound of snow: half a squashed ball. */
const mound = (r, sy = 0.45) => new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1);

/**
 * An ice floe in the moat: a flat, ragged slab riding a little out of the
 * water, paler on top, with a scuff of snow and a loose chunk beside it.
 */
export function floeParts(p) {
  const P = [], seed = seedOf(p), spin = seed * 0.41;
  P.push(placed(jitter(new THREE.CylinderGeometry(p.r * 1.02, p.r * 0.9, 0.62, 9, 1), 0.07, seed), C.ice, p, { y: p.top - 0.31, ry: spin }, { c2: C.iceDeep, split: 0.45 }));
  P.push(placed(new THREE.CylinderGeometry(p.r * 0.9, p.r * 0.97, 0.05, 9), C.iceLight, p, { y: p.top - 0.01, ry: spin }));
  P.push(placed(mound(p.r * 0.34, 0.22), C.snow, p, { x: Math.cos(spin) * p.r * 0.42, y: p.top + 0.01, z: Math.sin(spin) * p.r * 0.42 }));
  const a = spin + 2.2;
  P.push(placed(jitter(new THREE.DodecahedronGeometry(p.r * 0.24, 0), 0.04, seed + 3), C.ice, p, { x: Math.cos(a) * p.r * 1.3, y: 0.02, z: Math.sin(a) * p.r * 1.3, sy: 0.5 }, { c2: C.iceDeep, split: 0.5 }));
  return P;
}

/**
 * A step or a block of rock under snow. `carved` (near home): a stair with a
 * tread of packed snow; otherwise a block with a thick drift on top.
 */
export function snowBlockParts(p) {
  const P = [], w = p.hx * 2, d = p.hz * 2, H = p.top - (p.base ?? 0) + 0.6, seed = seedOf(p);
  P.push(placed(new THREE.BoxGeometry(w, H, d), C.rock, p, { y: p.top - H / 2 }, { c2: C.rockDark, split: 0.65 }));
  if (p.carved) {
    P.push(placed(new THREE.BoxGeometry(w + 0.05, 0.13, d + 0.05), C.snow, p, { y: p.top - 0.045 }, { c2: C.snowShade, split: 0.3 }));
    return P;
  }
  P.push(placed(jitter(new THREE.BoxGeometry(w + 0.14, 0.26, d + 0.14, 3, 1, 3), 0.05, seed), C.snow, p, { y: p.top - 0.11 }, { c2: C.snowShade, split: 0.35 }));
  // snow slumping over one edge, and a few icicles under the outer one
  P.push(placed(mound(Math.min(w, d) * 0.3, 0.5), C.snow, p, { x: w * 0.3, y: p.top - 0.3, z: -d / 2 + 0.05 }));
  P.push(...icicles(p, -w / 2, w / 2, p.top - 0.22, -d / 2 - 0.02, seed, 0.5));
  return P;
}

/** A little snowman, by someone who rested here first. Local (x, z) on the piece, facing out (-z). */
function snowman(p, x, z) {
  const P = [], y = p.top;
  P.push(placed(new THREE.SphereGeometry(0.24, 8, 6), C.snow, p, { x, y: y + 0.2, z }, { c2: C.snowShade, split: 0.3 }));
  P.push(placed(new THREE.SphereGeometry(0.17, 8, 6), C.snow, p, { x, y: y + 0.53, z }, { c2: C.snowShade, split: 0.3 }));
  P.push(placed(new THREE.ConeGeometry(0.035, 0.16, 5), C.carrot, p, { x, y: y + 0.54, z: z - 0.2, rx: -Math.PI / 2 }));
  for (const s of [-1, 1]) P.push(placed(new THREE.SphereGeometry(0.022, 5, 4), C.coal, p, { x: x + s * 0.06, y: y + 0.6, z: z - 0.15 }));
  P.push(placed(new THREE.TorusGeometry(0.13, 0.035, 5, 10), C.scarf, p, { x, y: y + 0.41, z, rx: Math.PI / 2 }));
  for (const s of [-1, 1]) P.push(placed(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 4), C.poleDark, p, { x: x + s * 0.3, y: y + 0.38, z, rz: s * -1.1 }));
  return P;
}

/**
 * A ledge of rock under snow, jutting from the face (+z is into the wall),
 * icicles along its outer edge. A rest between climbs (`vista`) is thicker
 * and has a snowman at the back.
 */
export function frostLedgeParts(p) {
  const P = [], w = p.hx * 2, d = p.hz * 2 + 0.8, vista = p.kind === 'vista', th = vista ? 0.7 : 0.5, seed = seedOf(p);
  P.push(placed(jitter(new THREE.BoxGeometry(w, th, d, 3, 1, 2), 0.06, seed), C.rock, p, { y: p.top - 0.1 - th / 2, z: 0.4 }, { c2: C.rockDark, split: 0.55 }));
  P.push(placed(jitter(new THREE.BoxGeometry(w + 0.1, 0.2, d + 0.06, 3, 1, 2), 0.04, seed + 1), C.snow, p, { y: p.top - 0.09, z: 0.4 }, { c2: C.snowShade, split: 0.35 }));
  P.push(placed(new THREE.ConeGeometry(Math.min(w, d) * 0.28, 0.8, 5), C.rockDark, p, { y: p.top - th - 0.45, z: 0.3, rx: Math.PI }));
  P.push(...icicles(p, -w / 2, w / 2, p.top - 0.18, -p.hz - 0.02, seed));
  if (vista) P.push(...snowman(p, (seed % 2 ? 1 : -1) * (p.hx - 0.45), p.hz - 0.35));
  return P;
}

/**
 * A shelf of ice on the face: a thick blue slab, pale and scored on top where
 * feet have slid, long icicles beneath (+z is into the wall).
 */
export function iceShelfParts(p) {
  const P = [], w = p.hx * 2, d = p.hz * 2 + 0.8, seed = seedOf(p);
  P.push(placed(jitter(new THREE.BoxGeometry(w, 0.5, d, 4, 1, 2), 0.07, seed), C.ice, p, { y: p.top - 0.26, z: 0.4 }, { c2: C.iceDeep, split: 0.5 }));
  P.push(placed(new THREE.BoxGeometry(w * 0.97, 0.04, d * 0.93), C.iceLight, p, { y: p.top - 0.01, z: 0.4 }));
  // score marks along the way you slide
  for (let i = 0; i < 3; i++) {
    const z = -p.hz * 0.55 + i * p.hz * 0.5, L = w * (0.3 + 0.2 * Math.abs(Math.sin(seed + i)));
    P.push(placed(new THREE.BoxGeometry(L, 0.012, 0.035), C.iceEdge, p, { x: (Math.sin(seed * 1.3 + i * 2) * (w - L)) / 2.4, y: p.top + 0.012, z, ry: 0.06 * Math.sin(seed + i * 3) }));
  }
  P.push(...icicles(p, -w / 2, w / 2, p.top - 0.44, -p.hz + 0.05, seed, 0.3));
  P.push(...icicles(p, -w / 2 + 0.2, w / 2 - 0.2, p.top - 0.46, 0.1, seed + 7, 0.55));
  return P;
}

/** A tier of needles hanging round a trunk at (x, z): a scalloped cone, its skirt at y. */
function needleTier(x, y, z, r, h, turn, snow) {
  const P = [part(skirtCone(r, h, 10), C.needle, { x, y: y + h / 2, z, ry: turn, c2: C.needleDark, split: 0.3 })];
  if (snow) P.push(part(skirtCone(r * 0.64, h * 0.45, 10), C.snow, { x, y: y + h * 0.78, z, ry: turn + 0.3 }));
  return P;
}

/**
 * The top of a pine to hop onto: a bare trunk from the ground, a few tiers of
 * needles under a flat cap of snow. The needles stay inside the cap's edge
 * and below where you stand.
 */
export function pineTopParts(p) {
  const P = [], seed = seedOf(p), y0 = (p.base ?? 0) - 0.5, H = p.top - 0.2 - y0;
  P.push(placed(new THREE.CylinderGeometry(0.2, 0.36, H, 7), C.trunk, p, { y: y0 + H / 2 }, { c2: C.trunkDark, split: 0.4 }));
  // tiers down the last few metres of the trunk, wider as they go down
  const n = Math.min(3, Math.max(1, Math.floor((H - 0.6) / 1.1)));
  for (let i = 0; i < n; i++) P.push(...needleTier(p.cx, p.top - 1.25 - i * 1.0, p.cz, p.r * (0.9 + i * 0.08), 1.25, seed + i * 0.5, i > 0));
  // a tall trunk keeps a few thinner tiers further down
  for (let y = p.top - 5.2, i = 0; y > (p.base ?? 0) + 1.2 && i < 5; y -= 2.4, i++) P.push(...needleTier(p.cx, y, p.cz, p.r * (0.7 + 0.1 * (i % 2)), 1.3, seed + i, i % 2 === 0));
  // the cap: packed snow on the flattened top, a soft rim drooping over the needles
  P.push(placed(new THREE.CylinderGeometry(p.r, p.r * 0.9, 0.3, 12), C.snow, p, { y: p.top - 0.15, ry: seed }, { c2: C.snowShade, split: 0.4 }));
  for (let i = 0; i < 5; i++) {
    const a = seed + (i / 5) * Math.PI * 2;
    P.push(placed(mound(p.r * 0.36, 0.5).rotateX(Math.PI), C.snowShade, p, { x: Math.cos(a) * p.r * 0.72, y: p.top - 0.28, z: Math.sin(a) * p.r * 0.72 }));
  }
  return P;
}

/** A bough of the great pine to stand on (a disc piece with `pine`): a pad of snow on a fan of needles. */
export function pineDiscParts(p) {
  const seed = seedOf(p);
  return [
    placed(new THREE.CylinderGeometry(p.r, p.r * 0.88, 0.26, 12), C.snow, p, { y: p.top - 0.13, ry: seed }, { c2: C.snowShade, split: 0.4 }),
    placed(skirtCone(p.r * 1.04, 0.7, 10), C.needle, p, { y: p.top - 0.55, ry: seed, rx: Math.PI }, { c2: C.needleDark, split: 0.5 }),
    ...icicles(p, -p.r * 0.6, p.r * 0.6, p.top - 0.24, -p.r * 0.8, seed, 0.45),
  ];
}

/**
 * The chest's tree: a great snow pine. A thick trunk, a bough out to each
 * pad, tiers of needles round the trunk between them (inside the ring of
 * pads) and a snowy crown above the last.
 */
export function lookoutPineParts(tree, discs) {
  const P = [], y0 = tree.base - 0.5, H = tree.top - y0;
  const at = (g, color, t, extra = {}) => { const q = part(g, color, { ...t, ...extra }); q.translate(tree.x, 0, tree.z); return q; };
  P.push(at(new THREE.CylinderGeometry(0.62, 0.95, H, 10), C.trunk, { y: y0 + H / 2 }, { c2: C.trunkDark, split: 0.3 }));
  for (const d of discs) {
    const dx = d.cx - tree.x, dz = d.cz - tree.z, L = Math.hypot(dx, dz);
    const g = new THREE.CylinderGeometry(0.15, 0.24, L, 6).rotateZ(Math.PI / 2);
    g.rotateY(-Math.atan2(dz, dx));
    P.push(at(g, C.trunkDark, { x: dx / 2, y: d.top - 0.5, z: dz / 2 }));
  }
  // needles round the trunk: a tier under each pad's height, kept inside the ring the pads stand on
  const rMax = Math.max(1, (tree.orbit || 2.6) - 1.25);
  discs.forEach((d, i) => { if (d.top - 1.6 > tree.base + 0.4) P.push(...needleTier(tree.x, d.top - 1.6, tree.z, rMax * (i % 2 ? 0.85 : 1), 1.7, i * 0.7, i % 2 === 0)); });
  // the crown above the last pad
  const tiers = [[1.7, 1.9, 0.2], [1.3, 1.7, 1.3], [0.9, 1.5, 2.3], [0.5, 1.2, 3.2]];
  tiers.forEach(([r, h, y], i) => P.push(...needleTier(tree.x, tree.top + y, tree.z, r, h, i * 0.4, true)));
  return P;
}

/** The summit's cairn: a stack of flat stones under snow (its pennant is cold-life.js). c: { x, y, z }. */
export function cairnParts(c) {
  const P = [];
  const at = (g, color, t, extra = {}) => { const q = part(g, color, { ...t, ...extra }); q.translate(c.x, c.y, c.z); return q; };
  [[0.46, 0.26], [0.38, 0.22], [0.3, 0.2], [0.22, 0.18]].reduce((y, [r, h], i) => {
    P.push(at(jitter(new THREE.CylinderGeometry(r * 0.9, r, h, 6), 0.04, 20 + i), i % 2 ? C.rock : C.rockDark, { y: y + h / 2, ry: i * 0.9 }, { c2: C.rockDark, split: 0.4 }));
    return y + h - 0.02;
  }, -0.05);
  P.push(at(mound(0.2, 0.5), C.snow, { y: 0.8 }));
  P.push(at(mound(0.6, 0.25), C.snow, { y: -0.04 }));
  return P;
}

/**
 * The pole a pennant flies from: at (x, y, z), `h` tall, leaning a little
 * with the wind, a drift of snow at its foot. Returns the parts; the pennant
 * itself moves (cold-life.js).
 */
export function poleParts(x, y, z, h = 2.7) {
  const at = (g, color, t) => { const q = part(g, color, t); q.translate(x, y, z); return q; };
  return [
    at(new THREE.CylinderGeometry(0.035, 0.05, h + 0.3, 5), C.pole, { y: h / 2 - 0.15 }),
    at(new THREE.SphereGeometry(0.06, 6, 4), C.poleDark, { y: h + 0.02 }),
    at(mound(0.28, 0.4), C.snow, { y: -0.02 }),
  ];
}
