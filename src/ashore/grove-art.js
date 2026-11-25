// The Elder Grove's bark, moss and fungus: the textured art that grove.js
// assembles into the level. Everything here is geometry and vertex colour
// (no textures), in grove space:
//   the trunk, with the deep wandering furrows and plates of an old giant;
//   bark for every limb (boughs, logs, stumps, roots, the root arches);
//   what you climb on (bark ledges, bracket fungus, pegs, leaf mats), with
//   moss tufts, ferns and small mushrooms;
//   life on the trunk: burls, moss cushions, fungus and climbing vines.
//
// The art never moves a walking surface: every piece's top stays at p.top
// (tufts rise a few centimetres), and the trunk's ridges stay inside its
// collider. Anything that sticks out of the trunk grows above head height.
import * as THREE from 'three';
import { part } from '../props.js';
import { mulberry32, noise2, clamp, smoothstep, TAU } from '../util.js';
import { pieceParts } from './pieces.js';
import { supportAt, GROVE } from './grove-layout.js';

export const C = {
  bark: '#6e4c30', bark2: '#553a25', furrow: '#38241a', root: '#654429', heart: '#b08a5a',
  ridge: '#a07a4c', moss3: '#557a30', lichen: '#a9b28c', ring: '#93714a',
  moss: '#6c8d3c', moss2: '#86a84a', hang: '#869a52', vine: '#4d6230', fern: '#4f9a40',
  leafD: '#2b6634', leafM: '#45973f', leafL: '#73c052',
  fungus: '#ead9b0', fungus2: '#c98a4a', fungus3: '#dcae6e', cap: '#b5523a', stem: '#efe6cf',
  petal: '#f6f1e6', pollen: '#f2c14a',
  iron: '#4a4a52', plank: '#b98a52', plank2: '#8f6a3e',
  hollow: '#1c120a', water: '#5fb3d4', stone: '#8f877d',
  grass: '#5fae48', grass2: '#4f9a40', shade: '#467f3a', sand: '#e6d7a8', sand2: '#d9c894', path: '#b59a6c',
  bed: '#7d7559', wet: '#5d6a4a',
  blaze: '#a37c54', cut: '#d9b98a', paper: '#efe3c4', leather: '#5b3a26',
};
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Turn a geometry by a piece's `rot` and move it to the piece's place. */
function seat(g, p) {
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}
/** A part in a piece's own frame: local transform, then the piece's turn and place. */
export function placed(geo, color, p, t = {}) {
  return seat(part(geo, color, t), p);
}
/** A rod from a to b ([x, y, z] each), r0 thick at a and r1 at b. */
export function rod(a, b, r0, r1, color, segs = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), segs, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return part(g, color);
}

// -------------------------------------------------------------------- bark
/**
 * Furrows for a tube of bark whose mesh is `cols` round and `rows` along.
 * They run down the mesh's own columns (a groove narrower than the mesh is
 * lost between its vertices), wander a column at a time, and close up for a
 * stretch now and then. The bark between two furrows is a plate; with
 * `cracks` the plates split across here and there.
 * Returns { depth, plate, cols, rows }: per vertex (row * cols + col), depth
 * is 1 down a furrow, `side` beside one and 0 on a plate; plate is a random
 * shade for the plate the vertex is on.
 */
