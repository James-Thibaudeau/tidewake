// Geometry for tropical islands' level pieces (pieces.js hands them over by
// kind and style): palm-top platforms, tide pools stepping up the rock, rope
// bridges hung on the face, rock pools in the moat, the rope bridge across it
// and the giant palm that holds the chest. Built like pieces.js: vertex-
// coloured parts in level space, merged into the level's one platform mesh.
import * as THREE from 'three';
import { part, jitter, frond } from '../props.js';

const C = {
  trunk: '#9b7650', trunk2: '#87653f', husk: '#5a3f26', nut: '#7d5a32',
  pad: '#6cbf4a', padDark: '#3f8a35', padWeave: '#86d35f',
  coral: '#c9a283', coralDark: '#9a7a62', coralTop: '#dcc3a4',
  water: '#4fc6c4', waterLight: '#9be8df', spill: '#bff0ea',
  star: '#f0884a', anemone: '#f27fa5', shell: '#f4e6cf', weed: '#4f9a52',
  slat: '#c49a62', slat2: '#ad8350', post: '#6e4a2b', rope: '#d9c08a', ropeDark: '#b59a63',
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

/** A local part turned by the piece's rot and moved to its centre (as in pieces.js). */
function placed(geo, color, p, t = {}, extra = {}) {
  const g = part(geo, color, { ...t, ...extra });
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}

/** A palm frond (already coloured) pointing out along angle `a`, its base at (x, y, z) in level space. */
function frondAt(len, droop, lift, x, y, z, a, s = 1, tilt = 0) {
  const g = frond(len, droop, lift);
  _e.set(0, -a, tilt); _q.setFromEuler(_e);
  g.applyMatrix4(_m.compose(_v.set(x, y, z), _q, _s.set(s, s, s)));
  return g;
}

/** A thin rope (or pole) from a to b, each [x, y, z] in the piece's local space. */
function strand(a, b, r, color, p) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r, r, L, 4);
  g.translate(0, L / 2, 0);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  g.applyQuaternion(_q);
  return placed(g, color, p, { x: a[0], y: a[1], z: a[2] });
}

/** A rope that sags between two points: `n` straight runs. */
function sagRope(a, b, sag, r, color, p, n = 6) {
  const P = [];
  const at = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u];
  for (let i = 0; i < n; i++) P.push(strand(at(i / n), at((i + 1) / n), r, color, p));
  return P;
}

/**
 * A woven frond pad you stand on, a ring of fronds drooping from under its
 * rim and a few coconuts tucked beneath. Fronds stay below the walking surface.
 */
function palmPad(p, seed) {
  const P = [];
  P.push(placed(new THREE.CylinderGeometry(p.r, p.r * 0.86, 0.3, 14), C.pad, p, { y: p.top - 0.15, ry: seed }, { c2: C.padDark, split: 0.55 }));
  // the weave: two pale rings on the top
  for (const k of [0.45, 0.8]) P.push(placed(new THREE.TorusGeometry(p.r * k, 0.035, 3, 18), C.padWeave, p, { y: p.top + 0.0, rx: Math.PI / 2 }));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const g = frondAt(1.5 + (i % 3) * 0.2, 1.1 + (i % 2) * 0.3, 0.12, p.cx + Math.cos(a) * p.r * 0.7, p.top - 0.24, p.cz + Math.sin(a) * p.r * 0.7, a, 0.62);
    P.push(g);
  }
  // short fronds just under the rim, so the crown's outline is ragged, not a disc
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed + 0.35;
    P.push(frondAt(1.0, 0.45, 0.04, p.cx + Math.cos(a) * p.r * 0.75, p.top - 0.13, p.cz + Math.sin(a) * p.r * 0.75, a, 0.6));
  }
  for (let i = 0; i < 3; i++) {
    const a = seed * 1.7 + i * 2.1;
    P.push(placed(new THREE.IcosahedronGeometry(0.17, 0), i % 2 ? C.nut : C.husk, p, { x: Math.cos(a) * 0.32, y: p.top - 0.42, z: Math.sin(a) * 0.32 }));
  }
  return P;
}

