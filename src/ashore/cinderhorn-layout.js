// Mount Cinderhorn's layout: where everything in the walkable level stands.
// Plain data and maths (no three.js), so tools/check.mjs can validate it and
// send a test climber along it in Node. cinderhorn.js turns it into meshes.
//
// The mountain is a squat cone with a crater in it and a lake of lava in the
// crater (docs/mount-cinderhorn-level.md). Cinderhorn space: the crater's
// centre at the origin, y up, the sea at y = 0; the beach and the old lava
// flow are to the south (-z), and the notch in the rim (the shoulder) faces
// them. Bearings are atan2(z, x), so south is -π/2 and they grow eastwards
// round the crater, the way the descent goes.
//
// The route: the beach → up the old flow (two basalt steps) → a steam vent
// throws you onto a shelf on the mountain's face → a cinder ledge and two
// columns → a second vent, a second shelf → four steps to the shoulder → down
// the inside of the crater wall, ledge by ledge (shelves, column tops, cinder
// ledges that crumble), past a fall of lava → the wall's foot → out along the
// ridge to the knoll in the lake, where the journal is. The way out is the
// chimney: from the knoll to the wall under the notch, where three vents, one
// above the other, throw you back up to the shoulder. Optional: west along
// the rim's crest on crags (some crumble) to the Horn, and up the column tops
// round it to the chest. The old forge (the vault) is on the beach.
import { ASHORE } from '../config.js';
import { noise2, smoothstep, lerp, TAU } from '../util.js';
import { obox, cyl } from './shapes.js';
import { footGap, nodeFoot, supportAt } from './grove-layout.js';
import { VENT } from './stairs.js';

const SOUTH = -Math.PI / 2;
export const CINDER = {
  lake: 8, lakeR: 17,              // the lava's surface and how far it reaches
  crest: 25, rim: 27, foot: 42,    // the rim's radius and height, and where the mountain's face meets the low ground
  broken: 19.4,                    // the rim west of the notch has fallen away to here; stacks of basalt stand on what is left
  notch: 24, notchHalf: 0.2,       // the shoulder: its floor, and its half-width (radians) either side of south
  saddle: [21.5, 29],              // …which is flat between these radii
  south: SOUTH,
  hornA: SOUTH - 0.37 - 33.6 / 25, // the Horn's bearing: the far end of the walk along the crest
  horn: { r: 3.0, top: 36.15 },
  flow: { head: 6, scarp: 47.9, low: 4.2 },   // the old flow: its top by the wall, where it steps down, the height below the step
};
// Limits for required moves (the top of medium) and for the Horn (optional, hardest).
export const CINDER_LIMITS = {
  main: { up: 1.1, gap: 1.8, down: 2.5 },
  horn: { up: ASHORE.design.jumpUp, gap: 2.6, down: 2.5 },
};
const THICK = { slab: 0.5, cinder: 0.5, lip: 0.6, spine: 3, knoll: 3.2, cap: 0.6, disc: 0.4, tip: 0.8 };

// ------------------------------------------------------------------ ground
const C = CINDER;
const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
/** The crest at bearing a: its height, and the radii its top lies between (a knife edge, but for the shoulder). */
export function rimAt(a) {
  const ca = Math.cos(a), sa = Math.sin(a), off = angDist(a, SOUTH);
  const open = 1 - smoothstep(C.notchHalf, C.notchHalf + 0.07, off);
  // jagged; but from the notch west to the Horn the rim has fallen away, far enough below the
  // stacks that stand on it (and below the shoulder) that landing there is a long fall
  const broken = a < SOUTH && a > C.hornA + 0.13;
  const teeth = 1.1 * noise2(ca * 3 + 2, sa * 3, 5) + 0.6 * noise2(ca * 8, sa * 8, 9);
  const crest = lerp(broken ? C.broken + 0.25 * teeth : C.rim + teeth + 0.8, C.notch, open);
  return { crest, ri: lerp(C.crest, C.saddle[0], open), ro: lerp(C.crest, C.saddle[1], open) };
}
/** Where the sea meets the land at bearing a: further out to the south, where the beach is. */
export const shoreR = (a) => 61 + 2.5 * noise2(Math.cos(a) * 2 + 7, Math.sin(a) * 2, 3) + 10 * (1 - smoothstep(0.45, 1.2, angDist(a, SOUTH)));
/** The low ground round the mountain (the apron, the beach, the sea bed), by radius. */
function lowAt(r, a) {
  const sd = shoreR(a) - r;
  return sd < 0 ? Math.max(-4, sd * 0.45) : Math.min(sd * 0.17, 1.2 + sd * 0.04);
}

