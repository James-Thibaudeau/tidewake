// Archway Isle's layout: where everything in the walkable level stands.
// Plain data and maths (no three.js), so tools/check.mjs can validate it and
// send a test climber along it in Node. archway.js turns it into meshes.
//
// The island is a U round a bay (docs/archway-isle-level.md), and the great
// arch spans the bay's mouth. Archway space: the bay's centre at the origin,
// y up, the sea at y = 0, the mouth out to -z and the cove at the head of the
// bay on +z.
//
// The route: the shingle cove → the basin behind it → up the terraced gully
// to the cliff top → round the back of the bay → down onto the bay's west
// wall and the traverse along it (sheer ledges, sea stacks across one inlet,
// a little rock arch over another), out along the mouth to the west arm's
// tip (the shoulder) → over the great arch to the keystone and the east arm.
// Optional: hops up the seaward stack off the east arm, to the chest.
// The storm cave (the vault) is in the basin's east wall.
import { ASHORE } from '../config.js';
import { noise2, smoothstep, lerp, TAU } from '../util.js';
import { obox, cyl } from './shapes.js';
import { footGap, nodeFoot, supportAt } from './grove-layout.js';

export const ARCHWAY = {
  bay: 32,          // the bay's radius
  mouth: 10,        // half the width of the channel out to sea
  archZ: -64,       // the arch spans the mouth here, legs at x = ±archX
  archX: 18, archRise: 4.5,
  stack: { x: 23, z: -81, r: 4.5, top: 24 },
};
// Limits for required moves (gentler than ASHORE.design) and for the stack climb.
export const ARCHWAY_LIMITS = {
  main: { up: 1.05, gap: 1.7, drop: ASHORE.design.safeDrop },
  stack: { up: ASHORE.design.jumpUp, gap: 2.6 },
};
const THICK = { ledge: 0.7, stack: 30, step: 1.4, span: 1.2, shelf: 0.6, top: 30, block: 1, tier: 1.3 };

// ------------------------------------------------------------------ ground
const A = ARCHWAY;
// two notches in the bay's west wall, crossed on the traverse
const INLETS = [{ a: 3.42, r: 37.5, w: 6.2 }, { a: 4.0, r: 36.5, w: 5.4 }].map((n) => ({ ...n, x: Math.cos(n.a) * n.r, z: Math.sin(n.a) * n.r }));
const CAVE = { x: 13.8, z: 41, r: 3.2 };
const BASIN = { half: 10.5, beach: 37, back: 46 };
// the gully's terraces, stone steps: [z where the step starts, its height]. A
// hop and a step by turns, from the basin to just under the cliff top
const GULLY = { half: 2.6, tiers: [] };
{
  let z = BASIN.back, h = basinH(BASIN.back) + 0.75;
  for (let i = 0; ; i++) {
    GULLY.tiers.push([z, h]);
    z += 1.6;
    if (plateau(0, z + 0.9) - h <= 0.95) break;   // a hop from the last step to the cliff top
    h += i % 2 ? 0.3 : 0.9;
  }
  GULLY.top = z;
}

/** Distance to the bay's water (negative in it): the bay, its mouth and the inlets. */
function baySd(x, z) {
  let sd = Math.hypot(x, z) - A.bay;
  if (z < 0) sd = Math.min(sd, Math.abs(x) - A.mouth);
  for (const n of INLETS) sd = Math.min(sd, Math.hypot(x - n.x, z - n.z) - n.w);
  return sd;
}
/** Distance in from the outer coast, a lumpy oval round the U. */
const outerSd = (x, z) => (1 - Math.hypot(x / 72, (z - 4) / 76) - 0.035 * noise2(x * 0.05, z * 0.05, 3)) * 74;
/** Distance to any water (negative in it). */
const waterSd = (x, z) => Math.min(baySd(x, z), outerSd(x, z));
// the cliff tops: rolling, rising towards the back of the island; flat where the route is pinned (the gully, the arms' tips)
function plateau(x, z) {
  const base = lerp(12.5, 16, smoothstep(-60, 40, z)) + 0.35 * noise2(x * 0.08, z * 0.08, 8);
  const pinned = Math.max(1 - smoothstep(8, 18, Math.abs(x)) * 1, 0) * smoothstep(30, 45, z) + (1 - smoothstep(-52, -40, z));
  const hills = 6 * Math.max(0, noise2(x * 0.03 + 4, z * 0.03, 12)) + 3 * smoothstep(40, 70, Math.hypot(x, z - 10));
  return base + hills * (1 - Math.min(1, pinned));
}
function basinH(z) {
  if (z < BASIN.beach) return Math.max(0, (z - 32.2) * 0.3);
  return 1.45 + (z - BASIN.beach) * 0.3;
}

