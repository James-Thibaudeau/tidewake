// Ashore level layout: terrain, route modules, pickups and validation.
// Pure data (no three.js) so it can be generated and checked in Node; the
// geometry is built from this in levelgen.js. Follows the contract in
// shapes.js.
//
// The island (level space, origin at the centre, sea at y = 0):
//   sea → beach → MOAT (a water ring you must cross) → meadow →
//   CLIFF 1 (unclimbable rock wall) → upper terrace → MESA (tall rock wall) → summit
// The required route: spawn by the rowboat → cross the moat → walk the meadow
// → climb a staircase module up cliff 1 → walk the terrace → spiral up the
// mesa (2-5 modules with vista pads between) → summit plateau.
// Falling from a climb lands you on the tier below (never fatal); only the
// moat and the sea are water.
// Each biome picks its own climbing styles (POOLS), terrain shape (SHAPE) and
// difficulty ease (BIOME_EASE). Rocky islands climb sheer ledges, sea stacks
// and arches, and put a rock spire and a natural arch in place of the
// lookout tree and the plain meadow walk. Tropical islands hop between palm
// tops, climb tide pools stepping up the rock and cross rope bridges hung on
// the face; the moat is crossed on a rope bridge or between rock pools, and
// the chest sits in the crown of a giant palm.
//
// Rotations (obox.rot, piece.rot) use the three.js rotation.y convention:
// a local (x, z) maps to world (x cos r + z sin r, -x sin r + z cos r).
import { mulberry32, noise2, clamp, lerp, smoothstep, TAU } from '../util.js';
import { obox, cyl, topOf } from './shapes.js';
import { ASHORE } from '../config.js';

const D = ASHORE.design;
// Required moves stay comfortably inside the design limits; optional branches
// may use up to ~90% of what the controller can really do. These are the
// height (m) and time in the air (s) of the jump before it hung at the top and
// fell faster; the jump today goes a little higher and stays up a little longer
// (controller.js, jumpArc; `node tools/check.mjs climb` checks that it still
// does). Kept, so every generated island is laid out as it was: coins and
// caches are saved by id.
const REAL_UP = 1.536;
const AIR = 0.64;
export const LIMITS = {
  main: { up: D.jumpUp, gap: D.gapWalk, drop: D.safeDrop, minWidth: 1.2 },
  // islands near Port Haven: small hops between wide platforms, rests between
  easy: { up: 0.7, gap: 1.0, drop: 4, minWidth: 2.0, maxRun: 4 },
  optional: { up: REAL_UP * 0.9, gap: ASHORE.walk * AIR * 0.9, drop: D.safeDrop + 1, minWidth: 1.0 },
};

/**
 * Difficulty comes from distance to Port Haven (the world origin); size only
 * lengthens the route. Landmarks are at least medium.
 *   easy   < 1.5 km   mostly walking: stone stairs, wide steps, rails, a footbridge
 *   medium 1.5-3.5 km hops between platforms
 *   hard   > 3.5 km   up to the design limits
 * diff (0..1) grades within a tier: easy 0, medium 0..0.5, hard 0.5..1.
 * A biome that the story reaches early but whose islands lie far out counts
 * as closer than it is (BIOME_EASE), so its first islands aren't its hardest.
 */
export function difficultyFor(I, opts = {}) {
  const dist = Math.max(0, Math.hypot(I.x || 0, I.z || 0) - (BIOME_EASE[I.biome] || 0));
  let tier = opts.tier || (dist < 1500 ? 'easy' : dist < 3500 ? 'medium' : 'hard');
  if (!opts.tier && I.landmark && tier === 'easy') tier = 'medium';
  const diff = tier === 'easy' ? 0 : tier === 'medium' ? clamp((dist - 1500) / 2000, 0, 1) * 0.5 : 0.5 + clamp((dist - 3500) / 3000, 0, 1) * 0.5;
  return { tier, diff, dist };
}

// Per-tier shape of the island and its route. Ranges are [lo, hi].
const TIERS = {
  easy: { rt: [52, 70], H1: [3.4, 4.2], summit: [10, 13], minSummit: 3.5, cliffParts: () => 1, mesaParts: (size) => (size > 0.5 ? 2 : 1),
    meadowArc: [0.2, 0.26], terraceArc: [0.34, 0.42], restEvery: 3, approachGap: 0.85, rails: true,
    tree: { orbit: 3.0, dphi: 1.05, r: 1.3, top: 1.55, first: 0.65, rise: [0.62, 0.7], n: (size) => 5 + Math.round(size) } },
  medium: { rt: [55, 80], H1: [4.4, 5.4], summit: [12, 19], minSummit: 6.5, cliffParts: (size) => (size > 0.45 ? 2 : 1), mesaParts: (size, rng) => 2 + Math.round(size * 0.8 + rng() * 0.5),
    meadowArc: [0.3, 0.42], terraceArc: [0.5, 0.68], restEvery: 0, approachGap: 1.2, rails: false,
    tree: { orbit: 2.55, dphi: 1.42, r: 1.02, top: 1.45, first: 1.0, rise: [1.0, 1.12], n: (size) => 5 + Math.round(size * 1.5) } },
  hard: { rt: [60, 84], H1: [5.2, 6.4], summit: [16, 24.5], minSummit: 7.5, cliffParts: () => 2, mesaParts: (size, rng) => 3 + Math.round(size * 0.6 + rng() * 0.4),
    meadowArc: [0.32, 0.44], terraceArc: [0.55, 0.75], restEvery: 0, approachGap: 1.2, rails: false,
    tree: { orbit: 2.55, dphi: 1.42, r: 1.0, top: 1.45, first: 1.15, rise: [1.12, 1.3], n: (size) => 6 + Math.round(size) } },
};
const HEADROOM = ASHORE.height + 0.2;
// Rocky islands are the first biome after temperate (grandfather's anchor's
// first refit) but the nearest lie ~2.3 km out: count them 800 m closer.
// Tropical islands come after rocky ones in the story but sit near temperate
// in difficulty (rocky is the harder biome): a little ease, so the first few
// past 1.5 km are still gentle.
const BIOME_EASE = { rocky: 800, tropical: 300 };
// Per-biome terrain: rock walls `H1` and summits `summit` times as tall.
const SHAPE = { temperate: { H1: 1, summit: 1 }, rocky: { H1: 1.15, summit: 1.12 }, tropical: { H1: 0.95, summit: 0.95 } };

const rotOf = (a) => -a - Math.PI / 2; // local x along the tangent at polar angle a
export const toWorld = (lx, lz, rot) => [lx * Math.cos(rot) + lz * Math.sin(rot), -lx * Math.sin(rot) + lz * Math.cos(rot)];

// ------------------------------------------------------------------ terrain
/**
 * The island's rings (shore, beach, moat, cliff, mesa) each wobble with their
 * own noise, so it reads as a natural island rather than a cake. Every ring
 * is a radius function of the polar angle a = atan2(z, x); the order of the
 * rings is enforced per angle so the meadow, terrace and banks never pinch.
 */
