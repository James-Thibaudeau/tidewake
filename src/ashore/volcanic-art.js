// Geometry for volcanic islands' level pieces (pieces.js hands them over by
// kind and style): hexagonal basalt columns, cinder ledges (cracked slabs
// that crumble), the steam vents' rims and the basalt shelves they throw you
// to, the stone causeway over the lava, and the stack of basalt columns that
// holds the chest. Built like pieces.js: vertex-coloured parts in level space.
// A crumbling piece is drawn on its own so it can shake and fall
// (volcanic-life.js); the glow in its cracks comes from emberParts().
import * as THREE from 'three';
import { part, jitter } from '../props.js';

const C = {
  basalt: '#5a5254', basaltDark: '#3d3537', basaltTop: '#7b7072', basaltTop2: '#6c6163',
  cinder: '#5f4a43', cinderDark: '#3d2c28', cinderTop: '#7a6158',
  ash: '#9a918b', ash2: '#837a74', sulphur: '#e6cf52', sulphurDark: '#b9a038', mouth: '#1d1718',
  ember: '#ff8a2e', emberHot: '#ffd25a', moss: '#8a9150',
};

/** A local part turned by the piece's rot and moved to its centre (as in pieces.js). */
function placed(geo, color, p, t = {}, extra = {}) {
  const g = part(geo, color, { ...t, ...extra });
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}

const seedOf = (p) => Math.floor(Math.abs(p.cx * 13.1 + p.cz * 7.3)) % 997;
const hex = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, 6);

/** Flat hexagonal tiles over a rectangle w × d (local), each a little proud or sunk: the tops of the columns a slab is made of. */
function hexTiles(p, w, d, y, z0 = 0) {
  const P = [], R = 0.4, dx = R * 1.5, dz = R * Math.sqrt(3);
  const seed = seedOf(p);
  for (let i = 0, x = -w / 2 + R * 0.9; x <= w / 2 - R * 0.7; i++, x += dx) {
    for (let z = -d / 2 + (i % 2 ? dz : dz / 2); z <= d / 2 - R * 0.5; z += dz) {
      const k = Math.sin(seed + x * 3.1 + z * 5.7);
      P.push(placed(hex(R * 0.94, R * 0.94, 0.08), k > 0.2 ? C.basaltTop : C.basaltTop2, p, { x, y: y + k * 0.015, z: z + z0, ry: Math.PI / 6 }));
    }
  }
  return P;
}

/**
 * A basalt column: a hexagonal pillar from below the ground (or the lava) to
 * its top, the lower drum a little wider and turned, a paler cap, and a few
 * broken pieces at its foot.
 */
export function basaltParts(p) {
  const P = [], seed = seedOf(p), spin = seed * 0.37;
  const y0 = Math.min(p.base ?? 0, 0) - 1, H = p.top - y0, foot = Math.max(y0 + 1, p.base ?? 0);
  const hLow = Math.min(H * 0.5, Math.max(0.6, H - 1.2));
  P.push(placed(hex(p.r * 1.06, p.r * 1.1, hLow), C.basalt, p, { y: y0 + hLow / 2, ry: spin + 0.35 }, { c2: C.basaltDark, split: 0.6 }));
  P.push(placed(hex(p.r, p.r, H - hLow + 0.02), C.basalt, p, { y: y0 + hLow + (H - hLow) / 2, ry: spin }, { c2: C.basaltDark, split: 0.25 }));
  P.push(placed(hex(p.r * 0.97, p.r, 0.1), C.basaltTop, p, { y: p.top - 0.03, ry: spin }));
  // a joint across the column, a little below the top
  P.push(placed(hex(p.r * 1.015, p.r * 1.015, 0.05), C.basaltDark, p, { y: p.top - 0.5 - (seed % 5) * 0.12, ry: spin }));
  for (const k of [0, 1]) {
    const a = spin + 1.3 + k * 2.6, r = p.r * (0.34 - k * 0.08);
    P.push(placed(hex(r, r, r * 1.2), k ? C.basaltDark : C.basalt, p, { x: Math.cos(a) * p.r * 1.35, y: foot + r * 0.3, z: Math.sin(a) * p.r * 1.35, rz: 1.2, ry: a }));
  }
  return P;
}

/** A step of a basalt stair near home: a block of columns split by dark joints, a paler tread on top. */
export function basaltStepParts(p) {
  const w = p.hx * 2, d = p.hz * 2, H = p.top - (p.base ?? 0) + 0.6, P = [];
  P.push(placed(new THREE.BoxGeometry(w, H, d), C.basalt, p, { y: p.top - H / 2 }, { c2: C.basaltDark, split: 0.7 }));
  P.push(placed(new THREE.BoxGeometry(w + 0.04, 0.1, d + 0.04), C.basaltTop, p, { y: p.top - 0.03 }));
  for (const z of [-d / 6, d / 6]) P.push(placed(new THREE.BoxGeometry(w + 0.02, H * 0.9, 0.05), C.basaltDark, p, { y: p.top - 0.08 - H * 0.45, z }));
  return P;
}

