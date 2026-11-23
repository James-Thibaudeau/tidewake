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
// Root-space joint heights and the head centre (shared with explorer.js)
export const HIP_Y = 0.47, KNEE_Y = 0.33, HC = 0.3;
export const BONES = ['hipL', 'hipR', 'kneeL', 'kneeR', 'torso', 'shL', 'shR', 'elL', 'elR', 'head', 'tail1', 'tail2'];

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
const CHEST_R = { vest: 0.232, sailor: 0.222, tank: 0.222, coat: 0.262, poncho: 0.31 };

/**
 * profile must already be normalized (see cosmetics.normalizeProfile).
 * Returns { parts: { bone: BufferGeometry[] }, tail: { visible, seg2Z } }.
 */
export function buildOutfit(p) {
  const c = resolve(p);
  const B = Object.fromEntries(BONES.map((k) => [k, []]));
  const tail = { visible: false, seg2Z: 0.21 };
  buildLegs(B, p, c);
  buildTorso(B, p, c);
  buildArms(B, p, c);
  buildNeck(B, p, c, tail);
  buildExtra(B, p, c);
  buildHead(B, p, c);
  return { parts: B, tail };
}

// ------------------------------------------------------------------- legs
function buildLegs(B, p, c) {
  const bst = p.bottom.style, bcol = c.bottom, boots = p.boots.style, kcol = c.boots;
  for (const s of [1, -1]) {
    const H = s > 0 ? B.hipL : B.hipR, K = s > 0 ? B.kneeL : B.kneeR;
    const x = s * 0.1, dy = -HIP_Y, ky = -KNEE_Y;
    const long = bst === 'trousers' || bst === 'cargo';

    // ---- thigh (hip group)
    if (bst === 'skirt') {
      H.push(part(cyl(0.056, 0.062, 0.15, 10), c.skin, { y: 0.405 + dy })); // the skirt hangs from the torso
    } else {
      H.push(part(cyl(0.105, 0.1, 0.13, 12), bcol.base, { x: x * 0.05, y: 0.45 + dy }));
      if (long) {
        H.push(part(cyl(0.098, 0.088, 0.08, 12), bcol.base, { x: x * 0.03, y: 0.36 + dy }));
        if (bst === 'cargo') {
          H.push(part(box(0.035, 0.09, 0.11), bcol.dark, { x: s * 0.1, y: 0.4 + dy }));
          H.push(part(box(0.04, 0.025, 0.12), bcol.base, { x: s * 0.102, y: 0.448 + dy }));
        }
      } else {
        H.push(part(tor(0.1, 0.014, 5, 12), bcol.base, { x: x * 0.05, y: 0.39 + dy, rx: PI / 2 }));
        H.push(part(cyl(0.056, 0.06, 0.09, 10), c.skin, { y: 0.375 + dy }));
      }
    }

    // ---- shin (knee group): trouser legs bend with the knee
    if (long) {
      K.push(part(sph(0.087, 10, 6), bcol.base, {}));
      K.push(part(cyl(0.086, 0.082, 0.13, 12), bcol.base, { y: 0.265 + ky }));
      K.push(part(tor(0.082, 0.014, 5, 12), bcol.dark, { y: 0.205 + ky, rx: PI / 2 }));
    }

    // ---- boots
    if (boots === 'sandals') {
      K.push(
        part(cyl(0.06, 0.064, 0.25, 10), c.skin, { y: 0.205 + ky }),
        part(sph(0.075, 10, 6), c.skin, { y: 0.06 + ky, z: 0.045, sy: 0.62, sz: 1.6 }),
        part(box(0.17, 0.03, 0.3), kcol.dark, { y: 0.016 + ky, z: 0.04 }),
        part(tor(0.066, 0.012, 4, 10), kcol.base, { y: 0.11 + ky, rx: PI / 2 }),
        part(box(0.15, 0.022, 0.035), kcol.base, { y: 0.075 + ky, z: 0.1, rx: -0.25 }),
        part(box(0.15, 0.022, 0.035), kcol.base, { y: 0.07 + ky, z: -0.01 }),
      );
    } else if (boots === 'tall') {
      K.push(
        part(cyl(0.06, 0.062, 0.05, 10), c.skin, { y: 0.305 + ky }),
        part(cyl(0.092, 0.097, 0.25, 12), kcol.base, { y: 0.205 + ky }),
        part(tor(0.093, 0.02, 5, 12), kcol.dark, { y: 0.325 + ky, rx: PI / 2 }),
        part(tor(0.096, 0.012, 4, 12), kcol.dark, { y: 0.19 + ky, rx: PI / 2 }),
        part(box(0.03, 0.035, 0.03), BUCKLE, { x: s * 0.095, y: 0.19 + ky }),
        part(sph(0.1, 12, 8), kcol.base, { y: 0.075 + ky, z: 0.045, sx: 1.05, sy: 0.75, sz: 1.55 }),
        part(box(0.2, 0.04, 0.33), kcol.dark, { y: 0.02 + ky, z: 0.04 }),
      );
    } else { // chunky
      K.push(
        part(cyl(0.06, 0.062, 0.05, 10), c.skin, { y: 0.305 + ky }),
        part(cyl(0.066, 0.072, 0.1, 10), SOCK, { y: 0.25 + ky }),
        part(cyl(0.088, 0.095, 0.09, 12), kcol.base, { y: 0.16 + ky }),
        part(tor(0.088, 0.018, 5, 12), kcol.dark, { y: 0.2 + ky, rx: PI / 2 }),
        part(sph(0.1, 12, 8), kcol.base, { y: 0.075 + ky, z: 0.045, sx: 1.05, sy: 0.75, sz: 1.55 }),
        part(box(0.2, 0.04, 0.33), kcol.dark, { y: 0.02 + ky, z: 0.04 }),
      );
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

function buildTorso(B, p, c) {
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
    part(cyl(0.06, 0.07, 0.09, 10), c.skin, { y: 0.56 }),
  );

  if (top === 'vest') {
    shirtBody(T, sc.base);
    T.push(
      part(cyl(0.228, 0.255, 0.33, 16, true, 0.5, TAU - 1.0), tc.base, { y: 0.3 }),
      part(cyl(0.24, 0.24, 0.025, 16, true, 0.5, TAU - 1.0), tc.dark, { y: 0.145 }),
    );
    shirtCollar(T, sc.base);
    for (const s of [-1, 1]) {
      T.push(
        part(box(0.09, 0.08, 0.025), tc.dark, { x: s * 0.13, y: 0.27, z: 0.218, ry: s * 0.55 }),
        part(box(0.095, 0.03, 0.03), tc.base, { x: s * 0.13, y: 0.31, z: 0.222, ry: s * 0.55 }),
        part(sph(0.012, 6, 4), BUCKLE, { x: s * 0.13, y: 0.3, z: 0.24, ry: s * 0.55 }),
      );
    }
  } else if (top === 'sailor') {
    shirtBody(T, sc.base);
    // stripes around the body
    for (const y of [0.2, 0.27, 0.34, 0.41]) {
      const r = 0.235 - ((y - 0.13) / 0.38) * 0.03 + 0.002;
      T.push(part(tor(r, 0.013, 4, 20), tc.base, { y, rx: PI / 2 }));
    }
    // the big square collar flap on the back and its front points
    T.push(
      part(box(0.34, 0.17, 0.022), tc.base, { y: 0.46, z: -0.205, rx: 0.42 }),
      part(box(0.34, 0.014, 0.024), sc.base, { y: 0.4, z: -0.23, rx: 0.42 }),
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
      // drapes from the shoulders to just over the belt
      part(cyl(0.2, 0.35, 0.42, 18, true), tc.base, { y: 0.31 }),
      part(sph(0.205, 18, 6, 0, TAU, 0, PI / 2), tc.base, { y: 0.52, sy: 0.5 }),
      part(tor(0.316, 0.016, 4, 24), tc.dark, { y: 0.19, rx: PI / 2 }),
      part(tor(0.298, 0.014, 4, 24), sc.base, { y: 0.24, rx: PI / 2 }),
      part(tor(0.35, 0.02, 4, 24), tc.dark, { y: 0.105, rx: PI / 2 }),
      part(tor(0.085, 0.02, 5, 14), tc.dark, { y: 0.575, rx: PI / 2 }),
    );
    // tassels round the hem
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      T.push(part(box(0.018, 0.05, 0.018), tc.dark, { x: Math.sin(a) * 0.35, y: 0.075, z: Math.cos(a) * 0.35 }));
    }
  } else if (top === 'coat') {
    shirtBody(T, sc.base);
    shirtCollar(T, sc.base);
    T.push(
      part(cyl(0.232, 0.268, 0.5, 18, true, 0.45, TAU - 0.9), tc.base, { y: 0.24 }),
      part(cyl(0.268, 0.3, 0.26, 18, true, 0.9, TAU - 1.8), tc.base, { y: -0.12 }),
      part(cyl(0.3, 0.302, 0.03, 18, true, 0.9, TAU - 1.8), tc.dark, { y: -0.24 }),
    );
    for (const s of [-1, 1]) {
      T.push(part(box(0.075, 0.17, 0.02), tc.dark, { x: s * 0.095, y: 0.41, z: 0.205, ry: s * 0.45, rz: s * 0.25 }));
      for (const y of [0.2, 0.28, 0.36]) T.push(part(sph(0.016, 6, 4), GOLD, { x: s * 0.115, y, z: 0.235 }));
    }
  }
}

// ------------------------------------------------------------------- arms
function buildArms(B, p, c) {
  const top = p.top.style, tc = c.top, sc = c.shirt;
  for (const s of [1, -1]) {
    const SH = s > 0 ? B.shL : B.shR, EL = s > 0 ? B.elL : B.elR;
    if (top === 'tank') {
      SH.push(
        part(sph(0.075, 10, 8), c.skin, { y: -0.02 }),
        part(cyl(0.062, 0.05, 0.24, 10), c.skin, { y: -0.14 }),
      );
    } else if (top === 'coat') {
      SH.push(
        part(sph(0.09, 10, 8), tc.base, { y: -0.02 }),
        part(cyl(0.088, 0.074, 0.25, 10), tc.base, { y: -0.13 }),
      );
    } else {
      const sleeve = sc.base;
      const cuff = top === 'poncho' ? sc.dark : tc.base;
      SH.push(
        part(sph(0.09, 10, 8), sleeve, { y: -0.02 }),
        part(cyl(0.088, 0.08, 0.12, 10), sleeve, { y: -0.07 }),
        part(tor(0.08, 0.012, 5, 10), cuff, { y: -0.13, rx: PI / 2 }),
        part(cyl(0.052, 0.048, 0.14, 10), c.skin, { y: -0.19 }),
      );
      if (top === 'sailor') SH.push(part(tor(0.086, 0.01, 4, 10), tc.base, { y: -0.06, rx: PI / 2 }));
    }
    if (top === 'coat') {
      EL.push(
        part(sph(0.07, 8, 6), tc.base),
        part(cyl(0.068, 0.062, 0.12, 10), tc.base, { y: -0.06 }),
        part(tor(0.062, 0.016, 5, 10), sc.base, { y: -0.12, rx: PI / 2 }),
        part(cyl(0.045, 0.045, 0.03, 10), c.skin, { y: -0.135 }),
      );
    } else {
      EL.push(
        part(sph(0.05, 8, 6), c.skin),
        part(cyl(0.048, 0.043, 0.15, 10), c.skin, { y: -0.08 }),
      );
    }
    EL.push(
      part(cyl(0.052, 0.052, 0.045, 10), GLOVE, { y: -0.16 }),
      part(sph(0.062, 10, 8), GLOVE, { y: -0.205, sx: 0.9, sz: 1.1 }),
      part(sph(0.03, 6, 4), GLOVE, { x: s * -0.045, y: -0.19, z: 0.04 }),
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
      part(tor(grand ? 0.125 : 0.12, grand ? 0.062 : 0.058, 8, 18), base, { y: 0.54, rx: PI / 2 + 0.12 }),
      part(sph(0.065, 8, 6), dark, { x: 0.08, y: 0.5, z: 0.1 }),
    );
    tail.visible = true;
    if (grand) {
      // a longer, sun-faded scarf with a cream stripe and frayed end
      tail.seg2Z = 0.29;
      B.tail1.push(part(box(0.12, 0.03, 0.3), base, { z: 0.15 }));
      B.tail2.push(
        part(box(0.11, 0.028, 0.28), base, { z: 0.14 }),
        part(box(0.112, 0.032, 0.03), '#e8c98a', { z: 0.18 }),
        part(box(0.112, 0.032, 0.03), '#e8c98a', { z: 0.23 }),
        part(box(0.11, 0.03, 0.035), dark, { z: 0.27 }),
      );
    } else {
      tail.seg2Z = 0.21;
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
function buildExtra(B, p, c) {
  const T = B.torso, st = p.extra.style, ec = c.extra;
  const R = CHEST_R[p.top.style] ?? 0.232;
  if (st === 'satchel') {
    const bagX = { coat: 0.31, poncho: 0.37 }[p.top.style] ?? 0.28;
    T.push(
      // strap across the chest (right shoulder → left hip)
      part(box(0.045, 0.62, 0.02), ec.dark, { y: 0.3, z: R, rz: 0.72 }),
      part(box(0.045, 0.62, 0.02), ec.dark, { y: 0.3, z: -R, rz: -0.72 }),
      // bag on the left hip
      part(box(0.08, 0.16, 0.2), ec.base, { x: bagX, y: 0.06, z: 0.02 }),
      part(box(0.09, 0.07, 0.21), ec.dark, { x: bagX + 0.005, y: 0.12, z: 0.02 }),
      part(box(0.03, 0.035, 0.035), BUCKLE, { x: bagX + 0.05, y: 0.09, z: 0.02 }),
    );
  } else if (st === 'backpack') {
    const z = -(R + 0.07);
    T.push(
      part(box(0.3, 0.3, 0.14), ec.base, { y: 0.3, z }),
      part(box(0.31, 0.11, 0.152), ec.dark, { y: 0.41, z }),
      part(box(0.2, 0.1, 0.04), ec.dark, { y: 0.22, z: z - 0.08 }),
      part(box(0.03, 0.035, 0.02), BUCKLE, { y: 0.37, z: z - 0.08 }),
      part(cyl(0.055, 0.055, 0.34, 10), '#e8dcc0', { y: 0.5, z, rz: PI / 2 }), // bedroll
    );
    for (const s of [-1, 1]) {
      T.push(
        part(box(0.04, 0.3, 0.02), ec.dark, { x: s * 0.11, y: 0.33, z: R - 0.002 }),
        part(box(0.04, 0.02, 0.42), ec.dark, { x: s * 0.11, y: 0.6, z: -0.01 }),
      );
    }
  }
}

// ------------------------------------------------------------- head shape
// The head starts as a sphere; a smooth deformation field reshapes the lower
// half into a jaw and chin. The cranium (above the brow) is left alone, so
// hair and hats keep fitting every shape. The same field is applied to the
// skin, side hair, hoods and the face decal, so everything stays attached.
//   w: overall width, jaw: taper toward the chin, chin: lengthen the front of
//   the lower face, cheek: fullness at cheek height, flat: square off the chin
export const HEAD_SHAPE_PARAMS = {
  round: { w: 1, jaw: 0, chin: 0, cheek: 0, flat: 0 },
  oval: { w: 0.91, jaw: 0.34, chin: 0.22, cheek: 0.012, flat: 0.15 },
  heart: { w: 0.97, jaw: 0.56, chin: 0.2, cheek: 0.01, flat: 0 },
  square: { w: 0.93, jaw: 0.16, chin: 0.15, cheek: 0, flat: 0.6 },
  long: { w: 0.86, jaw: 0.36, chin: 0.38, cheek: 0, flat: 0 },
  soft: { w: 0.96, jaw: 0.24, chin: 0.1, cheek: 0.035, flat: 0 },
};

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Map a point in head space (origin at the head centre) to its shaped position. */
function shapePoint(P, x, y, z, out) {
  const t = sstep(0.03, -0.3, y);          // 0 at the brow, 1 at the bottom of the head
  const front = sstep(-0.12, 0.22, z);     // the chin is at the front
  // every term fades to identity at the brow (y = 0.04), so there's no seam
  let kx = 1 - (1 - P.w) * sstep(0.04, -0.1, y);
  kx *= 1 - P.jaw * Math.pow(t, 1.4);
  // cheeks: a soft band around cheek height
  const band = Math.exp(-(((y + 0.1) / 0.09) ** 2)) * sstep(0.04, -0.02, y);
  const r = Math.hypot(x, z) || 1;
  const cheek = P.cheek * band * sstep(-0.05, 0.15, z);
  let ny = y * (1 + P.chin * t * front);
  if (P.flat) ny += P.flat * 0.06 * t * t * front;      // lift and flatten the chin line
  out.x = x * kx + (x / r) * cheek;
  out.y = ny;
  out.z = z * (1 + P.chin * 0.25 * t * front) + (z / r) * cheek * 0.5;
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
  const P = HEAD_SHAPE_PARAMS[shape];
  if (!P || shape === 'round') return geo;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const e = 1e-3;
  const col = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) - cy, z = pos.getZ(i);
    if (y > 0.04) continue; // untouched above the brow
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
      _n.lerp(_b.set(nx, ny, nz), 1 - NORMAL_FOLLOW).normalize();
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
  const g = new THREE.SphereGeometry(0.32, 24, 16, PI / 2 - 0.75, 1.5, PI / 2 - 0.55, 1.1);
  g.scale(1.014, 0.964, 0.984);
  g.translate(0, HC, 0);
  return shapeHeadGeometry(g, shape);
}

// ------------------------------------------------------------------- head
function buildHead(B, p, c) {
  const H = B.head;
  const first = H.length;
  H.push(
    part(sph(0.32, 24, 18), c.skin, { y: HC, sy: 0.95, sz: 0.97 }),
    part(sph(0.06, 8, 6), c.skinShade, { x: 0.31, y: HC - 0.02, sx: 0.6 }),
    part(sph(0.06, 8, 6), c.skinShade, { x: -0.31, y: HC - 0.02, sx: 0.6 }),
  );
  const hat = p.hat.style;
  const fit = hat === 'none' || hat === 'circlet' || hat === 'flowerCrown' ? 'none' : hat === 'furHood' ? 'hood' : 'hat';
  HAIR[p.hair.style](H, c, fit);
  if (hat !== 'none') H.push(HATS[hat](c));
  // shape everything on the head (the field leaves the crown, and so hats, alone)
  for (let i = first; i < H.length; i++) shapeHeadGeometry(H[i], p.head);
}

// ------------------------------------------------------------------- hair
function hairCap(H, c) {
  // tilted so the fringe sits high on the forehead
  const cap = part(sph(0.338, 20, 12, 0, TAU, 0, 1.55), c.hair, { rx: -0.28 });
  cap.translate(0, HC + 0.012, -0.012);
  H.push(cap);
}
function spikyFringe(H, c) {
  const fringe = [[-0.2, 0.08, -0.25], [-0.1, 0.03, -0.08], [0.0, 0.05, 0.05], [0.1, 0.03, 0.12], [0.2, 0.08, 0.28]];
  for (const [x, lift, rz] of fringe) {
    H.push(part(cone(0.075, 0.24, 5), c.hair, { x, y: HC + 0.05 + lift, z: 0.29 - Math.abs(x) * 0.25, rx: PI - 0.35, rz }));
  }
}
function sideLocks(H, c) {
  for (const s of [-1, 1]) {
    H.push(part(cone(0.07, 0.26, 5), c.hair, { x: s * 0.3, y: HC - 0.05, z: 0.06, rz: s * -0.25 + PI, rx: -0.1 }));
    H.push(part(cone(0.06, 0.2, 5), c.hair2, { x: s * 0.32, y: HC + 0.02, z: -0.1, rz: s * -(PI / 2 + 0.5) }));
  }
}

const HAIR = {
  spiky(H, c, fit) {
    hairCap(H, c);
    spikyFringe(H, c);
    sideLocks(H, c);
    if (fit === 'hood') return;
    const tufts = [[-0.2, 0.12], [0, 0.18], [0.2, 0.1], [-0.12, -0.02], [0.12, -0.04], [0, 0.04]];
    for (const [x, y] of tufts) {
      H.push(part(cone(0.085, 0.3, 5), (x + y) % 0.2 > 0.05 ? c.hair2 : c.hair,
        { x, y: HC + y, z: -0.27, rx: -PI / 2 - 0.35 + y, rz: x * 1.4 }));
    }
    // a cheeky ahoge poking out the back
    H.push(part(cone(0.04, 0.22, 4), c.hair, { x: 0.05, y: HC + 0.34, z: -0.22, rx: -0.9, rz: -0.3 }));
    if (fit === 'none') {
      // bare head: spikes all over the crown
      for (const [x, z, rz, rx] of [[-0.14, 0.08, 0.5, 0.3], [0.13, 0.06, -0.5, 0.25], [0, 0.0, 0, -0.1], [-0.18, -0.12, 0.7, -0.4], [0.17, -0.13, -0.7, -0.45]]) {
        H.push(part(cone(0.09, 0.26, 5), rx > 0.2 ? c.hair : c.hair2, { x, y: HC + 0.3, z, rz, rx }));
      }
    }
  },
  bob(H, c, fit) {
    hairCap(H, c);
    // straight bangs
    for (let i = 0; i < 6; i++) {
      const x = -0.2 + i * 0.08;
      H.push(part(cone(0.062, 0.17, 5), i % 2 ? c.hair2 : c.hair, { x, y: HC + 0.13 + Math.abs(x) * 0.15, z: 0.3 - Math.abs(x) * 0.3, rx: PI - 0.2 }));
    }
    if (fit === 'hood') return;
    // curtain down to the jaw, open at the face
    H.push(part(sph(0.352, 20, 10, PI / 2 + 1.0, TAU - 2.0, 0.85, 1.3), c.hair, { y: HC, sx: 1.04 }));
    // a highlight band round the back only (open at the face)
    H.push(part(sph(0.356, 20, 2, PI / 2 + 1.1, TAU - 2.2, 1.45, 0.12), c.hair2, { y: HC, sx: 1.04 }));
  },
  ponytail(H, c, fit) {
    hairCap(H, c);
    spikyFringe(H, c);
    sideLocks(H, c);
    if (fit === 'hood') return;
    const tieY = fit === 'hat' ? HC + 0.02 : HC + 0.12;
    H.push(
      part(sph(0.075, 10, 8), c.hair, { y: tieY, z: -0.33 }),
      part(tor(0.05, 0.02, 5, 10), c.hair2, { y: tieY - 0.01, z: -0.37, rx: 0.5 }),
      part(cone(0.09, 0.44, 7), c.hair, { y: tieY - 0.2, z: -0.4, rx: PI + 0.3 }),
      part(cone(0.05, 0.2, 5), c.hair2, { y: tieY - 0.26, z: -0.45, rx: PI + 0.45 }),
    );
  },
  buns(H, c, fit) {
    hairCap(H, c);
    spikyFringe(H, c);
    sideLocks(H, c);
    if (fit === 'hood') return;
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
  curly(H, c, fit) {
    hairCap(H, c);
    // curls on a Fibonacci sphere, skipping the face (and the crown under a hat)
    const N = 40;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (y < -0.3) continue;
      if (z > 0.35 && y < 0.55) continue;                      // face
      if (fit === 'hat' && y > 0.42) continue;                 // under the hat
      if (fit === 'hood' && !(z > 0.3 && y > 0.3)) continue;   // only a few at the hood's edge
      H.push(part(sph(0.085, 7, 5), i % 3 ? c.hair : c.hair2, { x: x * 0.33, y: HC + y * 0.32, z: z * 0.33 }));
    }
    // fringe curls
    for (const x of [-0.17, -0.06, 0.06, 0.17]) H.push(part(sph(0.07, 7, 5), c.hair, { x, y: HC + 0.18 + Math.abs(x) * 0.1, z: 0.27 - Math.abs(x) * 0.2 }));
  },
};

// ------------------------------------------------------------------- hats
// Each returns one merged geometry in head space. Brimmed hats are built
// upright and tipped back so the face shows, like the original pith helmet.
const tipBack = (parts, tilt = -0.2) => group(parts, { y: HC, z: -0.02, rx: tilt });

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
    // weathered, with a red band and a stitched patch
    return pith('#c4ad78', '#b03a2e', '#9c8556', [
      part(box(0.1, 0.07, 0.02), '#8f7a4c', { x: 0.2, y: 0.33, z: 0.18, ry: 0.8, rx: -0.4 }),
      part(sph(0.03, 6, 4), '#7a2a1e', { x: 0.28, y: 0.22, z: 0.25 }),
    ]);
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
    return group(parts, { y: HC + 0.19, z: -0.03, rx: -0.3 });
  },
  circlet() {
    return group([
      part(tor(0.345, 0.016, 6, 32), GOLD, { rx: PI / 2 }),
      part(sph(0.03, 8, 6), GOLD, { z: 0.35 }),
      part(new THREE.OctahedronGeometry(0.04), '#3ff0d8', { z: 0.37, sy: 1.4 }),
    ], { y: HC + 0.14, z: -0.02, rx: 0.15 });
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
    g.fillStyle = mix(skin.dark, '#5a2810', 0.45);
    const dots = [[-30, -8], [-22, -2], [-36, 0], [-26, 6], [-16, -6], [-32, 9]];
    for (const [dx, dy] of dots) for (const s of [-1, 1]) {
      g.beginPath(); g.arc(S * 0.5 + s * (S * 0.2 + dx * 0.5) , S * 0.7 + dy, 2.2, 0, TAU); g.fill();
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
