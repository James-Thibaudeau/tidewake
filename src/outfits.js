// Geometry for every wearable style, plus the parameterised face texture.
//
// buildOutfit(profile) returns, for each bone of the explorer's skeleton, a
// list of vertex-coloured parts (in that bone's local space) which the
// Explorer merges into one inked mesh per bone. The skeleton itself (and the
// coordinates below) lives in explorer.js; the numbers here are shared with it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, color } from './cosmetics.js';

const PI = Math.PI, TAU = Math.PI * 2;

// --------------------------------------------------------- geometry helpers
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

function matrixOf(t) {
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ');
  _q.setFromEuler(_e);
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
  return _m.compose(_p, _q, _s);
}

/** Bake a primitive into a vertex-coloured, non-indexed part. */
export function part(geo, col, t = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.applyMatrix4(matrixOf(t));
  const c = new THREE.Color(col);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function mergeParts(parts) {
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

/** Turn a part inside out (reverse winding, flip normals), e.g. for a lining. */
function inward(g) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  for (let i = 0; i < pos.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t;
      const u = nor[i + 3 + k]; nor[i + 3 + k] = nor[i + 6 + k]; nor[i + 6 + k] = u;
    }
  }
  for (let i = 0; i < nor.length; i++) nor[i] = -nor[i];
  return g;
}

/** Merge already-coloured parts and move the result as one piece. */
function group(parts, t) {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.applyMatrix4(matrixOf(t));
  return g;
}

const cyl = (rt, rb, h, seg = 12, open = false, ts = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
const sph = (r, w = 12, h = 8, ps = 0, pl = TAU, ts = 0, tl = PI) => new THREE.SphereGeometry(r, w, h, ps, pl, ts, tl);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const tor = (r, t, rs = 5, ts = 12) => new THREE.TorusGeometry(r, t, rs, ts);
const cone = (r, h, seg = 5) => new THREE.ConeGeometry(r, h, seg);

const mix = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

// --------------------------------------------------------------- skeleton
// Joint positions (root space unless noted) and the head centre, shared with
// explorer.js. The figure is about four and a half heads tall: legs a little
// under half the height, hands hanging to mid-thigh.
export const HIP_Y = 0.84, KNEE_Y = 0.44, ANKLE_Y = 0.07, HIP_X = 0.085;
export const TORSO_Y = 0.85;                    // the torso's origin (it pivots at the hips)
export const SHOULDER_X = 0.2, SHOULDER_Y = 0.47; // torso space
export const NECK_Y = 0.65;                     // the head's pivot, torso space
export const ARM_L1 = 0.28, ARM_L2 = 0.27;      // upper arm, forearm to the middle of the hand
// The head (skull, hair, hats, face) is modelled around a 0.32 sphere whose
// centre is HC above the head pivot, then drawn at HEAD_SCALE.
export const HC = 0.3, HEAD_SCALE = 0.66;
export const BONES = ['hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR', 'torso', 'shL', 'shR', 'elL', 'elR', 'head', 'tail1', 'tail2'];

// Fixed trim colours
const BELT = '#5b3a1f', BUCKLE = '#ffd24a', GLOVE = '#8a5a32', SOCK = '#ffffff', GOLD = '#f2c84b';

function resolve(p) {
  const skin = color(SKIN_TONES, p.skin);
  const hair = color(HAIR_COLORS, p.hair.color);
  const cl = (id) => color(CLOTH_COLORS, id);
  return {
    skin: skin.base, skinShade: skin.dark, hair: hair.base, hair2: hair.dark,
    hat: cl(p.hat.color), top: cl(p.top.color), shirt: cl(p.top.shirt), bottom: cl(p.bottom.color),
    boots: cl(p.boots.color), neck: cl(p.neck.color), extra: cl(p.extra.color),
  };
}

// How far the outer layer sits from the torso centre at chest height, so
// straps and packs ride on top of whatever is worn.
const CHEST_R = { vest: 0.232, sailor: 0.222, tank: 0.222, coat: 0.262, poncho: 0.292 };
// Half the angle each poncho panel (front, back) wraps; the rest is open at the sides
const PONCHO_HALF = 0.82;

// ------------------------------------------------------------ back profile
// The scarf tail hangs down the back and has to ride over whatever is worn.
// backProfile() gives the outer radius of the clothes round the torso axis at
// each height (torso space), sampled every BACK_STEP from BACK_TOP down to
// -0.3. It mirrors the torso geometry in buildTorso/buildExtra; the explorer
// lifts the tail just clear of it (see Explorer.aimTail).
export const BACK_TOP = 0.62, BACK_STEP = 0.02;
const BACK_N = Math.round((BACK_TOP + 0.3) / BACK_STEP) + 1;

function backProfile(p) {
  const r = new Float32Array(BACK_N);
  // Every piece also widens the samples either side of it, so thin rings
  // (hems, stripes) between two samples aren't missed.
  const each = (y0, y1, f) => {
    for (let i = 0; i < BACK_N; i++) {
      const y = BACK_TOP - i * BACK_STEP;
      if (y > y0 + BACK_STEP || y < y1 - BACK_STEP) continue;
      r[i] = Math.max(r[i], f(Math.min(y0, Math.max(y1, y))));
    }
  };
  const ring = (y0, y1, r0, r1 = r0) => each(y0, y1, (y) => r0 + (r1 - r0) * (y0 - y) / (y0 - y1 || 1));
  const dome = (yc, rr, h) => each(yc + h, yc, (y) => rr * Math.sqrt(Math.max(0, 1 - ((y - yc) / h) ** 2)));
  const shirt = () => { ring(0.51, 0.13, 0.205, 0.235); dome(0.5, 0.205, 0.113); };

  // hips and belt; the skirt flares out below them
  ring(0.1, -0.04, 0.235, 0.225);
  ring(0.1375, 0.0825, 0.245);
  if (p.bottom.style === 'skirt') { ring(0.05, -0.17, 0.236, 0.31); ring(-0.1375, -0.1725, 0.312); }

  const top = p.top.style;
  if (top === 'vest') {
    shirt();
    ring(0.465, 0.135, 0.228, 0.255);
  } else if (top === 'sailor') {
    shirt();
    for (const y of [0.2, 0.27, 0.34, 0.41]) ring(y + 0.013, y - 0.013, 0.235 - ((y - 0.13) / 0.38) * 0.03 + 0.015);
    ring(0.541, 0.388, 0.18, 0.25); // the collar flap, tipped out at the bottom
    ring(0.41, 0.39, 0.245);
  } else if (top === 'tank') {
    shirt();
    ring(0.212, 0.188, 0.232);
  } else if (top === 'poncho') {
    shirt();
    dome(0.52, 0.214, 0.107);
    ring(0.52, 0.1, 0.218, 0.35);
    ring(0.205, 0.175, 0.322);
    ring(0.253, 0.227, 0.304);
    ring(0.125, 0.05, 0.36); // hem and tassels
  } else if (top === 'coat') {
    shirt();
    ring(0.49, -0.01, 0.232, 0.268);
    ring(0.01, -0.25, 0.268, 0.335);
    ring(-0.225, -0.255, 0.337);
  }

  if (p.extra.style === 'satchel') {
    // the strap lies across the back, on top of whatever is worn
    for (let i = 0; i < BACK_N; i++) {
      const y = BACK_TOP - i * BACK_STEP;
      if (y <= 0.58 && y >= 0.12) r[i] += 0.014;
    }
  }
  return r;
}

// ------------------------------------------------------------- body shape
// The torso and everything worn on it are modelled round a plain barrel, then
// a smooth field narrows them into a body: hips, a waist, a chest that is
// wider than it is deep, and shoulders. Every layer goes through the same
// field, so clothes, straps and packs keep sitting on one another.
//   [torso height, width factor, depth factor]
const BODY = [
  [-0.3, 0.8, 0.64], [-0.04, 0.74, 0.58], [0.07, 0.72, 0.56], [0.18, 0.65, 0.5],
  [0.3, 0.76, 0.56], [0.42, 0.87, 0.61], [0.5, 0.9, 0.6], [0.58, 0.86, 0.66], [0.66, 0.8, 0.8],
];
const _bk = { kx: 1, kz: 1 };
function bodyAt(y) {
  let i = 1;
  while (i < BODY.length - 1 && y > BODY[i][0]) i++;
  const a = BODY[i - 1], b = BODY[i];
  const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0]))), e = t * t * (3 - 2 * t);
  _bk.kx = a[1] + (b[1] - a[1]) * e;
  _bk.kz = a[2] + (b[2] - a[2]) * e;
  return _bk;
}
/** Depth factor of the body field at torso height `y` (for things placed behind the back). */
export const bodyDepth = (y) => bodyAt(y).kz;
/** Width factor of the body field at torso height `y` (for things hung at the side). */
export const bodyWidth = (y) => bodyAt(y).kx;

/**
 * A flat band lying on the clothes: straps, pocket flaps, lapels. `R(y)` is
 * the surface radius at each height (see backProfile), `pts` a path of
 * [angle round the body (0 = front, toward +x), height]; the band is `w` wide
 * across the path and stands `th` proud. Built round the barrel, so it takes
 * the body's shape with everything else.
 */
function band(col, R, pts, w, th, seg = 6) {
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      P.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
    }
  }
  P.push(pts[pts.length - 1]);
  const C = P.map(([a, y]) => new THREE.Vector3(R(y) * Math.sin(a), y, R(y) * Math.cos(a)));
  const pos = [], idx = [], n = new THREE.Vector3(), t = new THREE.Vector3(), side = new THREE.Vector3();
  P.forEach(([a], i) => {
    n.set(Math.sin(a), 0, Math.cos(a));
    t.subVectors(C[Math.min(i + 1, C.length - 1)], C[Math.max(i - 1, 0)]).normalize();
    side.crossVectors(n, t).normalize().multiplyScalar(w / 2);
    // sunk a little into the cloth so no gap shows under the edges
    for (const [u, v] of [[-1, -0.012], [-1, th], [1, th], [1, -0.012]]) {
      pos.push(C[i].x + side.x * u + n.x * v, C[i].y + side.y * u, C[i].z + side.z * u + n.z * v);
    }
  });
  for (let i = 0; i < P.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + (k + 1) % 4;
      idx.push(a, a + 4, b, b, a + 4, b + 4);
    }
  }
  const e = (P.length - 1) * 4;
  idx.push(0, 1, 2, 0, 2, 3, e, e + 2, e + 1, e, e + 3, e + 2);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return part(g, col);
}
/** Where a point `off` outside the clothes sits, as a part transform (it faces outward). */
const onBody = (R, a, y, off = 0) => ({ x: (R(y) + off) * Math.sin(a), y, z: (R(y) + off) * Math.cos(a), ry: a });