export function makeTerrain(I, rng, size, diff, cfg = TIERS.medium, shape = SHAPE.temperate) {
  const Rt = lerp(cfg.rt[0], cfg.rt[1], size);
  const S1 = Rt * 0.5, W1 = 0.8;              // cliff 1 nominal foot radius, face width
  const S2 = Math.max(9, Rt * 0.2), W2 = 0.8; // mesa
  const Sm = Rt * 0.74, MW = 2.8 + size * 1.4; // moat centre and half-width at the waterline
  const BANK = 3.2;                            // waterline → flat, gentle enough to walk (~35° at most)
  const beachTop = 1.2, meadowLo = 1.5, meadowHi = 2.1;
  // heights come from the tier (distance), not from the island's size
  const H1 = lerp(cfg.H1[0], cfg.H1[1], 0.5 * rng() + 0.5 * (diff % 0.5) * 2) * shape.H1;
  const h1 = meadowHi + H1, tierTop = h1 + 0.8;
  const summit = Math.max(tierTop + cfg.minSummit, meadowLo + lerp(cfg.summit[0], cfg.summit[1], 0.6 * rng() + 0.4 * (diff % 0.5) * 2) * shape.summit);
  const seed = (I.seed | 0) + 101;
  const wob = (k, amp, f = 1.3) => (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return 1 + amp * (noise2(c * f + k * 3.1, s * f + k * 7.7, seed) + 0.5 * noise2(c * f * 2.3 + k, s * f * 2.3 - k, seed + 1)) / 1.5;
  };
  const wShore = wob(1, 0.12), wBeach = wob(5, 0.3), wMoat = wob(2, 0.07), wMoatW = wob(6, 0.3), w1 = wob(3, 0.07), w2 = wob(4, 0.07, 1.7);
  const Rs = (a) => Rt * wShore(a);
  const Rb = (a) => Rs(a) - Rt * 0.13 * wBeach(a);
  const mw = (a) => MW * wMoatW(a);
  // soft minimum: keeps the rings in order without kinks where one gives way to another
  const smin = (x, y, k = 2.5) => -k * Math.log(Math.exp(-x / k) + Math.exp(-y / k));
  const Rm = (a) => smin(Sm * wMoat(a), Rb(a) - mw(a) - BANK - 2.5);
  const moatIn = (a) => Rm(a) - mw(a) - BANK, moatOut = (a) => Rm(a) + mw(a) + BANK;
  const R1 = (a) => smin(S1 * w1(a), moatIn(a) - 8);
  const R2 = (a) => smin(S2 * w2(a), R1(a) - W1 - 13);
  const meadowR = (a) => (R1(a) + moatIn(a)) / 2;
  const terraceR = (a) => (R2(a) + R1(a) - W1) / 2;

  const hRA = (r, a, x, z) => {
    const rs = Rs(a);
    if (r >= rs) return Math.max(-7, -0.3 - (r - rs) * 0.5);
    const rb = Rb(a);
    if (r >= rb) return lerp(-0.3, beachTop, smoothstep(rs, rb, r));
    const rm = Rm(a), w = mw(a), mo = rm + w + BANK, mi = rm - w - BANK;
    if (r >= mo) return beachTop;
    if (r >= mi) {
      const dm = Math.abs(r - rm), plain = r > rm ? beachTop : meadowLo;
      if (dm >= w) return lerp(-0.1, plain, smoothstep(w, w + BANK, dm));
      return lerp(-2.4, -0.1, smoothstep(w - 1.6, w, dm));
    }
    const n = noise2(x * 0.08, z * 0.08, seed + 11);
    const r1 = R1(a);
    if (r >= r1) return lerp(meadowHi, meadowLo, smoothstep(r1, mi, r)) + n * 0.3 * smoothstep(r1, r1 + 2, r) * smoothstep(mi, mi - 2, r);
    if (r >= r1 - W1) return lerp(meadowHi, h1, smoothstep(r1, r1 - W1, r));
    const r2 = R2(a);
    if (r >= r2) return lerp(h1, tierTop, smoothstep(r1 - W1, r2 + 1, r)) + n * 0.18 * smoothstep(r1 - W1, r1 - W1 - 2, r) * smoothstep(r2, r2 + 2, r);
    if (r >= r2 - W2) return lerp(tierTop, summit, smoothstep(r2, r2 - W2, r));
    return summit + 0.25 * (1 - r / (r2 - W2));
  };
  const heightAt = (x, z) => hRA(Math.hypot(x, z), Math.atan2(z, x), x, z);
  const groundAt = (x, z) => { const h = heightAt(x, z); return h < -0.55 ? -Infinity : h; };
  const groundTag = (x, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const r1 = R1(a), r2 = R2(a);
    if ((r < r1 && r >= r1 - W1 - 0.1) || (r < r2 && r >= r2 - W2 - 0.1)) return 'stone';
    // everything seaward of the moat is beach and dunes; the inner bank is sand too
    if (r >= Rm(a) || Math.abs(r - Rm(a)) < mw(a) + BANK * 0.6) return 'sand';
    return 'grass';
  };
  const at = (r, a) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  /** Radius of the moat's waterline on its outer / inner side, at angle a. */
  const moatEdge = (a, outer) => {
    let r = outer ? moatOut(a) : moatIn(a);
    const step = outer ? -0.05 : 0.05;
    for (let k = 0; k < 600; k++, r += step) {
      const p = at(r, a);
      if (groundAt(p.x, p.z) === -Infinity) return r - step;
    }
    return Rm(a);
  };
  return { Rt, S1, W1, S2, W2, Sm, MW, BANK, beachTop, meadowLo, meadowHi, h1, tierTop, summit,
    Rs, Rb, Rm, mw, moatIn, moatOut, R1, R2, meadowR, terraceR, hRA, heightAt, groundAt, groundTag, at, moatEdge };
}

// ------------------------------------------------------------------- pieces
// A piece is something you stand on. Footprints are convex polygons [[x,z],…]
// of the top surface; colliders are added per kind.
let _pid = 0;
function rectPiece(kind, cx, cz, top, hx, hz, rot, extra = {}) {
  const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => { const [wx, wz] = toWorld(x, z, rot); return [cx + wx, cz + wz]; });
  return { id: 'p' + (_pid++), kind, cx, cz, top, hx, hz, rot, foot: pts, minWidth: 2 * Math.min(hx, hz), ...extra };
}
function discPiece(kind, cx, cz, top, r, extra = {}) {
  const foot = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; foot.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return { id: 'p' + (_pid++), kind, cx, cz, top, r, foot, minWidth: 2 * r, ...extra };
}

/** Colliders for a piece. `base` is the ground under it (pillars reach down to it). */
function piecesColliders(p) {
  const out = pieceBody(p);
  // a low parapet along the outer edge (and both edges of a bridge)
  const rail = (side) => {
    const [ox, oz] = toWorld(0, side * (p.hz - 0.1), p.rot);
    const c = obox(p.cx + ox, p.top + 0.33, p.cz + oz, Math.max(0.2, p.hx - 0.12), 0.38, 0.08, p.rot, 'wood');
    c.rail = p.id; // (the validator ignores a joined neighbour's own rail post)
    return c;
  };
  if (p.rail) out.push(rail(-1));
  if (p.rails2) out.push(rail(-1), rail(1));
  return out;
}

function pieceBody(p) {
  const tag = p.tag || 'stone';
  switch (p.kind) {
    case 'bridge':
      return [obox(p.cx, p.top - 0.2, p.cz, p.hx, 0.2, p.hz, p.rot, 'wood')];
    case 'block': case 'column': case 'pad': case 'pool':
      return [obox(p.cx, (p.top + p.base - 0.6) / 2, p.cz, p.hx, (p.top - p.base + 0.6) / 2, p.hz, p.rot, tag)];
    case 'ledge': case 'plank': case 'vista':
      return [obox(p.cx, p.top - 0.25, p.cz, p.hx, 0.25, p.hz, p.rot, tag)];
    case 'disc':
      // discs on a shared tree (trunk: 0) hang off branches; others stand on their own trunk
      return p.trunk === 0 ? [cyl(p.cx, p.cz, p.r, p.top - 0.3, p.top, tag)]
        : [cyl(p.cx, p.cz, p.r, p.top - 0.3, p.top, tag), cyl(p.cx, p.cz, p.trunk || 0.42, p.base - 0.5, p.top - 0.3, 'wood')];
    case 'stone':
      return [cyl(p.cx, p.cz, p.r, -3, p.top, 'stone')];
    case 'palm':
      // a frond crown on a slim trunk (the trunk's bow is drawn, not solid)
      return [cyl(p.cx, p.cz, p.r, p.top - 0.3, p.top, 'leaf'), cyl(p.cx, p.cz, PALM_TRUNK, p.base - 0.5, p.top - 0.3, 'wood')];
    case 'rope':
      // a slatted deck hung on the face; its handrope (outer side) comes from `rail`
      return [obox(p.cx, p.top - 0.12, p.cz, p.hx, 0.12, p.hz, p.rot, 'wood')];
    case 'stack':
      // a sea stack: solid rock from below the ground (or the water) to its top
      return [cyl(p.cx, p.cz, p.r, Math.min(p.base, 0) - 1, p.top, 'stone')];
    case 'arch': {
      // a rock span on a leg at each end, open underneath
      const out = [obox(p.cx, p.top - 0.25, p.cz, p.hx, 0.25, p.hz, p.rot, tag)];
      const y0 = p.base - 1, y1 = p.top - 0.5;
      if (y1 > y0 + 0.1) {
        for (const s of [-1, 1]) {
          const [ox, oz] = toWorld(s * (p.hx - ARCH_LEG), 0, p.rot);
          out.push(obox(p.cx + ox, (y0 + y1) / 2, p.cz + oz, ARCH_LEG, (y1 - y0) / 2, p.hz * 0.8, p.rot, tag));
        }
      }
      return out;
    }
    case 'log':
      return [obox(p.cx, p.top - 0.45, p.cz, p.hx, 0.45, p.hz, p.rot, 'wood')];
    default: return [];
  }
}