function furrowGrid(cols, rows, count, seed, o = {}) {
  const { wander = 0.3, gap = 0.07, side = 0.35, cracks = 0 } = o;
  const depth = new Float32Array(cols * (rows + 1)), plate = new Float32Array(cols * (rows + 1));
  const rng = mulberry32(seed), at = (r, c) => r * cols + (((c % cols) + cols) % cols);
  const span = Math.max(0, Math.floor(cols / count / 2) - 1); // furrows never cross
  const lines = [];
  for (let f = 0; f < count; f++) {
    const base = Math.round(((f + 0.5) / count) * cols), line = [];
    let off = 0, shut = 0;
    for (let r = 0; r <= rows; r++) {
      if (rng() < wander) off = clamp(off + (rng() < 0.5 ? -1 : 1), -span, span);
      if (shut > 0) shut--; else if (rng() < gap) shut = 1 + Math.floor(rng() * 3);
      const c = base + off;
      line.push(c);
      if (shut > 0) continue;
      depth[at(r, c)] = 1;
      for (const d of [-1, 1]) depth[at(r, c + d)] = Math.max(depth[at(r, c + d)], side);
    }
    lines.push(line);
  }
  for (let f = 0; f < count; f++) {
    const L0 = lines[f], L1 = lines[(f + 1) % count];
    let shade = rng(), next = 2 + Math.floor(rng() * 6);
    for (let r = 0; r <= rows; r++) {
      const c0 = L0[r], c1 = L1[r] + (f === count - 1 ? cols : 0);
      const crack = cracks > 0 && --next <= 0;
      if (crack) { shade = rng(); next = 3 + Math.floor(rng() * 7); }
      for (let c = c0; c < c1; c++) {
        plate[at(r, c)] = shade;
        if (crack && c > c0 + 1 && c < c1 - 1) depth[at(r, c)] = Math.max(depth[at(r, c)], cracks);
      }
    }
  }
  return { depth, plate, cols, rows };
}
/** Where a vertex sits in a furrow grid: `turn` is its angle round the tube (0-1), `along` how far up it (0-1). */
const cell = (F, turn, along) => clamp(Math.round(along * F.rows), 0, F.rows) * F.cols + (((Math.round(turn * F.cols) % F.cols) + F.cols) % F.cols);

/**
 * Give each of the first `count` quads (six vertices each) one flat colour,
 * the mean of its corners. Smooth vertex colours blur a furrow into a soft
 * streak; flat ones keep bark crisp, in the cel-shaded style.
 */
function flatQuads(g, count = Infinity) {
  const col = g.attributes.color;
  for (let i = 0; i + 5 < Math.min(col.count, count * 6); i += 6) {
    let r = 0, gg = 0, b = 0;
    for (let k = i; k < i + 6; k++) { r += col.getX(k); gg += col.getY(k); b += col.getZ(k); }
    for (let k = i; k < i + 6; k++) col.setXYZ(k, r / 6, gg / 6, b / 6);
  }
  return g;
}

/**
 * Colour bark by how deep each vertex sits (0 on a plate, 1 down a furrow):
 * plates catch the light, furrows go dark, and moss settles wherever a face
 * looks at the sky. o: { moss (0-1), seed, base, quads (how many to colour flat) }.
 */
function barkColours(g, depth, shade, o = {}) {
  const { moss = 0.7, seed = 1, base = C.bark } = o;
  const col = g.attributes.color, pos = g.attributes.position, nor = g.attributes.normal;
  const ridge = new THREE.Color(C.ridge), mid = new THREE.Color(base), dark = new THREE.Color(C.furrow);
  const m1 = new THREE.Color(C.moss), m2 = new THREE.Color(C.moss2), t = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), d = depth[i];
    const n = noise2(x * 0.9 + y * 0.4, z * 0.9 - y * 0.4, seed);
    t.copy(ridge).lerp(mid, clamp(0.35 + shade[i] * 0.5 + n * 0.2, 0, 1));
    const k = moss * smoothstep(0.25, 0.8, nor.getY(i)) * (0.65 + 0.35 * n);
    if (k > 0) t.lerp(n > 0.1 ? m2 : m1, clamp(k, 0, 1));
    t.lerp(dark, d * 0.9);
    col.setXYZ(i, t.r, t.g, t.b);
  }
  return flatQuads(g, o.quads);
}

/**
 * A limb in bark: a cylinder along y (rTop at +y), furrowed along its length.
 * t: where it goes, as for part(). o: { radial, rows, furrows, cut (how deep,
 * as a share of the radius), lay (lie it along +x first, rTop at +x), moss, seed, base }.
 */
