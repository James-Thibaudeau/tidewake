// Geometry for ashore level pieces: vertex-coloured primitives in the props
// style, built straight into level space so they can all be merged into one
// mesh (plus one ink-outline mesh). Each builder returns an array of parts.
import * as THREE from 'three';
import { part } from '../props.js';

const C = {
  earth: '#a39484', earthTop: '#6cc24a', earthDark: '#857766',
  ruin: '#ddd3bf', ruinDark: '#b4a88e', ruinCap: '#ebe2cf', moss: '#7fae5a',
  bark: '#7a5233', barkDark: '#5e3e26', leaf: '#62b548', leafDark: '#3f7d33',
  rock: '#8f877d', rockDark: '#6f685f', rockTop: '#7aa95c',
  plank: '#b98a52', plank2: '#a8774a', post: '#6e4a2b', rope: '#d9c08a',
  stone: '#9a938a', stoneTop: '#b8b1a6', logEnd: '#d4ad74',
};

/** Place a local part: t = transform relative to the piece; piece rot/centre applied after. */
function placed(geo, color, p, t = {}, extra = {}) {
  // compose: local transform → rotate about y by p.rot → translate to piece centre
  const g = part(geo, color, { ...t, ...extra });
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}

/** A wooden handrail along one long edge (side -1 = outer, +1 = inner), posts about every metre. */
function railParts(p, side) {
  const P = [];
  const z = side * (p.hz - 0.1), L = p.hx * 2 - 0.24;
  const n = Math.max(2, Math.round(L / 1.0) + 1);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (L * i) / (n - 1);
    P.push(placed(new THREE.CylinderGeometry(0.06, 0.07, 0.72, 6), C.post, p, { x, y: p.top + 0.36, z }));
  }
  P.push(placed(new THREE.BoxGeometry(L + 0.1, 0.09, 0.11), C.plank2, p, { y: p.top + 0.72, z }));
  P.push(placed(new THREE.BoxGeometry(L, 0.04, 0.04), C.rope, p, { y: p.top + 0.38, z }));
  return P;
}

export function pieceParts(p) {
  const P = pieceBody(p);
  if (p.rail) P.push(...railParts(p, -1));
  if (p.rails2) P.push(...railParts(p, -1), ...railParts(p, 1));
  return P;
}

