// Ashore levels: turns a layout (modules.js) into a renderable level that
// follows the contract in shapes.js. One merged terrain mesh, one merged
// mesh (+ ink outline) for every platform, instanced decoration.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROPS, propMaterial, propOutline, thinOutline } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { mulberry32, noise2, TAU, clamp } from '../util.js';
import { cyl } from './shapes.js';
import { layoutLevel, validateLayout, LIMITS, MODULE_TYPES } from './modules.js';
import { pieceParts, lookoutTreeParts, rowboatParts } from './pieces.js';

export { validateLayout, LIMITS, MODULE_TYPES };

const PALETTE = {
  temperate: { sand: '#ecd9a0', wet: '#c9b27a', grass: '#6cc24a', grass2: '#58b043', rock: '#8f877d', rock2: '#7d756b', seabed: '#b9a77a' },
};

// ----------------------------------------------------------------- terrain
/**
 * A structured polar grid whose columns each follow that angle's own ring
 * radii, so cliff faces and moat banks get dense rows wherever they wobble to.
 */
function buildTerrain(T, pal, seed) {
  const { Rt, S1, S2, W1, W2, Sm, MW, BANK } = T;
  const nom = (len, step) => Math.max(2, Math.round(len / step));
  // [radius function, rows to the next knot]
  const knots = [
    [() => 0.6, nom(S2 - W2 - 1.2, 1.2)],
    [(a) => T.R2(a) - W2 - 0.6, 3], [(a) => T.R2(a) - W2, 5], [(a) => T.R2(a), 3], [(a) => T.R2(a) + 0.6, nom(S1 - S2, 1.15)],
    [(a) => T.R1(a) - W1 - 0.6, 3], [(a) => T.R1(a) - W1, 5], [(a) => T.R1(a), 3], [(a) => T.R1(a) + 0.6, nom(Sm - S1 - MW - BANK, 1.15)],
    [(a) => T.moatIn(a) - 0.4, nom(2 * (MW + BANK) + 0.8, 0.45)], [(a) => T.moatOut(a) + 0.4, nom(Rt * 0.06, 1)],
    [(a) => T.Rb(a) - 0.8, nom(Rt * 0.13, 0.6)], [(a) => T.Rs(a), 2], [(a) => T.Rs(a) + 1.2, 6], [(a) => T.Rs(a) * 1.35, 0],
  ];
  const rowsPer = knots.slice(0, -1).reduce((n, k) => n + k[1], 0) + 1;
  const SEG = 168, cols = SEG + 1;
  const pos = new Float32Array((rowsPer * cols + 1) * 3);
  const col = new Float32Array((rowsPer * cols + 1) * 3);
  const hs = new Float32Array(rowsPer * cols);
  const C = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, new THREE.Color(v)]));
  const tmp = new THREE.Color();
  for (let j = 0; j < cols; j++) {
    const a = (j / SEG) * TAU;
    const R = knots.map(([f]) => f(a));
    const r1 = T.R1(a), r2 = T.R2(a);
    let row = 0;
    for (let k = 0; k < knots.length - 1; k++) {
      const n = knots[k][1];
      for (let m = 0; m < n; m++) setVert(row++, R[k] + (R[k + 1] - R[k]) * (m / n));
    }
    setVert(row++, R[knots.length - 1]);
    function setVert(i, r) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = Math.max(T.hRA(r, a, x, z), -7);
      const kk = i * cols + j;
      hs[kk] = h;
      pos[kk * 3] = x; pos[kk * 3 + 1] = h; pos[kk * 3 + 2] = z;
      const n = noise2(x * 0.11, z * 0.11, seed + 5);
      const cliff = (r < r1 && r >= r1 - W1 - 0.05) || (r < r2 && r >= r2 - W2 - 0.05);
      if (h < -0.4) tmp.copy(C.seabed);
      else if (cliff) tmp.copy(C.rock).lerp(C.rock2, 0.5 + 0.5 * Math.sin(h * 1.7 + n * 2)); // strata
      else if (h < 0.35) tmp.copy(C.wet);
      else if (T.groundTag(x, z) === 'sand') tmp.copy(C.sand);
      else tmp.copy(n > 0.1 ? C.grass2 : C.grass);
      const v = 1 + noise2(x * 0.4, z * 0.4, 9) * 0.035;
      col[kk * 3] = tmp.r * v; col[kk * 3 + 1] = tmp.g * v; col[kk * 3 + 2] = tmp.b * v;
    }
  }
  const c0 = rowsPer * cols;
  pos[c0 * 3 + 1] = T.hRA(0, 0, 0, 0);
  tmp.copy(C.grass); col[c0 * 3] = tmp.r; col[c0 * 3 + 1] = tmp.g; col[c0 * 3 + 2] = tmp.b;
  const idx = [];
  for (let j = 0; j < SEG; j++) idx.push(c0, j + 1, j);
  for (let i = 0; i < rowsPer - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (hs[a] < -5 && hs[b] < -5 && hs[c] < -5 && hs[d] < -5) continue;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mat = toonMaterial({ vertexColors: true, gradientMap: toonGradient() }, { rim: false });
  const m = new THREE.Mesh(g, mat);
  m.name = 'terrain';
  return m;
}

