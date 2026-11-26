// The ghost ship's model (the actor that sails her is ghost-ship.js): an old
// three-master, built to be looked at closely and through.
//
// Hull: lofted sections with a poop, a quarterdeck and a forecastle, wales
// along her sides, gun ports, a stern gallery with lit windows, a rudder, a
// figurehead and an anchor at the cathead. On deck: rails, a hatch, a boat,
// the capstan, the wheel. Aloft: three masts with tops and topmasts, yards
// with their lifts, shrouds with ratlines, stays, torn square sails with holes
// in them, staysails, a spanker, pennants and an ensign in rags. Four
// lanterns burn green.
//
// She is one geometry drawn in two passes, so that she reads as one
// see-through shell and not as a tangle of overlapping sails: first her depth
// alone, then her colour wherever that depth is in front. Both passes come
// after the sea and the islands, so nothing behind her is cut away. Cloth
// carries a `aSway` weight per vertex and both passes move it the same way,
// so her rags stir while she herself holds still. Bow towards +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowBoost } from './toon.js';
import { glowTexture } from './world.js';
import { lerp, smoothstep, TAU } from './util.js';

const PI = Math.PI;
const C = { hull: '#9fdcc8', wale: '#72b9a3', deck: '#c9f2e2', sail: '#e4fff3', spar: '#b6ead8', rope: '#a4dccb', iron: '#84c7b2', lamp: '#8dffb9', glass: '#c9ffe2' };
const STERN = -9, STEM = 10;   // her hull runs from z = STERN to z = STEM
const WATER = 1.0;             // the height of her widest point (the main wale)
const frac = (v) => v - Math.floor(v);
const hash = (i, seed) => frac(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453);