// Staircase styles. w = along the route, d = depth away from the wall.
const STAIRS = {
  terraces: { kind: 'block', w: [1.8, 2.2], d: [1.8, 2.2], rise: [0.6, 0.85], gap: [0.25, 1.0], off: 0.35, tag: 'grass' },
  ruins: { kind: 'column', w: [1.35, 1.6], d: [1.35, 1.6], rise: [0.55, 0.9], gap: [0.9, 1.6], off: 0.45, tag: 'stone' },
  trees: { kind: 'disc', r: [0.95, 1.12], rise: [0.7, 0.95], gap: [0.9, 1.55], off: 0.5, tag: 'leaf' },
  ledges: { kind: 'ledge', w: [1.9, 2.4], d: [1.3, 1.55], rise: [0.8, 1.0], gap: [0.55, 1.35], off: 0.0, tag: 'stone' },
  scaffold: { kind: 'plank', w: [1.6, 2.0], d: [1.4, 1.6], rise: [0.65, 0.9], gap: [0.4, 1.15], off: 0.02, tag: 'wood' },
  // gentle styles for islands near home
  steps: { kind: 'block', w: [0.95, 1.1], d: [2.3, 2.6], rise: [0.27, 0.32], gap: [0.02, 0.05], off: 0.3, tag: 'stone', joined: true, carved: true },
  terracesWide: { kind: 'block', w: [2.4, 2.8], d: [2.4, 2.8], rise: [0.5, 0.66], gap: [0.35, 0.8], off: 0.35, tag: 'grass' },
  ruinsWide: { kind: 'column', w: [2.2, 2.6], d: [2.2, 2.6], rise: [0.5, 0.66], gap: [0.5, 0.85], off: 0.45, tag: 'stone' },
  ledgesRail: { kind: 'ledge', w: [2.6, 3.0], d: [2.1, 2.4], rise: [0.5, 0.64], gap: [0.45, 0.85], off: 0.0, tag: 'stone' },
  // rocky islands: narrow shelves on a sheer face, freestanding sea stacks a
  // step out from the wall, and long rock arches that each rise a little
  sheer: { kind: 'ledge', w: [1.5, 1.9], d: [1.2, 1.32], rise: [0.85, 1.05], gap: [0.5, 1.2], off: 0.0, tag: 'stone', sheer: true },
  stacks: { kind: 'stack', r: [0.85, 1.05], rise: [0.6, 0.9], gap: [0.8, 1.45], off: 0.9, tag: 'stone' },
  arches: { kind: 'arch', w: [3.4, 4.2], d: [1.3, 1.55], rise: [0.7, 0.95], gap: [0.7, 1.3], off: 0.25, tag: 'stone' },
  // tropical islands: palm crowns a step out from the wall, tide pools stepping
  // up the rock like terraces (a wide kind near home), and rope bridges hung
  // along the face with a handrope on the open side
  palms: { kind: 'palm', r: [0.98, 1.12], rise: [0.7, 0.95], gap: [0.9, 1.5], off: 0.55, tag: 'leaf' },
  pools: { kind: 'pool', w: [1.8, 2.2], d: [1.8, 2.2], rise: [0.6, 0.85], gap: [0.3, 1.0], off: 0.35, tag: 'stone' },
  poolsWide: { kind: 'pool', w: [2.4, 2.8], d: [2.4, 2.8], rise: [0.5, 0.66], gap: [0.35, 0.8], off: 0.35, tag: 'stone' },
  ropes: { kind: 'rope', w: [3.2, 4.0], d: [1.25, 1.4], rise: [0.65, 0.9], gap: [0.6, 1.25], off: 0.12, tag: 'wood', rope: true },
};
// Kinds whose top is a disc (r) rather than a rectangle (w × d).
const ROUND = new Set(['disc', 'stack', 'palm']);
// Kinds that are solid down to the ground (steps you stand on top of).
const SOLID = new Set(['block', 'column', 'pool']);
export const ARCH_LEG = 0.42; // half-width of an arch's legs along the span
export const PALM_TRUNK = 0.3; // radius of a palm-top's trunk
export const MODULE_TYPES = ['moat:stones', 'moat:log', 'moat:planks', 'moat:bridge', 'moat:stacks', 'moat:pools', 'moat:ropeBridge',
  ...Object.keys(STAIRS).map((k) => 'stair:' + k), 'vista', 'summit', 'branch:lookoutTree', 'branch:lookoutSpire', 'branch:lookoutPalm', 'branch:summitNook', 'arch'];
// Per-biome module pools, and what the chest branch is (a lookout tree, on
// bare rock a spire with ledges round it, in the tropics a giant palm).
const POOLS = {
  temperate: {
    // stone stairs are listed twice: gentle islands are mostly a walk with a few hops
    easy: { moat: ['bridge'], cliff: ['steps', 'steps', 'terracesWide', 'ruinsWide'], mesa: ['steps', 'ledgesRail', 'steps', 'terracesWide'] },
    medium: { moat: ['stones', 'log', 'planks'], cliff: ['terraces', 'ruins', 'trees', 'ledges'], mesa: ['ledges', 'ruins', 'trees', 'scaffold'] },
    hard: { moat: ['stones', 'planks'], cliff: ['ruins', 'trees', 'ledges'], mesa: ['ledges', 'trees', 'scaffold', 'ruins'] },
  },
  rocky: {
    spire: true, meadowArch: true,
    easy: { moat: ['bridge'], cliff: ['steps', 'steps', 'ledgesRail'], mesa: ['steps', 'ledgesRail', 'steps'] },
    medium: { moat: ['stacks', 'stacks', 'stones'], cliff: ['stacks', 'arches', 'ledges', 'sheer'], mesa: ['sheer', 'arches', 'stacks', 'scaffold'] },
    hard: { moat: ['stacks'], cliff: ['sheer', 'stacks', 'arches'], mesa: ['sheer', 'stacks', 'arches', 'scaffold'] },
  },
  tropical: {
    palm: true,
    easy: { moat: ['ropeBridge'], cliff: ['steps', 'poolsWide', 'poolsWide', 'terracesWide'], mesa: ['steps', 'poolsWide', 'ledgesRail', 'steps'] },
    medium: { moat: ['pools', 'pools', 'planks'], cliff: ['pools', 'palms', 'ropes', 'terraces'], mesa: ['palms', 'ropes', 'pools', 'ledges'] },
    hard: { moat: ['pools', 'planks'], cliff: ['palms', 'ropes', 'pools'], mesa: ['palms', 'ropes', 'ledges', 'pools'] },
  },
};

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const rr = (rng, [a, b], t = rng()) => a + (b - a) * t;

/**
 * Pieces climbing a wall (cliff or mesa) along its ring: from yFrom (ground)
 * to yTo - 0.6, so the last hop onto the rim is ≤ 0.95 up. If `prevHalf` is
 * given, the first piece keeps a proper gap from whatever ends at aStart.
 */
function stair(T, { Rw, aStart, dir, yFrom, yTo, style, rng, diff, route, groundAt, prevHalf = 0, lim = LIMITS.main, restEvery = 0, rails = false, wallTop = yTo }) {
  const S = STAIRS[style];
  const pieces = [];
  const total = Math.max(0.3, yTo - 0.6 - yFrom);
  const riseAvg = Math.min(lim.up - 0.04, rr(rng, S.rise, 0.4 + diff * 0.4));
  const n = Math.max(1, Math.ceil(total / riseAvg));
  const step = total / n;
  // the rising pieces, with a flat landing after every few hops on gentle islands
  const slots = [];
  for (let i = 0; i < n; i++) {
    slots.push({ top: yFrom + step * (i + 1) + (i < n - 1 && !S.joined ? (rng() - 0.5) * 0.08 : 0) });
    if (restEvery && !S.joined && (i + 1) % restEvery === 0 && i < n - 1) slots.push({ top: slots[slots.length - 1].top, landing: true });
  }
  let a = aStart, half0 = prevHalf;
  const specs = [];
  for (const slot of slots) {
    const top = slot.top;
    const half = ROUND.has(S.kind) ? rr(rng, S.r) : slot.landing ? Math.max(1.5, rr(rng, S.w) / 2 * 1.3) : rr(rng, S.w) / 2;
    const depth = ROUND.has(S.kind) ? half * 2 : rr(rng, S.d);
    // a long straight deck (a rope bridge) stands off the wall's furthest
    // point along its length, so a bulge in the rock can't cut into it
    const wallAt = S.rope ? (ang) => Math.max(...[-1, -0.5, 0, 0.5, 1].map((k) => Rw(ang + (k * half) / Rw(ang)))) : Rw;
    const radial = (ang) => wallAt(ang) + S.off + depth / 2;
    if (half0 > 0) {
      // a landing butts straight onto the piece before it (a walk, not a jump)
      let gap = slot.landing ? 0.04 : Math.min(lim.gap - 0.12, rr(rng, S.gap, clamp(0.25 + diff * 0.6 + (rng() - 0.5) * 0.5, 0, 1)));
      // wide pieces on a tight curve: open the gap enough that inner corners don't meet
      if (!slot.landing && !S.joined && !ROUND.has(S.kind)) gap = Math.min(lim.gap - 0.12, Math.max(gap, (depth * (half0 + gap + half)) / (2 * radial(a)) + 0.12));
      a = stepAlong(radial, a, dir, half0 + gap + half);
    }
    const R = radial(a);
    specs.push({ a, cx: Math.cos(a) * R, cz: Math.sin(a) * R, top, half, depth, landing: !!slot.landing });
    half0 = half;
  }
  // rectangles face along the line through their neighbours (the ring may bend)
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const base = groundAt(sp.cx, sp.cz);
    const extra = { tag: S.tag, base: Number.isFinite(base) ? base : -2, route, style, angle: sp.a, wallTop,
      joined: !!S.joined || sp.landing || !!specs[i + 1]?.landing, landing: sp.landing, rail: (rails && !ROUND.has(S.kind)) || !!S.rope, carved: !!S.carved };
    if (ROUND.has(S.kind)) { pieces.push(discPiece(S.kind, sp.cx, sp.cz, sp.top, sp.half, S.kind === 'disc' ? { ...extra, trunk: 0.42 } : extra)); continue; }
    let rot = rotOf(sp.a);
    if (specs.length > 1) {
      const A = specs[Math.max(0, i - 1)], B = specs[Math.min(specs.length - 1, i + 1)];
      const dx = (B.cx - A.cx) * dir, dz = (B.cz - A.cz) * dir;
      // keep local x along travel and local +z towards the wall (inward)
      const t = Math.atan2(dz, dx);
      rot = -t;
      const [zx, zz] = toWorld(0, 1, rot);
      if (zx * sp.cx + zz * sp.cz > 0) rot = -t + Math.PI;
    }
    const p = rectPiece(S.kind, sp.cx, sp.cz, sp.top, sp.half, sp.depth / 2, rot, extra);
    if (S.joined) p.minWidth = sp.depth; // walked up, so it's as wide as it is deep
    pieces.push(p);
  }
  return { pieces, aEnd: a, lastHalf: half0 };
}

