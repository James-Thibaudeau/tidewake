// The Sunken Temple's layout: where everything in the walkable level stands.
// Plain data and maths (no three.js), so tools/check.mjs can validate it and
// send a test climber along it in Node. temple.js turns it into meshes.
//
// The temple stands over the edge of the island, half on the beach and half
// in the sea (docs/sunken-temple-level.md). Temple space: the front edge of
// the portico at the origin, y up, the sea at y = 0; the drowned colonnade
// runs out to sea along -z, the hall is inland on +z, and the beach is on +x.
//
// The route: the beach → wading out along the drowned causeway (gaps of deep
// water to hop) → the forecourt gate → stumps and a fallen column up onto the
// colonnade's beams at the seaward end → along the east row, across on a
// fallen beam, back along the west row to the portico → through the great
// door and down a stair of fallen blocks into the flooded hall → across on
// fallen roof slabs and what's left of the floor → up onto the treasury's
// dais, where the journal is. The way out is the breach in the hall's east
// wall, a drop onto the beach. Optional: up a pile of fallen blocks from the
// portico onto the entablature and along the broken gable to its top, the chest.
// The tide shrine (the vault) stands on the beach by the rowboat.
import { ASHORE } from '../config.js';
import { noise2, smoothstep, lerp, TAU } from '../util.js';
import { obox, cyl } from './shapes.js';
import { footGap, nodeFoot, supportAt } from './grove-layout.js';

export const TEMPLE = {
  deck: 8,                                            // the portico, where the colonnade's beams arrive
  stair: { half: 6, z0: -15 },                        // the front stair, from the water up to the portico
  cols: { x: 7.5, z0: -50, step: 5, n: 10, cap: 0.85, r: 0.62 },   // the colonnade: two rows, columns every 5 m
  hall: { half: 9, wall: 1.5, z0: 11.5, z1: 36, top: 12 },        // inside the walls; the front wall is z 10-11.5
  dais: { z0: 30.65, y: 1.5 },                        // the treasury's floor
  portico: [-12, -4, 4, 12],                          // its columns' x, at z = 3, up to the entablature
  entab: { z: 3, y: 15, under: 14.4 },
  apex: 19.2,                                         // the top of the broken gable
  floor: -0.3,                                        // flooded floors: wading depth
};
// Limits for required moves (the top of medium) and for the gable (optional, hardest).
export const TEMPLE_LIMITS = {
  main: { up: 1.1, gap: 1.75, drop: ASHORE.design.safeDrop },
  gable: { up: ASHORE.design.jumpUp, gap: 2.6 },
};
const THICK = { slab: 3, gate: 3, stump: 12, ramp: 0.9, capital: 1.2, beam: 1.1, deck: 13, stair: 13, floor: 3, step: 3, dais: 5, sill: 4, entab: 0.6, plinth: 4, roof: 1 };

// ------------------------------------------------------------------ ground
const T = TEMPLE;
/** Where the beach meets the water, along x: under the hall's east wall (so the sand outside it is flat), out past the platform, then away to the south-east. */
const coastX = (z) => (z > 8 ? 9.4 : z > -10 ? lerp(14.2, 9.4, smoothstep(-10, 8, z)) : 14.2 + (-z - 10) * 0.4);
/** Distance in from the shore (negative in the water). */
function landSd(x, z) {
  const inland = Math.max(x - coastX(z) + 0.6 * noise2(z * 0.09, 3.1, 5), z - 40);
  const outer = 72 - Math.hypot(x - 42, z - 18) - 4 * noise2(x * 0.03, z * 0.03, 7);
  return Math.min(inland, outer);
}