/** Terrain height and surface at a point (archway space). */
export function archwayGround(x, z) {
  // sheer walls round the bay; the outer coast varies from cliff to steep scree
  const pin = (1 - smoothstep(16, 28, Math.abs(x))) * smoothstep(50, 62, z);   // the cliff top behind the gully stays wide
  const steep = lerp(Math.max(1.1, 2.6 + 2.2 * noise2(x * 0.04, z * 0.04, 17)), 5, pin);
  let h = Math.min(plateau(x, z), baySd(x, z) * 5 - 1, outerSd(x, z) * steep - 1);
  let tag = 'stone';
  // the cove and the basin behind it, walled in, with the gully up the back
  const ax = Math.abs(x);
  if (z > 28 && ax < BASIN.half + 4 && z < GULLY.top) {
    let floor;
    if (z < BASIN.back) floor = basinH(z) + Math.max(0, ax - BASIN.half) * 5;
    else if (ax < GULLY.half + 1.4) {
      // the floor under the steps sits a step below them, so the ground's
      // mesh, drawn in straight lines, never rises through a step
      let t = GULLY.tiers[0][1];
      for (const [tz, th] of GULLY.tiers) if (z >= tz) t = th;
      floor = t - 1 + Math.max(0, ax - GULLY.half) * 6;
    } else floor = basinH(BASIN.back) + (z - BASIN.back) * 5 + Math.max(0, ax - BASIN.half) * 5;
    if (floor < h) { h = floor; tag = z < BASIN.beach + 1 ? 'sand' : 'grass'; }
  }
  // the storm cave: a nook in the basin's east wall
  const dc = Math.hypot(x - CAVE.x, z - CAVE.z);
  if (dc < CAVE.r + 1.5) h = Math.min(h, lerp(basinH(CAVE.z), h, smoothstep(CAVE.r - 0.4, CAVE.r + 1.5, dc)));
  if (h > 1 && tag === 'stone' && h >= plateau(x, z) - 0.6) tag = 'grass';
  return { h: Math.max(h, -6), tag };
}
// The ground as drawn. archway.js builds the terrain mesh from this grid, and
// you walk on the same triangles, so where you stand is what you see.
export const GRID = { E: 102, S: 1.1 };
let grid = null;
/** The terrain sampled on the mesh's grid: { E, S, n, hs, tags } (cached). */
export function archwayGrid() {
  if (grid) return grid;
  const { E, S } = GRID, n = Math.round((2 * E) / S) + 1, hs = new Float32Array(n * n), tags = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = archwayGround(-E + i * S, -E + j * S);
    hs[j * n + i] = g.h; tags[j * n + i] = g.tag;
  }
  grid = { E, S, n, hs, tags };
  return grid;
}
/** The height of the ground as drawn (the mesh's triangles, split corner to corner as archway.js splits them). */
export function groundH(x, z) {
  const { E, S, n, hs } = archwayGrid();
  const fx = (x + E) / S, fz = (z + E) / S, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return -6;
  const u = fx - i, v = fz - j, a = hs[j * n + i], b = hs[j * n + i + 1], c = hs[(j + 1) * n + i], d = hs[(j + 1) * n + i + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
const groundAt = (x, z) => { const h = groundH(x, z); return h < -0.55 ? -Infinity : h; };

// ------------------------------------------------------------------ pieces
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
const pol = (r, a, cx = 0, cz = 0) => [cx + r * Math.cos(a), cz + r * Math.sin(a)];
/** A ledge on a curved wall round (cx, cz) at angle a, from radius r0 to r1, `half` along the wall. */
const onWall = (kind, a, r0, r1, half, top, c = [0, 0], extra) => rect(kind, ...pol((r0 + r1) / 2, a, c[0], c[1]), top, half, (r1 - r0) / 2, -a - Math.PI / 2, { a, ...extra });

function colliderOf(p) {
  if (p.r != null) return cyl(p.cx, p.cz, p.r, p.top - p.thick, p.top, 'stone');
  return obox(p.cx, p.top - p.thick / 2, p.cz, p.hx, p.thick / 2, p.hz, p.rot, 'stone');
}

// ------------------------------------------------------------------ layout
/** Build the whole level (archway space). The same every time: nothing is random. */
export function buildArchwayLayout() {
  const pieces = [], route = [], stack = [], coins = [], caches = [];
  const add = (p) => { p.id = 'p' + pieces.length; pieces.push(p); return p; };
  const node = (list, p, x = p.cx, z = p.cz) => list.push({ x, z, y: p.top, piece: p });
  const walkTo = (list, x, z) => list.push({ x, z, y: groundH(x, z) });
  const coin = (x, y, z, value = 1) => coins.push({ id: 'c' + coins.length, x, y, z, value });
  const coinOn = (p, value) => coin(p.cx, p.top, p.cz, value);
  const coinGround = (x, z) => coin(x, groundH(x, z), z);
  const coinAt = ([x, z], y, value) => coin(x, y, z, value);

  // ---- the cove, the basin, the gully
  let shore = 30;
  while (shore < 40 && groundH(0, shore) < 0.2) shore += 0.1;
  const rowboat = { x: -1.5, y: Math.max(0, groundH(-1.5, shore - 0.4)), z: shore - 0.4, rot: Math.PI / 2 + 0.2 };
  const spawn = { x: 1.8, y: groundH(1.8, shore + 3), z: shore + 3, yaw: 0 };
  const exit = { x: rowboat.x, y: rowboat.y, z: rowboat.z, r: 2.8 };
  const camp = { x: -6.5, z: 39.5, rot: 0.5 }; // the fire ring and grandfather's weather board
  camp.y = groundH(camp.x, camp.z);
  walkTo(route, spawn.x, spawn.z);
  walkTo(route, 0, 40);
  walkTo(route, 0, BASIN.back - 0.6);
  for (const z of [38.5, 42, 45]) coinGround(1.2, z);
  const vault = { x: CAVE.x + 0.8, z: CAVE.z, y: 0 };
  vault.y = groundH(vault.x, vault.z);
  caches.push({ id: 'g0', x: CAVE.x + 0.4, y: groundH(CAVE.x + 0.4, CAVE.z + 1.4), z: CAVE.z + 1.4, value: 30 });
  for (const [i, [tz, th]] of GULLY.tiers.entries()) {
    const T = add(rect('tier', 0, tz + 0.8, th, GULLY.half + 0.6, 0.82, 0));
    node(route, T);
    if (i % 2) coin(i % 4 === 1 ? -0.9 : 0.9, th, tz + 0.8);
  }
  const top = { x: 0, z: GULLY.top + 2.5 };
  walkTo(route, top.x, top.z);

  // ---- the cliff top, round the back of the bay to the west wall
  for (const [x, z] of [[-10, 70], [-22, 62], [-32, 50], [-38, 36], [-37.5, 24]]) { walkTo(route, x, z); coinGround(x, z); }
  // down off the cliff top onto the wall's first ledges, then along it. Ledges
  // stand out over the water, so a miss is a splash (back to the last lantern)
  let y = route[route.length - 1].y;
  const R0 = A.bay - 1.6, Rn = A.bay - 0.3;   // ledges reach out to R0; you stand at Rn
  const ledge = (ang, top, half = 0.8) => {
    const L = add(onWall('ledge', ang, R0, A.bay + 2.8, half, top));
    node(route, L, ...pol(Rn, ang));
    return L;
  };
  for (const [ang, step] of [[2.6, 1.3], [2.695, 1.5], [2.79, 1.5]]) { y -= step; ledge(ang, y, 1.2); }
  const run = (angles, ups) => angles.forEach((ang, i) => {
    y += ups[i % ups.length];
    ledge(ang, y);
    if (i % 2 === 0) coinAt(pol(Rn, ang), y);
  });
  // round to the first inlet; across its mouth on sea stacks
  const I1 = INLETS[0], I2 = INLETS[1];
  run([2.9, 2.975, 3.05, 3.13, I1.a - 0.21], [0, 0.5, -0.3, 0.6, 0]);
  for (const [k, off] of [-0.135, -0.045, 0.045, 0.135].entries()) {
    const [x, z] = pol(A.bay - 0.2, I1.a + off);
    y += [0.3, -0.2, 0.4, 0][k];
    const S = add(disc('stack', x, z, y, 1.05));
    node(route, S);
    coinOn(S);
  }
  run([I1.a + 0.21], [0]);
  const lantern1 = { id: 'inlet', ...xz(pol(A.bay + 0.1, I1.a + 0.21)), y };
  run([I1.a + 0.29, 3.785], [0.4, -0.3]);
  // over the second inlet's mouth on a little rock arch
  const [sx, sz] = pol(A.bay - 0.4, I2.a);
  const span = add(rect('span', sx, sz, y, 5.3, 0.85, -I2.a - Math.PI / 2, { a: I2.a }));
  node(route, span, ...pol(A.bay - 0.4, I2.a - 0.1));
  node(route, span, ...pol(A.bay - 0.4, I2.a + 0.1));
  coinOn(span, 2);
  run([I2.a + 0.2, 4.28, 4.36], [0, 0.5, -0.2]);
  // out along the mouth: ledges on the channel's west wall, rising to the arm's tip
  const wallX = -A.mouth;
  const lantern2 = { id: 'mouth', ...xz(pol(A.bay - 0.2, 4.28)), y: route[route.length - 2].y };
  const shoulderY = groundH(-A.archX, A.archZ);
  let z = -34;
  const ups = [0.5, 0.2, -0.3, 0.7, 0.3, 0.6, -0.2, 0.5];
  const climb = (shoulderY - 0.5 - y - ups.reduce((t, u) => t + u, 0)) / ups.length;
  for (const [i, u] of ups.entries()) {
    y += u + climb;
    const L = add(rect('ledge', wallX + 0.4, z, y, 0.9, 1.15, Math.PI / 2));
    node(route, L, wallX + 1.0, z);
    if (i % 2) coin(wallX + 1.0, y, z);
    z -= 3.1 + (i % 3 === 1 ? 0.3 : 0);
  }
  // a broad shelf from the last ledge up onto the arm's tip
  const rimY = groundH(-A.mouth - 5, z);
  const landing = add(rect('ledge', -A.mouth - 1.6, z + 0.4, rimY, 1.3, 3.4, Math.PI / 2));
  node(route, landing, -A.mouth + 0.6, z + 0.4);
  node(route, landing, -A.mouth - 3.6, z + 0.4);
  // up onto the west arm's tip: the shoulder
  const shoulder = { x: -A.archX + 1, z: A.archZ + 4 };
  walkTo(route, shoulder.x, shoulder.z);
  caches.push({ id: 'g1', x: -A.archX - 2.5, y: groundH(-A.archX - 2.5, A.archZ + 5), z: A.archZ + 5, value: 20 });

  // ---- over the arch: steps up its back to the keystone and down to the east arm
  const steps = [], gy = (x) => groundH(x, A.archZ);
  const yEnd = Math.max(gy(-A.archX + 2), gy(A.archX - 2));
  const archY = (x) => yEnd + A.archRise * (1 - (x / (A.archX - 2)) ** 2);
  const xs = [-(A.archX - 2)];
  // each step rises at most 0.28: walk up it, no jumping
  while (xs[xs.length - 1] < A.archX - 2) {
    const x0 = xs[xs.length - 1];
    let x1 = x0 + 0.4;
    while (x1 < A.archX - 2 && Math.abs(archY(x1) - archY(x0)) < 0.28 && x1 - x0 < 2.2) x1 += 0.1;
    xs.push(Math.min(x1, A.archX - 2));
  }
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1], mid = (x0 + x1) / 2;
    const half = lerp(1.5, 1.05, 1 - Math.abs(mid) / (A.archX - 2));
    const s = add(rect('step', mid, A.archZ, Math.round(archY(mid) * 100) / 100, (x1 - x0) / 2 + 0.03, half, 0));
    steps.push(s);
    node(route, s);
    if (i % 3 === 1) coinOn(s);
  }
  const key = steps[Math.floor(steps.length / 2)];
  walkTo(route, A.archX - 1, A.archZ + 1);
  // low rubble along both edges of the arch's back, so you only leave it by jumping
  const lips = [];
  for (const s of steps) for (const side of [-1, 1]) lips.push(obox(s.cx, s.top + 0.25, s.cz + side * (s.hz - 0.15), s.hx, 0.25, 0.15, 0, 'stone'));

  // ---- the seaward stack (optional): from the east arm's tip, round it to the top
  const S = A.stack;
  walkTo(stack, A.archX - 1, A.archZ + 1);
  walkTo(stack, A.archX - 0.5, A.archZ - 0.6);
  let sy = groundH(A.archX - 0.5, A.archZ - 0.6);
  const stepping = [[A.archX + 1, A.archZ - 3.2, -0.2], [A.archX + 2.6, A.archZ - 6.2, 0.8], [A.archX + 3.6, A.archZ - 9.4, 0.8]].map(([x, zz, up]) => {
    sy += up;
    const p = add(disc('stack', x, zz, sy, 1.1));
    node(stack, p);
    return p;
  });
  coinOn(stepping[1], 2);
  let sa = Math.atan2(stepping[2].cz - S.z, stepping[2].cx - S.x) - 0.45;
  const shelves = [];
  while (sy < S.top - 1.2) {
    sy = Math.min(S.top - 0.4, sy + 0.95);
    const p = add(onWall('shelf', sa, S.r - 0.4, S.r + 1.7, 0.95, sy, [S.x, S.z], { a: sa }));
    shelves.push(p);
    node(stack, p, ...pol(S.r + 0.9, sa, S.x, S.z));
    if (shelves.length % 2) coinAt(pol(S.r + 0.9, sa, S.x, S.z), sy, 2);
    sa -= 0.62;
  }
  const crown = add(disc('top', S.x, S.z, S.top, S.r + 0.3));
  // you step up onto the top by its lantern, and walk across to the chest
  const arrive = sa + 0.4, topLantern = { id: 'stack', ...xz(pol(S.r - 1.4, arrive - 0.45, S.x, S.z)), y: S.top };
  const chest = { id: 'chest', ...xz(pol(1.4, arrive + Math.PI, S.x, S.z)), y: S.top, yaw: arrive };
  stack.push({ ...xz(pol(S.r - 1.2, arrive, S.x, S.z)), y: S.top, piece: crown });
  stack.push({ x: S.x, z: S.z, y: S.top, piece: crown });
  caches.push({ id: 'g2', x: S.x - 1.4, y: S.top, z: S.z + 1, value: 40 });
  for (let i = 0; i < 3; i++) coinAt(pol(2.6, i * 2.1, S.x, S.z), S.top, 2);

  // ---- colliders
  const colliders = pieces.map(colliderOf);
  colliders.push(...lips);
  colliders.push(cyl(S.x, S.z, S.r, -6, S.top - 0.2, 'stone'));
  colliders.push(cyl(camp.x, camp.z, 0.6, camp.y - 0.2, camp.y + 1.6, 'wood'));
  // the cave's lintel, out of reach overhead: solid, so the camera keeps out of it
  const caveY = groundH(CAVE.x, CAVE.z);
  colliders.push(obox(CAVE.x - 0.5, caveY + 4.6, CAVE.z, 1.1, 1.2, CAVE.r, 0, 'stone'));
  colliders.push(obox(rowboat.x, rowboat.y + 0.2, rowboat.z, 1.7, 0.25, 0.7, rowboat.rot, 'wood'));
  // the arch's legs, from the sea floor up to its back
  for (const s of [-1, 1]) colliders.push(cyl(s * A.archX, A.archZ, 3.2, -6, yEnd - 1.2, 'stone'));

  const checkpoints = [
    { id: 'gully', x: 1.6, y: groundH(1.6, top.z), z: top.z },
    { id: 'clifftop', x: -36, y: groundH(-36, 28), z: 28 },
    lantern1, lantern2,
    // beside the way onto the arch, so you pass within reach of it
    { id: 'shoulder', x: shoulder.x - 1.3, y: groundH(shoulder.x - 1.3, shoulder.z + 0.6), z: shoulder.z + 0.6 },
    { id: 'keystone', x: key.cx + 0.5, y: key.top, z: A.archZ - 0.6 },
    topLantern,
  ];
  const down = { x: spawn.x + 1, y: spawn.y, z: spawn.z + 1, yaw: Math.PI };

  // where gulls sit (archway-life.js): beside the way, so they lift off as you
  // come by, on the inlet's stacks, the arch's back, the stack's top and the cove
  const gulls = [];
  const traverse = route.filter((nd) => nd.piece?.kind === 'ledge');
  for (const [k, nd] of traverse.entries()) {
    if (k % 4 !== 2) continue;
    const p = nd.piece, side = k % 8 === 2 ? 1 : -1;
    // along the ledge from where you stand, out near the lip
    const ax = Math.cos(p.rot) * p.hx * 0.75 * side, az = -Math.sin(p.rot) * p.hx * 0.75 * side;
    gulls.push({ x: nd.x + ax, y: p.top, z: nd.z + az });
  }
  for (const p of pieces.filter((q) => q.kind === 'stack' && q.cz > -20 && q.cz < 0).slice(1, 4)) gulls.push({ x: p.cx + 0.4, y: p.top, z: p.cz });
  for (const k of [0.25, 0.62]) { const p = steps[Math.floor(steps.length * k)]; gulls.push({ x: p.cx, y: p.top, z: p.cz + p.hz - 0.45 }); }
  gulls.push({ x: S.x - 2.2, y: S.top, z: S.z - 1.4 });
  for (const [x, z] of [[-8, 34.4], [9, 35.2]]) gulls.push({ x, y: groundH(x, z), z });

  // the traverse's cliff face for the camera: the bay's west wall, then the mouth's
  // (the water on its left; it runs just inside where you stand, so the cliff top stays out of reach)
  const facePath = [], aEnd = Math.PI + Math.acos((A.mouth - 0.5) / (A.bay + 0.5));
  for (let k = 0; k <= 14; k++) facePath.push(pol(A.bay + 0.5, lerp(2.55, aEnd, k / 14)));
  for (let zz = Math.sin(aEnd) * (A.bay + 0.5) - 3; zz > A.archZ + 6; zz -= 4) facePath.push([wallX + 0.5, zz]);

  /** Is this a spot where a tree, a boulder or a bush may stand (clear of the route)? */
  const clear = (x, z, pad = 0) => {
    const g = archwayGround(x, z);
    if (g.tag !== 'grass' || g.h < plateau(x, z) - 1) return false;
    if (waterSd(x, z) < 4 + pad) return false;
    if (Math.abs(x) < GULLY.half + 3 + pad && z > BASIN.back - 2) return false;
    if (Math.hypot(x - S.x, z - S.z) < S.r + 4) return false;
    return !route.some((n) => Math.hypot(n.x - x, n.z - z) < 2.4 + pad);
  };

  return {
    pieces, colliders, route, stack, groundAt, groundTag: (x, z) => archwayGround(x, z).tag, waterY: 0,
    bounds: { r: 105 }, calm: { x: 0, z: -10, r: 60 },
    spawn, exit, rowboat, camp, checkpoints, coins, caches,
    chests: [chest],
    summit: { x: key.cx, y: key.top, z: A.archZ }, vault, keystone: { x: key.cx, y: key.top, z: A.archZ },
    spots: {},
    hubs: [{ x: S.x, z: S.z, orbit: S.r + 0.9, base: groundH(A.archX + 4, A.archZ - 3) + 0.6, top: S.top - 0.6 }],
    // the traverse's wall; and the storm cave, which the camera looks straight into
    faces: [{ path: facePath, base: 7, top: 15.5, reach: 2.6 },
      { path: [[CAVE.x + 2.4, CAVE.z - 3], [CAVE.x + 2.4, CAVE.z + 3]], base: caveY - 1, top: caveY + 2.5, reach: 4.2 }],
    // the far end of the walk: the lanterns there offer the quick way back to the cove
    fallBack: { drop: ASHORE.design.safeDrop, below: 3, safe: [], down, from: ['keystone', 'stack'], label: 'Climb down to the cove' },
    gulls, steps, stepping, shelves, crown, span, inlets: INLETS, cave: CAVE, basin: BASIN, gully: GULLY, yEnd, clear,
  };
}
function xz([x, z]) { return { x, z }; }

