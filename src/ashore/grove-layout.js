// The Elder Grove's layout: where everything in the walkable level stands.
// Plain data and maths (no three.js), so tools/check.mjs can validate it and
// send a test climber up the tree in Node. grove.js turns it into meshes.
//
// Grove space: the trunk's centre at the origin, y up, the sea at y = 0, the
// beach camp on the +z side. Angles are atan2(z, x); `rel` angles are
// measured from the root gate (which faces the beach), turning from +z
// towards -x, the way the climb goes round the trunk.
//
// The route (docs/elder-grove-level.md): beach → log bridge over the stream →
// under a root arch → the root gate and the vault → twice round the trunk on
// bark ledges, shelf fungus and grandfather's pegs → the owl hollow (14 m) →
// fungus steps to the owl bough (18 m) → optional: leaf mats and boughs up
// to the crown (42 m), then off the diving branch into the pool.
import { ASHORE } from '../config.js';
import { noise2, smoothstep, clamp, lerp, TAU } from '../util.js';
import { obox, cyl } from './shapes.js';

export const GROVE = {
  R: 95,            // the shore
  trunkR: 7, trunkTop: 41.4,
  hill: 3,          // the flat hilltop round the trunk
  start: 0.55,      // rel angle where the spiral leaves the ground
  hollowY: 14, boughY: 18, crownY: 42,
};
// Limits for required moves (gentler than ASHORE.design) and for the crown climb.
export const GROVE_LIMITS = {
  main: { up: 1.0, gap: 1.6, drop: ASHORE.design.safeDrop },
  crown: { up: ASHORE.design.jumpUp, gap: 2.6 },
};
const GATE = Math.PI / 2;
const THICK = { bark: 0.5, landing: 0.6, fungus: 0.35, peg: 0.16, mat: 0.34, bough: 1.2, branch: 0.5, log: 0.7, root: 3, platform: 0.6 };
const TAG = { mat: 'leaf', platform: 'leaf' };

// ------------------------------------------------------------------ ground
const STREAM = { z: 50, amp: 3, k: 0.06, half: 2.2, bank: 2.2, bed: -1.4 };
export const streamZ = (x) => STREAM.z + STREAM.amp * Math.sin(x * STREAM.k);

function profile(r) {
  if (r <= 22) return GROVE.hill;
  if (r <= 70) return lerp(GROVE.hill, 2.4, smoothstep(22, 70, r));
  if (r <= 78) return lerp(2.4, 1.2, (r - 70) / 8);
  if (r <= 88) return lerp(1.2, 0, (r - 78) / 10);
  return Math.max(-6, -(r - 88) * 0.6);
}

/** Terrain height and surface at a point (grove space). */
export function groveGround(x, z) {
  const r0 = Math.hypot(x, z);
  // the shoreline wobbles a little, so the island isn't a perfect circle
  const wob = r0 > 1 ? 2.5 * noise2((x / r0) * 2, (z / r0) * 2, 9) * smoothstep(60, 80, r0) : 0;
  const r = r0 + wob;
  let h = profile(r);
  // the old wood's floor rolls gently, but the path from the beach is smooth
  const path = z > 0 ? smoothstep(2.5, 7, Math.abs(x)) : 1;
  h += 0.22 * noise2(x * 0.09, z * 0.09, 4) * smoothstep(24, 30, r) * (1 - smoothstep(72, 78, r)) * path;
  // the stream cuts across between the beach and the tree
  const k = 1 - smoothstep(STREAM.half, STREAM.half + STREAM.bank, Math.abs(z - streamZ(x)));
  if (k > 0 && h > STREAM.bed) h = lerp(h, STREAM.bed, k);
  return { h, tag: r > 76 ? 'sand' : 'grass' };
}
const groundAt = (x, z) => { const h = groveGround(x, z).h; return h < -0.55 ? -Infinity : h; };