/** Mark a torso part as rigid: it is authored on the shaped body and isn't reshaped with the clothes. */
const rigid = (g) => { g.userData.rigid = true; return g; };

/** Narrow a torso-space part into the body's shape, in place. */
function shapeBody(geo) {
  if (geo.userData.rigid) return geo;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const { kx, kz } = bodyAt(pos.getY(i));
    pos.setX(i, pos.getX(i) * kx);
    pos.setZ(i, pos.getZ(i) * kz);
    if (nor) {
      const nx = nor.getX(i) / kx, ny = nor.getY(i), nz = nor.getZ(i) / kz, l = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(i, nx / l, ny / l, nz / l);
    }
  }
  return geo;
}

/** Outer radius of the clothes at torso height `y`, from a backProfile(). */
export function backRadius(back, y) {
  const f = (BACK_TOP - y) / BACK_STEP;
  if (f < 0) return 0;
  const i = Math.floor(f);
  if (i >= BACK_N - 1) return back[BACK_N - 1];
  return Math.max(back[i], back[i + 1]);
}

/** The clothes' radius at torso height `y`, interpolated (backRadius errs outward; this follows the surface). */
function surfaceRadius(back, y) {
  const f = Math.min(BACK_N - 1, Math.max(0, (BACK_TOP - y) / BACK_STEP)), i = Math.min(BACK_N - 2, Math.floor(f));
  return back[i] + (back[i + 1] - back[i]) * (f - i);
}

/**
 * profile must already be normalized (see cosmetics.normalizeProfile).
 * Returns { parts: { bone: BufferGeometry[] }, tail, armOut }, where tail is
 * { visible, seg2Z, len2, anchor: { y, z }, back } for the scarf tail and
 * armOut is how much wider (radians) the arms should hang to clear the clothes.
 */
export function buildOutfit(p) {
  const c = resolve(p);
  const B = Object.fromEntries(BONES.map((k) => [k, []]));
  const tail = { visible: false, seg2Z: 0.21, len2: 0.2, anchor: { y: 0.52, z: -0.1 }, back: null };
  // the outer surface of the clothes (without bags), for things that lie on them
  const worn = backProfile({ ...p, extra: { style: 'none' } });
  const R = (y) => surfaceRadius(worn, y);
  buildLegs(B, p, c);
  buildTorso(B, p, c, R);
  buildArms(B, p, c);
  buildNeck(B, p, c, tail);
  buildExtra(B, p, c, R);
  for (const g of B.torso) shapeBody(g);
  if (tail.back) {
    // the scarf tail rides over the shaped back
    tail.anchor.z *= bodyDepth(tail.anchor.y);
    for (let i = 0; i < BACK_N; i++) tail.back[i] *= bodyDepth(BACK_TOP - i * BACK_STEP);
  }
  // the neck (not part of the barrel, so it keeps its own shape)
  B.torso.push(
    part(cyl(0.05, 0.058, 0.16, 10), c.skin, { y: 0.6 }),
    part(sph(0.058, 10, 6), c.skin, { y: 0.53, sy: 0.6 }),
  );
  buildHead(B, p, c);
  // long skirts of cloth at the hip: the arms hang a little wider to clear them
  const armOut = { coat: 0.09, poncho: 0.04 }[p.top.style] ?? 0;
  return { parts: B, tail, armOut };
}

// ------------------------------------------------------------------- legs
// Thigh (hip bone), shin (knee bone) and foot (ankle bone), each modelled
// hanging straight down from its joint.
/** A tapered limb section from height y0 down to y1. */
const tube = (r0, r1, y0, y1, col, seg = 10, t = {}) => part(cyl(r0, r1, y0 - y1, seg), col, { y: (y0 + y1) / 2, ...t });
const hoop = (r, th, y, col, t = {}) => part(tor(r, th, 5, 12), col, { y, rx: PI / 2, ...t });

function buildLegs(B, p, c) {
  const bst = p.bottom.style, bcol = c.bottom, boots = p.boots.style, kcol = c.boots;
  const TH = HIP_Y - KNEE_Y, SH = KNEE_Y - ANKLE_Y;
  const long = bst === 'trousers' || bst === 'cargo';
  for (const s of [1, -1]) {
    const H = s > 0 ? B.hipL : B.hipR, K = s > 0 ? B.kneeL : B.kneeR, F = s > 0 ? B.footL : B.footR;

    // ---- thigh
    if (bst === 'skirt') {
      // the skirt hangs from the torso
      H.push(part(sph(0.076, 10, 6), c.skin), tube(0.076, 0.058, 0, -TH, c.skin));
    } else if (long) {
      H.push(part(sph(0.084, 10, 6), bcol.base), tube(0.084, 0.064, 0, -TH, bcol.base, 12));
      if (bst === 'cargo') {
        H.push(
          part(box(0.03, 0.1, 0.1), bcol.dark, { x: s * 0.07, y: -0.2 }),
          part(box(0.034, 0.025, 0.108), bcol.base, { x: s * 0.072, y: -0.148 }),
        );
      }
    } else {
      // shorts to mid-thigh, a little loose at the cuff
      H.push(
        part(sph(0.084, 10, 6), bcol.base),
        tube(0.084, 0.08, 0, -0.19, bcol.base, 12),
        hoop(0.078, 0.012, -0.19, bcol.dark),
        tube(0.07, 0.058, -0.17, -TH, c.skin),
      );
    }

    // ---- knee and shin: trouser legs bend with the knee
    if (long) {
      K.push(
        part(sph(0.064, 10, 6), bcol.base),
        tube(0.064, 0.055, 0, -SH + 0.07, bcol.base, 12),
        hoop(0.054, 0.011, -SH + 0.075, bcol.dark),
        tube(0.04, 0.038, -SH + 0.09, -SH, c.skin),
      );
    } else {
      K.push(
        part(sph(0.058, 10, 6), c.skin),
        tube(0.058, 0.042, 0, -SH, c.skin),
        // the calf
        part(sph(0.05, 10, 6), c.skin, { y: -0.13, z: -0.014, sx: 0.95, sy: 2.1 }),
      );
    }

    // ---- boots: the shaft rides on the shin, the foot turns at the ankle
    const shoe = (col, sole) => F.push(
      part(sph(0.066, 12, 8), col, { y: -0.018, z: 0.05, sx: 0.95, sy: 0.76, sz: 1.8 }),
      part(sph(0.05, 10, 6), col, { y: 0.0, z: -0.012, sy: 1.1 }),
      part(box(0.128, 0.028, 0.262), sole, { y: -0.056, z: 0.048 }),
    );
    if (boots === 'sandals') {
      F.push(
        part(sph(0.052, 10, 6), c.skin, { y: -0.026, z: 0.05, sy: 0.62, sz: 2.0 }),
        part(sph(0.04, 8, 6), c.skin, { y: 0.0, z: -0.008 }),
        part(box(0.112, 0.022, 0.25), kcol.dark, { y: -0.059, z: 0.05 }),
        hoop(0.043, 0.01, 0.022, kcol.base),
        part(box(0.108, 0.018, 0.03), kcol.base, { y: -0.012, z: 0.105, rx: -0.3 }),
        part(box(0.108, 0.018, 0.03), kcol.base, { y: -0.002, z: 0.04 }),
      );
    } else if (boots === 'tall') {
      K.push(
        tube(0.064, 0.058, -0.09, -SH - 0.012, kcol.base, 12),
        hoop(0.064, 0.015, -0.09, kcol.dark),
        hoop(0.061, 0.01, -0.24, kcol.dark),
        part(box(0.024, 0.03, 0.026), BUCKLE, { x: s * 0.06, y: -0.24 }),
      );
      shoe(kcol.base, kcol.dark);
    } else { // chunky
      K.push(
        tube(0.048, 0.046, -0.17, -0.26, SOCK),
        tube(0.062, 0.06, -0.245, -SH - 0.012, kcol.base, 12),
        hoop(0.061, 0.014, -0.245, kcol.dark),
      );
      shoe(kcol.base, kcol.dark);
    }
  }
}

// ------------------------------------------------------------------ torso
function shirtBody(T, col) {
  T.push(
    part(cyl(0.205, 0.235, 0.38, 16), col, { y: 0.32 }),
    part(sph(0.205, 16, 8, 0, TAU, 0, PI / 2), col, { y: 0.5, sy: 0.55 }),
  );
}
function shirtCollar(T, col) {
  T.push(
    part(cone(0.07, 0.09, 3), col, { x: 0.07, y: 0.53, z: 0.13, rx: 1.1, rz: -0.3 }),
    part(cone(0.07, 0.09, 3), col, { x: -0.07, y: 0.53, z: 0.13, rx: 1.1, rz: 0.3 }),
  );
}