function barkLimb(rTop, rBot, len, t = {}, o = {}) {
  const { radial = 18, rows = 5, furrows = 6, cut = 0.2, seed = 1 } = o;
  const F = furrowGrid(radial, rows, furrows, 100 + seed, { gap: 0.14, side: 0 });
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, radial, rows).toNonIndexed();
  const p = geo.attributes.position, depth = new Float32Array(p.count), shade = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (Math.hypot(x, z) < 1e-4) continue; // the middle of an end
    const c = cell(F, Math.atan2(x, z) / TAU, y / len + 0.5);
    const k = 1 - cut * F.depth[c] - 0.05 * F.plate[c];
    p.setX(i, x * k); p.setZ(i, z * k);
    depth[i] = F.depth[c]; shade[i] = F.plate[c];
  }
  if (o.lay) geo.rotateZ(-Math.PI / 2);
  geo.computeVertexNormals();
  return barkColours(part(geo, o.base || C.bark, t), depth, shade, { ...o, quads: radial * rows });
}

/** The great trunk: fluted like a buttressed giant, its bark split by deep furrows into long plates. */
export function trunkParts(low) {
  const R = GROVE.trunkR, y0 = -1, y1 = GROVE.trunkTop, H = y1 - y0;
  const F = furrowGrid(low ? 104 : 152, low ? 40 : 72, low ? 15 : 21, 811, { cracks: 0.5, side: 0.55 });
  const geo = new THREE.CylinderGeometry(R, R, H, F.cols, F.rows, true).toNonIndexed();
  const p = geo.attributes.position, depth = new Float32Array(p.count), shade = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + y0 + H / 2, z = p.getZ(i), th = Math.atan2(z, x), c = Math.cos(th), s = Math.sin(th);
    const k = cell(F, Math.atan2(x, z) / TAU, (y - y0) / H), d = F.depth[k];
    // broad flutes that run into the roots; plates that swell a little; furrows cut deep
    const flute = 0.5 + 0.5 * Math.sin(th * 9 + Math.sin(y * 0.21) * 1.6);
    const swell = (0.5 + 0.5 * noise2(c * 3 + y * 0.2, s * 3 - y * 0.15, 3)) * (1 - d);
    const flare = Math.max(0, 3.4 - y) * 0.3; // spreading into the roots
    const r = R - 0.04 - 0.1 * flute - 0.05 * swell - 0.42 * d + flare;
    p.setXYZ(i, c * r, y, s * r);
    depth[i] = d; shade[i] = F.plate[k];
  }
  geo.computeVertexNormals();
  const g = part(geo, C.bark);
  const col = g.attributes.color, pos = g.attributes.position;
  const ridge = new THREE.Color(C.ridge), mid = new THREE.Color(C.bark), dark = new THREE.Color(C.furrow);
  const m1 = new THREE.Color(C.moss), m2 = new THREE.Color(C.moss2), lichen = new THREE.Color(C.lichen), t = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), d = depth[i], r = Math.hypot(x, z) || 1, c = x / r, s = z / r;
    // no two plates quite the same
    t.copy(ridge).lerp(mid, clamp(0.15 + shade[i] * 0.85, 0, 1));
    // moss creeps up from the roots and grows on the plates in patches lower down
    const patch = smoothstep(0.25, 0.6, noise2(c * 2.2 + y * 0.13, s * 2.2 + y * 0.08, 21)) * (1 - smoothstep(12, 28, y));
    const k = Math.max(0, 1 - (y - 2.5) / 4.5) * 0.6 + patch * 0.85;
    if (k > 0) t.lerp(patch > 0.6 ? m2 : m1, clamp(k, 0, 0.9));
    // lichen freckles the plates; the furrows stay dark
    if (noise2(c * 9 + y * 1.3, s * 9 - y * 1.1, 5) > 0.5) t.lerp(lichen, 0.35);
    t.lerp(dark, Math.pow(d, 0.8) * 0.92);
    col.setXYZ(i, t.r, t.g, t.b);
  }
  flatQuads(g);
  // the broken top, under the leaf nest
  return [g, part(new THREE.CircleGeometry(R - 0.1, 28), C.heart, { rx: -Math.PI / 2, y: y1 })];
}