/** Terrain height and surface at a point (temple space). The temple's floors are pieces; under them is deep water. */
export function templeGround(x, z) {
  const sd = landSd(x, z);
  let h;
  if (sd < 0) h = Math.max(-4, sd * 1.6);
  else if (sd < 12) h = sd * 0.11;
  else h = Math.min(1.32 + (sd - 12) * 0.09, 4.2) + 0.6 * Math.max(0, noise2(x * 0.05, z * 0.05, 11)) * smoothstep(12, 24, sd);
  return { h, tag: h < 1.5 ? 'sand' : 'grass' };
}
// The ground as drawn. temple.js builds the terrain mesh from this grid, and
// you walk on the same triangles, so where you stand is what you see.
export const GRID = { E: 118, S: 1.1 };
let grid = null;
/** The terrain sampled on the mesh's grid: { E, S, n, hs, tags } (cached). */
export function templeGrid() {
  if (grid) return grid;
  const { E, S } = GRID, n = Math.round((2 * E) / S) + 1, hs = new Float32Array(n * n), tags = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = templeGround(-E + i * S, -E + j * S);
    hs[j * n + i] = g.h; tags[j * n + i] = g.tag;
  }
  grid = { E, S, n, hs, tags };
  return grid;
}
/** The height of the ground as drawn (the mesh's triangles, split corner to corner as temple.js splits them). */
export function groundH(x, z) {
  const { E, S, n, hs } = templeGrid();
  const fx = (x + E) / S, fz = (z + E) / S, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return -4;
  const u = fx - i, v = fz - j, a = hs[j * n + i], b = hs[j * n + i + 1], c = hs[(j + 1) * n + i], d = hs[(j + 1) * n + i + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
const groundAt = (x, z) => { const h = groundH(x, z); return h < -0.55 ? -Infinity : h; };

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
/** Wading floors and the causeway are 'water' underfoot (a slosh), the rest stone. */
function colliderOf(p) {
  const tag = p.top < 0 ? 'water' : 'stone';
  if (p.r != null) return cyl(p.cx, p.cz, p.r, p.top - p.thick, p.top, tag);
  return obox(p.cx, p.top - p.thick / 2, p.cz, p.hx, p.thick / 2, p.hz, p.rot, tag);
}

// ------------------------------------------------------------------ layout
/** Build the whole level (temple space). The same every time: nothing is random. */
export function buildTempleLayout() {
  const pieces = [], route = [], gable = [], out = [], coins = [], caches = [];
  const add = (p) => { p.id = 'p' + pieces.length; pieces.push(p); return p; };
  const node = (list, p, x = p.cx, z = p.cz) => list.push({ x, z, y: p.top, piece: p });
  const walkTo = (list, x, z) => list.push({ x, z, y: groundH(x, z) });
  const coin = (x, y, z, value = 1) => coins.push({ id: 'c' + coins.length, x, y, z, value });
  const coinOn = (p, value, dx = 0, dz = 0) => coin(p.cx + dx, p.top, p.cz + dz, value);
  const coinGround = (x, z) => coin(x, groundH(x, z), z);
  const C = T.cols, colZ = (k) => C.z0 + k * C.step;

  // ---- the beach: the rowboat, grandfather's camp, the tide shrine
  const rowboat = { x: coastX(-38) - 0.5, z: -38, rot: Math.PI + 0.25 };
  rowboat.y = Math.max(0, groundH(rowboat.x, rowboat.z));
  const spawn = { x: rowboat.x + 3.4, z: -37.2, yaw: -Math.PI / 2 };
  spawn.y = groundH(spawn.x, spawn.z);
  const exit = { x: rowboat.x, y: rowboat.y, z: rowboat.z, r: 2.8 };
  const camp = { x: 31.5, z: -29.5, rot: -2.2 };   // a hammock between two palms and his camp table
  camp.y = groundH(camp.x, camp.z);
  const shrine = { x: coastX(-23) + 1.6, z: -23, r: 2.4, rot: Math.PI / 2 };   // its open front faces the sea (-x)
  shrine.y = groundH(shrine.x, shrine.z);
  const vault = { x: shrine.x + 0.3, z: shrine.z, y: 0 };
  vault.y = groundH(vault.x, vault.z);
  caches.push({ id: 'g0', x: shrine.x + 1.1, y: groundH(shrine.x + 1.1, shrine.z + 0.9), z: shrine.z + 0.9, value: 30 });
  walkTo(route, spawn.x, spawn.z);
  walkTo(route, coastX(-43) + 0.9, -43);

  // ---- the drowned causeway, a hand's depth under water, out to the forecourt gate
  const P0 = [coastX(-45.2) + 0.3, -45.2], G = [14.5, -64.5];
  const len = Math.hypot(G[0] - P0[0], G[1] - P0[1]), u = [(G[0] - P0[0]) / len, (G[1] - P0[1]) / len];
  const rot = Math.atan2(-u[1], u[0]), side = [-u[1], u[0]];
  const along = (d, s = 0) => [P0[0] + u[0] * d + side[0] * s, P0[1] + u[1] * d + side[1] * s];
  const slabs = [];
  let d = 0;
  for (const [sl, gap, top] of [[4.6, 0.9, -0.22], [3.6, 1.25, -0.2], [4.0, 1.5, -0.25], [3.1, 1.7, -0.18]]) {
    const [cx, cz] = along(d + sl / 2);
    const S = add(rect('slab', cx, cz, top, sl / 2, 1.9, rot));
    slabs.push(S);
    node(route, S, ...along(d + 0.6));
    node(route, S, ...along(d + sl - 0.6));
    const [kx, kz] = along(d + sl / 2, slabs.length % 2 ? 0.7 : -0.7);
    coin(kx, top, kz);
    d += sl + gap;
  }
  const [gx, gz] = along(d + 2.2);
  const gate = add(rect('gate', gx, gz, 0.1, 2.2, 2.2, rot));
  node(route, gate, ...along(d + 0.9));
  node(route, gate, gx, gz);
  // plinths along both sides of the causeway, statues on some, turtles dozing on others
  const plinths = [];
  for (let k = 0; k < 7; k++) {
    const s = (k % 2 ? 1 : -1) * 3.1, [px, pz] = along(1.6 + k * 3.1, s);
    plinths.push(add(rect('plinth', px, pz, 0.75, 0.6, 0.6, rot, { statue: k % 3 !== 1, a: Math.atan2(side[1] * Math.sign(s), side[0] * Math.sign(s)) })));
  }

  // ---- up onto the colonnade: two stumps, then a fallen column leaning up to the first capital
  // (the second stump stands in line with the column, so you step straight up onto its foot)
  const stumps = [[gx - 4.4, gz - 1.6, 0.95], [C.x, gz - 1.5, 1.95]].map(([x, z, top]) => add(disc('stump', x, z, top, 1.05)));
  for (const s of stumps) { node(route, s); coinOn(s); }
  const ramp = [], rz0 = stumps[1].cz + 1.05, rz1 = colZ(0) - C.cap - 0.02, rampY0 = stumps[1].top + 0.27;
  const nRamp = Math.ceil((T.deck - rampY0) / 0.27) + 1, rRun = (rz1 - rz0) / nRamp;
  for (let i = 0; i < nRamp; i++) {
    const top = Math.min(T.deck, rampY0 + ((T.deck - rampY0) * i) / (nRamp - 1));
    const R = add(rect('ramp', C.x, rz0 + (i + 0.5) * rRun, Math.round(top * 100) / 100, 0.78, rRun / 2 + 0.02, 0));
    ramp.push(R);
    node(route, R);
    if (i % 5 === 2) coinOn(R);
  }

  // ---- the colonnade: capitals and the beams between them, some broken
  const caps = { '-1': [], 1: [] };
  const capital = (s, k, top = T.deck, half = C.cap) => (caps[s][k] = add(rect('capital', s * C.x, colZ(k), top, half, half, 0, { col: true })));
  /** The beam between capitals k and k+1 on side s; `gap` breaks it in the middle. */
  const beam = (s, k, gap = 0, tops = [T.deck, T.deck]) => {
    // from the edge of one capital to the edge of the next (the turning capitals are wider)
    const za = colZ(k) + (caps[s][k]?.hx ?? C.cap), zb = colZ(k + 1) - (caps[s][k + 1]?.hx ?? C.cap);
    if (!gap) return [add(rect('beam', s * C.x, (za + zb) / 2, tops[0], 0.6, (zb - za) / 2 + 0.03, 0))];
    const half = (zb - za - gap) / 4;
    return [add(rect('beam', s * C.x, za + half - 0.03, tops[0], 0.6, half + 0.03, 0)), add(rect('beam', s * C.x, zb - half + 0.03, tops[1], 0.6, half + 0.03, 0))];
  };
  const E = 1, W = -1;
  const walk = (s, k, parts) => { for (const p of parts) node(route, p, s * C.x, p.cz); node(route, caps[s][k + 1]); };
  capital(E, 0); node(route, caps[E][0]);
  capital(E, 1); capital(E, 2); capital(E, 3, T.deck, 1.0);
  walk(E, 0, beam(E, 0)); coinOn(caps[E][1]);
  walk(E, 1, beam(E, 1, 1.4));
  walk(E, 2, beam(E, 2, 1.0)); coinOn(caps[E][2]);
  // across to the west row on a beam that fell between the rows, broken in the middle
  capital(W, 3, T.deck, 1.0);
  const xa = C.x - 1.0, xb = -C.x + 1.0, cgap = 1.6, cmid = -1.5;
  const cross = [add(rect('beam', (xa + cmid + cgap / 2) / 2, colZ(3), T.deck, (xa - cmid - cgap / 2) / 2 + 0.03, 0.6, 0)),
    add(rect('beam', (xb + cmid - cgap / 2) / 2, colZ(3), T.deck, (cmid - cgap / 2 - xb) / 2 + 0.03, 0.6, 0))];
  for (const p of cross) { node(route, p, p.cx + p.hx - 0.4, p.cz); node(route, p, p.cx - p.hx + 0.4, p.cz); coinOn(p); }
  node(route, caps[W][3]);
  // the west row back to the portico: one column has sunk, so its capital sits lower
  capital(W, 4, T.deck - 0.55);
  for (let k = 5; k < C.n; k++) capital(W, k);
  walk(W, 3, beam(W, 3)); coinOn(caps[W][4]);
  walk(W, 4, beam(W, 4, 1.5, [T.deck - 0.55, T.deck]));
  walk(W, 5, beam(W, 5)); coinOn(caps[W][6]);
  walk(W, 6, beam(W, 6, 1.2));
  walk(W, 7, beam(W, 7)); coinOn(caps[W][8]);
  walk(W, 8, beam(W, 8));
  // the last beam runs into the portico
  const last = add(rect('beam', -C.x, (colZ(C.n - 1) + C.cap) / 2, T.deck, 0.6, (-colZ(C.n - 1) - C.cap) / 2 + 0.03, 0));
  node(route, last); coinOn(last);
  // the rest of the east row: two broken short, then standing with their beams (out of the way)
  add(disc('stump', C.x, colZ(4), 3.4, C.r + 0.08));
  add(disc('stump', C.x, colZ(5), 5.6, C.r + 0.08));
  for (let k = 6; k < C.n; k++) capital(E, k);
  for (let k = 6; k < C.n - 1; k++) beam(E, k);
  add(rect('beam', C.x, (colZ(C.n - 1) + C.cap) / 2, T.deck, 0.6, (-colZ(C.n - 1) - C.cap) / 2 + 0.03, 0));
  // and the seaward end of the west row: one stump, one whole column, one gone
  add(disc('stump', -C.x, colZ(0), 2.1, C.r + 0.08));
  capital(W, 1);

  // ---- the platform: the front stair down into the water, the portico
  const stairs = [];
  for (let i = 0; i <= 30; i++) {
    const top = Math.round((-0.25 + i * 0.27) * 100) / 100;
    stairs.push(add(rect('stair', 0, T.stair.z0 + (i + 0.5) * 0.48, top, T.stair.half, 0.245, 0, { thick: top + 5 })));
  }
  const deck = add(rect('deck', 0, 5, T.deck, 14, 5, 0));
  node(route, deck, -C.x, 1.2);
  node(route, deck, -6.2, 6.5);
  coin(-6.8, T.deck, 4.2); coin(-1.6, T.deck, 8.2);

  // ---- through the great door and down the stair of fallen blocks
  const H = T.hall;
  const sill = add(rect('deck', 0, 10.75, T.deck, 2, 0.76, 0, { kind: 'door', thick: 13 }));
  node(route, sill, 0, 10.4);
  const landing = add(rect('block', 0, 12.4, T.deck, 2.2, 0.9, 0, { thick: 11.5 }));
  node(route, landing);
  const blocks = [];
  for (const [x, z, top] of [[3.3, 12.4, 7.0], [5.5, 12.4, 6.0], [7.75, 12.45, 5.0], [7.75, 14.6, 4.1], [5.55, 14.6, 3.2], [3.35, 14.6, 2.3], [1.15, 14.6, 1.4], [-1.05, 14.6, 0.5]]) {
    const B = add(rect('block', x, z, top, 1.1, 0.9, 0, { thick: top + 3.5 }));
    blocks.push(B);
    node(route, B);
    if (blocks.length % 2) coinOn(B);
  }

  // ---- the flooded hall: what's left of its floor, fallen roof slabs across the holes
  const F = T.floor;
  const front = add(rect('floor', -5.1, 13.5, F, 3.9, 2, 0));          // west of the giant's stair
  add(rect('floor', 3.9, 13.5, F, 5.1, 2, 0));                          // and under it
  node(route, front, -3.4, 14.2);
  node(route, front, -5.6, 15.0);
  const fallen = [[-5.7, 17.3, 0.25, 0.3], [-3.5, 19.7, 0.7, -0.2]].map(([x, z, top, r]) => {
    const S = add(rect('slab', x, z, top, 1.4, 1.0, r, { roof: true, thick: 3.5 }));
    node(route, S);
    coinOn(S);
    return S;
  });
  // the floor beyond: a band across the hall, then a strip down each side of the
  // second hole; the west one broken (the way on), the east one ends at the hole
  const band = add(rect('floor', 0, 21.6, F, 9, 0.6, 0));
  node(route, band, -4.4, 21.6);
  const westA = add(rect('floor', -6.5, 22.9, F, 2.5, 0.7, 0));
  const westB = add(rect('floor', -6.5, 26.15, F, 2.5, 1.05, 0));
  add(rect('floor', 6.5, 24.4, F, 2.5, 2.2, 0));
  node(route, westA, -6.5, 23.2);
  node(route, westB, -6.5, 25.8);
  coinOn(westB);
  const back = add(rect('floor', -3, 27.8, F, 6, 0.65, 0));
  node(route, back, -4.4, 27.8);
  coinOn(back, 1, 3);
  // up the dais to the treasury
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(add(rect('step', 0, 28.65 + i * 0.4, Math.round((F + 0.3 * (i + 1)) * 100) / 100, 6, 0.21, 0, { thick: 3 + i * 0.3 })));
  for (const S of steps) node(route, S, -1.2, S.cz);
  const dais = add(rect('dais', 0, (T.dais.z0 + H.z1) / 2, T.dais.y, H.half, (H.z1 - T.dais.z0) / 2, 0));
  // the treasury: the gold round a seated statue at the back, his crate and stool before it
  const crate = { x: -1.5, z: 33.1, y: T.dais.y, rot: 0.12 };
  const stool = { x: -2.75, z: 32.5, y: T.dais.y };
  const statue = { x: 0, z: 35.1, y: T.dais.y };
  const journal = { id: 'V', x: -1.3, y: T.dais.y, z: 31.85, r: 1.1 };
  node(route, dais, journal.x, journal.z);
  caches.push({ id: 'g1', x: 1.9, y: T.dais.y, z: 33.6, value: 60 });
  for (const [x, z] of [[2.6, 31.6], [-3.6, 34.2], [4.2, 34.6]]) coin(x, T.dais.y, z, 2);

  // ---- the way out: up a fallen slab to the breach in the east wall, and down onto the beach
  // (rubble that fell out of it lies on the sand just north of where you land)
  const breach = { z: 33.3, half: 1.3, sill: 3.4, top: 7, rubble: [[12.6, 1.5, 1, 0.4], [14.1, 2.7, 0.8, -0.3], [11.7, 3.2, 0.7, 1.1]] };
  const slab = add(rect('slab', 7.5, breach.z, 2.45, 0.85, 1.0, 0, { roof: true, thick: 3 }));
  const ledge = add(rect('sill', H.half + H.wall / 2, breach.z, breach.sill, H.wall / 2 + 0.05, breach.half, 0));
  out.push({ x: journal.x, z: journal.z, y: T.dais.y, piece: dais });
  node(out, dais, 5.8, breach.z);
  node(out, slab);
  node(out, ledge, H.half + 0.5, breach.z);
  walkTo(out, H.half + H.wall + 1.6, breach.z);
  walkTo(out, 15.5, 12);
  walkTo(out, 17.5, -14);
  walkTo(out, spawn.x, spawn.z);

  // ---- the gable (optional): a pile of fallen blocks from the portico up onto the
  // entablature, then along the broken gable's rising edge to its top
  const pile = [];
  node(gable, deck, -2.6, 7.6);
  node(gable, deck, 3.4, 5.9);
  let gy = T.deck;
  for (const [x, z] of [[5.6, 5.8], [5.6, 8.6], [8.2, 8.6], [10.8, 8.6], [10.8, 5.8], [13.0, 5.8]]) {
    gy += 1.05;
    const B = add(rect('block', x, z, Math.round(gy * 100) / 100, 0.95, 0.95, 0.06 * (pile.length % 3 - 1), { fallen: true, thick: gy - T.deck + 0.1 }));
    pile.push(B);
    node(gable, B);
    coinOn(B, 2);
  }
  const ET = T.entab;
  const entabE = add(rect('entab', 7.25, ET.z, ET.y, 5.75, 0.8, 0));
  add(rect('entab', -7.25, ET.z, ET.y, 5.75, 0.8, 0));
  node(gable, entabE, 12.6, ET.z + 0.1);
  const cornice = [];
  for (let i = 1; i <= 14; i++) {
    const top = Math.round((ET.y + 0.28 * i) * 100) / 100;
    const S = add(rect('cornice', 12.6 - 0.8 * i, ET.z, top, 0.41, 0.75, 0, { thick: top - ET.y + 0.1 }));
    cornice.push(S);
    node(gable, S);
    if (i % 4 === 0) coinOn(S, 2);
  }
  const apex = add(rect('apex', -0.05, ET.z, T.apex, 1.4, 1.1, 0, { thick: T.apex - ET.y + 0.1 }));
  node(gable, apex, 0.6, ET.z);
  node(gable, apex, -0.6, ET.z);
  // the gold circlet is found here and nowhere else
  const chest = { id: 'chest', x: -0.75, y: T.apex, z: ET.z - 0.2, yaw: Math.PI / 2, cosmetic: 'hat:circlet' };
  caches.push({ id: 'g2', x: -0.6, y: T.apex, z: ET.z + 0.7, value: 40 });
  caches.push({ id: 'g3', x: 9.2, y: T.deck, z: 4.6, value: 20 });

  // ---- colliders
  const colliders = pieces.map(colliderOf);
  // the columns under the capitals, and the portico's up to the entablature
  for (const s of [E, W]) for (const [k, p] of caps[s].entries()) if (p) colliders.push(cyl(p.cx, p.cz, C.r, -4, p.top - p.thick, 'stone'));
  for (const x of T.portico) colliders.push(cyl(x, ET.z, 0.8, T.deck, ET.under, 'stone'));
  // the hall's walls: the front with the great door, the sides (the east one with the breach), the back
  const wall = (x0, x1, z0, z1, y0, y1) => colliders.push(obox((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, 0, 'stone'));
  const wo = H.half + H.wall, doorTop = 12;
  wall(-wo, -2, 10, H.z0, -5, H.top + 1);
  wall(2, wo, 10, H.z0, -5, H.top + 1);
  wall(-2, 2, 10, H.z0, doorTop, H.top + 1);
  wall(-wo, -H.half, H.z0, H.z1 + H.wall, -5, H.top);
  wall(H.half, wo, H.z0, breach.z - breach.half, -5, H.top);
  wall(H.half, wo, breach.z + breach.half, H.z1 + H.wall, -5, H.top);
  wall(H.half, wo, breach.z - breach.half, breach.z + breach.half, breach.top, H.top);
  wall(-wo, wo, H.z1, H.z1 + H.wall, -5, H.top);
  // the one piece of roof still standing, over the treasury (solid, so the camera keeps under it)
  // (a crack runs along it over the gold, gap wide, where the light comes in)
  const roof = { x0: -H.half, x1: H.half, z0: 31.2, z1: H.z1, y: 10.6, gap: 1.3 };
  for (const s of [-1, 1]) colliders.push(obox(s * (H.half + roof.gap) / 2, roof.y + 0.5, (roof.z0 + roof.z1) / 2, (H.half - roof.gap) / 2, 0.5, (roof.z1 - roof.z0) / 2, 0, 'stone'));
  // the giant face half sunk beside the colonnade
  const head = { x: -16, z: -29, r: 2.6, rot: 0.5 };
  colliders.push(cyl(head.x, head.z, head.r * 0.9, -4, 0.6, 'stone'));
  // statues on the plinths, the seated one in the treasury, his crate, the shrine, the rowboat
  for (const p of plinths) if (p.statue) colliders.push(cyl(p.cx, p.cz, 0.45, p.top, p.top + 2.1, 'stone'));
  colliders.push(cyl(statue.x, statue.z, 1.3, T.dais.y, T.dais.y + 4.2, 'stone'));
  for (const [x, dz, sc] of breach.rubble) colliders.push(cyl(x, breach.z + dz, 0.6 * sc, groundH(x, breach.z + dz) - 0.3, groundH(x, breach.z + dz) + 0.9 * sc, 'stone'));
  colliders.push(obox(crate.x, crate.y + 0.3, crate.z, 0.42, 0.3, 0.32, crate.rot, 'wood'));
  colliders.push(obox(rowboat.x, rowboat.y + 0.2, rowboat.z, 1.7, 0.25, 0.7, rowboat.rot, 'wood'));
  colliders.push(obox(camp.x, camp.y + 0.38, camp.z, 0.5, 0.38, 0.35, camp.rot, 'wood'));
  for (const s of [-1, 1]) colliders.push(cyl(shrine.x + 0.4, shrine.z + s * (shrine.r - 0.2), 0.35, shrine.y - 1, shrine.y + 2.6, 'stone'));
  colliders.push(obox(shrine.x + shrine.r - 0.1, shrine.y + 1.3, shrine.z, 0.25, 1.4, shrine.r, 0, 'stone'));

  const checkpoints = [
    { id: 'gate', x: gx + 1.1 * side[0] + 0.4 * u[0], y: gate.top, z: gz + 1.1 * side[1] + 0.4 * u[1] },
    { id: 'colonnade', x: C.x + 0.55, y: T.deck, z: colZ(3) - 0.55 },
    { id: 'portico', x: -3.4, y: T.deck, z: 7.9 },
    { id: 'treasury', x: -2.75, y: T.dais.y, z: 30.95 },   // at the top of the steps, where you come up
    { id: 'gable', x: 0.75, y: T.apex, z: ET.z + 0.65 },
  ];
  const down = { x: spawn.x - 1, y: spawn.y, z: spawn.z + 1.2, yaw: -Math.PI / 2 };

  // ---- the story: the note on his camp table, Journal V on the crate, and two things to look at
  const cd = [Math.sin(camp.rot), Math.cos(camp.rot)];
  const note = { id: 'note', x: camp.x + cd[0] * 1.2, z: camp.z + cd[1] * 1.2, r: 1.7 };
  note.y = groundH(note.x, note.z);
  const looks = [
    { id: 'fish', x: -7.6, y: F, z: 12.6, r: 1.4, prompt: 'Look at the carvings', text: 'fish' },
    { id: 'stool', x: stool.x - 0.7, y: T.dais.y, z: stool.z - 0.3, r: 0.9, prompt: 'Look at the camp stool', text: 'stool' },
  ];
  const spots = { note, journal, looks };

  // where turtles doze (temple-life.js): on the plinths without statues, and the gate's edge
  const turtles = plinths.filter((p) => !p.statue).map((p) => ({ x: p.cx, y: p.top, z: p.cz, a: p.a }));
  turtles.push({ x: gx - 1.5 * u[0] - 1.6 * side[0], y: gate.top, z: gz - 1.5 * u[1] - 1.6 * side[1], a: Math.atan2(-side[1], -side[0]) });
  // where fish swim: round the colonnade, and in the hall's holes
  const shoals = [{ x: 0, z: -40, r: 5 }, { x: 2, z: -24, r: 4.5 }, { x: 18, z: -56, r: 4 }, { x: 0, z: 18.2, r: 2.4 }, { x: 0, z: 25, r: 2.2 }];
  // where the water glows at night: the causeway and the colonnade, and the hall's floor
  const glow = [{ x: 18, z: -56, r: 14 }, { x: 0, z: -32, r: 18 }, { x: 0, z: 22, r: 10 }];

  /** Is this a spot where a palm, a rock or a bush may stand (clear of the route and the temple)? */
  const clear = (x, z, pad = 0) => {
    const g = templeGround(x, z);
    if (g.h < 0.5 + pad * 0.2) return false;
    if (x < T.hall.half + T.hall.wall + 2 + pad && z > -2 && z < T.hall.z1 + 3) return false;   // the temple
    if (Math.hypot(x - camp.x, z - camp.z) < 4 || Math.hypot(x - shrine.x, z - shrine.z) < shrine.r + 2.5) return false;
    if (Math.hypot(x - rowboat.x, z - rowboat.z) < 5) return false;
    return ![...route, ...out].some((n) => Math.hypot(n.x - x, n.z - z) < 2.6 + pad);
  };

  return {
    pieces, colliders, route, gable, out, groundAt, groundTag: (x, z) => templeGround(x, z).tag, waterY: 0,
    bounds: { r: 118 }, calm: { x: 4, z: -18, r: 66 },
    spawn, exit, rowboat, camp, shrine, checkpoints, coins, caches,
    chests: [chest],
    summit: { x: journal.x, y: journal.y, z: journal.z }, vault,
    spots, crate, stool, statue, roof, head, breach, plinths, slabs, gate, stumps, ramp, caps, cross, stairs, deck, landing, blocks, fallen, pile, cornice, apex, dais, steps,
    turtles, shoals, glow, coastX, clear,
    // the far end of the walk: the lanterns there offer the quick way back to the beach
    fallBack: { drop: ASHORE.design.safeDrop, below: 3, safe: [], down, from: ['portico', 'gable'], label: 'Climb down to the beach' },
  };
}

// -------------------------------------------------------------- validation
/** Check the layout against the design limits. Returns { ok, errors, stats }. */
export function validateTemple(L) {
  const errors = [];
  const HEAD = ASHORE.height + 0.2;
  const check = (nodes, lim, label) => {
    let jumps = 0;
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i];
      if (!A.piece && !B.piece) continue;   // a walk over open ground isn't a jump (the climber checks it)
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
          if (!(L.fallBack && lantern - s > L.fallBack.below)) errors.push(`${where}: a miss drops ${(low - s).toFixed(1)} m onto stone (max ${lim.drop})`);
        }
      }
    }
    return jumps;
  };
  const jumps = check(L.route, TEMPLE_LIMITS.main, 'main');
  const gableJumps = check(L.gable, TEMPLE_LIMITS.gable, 'gable');
  check(L.out, TEMPLE_LIMITS.main, 'out');
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
  for (const c of [...L.coins, ...L.caches, ...L.checkpoints, L.vault, L.spots.note, L.spots.journal, ...L.spots.looks]) {
    const s = supportAt(L, c.x, c.z, c.y + 0.05);
    if (Math.abs(s - c.y) > 0.3) errors.push(`${c.id || 'vault'}: floating or buried (${c.y.toFixed(2)} vs ${s.toFixed(2)})`);
  }
  // wading: every floor you walk is under the water line, but never deep enough to splash
  for (const p of L.pieces) if (p.top < 0 && p.top < -0.5) errors.push(`${p.id} ${p.kind}: ${p.top} m is too deep to wade`);
  // the story: the journal waits where the walk ends, clear of the stool; the way
  // up to it passes the treasury's lantern
  const J = L.spots.journal, K = L.checkpoints.find((c) => c.id === 'treasury');
  if (Math.abs(J.y - L.summit.y) > 0.01) errors.push('story: the journal is not where the walk ends');
  if (!K || !L.route.some((n) => Math.hypot(n.x - K.x, n.z - K.z) < 1.8 && Math.abs(n.y - K.y) < 1)) errors.push("story: the way to the journal doesn't pass the treasury's lantern");
  for (const s of L.spots.looks) if (Math.hypot(s.x - J.x, s.z - J.z) < s.r + J.r && Math.abs(s.y - J.y) < 1.2) errors.push(`story: the ${s.id} spot overlaps the journal's`);
  if (!L.chests[0]?.cosmetic) errors.push("the gable's chest has no cosmetic of its own");
  // the breach is one way: from the beach outside it's too high to climb
  const sill = L.pieces.find((p) => p.kind === 'sill'), outside = groundH(sill.cx + 2.2, sill.cz);
  if (sill.top - outside < ASHORE.design.jumpUp + 0.6) errors.push(`the breach is only ${(sill.top - outside).toFixed(2)} m above the beach: climbable from outside`);
  // the ramp and the front stair: every step a walk, not a jump
  for (const list of [L.ramp, L.stairs, L.cornice]) {
    for (let i = 1; i < list.length; i++) {
      const dd = Math.abs(list[i].top - list[i - 1].top);
      if (dd > ASHORE.stepUp) errors.push(`${list[i].kind} step ${i}: ${dd.toFixed(2)} m, more than a step`);
    }
  }
  const stats = { pieces: L.pieces.length, colliders: L.colliders.length, coins: L.coins.length, jumps, gableJumps };
  return { ok: errors.length === 0, errors, stats };
}