function buildTorso(B, p, c, R) {
  const T = B.torso, top = p.top.style, tc = c.top, sc = c.shirt;
  // hips, belt and neck are always there
  if (p.bottom.style === 'skirt') {
    T.push(
      part(cyl(0.235, 0.225, 0.14, 16), c.bottom.base, { y: 0.03 }),
      part(cyl(0.236, 0.31, 0.22, 18, true), c.bottom.base, { y: -0.06 }),
      part(cyl(0.31, 0.312, 0.035, 18, true), c.bottom.dark, { y: -0.155 }),
    );
    // pleats
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      T.push(part(box(0.012, 0.2, 0.018), c.bottom.dark, { x: Math.sin(a) * 0.275, y: -0.065, z: Math.cos(a) * 0.275, ry: a, rx: -0.33, order: 'YXZ' }));
    }
  } else {
    T.push(part(cyl(0.235, 0.225, 0.14, 16), c.bottom.base, { y: 0.03 }));
  }
  T.push(
    part(cyl(0.245, 0.245, 0.055, 16), BELT, { y: 0.11 }),
    part(box(0.085, 0.065, 0.03), BUCKLE, { y: 0.11, z: 0.245 }),
    part(box(0.045, 0.03, 0.035), BELT, { y: 0.11, z: 0.25 }),
  );

  if (top === 'vest') {
    shirtBody(T, sc.base);
    T.push(
      part(cyl(0.228, 0.255, 0.33, 16, true, 0.5, TAU - 1.0), tc.base, { y: 0.3 }),
      part(cyl(0.24, 0.24, 0.025, 16, true, 0.5, TAU - 1.0), tc.dark, { y: 0.145 }),
    );
    shirtCollar(T, sc.base);
    // a patch pocket on each side, with a buttoned flap
    for (const s of [-1, 1]) {
      const a = s * 0.78;
      T.push(
        band(tc.dark, R, [[a - 0.2, 0.255], [a + 0.2, 0.255]], 0.085, 0.008, 4),
        band(tc.base, R, [[a - 0.22, 0.305], [a + 0.22, 0.305]], 0.036, 0.014, 4),
        part(sph(0.013, 6, 4), BUCKLE, onBody(R, a, 0.298, 0.014)),
      );
    }
  } else if (top === 'sailor') {
    shirtBody(T, sc.base);
    // stripes around the body
    for (const y of [0.2, 0.27, 0.34, 0.41]) {
      const r = (yy) => 0.235 - ((yy - 0.13) / 0.38) * 0.03 + 0.004;
      T.push(part(cyl(r(y + 0.013), r(y - 0.013), 0.026, 24, true), tc.base, { y }));
    }
    // the big square collar flap on the back and its front points
    T.push(
      band(tc.base, R, [[PI - 0.95, 0.45], [PI + 0.95, 0.45]], 0.15, 0.01, 10),
      band(sc.base, R, [[PI - 0.95, 0.4], [PI + 0.95, 0.4]], 0.014, 0.013, 10),
      part(cone(0.085, 0.14, 3), tc.base, { x: 0.07, y: 0.49, z: 0.15, rx: 1.25, rz: -0.45 }),
      part(cone(0.085, 0.14, 3), tc.base, { x: -0.07, y: 0.49, z: 0.15, rx: 1.25, rz: 0.45 }),
      part(sph(0.035, 8, 6), c.neck.base, { y: 0.44, z: 0.2, sx: 1.6, sz: 0.7 }),
    );
  } else if (top === 'tank') {
    T.push(
      part(cyl(0.205, 0.235, 0.38, 16), tc.base, { y: 0.32 }),
      part(sph(0.205, 16, 8, 0, TAU, 0, PI / 2), tc.base, { y: 0.5, sy: 0.55 }),
      part(tor(0.22, 0.012, 4, 20), tc.dark, { y: 0.2, rx: PI / 2 }),
      part(tor(0.085, 0.014, 4, 14), tc.dark, { y: 0.565, rx: PI / 2 + 0.25, sy: 1.1 }),
    );
  } else if (top === 'poncho') {
    shirtBody(T, sc.base);
    T.push(
      part(sph(0.214, 18, 6, 0, TAU, 0, PI / 2), tc.base, { y: 0.52, sy: 0.5 }),
      part(tor(0.085, 0.02, 5, 14), tc.dark, { y: 0.575, rx: PI / 2 }),
    );
    // A front and a back panel drape from the shoulders to just over the
    // belt. The sides stay open so the arms hang and swing in the gaps
    // instead of through the cloth.
    const panel = (r0, r1, h, y, col, a) => part(cyl(r0, r1, h, 9, true, a - PONCHO_HALF, PONCHO_HALF * 2), col, { y });
    for (const a of [0, PI]) {
      T.push(
        panel(0.218, 0.35, 0.42, 0.31, tc.base, a),
        // ...with a lining, or the ink outline would show through the open
        // sides as a solid black inside
        inward(part(cyl(0.215, 0.347, 0.42, 9, true, a - PONCHO_HALF, PONCHO_HALF * 2), tc.dark, { y: 0.31 })),
        panel(0.318, 0.322, 0.03, 0.19, tc.dark, a),
        panel(0.3, 0.304, 0.026, 0.24, sc.base, a),
        panel(0.352, 0.356, 0.04, 0.105, tc.dark, a),
      );
      // tassels along the hem
      for (let i = 0; i < 6; i++) {
        const t = a + (i / 5 - 0.5) * PONCHO_HALF * 1.85;
        T.push(part(box(0.018, 0.05, 0.018), tc.dark, { x: Math.sin(t) * 0.35, y: 0.075, z: Math.cos(t) * 0.35 }));
      }
    }
  } else if (top === 'coat') {
    shirtBody(T, sc.base);
    shirtCollar(T, sc.base);
    T.push(
      part(cyl(0.232, 0.268, 0.5, 18, true, 0.45, TAU - 0.9), tc.base, { y: 0.24 }),
      // the skirts flare enough to cover a skirt worn underneath
      part(cyl(0.268, 0.335, 0.26, 18, true, 0.9, TAU - 1.8), tc.base, { y: -0.12 }),
      part(cyl(0.335, 0.337, 0.03, 18, true, 0.9, TAU - 1.8), tc.dark, { y: -0.24 }),
    );
    for (const s of [-1, 1]) {
      // lapels, and a row of buttons down each front edge
      T.push(band(tc.dark, R, [[s * 0.5, 0.5], [s * 0.62, 0.33]], 0.07, 0.008, 5));
      for (const y of [0.2, 0.28, 0.36]) T.push(part(sph(0.017, 6, 4), GOLD, onBody(R, s * 0.66, y, 0.006)));
    }
  }
}

// ------------------------------------------------------------------- arms
function buildArms(B, p, c) {
  const top = p.top.style, tc = c.top, sc = c.shirt;
  const L1 = ARM_L1, wrist = ARM_L2 - 0.065;
  for (const s of [1, -1]) {
    const SH = s > 0 ? B.shL : B.shR, EL = s > 0 ? B.elL : B.elR;
    if (top === 'tank') {
      SH.push(
        part(sph(0.058, 10, 8), c.skin),
        tube(0.056, 0.045, 0, -L1, c.skin),
      );
    } else if (top === 'coat') {
      SH.push(
        part(sph(0.07, 10, 8), tc.base),
        tube(0.068, 0.058, 0, -L1, tc.base),
      );
    } else {
      const sleeve = sc.base;
      const cuff = top === 'poncho' ? sc.dark : tc.base;
      SH.push(
        part(sph(0.067, 10, 8), sleeve),
        tube(0.066, 0.061, 0, -0.13, sleeve),
        hoop(0.06, 0.01, -0.13, cuff, {}),
        tube(0.05, 0.045, -0.12, -L1, c.skin),
      );
      if (top === 'sailor') SH.push(hoop(0.065, 0.008, -0.07, tc.base));
    }
    if (top === 'coat') {
      EL.push(
        part(sph(0.058, 8, 6), tc.base),
        tube(0.058, 0.05, 0, -wrist + 0.03, tc.base),
        hoop(0.05, 0.013, -wrist + 0.03, sc.base),
        tube(0.036, 0.036, -wrist + 0.03, -wrist, c.skin),
      );
    } else {
      EL.push(
        part(sph(0.045, 8, 6), c.skin),
        tube(0.045, 0.036, 0, -wrist, c.skin),
      );
    }
    EL.push(
      tube(0.041, 0.041, -wrist + 0.015, -wrist - 0.02, GLOVE),
      part(sph(0.043, 10, 8), GLOVE, { y: -ARM_L2 + 0.004, sx: 0.8, sy: 1.25 }),
      part(sph(0.02, 6, 4), GLOVE, { x: s * -0.03, y: -ARM_L2 + 0.016, z: 0.028 }),
    );
  }
}

// ------------------------------------------------------------------- neck
function buildNeck(B, p, c, tail) {
  const T = B.torso, st = p.neck.style, nc = c.neck;
  if (st === 'scarf' || st === 'grandScarf') {
    const grand = st === 'grandScarf';
    const base = grand ? '#c25a4c' : nc.base, dark = grand ? '#97423a' : nc.dark;
    T.push(
      part(tor(grand ? 0.125 : 0.12, grand ? 0.062 : 0.058, 8, 18), base, { y: 0.575, rx: PI / 2 + 0.12 }),
      part(sph(0.065, 8, 6), dark, { x: 0.08, y: 0.535, z: 0.1 }),
    );
    // A backpack (and its bedroll) covers the back of the neck: the tail is
    // tucked away behind it.
    tail.visible = p.extra.style !== 'backpack';
    if (tail.visible) {
      // The tail comes out of a knot at the back of the neck, sitting on top of
      // whatever is worn round the shoulders, so it hangs over the clothes.
      const back = backProfile(p);
      let shoulder = 0;
      for (let y = 0.5; y <= 0.6; y += BACK_STEP) shoulder = Math.max(shoulder, backRadius(back, y));
      const ring = 0.17, az = Math.max(ring, shoulder + 0.025);
      tail.back = back;
      tail.anchor = { y: 0.55, z: -az };
      T.push(part(sph(0.06, 10, 8), base, {
        x: 0.02, y: 0.555, z: -(ring + az) / 2, sx: 1.1, sy: 0.75, sz: Math.max(1, ((az - ring) / 2 + 0.02) / 0.06),
      }));
    }
    if (grand) {
      // a longer, sun-faded scarf with a cream stripe and frayed end
      tail.seg2Z = 0.29;
      tail.len2 = 0.29;
      B.tail1.push(part(box(0.12, 0.03, 0.3), base, { z: 0.15 }));
      B.tail2.push(
        part(box(0.11, 0.028, 0.28), base, { z: 0.14 }),
        part(box(0.112, 0.032, 0.03), '#e8c98a', { z: 0.18 }),
        part(box(0.112, 0.032, 0.03), '#e8c98a', { z: 0.23 }),
        part(box(0.11, 0.03, 0.035), dark, { z: 0.27 }),
      );
    } else {
      tail.seg2Z = 0.21;
      tail.len2 = 0.205;
      B.tail1.push(part(box(0.11, 0.028, 0.22), base, { z: 0.11 }));
      B.tail2.push(
        part(box(0.1, 0.026, 0.2), base, { z: 0.1 }),
        part(box(0.1, 0.03, 0.03), dark, { z: 0.19 }),
      );
    }
  } else if (st === 'neckerchief') {
    T.push(
      part(tor(0.1, 0.03, 6, 16), nc.base, { y: 0.535, rx: PI / 2 + 0.12 }),
      part(cone(0.095, 0.16, 3), nc.base, { y: 0.44, z: 0.222, rz: PI, rx: -0.12, sz: 0.35 }),
      part(sph(0.04, 8, 6), nc.dark, { y: 0.51, z: 0.15 }),
    );
  } else if (st === 'shells') {
    // a cord ring tilted so it drapes down over the chest, shells along the front
    const rr = p.top.style === 'coat' ? 0.255 : 0.24, tilt = 0.38;
    // only the front half of the cord shows; it meets a short loop round the neck
    T.push(part(new THREE.TorusGeometry(rr, 0.008, 4, 16, PI), '#8a6a4a', { y: 0.56, rx: PI / 2 + tilt }));
    T.push(part(tor(0.08, 0.008, 4, 14), '#8a6a4a', { y: 0.585, rx: PI / 2 }));
    const cols = ['#fff4e6', '#ffb3c1', '#f7d9a8', '#ffb3c1', '#fff4e6'];
    for (let i = 0; i < 5; i++) {
      const f = (i - 2) * 0.3;
      T.push(part(sph(0.026, 6, 4), cols[i], {
        x: Math.sin(f) * rr, y: 0.56 - Math.cos(f) * rr * Math.sin(tilt) - 0.012,
        z: Math.cos(f) * rr * Math.cos(tilt) + 0.012, sy: 0.75,
      }));
    }
  }
}