// ----------------------------------------------------------------- helpers
/** Give every vertex one colour and no sway, and drop what the merge doesn't share. */
function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.aSway) g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}
const place = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => geo.applyMatrix4(new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

/** A spar or a rope from a to b ([x, y, z]), r0 thick at a and r1 at b. */
function line(a, b, r0 = 0.03, r1 = r0, seg = 4) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = cyl(r1, r0, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return place(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/**
 * A sheet of cloth from a function P(u, v) → [x, y, z], nu by nv squares, with
 * `holes` torn out of it and a sway weight per vertex. Flat-faced, so the
 * light catches each fold.
 */
function cloth(P, nu, nv, { seed = 1, holes = 0, sway = () => 0 } = {}) {
  // tears run down the cloth more than across it, and their edges are ragged
  const torn = Array.from({ length: holes }, (_, k) => [0.16 + hash(k, seed) * 0.68, 0.22 + hash(k + 9, seed) * 0.5, 0.045 + hash(k + 4, seed) * 0.075, 0.12 + hash(k + 7, seed) * 0.2]);
  const pos = [], sw = [];
  const put = (u, v) => { const p = P(u, v); pos.push(p[0], p[1], p[2]); sw.push(sway(u, v)); };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    const ragged = 0.55 + hash(i * 31 + j, seed + 2) * 0.9;
    if (torn.some(([hu, hv, ru, rv]) => ((uc - hu) / ru) ** 2 + ((vc - hv) / rv) ** 2 < ragged)) continue;
    put(u0, v0); put(u1, v0); put(u0, v1); put(u1, v0); put(u1, v1); put(u0, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
  g.computeVertexNormals();
  return g;
}

// -------------------------------------------------------------------- hull
/** Her shape at t along the hull (0 = stern, 1 = stem): z, half-breadth, deck height, keel depth. */
function hullAt(t) {
  const z = lerp(STERN, STEM, t);
  // full amidships, a broad stern, a sharp bow
  const w = 3.25 * Math.pow(Math.sin(Math.min(1, t * 1.2 + 0.5) * PI * 0.5), 0.8) * (t > 0.6 ? Math.pow(Math.max(0, 1 - (t - 0.6) / 0.4), 0.7) : 1) + 0.05;
  // the main deck, stepping up aft to the quarterdeck and the poop, and forward to the forecastle
  const deck = 2.5 + smoothstep(0.3, 0.27, t) * 1.4 + smoothstep(0.13, 0.1, t) * 1.2 + smoothstep(0.76, 0.79, t) * 1.0 + Math.pow(Math.max(0, t - 0.8) * 5, 2) * 0.9;
  const keel = -1.7 + Math.pow(Math.max(0, t - 0.72) * 3.6, 2) * 1.6 + Math.max(0, 0.1 - t) * 4;
  return { z, w, deck, keel };
}
const tOf = (z) => (z - STERN) / (STEM - STERN);
/** Half-breadth of her side at height y, at t (straight between the wale and the rail). */
function sideAt(t, y) {
  const H = hullAt(t);
  return H.w * lerp(1, 0.93, smoothstep(WATER, H.deck + 0.7, y));
}
const RAIL = 0.7; // the bulwark stands this far above the deck

function hullGeometry() {
  const N = 26, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const { z, w, deck, keel } = hullAt(i / N);
    // rail, deck edge, wale, turn of the bilge, keel; then up the other side
    for (const [k, y] of [[-0.93, deck + RAIL], [-0.95, deck], [-1, WATER], [-0.8, keel * 0.4], [0, keel], [0.8, keel * 0.4], [1, WATER], [0.95, deck], [0.93, deck + RAIL]]) pos.push(w * k, y, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 9, b = a + 9;
    for (let k = 0; k < 8; k++) idx.push(a + k, a + k + 1, b + k, b + k, a + k + 1, b + k + 1);
    idx.push(a + 7, a + 1, b + 7, b + 7, a + 1, b + 1); // the deck, side to side
  }
  for (let k = 1; k < 8; k++) idx.push(0, k, k + 1); // the transom
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/** A plank standing proud of her side from t0 to t1, `up(t)` high: the wales, and the rail's capping. */
function strake(t0, t1, up, tall = 0.2, proud = 0.07) {
  const out = [], n = 14;
  for (const s of [-1, 1]) {
    const pos = [];
    for (let i = 0; i < n; i++) {
      const a = lerp(t0, t1, i / n), b = lerp(t0, t1, (i + 1) / n), ya = up(a), yb = up(b);
      const xa = s * (sideAt(a, ya) + proud), xb = s * (sideAt(b, yb) + proud), za = hullAt(a).z, zb = hullAt(b).z;
      pos.push(xa, ya - tall / 2, za, xb, yb - tall / 2, zb, xa, ya + tall / 2, za, xb, yb - tall / 2, zb, xb, yb + tall / 2, zb, xa, ya + tall / 2, za);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

function hullParts() {
  const P = [tint(hullGeometry(), C.hull)];
  const deckOf = (t) => hullAt(t).deck;
  // three wales, and a capping rail along the top of the bulwark
  for (const g of [...strake(0, 0.97, () => WATER), ...strake(0, 0.95, (t) => lerp(WATER, deckOf(t), 0.55), 0.14), ...strake(0, 0.93, (t) => deckOf(t) - 0.12, 0.16)]) P.push(tint(g, C.wale));
  for (const g of strake(0, 0.96, (t) => deckOf(t) + RAIL, 0.12, 0.05)) P.push(tint(g, C.spar));
  // gun ports between the wales, their lids triced up
  for (let k = 0; k < 6; k++) {
    const t = 0.33 + k * 0.075, H = hullAt(t), y = lerp(WATER, H.deck, 0.3) + 0.25;
    for (const s of [-1, 1]) {
      const x = s * (sideAt(t, y) + 0.06);
      P.push(tint(place(box(0.08, 0.5, 0.58), x, y, H.z), C.glass), tint(place(box(0.06, 0.07, 0.66), x + s * 0.16, y + 0.36, H.z, 0, 0, s * 0.5), C.wale));
    }
  }
  // the stern: a gallery of lit windows under the taffrail, quarter pieces, the rudder
  const S = hullAt(0), sy = S.deck - 0.95;
  for (let k = 0; k < 4; k++) P.push(tint(place(box(0.62, 0.8, 0.08), (k - 1.5) * 0.92, sy, STERN - 0.05), C.glass));
  for (let k = 0; k < 5; k++) P.push(tint(place(box(0.1, 1.0, 0.12), (k - 2) * 0.92, sy, STERN - 0.07), C.spar));
  P.push(tint(place(box(4.3, 0.14, 0.5), 0, sy - 0.55, STERN - 0.2), C.wale), tint(place(box(4.5, 0.12, 0.3), 0, sy + 0.55, STERN - 0.1), C.wale));
  for (const s of [-1, 1]) P.push(tint(place(box(0.2, 2.4, 0.3), s * 2.15, sy - 0.2, STERN - 0.05, 0, 0, -s * 0.1), C.spar));
  P.push(tint(place(box(0.14, 3.6, 1.0), 0, 0.3, STERN - 0.5), C.wale));
  // the stem and the figurehead leaning out under the bowsprit
  const B = hullAt(0.97);
  P.push(tint(line([0, -0.2, STEM - 0.2], [0, B.deck + 0.3, STEM + 0.9], 0.16, 0.12), C.wale));
  P.push(tint(place(new THREE.SphereGeometry(0.34, 8, 6).scale(0.8, 1.9, 0.9), 0, B.deck - 0.3, STEM + 0.75, 0.55), C.sail));
  P.push(tint(place(new THREE.SphereGeometry(0.24, 8, 6), 0, B.deck + 0.42, STEM + 1.15), C.sail));
  for (const s of [-1, 1]) P.push(tint(line([s * 0.2, B.deck, STEM + 0.8], [s * 0.75, B.deck + 0.2, STEM - 0.5], 0.09, 0.03), C.sail)); // her arms, swept back
  // the anchor at the port cathead, and its cable
  const A = hullAt(0.86), ax = -(A.w + 0.75), ay = 1.5;
  P.push(tint(place(box(1.5, 0.2, 0.22), -(A.w + 0.15), A.deck + 0.55, A.z), C.spar), tint(line([ax, A.deck + 0.5, A.z], [ax, ay + 1.1, A.z], 0.03), C.rope));
  P.push(tint(line([ax, ay + 1.1, A.z], [ax, ay - 0.9, A.z], 0.08), C.iron), tint(place(box(0.1, 0.1, 1.3), ax, ay + 0.85, A.z), C.iron));
  P.push(tint(place(new THREE.TorusGeometry(0.55, 0.07, 4, 8, PI), ax, ay - 0.9 + 0.55, A.z, 0, PI / 2, PI), C.iron), tint(place(new THREE.TorusGeometry(0.14, 0.04, 4, 8), ax, ay + 1.2, A.z), C.iron));
  return P;
}

// -------------------------------------------------------------------- deck
function deckParts() {
  const P = [], main = 2.5, qd = hullAt(0.2).deck, poop = hullAt(0.05).deck, fc = hullAt(0.8).deck;
  // balustrades across the breaks of the decks, and the taffrail
  const rail = (z, y, half) => {
    P.push(tint(place(box(half * 2, 0.1, 0.12), 0, y + 0.85, z), C.spar));
    for (let x = -half; x <= half + 0.01; x += 0.5) P.push(tint(place(box(0.08, 0.85, 0.08), x, y + 0.42, z), C.spar));
  };
  rail(hullAt(0.3).z + 0.2, qd, hullAt(0.3).w * 0.9);
  rail(hullAt(0.135).z + 0.15, poop, hullAt(0.13).w * 0.9);
  rail(hullAt(0.76).z - 0.15, fc, hullAt(0.76).w * 0.88);
  rail(STERN + 0.15, poop, hullAt(0).w * 0.88);
  // the cabin's door and windows under the quarterdeck; ladders up either side
  const bz = hullAt(0.3).z + 0.42;
  P.push(tint(place(box(0.8, 1.2, 0.08), 0, main + 0.6, bz), C.glass));
  for (const s of [-1, 1]) {
    P.push(tint(place(box(0.5, 0.45, 0.08), s * 1.3, main + 0.9, bz), C.glass));
    for (let k = 0; k < 4; k++) P.push(tint(place(box(0.7, 0.06, 0.24), s * 2.2, main + 0.3 + k * 0.33, bz + 0.75 - k * 0.2), C.spar));
  }
  // the hatch and its grating, the boat on its chocks, the capstan, some casks
  P.push(tint(place(box(1.9, 0.18, 2.3), 0, main + 0.09, -1.9), C.wale));
  for (let k = 0; k < 5; k++) P.push(tint(place(box(1.7, 0.05, 0.1), 0, main + 0.2, -2.7 + k * 0.4), C.deck));
  P.push(tint(place(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, PI / 2).scale(0.85, 0.75, 2.3), 0, main + 0.35, 2.7), C.sail));
  P.push(tint(place(box(0.14, 0.2, 4.6), 0, main + 1.06, 2.7), C.spar));
  for (const z of [1.3, 4.1]) P.push(tint(place(box(1.8, 0.35, 0.16), 0, main + 0.17, z), C.spar));
  P.push(tint(place(cyl(0.34, 0.46, 0.9, 8), 0, fc + 0.45, 7.3), C.spar), tint(place(cyl(0.5, 0.5, 0.12, 8), 0, fc + 0.95, 7.3), C.wale));
  for (let k = 0; k < 6; k++) P.push(tint(place(box(1.9, 0.07, 0.07), 0, fc + 0.8, 7.3, 0, (k / 6) * PI), C.spar));
  for (const [x, z] of [[-1.9, -3.0], [-1.4, -3.1], [1.8, 5.0]]) P.push(tint(place(cyl(0.3, 0.3, 0.75, 8), x, main + 0.38, z), C.wale));
  // the wheel on the quarterdeck, with its binnacle before it
  const wz = -4.6;
  P.push(tint(place(new THREE.TorusGeometry(0.55, 0.05, 4, 12), 0, qd + 1.05, wz), C.spar), tint(place(box(0.2, 1.0, 0.3), 0, qd + 0.5, wz - 0.25), C.spar));
  for (let k = 0; k < 4; k++) P.push(tint(place(box(1.4, 0.05, 0.05), 0, qd + 1.05, wz, 0, 0, (k / 4) * PI), C.spar));
  P.push(tint(place(box(0.5, 0.8, 0.4), 0, qd + 0.4, wz + 0.9), C.wale), tint(place(box(0.3, 0.2, 0.3), 0, qd + 0.9, wz + 0.9), C.glass));
  return P;
}

// ----------------------------------------------------------------- the rig
/** A square sail hanging from its yard at height y: bellied, holed, its foot in rags. */
function squareSail(z, y, w, h, seed) {
  const nu = 18, nv = 11;
  return cloth((u, v) => {
    const rag = v < 1e-6 ? (0.05 + hash(Math.round(u * nu), seed) * 0.3) * h : 0;
    return [(u - 0.5) * w * (0.9 + 0.1 * v), y - (1 - v) * h + rag, z + Math.sin(u * PI) * Math.sin(Math.min(1, (1 - v) * 1.3) * PI * 0.5) * w * 0.13];
  }, nu, nv, { seed, holes: 3, sway: (u, v) => Math.pow(1 - v, 1.5) });
}

/** A three-cornered sail in the fore-and-aft plane: head, tack and clew are [y, z]; its foot (tack to clew) in rags. */
function staysail(head, tack, clew, seed) {
  return cloth((u, v) => {
    const fy = lerp(tack[0], clew[0], u), fz = lerp(tack[1], clew[1], u), rag = v < 1e-6 ? hash(Math.round(u * 12), seed) * 0.22 : 0;
    const k = Math.max(v, rag);
    return [Math.sin(u * PI) * (1 - v) * 0.35, lerp(fy, head[0], k), lerp(fz, head[1], k)];
  }, 12, 10, { seed, holes: 2, sway: (u, v) => (1 - v) * 0.7 });
}

/** A strip of torn canvas hanging from (x, y, z). */
const tatter = (x, y, z, len, seed) => cloth((u, v) => [x + (u - 0.5) * 0.45 * (0.4 + 0.6 * v), y - (1 - v) * len, z + (1 - v) * 0.15 * (hash(seed, 3) - 0.5)], 1, 4, { seed, sway: (u, v) => Math.pow(1 - v, 1.2) * 1.3 });

/** A mast at z, h tall above the deck, with its top, topmast, yards, sails, shrouds and ratlines. */
function mast(z, h, yards, seed, P) {
  const foot = hullAt(tOf(z)).deck, top = foot + h * 0.56, head = foot + h, half = sideAt(tOf(z), foot + RAIL);
  P.push(tint(line([0, foot - 1, z], [0, top + 1.2, z], 0.21, 0.15, 8), C.spar), tint(line([0, top - 0.3, z + 0.18], [0, head, z + 0.18], 0.12, 0.06, 6), C.spar));
  // the top: a platform with a rail, where the lower shrouds meet
  P.push(tint(place(cyl(0.85, 0.7, 0.12, 8), 0, top, z + 0.1), C.spar), tint(place(new THREE.TorusGeometry(0.85, 0.035, 4, 10), 0, top + 0.6, z + 0.1, PI / 2), C.spar));
  for (let k = 0; k < 6; k++) P.push(tint(place(cyl(0.03, 0.03, 0.6, 4), Math.cos((k / 6) * TAU) * 0.85, top + 0.3, z + 0.1 + Math.sin((k / 6) * TAU) * 0.85), C.spar));
  P.push(tint(place(box(1.2, 0.08, 0.08), 0, top + (head - top) * 0.62, z + 0.18), C.spar)); // the crosstrees
  yards.forEach(([at, w, drop], k) => {
    const y = foot + h * at, yz = z + 0.3;
    P.push(tint(line([-w / 2 - 0.4, y, yz], [w / 2 + 0.4, y, yz], 0.06, 0.06, 6), C.spar), tint(place(cyl(0.1, 0.1, w * 0.5, 6), 0, y, yz, 0, 0, PI / 2), C.spar));
    for (const s of [-1, 1]) P.push(tint(line([0, y + 1.6, z + 0.2], [s * (w / 2 + 0.3), y, yz], 0.02), C.rope)); // lifts
    if (drop) P.push(tint(squareSail(yz + 0.06, y, w, drop, seed + k * 5), C.sail));
    else for (let j = 0; j < 5; j++) P.push(tint(tatter(-w / 2 + (j + 0.5 + (hash(j, seed) - 0.5) * 0.5) * (w / 5), y, yz, 0.8 + hash(j, seed + 3) * 1.9, seed + j), C.sail)); // a bare yard, rags only
    for (const s of [-1, 1]) P.push(tint(tatter(s * (w / 2 + 0.1), y, yz, 1.2 + hash(k, seed + s) * 1.4, seed + k + s * 3), C.sail));
  });
  for (const s of [-1, 1]) {
    // three shrouds a side from the top to the rail, laddered with ratlines; two more up to the masthead
    const up = [s * 0.55, top, z + 0.1], down = (k) => [s * half, foot + RAIL, z - 0.3 - k * 0.85];
    for (let k = 0; k < 3; k++) P.push(tint(line(down(k), up, 0.028), C.rope));
    for (let r = 1; r < 9; r++) {
      const f = r / 9, a = down(0), b = down(2);
      P.push(tint(line([lerp(a[0], up[0], f), lerp(a[1], up[1], f), lerp(a[2], up[2], f)], [lerp(b[0], up[0], f), lerp(b[1], up[1], f), lerp(b[2], up[2], f)], 0.016), C.rope));
    }
    for (const dz of [-0.35, 0.35]) P.push(tint(line([s * 0.8, top + 0.05, z + 0.1 + dz], [s * 0.1, head - 0.8, z + 0.18], 0.02), C.rope));
    P.push(tint(line([s * half, foot + RAIL, z - 2.6], [0, head - 0.3, z + 0.18], 0.022), C.rope)); // a backstay
  }
  // a long pennant from the masthead, split at the fly
  P.push(tint(cloth((u, v) => [0, head + 0.25 + (v - 0.5) * 0.55 * (1 - u * 0.8) - u * 0.5 - (u > 0.7 ? Math.abs(v - 0.5) * (u - 0.7) * 2 : 0), z - u * 2.7], 6, 2, { seed, sway: (u) => u * 1.2 }), C.sail));
  return { foot, top, head };
}

function rigParts() {
  const P = [];
  const fore = mast(5.2, 16, [[0.36, 9.2, 4.6], [0.64, 7.0, 3.5], [0.88, 4.6, 0]], 11, P);
  const main = mast(0.2, 18.5, [[0.36, 10.6, 5.2], [0.64, 7.8, 4.0], [0.88, 5.2, 3.0]], 23, P);
  const miz = mast(-5.6, 12.5, [[0.7, 5.2, 2.6]], 37, P);
  // the bowsprit and jib-boom, their gammoning and the dolphin striker
  const fc = hullAt(0.9).deck, sprit = [0, fc + 0.5, 8.6], cap = [0, fc + 3.1, 14.6], boom = [0, fc + 4.3, 17.6];
  P.push(tint(line(sprit, cap, 0.2, 0.13, 8), C.spar), tint(line([0, cap[1] - 0.3, cap[2] - 0.8], boom, 0.1, 0.05, 6), C.spar));
  P.push(tint(line(cap, [0, cap[1] - 2.2, cap[2] + 0.2], 0.05), C.spar), tint(line([0, cap[1] - 2.2, cap[2] + 0.2], boom, 0.02), C.rope), tint(line([0, cap[1] - 2.2, cap[2] + 0.2], [0, 1.6, STEM + 0.3], 0.02), C.rope));
  // stays, masthead to masthead and down to the bowsprit
  for (const [a, b] of [[[0, fore.top, 5.3], cap], [[0, fore.head - 0.6, 5.4], boom], [[0, main.top, 0.3], [0, fore.foot + 2.5, 5.0]], [[0, main.head - 0.6, 0.4], [0, fore.top + 0.4, 5.3]],
    [[0, miz.top, -5.5], [0, main.foot + 5.5, 0.1]], [[0, miz.head - 0.4, -5.4], [0, main.top + 0.4, 0.2]]]) P.push(tint(line(a, b, 0.026), C.rope));
  // two staysails on the fore stays, in rags
  P.push(tint(staysail([fore.top - 0.8, 6.0], [fc + 1.4, 9.2], [cap[1] - 0.2, cap[2] - 0.6], 51), C.sail));
  P.push(tint(staysail([fore.head - 2.2, 6.4], [cap[1] + 0.4, cap[2] - 0.2], [boom[1] - 0.2, boom[2] - 0.5], 67), C.sail));
  // the spanker on the mizzen: gaff, boom, and what is left of the sail between them
  const mz = -5.6, by = miz.foot + 1.7, gaff = [0, miz.top + 1.6, mz - 4.4], bend = [0, by + 0.5, mz - 5.6];
  P.push(tint(line([0, miz.top - 1.2, mz - 0.2], gaff, 0.08, 0.05, 6), C.spar), tint(line([0, by, mz - 0.2], bend, 0.09, 0.06, 6), C.spar));
  P.push(tint(cloth((u, v) => {
    const rag = u > 1 - 1e-6 ? hash(Math.round(v * 10), 5) * 0.3 : 0, k = u * (1 - rag);
    return [Math.sin(v * PI) * u * 0.4, lerp(lerp(by + 0.2, by + 0.6, k), lerp(miz.top - 1.2, gaff[1], k), v), lerp(mz - 0.3, lerp(bend[2], gaff[2], v), k)];
  }, 12, 10, { seed: 41, holes: 2, sway: (u) => u * 0.8 }), C.sail));
  // the ensign on its staff at the taffrail, half of it gone
  const ez = STERN + 0.1, ey = hullAt(0).deck + 3.3;
  P.push(tint(line([0, hullAt(0).deck + 0.6, ez], [0, ey + 0.9, ez - 0.7], 0.05, 0.03), C.spar));
  P.push(tint(cloth((u, v) => [Math.sin(u * 5) * 0.18, ey + (v - 0.5) * 1.5 - u * 0.5 - u * 0.25, ez - 0.55 - u * (2.7 - (u > 1 - 1e-6 ? hash(Math.round(v * 5), 9) * 1.1 : 0))], 7, 5, { seed: 73, holes: 1, sway: (u) => u * 1.2 }), C.sail));
  return P;
}

// ---------------------------------------------------------------- lanterns
/** Where her four lanterns hang (ship space): the great stern lantern, one in the main shrouds each side, one at the bow. */
export const LAMPS = [[0, hullAt(0).deck + 2.3, STERN - 0.2], [2.75, 5.3, -0.9], [-2.75, 5.3, -0.9], [0, hullAt(0.93).deck + 1.7, 9.4]];

function lampParts() {
  const P = [];
  LAMPS.forEach(([x, y, z], i) => {
    const r = i ? 0.26 : 0.4;
    P.push(tint(place(new THREE.SphereGeometry(r, 8, 6).scale(1, 1.25, 1), x, y, z), C.lamp));
    P.push(tint(place(new THREE.ConeGeometry(r * 1.25, r * 0.9, 6), x, y + r * 1.6, z), C.iron), tint(place(cyl(r * 0.9, r * 0.7, r * 0.3, 6), x, y - r * 1.35, z), C.iron));
    for (let k = 0; k < 4; k++) P.push(tint(place(cyl(0.02, 0.02, r * 2.6, 4), x + Math.cos(k * PI / 2 + 0.8) * r * 1.05, y, z + Math.sin(k * PI / 2 + 0.8) * r * 1.05), C.iron));
    P.push(tint(line([x, y + r * 2, z], [x, y + r * 2 + (i ? 0.5 : 0.2), z], 0.025), C.iron));
  });
  // the stern lantern stands on a post; the bow one hangs from a crook
  P.push(tint(line([0, hullAt(0).deck + 0.8, STERN + 0.1], [0, LAMPS[0][1] - 0.55, STERN - 0.2], 0.06), C.iron));
  P.push(tint(line([0, hullAt(0.93).deck + 0.4, 8.9], [0, LAMPS[3][1] + 0.8, 9.1], 0.05), C.iron), tint(line([0, LAMPS[3][1] + 0.8, 9.1], [0, LAMPS[3][1] + 0.75, 9.4], 0.04), C.iron));
  return P;
}

let ghostGeo = null;
function ghostGeometry() {
  if (ghostGeo) return ghostGeo;
  const parts = [...hullParts(), ...deckParts(), ...rigParts(), ...lampParts()];
  ghostGeo = mergeGeometries(parts);
  ghostGeo.computeBoundingSphere();
  for (const p of parts) p.dispose();
  return ghostGeo;
}

// ------------------------------------------------------------ the materials
const ghostTime = { value: 0 }; // shared by both passes, so the cloth moves the same in each
const SWAY_PARS = '#include <common>\nattribute float aSway;\nuniform float uGhostT;';
const SWAY = '#include <begin_vertex>\ntransformed.z += sin(uGhostT * 1.3 + position.y * 0.5 + position.x * 0.4) * aSway * 0.3;\ntransformed.x += cos(uGhostT * 1.1 + position.y * 0.4 + position.z * 0.3) * aSway * 0.14;';

/**
 * The ghost ship's model: { group, setFade(k, time) }. k = 0 is gone, 1 is
 * as solid as she gets.
 */
export function buildGhostShip() {
  const geo = ghostGeometry();
  // pass one: depth only (drawn with the see-through things, after the sea)
  const veilMat = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, side: THREE.DoubleSide });
  veilMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGhostT = ghostTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', SWAY_PARS).replace('#include <begin_vertex>', SWAY);
  };
  veilMat.customProgramCacheKey = () => 'ghostVeil';
  const veil = new THREE.Mesh(geo, veilMat);
  veil.renderOrder = 6;
  // pass two: her colour where that depth is nearest; brighter on edges turned away from you
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGhostT = ghostTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', SWAY_PARS + '\nvarying vec3 vGhostN;\nvarying vec3 vGhostV;')
      .replace('#include <begin_vertex>', SWAY + '\nvGhostN = normalize(normalMatrix * normal);\nvGhostV = -(modelViewMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGhostN;\nvarying vec3 vGhostV;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat ghostRim = 1.0 - abs(dot(normalize(vGhostN), normalize(vGhostV)));\ndiffuseColor.a *= 0.42 + 0.58 * ghostRim * ghostRim;\ndiffuseColor.rgb *= 0.8 + 0.5 * ghostRim;');
  };
  mat.customProgramCacheKey = () => 'ghostShip';
  const body = new THREE.Mesh(geo, mat);
  body.renderOrder = 7;
  const group = new THREE.Group();
  group.add(veil, body);
  const glows = LAMPS.map(([x, y, z]) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7dffb0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.set(x, y, z);
    glow.renderOrder = 8;
    group.add(glow);
    return glow;
  });
  function setFade(k, time = 0) {
    group.visible = k > 0.01;
    mat.opacity = 0.62 * k;
    ghostTime.value = time;
    glows.forEach((glow, i) => {
      const flick = 1 + Math.sin(time * 2.3 + i * 2.1) * 0.08 + Math.sin(time * 5.7 + i) * 0.04;
      glow.material.opacity = k * 0.85;
      glow.material.color.set(0x7dffb0).multiplyScalar(Math.min(glowBoost.value, 1.6));
      glow.scale.setScalar((i ? 4.6 : 6.5) * flick);
    });
  }
  setFade(0);
  return { group, setFade };
}