// ------------------------------------------------------------------ pieces
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
/** A flat-topped slab. Local x runs along `rot` (three.js rotation.y), z across. */
function rect(kind, cx, cz, top, hx, hz, rot, extra = {}) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const foot = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]);
  return { kind, cx, cz, top, hx, hz, rot, thick: THICK[kind], foot, ...extra };
}
function disc(kind, cx, cz, top, r, extra = {}) {
  const foot = [];
  for (let i = 0; i < 12; i++) foot.push([cx + Math.cos((i / 12) * TAU) * r, cz + Math.sin((i / 12) * TAU) * r]);
  return { kind, cx, cz, top, r, thick: THICK[kind], foot, ...extra };
}
/** A slab against the trunk at angle a: from radius r0 to r1, `half` along the bark. */
const onTrunk = (kind, a, r0, r1, half, top, extra) => rect(kind, ...pol((r0 + r1) / 2, a), top, half, (r1 - r0) / 2, -a - Math.PI / 2, { a, ...extra });
/** A slab reaching out from the trunk along angle a. */
const radial = (kind, a, r0, r1, half, top, extra) => rect(kind, ...pol((r0 + r1) / 2, a), top, (r1 - r0) / 2, half, -a, { a, r0, r1, ...extra });
const atPolar = (kind, r, a, top, rad, extra) => disc(kind, ...pol(r, a), top, rad, { a, pr: r, ...extra });

function colliderOf(p) {
  const tag = TAG[p.kind] || 'wood';
  if (p.r != null) return cyl(p.cx, p.cz, p.r, p.top - p.thick, p.top, tag);
  return obox(p.cx, p.top - p.thick / 2, p.cz, p.hx, p.thick / 2, p.hz, p.rot, tag);
}

// ---------------------------------------------------------------- geometry
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** Shortest distance between two footprints (0 when they touch or overlap). */
export function footGap(A, B) {
  if (A.some(([x, z]) => inside(B, x, z)) || B.some(([x, z]) => inside(A, x, z))) return 0;
  let d = Infinity;
  for (const [P, Q] of [[A, B], [B, A]]) {
    for (const [x, z] of P) for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) d = Math.min(d, segDist(x, z, Q[j][0], Q[j][1], Q[i][0], Q[i][1]));
  }
  return d;
}
/** The footprint of a route node: its piece, or just the spot on the ground. */
export const nodeFoot = (n) => (n.piece ? n.piece.foot : [[n.x, n.z]]);
/** The highest thing to stand on under (x, z) that is no higher than `below`. */
export function supportAt(L, x, z, below) {
  let s = L.groundAt(x, z);
  if (!(s <= below)) s = -Infinity;
  for (const p of L.pieces) if (p.top <= below && p.top > s && inside(p.foot, x, z)) s = p.top;
  return s;
}

