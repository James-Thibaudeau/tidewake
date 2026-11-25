// The Elder Grove as a walkable level: the first landmark level, hand-built
// like the wreck. grove-layout.js decides where everything stands (and is
// checked in Node); this file assembles it: the ground, the great tree, the
// old wood round it, and the pool under the diving branch. The bark, moss and
// fungus themselves (the trunk, every limb and everything you climb on) are
// made in grove-art.js.
//
// It is built at a scale that plays well, not at the sea view's scale
// (elder-tree.js), but keeps its landmarks: arching roots, the owl hollow,
// moss and hanging roots. The layout is authored with the beach on +z; the
// level turns it so the rowboat faces your anchored ship.
// The story lives here too: the note on grandfather's tent, the heart he
// carved at the root of the owl bough with Journal III wedged beside it, and
// (from grove-life.js) the owl that guides you up and the fireflies at night.
// Follows the level contract in shapes.js, plus:
//   spots: { note, journal }      story interactions ({ x, y, z, r }; journal has the journal's id)
//   syncStory({ journal })        show the journal while it waits to be found
//   update(dt, t, { pos, night, play })   the owl and the fireflies
//   hubs: [{ x, z, orbit, base, top }]   trunks the camera circles (camera.js)
//   fallBack: { drop, below, safe: [{ x, z, r }], down: { x, y, z, yaw } }   a fall longer
//       than `drop` that lands more than `below` under your last lantern returns you to it
//       (ashore.js), unless you land in a safe circle (the pool under the
//       diving branch); lanterns that high offer to climb down to `down`
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, propMaterial, thinOutline, PROPS } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { mulberry32, noise2, lerp, TAU } from '../util.js';
import { rowboatParts } from './pieces.js';
import { buildGroveLayout, groveGround, streamZ, GROVE } from './grove-layout.js';
import { buildGroveLife } from './grove-life.js';
import { C, box, placed, rod, trunkParts, trunkLifeParts, archParts, pieceArt } from './grove-art.js';

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
function treeParts(L, low) {
  const P = [...trunkParts(low), ...trunkLifeParts(L, low)];
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
    const at = { cx: Math.cos(b.a) * r, cz: Math.sin(b.a) * r, rot: -b.a };
    P.push(placed(geo, C.root, at, { y: h / 2 - 0.4, c2: C.bark2, split: 0.3 }));
    // moss along its back (local x runs out from the trunk)
    for (const t of [0.12, 0.4, 0.7]) {
      P.push(placed(new THREE.SphereGeometry(0.5, 6, 4), t > 0.3 ? C.moss : C.moss2, at, { x: -len / 2 + t * len, y: b.top - (h - H) * 0.75 * t * t, sx: 1.5, sy: 0.3, sz: (b.half / 0.5) * (1 - 0.45 * t) }));
    }
  }
  // arching roots, mossy on top
  for (const A of L.arches) P.push(...archParts(A, H));
  // the owl hollow: a dark opening above the landing, with a rim of bark
  const ha = L.hollow.a, hx = Math.cos(ha), hz = Math.sin(ha);
  const hollow = { cx: hx * (GROVE.trunkR - 0.25), cz: hz * (GROVE.trunkR - 0.25), rot: -ha - Math.PI / 2 };
  P.push(placed(new THREE.SphereGeometry(1, 14, 10), C.hollow, hollow, { y: L.hollow.y + 2.3, sx: 1.25, sy: 1.75, sz: 0.3 }));
  P.push(placed(new THREE.TorusGeometry(1.5, 0.3, 6, 16), C.bark2, hollow, { y: L.hollow.y + 2.3, sx: 0.92, sy: 1.25, sz: 0.4 }));
  // hanging roots and moss under the boughs
  const rng = mulberry32(77);
  for (const b of L.boughs) {
    for (let i = 0; i < 7; i++) {
      // out past the spiral, and on the owl bough only near its tip: nearer in they dangle in front of the camera
      const r = lerp(Math.max(b.r0 + 2.5, b === L.boughs[0] ? 21 : 13), b.r1 - 0.5, rng()), side = (rng() - 0.5) * b.hz * 1.2, len = 1.2 + rng() * 3.2;
      const x = Math.cos(b.a) * r - Math.sin(b.a) * side, z = Math.sin(b.a) * r + Math.cos(b.a) * side;
      P.push(part(box(0.09, len, 0.09), i % 2 ? C.hang : C.moss, { x, y: b.top - b.thick - len / 2 + 0.3, z }));
    }
    // the canopy: each bough forks at its tip into limbs that carry great leaf
    // clumps. They stand well outside the climb (and the camera that circles
    // it), and below the crown, so the top looks out over them.
    const tip = [Math.cos(b.a) * (b.r1 - 0.5), b.top - 0.5, Math.sin(b.a) * (b.r1 - 0.5)];
    for (const [k, off] of [-0.42, 0, 0.42, -0.2, 0.22].entries()) {
      const a = b.a + off, da = Math.atan2(Math.sin(a - L.diving.a), Math.cos(a - L.diving.a));
      if (Math.abs(da) < 0.3) continue; // keep the dive clear
      const r = Math.max(b.r1 + 9, 29) + rng() * 5, y = Math.min(37, b.top + 3 + k * 2.2 + rng() * 2), s = 3.6 + rng() * 1.5;
      P.push(part(new THREE.IcosahedronGeometry(1, 1), [C.leafM, C.leafL, C.leafD][k % 3], { x: Math.cos(a) * r, y, z: Math.sin(a) * r, sx: s * 1.3, sy: s * 0.72, sz: s * 1.3, ry: a }));
      P.push(rod(tip, [Math.cos(a) * (r - 1.5), y - 0.8, Math.sin(a) * (r - 1.5)], 0.5, 0.2, C.bark2));
    }
  }
  // knots of wood for the owl to sit on, up the spiral
  for (const p of L.perches) {
    if (p.stub) P.push(rod([Math.cos(p.a) * 6.3, p.y - 0.3, Math.sin(p.a) * 6.3], [Math.cos(p.a) * (p.r + 0.35), p.y - 0.1, Math.sin(p.a) * (p.r + 0.35)], 0.2, 0.11, C.bark2));
  }
  P.push(...carvingParts(L));
  // the aerial root from the diving branch down to the pool
  const d = L.diving, tx = Math.cos(d.a) * (d.r1 - 0.4), tz = Math.sin(d.a) * (d.r1 - 0.4);
  P.push(rod([tx, d.top - 0.3, tz], [L.pool.x - Math.cos(d.a) * 1.2, L.pool.y, L.pool.z - Math.sin(d.a) * 1.2], 0.16, 0.08, C.hang, 5));
  return P;
}