/** Palm-top hops: a frond crown on a ringed trunk with a gentle bow in it. */
export function palmTopParts(p) {
  const seed = (Math.abs(p.cx * 7.3 + p.cz * 3.1) % 6.283);
  const P = palmPad(p, seed);
  const y0 = (p.base ?? 0) - 0.4, y1 = p.top - 0.3, H = y1 - y0;
  if (H > 0.2) {
    const segs = Math.max(3, Math.round(H / 0.55)), bow = Math.min(0.22, H * 0.04);
    const bx = Math.cos(seed) * bow, bz = Math.sin(seed) * bow;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const o0 = Math.sin(t0 * Math.PI), o1 = Math.sin(t1 * Math.PI);
      const a = [bx * o0, y0 + H * t0, bz * o0], b = [bx * o1, y0 + H * t1, bz * o1];
      const r0 = 0.31 - 0.08 * t0, r1 = 0.31 - 0.08 * t1;
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, H / segs, dz);
      const g = new THREE.CylinderGeometry(r1 * 0.92, r0 * 1.05, L * 1.02, 7);
      g.translate(0, L / 2, 0);
      _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, (H / segs) / L, dz / L));
      g.applyQuaternion(_q);
      P.push(placed(g, i % 2 ? C.trunk : C.trunk2, p, { x: a[0], y: a[1], z: a[2] }));
    }
  }
  return P;
}

/**
 * Tide pools: a basin of pale coral rock, solid to the ground, holding clear
 * water a hand's depth down. A lip rings the top, water spills over the front
 * (local -z, away from the wall), and there are starfish, anemones and shells.
 */
export function tidePoolParts(p) {
  const P = [];
  const H = p.top - (p.base ?? 0) + 0.6, w = p.hx * 2, d = p.hz * 2, seed = Math.abs(Math.floor(p.cx * 13 + p.cz * 7)) % 997;
  const y0 = p.top - H - 0.02;
  P.push(placed(jitter(new THREE.BoxGeometry(w, H, d, 4, Math.max(2, Math.round(H * 1.5)), 4), 0.07, seed), C.coral, p, { y: y0 + H / 2 }, { c2: C.coralDark, split: 0.5, soft: 0.2 }));
  // bands of darker rock standing a little proud, as old waterlines
  for (let k = 1; k < H - 0.6; k += 0.9 + (seed % 3) * 0.15) {
    P.push(placed(jitter(new THREE.BoxGeometry(w + 0.08, 0.16, d + 0.08, 3, 1, 3), 0.04, seed + k * 10), C.coralDark, p, { y: p.top - 0.35 - k, ry: ((seed + k * 3) % 5 - 2) * 0.01 }));
  }
  // lumps of rock on two corners, so it isn't a plain box
  for (const [sx, sz] of [[-1, -1], [1, 1]]) {
    const r = 0.3 + (seed % 4) * 0.05;
    P.push(placed(new THREE.DodecahedronGeometry(r, 0), C.coral, p, { x: sx * (p.hx - r * 0.5), y: p.top - 0.5 - (sx > 0 ? 0.6 : 0), z: sz * (p.hz - r * 0.5), ry: seed + sx, sy: 1.4 }, { c2: C.coralDark, split: 0.5 }));
  }
  // the lip, four low walls round the edge, with weed along the tide mark under it
  const lip = 0.16, ly = p.top + 0.05;
  for (const s of [-1, 1]) {
    P.push(placed(new THREE.BoxGeometry(w + 0.04, 0.16, lip), C.coralTop, p, { y: ly, z: s * (p.hz - lip / 2 + 0.02) }));
    P.push(placed(new THREE.BoxGeometry(lip, 0.16, d - lip * 2 + 0.04), C.coralTop, p, { x: s * (p.hx - lip / 2 + 0.02), y: ly }));
    P.push(placed(new THREE.BoxGeometry(w + 0.06, 0.07, 0.04), C.weed, p, { y: p.top - 0.08, z: s * (p.hz + 0.02) }));
    P.push(placed(new THREE.BoxGeometry(0.04, 0.07, d + 0.06), C.weed, p, { x: s * (p.hx + 0.02), y: p.top - 0.08 }));
  }
  // water, with two glints where the sky catches it
  P.push(placed(new THREE.BoxGeometry(w - lip * 2, 0.05, d - lip * 2), C.water, p, { y: p.top + 0.0 }));
  for (const [gx, gz, gs] of [[-0.22, 0.15, 0.32], [0.2, -0.2, 0.18]]) {
    P.push(placed(new THREE.CylinderGeometry(gs, gs, 0.01, 10), C.waterLight, p, { x: gx * w, y: p.top + 0.028, z: gz * d, sx: 1.6 }));
  }
  // water spilling over the front lip in two thin streaks, a wet stain behind
  const sx = ((seed % 5) - 2) * 0.15 * p.hx, run = Math.min(1.4, H * 0.6);
  P.push(placed(new THREE.BoxGeometry(0.5, run * 0.9, 0.03), '#8a6c55', p, { x: sx, y: p.top - run * 0.45, z: -p.hz - 0.035 }));
  P.push(placed(new THREE.BoxGeometry(0.12, run, 0.04), C.spill, p, { x: sx - 0.1, y: p.top - run / 2 + 0.08, z: -p.hz - 0.06 }));
  P.push(placed(new THREE.BoxGeometry(0.08, run * 0.65, 0.04), C.spill, p, { x: sx + 0.12, y: p.top - run * 0.32 + 0.08, z: -p.hz - 0.06 }));
  // life on the lip and in the water
  const cx = (k) => (((seed >> k) % 7) / 7 - 0.5) * (w - 0.6);
  P.push(placed(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 5), C.star, p, { x: cx(1), y: p.top + 0.035, z: -p.hz * 0.3, ry: seed }));
  for (let i = 0; i < 3; i++) P.push(placed(new THREE.IcosahedronGeometry(0.09 + i * 0.02, 0), C.anemone, p, { x: p.hx - 0.12, y: ly + 0.07, z: p.hz * (0.2 + i * 0.25) - 0.3 }));
  P.push(placed(new THREE.ConeGeometry(0.09, 0.14, 6), C.shell, p, { x: -p.hx + 0.1, y: ly + 0.1, z: -p.hz * 0.4, rz: 1.2 }));
  P.push(placed(new THREE.IcosahedronGeometry(0.16, 0), C.weed, p, { x: cx(3) * 0.6, y: p.top - 0.02, z: p.hz * 0.35, sy: 0.4 }));
  return P;
}