/** A wide resting pad against a wall, `gap` along the ring after a piece of half-length `prevHalf`. */
function vistaAfter(T, { Rw, a, dir, prevHalf, top, route, gap = 0.9, wide = false }) {
  const hx = wide ? 1.7 : 1.4, hz = wide ? 1.4 : 1.3, R = Rw(a) + hz;
  const a2 = stepAlong((ang) => Rw(ang) + hz, a, dir, prevHalf + gap + hx);
  const R2 = Rw(a2) + hz;
  void R;
  return rectPiece('vista', Math.cos(a2) * R2, Math.sin(a2) * R2, top, hx, hz, rotOf(a2), { tag: 'stone', base: -2, route, angle: a2 });
}

/**
 * The angle after `a` (going `dir`) whose point on the curve r = rf(angle) is
 * exactly `dist` away in a straight line. Bisection, since the radius wobbles.
 */
function stepAlong(rf, a, dir, dist) {
  const p0x = Math.cos(a) * rf(a), p0z = Math.sin(a) * rf(a);
  const d = (da) => { const b = a + dir * da, r = rf(b); return Math.hypot(Math.cos(b) * r - p0x, Math.sin(b) * r - p0z); };
  let lo = 0, hi = Math.min(Math.PI / 2, (dist / Math.max(1, rf(a))) * 3);
  while (d(hi) < dist && hi < Math.PI) hi *= 1.5;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (d(mid) < dist) lo = mid; else hi = mid; }
  return a + dir * (lo + hi) / 2;
}

/**
 * Where you walk up to the first piece of a climb: the nearest clear spot
 * behind it (along the ring, away from the wall) that's within 1.2 m of it,
 * reached by a clear straight line from the ring path (`via`).
 */
function approachPoint(T, p0, dir, wallF, ringF, colliders, maxGap = 1.2) {
  const plans = colliders.map(colliderPlan);
  const rb = Math.hypot(p0.cx, p0.cz);
  const clearAt = (x, z) => {
    const h = T.groundAt(x, z);
    return Number.isFinite(h) && !plans.some((pl) => pl.y0 < h + 0.4 && pl.y1 > h + ASHORE.stepUp + 0.05 && insidePoly(pl.foot, x, z));
  };
  const clearLine = (x0, z0, x1, z1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3);
    for (let i = 0; i <= n; i++) if (!clearAt(x0 + (x1 - x0) * (i / n), z0 + (z1 - z0) * (i / n))) return false;
    return true;
  };
  const node = { type: 'piece', piece: p0, x: p0.cx, z: p0.cz };
  let fallback = null;
  for (let d = 0.2; d < 4; d += 0.1) {
    const half = p0.r || p0.hx;
    const ab = p0.angle - dir * (half + d) / rb;
    for (const rr2 of [rb, Math.max(rb, wallF(ab) + 1.0), rb + 0.6]) {
      if (rr2 < wallF(ab) + 0.9) continue; // stay off the foot of the rock face
      const back = { x: Math.cos(ab) * rr2, z: Math.sin(ab) * rr2 };
      const via = T.at(ringF(ab), ab);
      if (!clearAt(back.x, back.z) || !clearLine(via.x, via.z, back.x, back.z)) continue;
      const gap = lineGap({ type: 'ground', x: back.x, z: back.z }, node);
      if (gap <= maxGap && p0.top - T.groundAt(back.x, back.z) <= maxGap * 0.82) return { back, via };
      fallback ||= { back, via };
    }
  }
  return fallback || { back: T.at(ringF(p0.angle), p0.angle), via: T.at(ringF(p0.angle), p0.angle) };
}

/** Where you land on the wall top from a piece: straight in from its inner edge. */
function rimFor(T, p, Rf) {
  const pts = [...p.foot].sort((u, v) => Math.hypot(u[0], u[1]) - Math.hypot(v[0], v[1]));
  const mx = (pts[0][0] + pts[1][0]) / 2, mz = (pts[0][1] + pts[1][1]) / 2;
  const a = Math.atan2(mz, mx);
  return T.at(Rf(a) - 0.3, a);
}

function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Move `style` off the front of the list (swap it with the next other style).
 * Arches can't start a climb: the leg at the near end takes the spot you'd
 * walk up to, so the hop on from the ground comes out too long.
 */
function notFirst(list, style) {
  const k = list.findIndex((s) => s !== style);
  if (list[0] === style && k > 0) [list[0], list[k]] = [list[k], list[0]];
  return list;
}

// ------------------------------------------------------------------- layout
/**
 * Build the whole level layout for an island. Deterministic from I.seed.
 * opts: { landingAngle (atan2(z, x) towards where the ship is anchored) }
 * Each layout is validated; a rare failure (tight little islands) is re-rolled
 * with the next attempt number, so the result is still reproducible.
 */
export function layoutLevel(I, opts = {}) {
  let L = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    L = layoutOnce(I, opts, attempt);
    const v = validateLayout(L);
    L.attempt = attempt;
    L.validation = v;
    if (v.ok) return L;
  }
  return L;
}