// ------------------------------------------------------------------ decor
const TREES = [['roundTree', 0.36], ['pine', 0.24], ['birch', 0.14], ['fruitTree', 0.08], ['bush', 0.1], ['berryBush', 0.05], ['flower', 0.03]];
const TALL = new Set(['roundTree', 'pine', 'birch', 'fruitTree']);

function buildDecor(L, group, colliders, quality, seed) {
  const { T, keepOut, walks } = L;
  const rng = mulberry32(seed * 31 + 17);
  const low = quality === 'low';
  const buckets = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // distance from a point to any walked path
  const segs = [];
  for (const w of walks) for (let i = 1; i < w.length; i++) segs.push([w[i - 1], w[i]]);
  const nearWalk = (x, z, r) => segs.some(([[x0, z0], [x1, z1]]) => {
    const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - x0) * dx + (z - z0) * dz) / l2, 0, 1);
    return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < r;
  });
  const free = (x, z, pad) => !keepOut.some(([kx, kz, kr]) => Math.hypot(kx - x, kz - z) < kr + pad) && !nearWalk(x, z, 1.6 + pad);
  const put = (type, x, z, s, rotX = 0) => {
    const h = T.groundAt(x, z);
    if (!Number.isFinite(h)) return false;
    e.set(rotX, rng() * TAU, 0); q.setFromEuler(e);
    v.set(x, h - 0.12, z);
    sc.set(s, s * (0.88 + rng() * 0.25), s);
    m.compose(v, q, sc);
    (buckets[type] ||= []).push(m.clone());
    if (TALL.has(type)) colliders.push(cyl(x, z, 0.32 * s, h - 0.3, h + 3.2 * s, 'wood'));
    return true;
  };
  const scatter = (count, rMinF, rMaxF, table, scale, pad) => {
    const total = table.reduce((a, [, w]) => a + w, 0);
    let placed = 0;
    for (let n = 0; n < count * 6 && placed < count; n++) {
      const a = rng() * TAU, r0 = rMinF(a), r1 = rMaxF(a);
      if (r1 <= r0) continue;
      const p = T.at(Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0)), a);
      let roll = rng() * total, type = table[0][0];
      for (const [t, w] of table) { roll -= w; if (roll <= 0) { type = t; break; } }
      const big = TALL.has(type);
      if (!free(p.x, p.z, big ? pad + 2.2 : pad)) continue;
      const sz = type === 'flower' ? 0.45 + rng() * 0.2 : type.includes('ush') ? 0.55 + rng() * 0.25 : scale * (0.8 + rng() * 0.35);
      if (put(type, p.x, p.z, sz)) placed++;
    }
  };
  const k = low ? 0.5 : 1;
  const c = (v) => () => v;
  const meadowIn = (a) => T.R1(a) + 2.5, meadowOut = (a) => T.moatIn(a) - 1.0;
  const terIn = (a) => T.R2(a) + 2.5, terOut = (a) => T.R1(a) - T.W1 - 1.5;
  const meadowArea = Math.PI * ((T.Sm - T.MW - T.BANK) ** 2 - (T.S1 + 2.5) ** 2);
  scatter(Math.round(clamp(meadowArea / 45, 20, 90) * k), meadowIn, meadowOut, TREES, 0.85, 0.4);
  const terraceArea = Math.PI * ((T.S1 - T.W1 - 1.5) ** 2 - (T.S2 + 2.5) ** 2);
  scatter(Math.round(clamp(terraceArea / 60, 10, 50) * k), terIn, terOut, TREES, 0.78, 0.4);
  scatter(Math.round(10 * k), c(1.2), (a) => T.R2(a) - T.W2 - 1.2, [['flower', 0.6], ['bush', 0.25], ['rock', 0.15]], 0.5, 0.2);
  // beach: rocks and bushes; flowers along the outer moat bank
  scatter(Math.round(10 * k), (a) => T.moatOut(a) + 0.5, (a) => T.Rs(a) - 1, [['rock', 0.6], ['bush', 0.4]], 0.6, 0.3);
  scatter(Math.round(10 * k), (a) => T.moatOut(a) - 1.2, (a) => T.moatOut(a) + 0.8, [['flower', 1]], 0.5, 0.2);
  if (!low) {
    scatter(40, (a) => T.Rb(a) - 2, (a) => T.Rs(a) - 0.6, [['pebble', 1]], 1, 0.1);
    scatter(130, meadowIn, (a) => T.moatIn(a) - 0.6, [['grassTuft', 1]], 1, 0.1);
    scatter(80, (a) => T.R2(a) + 1.5, (a) => T.R1(a) - T.W1 - 0.8, [['grassTuft', 1]], 1, 0.1);
    scatter(16, c(0.8), (a) => T.R2(a) - T.W2 - 0.6, [['grassTuft', 1]], 1, 0.1);
  }
  // boulders tumbled against the foot of each rock face break up the rings
  const boulders = (Rf, every) => {
    const R0 = Rf(0), n = Math.round((TAU * R0) / every);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rng() - 0.5) * 0.04, s = 1.3 + rng() * 1.4;
      const p = T.at(Rf(a) + 0.5 + s * 0.35, a);
      if (rng() < 0.35 || !free(p.x, p.z, 0.6 + s * 0.6)) continue;
      const h = T.groundAt(p.x, p.z);
      if (!Number.isFinite(h)) continue;
      e.set(rng() * 0.6, rng() * TAU, rng() * 0.4); q.setFromEuler(e);
      v.set(p.x, h - s * 0.25, p.z); sc.set(s, s * (0.8 + rng() * 0.6), s);
      m.compose(v, q, sc);
      (buckets.rock ||= []).push(m.clone());
      colliders.push(cyl(p.x, p.z, 0.8 * s, h - 1, h + s * 1.1, 'stone'));
    }
  };
  boulders(T.R1, 4.5);
  boulders(T.R2, 4);
  // a couple of barrels and a crate by the rowboat
  const bt = L.rowboat;
  for (const [type, dx, dz] of [['barrel', -2.2, 1.6], ['crate', -2.6, -1.8], ['barrel', -1.4, 2.4]]) {
    const c = Math.cos(-bt.rot), s = Math.sin(-bt.rot);
    const x = bt.x + dx * c - dz * s, z = bt.z + dx * s + dz * c;
    put(type, x, z, 0.55 + rng() * 0.1, type === 'barrel' && dz > 2 ? 1.4 : 0);
  }

  const grass = new THREE.Color(PALETTE.temperate.grass);
  const tint = new THREE.Color();
  const made = [];
  for (const [type, mats] of Object.entries(buckets)) {
    const mesh = new THREE.InstancedMesh(PROPS[type], propMaterial, mats.length);
    mats.forEach((mm, i) => {
      mesh.setMatrixAt(i, mm);
      const b = 0.9 + rng() * 0.18;
      if (type === 'grassTuft') tint.copy(grass).multiplyScalar(0.92 + rng() * 0.16);
      else tint.setRGB(b, b, b);
      mesh.setColorAt(i, tint);
    });
    mesh.computeBoundingSphere();
    mesh.name = 'decor:' + type;
    group.add(mesh);
    made.push(mesh);
    if (type === 'grassTuft' || type === 'pebble') continue;
    const small = type === 'flower' || type.includes('ush') || type === 'rock';
    const ol = new THREE.InstancedMesh(PROPS[type], small ? thinOutline : propOutline, mats.length);
    ol.instanceMatrix = mesh.instanceMatrix;
    ol.boundingSphere = mesh.boundingSphere;
    group.add(ol);
    made.push(ol);
  }
  return made;
}