// ----------------------------------------------------------------- extras
function buildExtra(B, p, c, R) {
  const T = B.torso, st = p.extra.style, ec = c.extra;
  const top = p.top.style;
  if (st === 'satchel') {
    // One strap from the bag, up across the chest, over the right shoulder
    // and down the back to the bag again. The bag hangs behind the left hip,
    // clear of the arm.
    const bagA = 2.2, bagY = 0.1;
    T.push(band(ec.dark, R, [
      [bagA, bagY + 0.03], [1.45, 0.16], [0.5, 0.27], [-0.4, 0.44], [-0.85, 0.552],
      [-PI / 2, 0.572],
      [-PI + 0.85, 0.552], [-PI + 0.4, 0.44], [-PI - 0.5, 0.27], [bagA - TAU + 0.5, 0.16], [bagA - TAU, bagY + 0.03],
    ], 0.042, 0.012, 5));
    // the bag is a solid thing: placed on the shaped hip, not reshaped with the cloth
    const r = R(bagY) + 0.006, x = r * Math.sin(bagA) * bodyWidth(bagY), z = r * Math.cos(bagA) * bodyDepth(bagY);
    T.push(rigid(group([
      part(box(0.07, 0.15, 0.18), ec.base, { x: 0.035, y: -0.045 }),
      part(box(0.078, 0.065, 0.19), ec.dark, { x: 0.037, y: 0.01 }),
      part(box(0.02, 0.032, 0.032), BUCKLE, { x: 0.08, y: -0.02 }),
    ], { x, y: bagY, z, ry: Math.atan2(x, z) - PI / 2 + 0.25 })));
  } else if (st === 'backpack') {
    const z = -((CHEST_R[top] ?? 0.232) + 0.07);
    T.push(
      part(box(0.3, 0.3, 0.14), ec.base, { y: 0.3, z }),
      part(box(0.31, 0.11, 0.152), ec.dark, { y: 0.41, z }),
      part(box(0.2, 0.1, 0.04), ec.dark, { y: 0.22, z: z - 0.08 }),
      part(box(0.03, 0.035, 0.02), BUCKLE, { y: 0.37, z: z - 0.08 }),
      part(cyl(0.055, 0.055, 0.34, 10), '#e8dcc0', { y: 0.5, z, rz: PI / 2 }), // bedroll
    );
    // shoulder straps: up the chest, over the shoulder and down to the pack
    const X = 0.105;
    for (const s of [-1, 1]) {
      const front = [], rear = [];
      for (let y = 0.17; y <= 0.6; y += 0.03) {
        const r = R(y);
        if (r < X + 0.015) break;
        const a = Math.asin(X / r);
        front.push([s * a, y]);
        if (y > 0.3) rear.unshift([s * (PI - a), y]);
      }
      T.push(band(ec.dark, R, [...front, ...rear], 0.04, 0.012, 2));
    }
  }
}

// ------------------------------------------------------------- head shape
// The head starts as a sphere; a smooth deformation field reshapes it. The
// same field is applied to everything on the head bone (skin, hair, hats, the
// face decal), so everything stays attached.
// Every shape shares a soft "mochi" skull, only a little lower and wider
// than a sphere now that it sits on a full-sized body: a gently flattened
// crown, cheeks that stay full low down, and a short lower face whose broad
// jaw ends in a clear ledge above the neck instead of melting into it. The
// round underside behind the jaw is drawn up into the nape, and a small nose
// is sculpted into the front so the profile has depth.
//   w: face width, jaw: how far the jaw tapers in toward the chin, pow: how
//   late the taper starts (higher = fuller cheeks, sharper chin), chin:
//   lengthen (or, negative, shorten) the front of the lower face, cheek:
//   fullness at cheek height, flat: square off the chin, nose: nose height
const MOCHI = { cx: 1.02, cy: 0.92, w: 1.05, jaw: 0.3, pow: 3.5, chin: -0.15, cheek: 0.05, cheekY: -0.19, flat: 0.3, nose: 0.05 };
export const HEAD_SHAPE_PARAMS = {
  oval: { ...MOCHI },
  round: { ...MOCHI, w: 1.13, jaw: 0.22, pow: 3, chin: -0.18, cheek: 0.07, flat: 0.2 },
  heart: { ...MOCHI, w: 1.1, jaw: 0.46, pow: 2.4, chin: -0.08, cheek: 0.035, flat: 0.04 },
  square: { ...MOCHI, w: 1.08, jaw: 0.18, pow: 3.2, chin: -0.12, cheek: 0.03, flat: 0.85 },
  long: { ...MOCHI, cy: 0.94, cx: 1.02, w: 1.03, jaw: 0.36, pow: 3, chin: 0.03, cheek: 0.03, flat: 0.3 },
  soft: { ...MOCHI, w: 1.12, jaw: 0.3, pow: 2.8, chin: -0.13, cheek: 0.065, cheekY: -0.16, flat: 0.4 },
};

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The face decal is a sphere cap this wide and tall (radians), centred on the
// front of the head. The painted nose sits 0.7 of the way down the texture,
// and the sculpted nose tip lines up with it.
const FACE_PHI = 2.0, FACE_THETA = 1.45;
const NOSE_Y = -0.32 * 0.964 * Math.sin(0.2 * FACE_THETA);

// Optional whole-head terms (they also reshape whatever sits on the skull,
// but fade out past it, so hat brims keep their size):
//   cx / cy: cranium width / height, bz: push the back of the skull out,
//   side: flatten the sides of the head, ff: flatten the face plane,
//   j0: where (0 brow → 1 chin) the jaw starts to taper, giving it a corner,
//   cheekY: the height of the cheek fullness
const hasWhole = (P) => !!(P.cx || P.cy || P.bz || P.side || P.ff);

