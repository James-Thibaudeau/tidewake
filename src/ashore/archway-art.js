// The look of Archway Isle's walkable level: the rock you stand on (ledges,
// sea stacks, the steps over the great arch, the shelves round the seaward
// stack), the arch's body, the camp in the cove with grandfather's weather
// board, his cairns and handline, and the storm cave. Everything is built
// straight into archway space as vertex-coloured parts, to be merged into a
// few meshes by archway.js. The layout is archway-layout.js.
import * as THREE from 'three';
import { part, jitter } from '../props.js';
import { mulberry32, noise2, lerp, TAU } from '../util.js';
import { groundH } from './archway-layout.js';

export const C = {
  rock: '#8f877e', rock2: '#746c65', band: '#a48d72', wet: '#4f4944', top: '#b4ada2', turf: '#86ab55', turf2: '#76984b',
  shingle: '#cfc6b2', shingle2: '#b8ae9a', grass: '#86ab55', grass2: '#76984b', scree: '#a39a8d', seabed: '#a2967f',
  rope: '#d9c08a', iron: '#3b3f45', plank: '#b98a52', plank2: '#8f6a3e', chalk: '#f2efe6', ash: '#3a3330', ember: '#c4582c',
  cave: '#1f1a17', guano: '#e9e5da',
  slate: '#5f5a57', paper: '#efe3c4', leather: '#7a4a24', oilskin: '#5d6b3a',
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
  const band = Math.floor((y + 40 + n * 0.6) / 1.5) % 4;
  return band === 1 ? C.band : band === 3 ? C.rock2 : C.rock;
}

/**
 * Colour a (non-indexed) rock geometry a face at a time: faces that look up
 * get `top` (or turf in patches), steep ones a band of strata by the height
 * of their row (the middle of their lowest and highest corners, which the two
 * halves of a quad share, so bands run level), wet near the water. A whole
 * face takes one colour, so the bands stay crisp. `fluted`: steep faces
 * take a tone that varies along the cliff instead (for terrain, whose faces
 * are too tall to band).
 */
export function bandFaces(g, { flat = 0.6, top = C.top, turf = 0, seed = 0, keepFlat = false, fluted = false } = {}) {
  const p = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.set(p.getX(i), p.getY(i), p.getZ(i));
    b.set(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)).sub(a);
    d.set(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)).sub(a);
    const n = b.cross(d).normalize();
    const cx = a.x + (b.x + d.x) / 3, cz = a.z + (b.z + d.z) / 3;
    const ys = [p.getY(i), p.getY(i + 1), p.getY(i + 2)], cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (n.y > flat) {
      if (keepFlat) continue;
      c.set(turf && noise2(cx * 0.6, cz * 0.6, seed + 3) > 1 - turf * 2 ? C.turf : top);
    }
    else if (Math.max(...ys) < 1.4) c.set(C.wet);
    else if (fluted) { const f = noise2(cx * 0.35, cz * 0.35, seed + 7); c.set(f > 0.25 ? C.rock2 : f < -0.3 ? C.band : C.rock); }
    else c.set(strata(cy, cx, cz));
    for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
  }
  return g;
}

/**
 * A shelf of rock growing out of a wall (on the piece's local -z, or +z with
 * wall: 1): an uneven top with ragged edges, and an underside that tapers back
 * into the rock, deep at the wall and thin at the lip. It reaches `into`
 * metres further into the wall than the piece's collider, so it always meets
 * the cliff.
 */
function shelfRock(p, seed, { deep = 2.8, lip = 0.9, into = 1.2, turf = 0.25, wall = -1 } = {}) {
  const hx = p.hx, hz = p.hz + into / 2;
  const g = box(hx * 2, 1, hz * 2, Math.max(3, Math.round(hx * 2.6)), 2, 4);
  const q = g.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i), y = q.getY(i), z = q.getZ(i);
    const t = Math.min(1, Math.max(0, (z + hz) / (2 * hz))); // 0 at the wall, 1 at the lip
    const n = noise2(x * 0.9 + seed, z * 0.9, 41), m = noise2(x * 1.7, z * 1.7 + seed, 43);
    const nx = x * (1 + 0.1 * m * (Math.abs(x) > hx - 0.01 ? 1 : 0));
    const nz = z + (t > 0.99 ? 0.28 * n : 0) - into / 2;
    const ny = y > 0 ? 0.05 * m : -lerp(deep, lip, t ** 2.2) * (1 - 0.35 * (Math.abs(x) / hx) ** 2) + 0.15 * n;
    q.setXYZ(i, nx, ny, nz);
  }
  // a wall on +z: the same shelf turned half round
  const out = placed(g, C.top, wall > 0 ? { ...p, rot: p.rot + Math.PI } : p, { y: p.top });
  out.computeVertexNormals();
  return bandFaces(out, { turf, seed });
}