// ------------------------------------------------------------------- level
/**
 * Generate the on-foot level for an island (see shapes.js for the shape).
 * opts: { quality: 'high' | 'low', landingAngle } — landingAngle (atan2(z, x),
 * level space = world axes) puts the rowboat on the side facing the ship.
 */
export function generateLevel(island, opts = {}) {
  const L = layoutLevel(island, opts);
  const { T } = L;
  const pal = PALETTE[L.biome] || PALETTE.temperate;
  const group = new THREE.Group();
  group.name = `ashore:${island.name || island.id}`;
  const own = []; // geometries and materials this level created

  const terrain = buildTerrain(T, pal, island.seed | 0);
  group.add(terrain);
  own.push(terrain.geometry, terrain.material);

  // every platform, the lookout tree and the rowboat: one mesh + one outline
  const parts = [];
  for (const p of L.pieces) parts.push(...pieceParts(p));
  const chestBranch = L.branches.find((b) => b.name === 'chest');
  if (chestBranch) parts.push(...lookoutTreeParts(chestBranch.tree, chestBranch.nodes.filter((n) => n.type === 'piece').map((n) => n.piece)));
  parts.push(...rowboatParts(L.rowboat));
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  const platforms = new THREE.Mesh(merged, propMaterial);
  const outline = new THREE.Mesh(merged, thinOutline);
  platforms.name = 'platforms';
  group.add(platforms, outline);
  own.push(merged);

  const colliders = [...L.colliders];
  const decor = buildDecor(L, group, colliders, opts.quality, island.seed | 0);

  const level = {
    group,
    colliders,
    groundAt: T.groundAt,
    groundTag: T.groundTag,
    waterY: 0,
    bounds: { r: T.Rt * 1.06 },
    spawn: L.spawn,
    exit: L.exit,
    checkpoints: L.checkpoints,
    coins: L.coins,
    caches: L.caches,
    chests: L.chests,
    summit: L.summit,
    // extras (not in the contract, handy for debugging and hints)
    modules: L.modules,
    layout: L,
    dispose() {
      group.removeFromParent();
      for (const o of own) o.dispose();
      for (const d of decor) d.dispose();
    },
  };
  return level;
}

/** Validate a generated level (or a raw layout). */
export function validateLevel(level) {
  // include the decor colliders (tree trunks) so nothing blocks a walked path
  return level.layout ? validateLayout({ ...level.layout, colliders: level.colliders }) : validateLayout(level);
}