function layoutOnce(I, opts, attempt) {
  _pid = 0;
  const rng = mulberry32((((I.seed | 0) * 2654435761) ^ 0x5eed1e ^ (attempt * 0x9e3779b1)) >>> 0);
  const size = clamp(((I.r || 100) - 45) / 210, 0, 1);
  const { tier, diff } = difficultyFor(I, opts);
  const cfg = TIERS[tier];
  const lim = tier === 'easy' ? LIMITS.easy : LIMITS.main;
  const biome = POOLS[I.biome] ? I.biome : 'temperate';
  const pool = POOLS[biome][tier], kit = POOLS[biome];
  const T = makeTerrain(I, rng, size, diff, cfg, SHAPE[biome] || SHAPE.temperate);
  const stairOpts = { lim, restEvery: cfg.restEvery };
  const { groundAt } = T;
  const dir = rng() < 0.5 ? 1 : -1;
  const a0 = Number.isFinite(opts.landingAngle) ? opts.landingAngle : rng() * TAU;

  const pieces = [], colliders = [], route = [], branches = [], walks = [], modules = [];
  const coins = [], caches = [], chests = [], checkpoints = [], keepOut = [];
  const groundNode = (x, z, edge = 'walk', extra = {}) => ({ type: 'ground', x, z, y: groundAt(x, z), edge, ...extra });
  const pieceNode = (p, edge = 'jump') => ({ type: 'piece', piece: p, x: p.cx, z: p.cz, y: p.top, edge });
  const addPieces = (list) => { for (const p of list) { pieces.push(p); colliders.push(...piecesColliders(p)); keepOut.push([p.cx, p.cz, (p.r || Math.max(p.hx, p.hz)) + 1.6]); } };
  const coinAt = (x, y, z, value) => coins.push({ id: '', x, y, z, value });
  const arc = (rf, aFrom, aTo, stepM = 2) => {
    const pts = [], r = rf(aFrom);
    const n = Math.max(1, Math.ceil(Math.abs(aTo - aFrom) * r / stepM));
    for (let i = 0; i <= n; i++) { const a = lerp(aFrom, aTo, i / n); const p = T.at(rf(a), a); pts.push([p.x, p.z]); }
    return pts;
  };
  const lastWalkPoint = () => walks[walks.length - 1].slice(-1)[0];
  const arches = [];
  /**
   * A natural rock arch standing over a walked path, its legs either side.
   * Drawn with the `arch` prop (props.js: boulders round a half-ellipse 6 wide
   * and 7 tall at scale 1); each boulder gets a rough cylinder collider.
   */
  const meadowArch = (path) => {
    const s = 0.55, half = 6 * s, br = 2.1 * s * 0.8;
    if (path.length < 7) return; // too short a walk to frame
    // clear of every stretch of the walk, not just the one it stands over
    const offPath = (p) => path.every(([ax, az], k) => {
      if (!k) return true;
      const [bx, bz] = path[k - 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((p.x - ax) * dx + (p.z - az) * dz) / l2, 0, 1);
      return Math.hypot(p.x - ax - dx * t, p.z - az - dz * t) > half - 0.4;
    });
    for (const f of [0.5, 0.4, 0.6, 0.32, 0.68]) {
      // middle points only: the walk's first and last stretches turn sharply
      const i = Math.max(2, Math.min(path.length - 3, Math.round((path.length - 1) * f)));
      const [x, z] = path[i], [x0, z0] = path[i - 1], [x1, z1] = path[i + 1];
      const tl = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / tl, nz = (x1 - x0) / tl; // across the path
      const g = groundAt(x, z);
      const legs = [-1, 1].map((k) => ({ x: x + nx * half * k, z: z + nz * half * k }));
      const bad = (p) => !(groundAt(p.x, p.z) > 0.8) || Math.abs(groundAt(p.x, p.z) - g) > 0.8 || !offPath(p)
        || keepOut.some(([kx, kz, kr]) => Math.hypot(kx - p.x, kz - p.z) < kr + 1.4);
      if (!Number.isFinite(g) || legs.some(bad)) continue;
      const rot = -Math.atan2(nz, nx), y = g - 0.4; // local x runs across the path
      arches.push({ x, z, y, rot, s });
      for (let b = 0; b <= 9; b++) {
        const a = (b / 9) * Math.PI, by = y + Math.sin(a) * 7 * s;
        const [wx, wz] = toWorld(Math.cos(a) * half, 0, rot);
        colliders.push(cyl(x + wx, z + wz, br, by - br, by + br, 'stone'));
      }
      for (const p of legs) keepOut.push([p.x, p.z, 2.2]);
      modules.push({ type: 'arch' });
      return;
    }
  };
  const cp = (x, y, z, extra = {}) => { checkpoints.push({ id: 'cp' + checkpoints.length, x, y, z, ...extra }); keepOut.push([x, z, 2]); };

  // ---- walls: invisible vertical faces at each cliff foot, so nobody climbs
  // the rock whatever the controller does with steep ground.
  const wallRing = (Rf, yTop) => {
    const segs = Math.max(24, Math.round((TAU * Rf(0)) / 2.5));
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU, r = Rf(a) - 0.3;
      const half = (TAU * r) / segs / 2 + 0.3;
      colliders.push(obox(Math.cos(a) * r, yTop / 2 - 0.5, Math.sin(a) * r, half, yTop / 2 + 0.5, 0.3, rotOf(a), 'stone'));
    }
  };
  wallRing(T.R1, T.h1);
  wallRing(T.R2, T.summit);

  // ---- spawn and the rowboat
  const boatP = T.at(T.Rs(a0) - 0.9, a0);
  const spawnP = T.at(T.Rs(a0) - 4.2, a0 + dir * 2.2 / T.Rs(a0));
  const rowboat = { x: boatP.x, z: boatP.z, y: Math.max(0, groundAt(boatP.x, boatP.z)), rot: -a0 };
  colliders.push(obox(rowboat.x, rowboat.y + 0.2, rowboat.z, 1.7, 0.25, 0.7, rowboat.rot, 'wood'));
  const spawn = { x: spawnP.x, y: groundAt(spawnP.x, spawnP.z), z: spawnP.z, yaw: Math.atan2(-spawnP.x, -spawnP.z) };
  const exit = { x: rowboat.x, y: rowboat.y, z: rowboat.z, r: 2.8 };
  keepOut.push([rowboat.x, rowboat.z, 5], [spawn.x, spawn.z, 3]);
  route.push(groundNode(spawn.x, spawn.z));

  // ---- module 1: across the moat
  const am = a0 + dir * 0.06;
  {
    const sOut = T.moatEdge(am, true), sIn = T.moatEdge(am, false);
    const po = T.at(sOut + 0.5, am), pi = T.at(sIn - 0.5, am);
    walks.push([[spawn.x, spawn.z], [po.x, po.z]]);
    route.push(groundNode(po.x, po.z));
    const span = Math.hypot(po.x - pi.x, po.z - pi.z);
    const ux = (pi.x - po.x) / span, uz = (pi.z - po.z) / span; // inland
    const rot = -Math.atan2(uz, ux);
    let style = pick(rng, pool.moat);
    if (style === 'log' && span > 12) style = 'planks';
    const list = [];
    if (style === 'bridge' || style === 'ropeBridge') {
      // a railed footbridge (in the tropics a rope bridge) from bank to bank: walk on, walk off, no jumping
      const endAt = (from, to) => { // first point (walking from `from` towards `to`) where the bank is ~0.55 high
        const L = Math.hypot(to.x - from.x, to.z - from.z);
        for (let t = 0; t <= L; t += 0.1) { const x = from.x + (to.x - from.x) * (t / L), z = from.z + (to.z - from.z) * (t / L); if (T.groundAt(x, z) <= 0.55) return { x, z }; }
        return from;
      };
      const far = T.at(T.moatOut(am) + 2, am), near = T.at(T.moatIn(am) - 2, am);
      const eo = endAt(far, near), ei = endAt(near, far);
      const Lb = Math.hypot(ei.x - eo.x, ei.z - eo.z);
      const p = rectPiece('bridge', (eo.x + ei.x) / 2, (eo.z + ei.z) / 2, 0.85, Lb / 2 + 0.35, 1.15, rot, { tag: 'wood', base: -2.4, route: 'main', style, posts: true, rails2: true });
      list.push(p);
      po.x = eo.x - ux * 0.05; po.z = eo.z - uz * 0.05; pi.x = ei.x + ux * 0.05; pi.z = ei.z + uz * 0.05;
      walks[walks.length - 1][1] = [po.x, po.z];
      route[route.length - 1] = groundNode(po.x, po.z);
    } else if (style === 'log') {
      // lying in the water just short of each bank, so you step up onto it
      list.push(rectPiece('log', (po.x + pi.x) / 2, (po.z + pi.z) / 2, 0.7, span / 2 - 0.25, 0.65, rot, { tag: 'wood', base: -2, route: 'main', style }));
    } else if (style === 'planks') {
      const half = 0.75, n = Math.max(1, Math.round((span + 0.6) / (1.5 + 0.7 + diff * 0.4)));
      const g = (span - n * 2 * half) / (n + 1);
      for (let i = 0; i < n; i++) {
        const t = g * (i + 1) + half * (2 * i + 1);
        list.push(rectPiece('plank', po.x + ux * t, po.z + uz * t, 0.65, half, half, rot, { tag: 'wood', base: -2.4, route: 'main', style, posts: true }));
      }
    } else if (style === 'stacks') {
      // sea stacks standing in the channel, their tops stepping up and down
      const r = 0.88 + rng() * 0.1, n = Math.max(1, Math.round((span + 0.4) / (2 * r + 1.1 + diff * 0.4)));
      const g = (span - n * 2 * r) / (n + 1);
      let top = 0.75 + rng() * 0.25;
      for (let i = 0; i < n; i++) {
        const t = g * (i + 1) + r * (2 * i + 1);
        const j = (rng() - 0.5) * 0.6;
        list.push(discPiece('stack', po.x + ux * t - uz * j, po.z + uz * t + ux * j, top, r, { tag: 'stone', base: -2.4, route: 'main', style }));
        top = clamp(top + (rng() < 0.55 ? 1 : -1) * (0.3 + rng() * 0.35), 0.7, 1.7);
      }
    } else if (style === 'pools') {
      // rock rims standing in the channel, each holding a tide pool
      const r = 0.9 + rng() * 0.08, n = Math.max(1, Math.round((span + 0.4) / (2 * r + 1.0 + diff * 0.4)));
      const g = (span - n * 2 * r) / (n + 1);
      for (let i = 0; i < n; i++) {
        const t = g * (i + 1) + r * (2 * i + 1);
        const j = (rng() - 0.5) * 0.5;
        list.push(discPiece('stone', po.x + ux * t - uz * j, po.z + uz * t + ux * j, 0.45 + rng() * 0.2, r, { tag: 'stone', base: -2.4, route: 'main', style }));
      }
    } else {
      const r = 0.8, n = Math.max(1, Math.round((span + 0.4) / (2 * r + 1.0 + diff * 0.4)));
      const g = (span - n * 2 * r) / (n + 1);
      for (let i = 0; i < n; i++) {
        const t = g * (i + 1) + r * (2 * i + 1);
        const j = (rng() - 0.5) * 0.5;
        list.push(discPiece('stone', po.x + ux * t - uz * j, po.z + uz * t + ux * j, 0.4 + rng() * 0.18, r, { tag: 'stone', base: -2.4, route: 'main', style }));
      }
    }
    addPieces(list);
    for (const p of list) { route.push(pieceNode(p)); coinAt(p.cx, p.top, p.cz, 1); }
    route.push(groundNode(pi.x, pi.z, 'jump'));
    modules.push({ type: 'moat:' + style, pieces: list.length });
    walks.push([[pi.x, pi.z]]);
    keepOut.push([(po.x + pi.x) / 2, (po.z + pi.z) / 2, span / 2 + 2.5]);
    const c = T.at(sIn - 2.4, am + dir * 1.8 / sIn);
    cp(c.x, groundAt(c.x, c.z), c.z);
  }

  // ---- module(s) 2: up cliff 1
  const cliffStyles = notFirst(shuffle(rng, pool.cliff), 'arches');
  const c1Parts = cfg.cliffParts(size, rng);
  const aS1 = a0 + dir * rr(rng, cfg.meadowArc);
  {
    const path = [lastWalkPoint(), ...arc(T.meadowR, am, aS1 - dir * 0.06)];
    walks[walks.length - 1] = path;
    path.forEach(([x, z], i) => { if (i > 0 && i % 2 === 0) coinAt(x, groundAt(x, z), z, 1); });
    if (kit.meadowArch) meadowArch(path);
  }
  let aNow = aS1, yNow = 0, lastHalf = 0;
  for (let k = 0; k < c1Parts; k++) {
    const style = cliffStyles[k % cliffStyles.length];
    if (k === 0) {
      // ground just outside the wall where the climb begins (lowest nearby point)
      const g = [-0.6, 0, 0.6].map((d) => { const a = aNow - dir * d / T.R1(aNow); const p = T.at(T.R1(a) + 1.6, a); return groundAt(p.x, p.z); });
      yNow = Math.min(...g);
    }
    const yTo = k === c1Parts - 1 ? T.h1 : yNow + (T.h1 - yNow) * 0.5 + 0.6;
    const { pieces: list, aEnd, lastHalf: lh } = stair(T, { Rw: T.R1, aStart: aNow, dir, yFrom: yNow, yTo, style, rng, diff, route: 'main', groundAt, prevHalf: lastHalf, ...stairOpts, rails: false, wallTop: T.h1 });
    if (k === 0) {
      const { back, via } = approachPoint(T, list[0], dir, T.R1, T.meadowR, [...colliders, ...list.flatMap(piecesColliders)], cfg.approachGap);
      walks[walks.length - 1].push([via.x, via.z], [back.x, back.z]);
      route.push(groundNode(back.x, back.z));
    }
    addPieces(list);
    list.forEach((p, i) => { route.push(pieceNode(p)); if (i % 2 === 1) coinAt(p.cx, p.top, p.cz, 2); });
    modules.push({ type: 'stair:' + style, wall: 'cliff', pieces: list.length });
    aNow = aEnd; yNow = list[list.length - 1].top; lastHalf = lh;
    if (k < c1Parts - 1) {
      const v = vistaAfter(T, { Rw: T.R1, a: aNow, dir, prevHalf: lastHalf, top: yNow + (tier === 'easy' ? 0 : 0.2), route: 'main', gap: tier === 'easy' ? 0.04 : 0.9, wide: tier === 'easy' });
      if (tier === 'easy') { v.joined = true; list[list.length - 1].joined = true; }
      addPieces([v]);
      route.push(pieceNode(v));
      modules.push({ type: 'vista' });
      aNow = v.angle; yNow = v.top; lastHalf = v.hx;
    }
  }
  // onto the terrace (landing on the ground just past the rim)
  const aRim = aNow;
  // you land on the top of the rock face (the wall's top is solid), then walk on
  const rimEdge = rimFor(T, pieces[pieces.length - 1], T.R1);
  route.push({ type: 'ground', x: rimEdge.x, z: rimEdge.z, y: T.h1, edge: 'jump', rim: true });
  const rimP = T.at(T.R1(aRim) - T.W1 - 0.35, aRim);
  { const a = aRim + dir * 1.6 / T.R1(aRim); const c = T.at(T.R1(a) - T.W1 - 2.4, a); cp(c.x, groundAt(c.x, c.z), c.z); }

  // ---- terrace walk, then module(s) 3: up the mesa
  const aM = aRim + dir * rr(rng, cfg.terraceArc);
  const mParts = clamp(cfg.mesaParts(size, rng), 1, 4);
  {
    const path = [[rimP.x, rimP.z], ...arc(T.terraceR, aRim, aM)];
    walks.push(path);
    path.forEach(([x, z], i) => { if (i > 0 && i % 2 === 1) coinAt(x, groundAt(x, z), z, 1); });
  }
  {
    const g = [-0.6, 0, 0.6].map((d) => { const a = aM - dir * d / T.R2(aM); const p = T.at(T.R2(a) + 1.8, a); return groundAt(p.x, p.z); });
    yNow = Math.min(...g);
  }
  aNow = aM; lastHalf = 0;
  const mesaStyles = notFirst(shuffle(rng, pool.mesa), 'arches');
  const yGain = T.summit - yNow;
  let midCp = false;
  for (let k = 0; k < mParts; k++) {
    const style = mesaStyles[k % mesaStyles.length];
    const yTo = k === mParts - 1 ? T.summit : yNow + yGain / mParts + 0.6;
    const { pieces: list, aEnd, lastHalf: lh } = stair(T, { Rw: T.R2, aStart: aNow, dir, yFrom: yNow, yTo, style, rng, diff, route: 'main', groundAt, prevHalf: lastHalf, ...stairOpts, rails: cfg.rails, wallTop: T.summit });
    if (k === 0) {
      const { back, via } = approachPoint(T, list[0], dir, T.R2, T.terraceR, [...colliders, ...list.flatMap(piecesColliders)], cfg.approachGap);
      walks[walks.length - 1].push([via.x, via.z], [back.x, back.z]);
      route.push(groundNode(back.x, back.z));
    }
    addPieces(list);
    list.forEach((p, i) => { route.push(pieceNode(p)); if (i % 2 === 0) coinAt(p.cx, p.top, p.cz, k > 1 ? 3 : 2); });
    modules.push({ type: 'stair:' + style, wall: 'mesa', pieces: list.length });
    aNow = aEnd; yNow = list[list.length - 1].top; lastHalf = lh;
    if (k < mParts - 1) {
      const v = vistaAfter(T, { Rw: T.R2, a: aNow, dir, prevHalf: lastHalf, top: yNow + (tier === 'easy' ? 0 : 0.25), route: 'main', gap: tier === 'easy' ? 0.04 : 0.9, wide: tier === 'easy' });
      if (tier === 'easy') { v.joined = true; v.rail = cfg.rails; list[list.length - 1].joined = true; }
      addPieces([v]);
      route.push(pieceNode(v));
      modules.push({ type: 'vista' });
      if (!midCp && k >= Math.floor((mParts - 1) / 2)) { midCp = true; cp(v.cx, v.top, v.cz, { onPiece: v.id }); }
      aNow = v.angle; yNow = v.top; lastHalf = v.hx;
    }
  }
  // onto the summit
  const aTop = aNow;
  const topEdge = rimFor(T, pieces.filter((p) => p.route === 'main').slice(-1)[0], T.R2);
  route.push({ type: 'ground', x: topEdge.x, z: topEdge.z, y: T.summit, edge: 'jump', rim: true });
  const topRim = T.at(T.R2(aTop) - T.W2 - 0.35, aTop);
  const summit = { x: 0, y: groundAt(0, 0), z: 0 };
  modules.push({ type: 'summit' });
  caches.push({ id: 'g0', x: summit.x, y: summit.y, z: summit.z, value: Math.round(40 + diff * 30 + size * 10 + rng() * 10) });
  { const c = T.at(Math.min(3.2, T.R2(aTop) * 0.4), aTop); cp(c.x, groundAt(c.x, c.z), c.z); }
  for (let i = 0; i < 4; i++) { const a = aTop + (i / 4) * TAU + 0.4; const p = T.at(T.R2(a) * 0.5, a); coinAt(p.x, groundAt(p.x, p.z), p.z, 2); }
  walks.push([[topRim.x, topRim.z], [summit.x + 0.01, summit.z]]);
  keepOut.push([0, 0, 2.5]);
  // the vault: where a quest item waits (retrieve quests, anchor refits), across
  // the summit from where you arrive, between two of the summit coins
  const aV = aTop + 0.4 + Math.PI * 0.75;
  const vp = T.at(Math.min(2.2, T.R2(aV) * 0.35), aV);
  const vault = { x: vp.x, y: groundAt(vp.x, vp.z), z: vp.z };
  keepOut.push([vault.x, vault.z, 1.6]);

  // ---- optional branches go in the widest free arc around the mesa
  const used = [aRim, aM, ...arc(() => 1, aRim, aM, 0.05).map(([x, z]) => Math.atan2(z, x)),
    ...pieces.filter((p) => p.route === 'main' && Math.hypot(p.cx, p.cz) < T.R2(Math.atan2(p.cz, p.cx)) + 4).map((p) => Math.atan2(p.cz, p.cx))];
  const free = largestGap(used);

  // Branch A: a lookout tree on the terrace, the cosmetic chest on its crown
  for (let t = 0; t < 27; t++) {
    const k = t % 9, band = Math.floor(t / 9);
    const a = free.mid - free.width * 0.18 + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1 * free.width : 0);
    const c = T.at(T.terraceR(a) + [0, 1.4, -1.4][band], a);
    const TC = cfg.tree, orbit = TC.orbit;
    if (!pieces.every((p) => Math.hypot(p.cx - c.x, p.cz - c.z) > orbit + cfg.tree.top + 0.6 + (p.r || Math.max(p.hx, p.hz)))) continue;
    const g0 = groundAt(c.x, c.z);
    const n = TC.n(size);
    const list = [];
    let phi = a + Math.PI, y = g0;
    for (let i = 0; i < n; i++) {
      y += i === 0 ? TC.first : Math.min(rr(rng, TC.rise), LIMITS.optional.up - 0.08);
      const r = i === n - 1 ? TC.top : TC.r;
      list.push(discPiece('disc', c.x + Math.cos(phi) * orbit, c.z + Math.sin(phi) * orbit, y, r, { tag: kit.spire ? 'stone' : 'leaf', base: g0, route: 'chest', trunk: 0, branch: true, hub: [c.x, c.z], palm: !!kit.palm }));
      phi += TC.dphi * dir;
    }
    const trunkTop = y + 1.4;
    addPieces(list);
    colliders.push(kit.spire ? cyl(c.x, c.z, 1.15, g0 - 0.5, trunkTop, 'stone') : cyl(c.x, c.z, 0.85, g0 - 0.5, trunkTop, 'wood'));
    keepOut.push([c.x, c.z, orbit + 3]);
    const f = list[0];
    const sx = f.cx + ((f.cx - c.x) / orbit) * 1.6, sz = f.cz + ((f.cz - c.z) / orbit) * 1.6;
    const nodes = [groundNode(sx, sz), ...list.map((p) => pieceNode(p))];
    branches.push({ name: 'chest', nodes, tree: { x: c.x, z: c.z, base: g0, top: trunkTop, orbit, spire: !!kit.spire, palm: !!kit.palm } });
    const top = list[list.length - 1];
    chests.push({ id: 'chest', x: top.cx, y: top.top, z: top.cz, yaw: Math.atan2(c.x - top.cx, c.z - top.cz) });
    list.forEach((p, i) => { if (i % 2 === 1 && i < n - 1) coinAt(p.cx, p.top, p.cz, 3); });
    modules.push({ type: kit.spire ? 'branch:lookoutSpire' : kit.palm ? 'branch:lookoutPalm' : 'branch:lookoutTree', pieces: list.length });
    break;
  }

  // Branch B: a secret nook on the mesa face, a drop below the summit's edge
  for (const off of [0.22, 0.34, 0.1, -0.05, 0.42]) {
    const a = free.mid + free.width * off;
    const yN = T.summit - (3.6 + rng() * 1.2);
    const Rn = T.R2(a) + 0.95;
    const nook = rectPiece('ledge', Math.cos(a) * Rn, Math.sin(a) * Rn, yN, 1.25, 0.95, rotOf(a), { tag: 'stone', base: -2, route: 'secret', branch: true, angle: a });
    const clash = pieces.some((p) => Math.hypot(p.cx - nook.cx, p.cz - nook.cz) < 2.5 + (p.r || Math.max(p.hx, p.hz)) && Math.abs(p.top - nook.top) < 4);
    if (!clash) {
      addPieces([nook]);
      const rim = T.at(T.R2(a) - 0.3, a);
      branches.push({ name: 'secret', nodes: [{ type: 'ground', x: rim.x, z: rim.z, y: T.summit, edge: 'walk', rim: true }, pieceNode(nook)] });
      caches.push({ id: 'g1', x: nook.cx, y: nook.top, z: nook.cz, value: Math.round(20 + rng() * 25 + diff * 15) });
      for (let i = 1; i <= 2; i++) { const p = T.at(T.R2(a) - T.W2 - 0.6 - i * 1.3, a); coinAt(p.x, groundAt(p.x, p.z), p.z, 1); }
      modules.push({ type: 'branch:summitNook' });
      break;
    }
  }

  // ---- coin count into 25..50 (drop evenly; top up with a meadow ring)
  while (coins.length > 50) coins.splice(Math.floor(rng() * coins.length), 1);
  for (let i = 0; coins.length < 25 && i < 80; i++) {
    const a = aS1 + dir * (0.25 + i * 0.09); const p = T.at(T.meadowR(a), a);
    if (keepOut.some(([x, z, r]) => Math.hypot(x - p.x, z - p.z) < r * 0.6)) continue;
    coinAt(p.x, groundAt(p.x, p.z), p.z, 1);
  }
  coins.forEach((c, i) => { c.id = 'c' + i; });

  return { biome, tier, size, diff, dir, a0, T, pieces, colliders, route, branches, walks, modules, coins, caches, chests, checkpoints,
    keepOut, spawn, exit, rowboat, summit, vault, arches };
}

