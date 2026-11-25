// The Elder Grove as a walkable level: the first landmark level, hand-built
// like the wreck. grove-layout.js decides where everything stands (and is
// checked in Node); this file draws it: the ground, the great trunk with its
// spiral of bark ledges, shelf fungus and pegs, the roots, the boughs and
// leaf mats, the old wood round it, and the pool under the diving branch.
//
// It is built at a scale that plays well, not at the sea view's scale
// (elder-tree.js), but keeps its landmarks: arching roots, the owl hollow,
// moss and hanging roots. The layout is authored with the beach on +z; the
// level turns it so the rowboat faces your anchored ship.
// Follows the level contract in shapes.js, plus:
//   hubs: [{ x, z, orbit, base, top }]   trunks the camera circles (camera.js)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, propMaterial, thinOutline, PROPS } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { mulberry32, noise2, lerp, TAU } from '../util.js';
import { pieceParts, rowboatParts } from './pieces.js';
import { buildGroveLayout, groveGround, streamZ, GROVE } from './grove-layout.js';

const C = {
  bark: '#6e4c30', bark2: '#553a25', furrow: '#38241a', root: '#654429', heart: '#b08a5a',
  moss: '#6c8d3c', moss2: '#86a84a', hang: '#869a52',
  leafD: '#2b6634', leafM: '#45973f', leafL: '#73c052',
  fungus: '#ead9b0', fungus2: '#c98a4a', iron: '#4a4a52', plank: '#b98a52',
  hollow: '#1c120a', water: '#5fb3d4', stone: '#8f877d',
  grass: '#5fae48', grass2: '#4f9a40', shade: '#467f3a', sand: '#e6d7a8', sand2: '#d9c894', path: '#b59a6c',
  bed: '#7d7559', wet: '#5d6a4a',
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** A part in a piece's own frame: local transform, then the piece's turn and place. */
function placed(geo, color, p, t = {}) {
  const g = part(geo, color, t);
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}
/** A rod from a to b ([x, y, z] each), r0 thick at a and r1 at b. */
function rod(a, b, r0, r1, color, segs = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), segs, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return part(g, color);
}
function merged(parts) {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ ground
let terrainMat = null;
function terrainMesh() {
  const E = GROVE.R + 9, S = 1.25, n = Math.round((2 * E) / S) + 1;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), hs = new Float32Array(n * n);
  const cs = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, new THREE.Color(v)]));
  const tmp = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -E + i * S, z = -E + j * S, k = j * n + i;
    const { h, tag } = groveGround(x, z);
    hs[k] = h;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const nz = noise2(x * 0.21, z * 0.21, 6), r = Math.hypot(x, z);
    const inStream = Math.abs(z - streamZ(x)) < 4.6 && r < 84;
    if (h < -0.4) tmp.copy(cs.bed);
    else if (inStream && h < 1.4) tmp.copy(cs.wet).lerp(cs.bed, 0.4 + 0.3 * nz);
    else if (tag === 'sand') tmp.copy(nz > 0.1 ? cs.sand2 : cs.sand);
    else {
      tmp.copy(nz > 0 ? cs.grass : cs.grass2);
      if (r < 24) tmp.lerp(cs.shade, 0.75 * (1 - r / 24) + 0.2);        // deep shade under the tree
      if (z > 16 && Math.abs(x) < 2.2 + nz * 0.5) tmp.lerp(cs.path, 0.8); // the worn path up from the beach
    }
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
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
  m.name = 'grove:ground';
  return m;
}

