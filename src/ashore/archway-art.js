// The look of Archway Isle's walkable level: the rock you stand on (ledges,
// sea stacks, the steps over the great arch, the shelves round the seaward
// stack), the arch's body, the camp in the cove with grandfather's weather
// board, his cairns and handline, and the storm cave. Everything is built
// straight into archway space as vertex-coloured parts, to be merged into a
// few meshes by archway.js. The layout is archway-layout.js.
import * as THREE from 'three';
import { part, jitter } from '../props.js';
import { mulberry32, noise2, lerp, TAU } from '../util.js';

export const C = {
  rock: '#9b9389', rock2: '#7f776f', band: '#b39a78', wet: '#4f4944', top: '#b4ada2', turf: '#86ab55', turf2: '#76984b',
  shingle: '#cfc6b2', shingle2: '#b8ae9a', grass: '#86ab55', grass2: '#76984b', scree: '#a39a8d', seabed: '#a2967f',
  rope: '#d9c08a', iron: '#3b3f45', plank: '#b98a52', plank2: '#8f6a3e', chalk: '#f2efe6', ash: '#3a3330', ember: '#c4582c',
  cave: '#1f1a17', guano: '#e9e5da',
};

/** A part placed in a piece's frame: local transform, then the piece's turn, then its centre. */
export function placed(geo, color, p, t = {}) {
  const g = part(geo, color, t);
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}
export const box = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(x, y, z, sx, sy, sz);

/** Strata: warm and dark bands up a rock face, by height. */
export function strata(y, x = 0, z = 0) {
  const n = noise2(x * 0.13, z * 0.13, 21);
  const band = Math.floor((y + 40 + n * 0.6) / 1.9) % 3;
  return band === 1 ? C.band : band === 2 ? C.rock2 : C.rock;
}

/** A rough slab of rock: jittered, pale on top, its sides banded. */
function slab(p, len, depth, thick, seed, topColor = C.top) {
  const g = jitter(box(len, thick, depth, Math.max(2, Math.round(len)), 1, 2), 0.16, seed);
  return placed(g, topColor, p, { y: p.top - thick / 2 - 0.02, c2: strata(p.top - 1, p.cx, p.cz), split: 0.78, soft: 0.03 });
}

/** A column of rock from the sea floor up to `top`, banded all the way. */
function column(x, z, r, y0, top, seed, cap = C.top) {
  const P = [], rng = mulberry32(seed);
  for (let y = y0; y < top - 0.01;) {
    const h = Math.min(top - y, 1.6 + rng() * 0.8), last = y + h >= top - 0.01;
    const g = jitter(new THREE.CylinderGeometry(r * (0.96 + rng() * 0.08), r * (1 + rng() * 0.06), h, 9, 1), 0.12 * r, seed + y * 7);
    P.push(part(g, last ? cap : strata(y + h / 2, x, z), { x, y: y + h / 2, z, ry: rng() * TAU, c2: last ? strata(y, x, z) : null, split: 0.8 }));
    y += h;
  }
  return P;
}

/** The art for one walkable piece. */
export function pieceArt(p, i) {
  switch (p.kind) {
    case 'ledge': return [slab(p, p.hx * 2, p.hz * 2, 0.8, 90 + i)];
    case 'span': {
      // a little arch of rock over an inlet: the slab, and a curve of stones under it
      const P = [slab(p, p.hx * 2, p.hz * 2, 0.9, 140 + i)];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, lx = lerp(-p.hx + 0.5, p.hx - 0.5, t), drop = 0.9 + 3.2 * (1 - Math.sin(t * Math.PI));
        P.push(placed(jitter(new THREE.DodecahedronGeometry(0.75, 0), 0.2, 300 + i * 9 + k), strata(p.top - drop, p.cx, p.cz), p, { x: lx, y: p.top - drop, s: 1.1 }));
      }
      return P;
    }
    case 'stack': return column(p.cx, p.cz, p.r, -6, p.top, 400 + i);
    case 'shelf': return [slab(p, p.hx * 2, p.hz * 2, 0.6, 500 + i)];
    case 'top': {
      const g = jitter(new THREE.CylinderGeometry(p.r, p.r * 0.96, 0.5, 14, 1), 0.12, 600);
      return [part(g, C.turf, { x: p.cx, y: p.top - 0.25, z: p.cz, c2: C.top, split: 0.7 })];
    }
    case 'step': {
      // one stone of the arch's back: pale and worn on top
      const g = jitter(box(p.hx * 2 + 0.06, 0.5, p.hz * 2, 2, 1, 2), 0.06, 700 + i);
      return [placed(g, C.top, p, { y: p.top - 0.25, c2: C.rock, split: 0.6 })];
    }
    default: return [];
  }
}