/** The widest angular gap between the given angles: { mid, width }. */
function largestGap(angles) {
  const a = angles.map((x) => ((x % TAU) + TAU) % TAU).sort((p, q) => p - q);
  let best = { mid: 0, width: 0 };
  for (let i = 0; i < a.length; i++) {
    const lo = a[i], hi = i === a.length - 1 ? a[0] + TAU : a[i + 1];
    if (hi - lo > best.width) best = { mid: (lo + hi) / 2, width: hi - lo };
  }
  return best;
}

// --------------------------------------------------------------- route stats
/** An edge you can just walk: tiny gap, at most a step up, a short step down. */
export function walkableEdge(A, B) {
  if (B.edge === 'walk' && A.type === 'ground' && B.type === 'ground') return true;
  const dy = B.y - A.y;
  return lineGap(A, B) <= 0.2 && dy <= ASHORE.stepUp + 1e-6 && -dy <= 0.8;
}

/** Numbers for comparing difficulty: route length, jumps, worst gap/rise, summit height. */
export function routeStats(L) {
  let length = 0, jumps = 0, maxGap = 0, maxRise = 0, run = 0, maxRun = 0;
  const R = L.route;
  for (let i = 1; i < R.length; i++) {
    const A = R[i - 1], B = R[i];
    length += Math.hypot(B.x - A.x, B.z - A.z);
    if (walkableEdge(A, B)) { run = 0; continue; }
    jumps++; run++; maxRun = Math.max(maxRun, run);
    maxGap = Math.max(maxGap, lineGap(A, B));
    maxRise = Math.max(maxRise, B.y - A.y);
  }
  // walked polylines add their own length
  for (const w of L.walks) for (let i = 1; i < w.length; i++) length += Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]);
  return { tier: L.tier, length: Math.round(length), jumps, maxConsecutiveJumps: maxRun, maxGap: +maxGap.toFixed(2), maxRise: +maxRise.toFixed(2),
    summitAboveMeadow: +(L.T.summit - L.T.meadowLo).toFixed(1), modules: L.modules.map((m) => m.type).join(', ') };
}

