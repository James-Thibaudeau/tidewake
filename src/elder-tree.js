// The Elder Tree: the giant at the heart of the Elder Grove, as seen from the
// sea. Journal III: "the trees here are older than every town on the coast
// put together", and grandfather climbed this one to carve a heart in it.
//
// Built to read from far off: a fluted trunk on a skirt of root buttresses
// (some arching clear of the ground, "look among the roots"), seven great
// boughs and their branches under a tiered canopy, moss and aerial roots
// hanging from the limbs, an owl in a hollow, and his red pennant tied at the
// very top. It "makes its own weather": a few small clouds drift slowly
// through the canopy, birds circle the crown, and fireflies come out at night.
//
// Sea view only. The walkable Elder Grove level is built at its own scale.
// Authored in tree space: the base of the trunk at the origin, y up, +z the
// side that faces Port Haven (the owl hollow and the pennant face that way).
import * as THREE from 'three';
import { part, merge, propMaterial } from './props.js';
import { toonGradient, toonMaterial, outlineMaterial } from './toon.js';
import { mulberry32, noise2, hash2, smoothstep, lerp, TAU } from './util.js';

const C = {
  bark: '#6e4c30', bark2: '#5d3f27', furrow: '#38241a', lit: '#8a6643', root: '#654429',
  moss: '#6c8d3c', moss2: '#86a84a', hang: '#869a52', hang2: '#63763a',
  leafD: '#2b6634', leafM: '#45973f', leafL: '#73c052', goldM: '#7fa23a', goldL: '#b9c556',
  hollow: '#1c120a', owl: '#8c6c48', owl2: '#6e5236', owlFace: '#e4d2a8', eye: '#f2c14a', pupil: '#1b1410',
  red: '#c8322b', pole: '#5b3c22', brass: '#d9b44a',
};

// ------------------------------------------------------------------ shapes
/** Icosphere with spherical normals: a soft round clump. */
function blob(r, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}

/**
 * A tapered tube along a smooth curve through `pts`, closed at the far end
 * with a point. radius(t) for t in 0..1. `paint(color, v)` colours each
 * vertex from { t, shade (bark ridge, -1..1), dir (outward), x, y, z }.
 */
function tube(pts, radius, o = {}) {
  const radial = o.radial ?? 8, segs = o.segs ?? 10, seed = o.seed ?? 1;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], col = [], idx = [];
  const c = new THREE.Color(), dir = new THREE.Vector3(), P = new THREE.Vector3();
  const v = { t: 0, shade: 0, dir, x: 0, y: 0, z: 0 };
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = radius(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      dir.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      let k = 1, shade = 0;
      if (o.ridges) {
        shade = Math.sin(a * o.ridges + t * (o.twist ?? 0) + seed);
        k += shade * (o.ridgeAmp ?? 0.07);
      }
      k *= 1 + (hash2(i * 31 + seed, j, seed) - 0.5) * (o.rough ?? 0.08);
      v.t = t; v.shade = shade;
      v.x = P.x + dir.x * r * k; v.y = P.y + dir.y * r * k; v.z = P.z + dir.z * r * k;
      pos.push(v.x, v.y, v.z);
      (o.paint || (() => c.set(C.bark)))(c, v);
      col.push(c.r, c.g, c.b);
    }
  }
  // the point at the far end
  curve.getPointAt(1, P);
  const T = fr.tangents[segs];
  const tip = pos.length / 3;
  pos.push(P.x + T.x * radius(1) * 1.4, P.y + T.y * radius(1) * 1.4, P.z + T.z * radius(1) * 1.4);
  col.push(c.r, c.g, c.b);
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), cc = a + radial, d = b + radial;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const last = segs * radial;
  for (let j = 0; j < radial; j++) idx.push(last + j, last + ((j + 1) % radial), tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  out.userData.curve = curve;
  return out;
}