// ---------------------------------------------------------------- the tree
/** The fluted trunk: ridges stay inside the collider's radius, furrows cut in. */
function trunkParts() {
  const R = GROVE.trunkR, y0 = -1, y1 = GROVE.trunkTop, H = y1 - y0;
  const geo = new THREE.CylinderGeometry(R, R, H, 56, 14, true).toNonIndexed();
  geo.translate(0, y0 + H / 2, 0);
  const p = geo.attributes.position, depth = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x);
    const d = 0.5 + 0.5 * Math.sin(th * 13 + Math.sin(y * 0.21) * 1.6); // 0 on a ridge, 1 in a furrow
    const flare = Math.max(0, 3.4 - y) * 0.3;                             // spreading into the roots
    const r = R - 0.02 - 0.34 * d + flare;
    p.setXYZ(i, Math.cos(th) * r, y, Math.sin(th) * r);
    depth[i] = d;
  }
  geo.computeVertexNormals();
  const g = part(geo, C.bark);
  const col = g.attributes.color, a = new THREE.Color(C.bark), b = new THREE.Color(C.furrow), m = new THREE.Color(C.moss), t = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const y = g.attributes.position.getY(i);
    t.copy(a).lerp(b, depth[i] * 0.8);
    // moss creeps up from the roots, and sits in the furrows higher up
    t.lerp(m, Math.max(0, 1 - (y - 3) / 5) * 0.5 + (depth[i] > 0.8 ? 0.12 : 0));
    col.setXYZ(i, t.r, t.g, t.b);
  }
  // the broken top, under the leaf nest
  return [g, part(new THREE.CircleGeometry(R - 0.1, 28), C.heart, { rx: -Math.PI / 2, y: y1 })];
}

function treeParts(L) {
  const P = [...trunkParts()];
  const H = GROVE.hill;
  // buttress roots: tall at the trunk, sloping down to the ground
  for (const b of L.buttresses) {
    const len = b.r1 - b.r0 + 0.6, h = b.top + 0.4;
    const geo = new THREE.BoxGeometry(len, h, b.half * 2, 5, 1, 1).toNonIndexed();
    const q = geo.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const t = (q.getX(i) + len / 2) / len;
      if (q.getY(i) > 0) q.setY(i, q.getY(i) - (h - H) * 0.75 * t * t);
      q.setZ(i, q.getZ(i) * (1 - 0.45 * t));
    }
    geo.computeVertexNormals();
    const r = (b.r0 + b.r1) / 2;
    P.push(placed(geo, C.root, { cx: Math.cos(b.a) * r, cz: Math.sin(b.a) * r, rot: -b.a }, { y: h / 2 - 0.4, c2: C.bark2, split: 0.3 }));
  }
  // arching roots, mossy on top
  for (const A of L.arches) {
    const at = { cx: A.x, cz: A.z, rot: A.rot };
    P.push(placed(new THREE.TorusGeometry(A.R, A.tube, 7, 16, Math.PI), C.root, at, { y: H - 0.5, c2: C.bark2, split: 0.25 }));
    P.push(placed(new THREE.TorusGeometry(A.R + 0.06, A.tube * 0.8, 5, 8, 1.3), C.moss, at, { y: H - 0.5, rz: (Math.PI - 1.3) / 2 }));
  }
  // the owl hollow: a dark opening above the landing, with a rim of bark
  const ha = L.hollow.a, hx = Math.cos(ha), hz = Math.sin(ha);
  const hollow = { cx: hx * (GROVE.trunkR - 0.25), cz: hz * (GROVE.trunkR - 0.25), rot: -ha - Math.PI / 2 };
  P.push(placed(new THREE.SphereGeometry(1, 14, 10), C.hollow, hollow, { y: L.hollow.y + 2.3, sx: 1.25, sy: 1.75, sz: 0.3 }));
  P.push(placed(new THREE.TorusGeometry(1.5, 0.3, 6, 16), C.bark2, hollow, { y: L.hollow.y + 2.3, sx: 0.92, sy: 1.25, sz: 0.4 }));
  // hanging roots and moss under the boughs
  const rng = mulberry32(77);
  for (const b of L.boughs) {
    for (let i = 0; i < 7; i++) {
      const r = lerp(b.r0 + 2.5, b.r1 - 0.5, rng()), side = (rng() - 0.5) * b.hz * 1.2, len = 1.2 + rng() * 3.2;
      const x = Math.cos(b.a) * r - Math.sin(b.a) * side, z = Math.sin(b.a) * r + Math.cos(b.a) * side;
      P.push(part(box(0.09, len, 0.09), i % 2 ? C.hang : C.moss, { x, y: b.top - b.thick - len / 2 + 0.3, z }));
    }
    // a great clump of leaves at the tip
    const tip = b.r1 + 1.8;
    P.push(part(new THREE.IcosahedronGeometry(1, 1), C.leafM, { x: Math.cos(b.a) * tip, y: b.top + 0.6, z: Math.sin(b.a) * tip, sx: 3.8, sy: 2.6, sz: 3.8 }, { c2: C.leafD, split: 0.4 }));
  }
  // the canopy: a ring of leaf clumps below the crown, so the top looks out over it
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + rng() * 0.2, r = 20 + rng() * 7, y = 29 + rng() * 9, s = 3.4 + rng() * 1.6;
    P.push(part(new THREE.IcosahedronGeometry(1, 1), [C.leafM, C.leafL, C.leafD][i % 3], { x: Math.cos(a) * r, y, z: Math.sin(a) * r, sx: s * 1.25, sy: s * 0.75, sz: s * 1.25, ry: a }));
    // each clump hangs from a limb that reaches out of the trunk
    P.push(rod([Math.cos(a) * 6.4, y - 4, Math.sin(a) * 6.4], [Math.cos(a) * (r - 1), y - 0.6, Math.sin(a) * (r - 1)], 0.7, 0.25, C.bark2));
  }
  // the aerial root from the diving branch down to the pool
  const d = L.diving, tx = Math.cos(d.a) * (d.r1 - 0.4), tz = Math.sin(d.a) * (d.r1 - 0.4);
  P.push(rod([tx, d.top - 0.3, tz], [L.pool.x - Math.cos(d.a) * 1.2, L.pool.y, L.pool.z - Math.sin(d.a) * 1.2], 0.16, 0.08, C.hang, 5));
  return P;
}