/** Map a point in head space (origin at the head centre) to its shaped position. */
function shapePoint(P, x, y, z, out) {
  const t = sstep(0.03, -0.31, y);         // 0 at the brow, 1 at the bottom of the head
  const front = sstep(-0.12, 0.22, z);     // the chin is at the front
  const back = 1 - sstep(-0.22, 0.04, z);  // the nape is at the back
  // whole-head terms act on the skull and what's close to it, not hat brims
  const near = 1 - sstep(0.4, 0.5, Math.hypot(x, y, z));
  // every lower-face term fades to identity at the brow (y = 0.04), so there's no seam
  const crW = 1 + ((P.cx ?? 1) - 1) * near;
  let kx = crW + ((P.w ?? 1) - crW) * sstep(0.04, -0.08, y);
  const j0 = P.j0 || 0;
  kx *= 1 - P.jaw * Math.pow(Math.max(0, (t - j0) / (1 - j0)), P.pow);
  if (P.side) kx *= 1 - P.side * near * Math.min(1, Math.abs(x) / 0.32) ** 4;
  // cheeks: a soft band around cheek height
  const cy0 = P.cheekY ?? -0.1;
  const band = Math.exp(-(((y - cy0) / 0.09) ** 2)) * sstep(0.04, -0.02, y);
  const r = Math.hypot(x, z) || 1;
  const cheek = P.cheek * band * sstep(-0.05, 0.15, z);
  let ny = y * (1 + P.chin * t * front);
  if (P.flat) ny += P.flat * 0.06 * t * t * front;      // lift and flatten the chin line
  ny += 0.07 * t * t * back;                            // tuck the underside into the nape
  if (P.cy) ny *= 1 + (P.cy - 1) * near * sstep(-0.02, 0.12, y);
  let kz = (1 + P.chin * 0.3 * t * front) * (1 - 0.22 * t * back);
  if (P.bz) kz *= 1 + P.bz * near * back * (1 - t);
  if (P.ff) kz *= 1 - P.ff * near * front * (1 - 0.6 * t);
  out.x = x * kx + (x / r) * cheek;
  out.y = ny;
  out.z = z * kz + (z / r) * cheek * 0.5;
  if (P.nose) {
    // a small nose: a long, gentle bridge above the tip, a short drop below it
    const dy = y - NOSE_Y, s = dy > 0 ? 0.065 : 0.02;
    out.z += P.nose * Math.exp(-((x / (dy > 0 ? 0.026 : 0.032)) ** 2) - (dy / s) ** 2) * sstep(0.2, 0.28, z);
  }
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
const NORMAL_FOLLOW = 0.3; // how much shading follows the reshaped jaw (0 = sphere, 1 = exact)
const _J = new THREE.Matrix3();
/**
 * Reshape a head-bone geometry in place. `cy` is the head centre's y in the
 * geometry's space. Normals follow the deformation (inverse-transpose of the
 * field's Jacobian, by finite differences) so cel-shading traces the jaw.
 */
export function shapeHeadGeometry(geo, shape, cy = HC) {
  const P = HEAD_SHAPE_PARAMS[shape] || HEAD_SHAPE_PARAMS.oval;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const e = 1e-3;
  const col = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const whole = hasWhole(P), follow = P.nf ?? NORMAL_FOLLOW;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) - cy, z = pos.getZ(i);
    if (y > 0.04 && !whole) continue; // untouched above the brow
    shapePoint(P, x, y, z, _a);
    if (nor) {
      // Jacobian columns: d(out)/dx, d(out)/dy, d(out)/dz
      shapePoint(P, x + e, y, z, _b); col[0].subVectors(_b, _a).divideScalar(e);
      shapePoint(P, x, y + e, z, _b); col[1].subVectors(_b, _a).divideScalar(e);
      shapePoint(P, x, y, z + e, _b); col[2].subVectors(_b, _a).divideScalar(e);
      _J.set(col[0].x, col[1].x, col[2].x, col[0].y, col[1].y, col[2].y, col[0].z, col[1].z, col[2].z);
      _J.invert().transpose();
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      _n.set(nx, ny, nz).applyMatrix3(_J).normalize();
      // Keep most of the sphere's shading: fully deformed normals tip the
      // jaw into the cel-shade band and read as a beard shadow. Drawn anime
      // faces stay lit down to the chin.
      _n.lerp(_b.set(nx, ny, nz), 1 - follow).normalize();
      nor.setXYZ(i, _n.x, _n.y, _n.z);
    }
    pos.setXYZ(i, _a.x, _a.y + cy, _a.z);
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

/** The face decal: a sphere cap just in front of the skin, shaped to match. */
export function faceGeometry(shape) {
  // fine enough to follow the nose
  const g = new THREE.SphereGeometry(0.32, 56, 40, PI / 2 - FACE_PHI / 2, FACE_PHI, PI / 2 - FACE_THETA / 2, FACE_THETA);
  g.scale(1.014, 0.964, 0.984);
  g.translate(0, HC, 0);
  return shapeHeadGeometry(g, shape);
}

// ------------------------------------------------------------------- head
function buildHead(B, p, c) {
  const H = B.head;
  const first = H.length;
  H.push(
    // fine enough for the jaw line and the nose to stay smooth
    part(sph(0.32, 64, 44), c.skin, { y: HC, sy: 0.95, sz: 0.97 }),
    // ears: small upright ovals, tipped back a little
    part(sph(0.055, 10, 8), c.skinShade, { x: 0.305, y: HC - 0.03, z: -0.01, sx: 0.5, sy: 1.25, sz: 0.8, rx: -0.25 }),
    part(sph(0.055, 10, 8), c.skinShade, { x: -0.305, y: HC - 0.03, z: -0.01, sx: 0.5, sy: 1.25, sz: 0.8, rx: -0.25 }),
  );
  const hat = p.hat.style;
  const fit = hat === 'none' || BANDS[hat] ? 'none' : hat === 'furHood' ? 'hood' : 'hat';
  HAIR[p.hair.style](H, c, fit, BANDS[hat]);
  if (hat !== 'none') H.push(HATS[hat](c));
  // shape everything on the head (the field leaves the crown, and so hats, alone)
  for (let i = first; i < H.length; i++) shapeHeadGeometry(H[i], p.head);
}

// ------------------------------------------------------------------- hair
// Hair is built from locks: tapered, flattened ribbons swept along a smooth
// curve, broad side lying along the head, so they read as the chunky layered
// strands of drawn anime hair rather than cones poking out of a ball.

/** A head-space point from (azimuth from the front toward +x, elevation, distance from the head centre). */
const sp = (az, el, r) => new THREE.Vector3(r * Math.cos(el) * Math.sin(az), HC + r * Math.sin(el), r * Math.cos(el) * Math.cos(az));

const _C = new THREE.Vector3(), _T = new THREE.Vector3(), _O = new THREE.Vector3(), _S = new THREE.Vector3(), _U = new THREE.Vector3();
/**
 * A lock along the curve through `pts` (head-space Vector3s, root first).
 * w / th: half-width / half-thickness at the root. bulge swells the middle;
 * blunt > 0 leaves a squared-off end that wide (as a fraction of the root);
 * curl rolls the cross-section so the lock cups round the head.
 */
function lock(col, pts, w, th, { bulge = 0.3, blunt = 0, seg = 9, sides = 8, curl = 0.25 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const pos = [], idx = [];
  _C.set(0, HC, 0);
  const rings = blunt ? seg + 1 : seg;
  for (let i = 0; i < rings; i++) {
    const t = i / seg;
    curve.getPoint(t, _T); const P = _T.clone();
    curve.getTangent(t, _T);
    _O.subVectors(P, _C).normalize();
    _S.crossVectors(_T, _O);
    if (_S.lengthSq() < 1e-6) _S.set(1, 0, 0);
    _S.normalize();
    _U.crossVectors(_S, _T).normalize(); // away from the head
    const f = (blunt + (1 - blunt) * Math.pow(1 - t, 0.85)) * (1 + bulge * Math.sin(PI * t));
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      // cupped: the edges of the ribbon bend in toward the head
      const u = sa * th * f - curl * w * f * ca * ca;
      pos.push(P.x + _S.x * ca * w * f + _U.x * u, P.y + _S.y * ca * w * f + _U.y * u, P.z + _S.z * ca * w * f + _U.z * u);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k, b = i * sides + (k + 1) % sides, c2 = a + sides, d = b + sides;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // root cap (inside the scalp) and the tip
  const root = pos.length / 3;
  curve.getPoint(0, _T); pos.push(_T.x, _T.y, _T.z);
  for (let k = 0; k < sides; k++) idx.push(root, k, (k + 1) % sides);
  const tip = pos.length / 3, last = (rings - 1) * sides;
  curve.getPoint(1, _T);
  pos.push(_T.x, _T.y, _T.z);
  for (let k = 0; k < sides; k++) idx.push(tip, last + (k + 1) % sides, last + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return part(g, col);
}
/** Push head-space point `p` out to at least `r` from the head centre. */
function outside(p, r) {
  _O.set(0, HC, 0);
  const d = p.distanceTo(_O);
  if (d < r) p.sub(_O).multiplyScalar(r / d).add(_O);
  return p;
}
/** A lock through (az, el, r) points. */
const lockS = (col, pts, w, th, o) => lock(col, pts.map(([a, e, r]) => sp(a, e, r)), w, th, o);

function hairCap(H, c) {
  // tilted so the fringe sits high on the forehead
  const cap = part(sph(0.338, 22, 14, 0, TAU, 0, 1.55), c.hair, { rx: -0.28 });
  cap.translate(0, HC + 0.012, -0.012);
  H.push(cap);
}
/**
 * Bangs swept across the forehead toward one side, longest at the temples
 * so the eyes stay clear.
 */
function sweptFringe(H, c, side = 1) {
  const locks = [
    // az at the root, how far it sweeps, tip elevation, width
    [-0.62, 0.05, -0.02, 0.075],
    [-0.34, 0.2, 0.14, 0.085],
    [-0.08, 0.26, 0.2, 0.09],
    [0.2, 0.24, 0.15, 0.085],
    [0.46, 0.16, 0.05, 0.075],
    [0.7, 0.06, -0.06, 0.065],
  ];
  locks.forEach(([az, sw, tipEl, w], i) => {
    const a = az * side, s = sw * side;
    H.push(lockS(i % 3 === 1 ? c.hair2 : c.hair, [
      [a - s * 0.7, 1.15, 0.31], [a - s * 0.3, 0.85, 0.35], [a + s * 0.15, 0.55, 0.362], [a + s * 0.6, 0.3, 0.362], [a + s, tipEl, 0.348],
    ], w, 0.026, { bulge: 0.35 }));
  });
}
/**
 * Long locks hanging in front of the ears to the jaw, framing the face, plus
 * (unless the hair is pulled back) a lock swept back over each ear.
 */
function sideLocks(H, c, swept = true) {
  for (const s of [-1, 1]) {
    H.push(lockS(c.hair, [[s * 0.95, 0.6, 0.33], [s * 1.12, 0.3, 0.352], [s * 1.18, -0.05, 0.352], [s * 1.1, -0.42, 0.33], [s * 0.98, -0.62, 0.315]], 0.07, 0.03, { bulge: 0.25 }));
    if (swept) H.push(lockS(c.hair2, [[s * 1.3, 0.55, 0.33], [s * 1.6, 0.3, 0.36], [s * 1.85, 0.05, 0.37], [s * 2.05, -0.12, 0.4]], 0.075, 0.028));
  }
}
/** A darker under-layer down the back of the head, so the nape doesn't show between the locks. */
function nape(H, c) {
  H.push(part(sph(0.336, 20, 8, PI * 1.5 - 1.45, 2.9, PI / 2 - 0.2, 1.05), c.hair2, { y: HC + 0.005, sy: 0.96 }));
}
/** A layer of locks round the back of the head, `from` radians either side of the front. */
function backLocks(H, c, { n = 7, from = 1.45, top = 0.42, low = -0.42, flick = 0.05, w = 0.1, alt = true } = {}) {
  for (let i = 0; i < n; i++) {
    const az = from + (i / (n - 1)) * (TAU - 2 * from);
    // the middle of the back hangs lowest, down over the nape
    const k = (i % 2 ? 0.88 : 1) * (1 + 0.35 * Math.cos(az - PI) ** 2);
    H.push(lockS(alt && i % 2 ? c.hair2 : c.hair, [
      [az, top + 0.2, 0.32], [az, top, 0.348], [az, (top + low * k) / 2, 0.36], [az, low * k, 0.35 + flick * 0.5], [az * 1.02, low * k - 0.12, 0.345 + flick],
    ], w, 0.032, { bulge: 0.25 }));
  }
}

const HAIR = {
  spiky(H, c, fit, band) {
    hairCap(H, c);
    sweptFringe(H, c);
    sideLocks(H, c);
    if (fit === 'hood') return;
    // a layer round the back down to the nape, the tips flicked out
    nape(H, c);
    backLocks(H, c, { top: fit === 'hat' ? 0.18 : 0.4, low: -0.5, flick: 0.06 });
    if (fit !== 'none') return;
    // bare head: big locks swept back over the crown, hugging it, their tips
    // kicking out behind (kept above a circlet or flower crown)
    // Combed back: each lock keeps to its own side (constant x) over the top.
    const lift = band ? 0.12 : 0;
    const back = (x, th, r) => { const R = Math.sqrt(r * r - x * x); return new THREE.Vector3(x, HC + R * Math.sin(th), R * Math.cos(th)); };
    const crown = [[-0.19, 0.01], [-0.065, 0.03], [0.065, 0.025], [0.19, 0.01], [-0.27, 0], [0.27, 0]];
    crown.forEach(([x, up], i) => {
      const side = Math.abs(x) > 0.25, t0 = side ? 0.7 : 0.95;
      H.push(lock(i % 2 ? c.hair2 : c.hair, [
        back(x * 0.9, t0, 0.3), back(x, t0 + 0.32, 0.355 + up), back(x * 1.05, 1.75 + lift, 0.365 + up),
        back(x * 1.12, 2.2 + lift, 0.365 + up), back(x * 1.2, 2.5 + lift * 0.5, 0.385 + up),
      ], side ? 0.085 : 0.095, 0.034, { bulge: 0.35 }));
    });
    // a cheeky ahoge on top
    H.push(lockS(c.hair, [[0.1, 1.35, 0.33], [0.12, 1.5, 0.39], [0.25, 1.55, 0.44], [0.42, 1.42, 0.46]], 0.03, 0.016, { bulge: 0.4 }));
  },
  bob(H, c, fit) {
    hairCap(H, c);
    // blunt bangs, cut straight across just above the brows
    for (let i = 0; i < 7; i++) {
      const az = -0.66 + i * 0.22;
      H.push(lockS(i === 2 || i === 5 ? c.hair2 : c.hair, [[az * 0.8, 1.1, 0.31], [az, 0.7, 0.352], [az * 1.03, 0.36, 0.362], [az * 1.05, 0.14 - Math.abs(az) * 0.1 + (i % 2) * 0.03, 0.352]],
        0.085, 0.026, { blunt: 0.55, bulge: 0.15, curl: 0.15 }));
    }
    if (fit === 'hood') return;
    // a curtain of broad locks down to the jaw, hugging the head and turned
    // under at the ends; the front ones frame the face
    nape(H, c);
    const top = fit === 'hat' ? 0.2 : 0.5;
    for (let i = 0; i < 13; i++) {
      const az = 0.98 + (i / 12) * (TAU - 1.96);
      const end = -0.5 - (i % 2) * 0.07 - Math.cos(az - PI) ** 2 * 0.06;
      H.push(lockS(i % 4 === 2 ? c.hair2 : c.hair, [[az, top + 0.3, 0.31], [az, top, 0.342], [az, 0.05, 0.352], [az, end + 0.14, 0.352], [az * 1.01, end, 0.338]],
        0.12, 0.03, { blunt: 0.45, bulge: 0.1, curl: 0.35 }));
    }
  },
  ponytail(H, c, fit) {
    hairCap(H, c);
    sweptFringe(H, c, -1);
    sideLocks(H, c, false);
    if (fit === 'hood') return;
    // Tied at the back of the head and hanging down behind it: a bundle of
    // locks that swells below the tie and tapers to flicked tips.
    // (Under a hat the tie drops below the brim and the tail is shorter.)
    const hat = fit === 'hat';
    const tieY = hat ? HC : HC + 0.1, tieZ = -Math.sqrt(0.34 ** 2 - (tieY - HC) ** 2) - 0.02;
    const len = hat ? 0.85 : 1;
    // the hair drawn back to the tie, from the crown and up from the nape
    nape(H, c);
    const tie = new THREE.Vector3(0, tieY, tieZ + 0.03);
    for (let i = 0; i < 7; i++) {
      const az = 1.55 + (i / 6) * (TAU - 3.1);
      const root = sp(az, -0.62, 0.33), mid = sp((az + PI) / 2, -0.15, 0.352);
      H.push(lock(i % 2 ? c.hair2 : c.hair, [root, mid, outside(mid.clone().lerp(tie, 0.55), 0.35), tie], 0.09, 0.026, { bulge: 0.15, curl: 0.3 }));
    }
    H.push(
      part(sph(0.06, 10, 8), c.hair, { y: tieY + 0.01, z: tieZ + 0.02 }),
      part(tor(0.046, 0.018, 5, 10), c.hair2, { y: tieY - 0.005, z: tieZ - 0.03, rx: PI / 2 - 0.35 }),
    );
    const v = (x, dy, dz) => new THREE.Vector3(x, tieY + dy * len, tieZ + dz);
    for (const [x, col, w, flick] of [[0, c.hair, 0.075, 0.04], [0.035, c.hair2, 0.05, 0.08], [-0.035, c.hair, 0.05, -0.02]]) {
      H.push(lock(col, [v(x * 0.4, 0.01, -0.02), v(x, -0.06, -0.09), v(x * 1.2, -0.2, -0.1), v(x * 1.4 + flick * 0.5, -0.33, -0.06), v(x * 1.5 + flick, -0.42, -0.08 + Math.abs(flick))],
        w, w * 0.75, { bulge: 0.5, curl: 0 }));
    }
  },
  buns(H, c, fit) {
    hairCap(H, c);
    sweptFringe(H, c);
    sideLocks(H, c);
    if (fit === 'hood') return;
    nape(H, c);
    for (const s of [-1, 1]) {
      const [x, y, z, r] = fit === 'hat' ? [s * 0.28, HC + 0.08, -0.2, 0.085] : [s * 0.2, HC + 0.3, -0.06, 0.1];
      H.push(
        part(sph(r, 12, 8), c.hair, { x, y, z }),
        part(tor(r * 0.7, 0.018, 5, 12), c.hair2, { x: x * 0.92, y: y - r * 0.55, z: z * 0.9, rx: PI / 2, rz: s * -0.5 }),
      );
    }
  },
  buzz(H, c) {
    const cap = part(sph(0.33, 20, 10, 0, TAU, 0, 1.62), c.hair, { rx: -0.32 });
    cap.translate(0, HC + 0.006, -0.02);
    H.push(cap);
    for (const s of [-1, 1]) H.push(part(box(0.025, 0.08, 0.06), c.hair, { x: s * 0.305, y: HC - 0.02, z: 0.09 }));
  },
  curly(H, c, fit, band) {
    hairCap(H, c);
    if (fit !== 'hood') nape(H, c);
    // Under a circlet or flower crown the curls part round the band, so it
    // sits on the hair (in a groove) rather than buried in it.
    const clear = (x, y, z, r) => !band || Math.abs(bandHeight(band, x, y, z)) > r + band.clear;
    // curls on a Fibonacci sphere, skipping the face (and the crown under a hat)
    const N = 40;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (y < -0.3) continue;
      if (z > 0.35 && y < 0.55) continue;                      // face
      if (fit === 'hat' && y > 0.42) continue;                 // under the hat
      if (fit === 'hood' && !(z > 0.3 && y > 0.3)) continue;   // only a few at the hood's edge
      const P = [x * 0.33, HC + y * 0.32, z * 0.33];
      if (!clear(...P, 0.085)) {
        // a smaller curl tucked in under the band keeps the hairline full
        if (Math.abs(bandHeight(band, ...P)) > 0.05) H.push(part(sph(0.05, 7, 5), c.hair2, { x: P[0] * 0.97, y: P[1], z: P[2] * 0.97 }));
        continue;
      }
      H.push(part(sph(0.085, 7, 5), i % 3 ? c.hair : c.hair2, { x: P[0], y: P[1], z: P[2] }));
    }
    // fringe curls
    for (const x of [-0.17, -0.06, 0.06, 0.17]) {
      let y = HC + 0.18 + Math.abs(x) * 0.1, r = 0.07;
      const z = 0.27 - Math.abs(x) * 0.2;
      if (!clear(x, y, z, r)) {
        // slip the curl (a little smaller) to whichever side of the band it's on
        r = 0.06;
        const h = bandHeight(band, x, y, z);
        y += (Math.sign(h) * (r + band.clear) - h) / Math.cos(band.rx);
      }
      H.push(part(sph(r, 7, 5), c.hair, { x, y, z }));
    }
  },
};

// ------------------------------------------------------------------- hats
// Each returns one merged geometry in head space. Brimmed hats are built
// upright and tipped back so the face shows, like the original pith helmet.
const tipBack = (parts, tilt = -0.2) => group(parts, { y: HC, z: -0.02, rx: tilt });

// Band-shaped headwear sits around the head rather than on top of it, so
// hair isn't flattened under it. Shared with curly hair, which parts round the
// band. y, z, rx place the band's plane; clear is its half-thickness (flowers
// stand proud of the vine).
const BANDS = {
  circlet: { y: HC + 0.14, z: -0.02, rx: 0.15, clear: 0.025 },
  flowerCrown: { y: HC + 0.19, z: -0.03, rx: -0.3, clear: 0.045 },
};
/** Signed height of a head-space point above a band's plane. */
function bandHeight(b, x, y, z) {
  return Math.cos(b.rx) * (y - b.y) + Math.sin(b.rx) * (z - b.z);
}

function pith(base, band, trim, extra = []) {
  return tipBack([
    part(sph(0.355, 20, 10, 0, TAU, 0, PI / 2), base, { y: 0.16, sy: 0.82, sz: 1.08 }),
    part(cyl(0.36, 0.362, 0.075, 20, true), band, { y: 0.195 }),
    part(cyl(0.53, 0.56, 0.03, 26), base, { y: 0.16, sz: 1.12 }),
    part(tor(0.545, 0.015, 4, 26), trim, { y: 0.16, rx: PI / 2, sy: 1.12 }),
    part(sph(0.045, 8, 6), band, { y: 0.46 }),
    part(cyl(0.02, 0.02, 0.06, 6), band, { y: 0.43 }),
    ...extra,
  ]);
}

const HATS = {
  pith(c) {
    const h = c.hat;
    // the sand helmet keeps its original brim piping
    return pith(h.base, h.dark, h.id === 'sand' ? '#c9ad6e' : mix(h.base, h.dark, 0.25));
  },
  grandPith() {
    // An old field helmet: weathered khaki, a wrapped red puggaree whose tails
    // hang over the back of the brim, brass goggles strapped on the front, a
    // stitched patch and a dent. Same pith shape underneath, but it reads as
    // his from any angle.
    const base = '#b59c66', shade = '#8f7a4c', red = '#b03a2e', redDk = '#86281f';
    const BRASS = '#c9973a', GLASS = '#9fe0ec', STRAP = '#4a3020';
    const dome = (dy) => 0.355 * Math.sqrt(1 - (dy / (0.355 * 0.82)) ** 2); // dome radius dy above its centre
    const parts = [
      part(sph(0.355, 20, 10, 0, TAU, 0, PI / 2), base, { y: 0.16, sy: 0.82, sz: 1.08 }),
      // the puggaree: two wraps of cloth, each a little proud of the last
      part(cyl(0.368, 0.372, 0.05, 20, true), red, { y: 0.185, sz: 1.08 }),
      part(cyl(0.352, 0.364, 0.045, 20, true), red, { y: 0.232, sz: 1.08 }),
      part(tor(0.366, 0.008, 3, 24), redDk, { y: 0.21, rx: PI / 2, sy: 1.08 }),
      // brim, with a darker, frayed-looking edge
      part(cyl(0.53, 0.56, 0.03, 26), base, { y: 0.16, sz: 1.12 }),
      part(tor(0.545, 0.017, 4, 26), shade, { y: 0.16, rx: PI / 2, sy: 1.12 }),
      // aged-brass vent on top
      part(sph(0.048, 8, 6), BRASS, { y: 0.455 }),
      part(cyl(0.024, 0.024, 0.06, 6), BRASS, { y: 0.43 }),
      // stitched patch on one side, a dent on the other
      part(box(0.11, 0.075, 0.02), shade, { x: 0.2, y: 0.33, z: -0.14, ry: -0.9, rx: 0.4 }),
      part(sph(0.06, 8, 6), shade, { x: -0.24, y: 0.34, z: -0.1, sx: 0.35, sz: 1.2, ry: 0.4, rz: 0.75 }),
    ];
    for (const s of [-1, 1]) parts.push(part(box(0.014, 0.012, 0.035), STRAP, { x: 0.2 + s * 0.03, y: 0.33 + s * 0.008, z: -0.14 + s * 0.035, ry: -0.9, rx: 0.4 }));
    // puggaree tails: lie along the back of the brim, then drop over its edge
    for (const s of [-1, 1]) {
      parts.push(
        part(box(0.07, 0.014, 0.24), red, { x: s * 0.05, y: 0.185, z: -0.5, ry: s * 0.18 }),
        part(box(0.065, 0.13, 0.014), red, { x: s * 0.075, y: 0.12, z: -0.625, rz: s * 0.12, rx: -0.15 }),
        part(box(0.067, 0.02, 0.018), redDk, { x: s * 0.08, y: 0.06, z: -0.635, rz: s * 0.12, rx: -0.15 }),
      );
    }
    // goggles resting on the front of the crown, on a strap round it
    const gy = 0.28, gr = dome(gy - 0.16);
    // the dome's surface faces up-and-forward here; the lenses face the same way
    const tilt = 0.55, ny = Math.sin(tilt), nz = Math.cos(tilt);
    parts.push(part(tor(gr + 0.006, 0.014, 4, 24), STRAP, { y: gy, rx: PI / 2, sy: 1.08 }));
    for (const s of [-1, 1]) {
      const x = s * 0.085, z = 1.08 * gr * Math.sqrt(1 - (x / gr) ** 2);
      const at = (d) => ({ x, y: gy + ny * d, z: z + nz * d });
      parts.push(
        part(cyl(0.06, 0.066, 0.04, 14), BRASS, { ...at(0.02), rx: PI / 2 - tilt }),
        part(cyl(0.046, 0.046, 0.012, 14), GLASS, { ...at(0.041), rx: PI / 2 - tilt }),
        part(tor(0.052, 0.011, 4, 14), '#e0b860', { ...at(0.042), rx: -tilt }),
        part(sph(0.014, 5, 4), '#ffffff', { ...at(0.05), x: x - 0.018, y: gy + ny * 0.05 + 0.012 }),
      );
    }
    parts.push(part(box(0.06, 0.02, 0.02), BRASS, { y: gy + ny * 0.03 + 0.005, z: 1.08 * gr + 0.012, rx: -0.55 }));
    return tipBack(parts);
  },
  bandana(c) {
    const h = c.hat;
    const parts = [
      part(sph(0.372, 20, 10, 0, TAU, 0, 1.32), h.base, { sx: 1.02, sz: 1.03 }),
      part(tor(0.36, 0.02, 4, 22), h.dark, { y: 0.092, rx: PI / 2 }),
      part(sph(0.06, 8, 6), h.dark, { y: 0.02, z: -0.37 }),
      part(cone(0.05, 0.18, 4), h.base, { x: 0.05, y: -0.08, z: -0.38, rx: PI + 0.35, rz: -0.35 }),
      part(cone(0.05, 0.16, 4), h.base, { x: -0.05, y: -0.07, z: -0.38, rx: PI + 0.3, rz: 0.35 }),
    ];
    // polka dots
    for (const [a, t] of [[0.6, 0.5], [2.2, 0.7], [3.6, 0.45], [5.0, 0.75], [1.4, 0.95], [4.3, 1.0]]) {
      parts.push(part(sph(0.03, 6, 4), '#fff8e7', { x: Math.sin(a) * Math.sin(t) * 0.376, y: Math.cos(t) * 0.376, z: Math.cos(a) * Math.sin(t) * 0.376, sy: 0.5 }));
    }
    return group(parts, { y: HC + 0.012, z: -0.012, rx: -0.38 });
  },
  straw(c) {
    const straw = '#ebd27e', weave = '#c9ad5e';
    return tipBack([
      part(cyl(0.26, 0.29, 0.17, 18), straw, { y: 0.265 }),
      part(cyl(0.56, 0.58, 0.025, 28), straw, { y: 0.17 }),
      part(tor(0.57, 0.013, 4, 28), weave, { y: 0.17, rx: PI / 2 }),
      part(tor(0.42, 0.006, 3, 28), weave, { y: 0.185, rx: PI / 2 }),
      part(cyl(0.292, 0.292, 0.05, 18, true), c.hat.base, { y: 0.21 }),
    ], -0.22);
  },
  tricorn(c) {
    const h = c.hat;
    const parts = [
      part(sph(0.345, 18, 8, 0, TAU, 0, PI / 2), h.base, { y: 0.12, sy: 0.78 }),
      part(cyl(0.35, 0.35, 0.03, 18), h.dark, { y: 0.13 }),
    ];
    // three brim flaps hinged at the crown's edge and turned up and out;
    // their corners meet at the front point and the two back points
    for (const a of [PI, PI / 3, -PI / 3]) {
      parts.push(group([
        part(box(0.66, 0.17, 0.03), h.base, { y: 0.085 }),
        part(box(0.66, 0.022, 0.04), GOLD, { y: 0.17 }),
      ], { x: Math.sin(a) * 0.33, y: 0.12, z: Math.cos(a) * 0.33, ry: a, rx: 0.62, order: 'YXZ' }));
    }
    parts.push(part(sph(0.045, 8, 6), h.dark, { x: 0.27, y: 0.26, z: 0.2 }));
    return tipBack(parts, -0.12);
  },
  rivalTricorn() {
    // Sable's hat: the tricorn in near-black with crimson piping, a crimson
    // cockade and a long cream plume swept back from the left side, so it
    // reads as theirs (not the tailor's) from the sailing camera.
    const base = '#221c26', dark = '#15111a', red = '#b81f2e', redDk = '#8a1622', cream = '#fff4dc', creamDk = '#e6d6b4';
    const parts = [
      part(sph(0.345, 18, 8, 0, TAU, 0, PI / 2), base, { y: 0.12, sy: 0.78 }),
      part(cyl(0.35, 0.35, 0.03, 18), dark, { y: 0.13 }),
      part(cyl(0.349, 0.349, 0.035, 18, true), red, { y: 0.165 }),
    ];
    for (const a of [PI, PI / 3, -PI / 3]) {
      parts.push(group([
        part(box(0.66, 0.17, 0.03), base, { y: 0.085 }),
        part(box(0.67, 0.03, 0.045), red, { y: 0.17 }),
      ], { x: Math.sin(a) * 0.33, y: 0.12, z: Math.cos(a) * 0.33, ry: a, rx: 0.62, order: 'YXZ' }));
    }
    // cockade on the left flap, where the plume is pinned
    parts.push(
      part(cyl(0.07, 0.07, 0.02, 10), red, { x: 0.3, y: 0.25, z: 0.17, rz: PI / 2, ry: -0.5, order: 'YXZ' }),
      part(sph(0.03, 6, 4), redDk, { x: 0.325, y: 0.25, z: 0.185 }),
    );
    // the plume: overlapping tapered tufts arcing up and back, drooping at the tip
    const N = 6;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const r = 0.075 * (1 - t * 0.55);
      parts.push(part(sph(r, 8, 6), i % 2 ? creamDk : cream, {
        x: 0.3 - t * 0.05, y: 0.3 + Math.sin(t * PI * 0.8) * 0.2, z: 0.14 - t * 0.56,
        sx: 0.55, sy: 0.9, sz: 1.9, rx: -0.7 + t * 1.5,
      }));
    }
    return tipBack(parts, -0.12);
  },
  captain(c) {
    const h = c.hat;
    return tipBack([
      part(cyl(0.345, 0.31, 0.15, 20), h.base, { y: 0.255 }),
      part(cyl(0.37, 0.35, 0.05, 20), h.base, { y: 0.34 }),
      part(cyl(0.316, 0.316, 0.06, 20, true), '#1f1e24', { y: 0.2 }),
      part(cyl(0.42, 0.42, 0.022, 18, false, -1.0, 2.0), '#1f1e24', { y: 0.185, rx: 0.22 }),
      part(tor(0.32, 0.01, 4, 20), GOLD, { y: 0.235, rx: PI / 2 }),
      part(sph(0.04, 8, 6), GOLD, { y: 0.26, z: 0.32, sz: 0.5 }),
    ], -0.12);
  },
  furHood() {
    const fur = '#f1e9da', hide = '#8a6a4a';
    return group([
      part(sph(0.385, 22, 14, PI / 2 + 0.95, TAU - 1.9, 0, 2.35), hide, {}),
      part(tor(0.26, 0.07, 8, 22), fur, { z: 0.245, sy: 1.2 }),
      part(sph(0.075, 8, 6), hide, { x: 0.22, y: 0.3, z: -0.05 }),
      part(sph(0.075, 8, 6), hide, { x: -0.22, y: 0.3, z: -0.05 }),
      part(sph(0.04, 6, 4), fur, { x: 0.22, y: 0.31, z: 0.0 }),
      part(sph(0.04, 6, 4), fur, { x: -0.22, y: 0.31, z: 0.0 }),
    ], { y: HC + 0.02 });
  },
  flowerCrown() {
    const B = BANDS.flowerCrown;
    const parts = [part(tor(0.3, 0.025, 6, 26), '#5aa04a', { rx: PI / 2 })];
    const cols = ['#ff8fb0', '#fff8e7', '#ff7a5e', '#b79ce6', '#ff8fb0', '#ffd24a', '#fff8e7'];
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 0.55;
      const x = Math.sin(a) * 0.31, z = Math.cos(a) * 0.31;
      parts.push(
        part(sph(0.048, 8, 6), cols[i], { x, y: 0.02, z, sy: 0.7 }),
        part(sph(0.02, 6, 4), '#ffd24a', { x: x * 1.12, y: 0.03, z: z * 1.12 }),
        part(cone(0.025, 0.08, 3), '#4a8a3a', { x: Math.sin(a + 0.27) * 0.31, z: Math.cos(a + 0.27) * 0.31, ry: a, rz: PI / 2, order: 'YXZ' }),
      );
    }
    return group(parts, { y: B.y, z: B.z, rx: B.rx });
  },
  circlet() {
    const B = BANDS.circlet;
    return group([
      part(tor(0.345, 0.016, 6, 32), GOLD, { rx: PI / 2 }),
      part(sph(0.03, 8, 6), GOLD, { z: 0.35 }),
      part(new THREE.OctahedronGeometry(0.04), '#3ff0d8', { z: 0.37, sy: 1.4 }),
    ], { y: B.y, z: B.z, rx: B.rx });
  },
};

// ------------------------------------------------------------------- face
/**
 * Face decal. opts: { iris (EYE_COLORS entry), shape: 'round'|'sharp'|'sleepy',
 * brow, blush, freckles, skin (SKIN_TONES entry) }. 'round' with amber eyes,
 * chestnut brows and blush is the original face, pixel for pixel.
 */
export function faceParams(p) {
  const hair = color(HAIR_COLORS, p.hair.color);
  const skin = color(SKIN_TONES, p.skin);
  return {
    iris: color(EYE_COLORS, p.eyes.color).id,
    shape: p.eyes.shape,
    brow: hair.id === 'chestnut' ? '#5a2810' : mix(hair.base, '#1a0c05', 0.25),
    blush: !!p.face.blush,
    freckles: !!p.face.freckles,
    skin: skin.id,
  };
}

export function faceTexture(o) {
  const iris = color(EYE_COLORS, o.iris), skin = color(SKIN_TONES, o.skin);
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  const LASH = '#24110a';

  const eyeball = (cx, cy, flip, iw, ih) => {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx, cy, 19, 27, 0, 0, TAU); g.fill();
    const gr = g.createLinearGradient(0, cy - 24, 0, cy + 24);
    gr.addColorStop(0, iris.dark); gr.addColorStop(0.55, iris.base); gr.addColorStop(1, iris.light);
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(cx + flip * 1.5, cy + 3, iw, ih, 0, 0, TAU); g.fill();
    g.fillStyle = '#1a0c05';
    g.beginPath(); g.ellipse(cx + flip * 1.5, cy + 4, iw * 0.47, ih * 0.52, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(cx - 6 + flip * 1.5, cy - 7, 6.5, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx + 6 + flip * 1.5, cy + 12, 3, 0, TAU); g.fill();
  };

  const eye = (cx, flip) => {
    const cy = S * 0.56;
    if (o.shape === 'sharp' || o.shape === 'sleepy') {
      // lid curve from the inner to the outer corner; the eye is clipped below it
      const sharp = o.shape === 'sharp';
      const ix = cx - flip * 21, ox = cx + flip * 21;
      const iy = sharp ? cy - 6 : cy - 2, oy = sharp ? cy - 20 : cy - 1, ctrlY = sharp ? cy - 28 : cy - 9;
      g.save();
      g.beginPath();
      g.moveTo(ix, iy); g.quadraticCurveTo(cx, ctrlY, ox, oy);
      g.lineTo(ox, cy + 40); g.lineTo(ix, cy + 40); g.closePath();
      g.clip();
      eyeball(cx, cy, flip, sharp ? 13 : 15, sharp ? 21 : 23);
      g.restore();
      g.strokeStyle = LASH; g.lineWidth = sharp ? 6.5 : 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ix, iy); g.quadraticCurveTo(cx, ctrlY, ox, oy); g.stroke();
      g.beginPath();
      if (sharp) { g.moveTo(ox, oy); g.lineTo(ox + flip * 9, oy - 5); }
      else { g.moveTo(ox, oy); g.lineTo(ox + flip * 7, oy + 2); }
      g.stroke();
      g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(cx, cy, 18, 26, 0, PI * 0.3, PI * 0.7); g.stroke();
      g.strokeStyle = o.brow; g.lineWidth = 5;
      g.beginPath();
      if (sharp) { g.moveTo(cx - 18 * flip, cy - 36); g.quadraticCurveTo(cx, cy - 44, cx + 20 * flip, cy - 48); }
      else { g.moveTo(cx - 17 * flip, cy - 38); g.quadraticCurveTo(cx, cy - 44, cx + 18 * flip, cy - 39); }
      g.stroke();
      return;
    }
    // round (the original)
    eyeball(cx, cy, flip, 15, 23);
    g.strokeStyle = LASH; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.ellipse(cx, cy + 2, 21, 28, 0, PI * 1.12, PI * 1.88); g.stroke();
    g.beginPath();
    g.moveTo(cx + flip * 19, cy - 14); g.lineTo(cx + flip * 27, cy - 20); g.stroke();
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(cx, cy, 18, 26, 0, PI * 0.3, PI * 0.7); g.stroke();
    g.strokeStyle = o.brow; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - 16 * flip, cy - 42); g.quadraticCurveTo(cx, cy - 50, cx + 18 * flip, cy - 43); g.stroke();
  };
  eye(S * 0.33, -1);
  eye(S * 0.67, 1);

  if (o.blush) {
    g.fillStyle = 'rgba(255, 110, 110, 0.42)';
    for (const x of [S * 0.24, S * 0.76]) { g.beginPath(); g.ellipse(x, S * 0.74, 17, 8, 0, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(230, 80, 80, 0.55)'; g.lineWidth = 2;
    for (const x of [S * 0.24, S * 0.76]) for (const d of [-7, 0, 7]) {
      g.beginPath(); g.moveTo(x + d - 2, S * 0.76); g.lineTo(x + d + 3, S * 0.72); g.stroke();
    }
  }
  if (o.freckles) {
    // big and dark enough to read from the sailing camera
    g.fillStyle = mix(skin.dark, '#4a1e08', 0.65);
    const dots = [[-30, -8], [-22, -2], [-36, 0], [-26, 6], [-16, -6], [-32, 9], [-40, -6], [-20, 10]];
    for (const [dx, dy] of dots) for (const s of [-1, 1]) {
      g.beginPath(); g.arc(S * 0.5 + s * (S * 0.2 + dx * 0.5), S * 0.7 + dy, 3.4, 0, TAU); g.fill();
    }
  }
  // nose + grin
  g.fillStyle = skin.id === 's2' ? '#e8a383' : mix(skin.dark, '#7a2a1e', 0.2);
  g.beginPath(); g.ellipse(S * 0.5, S * 0.7, 3, 2, 0, 0, TAU); g.fill();
  g.fillStyle = '#7a2a1e';
  g.beginPath(); g.moveTo(S * 0.455, S * 0.79); g.quadraticCurveTo(S * 0.5, S * 0.86, S * 0.545, S * 0.79); g.closePath(); g.fill();
  g.fillStyle = '#ff8a7a';
  g.beginPath(); g.ellipse(S * 0.5, S * 0.825, 9, 3, 0, 0, TAU); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A small shared cache so clicking through swatches doesn't keep making
// textures. Entries in use are never evicted.
const faceCache = new Map(); // key -> { tex, refs }
const FACE_CACHE_MAX = 8;

export function acquireFace(params) {
  const key = JSON.stringify(params);
  let e = faceCache.get(key);
  if (!e) e = { tex: faceTexture(params), refs: 0 };
  faceCache.delete(key);
  faceCache.set(key, e); // most recent last
  e.refs++;
  trimFaces();
  return { key, tex: e.tex };
}

export function releaseFace(key) {
  const e = faceCache.get(key);
  if (e) e.refs = Math.max(0, e.refs - 1);
  trimFaces();
}

function trimFaces() {
  for (const [k, e] of faceCache) {
    if (faceCache.size <= FACE_CACHE_MAX) break;
    if (e.refs > 0) continue;
    e.tex.dispose();
    faceCache.delete(k);
  }
}