// ---------------------------------------------------------------- validation
function insidePoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polysOverlap(A, B) {
  // separating axis test for convex polygons
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % P.length];
      const nx = z1 - z2, nz = x2 - x1;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of A) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const [x, z] of B) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 <= b0 + 1e-3 || b1 <= a0 + 1e-3) return false;
    }
  }
  return true;
}
// Kinds that are a thin top over open air (what's under them may pass beneath).
const THIN = new Set(['disc', 'ledge', 'plank', 'vista', 'palm', 'rope']);
const footOf = (n) => (n.type === 'piece' ? n.piece.foot : null);
/** Horizontal gap along the straight line between two nodes' centres (edge to edge). */
function lineGap(A, B) {
  const ax = A.x, az = A.z, bx = B.x, bz = B.z;
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 1e-6) return 0;
  const fa = footOf(A), fb = footOf(B);
  let tExit = 0, tEnter = 1;
  const N = Math.ceil(L / 0.05);
  if (fa) for (let i = 0; i <= N; i++) { const t = i / N; if (insidePoly(fa, ax + (bx - ax) * t, az + (bz - az) * t)) tExit = t; }
  if (fb) for (let i = N; i >= 0; i--) { const t = i / N; if (insidePoly(fb, ax + (bx - ax) * t, az + (bz - az) * t)) tEnter = t; }
  return Math.max(0, (tEnter - tExit) * L);
}