/**
 * A rope bridge hung along the rock face: slats on two foot ropes that sag a
 * little, a post at each end of the open side with a sagging handrope and
 * hangers between, and on the wall side ropes up to pegs in the rock above.
 */
export function ropeDeckParts(p) {
  const P = [];
  const L = p.hx * 2, d = p.hz * 2, n = Math.max(6, Math.round(L / 0.3)), SAG = 0.07;
  const sagAt = (x) => SAG * (1 - (x / p.hx) ** 2);
  for (let i = 0; i < n; i++) {
    const x = -p.hx + (L / n) * (i + 0.5);
    P.push(placed(new THREE.BoxGeometry(L / n - 0.09, 0.06, d - 0.04), i % 2 ? C.slat : C.slat2, p, { x, y: p.top - 0.03 - sagAt(x), ry: ((i * 37) % 7 - 3) * 0.02 }));
  }
  for (const s of [-1, 1]) P.push(...sagRope([-p.hx - 0.05, p.top - 0.08, s * (p.hz - 0.12)], [p.hx + 0.05, p.top - 0.08, s * (p.hz - 0.12)], SAG, 0.035, C.ropeDark, p, 4));
  const zo = -(p.hz - 0.08), zi = p.hz - 0.08, top = p.top + 0.74, ends = [-(p.hx - 0.06), p.hx - 0.06];
  // the ropes up to the rock end at pegs 2 m up, or at the rim if that's lower
  const hang = Math.min(2.1, (p.wallTop ?? Infinity) - p.top - 0.12);
  for (const x of ends) {
    P.push(placed(new THREE.CylinderGeometry(0.06, 0.085, 1.15, 6), C.post, p, { x, y: p.top + 0.45, z: zo, rx: -0.08 }));
    P.push(placed(new THREE.SphereGeometry(0.075, 6, 4), C.ropeDark, p, { x, y: top, z: zo - 0.04 }));
    // a rope up from the wall-side corner to a peg in the rock
    if (hang > 0.4) {
      P.push(strand([x, p.top - 0.05, zi], [x * 0.9, p.top + hang, zi + 0.35], 0.022, C.rope, p));
      P.push(placed(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 5), C.post, p, { x: x * 0.9, y: p.top + hang, z: zi + 0.4, rx: Math.PI / 2 }));
    }
  }
  P.push(...sagRope([ends[0], top, zo - 0.04], [ends[1], top, zo - 0.04], 0.16, 0.032, C.rope, p));
  // hangers from the handrope down to the foot rope
  const m = Math.max(3, Math.round(L / 0.55));
  for (let i = 1; i < m; i++) {
    const u = i / m, x = ends[0] + (ends[1] - ends[0]) * u, y = top - 0.16 * 4 * u * (1 - u);
    P.push(strand([x, p.top - 0.08 - sagAt(x), zo - 0.02], [x, y, zo - 0.04], 0.016, C.rope, p));
  }
  // and a middle hanger on the wall side
  if (hang > 0.4) P.push(strand([0, p.top - 0.08 - SAG, zi], [0, p.top + hang + 0.1, zi + 0.35], 0.02, C.rope, p));
  return P;
}

