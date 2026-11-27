// The pieces of a generated ashore level and the staircases built from them:
// what a piece is (its footprint and colliders), the climbing styles
// (STAIRS), a staircase up a wall, the rests between staircases, and a steam
// vent with what it throws you up to (volcanic islands). Pure data, no
// three.js; modules.js lays these out round the island and checks them, and
// pieces.js (with tropical-art.js and volcanic-art.js) draws them.
//
// Rotations (obox.rot, piece.rot) use the three.js rotation.y convention:
// a local (x, z) maps to world (x cos r + z sin r, -x sin r + z cos r).
import { clamp, TAU } from '../util.js';
import { obox, cyl } from './shapes.js';

export const rotOf = (a) => -a - Math.PI / 2; // local x along the tangent at polar angle a
export const toWorld = (lx, lz, rot) => [lx * Math.cos(rot) + lz * Math.sin(rot), -lx * Math.sin(rot) + lz * Math.cos(rot)];

// ------------------------------------------------------------------- pieces
// A piece is something you stand on. Footprints are convex polygons [[x,z],…]
// of the top surface; colliders are added per kind.
let _pid = 0;
/** Number pieces from p0 again (each layout starts afresh). */
export function resetPieceIds() { _pid = 0; }
export function rectPiece(kind, cx, cz, top, hx, hz, rot, extra = {}) {
  const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => { const [wx, wz] = toWorld(x, z, rot); return [cx + wx, cz + wz]; });
  return { id: 'p' + (_pid++), kind, cx, cz, top, hx, hz, rot, foot: pts, minWidth: 2 * Math.min(hx, hz), ...extra };
}
export function discPiece(kind, cx, cz, top, r, extra = {}) {
  const foot = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; foot.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return { id: 'p' + (_pid++), kind, cx, cz, top, r, foot, minWidth: 2 * r, ...extra };
}

/** Colliders for a piece. `base` is the ground under it (pillars reach down to it). */
export function piecesColliders(p) {
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
  // crumbling basalt and steam vents are found by what you stand on (hazards.js)
  if (p.crumble) for (const c of out) c.crumble = p.id;
  if (p.kind === 'vent') for (const c of out) c.vent = p.id;
  return out;
}