/** The top of a basalt column round the chest's stack (a disc piece with `basalt`). */
export function basaltDiscParts(p) {
  const spin = seedOf(p) * 0.37;
  return [
    placed(hex(p.r, p.r * 0.86, 0.42), C.basalt, p, { y: p.top - 0.21, ry: spin }, { c2: C.basaltDark, split: 0.5 }),
    placed(hex(p.r * 0.96, p.r * 0.98, 0.06), C.basaltTop, p, { y: p.top, ry: spin }),
    placed(new THREE.ConeGeometry(p.r * 0.6, 0.9, 6), C.basaltDark, p, { y: p.top - 0.85, rx: Math.PI, ry: spin }),
  ];
}

/**
 * A cinder ledge: a cracked slab of dark, rust-brown rock jutting from the
 * face (+z is into the wall). `solid`: a slab of plain basalt that holds.
 */
export function cinderParts(p, solid = false) {
  const w = p.hx * 2, d = p.hz * 2 + 0.8, seed = seedOf(p);
  const [body, dark, top] = solid ? [C.basalt, C.basaltDark, C.basaltTop2] : [C.cinder, C.cinderDark, C.cinderTop];
  return [
    placed(jitter(new THREE.BoxGeometry(w, 0.44, d, 3, 1, 2), 0.09, seed), body, p, { y: p.top - 0.22, z: 0.4 }, { c2: dark, split: 0.55 }),
    placed(jitter(new THREE.BoxGeometry(w * 0.95, 0.06, d * 0.9, 3, 1, 2), 0.03, seed + 1), top, p, { y: p.top, z: 0.4 }),
    placed(new THREE.ConeGeometry(Math.min(w, d) * 0.25, 0.7, 5), dark, p, { x: w * 0.15, y: p.top - 0.75, z: 0.5, rx: Math.PI }),
    placed(new THREE.DodecahedronGeometry(0.22, 0), dark, p, { x: -w * 0.3, y: p.top - 0.5, z: -p.hz + 0.25 }),
  ];
}

/**
 * The glowing cracks in a piece that crumbles: thin seams of ember across
 * its top, drawn in their own unlit mesh (volcanic-life.js) so they glow at
 * night and flare while it shakes.
 */
export function emberParts(p) {
  const P = [], seed = seedOf(p);
  const along = p.r ? p.r * 1.6 : p.hx * 1.8, z0 = p.r ? 0 : 0.0;
  for (let i = 0; i < 3; i++) {
    const a = seed * 0.7 + i * 2.1, L = along * (0.5 + 0.2 * Math.sin(seed + i));
    P.push(placed(new THREE.BoxGeometry(L, 0.04, 0.07), i ? C.ember : C.emberHot, p,
      { x: Math.cos(a) * along * 0.12, y: p.top + 0.02, z: z0 + Math.sin(a) * along * 0.12, ry: a }));
  }
  return P;
}

/**
 * A steam vent: a low cone of ash-grey rock with a black mouth in a ring of
 * yellow sulphur, and crusts of sulphur round the rim.
 */