/**
 * The great arch's body under its walkable back: one lumpy mass of banded
 * rock lofted along the walk, from the sea floor at the legs to a curve 10 m
 * over the channel, with rubble along the edges of the walk and crabs living
 * upside down on its underside.
 */
export function archBody(L, A) {
  const P = [], rng = mulberry32(811);
  const inner = A.archX - 4.2, end = A.archX + 4;
  const under = (ax) => (ax < inner ? 10 * (1 - (ax / inner) ** 2) : -6);
  // the walk's top along x (the steps), carried on over the arms' tips
  const topAt = (x) => {
    let best = L.steps[0];
    for (const s of L.steps) if (Math.abs(s.cx - x) < Math.abs(best.cx - x)) best = s;
    return Math.abs(x) > A.archX - 2 ? L.yEnd - 0.3 : best.top - 0.45;
  };
  const segs = 64, radial = 20, pos = [], col = [], idx = [], c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const x = -end + (2 * end * i) / segs, ax = Math.abs(x);
    const top = topAt(x), bot = Math.min(top - 2, under(ax)), yc = (top + bot) / 2, hh = (top - bot) / 2;
    const hd = (ax > inner ? 4.4 : 2.6 + 0.8 * (ax / inner) ** 2);
    for (let j = 0; j < radial; j++) {
      const t = (j / radial) * TAU, ct = Math.cos(t), st = Math.sin(t);
      // a rounded box in cross-section, lumpy
      const k = 1 + 0.12 * noise2(x * 0.3 + j * 0.7, t * 2, 31);
      const y = yc + Math.sign(st) * Math.abs(st) ** 0.45 * hh * (st > 0 ? 1 : k);
      const z = A.archZ + Math.sign(ct) * Math.abs(ct) ** 0.6 * hd * k;
      pos.push(x, y, z);
      c.set(st > 0.85 ? C.top : strata(y, x, z));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), cc = a + radial, d = b + radial;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  P.push(g.toNonIndexed());
  for (const s of L.steps) {
    const ax = Math.abs(s.cx);
    // rubble along both edges of the walk
    for (const side of [-1, 1]) {
      if (rng() < 0.35) continue;
      P.push(part(jitter(new THREE.DodecahedronGeometry(0.4, 0), 0.12, 1000 + Math.round(s.cx * 13) + side), rng() < 0.5 ? C.rock2 : C.rock,
        { x: s.cx + (rng() - 0.5) * s.hx, y: s.top + 0.12, z: s.cz + side * (s.hz - 0.2), sx: 1 + rng(), sy: 0.55 + rng() * 0.3, ry: rng() * TAU }));
    }
    // crabs on the underside over the channel
    if (ax < inner - 2 && rng() < 0.8) {
      for (let k = 0; k < 2; k++) P.push(...crab(s.cx + (rng() - 0.5) * 1.2, under(ax) - 0.12, s.cz + (rng() - 0.5) * 3.2, rng() * TAU));
    }
  }
  return P;
}

/** One small red crab, clinging upside down (its back to the sea). */
function crab(x, y, z, ry) {
  const P = [];
  P.push(part(new THREE.SphereGeometry(0.22, 8, 6), '#e0553a', { x, y, z, sx: 1.25, sy: 0.5, ry, c2: '#b33a26', split: 0.55 }));
  for (const s of [-1, 1]) P.push(part(box(0.3, 0.04, 0.05), '#b33a26', { x: x + Math.cos(ry) * s * 0.27, y: y + 0.03, z: z - Math.sin(ry) * s * 0.27, ry }));
  return P;
}