function pieceBody(p) {
  const P = [];
  const h = p.top - (p.base ?? 0);
  switch (p.kind) {
    case 'block': {
      const H = h + 0.6, w = p.hx * 2, d = p.hz * 2;
      if (p.carved) {
        // stone stairs: pale treads on a rocky riser
        P.push(placed(new THREE.BoxGeometry(w, H, d), C.rock, p, { y: p.top - H / 2 }, { c2: C.rockDark, split: 0.7 }));
        P.push(placed(new THREE.BoxGeometry(w + 0.04, 0.12, d + 0.04), C.stoneTop, p, { y: p.top - 0.04 }));
        break;
      }
      P.push(placed(new THREE.BoxGeometry(w, H, d), C.earth, p, { y: p.top - H / 2 }, { c2: C.earthDark, split: 0.5 }));
      P.push(placed(new THREE.BoxGeometry(w + 0.12, 0.22, d + 0.12), C.earthTop, p, { y: p.top - 0.08 }));
      break;
    }
    case 'bridge': {
      // plank deck across the moat on stilts; rails come from pieceParts
      const L = p.hx * 2, d = p.hz * 2, n = Math.max(4, Math.round(L / 0.55));
      for (let i = 0; i < n; i++) {
        const x = -p.hx + (L / n) * (i + 0.5);
        P.push(placed(new THREE.BoxGeometry(L / n - 0.05, 0.14, d), i % 2 ? C.plank : C.plank2, p, { x, y: p.top - 0.07 }));
      }
      for (const sz of [-1, 1]) P.push(placed(new THREE.BoxGeometry(L, 0.24, 0.16), C.post, p, { y: p.top - 0.26, z: sz * (p.hz - 0.1) }));
      const nPost = Math.max(2, Math.round(L / 2.2) + 1);
      for (let i = 0; i < nPost; i++) {
        const x = -p.hx + 0.3 + ((L - 0.6) * i) / (nPost - 1);
        for (const sz of [-1, 1]) {
          const H = p.top + 2.4;
          P.push(placed(new THREE.CylinderGeometry(0.11, 0.13, H, 6), C.post, p, { x, y: p.top - H / 2, z: sz * (p.hz - 0.1) }));
        }
      }
      break;
    }
    case 'column': {
      const H = h + 0.6, w = p.hx * 2, d = p.hz * 2;
      P.push(placed(new THREE.BoxGeometry(w * 0.86, H - 0.3, d * 0.86), C.ruin, p, { y: p.top - 0.3 - (H - 0.3) / 2 }, { c2: C.ruinDark, split: 0.35 }));
      P.push(placed(new THREE.BoxGeometry(w, 0.3, d), C.ruinCap, p, { y: p.top - 0.15 }));
      // a mossy corner and a chipped edge for character
      P.push(placed(new THREE.BoxGeometry(w * 0.4, 0.06, d * 0.35), C.moss, p, { x: w * 0.25, y: p.top + 0.02, z: -d * 0.28 }));
      P.push(placed(new THREE.BoxGeometry(w * 0.3, 0.2, 0.2), C.ruinDark, p, { x: -w * 0.3, y: p.top - 0.42, z: d * 0.45, ry: 0.3 }));
      break;
    }
    case 'disc': {
      if (p.trunk !== 0) {
        const th = Math.max(0.5, p.top - 0.3 - (p.base ?? 0) + 0.4);
        P.push(placed(new THREE.CylinderGeometry(0.36, 0.5, th, 8), C.bark, p, { y: p.top - 0.3 - th / 2 }, { c2: C.barkDark }));
      }
      P.push(placed(new THREE.CylinderGeometry(p.r, p.r * 0.92, 0.34, 14), C.leaf, p, { y: p.top - 0.17 }, { c2: C.leafDark, split: 0.55 }));
      // leafy tufts around the rim, below the walking surface
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + p.cx;
        P.push(placed(new THREE.IcosahedronGeometry(0.28, 0), i % 2 ? C.leaf : C.leafDark, p,
          { x: Math.cos(a) * p.r * 0.92, y: p.top - 0.32, z: Math.sin(a) * p.r * 0.92, s: 1 }));
      }
      break;
    }
    case 'ledge': case 'vista': {
      // the slab reaches 0.8 m back into the rock so it looks attached to the face
      const w = p.hx * 2, d = p.hz * 2 + 0.8, th = p.kind === 'vista' ? 0.7 : 0.55;
      P.push(placed(new THREE.BoxGeometry(w, th, d), C.rock, p, { y: p.top - th / 2, z: 0.4 }, { c2: C.rockDark, split: 0.6 }));
      P.push(placed(new THREE.BoxGeometry(w * 0.96, 0.08, d * 0.9), C.rockTop, p, { y: p.top + 0.0, z: 0.4 }));
      P.push(placed(new THREE.ConeGeometry(Math.min(w, d) * 0.3, 0.9, 5), C.rockDark, p, { y: p.top - th - 0.4, z: 0.3, rx: Math.PI }));
      if (p.kind === 'vista') {
        for (const s of [-1, 1]) P.push(placed(new THREE.IcosahedronGeometry(0.16, 0), '#f2d65a', p, { x: s * (p.hx - 0.3), y: p.top + 0.12, z: -p.hz + 0.3 }));
      }
      break;
    }
    case 'plank': {
      const w = p.hx * 2, d = p.hz * 2, n = 4;
      for (let i = 0; i < n; i++) {
        const z = -p.hz + (d / n) * (i + 0.5);
        P.push(placed(new THREE.BoxGeometry(w, 0.14, d / n - 0.05), i % 2 ? C.plank : C.plank2, p, { y: p.top - 0.07, z }));
      }
      P.push(placed(new THREE.BoxGeometry(0.16, 0.22, d + 0.1), C.post, p, { x: -p.hx + 0.15, y: p.top - 0.25 }));
      P.push(placed(new THREE.BoxGeometry(0.16, 0.22, d + 0.1), C.post, p, { x: p.hx - 0.15, y: p.top - 0.25 }));
      if (p.posts) {
        // stilts down into the water
        const H = p.top - (p.base ?? -2.4);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          P.push(placed(new THREE.CylinderGeometry(0.09, 0.11, H, 6), C.post, p, { x: sx * (p.hx - 0.15), y: p.top - H / 2, z: sz * (p.hz - 0.15) }));
        }
      } else {
        // scaffold: a ledger beam bolted into the rock behind the deck, and two
        // braces from the deck's front edge back down into the face (+z is towards the wall)
        P.push(placed(new THREE.BoxGeometry(w + 0.2, 0.26, 0.9), C.post, p, { y: p.top - 0.2, z: p.hz + 0.3 }));
        for (const sx of [-1, 1]) {
          P.push(placed(new THREE.CylinderGeometry(0.09, 0.09, 2.1, 6), C.post, p, { x: sx * (p.hx - 0.3), y: p.top - 0.85, z: 0.15, rx: -0.85 }));
        }
        P.push(placed(new THREE.BoxGeometry(w * 0.8, 0.05, 0.05), C.rope, p, { y: p.top + 0.55, z: -p.hz + 0.1 }));
        for (const sx of [-1, 1]) P.push(placed(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), C.post, p, { x: sx * (p.hx - 0.2), y: p.top + 0.28, z: -p.hz + 0.1 }));
      }
      break;
    }
    case 'stone': {
      const H = p.top + 2.4;
      P.push(placed(new THREE.CylinderGeometry(p.r * 0.95, p.r * 1.08, H, 7), C.stone, p, { y: p.top - H / 2, ry: p.cz }, { c2: '#7d766d', split: 0.75 }));
      P.push(placed(new THREE.CylinderGeometry(p.r * 0.8, p.r * 0.95, 0.12, 7), C.stoneTop, p, { y: p.top + 0.02, ry: p.cz }));
      break;
    }
    case 'log': {
      const L = p.hx * 2, R = 0.65;
      P.push(placed(new THREE.CylinderGeometry(R, R * 0.95, L, 10), C.bark, p, { y: p.top - R, rz: Math.PI / 2 }, { c2: C.barkDark }));
      for (const s of [-1, 1]) {
        P.push(placed(new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.04, 10), C.logEnd, p, { x: s * (L / 2 + 0.01), y: p.top - R, rz: Math.PI / 2 }));
      }
      // a stubby broken branch
      P.push(placed(new THREE.CylinderGeometry(0.12, 0.18, 0.9, 6), C.barkDark, p, { x: L * 0.2, y: p.top - R + 0.2, z: R * 0.9, rx: 1.0 }));
      break;
    }
    default: break;
  }
  return P;
}