// -------------------------------------------------------------- the pieces
function pieceArt(p) {
  const P = [], w = p.hx * 2, d = p.hz * 2;
  switch (p.kind) {
    case 'bark': case 'landing':
      P.push(placed(box(w, p.thick, d), C.bark, p, { y: p.top - p.thick / 2, c2: C.bark2, split: 0.5 }));
      P.push(placed(box(w * 0.98, 0.08, d * 0.82), p.kind === 'landing' ? C.moss2 : C.moss, p, { y: p.top, z: -d * 0.06 }));
      break;
    case 'fungus':
      P.push(placed(new THREE.CylinderGeometry(p.r, p.r * 0.7, p.thick, 14), C.fungus, p, { y: p.top - p.thick / 2, c2: C.fungus2, split: 0.6 }));
      break;
    case 'peg':
      P.push(placed(box(w, 0.1, d), C.plank, p, { y: p.top - 0.05 }));
      for (const s of [-1, 1]) P.push(placed(box(0.1, 0.1, d + 0.4), C.iron, p, { x: s * 0.3, y: p.top - 0.15, z: 0.2 }));
      break;
    case 'mat': case 'platform':
      P.push(...pieceParts({ kind: 'disc', cx: p.cx, cz: p.cz, top: p.top, r: p.r, trunk: 0 }));
      if (p.a != null) P.push(rod([Math.cos(p.a) * 6.5, p.top - 1.6, Math.sin(p.a) * 6.5], [p.cx, p.top - 0.3, p.cz], 0.42, 0.2, C.bark2));
      break;
    case 'bough': case 'branch': {
      // a limb flattened on top like a deck: thick at the trunk, thinner at the tip
      const lim = new THREE.CylinderGeometry(p.hz * 0.72, p.hz * 1.05, w, 10).rotateZ(-Math.PI / 2);
      P.push(placed(lim, C.bark, p, { y: p.top - p.hz * 0.74, sy: 0.7, c2: C.bark2, split: 0.45 }));
      P.push(placed(box(w, 0.4, d * 0.9), C.bark, p, { y: p.top - 0.2 }));
      P.push(placed(box(w * 0.99, 0.07, d * 0.72), p.kind === 'branch' ? C.plank : C.moss, p, { y: p.top }));
      break;
    }
    case 'log':
      P.push(placed(new THREE.CylinderGeometry(p.hz * 1.15, p.hz * 1.2, w, 12).rotateZ(Math.PI / 2), C.bark, p, { y: p.top - p.hz * 0.82, sy: 0.72, c2: C.bark2, split: 0.4 }));
      P.push(placed(box(w * 0.96, 0.07, d * 0.8), C.moss, p, { y: p.top }));
      for (const s of [-1, 1]) P.push(placed(new THREE.CylinderGeometry(p.hz, p.hz, 0.05, 12).rotateZ(Math.PI / 2), C.heart, p, { x: s * (w / 2 + 0.02), y: p.top - p.hz * 0.82, sy: 0.72 }));
      break;
    case 'stump':
      P.push(placed(new THREE.CylinderGeometry(p.r, p.r * 1.2, p.thick, 10), C.bark, p, { y: p.top - p.thick / 2, c2: C.bark2, split: 0.5 }));
      P.push(placed(new THREE.CylinderGeometry(p.r * 0.86, p.r * 0.86, 0.05, 10), C.heart, p, { y: p.top }));
      break;
    case 'root':
      P.push(placed(new THREE.CylinderGeometry(0.62, 0.7, w + 1.5, 9).rotateZ(Math.PI / 2), C.root, p, { y: p.top - 0.6, c2: C.bark2, split: 0.4 }));
      P.push(placed(box(w * 0.9, 0.07, d * 0.7), C.moss, p, { y: p.top }));
      break;
    default: break;
  }
  return P;
}