function pieceBody(p) {
  const tag = p.tag || 'stone';
  switch (p.kind) {
    case 'bridge':
      return [obox(p.cx, p.top - 0.2, p.cz, p.hx, 0.2, p.hz, p.rot, 'wood')];
    case 'block': case 'column': case 'pad': case 'pool': case 'shelf':
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
    case 'stack': case 'basalt':
      // a sea stack, or a basalt column: solid rock from below the ground (or the water) to its top
      return [cyl(p.cx, p.cz, p.r, Math.min(p.base, 0) - 1, p.top, 'stone')];
    case 'vent':
      // a low rim of rock round the vent's mouth, a step up from the ground
      return [cyl(p.cx, p.cz, p.r, p.base - 0.5, p.top, 'stone')];
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
export const STAIRS = {
  terraces: { kind: 'block', w: [1.8, 2.2], d: [1.8, 2.2], rise: [0.6, 0.85], gap: [0.25, 1.0], off: 0.35, tag: 'grass' },
  ruins: { kind: 'column', w: [1.35, 1.6], d: [1.35, 1.6], rise: [0.55, 0.9], gap: [0.9, 1.6], off: 0.45, tag: 'stone' },
  trees: { kind: 'disc', r: [0.95, 1.12], rise: [0.7, 0.95], gap: [0.9, 1.55], off: 0.5, tag: 'leaf' },
  ledges: { kind: 'ledge', w: [1.9, 2.4], d: [1.3, 1.55], rise: [0.8, 1.0], gap: [0.55, 1.35], off: 0.0, tag: 'stone' },
  scaffold: { kind: 'plank', w: [1.6, 2.0], d: [1.4, 1.6], rise: [0.65, 0.9], gap: [0.4, 1.15], off: 0.02, tag: 'wood' },
  // gentle styles for islands near home
  steps: { kind: 'block', w: [0.95, 1.1], d: [2.3, 2.6], rise: [0.27, 0.32], gap: [0.02, 0.05], off: 0.3, tag: 'stone', joined: true, carved: true },
  basaltSteps: { kind: 'block', w: [0.95, 1.1], d: [2.3, 2.6], rise: [0.27, 0.32], gap: [0.02, 0.05], off: 0.3, tag: 'stone', joined: true, carved: true },
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
  // volcanic islands: hexagonal basalt columns standing against the wall (a
  // wide kind near home), and cinder ledges, cracked slabs of basalt that
  // crumble a moment after you land on them (hazards.js). A steam vent
  // (ventClimb) starts the climb.
  basalt: { kind: 'basalt', r: [0.82, 0.98], rise: [0.6, 0.9], gap: [0.6, 1.3], off: 0.4, tag: 'stone' },
  basaltWide: { kind: 'basalt', r: [1.1, 1.25], rise: [0.5, 0.66], gap: [0.35, 0.75], off: 0.4, tag: 'stone' },
  cinders: { kind: 'ledge', w: [1.5, 1.85], d: [1.2, 1.32], rise: [0.7, 0.95], gap: [0.5, 1.15], off: 0.0, tag: 'stone', crumble: true },
};
// Kinds whose top is a disc (r) rather than a rectangle (w × d).
export const ROUND = new Set(['disc', 'stack', 'palm', 'basalt', 'vent']);
// Kinds that are solid down to the ground (steps you stand on top of).
export const SOLID = new Set(['block', 'column', 'pool', 'vent', 'shelf']);
export const ARCH_LEG = 0.42; // half-width of an arch's legs along the span
export const PALM_TRUNK = 0.3; // radius of a palm-top's trunk

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const rr = (rng, [a, b], t = rng()) => a + (b - a) * t;

/**
 * Pieces climbing a wall (cliff or mesa) along its ring: from yFrom (ground)
 * to yTo - 0.6, so the last hop onto the rim is ≤ 0.95 up. If `prevHalf` is
 * given, the first piece keeps a proper gap from whatever ends at aStart.
 */
export function stair(T, { Rw, aStart, dir, yFrom, yTo, style, rng, diff, route, groundAt, prevHalf = 0, lim, restEvery = 0, rails = false, wallTop = yTo }) {
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
    const extra = { tag: S.tag, base: Number.isFinite(base) ? base : -2, route, style, angle: sp.a, wallTop, ...(S.crumble ? { crumble: true } : {}),
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
export function vistaAfter(T, { Rw, a, dir, prevHalf, top, route, gap = 0.9, wide = false }) {
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
export function stepAlong(rf, a, dir, dist) {
  const p0x = Math.cos(a) * rf(a), p0z = Math.sin(a) * rf(a);
  const d = (da) => { const b = a + dir * da, r = rf(b); return Math.hypot(Math.cos(b) * r - p0x, Math.sin(b) * r - p0z); };
  let lo = 0, hi = Math.min(Math.PI / 2, (dist / Math.max(1, rf(a))) * 3);
  while (d(hi) < dist && hi < Math.PI) hi *= 1.5;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (d(mid) < dist) lo = mid; else hi = mid; }
  return a + dir * (lo + hi) / 2;
}
// ------------------------------------------------------------- steam vents
// A vent's rim (r) and the mouth in it that throws you (mouth); how far its
// centre stands out from the wall's foot (out), so the column you rise in
// clears the face; how far along the ring from its centre a shelf may start
// (clear), so the column clears the shelf too; and how high its rim stands.
export const VENT = { r: 0.85, mouth: 0.55, out: 1.0, clear: 1.0, rise: 0.15 };

/**
 * A steam vent at the foot of a wall (at aStart), and what it throws you up
 * to: the wall's top (`toRim`, when it is no higher than `launchUp`), or else
 * a wide basalt shelf on the face beside it, part way up, from which a
 * staircase carries on (a block of basalt columns, solid to the ground).
 * The vent's `lift` is how high it throws you: the
 * target's height plus `over`, so there is time at the top to step across.
 * Returns { pieces: [vent, shelf?], aEnd, lastHalf, top, rim }.
 */
export function ventClimb(T, { Rw, aStart, dir, yTo, toRim, groundAt, route, launchUp, over, wallTop = yTo }) {
  // (out from the wall's furthest point nearby: the face bulges between the points it is measured at)
  const R = (a) => Math.max(...[-1, -0.5, 0, 0.5, 1].map((k) => Rw(a + (k * 1.2) / Rw(a)))) + VENT.out;
  const vx = Math.cos(aStart) * R(aStart), vz = Math.sin(aStart) * R(aStart);
  const g = groundAt(vx, vz), vTop = g + VENT.rise;
  const vent = discPiece('vent', vx, vz, vTop, VENT.r, { tag: 'stone', base: g, route, style: 'vent', angle: aStart, wallTop });
  if (toRim && yTo - vTop <= launchUp) {
    vent.lift = yTo - vTop + over;
    return { pieces: [vent], aEnd: aStart, lastHalf: VENT.r, top: yTo, rim: true };
  }
  // the shelf: some way up what is left (the climb goes on from it), and never above what the vent can reach
  const top = vTop + clamp((yTo - 0.6 - vTop) * 0.4, 2.2, launchUp - 0.2);
  const hx = 1.3, hz = 1.0;
  const a2 = stepAlong(R, aStart, dir, VENT.clear + hx);
  const Rs = Rw(a2) + hz;
  const sg = groundAt(Math.cos(a2) * Rs, Math.sin(a2) * Rs);
  const shelf = rectPiece('shelf', Math.cos(a2) * Rs, Math.sin(a2) * Rs, top, hx, hz, rotOf(a2),
    { tag: 'stone', style: 'vent', base: Number.isFinite(sg) ? sg : -2, route, angle: a2, wallTop });
  vent.lift = top - vTop + over;
  return { pieces: [vent, shelf], aEnd: a2, lastHalf: hx, top, rim: false };
}