/** A root arch in bark, mossy along its back. H: the hilltop it stands on. */
export function archParts(A, H) {
  const F = furrowGrid(15, 26, 5, 70 + Math.round(A.R * 10), { gap: 0.12, side: 0 });
  const geo = new THREE.TorusGeometry(A.R, A.tube, F.cols, F.rows, Math.PI).toNonIndexed();
  const p = geo.attributes.position, depth = new Float32Array(p.count), shade = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), q = Math.hypot(x, y), th = Math.atan2(y, x);
    const c = cell(F, Math.atan2(z, q - A.R) / TAU, th / Math.PI);
    const k = 1 - 0.24 * F.depth[c] - 0.05 * F.plate[c], q2 = A.R + (q - A.R) * k;
    p.setXYZ(i, Math.cos(th) * q2, Math.sin(th) * q2, z * k);
    depth[i] = F.depth[c]; shade[i] = F.plate[c];
  }
  geo.computeVertexNormals();
  const at = { cx: A.x, cz: A.z, rot: A.rot };
  return [
    seat(barkColours(part(geo, C.root, { y: H - 0.5 }), depth, shade, { moss: 0.9, seed: 7, base: C.root }), at),
    placed(new THREE.TorusGeometry(A.R + 0.06, A.tube * 0.8, 5, 8, 1.3), C.moss, at, { y: H - 0.5, rz: (Math.PI - 1.3) / 2 }),
  ];
}

// ------------------------------------------------------- life on the trunk
const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Burls, moss cushions, bracket fungus and climbing vines on the great trunk. */
export function trunkLifeParts(L, low) {
  const P = [], rng = mulberry32(4107), R = GROVE.trunkR;
  // the carving, the owl's hollow and its perches stay clear
  const kept = (a, y) => (angleOff(a, L.carving.a) < 0.5 && y > 16.5 && y < 22.5) || (angleOff(a, L.hollow.a) < 0.5 && y > 13 && y < 19.5) ||
    L.perches.some((q) => q.stub && angleOff(a, q.a) < 0.3 && y > q.y - 1.3 && y < q.y + 2.2);
  // room for something `size` big to stick out: nothing to stand on from head height below it to just above it
  const free = (a, y, size) => !kept(a, y) && [-0.12, 0, 0.12].every((da) =>
    y - size - supportAt(L, Math.cos(a + da) * (R + 0.6), Math.sin(a + da) * (R + 0.6), y + size + 1.3) > 2.3);
  const bark = (a) => ({ cx: Math.cos(a) * R, cz: Math.sin(a) * R, rot: Math.PI / 2 - a }); // x along the bark, z out of it

  for (let n = 0, done = 0; n < 60 && done < (low ? 5 : 10); n++) {
    const a = rng() * TAU, y = 6 + rng() * 30, s = 0.45 + rng() * 0.4;
    if (!free(a, y, s)) continue;
    done++;
    P.push(placed(new THREE.IcosahedronGeometry(1, 1), C.bark, bark(a), { y, z: -0.3 * s, sx: s * 1.25, sy: s, sz: s * 0.75, c2: C.furrow, split: 0.35 }));
    P.push(placed(new THREE.SphereGeometry(1, 7, 4), C.moss, bark(a), { y: y + s * 0.62, z: 0.02, sx: s * 0.95, sy: s * 0.28, sz: s * 0.6 }));
  }
  // bracket fungus, in little stacks
  for (let n = 0, done = 0; n < 80 && done < (low ? 6 : 13); n++) {
    const a = rng() * TAU, y = 5 + rng() * 30;
    if (!free(a, y, 0.9)) continue;
    done++;
    for (let k = 0, m = 2 + Math.floor(rng() * 3); k < m; k++) {
      const r = 0.3 + rng() * 0.28;
      P.push(placed(new THREE.CylinderGeometry(r, r * 0.6, 0.13, 9, 1, false, 0, Math.PI), k % 2 ? C.fungus3 : C.fungus, bark(a),
        { x: (rng() - 0.5) * 0.7, y: y - 0.6 + k * 0.42, z: -0.3, ry: -Math.PI / 2, c2: C.fungus2, split: 0.5 }));
    }
  }
  // moss cushions: thick near the roots, thinning as you climb
  for (let n = 0; n < (low ? 14 : 40); n++) {
    const a = rng() * TAU, y = 0.6 + rng() * rng() * 24, s = 0.4 + rng() * 0.55;
    if (kept(a, y)) continue;
    P.push(placed(new THREE.IcosahedronGeometry(1, 1), n % 3 ? C.moss : C.moss2, bark(a), { y, z: -0.2, sx: s * (0.8 + rng() * 0.8), sy: s * (0.6 + rng() * 0.5), sz: 0.3, c2: C.moss3, split: 0.3 }));
  }
  // vines that climb out of the roots, in leaf
  for (let v = 0; v < (low ? 2 : 6); v++) {
    let a = rng() * TAU, y = 0.4, lean = (rng() - 0.5) * 0.05;
    const top = 9 + rng() * 22, at = (aa, yy, out) => [Math.cos(aa) * (R + out), yy, Math.sin(aa) * (R + out)];
    for (let k = 0; y < top; k++) {
      const a2 = a + lean + (rng() - 0.5) * 0.09, y2 = y + 0.5 + rng() * 0.25;
      if (kept(a2, y2)) break;
      P.push(rod(at(a, y, 0.03), at(a2, y2, 0.03), 0.065, 0.055, C.vine, 4));
      if (k % 2 === 0) {
        const side = k % 4 ? 0.035 : -0.035;
        P.push(placed(new THREE.ConeGeometry(0.17, 0.36, 4), k % 3 ? C.leafM : C.leafL, bark(a2 + side), { y: y2 - 0.05, z: 0.1, rz: side > 0 ? -2 : 2, sz: 0.3 }));
      }
      a = a2; y = y2;
    }
  }
  return P;
}