/** The lookout tree's trunk, branches out to each disc, and a crown of leaves. */
export function lookoutTreeParts(tree, discs) {
  const P = [];
  const H = tree.top - tree.base + 0.5;
  const at = (g, color, t, extra = {}) => { const q = part(g, color, { ...t, ...extra }); q.translate(tree.x, 0, tree.z); return q; };
  P.push(at(new THREE.CylinderGeometry(0.72, 0.98, H, 10), C.bark, { y: tree.base - 0.5 + H / 2 }, { c2: C.barkDark, split: 0.3 }));
  for (const d of discs) {
    const dx = d.cx - tree.x, dz = d.cz - tree.z, L = Math.hypot(dx, dz);
    const g = new THREE.CylinderGeometry(0.16, 0.24, L, 6);
    g.rotateZ(Math.PI / 2);
    g.rotateY(-Math.atan2(dz, dx));
    P.push(at(g, C.barkDark, { x: dx / 2, y: d.top - 0.45, z: dz / 2 }));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P.push(at(new THREE.IcosahedronGeometry(0.75, 0), i % 2 ? C.leaf : C.leafDark, { x: Math.cos(a) * 0.5, y: tree.top + 0.2 + (i % 2) * 0.3, z: Math.sin(a) * 0.5 }));
  }
  return P;
}

/** A small rowboat drawn up on the sand; local +x points out to sea. */
export function rowboatParts(b) {
  const P = [];
  const at = (g, color, t, extra = {}) => {
    const q = part(g, color, { ...t, ...extra });
    q.rotateZ(0.08);           // listing a little on the sand
    q.rotateY(b.rot);
    q.translate(b.x, b.y, b.z);
    return q;
  };
  // hull: a half-pipe along local x, open side up
  const hull = new THREE.CylinderGeometry(0.72, 0.72, 3.0, 10, 1, true, -Math.PI / 2, Math.PI);
  hull.rotateX(Math.PI / 2); hull.rotateY(Math.PI / 2);
  P.push(at(hull, '#8a5a32', { y: 0.55, sy: 0.75 }));
  P.push(at(new THREE.ConeGeometry(0.72, 0.9, 10, 1, true, 0, Math.PI).rotateZ(-Math.PI / 2), '#8a5a32', { x: 1.95, y: 0.55, sy: 0.75 }));
  P.push(at(new THREE.BoxGeometry(0.12, 0.5, 1.2), '#6e4a2b', { x: -1.5, y: 0.45 }));
  for (const x of [-0.6, 0.5]) P.push(at(new THREE.BoxGeometry(0.32, 0.08, 1.25), '#b98a52', { x, y: 0.62 }));
  P.push(at(new THREE.BoxGeometry(3.4, 0.07, 0.07), '#6e4a2b', { x: 0.1, y: 0.92, z: 0.7 }));
  P.push(at(new THREE.BoxGeometry(3.4, 0.07, 0.07), '#6e4a2b', { x: 0.1, y: 0.92, z: -0.7 }));
  // oars resting across the seats
  for (const s of [-1, 1]) {
    P.push(at(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), '#c99a5e', { x: 0.1 + s * 0.35, y: 0.72, z: s * 0.2, rx: Math.PI / 2, rz: s * 0.25 }));
    P.push(at(new THREE.BoxGeometry(0.06, 0.32, 0.5), '#c99a5e', { x: 0.1 + s * 0.35 + s * 0.27, y: 0.72, z: s * 1.25 }));
  }
  return P;
}