export function ventParts(p) {
  const P = [], m = 0.55, H = p.top - p.base + 0.5, seed = seedOf(p);
  P.push(placed(jitter(new THREE.CylinderGeometry(p.r * 0.86, p.r * 1.2, H, 9, 2), 0.05, seed), C.ash, p, { y: p.top - H / 2 }, { c2: C.ash2, split: 0.6 }));
  P.push(placed(new THREE.TorusGeometry(m + 0.1, 0.1, 5, 12), C.ash2, p, { y: p.top - 0.02, rx: Math.PI / 2 }));
  P.push(placed(new THREE.CylinderGeometry(m + 0.16, m + 0.1, 0.05, 12), C.sulphur, p, { y: p.top - 0.03 }));
  P.push(placed(new THREE.CylinderGeometry(m * 0.82, m * 0.6, 0.06, 12), C.mouth, p, { y: p.top - 0.0 }));
  for (let i = 0; i < 5; i++) {
    const a = seed + i * 1.37, r = p.r * (0.85 + 0.15 * Math.sin(i * 3));
    P.push(placed(new THREE.SphereGeometry(0.14 + (i % 2) * 0.06, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? C.sulphur : C.sulphurDark, p,
      { x: Math.cos(a) * r, y: p.top - 0.12 - (i % 3) * 0.05, z: Math.sin(a) * r, sy: 0.5 }));
  }
  return P;
}

/**
 * The basalt shelf a vent throws you to: a block of columns packed side by
 * side against the face, solid to the ground, their tops a floor of hexagons
 * (+z is into the wall). The ones at the back are a little taller, into the rock.
 */
export function shelfParts(p) {
  const w = p.hx * 2, d = p.hz * 2, P = [], R = 0.47, seed = seedOf(p);
  const y0 = (p.base ?? 0) - 0.6, dx = R * 1.5, dz = R * Math.sqrt(3);
  // (a core to close the gaps between the columns, well inside them)
  P.push(placed(new THREE.BoxGeometry(w - 0.9, p.top - y0 - 0.1, d - 0.5), C.basaltDark, p, { y: (p.top + y0) / 2 - 0.05, z: 0.35 }));
  for (let i = 0, x = -w / 2 + R; x <= w / 2 - R * 0.6; i++, x += dx) {
    for (let z = -d / 2 + (i % 2 ? dz : dz / 2); z <= d / 2 + 0.5; z += dz) {
      const k = Math.sin(seed + x * 2.7 + z * 4.1), back = z > d / 2 - 0.1;
      const top = back ? p.top + 0.25 + k * 0.2 : p.top - 0.02 + k * 0.012, h = top - y0;
      P.push(placed(hex(R * 0.97, R, h), C.basalt, p, { x, y: y0 + h / 2, z, ry: Math.PI / 6 }, { c2: C.basaltDark, split: 0.55 }));
      P.push(placed(hex(R * 0.9, R * 0.95, 0.06), k > 0 ? C.basaltTop : C.basaltTop2, p, { x, y: top + 0.01, z, ry: Math.PI / 6 }));
    }
  }
  return P;
}

/**
 * The causeway over the lava near home: a deck of basalt with low stone
 * walls along both sides (where the bridge's rails stand) on hexagonal piers.
 */
export function causewayParts(p) {
  const P = [], w = p.hx * 2, d = p.hz * 2;
  P.push(placed(new THREE.BoxGeometry(w, 0.42, d), C.basalt, p, { y: p.top - 0.21 }, { c2: C.basaltDark, split: 0.5 }));
  P.push(...hexTiles(p, w - 0.2, d - 0.5, p.top - 0.02));
  for (const s of [-1, 1]) {
    const z = s * (p.hz - 0.1);
    P.push(placed(jitter(new THREE.BoxGeometry(w - 0.1, 0.62, 0.26, 6, 1, 1), 0.04, 5 + s), C.basalt, p, { y: p.top + 0.31, z }, { c2: C.basaltDark, split: 0.3 }));
    P.push(placed(new THREE.BoxGeometry(w - 0.14, 0.05, 0.3), C.basaltTop, p, { y: p.top + 0.64, z }));
  }
  const n = Math.max(2, Math.round(w / 2.4));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.6 + ((w - 1.2) * i) / (n - 1), H = p.top - (p.base ?? -2.4);
    P.push(placed(hex(0.5, 0.56, H), C.basaltDark, p, { x, y: p.top - 0.4 - H / 2 + 0.2, ry: i }));
  }
  return P;
}

/**
 * The chest's stack: a cluster of basalt columns of different heights round
 * a tall one, with short columns out to each disc beneath it and a cap of
 * pale column tops.
 */
export function lookoutBasaltParts(tree, discs) {
  const P = [];
  const at = (g, color, t, extra = {}) => { const q = part(g, color, { ...t, ...extra }); q.translate(tree.x, 0, tree.z); return q; };
  const y0 = tree.base - 0.5, H = tree.top - y0;
  P.push(at(hex(1.12, 1.15, H), C.basalt, { y: y0 + H / 2 }, { c2: C.basaltDark, split: 0.2 }));
  P.push(at(hex(1.08, 1.12, 0.1), C.basaltTop, { y: tree.top }));
  // shorter columns hugging it (inside its solid radius, so nothing to stand on that isn't there)
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.4, h = H * (0.25 + 0.13 * ((i * 3) % 5));
    P.push(at(hex(0.48, 0.5, h), i % 2 ? C.basalt : C.basaltDark, { x: Math.cos(a) * 0.62, y: y0 + h / 2, z: Math.sin(a) * 0.62, ry: a }, { c2: C.basaltDark, split: 0.4 }));
    P.push(at(hex(0.46, 0.48, 0.06), C.basaltTop2, { x: Math.cos(a) * 0.62, y: y0 + h + 0.02, z: Math.sin(a) * 0.62, ry: a }));
  }
  for (const d of discs) {
    const dx = d.cx - tree.x, dz = d.cz - tree.z, L = Math.hypot(dx, dz);
    const g = hex(0.3, 0.38, L).rotateZ(Math.PI / 2);
    g.rotateY(-Math.atan2(dz, dx));
    P.push(at(g, C.basaltDark, { x: dx / 2, y: d.top - 0.55, z: dz / 2 }));
  }
  P.push(at(new THREE.SphereGeometry(0.35, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), C.moss, { x: 0.4, y: tree.top + 0.04, z: -0.3, sy: 0.4 }));
  return P;
}