/** Vertical extent of a collider (y0, y1) and its plan footprint polygon. */
function colliderPlan(c) {
  if (c.type === 'box') return { y0: c.min[1], y1: c.max[1], foot: [[c.min[0], c.min[2]], [c.max[0], c.min[2]], [c.max[0], c.max[2]], [c.min[0], c.max[2]]] };
  if (c.type === 'obox') {
    const [hx, , hz] = c.h;
    const foot = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => { const [wx, wz] = toWorld(x, z, c.rot); return [c.c[0] + wx, c.c[2] + wz]; });
    return { y0: c.c[1] - c.h[1], y1: c.c[1] + c.h[1], foot };
  }
  const foot = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; foot.push([c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r]); }
  return { y0: c.y0, y1: c.y1, foot };
}

/**
 * Check that every required move is within ASHORE.design (and optional
 * branches within ~90% of the real limits), that platforms are wide enough,
 * have headroom, aren't buried, don't overlap, and that walked ground is
 * dry and gentle. Returns { ok, errors: [string], stats }.
 */
export function validateLayout(L) {
  const errors = [];
  const { T } = L;
  const slopeTan = Math.tan(ASHORE.slopeMax);
  const plans = L.colliders.map(colliderPlan);
  const check = (nodes, lim, label) => {
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i];
      if (B.edge === 'walk' && A.type === 'ground' && B.type === 'ground') continue; // checked with the walk polylines
      const dy = B.y - A.y;
      const gap = lineGap(A, B);
      const where = `${label}[${i}] ${A.piece?.kind || 'ground'}→${B.piece?.kind || 'ground'}`;
      if (dy > lim.up + 1e-6) errors.push(`${where}: jump up ${dy.toFixed(2)} > ${lim.up.toFixed(2)}`);
      if (-dy > lim.drop) errors.push(`${where}: drop ${(-dy).toFixed(2)} > ${lim.drop}`);
      if (gap > lim.gap + 1e-6) errors.push(`${where}: gap ${gap.toFixed(2)} > ${lim.gap.toFixed(2)}`);
    }
    for (const n of nodes) {
      if (n.type !== 'piece') continue;
      const p = n.piece;
      if (p.minWidth < lim.minWidth - 1e-6) errors.push(`${label} ${p.id} ${p.kind}: width ${p.minWidth.toFixed(2)} < ${lim.minWidth}`);
    }
  };
  const mainLim = L.tier === 'easy' ? LIMITS.easy : LIMITS.main;
  check(L.route, mainLim, 'main');
  for (const b of L.branches) check(b.nodes, LIMITS.optional, b.name);
  // gentle islands: never more than a few jumps without a walkable rest
  if (mainLim.maxRun) {
    let run = 0;
    for (let i = 1; i < L.route.length; i++) {
      if (walkableEdge(L.route[i - 1], L.route[i])) run = 0;
      else if (++run > mainLim.maxRun) { errors.push(`main[${i}]: ${run} jumps in a row (max ${mainLim.maxRun})`); break; }
    }
  }
  // the lookout tree: leaf platforms that overlap from above need room for the camera
  for (const b of L.branches.filter((x) => x.name === 'chest')) {
    const discs = b.nodes.filter((n) => n.type === 'piece').map((n) => n.piece);
    for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) {
      const A = discs[i], B = discs[j];
      if (Math.hypot(A.cx - B.cx, A.cz - B.cz) < A.r + B.r - 0.05 && Math.abs(B.top - A.top) < 3.4) errors.push(`chest tree ${A.id}/${B.id}: only ${Math.abs(B.top - A.top).toFixed(2)} m between stacked platforms`);
    }
  }

  // walked ground: dry, gentle, unobstructed
  for (const [wi, line] of L.walks.entries()) {
    for (let i = 1; i < line.length; i++) {
      const [x0, z0] = line[i - 1], [x1, z1] = line[i];
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 0.4));
      let prev = T.groundAt(x0, z0);
      for (let k = 1; k <= n; k++) {
        const x = x0 + (x1 - x0) * (k / n), z = z0 + (z1 - z0) * (k / n);
        const h = T.groundAt(x, z);
        if (!Number.isFinite(h)) { errors.push(`walk ${wi}: water at ${x.toFixed(1)},${z.toFixed(1)}`); break; }
        if (Math.abs(h - prev) > slopeTan * (len / n) + 0.05) { errors.push(`walk ${wi}: too steep at ${x.toFixed(1)},${z.toFixed(1)}`); break; }
        prev = h;
        const bi = plans.findIndex((pl) => pl.y0 < h + 0.4 && pl.y1 > h + ASHORE.stepUp + 0.05 && insidePoly(pl.foot, x, z));
        if (bi >= 0) { const c = L.colliders[bi]; errors.push(`walk ${wi}: blocked at ${x.toFixed(1)},${z.toFixed(1)} by ${c.type}/${c.tag} (seg ${i})`); break; }
      }
    }
  }

  // pieces: headroom, buried, overlaps
  const byId = Object.fromEntries(L.pieces.map((p) => [p.id, p]));
  for (const p of L.pieces) {
    const ground = T.heightAt(p.cx, p.cz);
    if (p.kind !== 'stone' && p.kind !== 'log' && p.top < ground + 0.25 && !SOLID.has(p.kind)) errors.push(`${p.id} ${p.kind}: buried (top ${p.top.toFixed(2)} vs ground ${ground.toFixed(2)})`);
    const shrink = p.foot.map(([x, z]) => [p.cx + (x - p.cx) * 0.96, p.cz + (z - p.cz) * 0.96]);
    for (const [ci, pl] of plans.entries()) {
      const owner = L.colliders[ci].rail && byId[L.colliders[ci].rail];
      if (owner && owner.joined && p.joined && Math.abs(owner.top - p.top) <= 0.65) continue;
      if (pl.y0 > p.top + 0.05 && pl.y0 < p.top + HEADROOM && polysOverlap(shrink, pl.foot)) {
        errors.push(`${p.id} ${p.kind}: headroom ${(pl.y0 - p.top).toFixed(2)}`); break;
      }
    }
  }
  for (let i = 0; i < L.pieces.length; i++) {
    for (let j = i + 1; j < L.pieces.length; j++) {
      const A = L.pieces[i], B = L.pieces[j];
      if (Math.hypot(A.cx - B.cx, A.cz - B.cz) > 8) continue;
      const aLo = THIN.has(A.kind) ? A.top - 0.4 : -9;
      const bLo = THIN.has(B.kind) ? B.top - 0.4 : -9;
      if (A.joined && B.joined && Math.abs(A.top - B.top) <= 0.4) continue; // stair steps and landings butt together on purpose
      if (A.joined && B.joined && A.style === B.style && SOLID.has(A.kind) && Math.abs(A.top - B.top) <= 1.0) continue; // solid steps merge
      if (A.branch && B.branch && A.kind === 'disc' && B.kind === 'disc' && Math.abs(A.top - B.top) > 0.3) continue; // spiral platforms, checked above
      if (Math.min(A.top, B.top) > Math.max(aLo, bLo) && polysOverlap(A.foot, B.foot)) errors.push(`${A.id}/${B.id} overlap`);
    }
  }
  const stats = {
    modules: L.modules.length, pieces: L.pieces.length, colliders: L.colliders.length,
    coins: L.coins.length, caches: L.caches.length, chests: L.chests.length, checkpoints: L.checkpoints.length,
    summitAbove: +(T.summit - T.meadowLo).toFixed(1), radius: +T.Rt.toFixed(1), tier: L.tier,
  };
  if (L.coins.length < 25 || L.coins.length > 50) errors.push(`coins ${L.coins.length} not in 25..50`);
  if (L.checkpoints.length < 3 || L.checkpoints.length > 5) errors.push(`checkpoints ${L.checkpoints.length} not in 3..5`);
  if (L.chests.length !== 1) errors.push(`chests ${L.chests.length}`);
  return { ok: errors.length === 0, errors, stats };
}

export { topOf };