/** Bark colours: dark furrows, lit ridges, moss on whatever faces the sky. */
function barkPaint(base, dark, opts = {}) {
  return (c, v) => {
    const n = noise2(v.x * 0.09 + v.z * 0.05, v.y * 0.07 + v.z * 0.09, 7);
    if (v.shade < -0.55) c.set(C.furrow);
    else if (v.shade > 0.72) c.set(C.lit);
    else c.set(n > 0.1 ? base : dark);
    const up = v.dir.y > 0.45 && n > -0.3;
    const north = opts.northMoss && v.dir.z < -0.5 && v.t < opts.northMoss && n > -0.05;
    if (up || north) c.set(n > 0.35 ? C.moss2 : C.moss);
  };
}

/** A tiered clump of foliage: a broad flattened mass with lumps round it and a sunlit top. */
function cluster(P, x, y, z, s, rng, gold = false) {
  const L = gold ? C.goldL : C.leafL, M = gold ? C.goldM : C.leafM;
  P.push(part(blob(12 * s, 1), M, { x, y, z, sy: 0.6, c2: C.leafD, split: 0.48 }));
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.8, d = (8.5 + rng() * 5) * s, r = (6.5 + rng() * 3.5) * s;
    const dy = (rng() - 0.4) * 5 * s, top = dy > 1.2 * s;
    P.push(part(blob(r, 1), top ? L : M, { x: x + Math.cos(a) * d, y: y + dy, z: z + Math.sin(a) * d, sy: 0.68, c2: C.leafD, split: top ? 0.3 : 0.5 }));
  }
  P.push(part(blob(7.5 * s, 1), L, { x: x + (rng() - 0.5) * 3 * s, y: y + 4.8 * s, z: z + (rng() - 0.5) * 3 * s, sy: 0.7, c2: M, split: 0.3 }));
}

// ------------------------------------------------------------------ layout
// The trunk leans a little and wanders; boughs start inside it.
const TRUNK = [[0, -8, 0], [0.5, 6, 0.3], [1.5, 22, -1], [-0.5, 40, 1.2], [-1.5, 58, 0.4], [0, 74, -0.6], [0.8, 88, 0]];
const trunkR = (t) => lerp(9.5, 2.2, t) + 9 * Math.pow(1 - t, 7);
/** The trunk's centre line at height y (near enough for placing things on it). */
function trunkAt(y) {
  for (let i = 1; i < TRUNK.length; i++) {
    const [x0, y0, z0] = TRUNK[i - 1], [x1, y1, z1] = TRUNK[i];
    if (y <= y1) { const k = (y - y0) / (y1 - y0); return [lerp(x0, x1, k), lerp(z0, z1, k)]; }
  }
  return [0.8, 0];
}
const HOLLOW = { y: 31 };