// ------------------------------------------------------------------ layout
/** Build the whole grove (grove space). The same every time: nothing is random. */
export function buildGroveLayout() {
  const G = GROVE;
  const pieces = [], route = [], crown = [], coins = [], caches = [];
  const add = (p) => { p.id = 'p' + pieces.length; pieces.push(p); return p; };
  const node = (list, p, r, a) => { const [x, z] = r == null ? [p.cx, p.cz] : pol(r, a); list.push({ x, z, y: p.top, piece: p }); };
  const walkTo = (x, z) => route.push({ x, z, y: groveGround(x, z).h });
  const coin = (x, y, z, value = 1) => coins.push({ id: 'c' + coins.length, x, y, z, value });
  const coinAt = ([x, z], y, value) => coin(x, y, z, value);

  // ---- beach, the stream, the way to the roots
  let shore = 80;
  while (shore < 100 && groveGround(0, shore).h > 0.25) shore += 0.25;
  const rowboat = { x: 0, y: Math.max(0, groveGround(0, shore - 0.6).h), z: shore - 0.6, rot: -Math.PI / 2 };
  const spawn = { x: 1.5, y: groveGround(1.5, shore - 4.5).h, z: shore - 4.5, yaw: Math.PI };
  const exit = { x: rowboat.x, y: rowboat.y, z: rowboat.z, r: 2.8 };
  const camp = { x: -7, y: groveGround(-7, 77).h, z: 77, r: 1.7 };
  walkTo(spawn.x, spawn.z);
  walkTo(0, 62);
  // a fallen giant across the stream, worn flat on top
  const sz = streamZ(0);
  const log = add(rect('log', 0, sz, 2.8, 5.8, 0.85, Math.PI / 2));
  walkTo(0, sz + 6.2); node(route, log); walkTo(0, sz - 6.2);
  // stumps as stepping stones a little upstream (optional, with coins)
  const stumps = [-3.3, -1.1, 1.1, 3.3].map((d) => add(disc('stump', -10, streamZ(-10) + d, 2.95, 0.85, { thick: 4.6 })));
  for (const s of stumps) coin(s.cx, s.top, s.cz);
  for (let z = 74; z > 18; z -= 6.5) if (Math.abs(z - sz) > 7) coin(0, groveGround(0, z).h, z);
  for (const d of [-3, 0, 3]) coin(0, log.top, sz + d);
  walkTo(0, 16.5);
  // the root you can hop over (or walk round) in front of the gate
  const root = add(rect('root', 0, 14, G.hill + 0.85, 5, 0.6, 0, { thick: 2 }));
  for (const x of [-2.5, 0, 2.5]) coin(x, root.top, 14);
  // root arches: walk under them. The first spans the path; the rest ring the tree.
  const arches = [{ x: 0, z: 17, R: 3.4, tube: 0.75, rot: 0 }];
  for (const [rel, r, R] of [[1.35, 15, 3.0], [2.3, 14, 2.6], [3.2, 16, 3.3], [4.2, 14.5, 2.8], [5.3, 15.5, 3.1]]) {
    const a = GATE + rel, [x, z] = pol(r, a);
    arches.push({ x, z, R, tube: 0.6 + R * 0.05, rot: -a - Math.PI / 2 });
  }
  // the two buttress roots that make the gate, and lower ones round the far side
  const buttresses = [[0.38, 11, 3.5], [-0.38, 11, 3.5], [-0.95, 10.2, 2.6], [-1.5, 9.6, 1.9]].map(([rel, r1, h]) => ({ a: GATE + rel, r0: 6.6, r1, half: 0.7, top: G.hill + h }));
  const vault = { x: 0, y: G.hill, z: G.trunkR + 1.4 };
  caches.push({ id: 'g0', x: 1.6, y: G.hill, z: G.trunkR + 1.2, value: 30 });

  // ---- twice round the trunk
  walkTo(-6.8, 15.5);
  walkTo(...pol(11.6, GATE + G.start + 0.14));
  const END = 2 * TAU - 0.36;                        // where the hollow's landing begins
  const K = (G.hollowY - G.hill) / (END - G.start);  // rise per radian
  const helix = (rel) => G.hill + (rel - G.start) * K;
  const outer = (rel) => (rel < TAU + G.start ? 10.4 : 9.2); // the lower turn is wider, to catch a fall
  let a = G.start, y = G.hill, n = 0;
  const rise = (rel, max) => { y = Math.min(y + max, Math.max(y, helix(rel))); return y; };
  const onRoute = (p) => { add(p); node(route, p, p.r != null ? null : 8.3, p.a); if (n++ % 5 === 2) coinAt(pol(8.4, p.a), p.top); return p; };
  // narrow steps: seen from above each is nearly a wedge of the ring, so a
  // gap between two of them is a clean gap at every distance from the trunk
  const walk = (count, w = 0.14, up = 0) => {
    for (let i = 0; i < count; i++) {
      const c = a + w / 2, r1 = outer(c);
      if (up && i === 0) y += up; else rise(c, 0.3);
      onRoute(onTrunk('bark', GATE + c, 6.7, r1, (w * r1) / 2 + 0.02, y));
      a += w;
    }
  };
  const fungus = (count) => {
    for (let i = 0; i < count; i++) {
      a += 0.9 / 8;
      const c = a + 1.25 / 8;
      onRoute(atPolar('fungus', 8, GATE + c, rise(c, 0.6), 1.25));
      a = c + 1.25 / 8;
    }
    a += 0.7 / 8;
  };
  const pegs = (count) => {
    for (let i = 0; i < count; i++) {
      a += 0.7 / 8;
      const c = a + 0.55 / 8;
      onRoute(onTrunk('peg', GATE + c, 6.9, 9.4, 0.55, rise(c, 0.5)));
      a = c + 0.55 / 8;
    }
    a += 0.7 / 8;
  };
  const steps = [() => walk(10), () => { a += 1.2 / 8; }, () => walk(8), () => fungus(3), () => walk(8), () => pegs(4), () => walk(6), () => walk(8, 0.14, 0.8)];
  for (let i = 0; a < END - 2.2; i++) steps[i % steps.length]();
  const left = Math.ceil((END - a) / 0.14);
  walk(left, (END - a) / left);
  // the owl hollow's landing, facing the beach
  const hollowA = GATE + 2 * TAU;
  const landing = add(onTrunk('landing', hollowA, 6.7, 11, 0.36 * 8 + 0.02, G.hollowY));
  node(route, landing, 8.6, hollowA);
  caches.push({ id: 'g1', ...xz(pol(9.6, hollowA + 0.2)), y: G.hollowY, value: 20 });

  // ---- fungus steps up to the owl bough
  let fa = 2 * TAU + 0.36 + (0.3 + 0.9) / 8, fy = G.hollowY;
  for (let i = 0; i < 4; i++) {
    fy += 0.8;
    const f = add(atPolar('fungus', 8, GATE + fa, fy, 0.9));
    node(route, f);
    if (i % 2) coin(f.cx, f.top, f.cz);
    fa += 2.1 / 8;
  }
  const boughRel = fa - 2.1 / 8 + (0.9 + 0.3 + 1.7) / 8;
  const aB = GATE + boughRel;
  const owlBough = add(radial('bough', aB, 6.5, 24, 1.7, G.boughY));
  node(route, owlBough, 8.8, aB);
  for (const r of [12, 15, 18, 21]) coinAt(pol(r, aB), G.boughY);
  const carving = { ...xz(pol(8.2, aB)), y: G.boughY };
  // the easy way down from the carving: off the bough's tip onto two broad
  // leaf mats hung from it on aerial roots. They hang beyond the tip, behind
  // the camera that circles the trunk: anything nearer in (a mat, a limb)
  // hides the spiral's ledges. A miss on the fungus steps lands on the turn
  // below, or back at the hollow's lantern.
  const tip = pol(23.4, aB), hang = [tip[0], G.boughY - 1, tip[1]];
  const down = [atPolar('mat', 26, aB, 12.5, 2.6, { hang }), atPolar('mat', 30.5, aB + 0.12, 8.6, 2.6, { hang })].map(add);

  // ---- the crown climb (optional): leaf mats between three more boughs
  node(crown, owlBough, 13, aB);
  const boughs = [owlBough];
  let ca = aB, cy = G.boughY;
  for (let b = 0; b < 3; b++) {
    for (let i = 1; i <= 5; i++) {
      const m = add(atPolar('mat', 13, ca + (1.9 * i) / 6, cy + (5 * i) / 6, 1.5 - (i % 2) * 0.15, { twig: true }));
      node(crown, m);
      if (i % 2) coin(m.cx, m.top, m.cz, 2);
    }
    ca += 1.9; cy += 5;
    const B = add(radial('bough', ca, 6.5, 18, 1.3, cy));
    boughs.push(B);
    node(crown, B, 12.8, ca);
  }
  for (let i = 1; i <= 9; i++) {
    const m = add(atPolar('mat', lerp(12.5, 8.4, (i - 1) / 8), ca + 0.4 * i, cy + 0.9 * i, 1.4, { twig: true }));
    node(crown, m);
    if (i % 2 === 0) coin(m.cx, m.top, m.cz, 2);
  }
  const platform = add(disc('platform', 0, 0, G.crownY, 5.2));
  const last = crown[crown.length - 1];
  crown.push({ x: (last.x / Math.hypot(last.x, last.z)) * 3.4, z: (last.z / Math.hypot(last.x, last.z)) * 3.4, y: G.crownY, piece: platform });
  for (let i = 0; i < 4; i++) coinAt(pol(3.6, i * (TAU / 4) + 0.4), G.crownY, 2);
  caches.push({ id: 'g2', x: -1.8, y: G.crownY, z: 1.2, value: 40 });
  // the way down: off the end of the diving branch, into the pool
  const aP = aB + 4.3;
  const diving = add(radial('branch', aP, 4.6, 21, 0.55, G.crownY));
  const pool = { ...xz(pol(26, aP)), r: 6 }; // wide enough for a step off the tip or a running leap
  pool.y = groveGround(pool.x, pool.z).h;

  // ---- colliders
  const colliders = pieces.map(colliderOf);
  colliders.push(cyl(0, 0, G.trunkR, -2, G.trunkTop, 'wood'));
  for (const b of buttresses) {
    const [x, z] = pol((b.r0 + b.r1) / 2, b.a);
    colliders.push(obox(x, b.top / 2, z, (b.r1 - b.r0) / 2, b.top / 2, b.half, -b.a, 'wood'));
  }
  for (const A of arches) {
    for (const s of [-1, 1]) colliders.push(cyl(A.x + s * A.R * Math.cos(A.rot), A.z - s * A.R * Math.sin(A.rot), A.tube + 0.1, 0, G.hill + A.R * 0.55, 'wood'));
  }
  colliders.push(cyl(camp.x, camp.z, camp.r, 0, camp.y + 2.2, 'wood'));
  colliders.push(obox(rowboat.x, rowboat.y + 0.2, rowboat.z, 1.7, 0.25, 0.7, rowboat.rot, 'wood'));

  const checkpoints = [
    { id: 'gate', x: 3.6, y: G.hill, z: 15.6 },
    { id: 'hollow', ...xz(pol(10, hollowA - 0.22)), y: G.hollowY },
    { id: 'carving', ...xz(pol(10.2, aB - 0.09)), y: G.boughY },
    { id: 'crown', x: 2.6, y: G.crownY, z: -2.8 },
    // one on each bough of the crown climb, so a fall near the top costs one stretch
    ...boughs.slice(1).map((B, i) => ({ id: 'bough' + (i + 2), ...xz(pol(9.6, B.a - 0.07)), y: B.top })),
  ];
  /** Is this a spot where a tree or bush may stand (clear of the route)? */
  const clear = (x, z, pad = 0) => {
    const r = Math.hypot(x, z);
    if (r < 27 + pad || r > 74 - pad) return false;
    if (Math.abs(z - streamZ(x)) < 6.5 + pad) return false;
    if (z > 0 && Math.abs(x) < 5.5 + pad) return false;
    if (Math.hypot(x - pool.x, z - pool.z) < pool.r + 4 + pad) return false;
    if (down.some((m) => Math.hypot(x - m.cx, z - m.cz) < m.r + 4 + pad)) return false;
    return !stumps.some((s) => Math.hypot(x - s.cx, z - s.cz) < 4 + pad);
  };

  return {
    pieces, colliders, route, crown, groundAt, groundTag: (x, z) => groveGround(x, z).tag, waterY: 0,
    bounds: { r: G.R + 3 }, calm: { x: 0, z: 0, r: 72 },
    spawn, exit, rowboat, camp, checkpoints, coins, caches,
    chests: [{ id: 'chest', x: 0, y: G.crownY, z: 0, yaw: aP }],
    summit: { x: 0, y: G.crownY, z: 0 }, vault, carving, hollow: { a: hollowA, y: G.hollowY },
    hubs: [{ x: 0, z: 0, orbit: 12, base: G.hill + 0.5, top: G.crownY - 1.2 }],
    // a long fall puts you back at your last lantern, except the dive into the pool
    // and a lantern up the tree offers a quick way back down to the gate
    fallBack: { drop: ASHORE.design.safeDrop, below: 3, safe: [{ x: pool.x, z: pool.z, r: pool.r + 3 }], down: { x: 1.2, y: G.hill, z: 16.2, yaw: Math.PI } },
    arches, buttresses, boughs, stumps, down, diving, pool, platform, clear,
  };
}
function xz([x, z]) { return { x, z }; }