// -------------------------------------------------------------- validation
/** Check the layout against the design limits. Returns { ok, errors, stats }. */
export function validateArchway(L) {
  const errors = [];
  const HEAD = ASHORE.height + 0.2;
  const check = (nodes, lim, label) => {
    let jumps = 0;
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i];
      // a walk over open ground isn't a jump (the climber checks it)
      if (!A.piece && !B.piece) continue;
      const dy = B.y - A.y, gap = A.piece && B.piece ? footGap(nodeFoot(A), nodeFoot(B)) : 0;
      const where = `${label}[${i}] ${A.piece?.kind || 'ground'}→${B.piece?.kind || 'ground'}`;
      if (dy > lim.up + 1e-6) errors.push(`${where}: jump up ${dy.toFixed(2)} > ${lim.up}`);
      if (gap > lim.gap + 1e-6) errors.push(`${where}: gap ${gap.toFixed(2)} > ${lim.gap}`);
      if (gap > 0.05 || dy > ASHORE.stepUp) jumps++;
      // a miss should cost seconds: water to fall in, or something to land on within a safe drop
      if (lim.drop && gap > 0.05) {
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, low = Math.min(A.y, B.y);
        const s = supportAt(L, mx, mz, low - 0.5);
        if (Number.isFinite(s) && low - s > lim.drop) {
          const lantern = Math.max(-Infinity, ...L.checkpoints.filter((c) => c.y <= A.y + 0.01).map((c) => c.y));
          if (!(L.fallBack && lantern - s > L.fallBack.below)) errors.push(`${where}: a miss drops ${(low - s).toFixed(1)} m onto rock (max ${lim.drop})`);
        }
      }
    }
    return jumps;
  };
  const jumps = check(L.route, ARCHWAY_LIMITS.main, 'main');
  const stackJumps = check(L.stack, ARCHWAY_LIMITS.stack, 'stack');
  // headroom: nothing hangs low over a place you stand
  for (const P of L.pieces) {
    for (const Q of L.pieces) {
      const under = Q.top - Q.thick;
      if (Q === P || under <= P.top + 0.05 || under >= P.top + HEAD) continue;
      if (under < P.top + 0.45 && Q.top <= P.top + 1) continue;
      if (footGap(P.foot, Q.foot) < 0.01) { errors.push(`${P.id} ${P.kind}: only ${(under - P.top).toFixed(2)} m under ${Q.id} ${Q.kind}`); break; }
    }
  }
  if (L.coins.length < 40 || L.coins.length > 75) errors.push(`coins ${L.coins.length} not in 40..75`);
  for (const c of [...L.coins, ...L.caches, ...L.checkpoints, L.vault]) {
    const s = supportAt(L, c.x, c.z, c.y + 0.05);
    if (Math.abs(s - c.y) > 0.3) errors.push(`${c.id || 'vault'}: floating or buried (${c.y.toFixed(2)} vs ${s.toFixed(2)})`);
  }
  // the arch's back: every step a walk, not a jump
  for (let i = 1; i < L.steps.length; i++) {
    const d = Math.abs(L.steps[i].top - L.steps[i - 1].top);
    if (d > ASHORE.stepUp) errors.push(`arch step ${i}: ${d.toFixed(2)} m, more than a step`);
  }
  const stats = { pieces: L.pieces.length, colliders: L.colliders.length, coins: L.coins.length, jumps, stackJumps };
  return { ok: errors.length === 0, errors, stats };
}