function woodAndLeaves(ground) {
  const rng = mulberry32(0xe1de4);
  const wood = [], leaves = [], strands = [];
  const g = (x, z) => ground(x, z);

  // trunk: fluted, twisting a little, moss down the north side
  wood.push(tube(TRUNK, trunkR, { radial: 20, segs: 30, ridges: 7, twist: 3, ridgeAmp: 0.08, seed: 3,
    paint: barkPaint(C.bark, C.bark2, { northMoss: 0.45 }) }));

  // root buttresses: out from the trunk and down the hill; every third one
  // arches clear of the ground
  const NR = 9;
  for (let k = 0; k < NR; k++) {
    const a = (k / NR) * TAU + (rng() - 0.5) * 0.35, ca = Math.cos(a), sa = Math.sin(a);
    const L = 34 + rng() * 16, arch = k % 3 === 1;
    const wob = (d, w) => [ca * d - sa * w, sa * d + ca * w];
    const at = (d, w, dy) => { const [x, z] = wob(d, w); return [x, g(x, z) + dy, z]; };
    const pts = [[ca * 3, 17, sa * 3], at(11, (rng() - 0.5) * 2, 6.5), at(21, (rng() - 0.5) * 4, arch ? 5.5 : 2.2),
      at(31, (rng() - 0.5) * 5, arch ? 2.5 : 1.0), at(L, (rng() - 0.5) * 6, -3)];
    wood.push(tube(pts, (t) => lerp(4.8, 0.9, Math.pow(t, 0.8)), { radial: 9, segs: 14, ridges: 3, twist: 2, seed: 10 + k,
      paint: barkPaint(C.root, C.bark2) }));
  }

  // boughs, each with two or three branches; foliage at every tip
  const boughs = [];
  for (let k = 0; k < 7; k++) {
    const h = 36 + k * 6.5, a = k * 2.39996 + 0.4, ca = Math.cos(a), sa = Math.sin(a);
    const L = 54 - k * 3.4 + rng() * 6, rise = 8 + k * 2.2 + rng() * 6;
    const q2 = (rng() - 0.5) * 0.25 * L, q3 = q2 + (rng() - 0.5) * 0.2 * L;
    const pt = (d, w, y) => [ca * d - sa * w, y, sa * d + ca * w];
    const [tx, tz] = trunkAt(h);
    const pts = [[tx, h - 3, tz], pt(0.28 * L, q2 * 0.2, h + 0.1 * L), pt(0.6 * L, q2, h + 0.15 * L + rise * 0.35), pt(L, q3, h + rise)];
    const thick = 1 - k * 0.05;
    const geo = tube(pts, (t) => lerp(4.6, 0.8, t) * thick, { radial: 10, segs: 16, ridges: 4, twist: 2, seed: 30 + k,
      paint: barkPaint(C.bark, C.bark2) });
    wood.push(geo);
    const curve = geo.userData.curve;
    boughs.push({ curve, a, h });
    const end = curve.getPointAt(1);
    cluster(leaves, end.x, end.y + 3, end.z, 1.12, rng, rng() < 0.15);
    const nb = 2 + (rng() < 0.5 ? 1 : 0);
    for (let b = 0; b < nb; b++) {
      const t0 = 0.45 + rng() * 0.35, S = curve.getPointAt(t0);
      const ba = a + (b % 2 ? 1 : -1) * (0.55 + rng() * 0.45), len = 16 + rng() * 9, up = 6 + rng() * 6;
      const E = [S.x + Math.cos(ba) * len, S.y + up, S.z + Math.sin(ba) * len];
      const M = [S.x + Math.cos(ba) * len * 0.5, S.y + up * 0.3, S.z + Math.sin(ba) * len * 0.5];
      wood.push(tube([[S.x, S.y, S.z], M, E], (t) => lerp(1.7, 0.35, t) * thick, { radial: 6, segs: 6, seed: 60 + k * 3 + b,
        paint: barkPaint(C.bark, C.bark2) }));
      cluster(leaves, E[0], E[1] + 2, E[2], 0.78 + rng() * 0.22, rng, rng() < 0.12);
    }
  }
  // the crown, over the top of the trunk
  cluster(leaves, 0, 96, 0, 1.55, rng);
  cluster(leaves, 6, 104, -3, 0.8, rng);

  // moss hanging from the boughs, and a few aerial roots that reach the ground
  for (const [k, B] of boughs.entries()) {
    for (let i = 0; i < 6; i++) {
      const t = 0.3 + i * 0.11 + rng() * 0.05, S = B.curve.getPointAt(t);
      const len = 6 + rng() * 14, sw = (rng() - 0.5) * 2.5;
      strands.push(tube([[S.x, S.y - 0.5, S.z], [S.x + sw * 0.5, S.y - len * 0.5, S.z + sw * 0.3], [S.x + sw, S.y - len, S.z - sw * 0.4]],
        (u) => lerp(0.5, 0.14, u), { radial: 4, segs: 4, rough: 0.2, seed: 200 + k * 10 + i,
          paint: (c, v) => c.set(v.t > 0.5 ? C.hang2 : C.hang) }));
    }
    if (k % 2 === 0 && k < 6) {
      const S = B.curve.getPointAt(0.42 + rng() * 0.08), gx = S.x + (rng() - 0.5) * 2, gz = S.z + (rng() - 0.5) * 2;
      wood.push(tube([[S.x, S.y, S.z], [lerp(S.x, gx, 0.5) + 0.6, lerp(S.y, g(gx, gz), 0.5), lerp(S.z, gz, 0.5)], [gx, g(gx, gz) - 2, gz]],
        (u) => lerp(1.2, 0.85, u), { radial: 6, segs: 8, rough: 0.12, seed: 300 + k, paint: barkPaint(C.root, C.bark2) }));
    }
  }
  return { wood, leaves, strands };
}