/** Tide pools in the moat: a rock rim standing in the channel with a pool on top. */
export function poolRimParts(p) {
  const P = [];
  const H = p.top + 2.4, spin = p.cx * 3 + p.cz, seed = Math.abs(Math.floor(p.cx * 5 + p.cz * 11)) % 97;
  // a lumpy drum, dark and wet below the waterline (the moat's surface is y = 0)
  P.push(placed(jitter(new THREE.CylinderGeometry(p.r * 0.95, p.r * 1.25, H, 9, 5), p.r * 0.13, seed), C.coral, p, { y: p.top - H / 2, ry: spin }, { c2: '#6f5a48', split: 2.4 / H + 0.02, soft: 0.03 }));
  // boulders worked into the rim, so the circle is broken
  for (let i = 0; i < 4; i++) {
    const a = spin + i * 1.6 + (seed % 3) * 0.3, r = 0.2 + ((seed + i) % 3) * 0.06;
    P.push(placed(new THREE.DodecahedronGeometry(r, 0), i % 2 ? C.coral : C.coralTop, p, { x: Math.cos(a) * p.r * 0.92, y: p.top - r * 0.35, z: Math.sin(a) * p.r * 0.92, ry: a, sy: 0.75 }));
  }
  P.push(placed(new THREE.TorusGeometry(p.r * 0.84, 0.09, 4, 12), C.coralTop, p, { y: p.top + 0.02, rx: Math.PI / 2, rz: spin }));
  P.push(placed(new THREE.CylinderGeometry(p.r * 0.8, p.r * 0.8, 0.04, 12), C.water, p, { y: p.top - 0.0 }));
  P.push(placed(new THREE.CylinderGeometry(p.r * 0.25, p.r * 0.25, 0.01, 8), C.waterLight, p, { x: -p.r * 0.25, y: p.top + 0.025, z: p.r * 0.15, sx: 1.5 }));
  // weed at the waterline, a starfish in the pool and an anemone on the rim
  P.push(placed(new THREE.TorusGeometry(p.r * 1.13, 0.06, 3, 12), C.weed, p, { y: 0.05, rx: Math.PI / 2 }));
  P.push(placed(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 5), C.star, p, { x: Math.cos(spin) * p.r * 0.35, y: p.top + 0.025, z: Math.sin(spin) * p.r * 0.35, ry: spin }));
  P.push(placed(new THREE.IcosahedronGeometry(0.1, 0), C.anemone, p, { x: Math.cos(spin + 2.4) * p.r * 0.82, y: p.top + 0.1, z: Math.sin(spin + 2.4) * p.r * 0.82 }));
  return P;
}

/**
 * The rope bridge across the moat: slats on foot ropes between tall posts at
 * each end, handropes sagging between them on both sides, with hangers.
 */