/** Terrain height and surface at a point (cinderhorn space). Ledges, columns and the knoll are pieces. */
export function cinderGround(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), R = rimAt(a);
  let h, tag = 'stone';
  if (r < C.lakeR) h = C.lake - 1.6;                                    // under the lava
  else if (r < R.ri) h = lerp(C.lake - 0.4, R.crest, Math.pow((r - C.lakeR) / (R.ri - C.lakeR), 0.8));   // the crater's wall
  else if (r < R.ro) h = R.crest;
  else if (r < C.foot) {
    const t = (r - R.ro) / (C.foot - R.ro);
    h = lerp(R.crest, lowAt(C.foot, a), t) + 0.5 * noise2(x * 0.2, z * 0.2, 13) * Math.sin(Math.PI * t);
  } else {
    h = lowAt(r, a);
    if (h < 1.6) tag = 'sand';
  }
  // the old lava flow: a raised road from the wall's foot down to the beach, stepping down once
  const f = flowAt(x, z);
  if (f > h) { h = f; tag = 'flow'; }
  return { h, tag };
}
/** The old flow's surface at a point (-Infinity off it; it only counts where it stands above the ground). */
export function flowAt(x, z) {
  if (!(z < -39 && z > -66)) return -Infinity;
  const d = -z, F = C.flow, w = lerp(5, 8, smoothstep(44, 62, d)) + 0.6 * noise2(d * 0.3, 1, 21);
  const top = d < F.scarp ? F.head : d < 61 ? lerp(F.low, 1.7, (d - F.scarp) / (61 - F.scarp)) : lerp(1.7, 0.2, (d - 61) / 2.5);
  return Math.abs(x) > w + 1.4 ? -Infinity : top - 6 * smoothstep(w - 0.8, w + 1.4, Math.abs(x));
}
// The ground as drawn. cinderhorn.js builds the terrain mesh from this grid,
// and you walk on the same triangles, so where you stand is what you see.
export const GRID = { E: 99, S: 1.1 };
let grid = null;
/** The terrain sampled on the mesh's grid: { E, S, n, hs, tags } (cached). */
export function cinderGrid() {
  if (grid) return grid;
  const { E, S } = GRID, n = Math.round((2 * E) / S) + 1, hs = new Float32Array(n * n), tags = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = cinderGround(-E + i * S, -E + j * S);
    hs[j * n + i] = g.h; tags[j * n + i] = g.tag;
  }
  grid = { E, S, n, hs, tags };
  return grid;
}
/** The height of the ground as drawn (the mesh's triangles, split corner to corner as cinderhorn.js splits them). */
export function groundH(x, z) {
  const { E, S, n, hs } = cinderGrid();
  const fx = (x + E) / S, fz = (z + E) / S, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return -4;
  const u = fx - i, v = fz - j, a = hs[j * n + i], b = hs[j * n + i + 1], c = hs[(j + 1) * n + i], d = hs[(j + 1) * n + i + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
const groundAt = (x, z) => { const h = groundH(x, z); return h < -0.55 ? -Infinity : h; };
function groundTag(x, z) {
  const { E, S, n, tags } = cinderGrid();
  const i = Math.round((x + E) / S), j = Math.round((z + E) / S);
  const t = i < 0 || j < 0 || i >= n || j >= n ? 'sand' : tags[j * n + i];
  return t === 'flow' ? 'stone' : t;   // (underfoot the old flow is stone)
}
/** How far out the mountain's outer face is at height y, at bearing a. */
function faceOut(a, y) {
  let lo = rimAt(a).ro, hi = C.foot + 3;
  for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; if (cinderGround(...pol(m, a)).h >= y) lo = m; else hi = m; }
  return lo;
}
/** How far out the crater's wall is at height y, at bearing a. */
function faceIn(a, y) {
  let lo = C.lakeR, hi = rimAt(a).ri;
  for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; if (cinderGround(...pol(m, a)).h >= y) hi = m; else lo = m; }
  return hi;
}

// ------------------------------------------------------------------ pieces
/** A flat-topped slab. Local x runs along `rot` (three.js rotation.y), z across. */
function rect(kind, cx, cz, top, hx, hz, rot = 0, extra = {}) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const foot = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]);
  return { kind, cx, cz, top, hx, hz, rot, thick: THICK[kind], foot, ...extra };
}
function disc(kind, cx, cz, top, r, extra = {}) {
  const foot = [];
  for (let i = 0; i < 12; i++) foot.push([cx + Math.cos((i / 12) * TAU) * r, cz + Math.sin((i / 12) * TAU) * r]);
  return { kind, cx, cz, top, r, thick: THICK[kind], foot, ...extra };
}
/** A ledge on the inside of the crater's wall at bearing a, `half` along the wall, from radius r0 out to r1 (local +z is into the rock). */
const inWall = (kind, a, r0, r1, half, top, extra) => rect(kind, ...pol((r0 + r1) / 2, a), top, half, (r1 - r0) / 2, Math.PI / 2 - a, { a, ...extra });
/** …and one on the mountain's outer face, from the rock at r0 out to r1 (local +z is into the rock). */
const outWall = (kind, a, r0, r1, half, top, extra) => rect(kind, ...pol((r0 + r1) / 2, a), top, half, (r1 - r0) / 2, -a - Math.PI / 2, { a, ...extra });
/** A piece is solid from its top down to its `base` (shelves, columns, steps, vents) or `thick` deep. */
function colliderOf(p) {
  const thick = p.base != null ? p.top - p.base + 0.6 : p.thick;
  const c = p.r != null ? cyl(p.cx, p.cz, p.r, p.top - thick, p.top, 'stone') : obox(p.cx, p.top - thick / 2, p.cz, p.hx, thick / 2, p.hz, p.rot, 'stone');
  // crumbling basalt and steam vents are found by what you stand on (hazards.js)
  if (p.crumble) c.crumble = p.id;
  if (p.kind === 'vent') c.vent = p.id;
  return c;
}