/** The owl hollow and the owl in it, and grandfather's red pennant on top. */
function detailParts() {
  const P = [];
  const [hx, hz] = trunkAt(HOLLOW.y);
  const r = trunkR((HOLLOW.y + 8) / 96) * 0.95;
  P.push(part(new THREE.SphereGeometry(1, 12, 8), C.hollow, { x: hx, y: HOLLOW.y, z: hz + r - 0.2, sx: 2.6, sy: 3.8, sz: 1.3 }));
  P.push(part(new THREE.TorusGeometry(2.7, 0.6, 6, 16), C.lit, { x: hx, y: HOLLOW.y, z: hz + r + 0.25, sy: 1.42 }));
  // the owl, sat in the bottom of the hollow and looking out to sea
  const ox = hx, oy = HOLLOW.y - 2.2, oz = hz + r + 0.4;
  P.push(part(new THREE.SphereGeometry(1, 10, 8), C.owl, { x: ox, y: oy, z: oz, sy: 1.25, c2: C.owl2, split: 0.5 }));
  P.push(part(new THREE.SphereGeometry(0.85, 10, 8), C.owl, { x: ox, y: oy + 1.5, z: oz + 0.05 }));
  for (const s of [-1, 1]) {
    P.push(part(new THREE.SphereGeometry(0.42, 10, 8), C.owlFace, { x: ox + s * 0.34, y: oy + 1.55, z: oz + 0.62, sz: 0.4 }));
    P.push(part(new THREE.SphereGeometry(0.22, 8, 6), C.eye, { x: ox + s * 0.34, y: oy + 1.58, z: oz + 0.78 }));
    P.push(part(new THREE.SphereGeometry(0.11, 6, 5), C.pupil, { x: ox + s * 0.34, y: oy + 1.58, z: oz + 0.97 }));
    P.push(part(new THREE.ConeGeometry(0.2, 0.6, 5), C.owl2, { x: ox + s * 0.5, y: oy + 2.35, z: oz, rz: -s * 0.35 }));
  }
  P.push(part(new THREE.ConeGeometry(0.12, 0.35, 5), C.eye, { x: ox, y: oy + 1.3, z: oz + 0.85, rx: Math.PI / 2 + 0.4 }));
  // grandfather's pennant, lashed to the very top
  // (tall enough to fly clear of the canopy seen from sea level)
  P.push(part(new THREE.CylinderGeometry(0.3, 0.5, 60, 6), C.pole, { x: 0.8, y: 116, z: 0 }));
  P.push(part(new THREE.BoxGeometry(7.6, 4.2, 0.2), C.red, { x: 4.75, y: 141.4, z: 0, rz: 0.06 })); // broadside to Port Haven
  P.push(part(new THREE.SphereGeometry(0.7, 8, 6), C.brass, { x: 0.8, y: 146.4, z: 0 }));
  return P;
}

// ------------------------------------------------------------ live things
const birdMat = toonMaterial({ color: 0x2b3038, gradientMap: toonGradient() });
const woodOutline = outlineMaterial(0.32), leafOutline = outlineMaterial(0.4), fineOutline = outlineMaterial(0.07);

/** A small cumulus puff: lumps on a flat-ish base, grey-blue underneath. */
function puffGeometry() {
  const lumps = [[0, 0, 0, 1], [1.05, -0.18, 0.2, 0.72], [-1.0, -0.12, -0.15, 0.78], [0.3, 0.5, -0.1, 0.72],
    [-0.45, 0.38, 0.35, 0.6], [0.2, -0.12, 0.8, 0.62], [-0.2, -0.15, -0.8, 0.6]];
  return merge(lumps.map(([x, y, z, r]) => part(blob(r, 1), '#f7f9fb', { x, y, z, sy: 0.82, c2: '#c9d4de', split: 0.38, soft: 0.12 })));
}

function birdGeometry() {
  return merge([
    part(new THREE.SphereGeometry(0.45, 8, 6), '#ffffff', { sz: 2.2 }),
    part(new THREE.BoxGeometry(3.2, 0.12, 1.1), '#ffffff', { x: 1.6, y: 0.35, rz: 0.22 }),
    part(new THREE.BoxGeometry(3.2, 0.12, 1.1), '#ffffff', { x: -1.6, y: 0.35, rz: -0.22 }),
    part(new THREE.BoxGeometry(1.0, 0.1, 0.9), '#ffffff', { z: -1.2 }),
  ]);
}