// --------------------------------------------------------------- the story
/** A frame on the bark at the carving: x along the trunk, y up, z out of it. */
const onBark = (L) => ({ cx: Math.cos(L.carving.a) * GROVE.trunkR, cz: Math.sin(L.carving.a) * GROVE.trunkR, rot: Math.PI / 2 - L.carving.a });

/** A heart, lopsided: he carved it sixty feet up with one hand on the tree. */
function heart(s) {
  const h = new THREE.Shape();
  h.moveTo(0, -0.5 * s);
  h.bezierCurveTo(-0.75 * s, 0, -0.6 * s, 0.62 * s, -0.05 * s, 0.28 * s);
  h.bezierCurveTo(0.35 * s, 0.72 * s, 0.95 * s, 0.15 * s, 0, -0.5 * s);
  return new THREE.ShapeGeometry(h, 8);
}

/**
 * Grandfather's carving, on the trunk at the root of the owl bough: a blaze
 * cut flat in the bark, the heart, two sets of initials (worn soft, so they
 * stay unread) and a little anchor. Beside it, the crack that holds his journal.
 */
function carvingParts(L) {
  const at = onBark(L), y = L.carving.y, P = [];
  const cut = (geo, color, t) => P.push(placed(geo, color, at, t));
  cut(new THREE.CylinderGeometry(1.15, 1.15, 0.5, 18), C.blaze, { rx: Math.PI / 2, y: y + 1.85, z: -0.2, sz: 1.15 });
  cut(heart(1.5), C.furrow, { x: -0.05, y: y + 2.1, z: 0.07 });
  cut(heart(1.22), C.blaze, { x: -0.04, y: y + 2.12, z: 0.085 });
  // the initials either side of a plus: gouges the weather has rounded off
  cut(box(0.2, 0.05, 0.02), C.furrow, { y: y + 2.15, z: 0.1 });
  cut(box(0.05, 0.2, 0.02), C.furrow, { y: y + 2.15, z: 0.1 });
  for (const s of [-1, 1]) {
    cut(box(0.06, 0.26, 0.02), C.furrow, { x: s * 0.3, y: y + 2.17, z: 0.1, rz: s * 0.25 });
    cut(box(0.16, 0.06, 0.02), C.furrow, { x: s * 0.36, y: y + 2.2, z: 0.1, rz: -s * 0.3 });
  }
  // the little anchor underneath, for the children
  cut(box(0.06, 0.42, 0.02), C.furrow, { y: y + 1.0, z: 0.07 });
  cut(box(0.26, 0.06, 0.02), C.furrow, { y: y + 1.14, z: 0.07 });
  cut(new THREE.TorusGeometry(0.07, 0.025, 4, 10), C.furrow, { y: y + 1.27, z: 0.07 });
  cut(new THREE.TorusGeometry(0.19, 0.03, 4, 10, Math.PI), C.furrow, { y: y + 0.96, z: 0.07, rz: Math.PI });
  // the crack
  cut(box(0.2, 1.3, 0.4), C.hollow, { x: -1.35, y: y + 1.1, z: -0.12, rz: 0.08 });
  return P;
}