// -------------------------------------------------------------- the pieces
/** The art for one piece of the climb. i: its index (it seeds the little differences). */
export function pieceArt(p, i = 0, low = false) {
  const P = [], w = p.hx * 2, d = p.hz * 2, rng = mulberry32(977 + i * 31);
  const put = (geo, color, t) => P.push(placed(geo, color, p, t));
  // small things, in the piece's own frame; (x, z) is where they stand on its top
  const tuft = (x, z, s) => put(new THREE.SphereGeometry(s, 6, 4), rng() < 0.5 ? C.moss : C.moss2, { x, y: p.top - s * 0.08, z, sx: 1 + rng() * 0.5, sy: 0.3, ry: rng() * 3 });
  const fern = (x, z, s) => {
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * TAU + rng(), tilt = 0.75 + rng() * 0.3, len = 0.55 * s, h = (Math.sin(tilt) * len) / 2;
      put(new THREE.ConeGeometry(0.07 * s, len, 3), k % 2 ? C.fern : C.leafL, { x: x + h * Math.cos(ang), y: p.top + (Math.cos(tilt) * len) / 2, z: z - h * Math.sin(ang), rz: -tilt, ry: ang, sz: 0.35 });
    }
  };
  const mushroom = (x, z, s) => {
    put(new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 0.2 * s, 5), C.stem, { x, y: p.top + 0.1 * s, z });
    put(new THREE.SphereGeometry(0.12 * s, 7, 4, 0, TAU, 0, Math.PI / 2), C.cap, { x, y: p.top + 0.18 * s, z, sy: 0.8 });
  };
  /** A small bracket on an upright face at (x, y, z); `face` turns it to grow out of that face. */
  const bracket = (x, y, z, r, face) => put(new THREE.CylinderGeometry(r, r * 0.6, 0.1, 8, 1, false, 0, Math.PI), C.fungus, { x, y, z, ry: face, c2: C.fungus2, split: 0.5 });
  /** Growth rings on a cut end facing +x or -x (s), or facing up (s = 0). */
  const rings = (x, y, z, r, s) => {
    for (const [k, color] of [[1, C.heart], [0.72, C.ring], [0.46, C.heart], [0.2, C.ring]].entries()) {
      const g = new THREE.CylinderGeometry(r * color[0], r * color[0], 0.03, 12);
      if (s) put(g.rotateZ(Math.PI / 2), color[1], { x: x + s * k * 0.012, y, z, sy: 0.72 });
      else put(g, color[1], { x, y: y + k * 0.01, z });
    }
  };

  switch (p.kind) {
    case 'bark': case 'landing': {
      // a plate of bark grown out from the trunk: it reaches into the furrows (local +z is inward)
      put(box(w, p.thick, d + 0.35), C.bark, { y: p.top - p.thick / 2, z: 0.175, c2: C.bark2, split: 0.5 });
      put(box(w * 0.85, 0.5, d * 0.45), C.bark2, { y: p.top - p.thick - 0.2, z: d * 0.3 });
      // furrows down its outer face
      for (let k = 0, n = Math.max(1, Math.round(w / 0.9)); k < n; k++) {
        const h = p.thick * (0.45 + rng() * 0.45);
        put(box(0.05 + rng() * 0.05, h, 0.07), C.furrow, { x: -w / 2 + ((k + 0.2 + rng() * 0.6) * w) / n, y: p.top - 0.1 - h / 2, z: -d / 2 });
      }
      put(box(w * 0.98, 0.08, d * 0.82), p.kind === 'landing' ? C.moss2 : C.moss, { y: p.top, z: -d * 0.06 });
      if (low) break;
      // the moss is patchy: lighter where it's young, darker where it's deep
      for (let k = 0, n = Math.round((w * d) / 1.6) + 1; k < n; k++) {
        const r = 0.3 + rng() * 0.35;
        put(new THREE.CylinderGeometry(r, r, 0.016, 7), [C.moss2, C.moss3, C.moss, C.leafL][k % 4], { x: (rng() - 0.5) * (w * 0.94 - 2 * r), y: p.top + 0.042 + (k % 3) * 0.004, z: -d * 0.06 + (rng() - 0.5) * (d * 0.8 - 2 * r), sx: 0.8 + rng() * 0.7, ry: rng() * 3 });
      }
      // moss thick against the trunk and spilling over the rim; ferns and mushrooms in the corner
      for (let k = 0, n = p.kind === 'landing' ? 5 : 1 + Math.floor(rng() * 2); k < n; k++) tuft((rng() - 0.5) * w * 0.8, d * (0.26 + rng() * 0.12), 0.26 + rng() * 0.16);
      for (let k = 0, n = Math.round(rng() * 2 + w / 3); k < n; k++) {
        const len = 0.15 + rng() * 0.4;
        put(box(0.12 + rng() * 0.1, len, 0.07), k % 2 ? C.hang : C.moss, { x: (rng() - 0.5) * w * 0.85, y: p.top - len / 2 + 0.03, z: -d / 2 - 0.045 });
      }
      if (rng() < 0.3) mushroom((rng() - 0.5) * w * 0.5, d * 0.33, 1 + rng() * 0.5);
      if (rng() < 0.22) fern((rng() - 0.5) * w * 0.5, d * 0.36, 0.8 + rng() * 0.4);
      break;
    }
    case 'fungus': {
      // a great bracket: banded on top, a pale growing rim, and a neck into the bark
      const r = p.r;
      put(new THREE.CylinderGeometry(r, r * 0.5, p.thick, 16), C.fungus3, { y: p.top - p.thick / 2, c2: C.fungus, split: 0.55 });
      for (const [k, band] of [[1, C.fungus2], [0.82, C.fungus3], [0.6, C.fungus2], [0.4, C.fungus], [0.2, C.fungus3]].entries()) {
        put(new THREE.CylinderGeometry(r * band[0], r * band[0], 0.012, 16), band[1], { y: p.top + 0.004 + k * 0.007 });
      }
      put(new THREE.TorusGeometry(r * 0.96, 0.075, 5, 18), C.fungus, { rx: Math.PI / 2, y: p.top - 0.07 });
      if (p.a != null) {
        const ca = Math.cos(p.a), sa = Math.sin(p.a);
        P.push(rod([ca * 6.5, p.top - 0.45, sa * 6.5], [p.cx, p.top - 0.2, p.cz], 0.75, 0.4, C.fungus2, 7));
        // younger brackets coming on underneath
        for (const s of [-1, 1]) {
          const a = p.a + s * (0.09 + rng() * 0.05), rr = 0.3 + rng() * 0.15;
          P.push(part(new THREE.CylinderGeometry(rr, rr * 0.6, 0.11, 9), C.fungus, { x: Math.cos(a) * 7.05, y: p.top - 0.65 - rng() * 0.5, z: Math.sin(a) * 7.05, c2: C.fungus2, split: 0.5 }));
        }
      }
      break;
    }
    case 'peg':
      // grandfather's work: a plank on two iron pegs driven into the bark
      put(box(w, 0.1, d + 0.6), C.plank, { y: p.top - 0.05, z: 0.3, c2: C.plank2, split: 0.3 });
      for (const s of [-1, 1]) {
        put(box(0.03, 0.105, d * 0.9), C.plank2, { x: s * w * 0.17, y: p.top - 0.05 });
        put(box(0.1, 0.1, d + 0.7), C.iron, { x: s * 0.3, y: p.top - 0.15, z: 0.32 });
        put(new THREE.SphereGeometry(0.085, 6, 5), C.iron, { x: s * 0.3, y: p.top - 0.15, z: -d / 2 - 0.02 });
      }
      break;
    case 'mat': case 'platform': {
      P.push(...pieceParts({ kind: 'disc', cx: p.cx, cz: p.cz, top: p.top, r: p.r, trunk: 0 }));
      if (p.hang) {
        // hung from the bough above on a pair of aerial roots
        for (const s of [-0.5, 0.5]) P.push(rod([p.hang[0] + s, p.hang[1], p.hang[2] - s], [p.cx + s * 2, p.top - 0.2, p.cz - s * 2], 0.13, 0.09, C.hang, 5));
      } else if (p.a != null) P.push(rod([Math.cos(p.a) * 6.5, p.top - 1.6, Math.sin(p.a) * 6.5], [p.cx, p.top - 0.3, p.cz], 0.42, 0.2, C.bark2));
      if (low) break;
      // young leaves round the rim, and a few blossoms
      for (let k = 0, n = Math.round(p.r * 4); k < n; k++) {
        const ang = (k / n) * TAU + rng() * 0.5, tilt = Math.PI / 2 + 0.1 + rng() * 0.35, len = 0.55 + rng() * 0.3, R = p.r * 0.93 + len * 0.4;
        put(new THREE.ConeGeometry(0.2, len, 4), [C.leafL, C.leafM, C.leafD][k % 3], { x: Math.cos(ang) * R, y: p.top - 0.1 - rng() * 0.1, z: -Math.sin(ang) * R, rz: -tilt, ry: ang, sz: 0.3 });
      }
      for (let k = 0, n = 1 + Math.floor(rng() * 3); k < n; k++) {
        const ang = rng() * TAU, x = Math.cos(ang) * p.r * 0.86, z = Math.sin(ang) * p.r * 0.86;
        put(new THREE.SphereGeometry(0.1, 6, 4), C.petal, { x, y: p.top + 0.05, z, sy: 0.5 });
        put(new THREE.SphereGeometry(0.045, 5, 4), C.pollen, { x, y: p.top + 0.09, z });
      }
      break;
    }
    case 'bough': case 'branch': {
      // a limb flattened on top like a deck: thick at the trunk (local -x), thinner at the tip
      const mossy = p.kind === 'bough';
      P.push(seat(barkLimb(p.hz * 0.72, p.hz * 1.05, w, { y: p.top - p.hz * 0.74, sy: 0.7 }, { lay: true, radial: 16, rows: Math.max(4, Math.round(w / 1.3)), furrows: 8, seed: 3 + i, moss: mossy ? 0.75 : 0.35 }), p));
      put(box(w, 0.4, d * 0.9), C.bark, { y: p.top - 0.2, c2: C.bark2, split: 0.4 });
      put(box(w * 0.99, 0.07, d * 0.72), mossy ? C.moss : C.plank, { y: p.top });
      if (low) break;
      for (let x = -w / 2 + 1, k = 0; x < w / 2 - 0.5; x += 1.3 + rng() * 0.9, k++) {
        const s = k % 2 ? 1 : -1;
        if (mossy) tuft(x, s * d * (0.36 + rng() * 0.06), 0.28 + rng() * 0.16);
        if (mossy) for (const m of [0, 1]) put(new THREE.CylinderGeometry(0.45, 0.45, 0.016, 7), [C.moss2, C.moss3, C.leafL][(k + m) % 3], { x: x + m * 0.7, y: p.top + 0.038 + m * 0.004, z: (rng() - 0.5) * d * 0.45, sx: 0.8 + rng() * 0.8, sz: 0.6 + rng() * 0.5, ry: rng() * 3 });
        // moss beards under the edges, a knot here and there
        const len = 0.3 + rng() * (mossy ? 0.9 : 0.4);
        put(box(0.1, len, 0.1), k % 3 ? C.hang : C.moss, { x: x + 0.4, y: p.top - 0.45 - len / 2, z: -s * d * 0.5 });
        if (k % 4 === 1) put(new THREE.IcosahedronGeometry(0.3 + rng() * 0.15, 1), C.bark2, { x, y: p.top - p.hz * 0.6, z: s * p.hz * 0.92, sy: 0.8 });
        if (mossy && k % 4 === 2) fern(x, s * d * 0.42, 0.75 + rng() * 0.35);
      }
      break;
    }
    case 'log': {
      const r = p.hz * 1.15;
      P.push(seat(barkLimb(r, p.hz * 1.2, w, { y: p.top - p.hz * 0.82, sy: 0.72 }, { lay: true, radial: 16, rows: 8, furrows: 9, seed: 11, moss: 0.85 }), p));
      put(box(w * 0.96, 0.07, d * 0.8), C.moss, { y: p.top });
      for (const s of [-1, 1]) rings(s * (w / 2 + 0.02), p.top - p.hz * 0.82, 0, p.hz, s);
      if (low) break;
      for (let x = -w / 2 + 0.8, k = 0; x < w / 2 - 0.5; x += 1.1 + rng() * 0.8, k++) {
        const s = k % 2 ? 1 : -1;
        tuft(x, s * d * 0.38, 0.26 + rng() * 0.14);
        if (k % 3 === 0) for (let m = 0; m < 3; m++) bracket(x + (m - 1) * 0.35, p.top - 0.3 - m * 0.16, s * r * 0.86, 0.22 + rng() * 0.14, -s * Math.PI / 2);
      }
      for (const s of [-1, 1]) fern(s * (w / 2 - 0.5), -s * d * 0.3, 1);
      break;
    }
    case 'stump':
      P.push(seat(barkLimb(p.r, p.r * 1.2, p.thick, { y: p.top - p.thick / 2 }, { radial: 14, rows: 6, furrows: 9, seed: 20 + i, moss: 0.5 }), p));
      rings(0, p.top, 0, p.r * 0.9, 0);
      if (low) break;
      tuft(p.r * 0.62, (rng() - 0.5) * 0.5, 0.26);
      for (let m = 0; m < 3; m++) bracket(0, p.top - 0.45 - m * 0.2, p.r * 0.95, 0.2 + rng() * 0.1, -Math.PI / 2);
      break;
    case 'root':
      P.push(seat(barkLimb(0.62, 0.7, w + 1.5, { y: p.top - 0.6 }, { lay: true, radial: 12, rows: 8, furrows: 6, seed: 31, moss: 0.8, base: C.root }), p));
      put(box(w * 0.9, 0.07, d * 0.7), C.moss, { y: p.top });
      if (low) break;
      for (let x = -w / 2 + 0.7; x < w / 2 - 0.4; x += 1.4 + rng()) tuft(x, (rng() - 0.5) * d * 0.5, 0.24 + rng() * 0.1);
      break;
    default: break;
  }
  return P;
}