let cache = null;
function geometries(ground) {
  if (cache) return cache;
  const { wood, leaves, strands } = woodAndLeaves(ground);
  const rng = mulberry32(0xf1e5);
  const flies = new Float32Array(140 * 3);
  for (let i = 0; i < 140; i++) {
    const a = rng() * TAU, d = 14 + rng() * 52;
    flies[i * 3] = Math.cos(a) * d; flies[i * 3 + 2] = Math.sin(a) * d;
    flies[i * 3 + 1] = ground(flies[i * 3], flies[i * 3 + 2]) + 3 + rng() * 34;
  }
  const fliesGeo = new THREE.BufferGeometry();
  fliesGeo.setAttribute('position', new THREE.BufferAttribute(flies, 3));
  cache = {
    wood: merge(wood), leaves: merge(leaves), fine: merge([...strands, ...detailParts()]),
    mist: puffGeometry(), bird: birdGeometry(), flies: fliesGeo,
  };
  return cache;
}

/**
 * The Elder Tree in tree space. ground(x, z): the hillside's height in tree
 * space (0 at the foot of the trunk). glowMap: a soft dot for the fireflies.
 * Returns { group, outlines (meshes to hide when far), update(time, night) }.
 */
export function buildElderTree({ ground, glowMap }) {
  const G = geometries(ground);
  const group = new THREE.Group();
  group.name = 'elderTree';
  const outlines = [];
  for (const [geo, ol] of [[G.wood, woodOutline], [G.leaves, leafOutline], [G.fine, fineOutline]]) {
    const o = new THREE.Mesh(geo, ol);
    group.add(new THREE.Mesh(geo, propMaterial), o);
    outlines.push(o);
  }

  // small clouds caught in the canopy, drifting slowly round
  const rng = mulberry32(0x3157);
  const mist = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(G.mist, propMaterial);
    m.userData.p = { a: (i / 7) * TAU + rng() * 0.5, R: 40 + rng() * 32, y: 44 + rng() * 30, s: 6 + rng() * 4, w: (0.008 + rng() * 0.01) * (i % 3 ? 1 : -1), k: rng() * TAU };
    group.add(m);
    mist.push(m);
  }
  // birds circling over the crown
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(G.bird, birdMat);
    b.userData.p = { a: rng() * TAU, R: 26 + rng() * 34, y: 118 + rng() * 22, w: 0.12 + rng() * 0.08, k: rng() * TAU };
    group.add(b);
    birds.push(b);
  }
  // fireflies under the canopy at night
  const fliesMat = new THREE.PointsMaterial({ size: 4.5, map: glowMap, color: 0xd6ff8a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const flies = new THREE.Points(G.flies, fliesMat);
  flies.visible = false;
  group.add(flies);

  function update(time, night) {
    for (const m of mist) {
      const p = m.userData.p, a = p.a + time * p.w;
      m.position.set(Math.cos(a) * p.R, p.y + Math.sin(time * 0.15 + p.k) * 2, Math.sin(a) * p.R);
      const s = p.s * (1 + Math.sin(time * 0.2 + p.k) * 0.08);
      m.scale.set(s * 1.25, s * 0.8, s);
      m.rotation.y = -a;
    }
    for (const b of birds) {
      const p = b.userData.p, a = p.a + time * p.w;
      b.position.set(Math.cos(a) * p.R, p.y + Math.sin(time * 0.7 + p.k) * 3, Math.sin(a) * p.R);
      b.rotation.set(0, -a, 0.35); // heading along the circle, banked into the turn
      b.scale.y = 0.6 + Math.abs(Math.sin(time * 5 + p.k)) * 0.7; // a lazy flap
    }
    const glow = smoothstep(0.35, 0.75, night);
    flies.visible = glow > 0.01;
    fliesMat.opacity = glow * (0.7 + 0.3 * Math.sin(time * 2.3));
    flies.rotation.y = time * 0.02;
    flies.position.y = Math.sin(time * 0.4) * 1.2;
  }
  update(0, 0);
  return { group, outlines, update };
}