/** Journal III, wedged in the crack (shown while it waits to be found). */
function journalParts(L) {
  const at = onBark(L), y = L.carving.y;
  return [
    placed(box(0.12, 0.46, 0.36), C.leather, at, { x: -1.35, y: y + 1.05, z: 0.16, rz: 0.08, rx: 0.2 }),
    placed(box(0.08, 0.4, 0.32), C.paper, at, { x: -1.35, y: y + 1.05, z: 0.19, rz: 0.08, rx: 0.2 }),
  ];
}

/** The note on the tent's front pole. */
function noteParts(L) {
  const c = L.camp, at = { cx: c.x, cz: c.z, rot: c.rot };
  return [
    placed(box(0.34, 0.42, 0.03), C.paper, at, { x: 0.02, y: c.y + 1.4, z: 1.83, rz: 0.06 }),
    placed(box(0.05, 0.05, 0.05), C.iron, at, { x: 0.02, y: c.y + 1.55, z: 1.85 }),
  ];
}

// ------------------------------------------------------------------- decor
/** The old wood: giant companion trees, undergrowth, the camp, stones round the pool. */
function buildDecor(L, group, colliders, quality) {
  const rng = mulberry32(2611), low = quality === 'low';
  const buckets = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (type, x, z, s, sink = 0.12, rot = rng() * TAU) => {
    q.setFromAxisAngle(up, rot);
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
  put('camp', L.camp.x, L.camp.z, 1, 0.05, L.camp.rot);
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

  const low = opts.quality === 'low';
  const tree = merged(treeParts(L, low));
  const parts = [];
  for (const [i, p] of L.pieces.entries()) parts.push(...pieceArt(p, i, low));
  parts.push(...rowboatParts(L.rowboat), ...noteParts(L));
  const walk = merged(parts);
  own.push(tree, walk);
  for (const [geo, name] of [[tree, 'grove:tree'], [walk, 'grove:pieces']]) {
    const mesh = new THREE.Mesh(geo, propMaterial);
    mesh.name = name;
    group.add(mesh, new THREE.Mesh(geo, thinOutline));
  }
  // his journal in the crack by the carving, until it's found
  const bookGeo = merged(journalParts(L));
  own.push(bookGeo);
  const book = new THREE.Group();
  book.add(new THREE.Mesh(bookGeo, propMaterial), new THREE.Mesh(bookGeo, thinOutline));
  book.visible = false;
  group.add(book);
  // the owl and the fireflies
  const life = buildGroveLife(L, { quality: opts.quality });
  group.add(life.group);
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
    spots: { note: at(L.spots.note), journal: at(L.spots.journal) },
    syncStory({ journal = false } = {}) { book.visible = journal; },
    update(dt, t, { pos, night, play }) {
      const s = toS(pos.x, pos.z);
      life.update(dt, t, { x: s.x, y: pos.y, z: s.z }, night, play);
    },
    life,
    hubs: L.hubs,
    fallBack: { drop: L.fallBack.drop, below: L.fallBack.below, safe: L.fallBack.safe.map((c) => at(c)), down: at(L.fallBack.down, { yaw: L.fallBack.down.yaw + th }) },
    dispose() {
      group.removeFromParent();
      for (const o of own) o.dispose();
      for (const d of decor) d.dispose();
      life.dispose();
    },
  };
}