// ------------------------------------------------------------------- decor
/** The old wood: giant companion trees, undergrowth, the camp, stones round the pool. */
function buildDecor(L, group, colliders, quality) {
  const rng = mulberry32(2611), low = quality === 'low';
  const buckets = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (type, x, z, s, sink = 0.12) => {
    q.setFromAxisAngle(up, rng() * TAU);
    m.compose(v.set(x, groveGround(x, z).h - sink, z), q, sc.set(s, s * (0.9 + rng() * 0.25), s));
    (buckets[type] ||= []).push(m.clone());
  };
  const scatter = (count, pad, each) => {
    for (let n = 0, done = 0; n < count * 8 && done < count; n++) {
      const a = rng() * TAU, r = Math.sqrt(27 * 27 + rng() * (74 * 74 - 27 * 27));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!L.clear(x, z, pad)) continue;
      each(x, z);
      done++;
    }
  };
  const trunks = [];
  scatter(low ? 22 : 36, 1.5, (x, z) => {
    if (trunks.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 7)) return;
    const roll = rng(), type = roll < 0.55 ? 'roundTree' : roll < 0.82 ? 'pine' : 'birch', s = 2.6 + rng() * 1.0;
    put(type, x, z, s, 0.4);
    trunks.push([x, z]);
    const h = groveGround(x, z).h;
    colliders.push({ type: 'cyl', x, z, r: 0.32 * s, y0: h - 0.5, y1: h + 3.2 * s, tag: 'wood' });
  });
  scatter(low ? 30 : 70, 0, (x, z) => {
    const roll = rng(), type = roll < 0.4 ? 'bush' : roll < 0.6 ? 'berryBush' : roll < 0.8 ? 'grassTuft' : 'flower';
    put(type, x, z, (0.9 + rng() * 0.8) * (type === 'flower' ? 0.5 : 1));
  });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    put('rock', L.pool.x + Math.cos(a) * (L.pool.r + 0.3), L.pool.z + Math.sin(a) * (L.pool.r + 0.3), 0.45 + rng() * 0.35, 0.2);
  }
  put('camp', L.camp.x, L.camp.z, 1, 0.05);
  const made = [];
  for (const [type, mats] of Object.entries(buckets)) {
    if (!PROPS[type]) continue;
    for (const mat of [propMaterial, thinOutline]) {
      const mesh = new THREE.InstancedMesh(PROPS[type], mat, mats.length);
      mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.computeBoundingSphere();
      group.add(mesh);
      made.push(mesh);
    }
  }
  return made;
}