// ------------------------------------------------------------------ layout
/** Build the whole level (cinderhorn space). The same every time: nothing is random. */
export function buildCinderhornLayout() {
  const pieces = [], route = [], out = [], horn = [], coins = [], caches = [], vents = [];
  const add = (p) => { p.id = 'p' + pieces.length; if (p.base != null) p.thick = p.top - p.base + 0.6; pieces.push(p); return p; };
  const node = (list, p, x = p.cx, z = p.cz, extra = {}) => { const n = { x, z, y: p.top, piece: p, ...extra }; list.push(n); return n; };
  const walkTo = (list, x, z) => list.push({ x, z, y: groundH(x, z) });
  const coin = (x, y, z, value = 1) => coins.push({ id: 'c' + coins.length, x, y, z, value });
  const coinOn = (p, value = 1, dx = 0, dz = 0) => coin(p.cx + dx, p.top, p.cz + dz, value);
  const lowest = (p) => Math.min(...p.foot.map(([x, z]) => groundH(x, z)));
  /** A steam vent standing on `base`, which throws you up to `to` (m); two coins hang in its steam. */
  const vent = (x, z, base, to) => {
    const V = add(disc('vent', x, z, base + VENT.rise, VENT.r, { base }));
    V.lift = to - V.top + ASHORE.vent.over;
    vents.push({ id: V.id, x, y: V.top, z, r: VENT.mouth, lift: V.lift });
    for (const f of [0.4, 0.75]) coin(x, V.top + (to - V.top) * f, z, 2);
    return V;
  };
  /** On a ledge: a point `along` it (m from its middle, along the wall) and `inw` (m from its middle, towards the rock). */
  const on = (p, along = 0, inw = 0) => [p.cx + along * Math.cos(p.rot) + inw * Math.sin(p.rot), p.cz - along * Math.sin(p.rot) + inw * Math.cos(p.rot)];

  // ---- the beach: the rowboat, grandfather's camp, the old forge
  const aBoat = SOUTH + 0.2;
  const rowboat = { x: pol(shoreR(aBoat) - 0.4, aBoat)[0], z: pol(shoreR(aBoat) - 0.4, aBoat)[1], rot: Math.PI / 2 - aBoat + Math.PI / 2 + 0.3 };
  rowboat.y = Math.max(0, groundH(rowboat.x, rowboat.z));
  const spawn = { x: rowboat.x - 1.2, z: rowboat.z + 4.2, yaw: 0 };
  spawn.y = groundH(spawn.x, spawn.z);
  const exit = { x: rowboat.x, y: rowboat.y, z: rowboat.z, r: 2.8 };
  const camp = { x: -12.5, z: -60.5, rot: 0.9 };   // a strip of sailcloth pegged to a boulder, his crate, the kettle on a vent of its own
  camp.y = groundH(camp.x, camp.z);
  const kettle = { x: camp.x + 2.6, z: camp.z - 1.5 };
  kettle.y = groundH(kettle.x, kettle.z);
  const forge = { x: 27, z: -55, r: 2.6, rot: -0.5 };   // a hearth over a vent, an anvil, a trough; its open side faces the beach
  forge.y = groundH(forge.x, forge.z);
  const vault = { x: forge.x - 1.3, z: forge.z - 0.9 };
  vault.y = groundH(vault.x, vault.z);
  caches.push({ id: 'g0', x: forge.x - 0.2, y: groundH(forge.x - 0.2, forge.z - 2.3), z: forge.z - 2.3, value: 30 });
  walkTo(route, spawn.x, spawn.z);
  walkTo(route, 5.5, -64.5);
  for (const [x, z] of [[9, -66.5], [7, -65.3]]) coin(x, groundH(x, z), z);

  // ---- up the old flow: a walk up black rock, and two basalt steps where it has broken
  walkTo(route, 0.8, -61);
  walkTo(route, 0, -51.6);
  for (const z of [-59, -56.5, -54]) coin(0.3 * Math.sin(z), groundH(0, z), z);
  const steps = [[0, -50.3, 4.5, 0.7], [0, -48.75, 5.25, 0.85]].map(([x, z, top, hz]) => add(rect('step', x, z, top, 1.5, hz, 0, { base: groundH(x, z + hz) - 0.4 })));
  for (const S of steps) node(route, S);
  coinOn(steps[1]);
  walkTo(route, 0, -46.6);
  walkTo(route, 0, -43.4);

  // ---- up the mountain's face: a vent, a shelf, a cinder ledge and two columns, a second vent and shelf, four steps
  const t2a = (theta) => SOUTH + theta;   // bearings east of south
  const v1r = 41.2, shelfY = C.flow.head + VENT.rise + 5.5;
  const V1 = vent(...pol(v1r, SOUTH), C.flow.head, shelfY);
  node(route, V1);
  const aA = t2a(0.075);
  const A = add(outWall('shelf', aA, faceOut(aA, shelfY) - 0.4, v1r - 1.15, 4.6, shelfY));
  A.base = lowest(A) - 0.3; A.thick = A.top - A.base + 0.6;
  node(route, A, ...on(A, -2.9, -0.8), { edge: 'launch' });   // (on the outer face `along` runs east)
  node(route, A, ...on(A, 1.6, 0.4));
  coinOn(A, 1, ...on(A, 0.4, 0.2).map((v, i) => v - [A.cx, A.cz][i]));
  // the first ledge that crumbles sits on the shelf's east end: a miss costs nothing
  const aC = t2a(0.165), yC = shelfY + 0.9;
  const C1 = add(outWall('cinder', aC, faceOut(aC, yC) - 0.3, faceOut(aC, yC) + 2.3, 1.15, yC, { crumble: true }));
  node(route, C1);
  let th = 0.165 + 1.15 / 37, y = yC;
  const cols = [];
  for (const gap of [1.2, 1.1]) {
    y += 0.9;
    const rr = faceOut(t2a(th), y) + 0.95;
    th += (gap + 1.0) / rr;
    const B = add(disc('basalt', ...pol(faceOut(t2a(th), y) + 0.95, t2a(th)), y, 1.0, {}));
    B.base = lowest(B) - 0.5; B.thick = B.top - B.base + 0.6;
    th += 1.0 / rr;
    cols.push(B);
    node(route, B);
    coinOn(B);
  }
  y += 0.85;
  const bHalf = 3.4, rB0 = faceOut(t2a(th + 0.13), y);
  const aB = t2a(th + (1.0 + bHalf) / (rB0 + 1.2));
  const Bs = add(outWall('shelf', aB, faceOut(aB, y) - 0.4, faceOut(aB, y) + 2.8, bHalf, y));
  Bs.base = lowest(Bs) - 0.3; Bs.thick = Bs.top - Bs.base + 0.6;
  node(route, Bs, ...on(Bs, -2.4, 0.2));
  coinOn(Bs, 1, ...on(Bs, 0.6, 0.3).map((v, i) => v - [Bs.cx, Bs.cz][i]));
  const v2 = on(Bs, 1.9, -0.45), topY = y + VENT.rise + 5.5;
  const V2 = vent(v2[0], v2[1], y, topY);
  node(route, V2);
  const v2r = Math.hypot(...v2), aV2 = Math.atan2(v2[1], v2[0]);
  const Cs = add(outWall('shelf', aV2 + 0.01, faceOut(aV2, topY) - 0.4, v2r - 1.15, 2.4, topY));
  Cs.base = lowest(Cs) - 0.3; Cs.thick = Cs.top - Cs.base + 0.6;
  node(route, Cs, ...on(Cs, -0.3, -0.5), { edge: 'launch' });
  node(route, Cs, ...on(Cs, -1.5, 0.3));
  coinOn(Cs, 1, ...on(Cs, -0.8, 0.4).map((v, i) => v - [Cs.cx, Cs.cz][i]));
  // four steps back west and up to the shoulder; the last stands against the notch's own corner
  const stair = [];
  let ths = aV2 - SOUTH - 2.4 / 31, ys = topY;
  for (let i = 0; i < 4; i++) {
    ys += (C.notch + 0.05 - topY) / 4;
    const last = i === 3, theta = last ? 0.236 : ths - (0.45 + 0.95) / 30;
    const aS = t2a(theta), rf = faceOut(aS, ys);
    const S = add(last ? outWall('step', aS, 27.8, 29.6, 0.95, Math.round(ys * 100) / 100) : outWall('step', aS, rf - 0.4, rf + 1.5, 0.95, Math.round(ys * 100) / 100));
    S.base = lowest(S) - 0.3; S.thick = S.top - S.base + 0.6;
    ths = theta - 0.95 / 30;
    stair.push(S);
    node(route, S);
    if (i % 2) coinOn(S);
  }

  // ---- the shoulder: the notch in the rim, the sea behind you and the crater in front
  const sh = (r, theta) => pol(r, t2a(theta));
  walkTo(route, ...sh(28.2, 0.16));
  walkTo(route, ...sh(25.6, 0.06));
  for (const [r, t] of [[27, 0.08], [24.6, -0.04]]) { const [x, z] = sh(r, t); coin(x, C.notch, z); }
  caches.push({ id: 'g1', x: sh(27.6, -0.13)[0], y: C.notch, z: sh(27.6, -0.13)[1], value: 25 });

  // ---- the descent: down the inside of the crater's wall, eastwards round it
  walkTo(route, ...sh(22.6, 0.15));
  const spiral = [];
  let a = SOUTH + C.notchHalf + 0.01;
  y = C.notch;
  /** The next ledge round the wall: `len` along it, `depth` out from the rock, `gap` from the last one, `drop` below it. */
  const ledge = (kind, len, depth, gap, drop, extra = {}) => {
    y = Math.round((y - drop) * 100) / 100;
    const rr = faceIn(a + (gap + len / 2) / 20, y) - depth / 2;
    const ac = a + (gap + len / 2) / rr, rf = faceIn(ac, y);
    const P = add(extra.col ? disc('basalt', ...pol(rf - len / 2 + 0.35, ac), y, len / 2, { base: C.lake - 0.8, a: ac, ...extra })
      : inWall(kind, ac, rf + 0.35 - depth, rf + 0.35, len / 2, y, extra));
    a = ac + (len / 2) / rr;
    spiral.push(P);
    // walk in along it and out again (inside the crater `along` runs back the way you came); a short one is a single stride
    if (P.r == null && len > 3) { node(route, P, ...on(P, len / 2 - 0.8, -0.25)); node(route, P, ...on(P, -(len / 2 - 0.8), -0.25)); } else node(route, P, ...(P.r == null ? on(P, 0, -0.2) : [P.cx, P.cz]));
    return P;
  };
  // wide basalt shelves first
  const D1 = ledge('shelf', 3.6, 2.6, 0.15, 0.8, { base: C.lake - 0.8 });
  for (const [gap, drop] of [[0.7, 0.6], [0.9, 0.7], [1.0, 0.6], [1.1, 0.8]]) { const P = ledge('slab', 3.2, 2.2, gap, drop); if (spiral.length % 2) coinOn(P); }
  // then the tops of columns standing against the wall
  // (their gaps open up a little as you go; measured edge to edge they come out about 0.15 m wider than asked for)
  for (const [gap, drop] of [[0.95, 0.7], [1.05, 0.7], [1.15, 0.7], [1.05, 0.7], [1.25, 0.7], [1.15, 0.7], [1.3, 0.7]]) { const P = ledge('basalt', 2.1, 2.1, gap, drop, { col: true }); if (spiral.length % 2) coinOn(P); }
  // a solid shelf halfway, with a lantern on it; beyond it lava pours down the wall through the gap
  const half = ledge('shelf', 3.8, 2.6, 1.2, 0.5, { base: C.lake - 0.8 });
  const fall = { a: a + 0.9 / 19, y0: C.rim - 1, y1: C.lake };
  // (its line down the wall, [radius, height], for the lava's ribbon)
  fall.path = [];
  for (let k = 0; k <= 10; k++) { const fy = lerp(fall.y0, C.lake - 0.2, k / 10); fall.path.push([faceIn(fall.a, Math.max(fy, C.lake)) - 0.12 - (fy < C.lake + 0.5 ? 0.5 : 0), fy]); }
  // then cinder ledges that crumble, turn about with slabs that hold
  let k = 0;
  for (const [gap, drop] of [[1.6, 0.3], [1.0, 0.9], [1.2, 0.9], [1.1, 1.0], [1.3, 1.0], [1.2, 1.0]]) {
    const crumble = k++ % 2 === 1;
    const P = ledge(crumble ? 'cinder' : 'slab', crumble ? 2.3 : 2.7, crumble ? 1.6 : 1.9, gap, drop, crumble ? { crumble: true } : {});
    if (!crumble) coinOn(P);
  }
  // the wall's foot: a broad shelf just over the lava
  const footY = C.lake + 0.8;
  const foot = ledge('shelf', 4.2, 3.6, 1.2, y - footY, { base: C.lake - 0.8 });
  const aF = foot.a;
  coinOn(foot, 2);

  // ---- the ridge: a spine of old rock across the lake to the knoll, broken where a column stands alone
  const ridgeY = C.lake + 0.6, spineRot = -aF;
  const spineA = add(rect('spine', ...pol(12.75, aF), ridgeY, 1.3, 0.7, spineRot));
  const K1 = add(disc('basalt', ...pol(9.2, aF), ridgeY - 0.1, 0.9, { base: C.lake - 0.8, crumble: true }));
  const spineB = add(rect('spine', ...pol(5.7, aF), ridgeY, 1.3, 0.7, spineRot));
  const knoll = add(disc('knoll', 0, 0, C.lake + 0.7, 4.6));
  node(route, spineA, ...pol(13.4, aF)); node(route, spineA, ...pol(12.0, aF));
  node(route, K1);
  node(route, spineB, ...pol(6.5, aF)); node(route, spineB, ...pol(5.0, aF));
  coinOn(spineA); coinOn(spineB);
  node(route, knoll, ...pol(3.2, aF));
  // the knoll: his bedroll with the journal on it, a ring of stones with no fire in it, the tally slab
  const KY = knoll.top;
  const bedroll = { x: 2.4, z: 1.2, y: KY, rot: 0.5 };
  const journal = { id: 'VI', x: 2.05, y: KY, z: 0.55, r: 1.1 };   // on the foot of the bedroll
  const ring = { x: 2.3, z: -1.7, y: KY };
  const tally = { x: 0.3, z: 3.95, y: KY, rot: 0.08 };   // a standing slab at the knoll's north edge, its marks facing in
  node(route, knoll, journal.x - 0.5, journal.z - 0.2);
  caches.push({ id: 'g2', x: -2.6, y: KY, z: -2.5, value: 60 });
  for (const [x, z] of [[-0.6, -1.3], [3.3, -0.2], [-1.6, 2.4]]) coin(x, KY, z, 2);

  // ---- the chimney (the way out): a second spine to the wall under the notch, and three vents, one above the other
  const spineC = add(rect('spine', 0, -5.8, ridgeY, 1.4, 0.7, Math.PI / 2));
  const spineD = add(rect('spine', 0, -10.5, ridgeY, 2.0, 0.7, Math.PI / 2));
  const F = add(inWall('shelf', SOUTH, 12.4, C.lakeR + 0.6, 2.2, ridgeY, { base: C.lake - 0.8 }));
  out.push({ x: journal.x - 0.5, z: journal.z - 0.2, y: KY, piece: knoll });
  node(out, knoll, 0, -3.6);
  node(out, spineC, 0, -5.0); node(out, spineC, 0, -6.6);
  node(out, spineD, 0, -9.2); node(out, spineD, 0, -11.8);
  coinOn(spineD);
  node(out, F, 0, -13.6);
  const P1y = ridgeY + VENT.rise + 5.0, P2y = P1y + VENT.rise + 5.0;
  const V3 = vent(...pol(15.2, SOUTH), ridgeY, P1y);
  node(out, V3);
  const P1 = add(inWall('slab', SOUTH + 1.2 / 17.5, 16.35, faceIn(SOUTH, P1y) + 0.35, 2.2, P1y));
  node(out, P1, ...pol(17.2, SOUTH), { edge: 'launch' });
  const V4 = vent(...pol(17.3, SOUTH + 2.3 / 17.3), P1y, P2y);
  node(out, V4);
  const P2 = add(inWall('slab', SOUTH + 1.3 / 19.3, 18.3, faceIn(SOUTH, P2y) + 0.35, 2.2, P2y));
  node(out, P2, ...pol(19.3, SOUTH + 2.3 / 19.3), { edge: 'launch' });
  const V5 = vent(...pol(19.25, SOUTH - 0.2 / 19.25), P2y, C.notch);
  node(out, V5);
  const lip = add(inWall('lip', SOUTH - 0.01, 20.35, 22.0, 1.7, C.notch));
  node(out, lip, ...pol(21.2, SOUTH - 0.01), { edge: 'launch' });
  walkTo(out, ...sh(25.2, 0.05));

  // ---- the Horn (optional): west along the rim's crest on crags, some of which crumble, then up the column tops round it
  walkTo(horn, ...sh(25.6, 0.06));
  walkTo(horn, ...sh(28.4, -0.17));
  const W1 = add(outWall('step', t2a(-0.236), 27.8, 29.6, 0.95, C.notch + 1.0));
  const aW2 = t2a(-0.305), W2 = add(outWall('step', aW2, faceOut(aW2, C.notch + 2) - 0.6, faceOut(aW2, C.notch + 2) + 1.3, 0.95, C.notch + 2.0));
  for (const W of [W1, W2]) { W.base = lowest(W) - 0.3; W.thick = W.top - W.base + 0.6; node(horn, W); coinOn(W, 2); }
  // (a stack stands on the broken rim, solid from below it; one that crumbles is a cap of rock on a thin spire)
  const crags = [], spires = [], STACK = C.broken - 1.2;
  const crest = (s) => SOUTH - 0.37 - s / 25;   // s: metres along the crest from the first crag
  let s = 0;
  for (const [gap, top, crumble] of [[0, 27.1], [1.9, 27.6], [2.1, 27.0, true], [2.3, 27.8], [2.2, 28.3, true], [2.5, 28.0], [2.1, 28.7]]) {
    if (crags.length) s += 1.0 + gap + 1.0;
    const K = add(rect(crumble ? 'cap' : 'crag', ...pol(C.crest, crest(s)), top, 1.0, 0.85, Math.PI / 2 - crest(s), crumble ? { crumble: true } : { base: STACK }));
    if (crumble) spires.push({ x: K.cx, z: K.cz, r: 0.5, y0: STACK, y1: top - THICK.cap - 0.1 });
    crags.push(K);
    node(horn, K);
    if (!crumble) coinOn(K, 2);
  }
  s += 1.0 + 1.6 + 1.3;
  const HT = C.horn, hFoot = add(rect('crag', ...pol(C.crest + 0.2, crest(s)), 28.9, 1.3, 1.0, Math.PI / 2 - crest(s), { base: STACK }));
  node(horn, hFoot);
  const hc = pol(C.crest + 0.3, C.hornA);
  // column tops round the Horn, a hop apart and a hop up each, ending on the crater's side (the hook stands on the other)
  const discs = [], phi0 = Math.atan2(hFoot.cz - hc[1], hFoot.cx - hc[0]);
  for (let i = 0; i < 6; i++) {
    const phi = phi0 - 0.62 - i * 0.8, top = 28.9 + 1.05 * (i + 1);
    const Dk = add(disc('disc', hc[0] + Math.cos(phi) * (HT.r + 0.9), hc[1] + Math.sin(phi) * (HT.r + 0.9), Math.round(top * 100) / 100, 0.95, { phi }));
    discs.push(Dk);
    node(horn, Dk);
    coinOn(Dk, 2);
  }
  const tip = add(disc('tip', hc[0], hc[1], HT.top, HT.r, {}));
  const last = discs[discs.length - 1].phi;
  node(horn, tip, hc[0] + Math.cos(last) * 1.9, hc[1] + Math.sin(last) * 1.9);
  node(horn, tip, hc[0], hc[1] + 0.2);
  // the smoked goggles are found here and nowhere else
  const chest = { id: 'chest', x: hc[0] + Math.cos(last + 2.2) * 1.5, y: HT.top, z: hc[1] + Math.sin(last + 2.2) * 1.5, yaw: last + 2.2 + Math.PI / 2, cosmetic: 'hat:goggles' };
  caches.push({ id: 'g3', x: hc[0] + Math.cos(last - 2.0) * 1.7, y: HT.top, z: hc[1] + Math.sin(last - 2.0) * 1.7, value: 40 });
  // the hook: the Horn's point curls up and over from the tip's outer side
  const outDir = Math.atan2(hc[1], hc[0]);
  const hook = { x: hc[0] + Math.cos(outDir) * 2.1, z: hc[1] + Math.sin(outDir) * 2.1, y: HT.top, r: 0.85, a: outDir };

  // ---- colliders
  const colliders = pieces.map(colliderOf);
  // the Horn's column under its tip, and the root of its hook
  colliders.push(cyl(hc[0], hc[1], HT.r, STACK, HT.top - THICK.tip, 'stone'));
  for (const S of spires) colliders.push(cyl(S.x, S.z, S.r, S.y0, S.y1, 'stone'));
  colliders.push(cyl(hook.x, hook.z, hook.r, HT.top, HT.top + 3.2, 'stone'));
  // the tally slab, his crate at the camp, the boulder the sailcloth is pegged to, the forge, the rowboat
  colliders.push(obox(tally.x, KY + 0.9, tally.z, 1.0, 0.9, 0.22, tally.rot, 'stone'));
  colliders.push(obox(camp.x, camp.y + 0.38, camp.z, 0.5, 0.38, 0.35, camp.rot, 'wood'));
  colliders.push(cyl(camp.x - 1.5, camp.z + 1.3, 1.25, camp.y - 1, camp.y + 1.9, 'stone'));
  colliders.push(cyl(kettle.x, kettle.z, 0.4, kettle.y - 0.5, kettle.y + 0.7, 'stone'));
  colliders.push(cyl(forge.x + 0.9, forge.z + 0.8, 0.9, forge.y - 1, forge.y + 1.2, 'stone'));       // the hearth
  colliders.push(obox(forge.x - 1.0, forge.y + 0.4, forge.z + 0.9, 0.42, 0.42, 0.22, forge.rot, 'stone'));   // the anvil
  colliders.push(obox(rowboat.x, rowboat.y + 0.2, rowboat.z, 1.7, 0.25, 0.7, rowboat.rot, 'wood'));

  const hp = (c, along, inw) => { const [x, z] = on(c, along, inw); return { x, z }; };
  const checkpoints = [
    { id: 'flow', x: 1.5, y: C.flow.head, z: -46.4 },
    { id: 'shoulder', ...(([x, z]) => ({ x, z }))(sh(26.2, 0.11)), y: C.notch },
    { id: 'half', ...hp(half, 0.2, 0.75), y: half.top },
    { id: 'knoll', ...(([x, z]) => ({ x, z }))(pol(3.5, aF + 0.4)), y: KY },
    { id: 'hornFoot', ...hp(hFoot, -0.5, 0.5), y: hFoot.top },
    { id: 'horn', x: hc[0] + Math.cos(last + 3.9) * 1.35, y: HT.top, z: hc[1] + Math.sin(last + 3.9) * 1.35 },
  ];
  const down = { x: spawn.x + 1.4, y: groundH(spawn.x + 1.4, spawn.z + 1.6), z: spawn.z + 1.6, yaw: 0 };

  // ---- the story: the note at his camp, Journal VI on his bedroll, and two things to look at
  const cd = [Math.sin(camp.rot), Math.cos(camp.rot)];
  const note = { id: 'note', x: camp.x + cd[0] * 1.3, z: camp.z + cd[1] * 1.3, r: 1.7 };
  note.y = groundH(note.x, note.z);
  const view = sh(28.3, -0.04);
  const looks = [
    { id: 'view', x: view[0], y: C.notch, z: view[1], r: 1.5, prompt: 'Look at the view', text: 'view' },
    { id: 'tally', x: tally.x + 0.1, y: KY, z: tally.z - 1.2, r: 1.2, prompt: 'Look at the marks on the rock', text: 'tally' },
  ];
  const spots = { note, journal, looks };

  // his chalk arrows, on flat rock along the way: { x, y, z, yaw } (yaw: the way it points, as a heading)
  const arrow = (x, z, y, tx, tz) => ({ x, y, z, yaw: Math.atan2(tx - x, tz - z) });
  const onP = (p, along, inw, toAlong, toInw) => arrow(...on(p, along, inw), p.top, ...on(p, toAlong, toInw));
  const arrows = [
    arrow(1.1, -48.75, steps[1].top, 1.1, -40), arrow(-1.6, -45.6, C.flow.head, -0.4, -42),
    onP(A, 0.2, 0.9, 3, 0.9), onP(Bs, -0.4, 0.6, 2, 0.2), onP(Cs, 0.6, 0.7, -2, 0.7),
    arrow(...sh(26.6, -0.02), C.notch, ...sh(23, 0.16)), onP(D1, 0.4, 0.5, -2, 0.5), onP(half, 0.6, 0.2, -2, 0.2),
    arrow(...pol(15.6, aF - 0.07), foot.top, ...pol(12, aF - 0.07)),
  ];

  // ---- what the hazards run on (hazards.js): the vents, what crumbles, and the lake
  const crumbles = pieces.filter((p) => p.crumble).map((p) => ({ id: p.id, x: p.cx, y: p.top, z: p.cz }));
  const pools = [{ x: 0, z: 0, r: C.lakeR + 0.8, y: C.lake }];

  // the camera looks in at the wall all the way down the descent (camera.js, faces)
  const facePath = [sh(21.6, 0.19), ...spiral.map((p) => [p.cx, p.cz])];

  /** Is this a spot where a burnt tree or a boulder may stand (on the low ground, clear of the route and the camps)? */
  const clear = (x, z, pad = 0) => {
    const r = Math.hypot(x, z), g = cinderGround(x, z);
    if (r < C.foot + 1 + pad || g.h < 0.6 + pad * 0.2) return false;
    if (Math.abs(x) < 10.5 + pad && z < -39 && z > -66) return false;   // the flow
    if (Math.hypot(x - camp.x, z - camp.z) < 5 || Math.hypot(x - forge.x, z - forge.z) < forge.r + 3 || Math.hypot(x - rowboat.x, z - rowboat.z) < 5.5) return false;
    return !route.some((n) => Math.hypot(n.x - x, n.z - z) < 2.6 + pad);
  };

  return {
    pieces, colliders, route, out, horn, groundAt, groundTag, waterY: 0,
    bounds: { r: 96 },
    spawn, exit, rowboat, camp, kettle, forge, checkpoints, coins, caches,
    chests: [chest],
    summit: { x: journal.x, y: journal.y, z: journal.z }, vault,
    spots, bedroll, ring, tally, knoll, fall, hook, arrows, hornAt: { x: hc[0], z: hc[1] }, aF,
    steps, stair, spiral, crags, spires, discs, tip, hFoot, lip, shelves: [A, Bs, Cs], chimney: [F, P1, P2],
    vents, crumbles, pools, clear, shoreR,
    hubs: [{ x: hc[0], z: hc[1], orbit: HT.r + 0.9, base: hFoot.top + 0.6, top: HT.top - 0.6 }],
    faces: [{ path: facePath, base: C.lake + 0.5, top: C.notch - 0.4, reach: 3.2 }],
    // a long fall puts you back at your last lantern: that is what keeps the chimney one way.
    // The far ends of the walk offer the quick way back to the beach
    fallBack: { drop: 4.5, below: 3, safe: [], down, from: ['shoulder', 'knoll', 'horn'], label: 'Climb down to the beach' },
  };
}