/** A column of rock from the sea floor up to `top`: lumpy, banded, its cap pale. */
function column(x, z, r, y0, top, seed) {
  const h = top - y0, rows = Math.max(2, Math.round(h / 1.1));
  const g = new THREE.CylinderGeometry(r, r * 1.08, h, 11, rows, false);
  const q = g.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const px = q.getX(i), py = q.getY(i), pz = q.getZ(i), a = Math.atan2(pz, px), rr = Math.hypot(px, pz);
    if (rr < 0.01) continue;
    // ledges of harder rock stick out a little at some heights, and the whole face is lumpy
    const k = 1 + 0.1 * noise2(Math.cos(a) * 2 + seed, py * 0.35 + Math.sin(a) * 2, 51) + 0.06 * Math.sin((py + seed) * 1.9);
    q.setXYZ(i, px * k, py, pz * k);
  }
  const out = part(g, C.top, { x, y: y0 + h / 2, z, ry: seed });
  out.computeVertexNormals();
  return [bandFaces(out, { flat: 0.75, turf: 0.15, seed })];
}

/** The art for one walkable piece. */
export function pieceArt(p, i) {
  switch (p.kind) {
    case 'ledge': return [shelfRock(p, 90 + i)];
    case 'span': {
      // a little arch of rock over an inlet: the deck, and a curve of stones under it
      const P = [shelfRock(p, 140 + i, { deep: 1.2, lip: 0.8, into: 0, turf: 0.35 })];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, lx = lerp(-p.hx + 0.5, p.hx - 0.5, t), drop = 0.9 + 3.2 * (1 - Math.sin(t * Math.PI));
        P.push(placed(jitter(new THREE.DodecahedronGeometry(0.75, 0), 0.2, 300 + i * 9 + k), strata(p.top - drop, p.cx, p.cz), p, { x: lx, y: p.top - drop, s: 1.1 }));
      }
      return P;
    }
    case 'stack': return column(p.cx, p.cz, p.r, -6, p.top, 400 + i);
    case 'shelf': return [shelfRock(p, 500 + i, { deep: 1.6, lip: 0.4, into: 0.6, turf: 0.1, wall: 1 })];
    case 'top': {
      const g = jitter(new THREE.CylinderGeometry(p.r, p.r * 0.96, 0.5, 14, 1), 0.12, 600);
      return [part(g, C.turf, { x: p.cx, y: p.top - 0.25, z: p.cz, c2: C.top, split: 0.7 })];
    }
    case 'tier': {
      // a step of the gully: a block of rock, pale and worn on top, tucked into the walls either side
      const g = jitter(box(p.hx * 2, p.thick, p.hz * 2 + 0.04, 3, 1, 2), 0.07, 760 + i);
      const out = placed(g, C.top, p, { y: p.top - p.thick / 2 });
      out.computeVertexNormals();
      return [bandFaces(out, { flat: 0.7, turf: 0.2, seed: 760 + i })];
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
      // past the walk, over the arms' tips, the rock goes no higher than the
      // ground: you walk on the ground there, so you mustn't wade through rock
      const gh = Math.abs(x) > A.archX - 2.5 ? groundH(x, z) : -Infinity;
      pos.push(x, gh > 0.5 ? Math.min(y, gh - 0.12) : y, z);
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
  P.push(bandFaces(g.toNonIndexed(), { flat: 0.7 }));
  for (const s of L.steps) {
    const ax = Math.abs(s.cx);
    // rubble along both edges of the walk
    const keystone = Math.abs(s.cx - L.flag.cx) < s.hx + L.flag.hx; // kept clear for his mark
    for (const side of [-1, 1]) {
      if (rng() < 0.35 || keystone) continue;
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

// --------------------------------------------------------------- the story
/** The note pinned to the weather board, under the readings. */
export function noteParts(camp) {
  const at = { cx: camp.x, cz: camp.z, rot: camp.rot }, y = camp.y;
  return [
    placed(box(0.24, 0.3, 0.02), C.paper, at, { x: -0.25, y: y + 1.33, z: 0.145, rz: 0.07 }),
    placed(box(0.04, 0.04, 0.04), C.iron, at, { x: -0.25, y: y + 1.45, z: 0.155 }),
  ];
}

/**
 * The keystone: the dark flagstone his official record is scratched into
 * (the scratches themselves are markDecal), and the stone he left his journal under.
 */
export function keystoneParts(L) {
  const F = L.flag, S = L.pouch, P = [];
  const slab = jitter(box(F.hx * 2, 0.2, F.hz * 2, 3, 1, 2), 0.035, 1610);
  const q = slab.attributes.position;
  for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) q.setY(i, 0.1);   // a flat top to write on
  P.push(part(slab, C.slate, { x: F.cx, y: F.top - 0.1, z: F.cz, c2: C.rock2, split: 0.35 }));
  P.push(part(jitter(new THREE.DodecahedronGeometry(0.3, 0), 0.07, 1620), C.rock, { x: S.x - 0.14, y: S.y + 0.15, z: S.z + 0.08, sx: 1.15, sy: 0.62, ry: 0.5, c2: C.top, split: 0.55 }));
  return P;
}

/** Journal IV in its oilskin pouch, half under the stone (shown while it waits to be found). */
export function pouchParts(L) {
  const S = L.pouch, at = { cx: S.x, cz: S.z, rot: 0.55 };
  return [
    placed(box(0.4, 0.1, 0.3), C.oilskin, at, { x: 0.16, y: S.y + 0.06, z: -0.1, rz: 0.06 }),
    placed(box(0.42, 0.03, 0.05), C.rope, at, { x: 0.16, y: S.y + 0.115, z: -0.1, rz: 0.06 }),
    placed(box(0.2, 0.06, 0.24), C.leather, at, { x: 0.36, y: S.y + 0.065, z: -0.1 }),
    placed(box(0.17, 0.04, 0.22), C.paper, at, { x: 0.38, y: S.y + 0.065, z: -0.1 }),
  ];
}

/**
 * What he scratched into the flagstone: two initials (worn smooth, so they
 * stay unread), SAILED THROUGH, and an arrow. Drawn pale on clear, to lie on
 * the stone. Returns a canvas texture.
 */
export function markTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 384;
  const g = cv.getContext('2d'), rng = mulberry32(1630);
  g.strokeStyle = g.fillStyle = '#efe9dc';
  g.lineCap = 'round'; g.lineJoin = 'round';
  // a scratch: a line drawn two or three times, never quite in the same place
  const scratch = (pts, w = 5) => {
    for (let pass = 0; pass < 3; pass++) {
      g.lineWidth = w * (pass ? 0.45 : 1);
      g.globalAlpha = pass ? 0.55 : 0.9;
      g.beginPath();
      pts.forEach(([x, y], i) => { const px = x + (rng() - 0.5) * 5 * pass, py = y + (rng() - 0.5) * 5 * pass; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke();
    }
  };
  // letters as strokes on a 4 x 6 grid, cut with a knife: all straight lines
  const GLYPH = {
    S: [[[4, 0], [0, 0], [0, 3], [4, 3], [4, 6], [0, 6]]],
    A: [[[0, 6], [2, 0], [4, 6]], [[1, 3.6], [3, 3.6]]],
    I: [[[2, 0], [2, 6]]],
    L: [[[0, 0], [0, 6], [4, 6]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
    D: [[[0, 0], [0, 6], [2.6, 6], [4, 4.4], [4, 1.6], [2.6, 0], [0, 0]]],
    T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
    H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    R: [[[0, 6], [0, 0], [4, 0], [4, 3], [0, 3]], [[1.6, 3], [4, 6]]],
    O: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]],
    U: [[[0, 0], [0, 6], [4, 6], [4, 0]]],
    G: [[[4, 0], [0, 0], [0, 6], [4, 6], [4, 3.4], [2.2, 3.4]]],
  };
  const word = (text, x0, y0, u) => {
    let x = x0;
    for (const ch of text) {
      const tilt = (rng() - 0.5) * 0.9 * u, lift = (rng() - 0.5) * 0.7 * u;
      for (const line of GLYPH[ch]) scratch(line.map(([px, py]) => [x + px * u + (py / 6) * tilt, y0 + py * u + lift]), u * 0.62);
      x += u * 5.6;
    }
  };
  word('SAILED', 104, 112, 9.5);
  word('THROUGH', 64, 204, 9.5);
  // the arrow, pointing out to sea (to the left of the words)
  scratch([[420, 320], [96, 320]], 7);
  scratch([[146, 290], [96, 320], [146, 350]], 7);
  // his initials above: gouges the weather has rounded off, too soft to read
  g.globalAlpha = 0.5;
  for (const [x, y, w, h, r] of [[196, 50, 14, 46, 0.2], [214, 44, 36, 13, -0.3], [300, 50, 14, 46, -0.15], [320, 62, 30, 13, 0.4]]) {
    g.save(); g.translate(x, y); g.rotate(r);
    g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat geometry for the mark, lying on the flagstone so it reads the right way up as you walk out from the shoulder. */
export function markGeometry(F) {
  const g = new THREE.PlaneGeometry(F.hz * 2 - 0.08, F.hx * 2 - 0.06);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-Math.PI / 2);   // the top of the writing towards +x, the arrow out to sea (-z)
  g.translate(F.cx, F.top + 0.012, F.cz);
  return g;
}

/**
 * Grandfather's storm lantern at a checkpoint `c`: an iron crook driven into
 * the rock, the lantern hanging from it at c.lamp (where ashore.js puts the
 * flame), out over the seaward edge of the arch.
 */
export function stormLanternParts(c) {
  const P = [], l = c.lamp, at = (x, y, z) => [c.x + x, c.y + y, c.z + z];
  const brass = '#b8893a', top = l.y + 0.5;
  // the crook: up, over and down to the hook
  P.push(rod(at(0, -0.1, 0), at(0, top, -0.04), 0.045, C.iron));
  P.push(rod(at(0, top, -0.04), at(0, top + 0.1, l.z * 0.55), 0.04, C.iron));
  P.push(rod(at(0, top + 0.1, l.z * 0.55), at(0, top - 0.06, l.z), 0.035, C.iron));
  P.push(rod(at(0, top - 0.06, l.z), at(0, l.y + 0.3, l.z), 0.02, C.iron));
  P.push(part(new THREE.DodecahedronGeometry(0.16, 0), C.rock2, { x: c.x + 0.08, y: c.y + 0.06, z: c.z + 0.05, sy: 0.6 }));
  // the lantern: a brass cap and base, four bars and two guard rings round the glass
  const [x, y, z] = at(l.x, l.y, l.z);
  P.push(part(new THREE.TorusGeometry(0.05, 0.012, 4, 10), brass, { x, y: y + 0.3, z }));
  P.push(part(new THREE.ConeGeometry(0.17, 0.13, 8), brass, { x, y: y + 0.22, z }));
  P.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8), C.iron, { x, y: y + 0.15, z }));
  P.push(part(new THREE.CylinderGeometry(0.15, 0.16, 0.06, 8), brass, { x, y: y - 0.19, z }));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    P.push(part(box(0.018, 0.32, 0.018), C.iron, { x: x + Math.cos(a) * 0.135, y: y - 0.01, z: z + Math.sin(a) * 0.135 }));
  }
  for (const dy of [-0.08, 0.07]) P.push(part(new THREE.TorusGeometry(0.137, 0.009, 4, 12), C.iron, { x, y: y + dy, z, rx: Math.PI / 2 }));
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
  // the dark inside, set back in the rock behind where the vault stands
  P.push(part(new THREE.SphereGeometry(1, 14, 10), C.cave, { x: cave.x + 2.5, y: floorY + 1.5, z: cave.z, sx: 1.3, sy: 2.2, sz: 2.6 }));
  // the lintel: an arch of big stones over the mouth, high enough that the
  // view out past you clears it
  for (let k = 0; k < 9; k++) {
    const a = -1.25 + (k / 8) * 2.5;
    P.push(part(jitter(new THREE.DodecahedronGeometry(1.1, 0), 0.25, 1400 + k), strata(floorY + 2 + Math.cos(a) * 2), {
      x: cave.x - 0.5, y: floorY + 1.2 + Math.cos(a) * 3.3, z: cave.z + Math.sin(a) * 3.2, s: 1.2 }));
  }
  return P;
}