export function ropeBridgeParts(p) {
  const P = [];
  const L = p.hx * 2, d = p.hz * 2, n = Math.max(8, Math.round(L / 0.34));
  for (let i = 0; i < n; i++) {
    const x = -p.hx + (L / n) * (i + 0.5);
    P.push(placed(new THREE.BoxGeometry(L / n - 0.08, 0.08, d - 0.1), i % 2 ? C.slat : C.slat2, p, { x, y: p.top - 0.04, ry: ((i * 37) % 7 - 3) * 0.015 }));
  }
  for (const s of [-1, 1]) P.push(placed(new THREE.BoxGeometry(L + 0.2, 0.08, 0.08), C.ropeDark, p, { y: p.top - 0.12, z: s * (p.hz - 0.14) }));
  const ends = [-(p.hx - 0.12), p.hx - 0.12], top = p.top + 0.72;
  for (const s of [-1, 1]) {
    const z = s * (p.hz - 0.1);
    for (const x of ends) {
      const Hp = p.top + 2.4 + 1.15;
      P.push(placed(new THREE.CylinderGeometry(0.1, 0.13, Hp, 6), C.post, p, { x, y: p.top + 1.15 - Hp / 2, z }));
      P.push(placed(new THREE.ConeGeometry(0.12, 0.18, 6), C.post, p, { x, y: p.top + 1.24, z }));
    }
    P.push(...sagRope([ends[0], top + 0.3, z], [ends[1], top + 0.3, z], 0.35, 0.04, C.rope, p, 8));
    const m = Math.max(4, Math.round(L / 0.7));
    for (let i = 1; i < m; i++) {
      const u = i / m, x = ends[0] + (ends[1] - ends[0]) * u;
      P.push(strand([x, p.top - 0.1, z], [x, top + 0.3 - 0.35 * 4 * u * (1 - u), z], 0.018, C.rope, p));
    }
  }
  return P;
}

/**
 * The giant palm that holds the chest: a tall ringed trunk, a frond stem out
 * to each platform, a crown of big fronds and coconuts. The platforms are
 * frond pads (`p.palm` discs, drawn by `palmPad`).
 */
export function lookoutPalmParts(tree, discs) {
  const P = [];
  const at = (g, color, t, extra = {}) => { const q = part(g, color, { ...t, ...extra }); q.translate(tree.x, 0, tree.z); return q; };
  const H = tree.top - tree.base + 0.5, segs = Math.max(5, Math.round(H / 0.9)), y0 = tree.base - 0.5;
  for (let i = 0; i < segs; i++) {
    const t = i / segs, r0 = 0.95 - 0.32 * t, r1 = 0.95 - 0.32 * ((i + 1) / segs);
    P.push(at(new THREE.CylinderGeometry(r1 * 0.93, r0 * 1.04, H / segs + 0.02, 9), i % 2 ? C.trunk : C.trunk2, { y: y0 + (H / segs) * (i + 0.5) }));
  }
  for (const d of discs) {
    const dx = d.cx - tree.x, dz = d.cz - tree.z, L = Math.hypot(dx, dz);
    const g = new THREE.CylinderGeometry(0.11, 0.2, L, 5);
    g.rotateZ(Math.PI / 2);
    g.rotateY(-Math.atan2(dz, dx));
    P.push(at(g, C.trunk2, { x: dx / 2, y: d.top - 0.42, z: dz / 2 }));
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + (i % 2) * 0.2;
    P.push(frondAt(3.2 + (i % 3) * 0.4, 2.0 + (i % 2) * 0.5, 0.8, tree.x, tree.top + 0.4, tree.z, a, 1.15, (i % 3 - 1) * 0.1));
  }
  for (let i = 0; i < 3; i++) P.push(frondAt(2.0, 0.3, 1.3, tree.x, tree.top + 0.5, tree.z, i * 2.1 + 0.5, 1, 0.7));
  P.push(at(new THREE.IcosahedronGeometry(0.42, 0), C.husk, { y: tree.top + 0.35, sy: 0.7 }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    P.push(at(new THREE.IcosahedronGeometry(0.28, 0), i % 2 ? C.nut : C.husk, { x: Math.cos(a) * 0.5, y: tree.top - 0.05, z: Math.sin(a) * 0.5 }));
  }
  return P;
}

/** A frond pad on the giant palm (a lookout disc). */
export function palmDiscParts(p) {
  return palmPad(p, Math.abs(p.cx * 7.3 + p.cz * 3.1) % 6.283);
}