// -------------------------------------------------------------- validation
/** Check the layout against the design limits. Returns { ok, errors, stats }. */
export function validateCinderhorn(L) {
  const errors = [], D = ASHORE.design;
  const HEAD = ASHORE.height + 0.2;
  const inLake = (x, z) => L.pools.some((q) => Math.hypot(x - q.x, z - q.z) < q.r - 0.5);
  const byId = Object.fromEntries(L.pieces.map((p) => [p.id, p]));
  /** A steam vent throws you to B: no higher and no further than the design allows, with time at the top and nothing overhead. */
  const checkLaunch = (A, B, where) => {
    const V = A.piece;
    if (V?.kind !== 'vent') { errors.push(`${where}: a launch starts at a vent`); return; }
    const dy = B.y - V.top, reach = B.piece ? footGap([[V.cx, V.cz]], B.piece.foot) : Math.hypot(B.x - V.cx, B.z - V.cz);
    if (dy > D.launchUp + 1e-6) errors.push(`${where}: launch up ${dy.toFixed(2)} > ${D.launchUp}`);
    if (reach > D.launchReach + 1e-6) errors.push(`${where}: launch reach ${reach.toFixed(2)} > ${D.launchReach}`);
    if (!(V.lift >= dy + ASHORE.vent.over - 1e-6)) errors.push(`${where}: the vent lifts ${V.lift.toFixed(2)} m, not ${ASHORE.vent.over} m over its ledge`);
    const ring = [];
    for (let k = 0; k < 8; k++) ring.push([V.cx + Math.cos((k / 8) * TAU) * (ASHORE.radius + 0.3), V.cz + Math.sin((k / 8) * TAU) * (ASHORE.radius + 0.3)]);
    const lo = V.top + 0.3, hi = V.top + V.lift + ASHORE.height;
    for (const Q of L.pieces) {
      if (Q === V || Q.top <= lo || Q.top - Q.thick >= hi) continue;
      if (footGap(ring, Q.foot) < 0.01) errors.push(`${where}: ${Q.id} ${Q.kind} is overhead in the vent's column`);
    }
    if (ring.some(([x, z]) => L.groundAt(x, z) > lo)) errors.push(`${where}: the ground stands in the vent's column`);
  };
  const check = (nodes, lim, label) => {
    let jumps = 0, launches = 0;
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i];
      if (!A.piece && !B.piece) continue;   // a walk over open ground isn't a jump (the climber checks it)
      const where = `${label}[${i}] ${A.piece?.kind || 'ground'}→${B.piece?.kind || 'ground'}`;
      if (B.edge === 'launch') { checkLaunch(A, B, where); launches++; continue; }
      const dy = B.y - A.y, gap = A.piece && B.piece ? footGap(nodeFoot(A), nodeFoot(B)) : 0;
      if (dy > lim.up + 1e-6) errors.push(`${where}: jump up ${dy.toFixed(2)} > ${lim.up}`);
      if (-dy > lim.down + 1e-6) errors.push(`${where}: drop ${(-dy).toFixed(2)} > ${lim.down}`);
      if (gap > lim.gap + 1e-6) errors.push(`${where}: gap ${gap.toFixed(2)} > ${lim.gap}`);
      if (gap > 0.05 || dy > ASHORE.stepUp) jumps++;
      if (A.piece?.crumble && B.piece?.crumble && A.piece !== B.piece) errors.push(`${where}: two crumbling pieces in a row`);
      // a miss should cost seconds: lava to fall in, something to land on within a safe drop, or a long fall back to a lantern
      if (gap > 0.05) {
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, low = Math.min(A.y, B.y);
        const sup = supportAt(L, mx, mz, low - 0.5);
        if (!inLake(mx, mz) && Number.isFinite(sup) && low - sup > D.safeDrop) {
          const lantern = Math.max(-Infinity, ...L.checkpoints.filter((c) => c.y <= A.y + 0.01).map((c) => c.y));
          if (!(lantern - sup > L.fallBack.below)) errors.push(`${where}: a miss drops ${(low - sup).toFixed(1)} m onto stone (max ${D.safeDrop})`);
        }
      }
    }
    return { jumps, launches };
  };
  const main = check(L.route, CINDER_LIMITS.main, 'main');
  const out = check(L.out, CINDER_LIMITS.main, 'out');
  const horn = check(L.horn, CINDER_LIMITS.horn, 'horn');
  // headroom: nothing hangs low over a place you stand
  for (const P of L.pieces) {
    for (const Q of L.pieces) {
      const under = Q.top - Q.thick;
      if (Q === P || under <= P.top + 0.05 || under >= P.top + HEAD) continue;
      if (under < P.top + 0.45 && Q.top <= P.top + 1) continue;
      if (footGap(P.foot, Q.foot) < 0.01) { errors.push(`${P.id} ${P.kind}: only ${(under - P.top).toFixed(2)} m under ${Q.id} ${Q.kind}`); break; }
    }
  }
  if (L.coins.length < 40 || L.coins.length > 80) errors.push(`coins ${L.coins.length} not in 40..80`);
  // (coins in a vent's steam hang in the air)
  const steam = (c) => L.vents.some((v) => Math.hypot(v.x - c.x, v.z - c.z) < 0.1);
  for (const c of [...L.coins.filter((q) => !steam(q)), ...L.caches, ...L.checkpoints, L.vault, L.spots.note, L.spots.journal, ...L.spots.looks, ...L.chests]) {
    const sup = supportAt(L, c.x, c.z, c.y + 0.05);
    if (Math.abs(sup - c.y) > 0.3) errors.push(`${c.id || 'vault'}: floating or buried (${c.y.toFixed(2)} vs ${sup.toFixed(2)})`);
  }
  // crumbling basalt is never a lantern's footing, and every piece that crumbles has its collider
  for (const c of L.crumbles) {
    const p = byId[c.id];
    if (L.checkpoints.some((k) => Math.abs(k.y - p.top) < 0.3 && footGap([[k.x, k.z]], p.foot) < 0.01)) errors.push(`${p.id} ${p.kind}: crumbles under a lantern`);
    if (!L.colliders.some((q) => q.crumble === c.id)) errors.push(`${p.id} ${p.kind}: crumbles, but no collider carries it`);
  }
  for (const v of L.vents) if (!L.colliders.some((q) => q.vent === v.id)) errors.push(`vent ${v.id}: no collider carries it`);
  // the lake takes whatever falls from the descent: under every ledge the wall is too steep to stand on, all the way down
  for (const p of L.spiral) {
    const a = Math.atan2(p.cz, p.cx), r1 = Math.hypot(p.cx, p.cz) - (p.r ?? p.hz), at = (r) => L.groundAt(r * Math.cos(a), r * Math.sin(a));
    for (let r = CINDER.lakeR + 0.6; r + 1.2 < r1; r += 0.6) {
      if ((at(r + 1.2) - at(r)) / 1.2 < Math.tan(ASHORE.slopeMax + 0.1)) { errors.push(`${p.id} ${p.kind}: the wall under it can be stood on at ${r.toFixed(1)} m out`); break; }
    }
  }
  // the story: the journal waits where the walk ends, and the way to it passes the knoll's lantern
  const J = L.spots.journal, K = L.checkpoints.find((c) => c.id === 'knoll');
  if (Math.abs(J.y - L.summit.y) > 0.01) errors.push('story: the journal is not where the walk ends');
  if (!K || !L.route.some((n) => Math.hypot(n.x - K.x, n.z - K.z) < 2.2 && Math.abs(n.y - K.y) < 1)) errors.push("story: the way to the journal doesn't pass the knoll's lantern");
  for (const sp of L.spots.looks) if (Math.hypot(sp.x - J.x, sp.z - J.z) < sp.r + J.r && Math.abs(sp.y - J.y) < 1.2) errors.push(`story: the ${sp.id} spot overlaps the journal's`);
  if (!L.chests[0]?.cosmetic) errors.push("the Horn's chest has no cosmetic of its own");
  // the chimney is one way: from each shelf, the one below is a long fall
  const tiers = [L.chimney[0].top, L.chimney[1].top, L.chimney[2].top, L.lip.top];
  for (let i = 1; i < tiers.length; i++) if (tiers[i] - tiers[i - 1] <= L.fallBack.drop) errors.push(`the chimney's shelf ${i} is only ${(tiers[i] - tiers[i - 1]).toFixed(2)} m above the one below: climbable down`);
  for (const id of L.fallBack.from) if (!L.checkpoints.some((c) => c.id === id)) errors.push(`fallBack: no lantern "${id}"`);
  // every lantern is lit by walking the way it stands on (ashore.js lights one within 2 m)
  for (const c of L.checkpoints) {
    const way = c.id.startsWith('horn') ? L.horn : L.route;
    if (!way.some((n) => Math.hypot(n.x - c.x, n.z - c.z) < 1.7 && Math.abs(n.y - c.y) < 1.5)) errors.push(`lantern ${c.id}: the way doesn't pass within reach of it`);
  }
  // the stairs: every step a jump you can make, none a walk past
  const stats = { pieces: L.pieces.length, colliders: L.colliders.length, coins: L.coins.length, jumps: main.jumps, launches: main.launches, outLaunches: out.launches, hornJumps: horn.jumps, crumbles: L.crumbles.length };
  return { ok: errors.length === 0, errors, stats };
}