// ------------------------------------------------------------------- level
/**
 * Build the walkable grove for island I.
 * opts: { quality, landingAngle } — landingAngle (atan2(z, x) in world axes)
 * is the side your ship is anchored on; the beach camp turns to face it.
 */
export function buildGroveLevel(I, opts = {}) {
  const L = buildGroveLayout();
  // grove space (+z = the beach) → level space (world axes)
  const th = Math.PI / 2 - (opts.landingAngle ?? Math.PI / 2), cs = Math.cos(th), sn = Math.sin(th);
  const toL = (x, z) => ({ x: x * cs + z * sn, z: -x * sn + z * cs });
  const toS = (x, z) => ({ x: x * cs - z * sn, z: x * sn + z * cs });
  const at = (p, extra = {}) => ({ ...p, ...toL(p.x, p.z), ...extra });

  const group = new THREE.Group();
  group.name = `ashore:${I.name || 'grove'}`;
  group.rotation.y = th;
  const own = [];
  const terrain = terrainMesh();
  group.add(terrain);
  own.push(terrain.geometry);

  const tree = merged(treeParts(L));
  const parts = [];
  for (const p of L.pieces) parts.push(...pieceArt(p));
  parts.push(...rowboatParts(L.rowboat));
  const walk = merged(parts);
  own.push(tree, walk);
  for (const [geo, name] of [[tree, 'grove:tree'], [walk, 'grove:pieces']]) {
    const mesh = new THREE.Mesh(geo, propMaterial);
    mesh.name = name;
    group.add(mesh, new THREE.Mesh(geo, thinOutline));
  }
  // the pool under the diving branch: shallow, still, safe to land in
  const poolGeo = new THREE.CylinderGeometry(L.pool.r, L.pool.r, 0.1, 28);
  const poolMat = toonMaterial({ color: C.water, gradientMap: toonGradient(), transparent: true, opacity: 0.85 }, { rim: false });
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.position.set(L.pool.x, L.pool.y + 0.2, L.pool.z);
  group.add(pool);
  own.push(poolGeo, poolMat);

  const src = [...L.colliders];
  const decor = buildDecor(L, group, src, opts.quality);
  const colliders = src.map((c) => {
    if (c.type === 'cyl') return { ...c, ...toL(c.x, c.z) };
    const p = toL(c.c[0], c.c[2]);
    return { ...c, c: [p.x, c.c[1], p.z], rot: c.rot + th };
  });

  return {
    group,
    colliders,
    groundAt: (x, z) => { const s = toS(x, z); return L.groundAt(s.x, s.z); },
    groundTag: (x, z) => { const s = toS(x, z); return L.groundTag(s.x, s.z); },
    waterY: 0,
    bounds: L.bounds,
    calm: L.calm,
    spawn: at(L.spawn, { yaw: L.spawn.yaw + th }),
    exit: at(L.exit),
    checkpoints: L.checkpoints.map((c) => at(c)),
    coins: L.coins.map((c) => at(c)),
    caches: L.caches.map((c) => at(c)),
    chests: L.chests.map((c) => at(c, { yaw: c.yaw + th })),
    summit: at(L.summit),
    vault: at(L.vault),
    hubs: L.hubs,
    dispose() {
      group.removeFromParent();
      for (const o of own) o.dispose();
      for (const d of decor) d.dispose();
    },
  };
}