// -------------------------------------------------------------- validation
/** Check the layout against the design limits. Returns { ok, errors, stats }. */
export function validateGrove(L) {
  const errors = [];
  const HEAD = ASHORE.height + 0.2;
  const check = (nodes, lim, label) => {
    let jumps = 0;
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i];
      const dy = B.y - A.y, gap = footGap(nodeFoot(A), nodeFoot(B));
      const where = `${label}[${i}] ${A.piece?.kind || 'ground'}→${B.piece?.kind || 'ground'}`;
      if (!A.piece && !B.piece) continue; // a walk over open ground: the climber checks it
      if (dy > lim.up + 1e-6) errors.push(`${where}: jump up ${dy.toFixed(2)} > ${lim.up}`);
      if (gap > lim.gap + 1e-6) errors.push(`${where}: gap ${gap.toFixed(2)} > ${lim.gap}`);
      if (gap > 0.05 || dy > ASHORE.stepUp) jumps++;
      // a miss should cost seconds: something to land on within a safe drop
      if (lim.drop && gap > 0.05 && A.piece && B.piece) {
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
        const drop = Math.min(A.y, B.y) - supportAt(L, mx, mz, Math.min(A.y, B.y) - 0.5);
        // ...or the fall is long enough below a lantern already passed to send you back to it
        const lantern = Math.max(-Infinity, ...L.checkpoints.filter((c) => c.y <= A.y + 0.01).map((c) => c.y));
        const back = L.fallBack && lantern - (Math.min(A.y, B.y) - drop) > L.fallBack.below;
        if (drop > lim.drop && !back) errors.push(`${where}: a miss drops ${drop.toFixed(1)} m (max ${lim.drop})`);
      }
    }
    return jumps;
  };
  const jumps = check(L.route, GROVE_LIMITS.main, 'main');
  const crownJumps = check(L.crown, GROVE_LIMITS.crown, 'crown');
  // headroom: nothing hangs low over a place you stand
  for (const A of L.pieces) {
    const pts = [[A.cx, A.cz], ...A.foot.map(([x, z]) => [A.cx + (x - A.cx) * 0.85, A.cz + (z - A.cz) * 0.85])];
    for (const B of L.pieces) {
      const under = B.top - B.thick;
      if (B === A || under <= A.top + 0.05 || under >= A.top + HEAD) continue;
      if (under < A.top + 0.45 && B.top <= A.top + 1) continue; // the face of a step up, not a ceiling
      if (pts.some(([x, z]) => inside(B.foot, x, z))) { errors.push(`${A.id} ${A.kind}: only ${(under - A.top).toFixed(2)} m under ${B.id} ${B.kind}`); break; }
    }
  }
  // the dive from the crown: nothing in the way between the branch's tip and the pool
  const tip = pol(L.diving.r1 + 0.8, L.diving.a);
  for (const p of L.pieces) if (p !== L.diving && inside(p.foot, tip[0], tip[1])) errors.push(`the dive is blocked by ${p.id} ${p.kind}`);
  if (Math.hypot(tip[0] - L.pool.x, tip[1] - L.pool.z) > L.pool.r) errors.push('the dive misses the pool');
  if (L.coins.length < 40 || L.coins.length > 70) errors.push(`coins ${L.coins.length} not in 40..70`);
  for (const c of [...L.coins, ...L.caches, ...L.checkpoints]) {
    const s = supportAt(L, c.x, c.z, c.y + 0.05);
    if (Math.abs(s - c.y) > 0.3) errors.push(`${c.id}: floating or buried (${c.y.toFixed(2)} vs ${s.toFixed(2)})`);
  }
  const stats = { pieces: L.pieces.length, colliders: L.colliders.length, coins: L.coins.length, jumps, crownJumps };
  return { ok: errors.length === 0, errors, stats };
}