/** The seaward stack itself, under its shelves: a tall banded column. */
export function stackBody(S) {
  return column(S.x, S.z, S.r, -6, S.top - 0.4, 1200);
}

/** The camp in the cove: a fire ring, and grandfather's weather board on its post. */
export function campParts(camp) {
  const P = [], at = { cx: camp.x, cz: camp.z, rot: camp.rot }, y = camp.y;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU;
    P.push(placed(jitter(new THREE.DodecahedronGeometry(0.2, 0), 0.05, 1300 + k), C.rock2, at, { x: 2.2 + Math.cos(a) * 0.6, y: y + 0.12, z: Math.sin(a) * 0.6 }));
  }
  P.push(placed(new THREE.CylinderGeometry(0.5, 0.55, 0.08, 10), C.ash, at, { x: 2.2, y: y + 0.04 }));
  for (const r of [0.3, -0.5, 1.4]) P.push(placed(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 5), C.plank2, at, { x: 2.2, y: y + 0.14, ry: r, rz: Math.PI / 2 }));
  // the board: a plank on a post, his readings chalked down it, falling
  P.push(placed(box(0.14, 1.7, 0.14), C.plank2, at, { y: y + 0.85 }));
  P.push(placed(box(0.9, 0.62, 0.06), C.plank, at, { y: y + 1.45, z: 0.1 }));
  for (let k = 0; k < 5; k++) P.push(placed(box(0.34 - k * 0.04, 0.035, 0.01), C.chalk, at, { x: -0.18 + k * 0.08, y: y + 1.66 - k * 0.1, z: 0.135, rz: -0.15 }));
  P.push(placed(box(0.04, 0.4, 0.01), C.chalk, at, { x: 0.32, y: y + 1.42, z: 0.135 }));
  return P;
}

/** A small cairn of stacked stones: his trail markers along the cliff top. */
export function cairnParts(x, y, z, seed) {
  const P = [], rng = mulberry32(seed);
  let h = y;
  for (let k = 0; k < 4; k++) {
    const r = 0.36 - k * 0.07;
    P.push(part(jitter(new THREE.DodecahedronGeometry(r, 0), 0.06, seed + k), k % 2 ? C.rock : C.top, { x: x + (rng() - 0.5) * 0.06, y: h + r * 0.7, z: z + (rng() - 0.5) * 0.06, sy: 0.65, ry: rng() * TAU }));
    h += r * 1.25;
  }
  return P;
}

/** His handline: iron pins in the rock above the ledges, a rope slung between them. */
export function handlineParts(points) {
  const P = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y, z] = points[i];
    P.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5), C.iron, { x, y, z, rz: Math.PI / 2 }));
    if (!i) continue;
    const [px, py, pz] = points[i - 1];
    for (let k = 0; k < 4; k++) {
      // a sag between pins
      const t0 = k / 4, t1 = (k + 1) / 4, sag = (t) => -0.35 * Math.sin(t * Math.PI);
      const a = [lerp(px, x, t0), lerp(py, y, t0) + sag(t0), lerp(pz, z, t0)], b = [lerp(px, x, t1), lerp(py, y, t1) + sag(t1), lerp(pz, z, t1)];
      P.push(rod(a, b, 0.035, C.rope));
    }
  }
  return P;
}

/** A thin rod from a to b. */
export function rod(a, b, r, color) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return part(g, color, { x: a[0], y: a[1], z: a[2] });
}

/** The storm cave's mouth: an overhang of rock and the dark inside. */
export function caveParts(cave, floorY) {
  const P = [];
  P.push(part(new THREE.SphereGeometry(1, 12, 8), C.cave, { x: cave.x + 1.6, y: floorY + 1.3, z: cave.z, sx: 1.4, sy: 1.8, sz: 2.4 }));
  for (let k = 0; k < 7; k++) {
    const a = -1.3 + (k / 6) * 2.6;
    P.push(part(jitter(new THREE.DodecahedronGeometry(1.05, 0), 0.25, 1400 + k), strata(floorY + 2 + Math.cos(a) * 1.5), {
      x: cave.x + 0.3, y: floorY + 1.4 + Math.cos(a) * 2.2, z: cave.z + Math.sin(a) * 2.6, s: 1.15 }));
  }
  return P;
}
