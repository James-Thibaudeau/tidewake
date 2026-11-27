// The look of Mount Cinderhorn's walkable level: the ground's colours (black
// sand, the old flow's ropes, the mountain's banded face, the crater scorched
// towards the lava), what you stand on (most of it volcanic-art.js's basalt,
// plus the ridge, the knoll, the stacks on the broken rim and the Horn),
// grandfather's camp with its kettle, the old forge, his chalk arrows, and on
// the knoll his bedroll, the ring of stones and the tally slab. Everything is
// built straight into cinderhorn space as vertex-coloured parts, to be merged
// into a few meshes by cinderhorn.js. The layout is cinderhorn-layout.js.
import * as THREE from 'three';
import { part, jitter } from '../props.js';
import { mulberry32, noise2, clamp, lerp, TAU } from '../util.js';
import { CINDER, rimAt } from './cinderhorn-layout.js';
import { basaltParts, basaltDiscParts, basaltStepParts, cinderParts, ventParts, shelfParts } from './volcanic-art.js';

export const C = {
  sand: '#5b5556', sand2: '#514b4c', wet: '#433d3e', seabed: '#4a4243',
  ground: '#4d4648', ground2: '#5a5254', scree: '#7b726e', patch: '#6e7546',
  rock: '#5b5355', rust: '#6c4a41', ember: '#8a4a2e', hot: '#e0692a', ash: '#8f8680',
  flow: '#2f2a2c', flow2: '#3b3436',
  basalt: '#5a5254', basaltDark: '#3d3537', basaltTop: '#7b7072', basaltTop2: '#6c6163', cinder: '#5f4a43', cinderDark: '#3d2c28', cinderTop: '#7a6158',
  sulphur: '#e6cf52', chalk: '#f2efe6',
  plank: '#b98a52', plank2: '#8f6a3e', canvas: '#e2d3ad', canvas2: '#c9b78c', blanket: '#8a4a3a', paper: '#efe3c4', leather: '#7a4a24', ink: '#2b2430',
  iron: '#3b3f45', iron2: '#565c64', brass: '#c9973a', stone: '#6f6668', stone2: '#5e5557', quench: '#2f4a52',
};
const RUST = new THREE.Color(C.rust), EMBER = new THREE.Color(C.ember), HOT = new THREE.Color(C.hot), ASH = new THREE.Color(C.ash), SULPHUR = new THREE.Color(C.sulphur);

const box = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(x, y, z, sx, sy, sz);
const hex = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, 6);

/** The ground colour at a point, for the terrain mesh. `slope`: how steep (rise over run); `tag`: the grid's surface there. */
export function groundColour(c, x, z, h, slope, tag) {
  const r = Math.hypot(x, z), n = noise2(x * 0.11, z * 0.11, 5), R = rimAt(Math.atan2(z, x));
  if (h < -0.4) return c.set(C.seabed);
  if (tag === 'flow') {
    // the old flow: black, in ropes that bow downhill across it, a little ash caught in the folds
    const rope = Math.sin((-z - x * x * 0.07) * 2.3 + n * 2);
    return c.set(rope > 0.25 ? C.flow2 : C.flow).lerp(ASH, n > 0.6 ? 0.22 : 0);
  }
  if (r < R.ri) {
    // inside the crater: banded rock, scorched hotter towards the lava
    const up = h - CINDER.lake;
    return c.set(C.rock).lerp(RUST, 0.5 + 0.5 * Math.sin(h * 1.9 + n * 2)).lerp(EMBER, clamp(1 - up / 13, 0, 1) * 0.8).lerp(HOT, clamp(1 - up / 1.5, 0, 1) * 0.6);
  }
  if (r < CINDER.foot + 0.5) {
    // the mountain's face: strata, with ash lying where it is less steep and sulphur under the rim
    const band = Math.sin(h * 1.5 + n * 2);
    c.set(band < -0.4 ? C.basaltDark : C.rock).lerp(RUST, band > 0.3 ? 0.65 : 0.1);
    if (slope < 1.25 && n < -0.1) c.lerp(ASH, 0.45);
    if (h > CINDER.rim - 3 && noise2(x * 0.3, z * 0.3, 19) > 0.6) c.lerp(SULPHUR, 0.3);
    if (slope < 0.3 && r < R.ro) c.set(n > 0 ? C.ground2 : C.scree);   // the shoulder's floor: trodden ash
    return c;
  }
  if (tag === 'sand') return c.set(n > 0.1 ? C.sand2 : C.sand);
  if (h < 0.35) return c.set(C.wet);
  return c.set(n < -0.15 ? C.scree : n > 0.68 ? C.patch : n > 0.1 ? C.ground2 : C.ground);
}

// ------------------------------------------------------------------ pieces
/** A local part turned by the piece's rot and moved to its centre (as in volcanic-art.js). */
function placed(geo, color, p, t = {}, extra = {}) {
  const g = part(geo, color, { ...t, ...extra });
  g.rotateY(p.rot || 0);
  g.translate(p.cx, 0, p.cz);
  return g;
}
const seedOf = (p) => Math.floor(Math.abs(p.cx * 13.1 + p.cz * 7.3)) % 997;
/** A jittered block whose top stays flat at y = 0 (local), `h` deep. */
function flatTopped(geo, amt, seed, h) {
  const g = jitter(geo, amt, seed), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h / 2 - 0.01) p.setY(i, h / 2);
  return g;
}

/** A stretch of the ridge: a spine of old rock out of the lava, the ends of a few columns showing in its top. */
function spineParts(p) {
  const seed = seedOf(p), H = p.thick, P = [];
  P.push(placed(flatTopped(box(p.hx * 2, H, p.hz * 2, 3, 2, 2), 0.1, seed, H), C.basalt, p, { y: p.top - H / 2 }, { c2: C.ember, split: 0.5, soft: 0.3 }));
  for (let x = -p.hx + 0.5; x < p.hx - 0.3; x += 0.74) P.push(placed(hex(0.36, 0.36, 0.06), Math.sin(seed + x * 3) > 0 ? C.basaltTop : C.basaltTop2, p, { x, y: p.top, z: 0.12 * Math.sin(x * 4 + seed), ry: Math.PI / 6 }));
  return P;
}
/** The knoll: a hump of black rock in the middle of the lake, flat enough on top to camp on. */
function knollParts(p) {
  const H = p.thick, P = [];
  P.push(placed(flatTopped(new THREE.CylinderGeometry(p.r * 1.0, p.r * 1.28, H, 18, 3), 0.16, 77, H), C.ground2, p, { y: p.top - H / 2 }, { c2: C.ember, split: 0.55, soft: 0.3 }));
  P.push(placed(new THREE.CylinderGeometry(p.r * 0.93, p.r * 0.98, 0.05, 18), C.basaltTop2, p, { y: p.top }));
  const rng = mulberry32(771);
  for (let k = 0; k < 16; k++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * (p.r - 0.7);
    P.push(placed(hex(0.42, 0.42, 0.035), k % 3 ? C.basaltTop : C.scree, p, { x: Math.cos(a) * r, y: p.top + 0.03, z: Math.sin(a) * r, ry: rng() }));
  }
  return P;
}
/** A stack of basalt columns standing on the broken rim: packed columns from below the rim to its top, shorter ones leaning on it. */
function stackParts(p) {
  const P = [], seed = seedOf(p), R = 0.45, w = p.hx * 2, d = p.hz * 2, y0 = p.base - 0.4, dx = R * 1.5, dz = R * Math.sqrt(3);
  P.push(placed(box(w - 0.5, p.top - y0 - 0.1, d - 0.5), C.basaltDark, p, { y: (p.top + y0) / 2 - 0.05 }));
  for (let i = 0, x = -w / 2 + R * 0.85; x <= w / 2 - R * 0.6; i++, x += dx) {
    for (let z = -d / 2 + (i % 2 ? dz * 0.9 : dz / 2); z <= d / 2 - R * 0.5; z += dz) {
      const k = Math.sin(seed + x * 2.7 + z * 4.1), top = p.top - 0.02 + k * 0.012, h = top - y0;
      P.push(placed(hex(R * 0.97, R * 1.02, h), C.basalt, p, { x, y: y0 + h / 2, z, ry: Math.PI / 6 }, { c2: C.basaltDark, split: 0.5 }));
      P.push(placed(hex(R * 0.9, R * 0.95, 0.06), k > 0 ? C.basaltTop : C.basaltTop2, p, { x, y: top + 0.01, z, ry: Math.PI / 6 }));
    }
  }
  // shorter columns round its foot, and one or two part way up
  for (let k = 0; k < 6; k++) {
    const a = seed + k * 1.05, h = (p.top - y0) * (0.3 + 0.1 * ((k * 3) % 5)), r = 0.42;
    P.push(placed(hex(r * 0.95, r, h), k % 2 ? C.basalt : C.basaltDark, p, { x: Math.cos(a) * (p.hx + 0.25), y: y0 + h / 2, z: Math.sin(a) * (p.hz + 0.25), ry: a }, { c2: C.basaltDark, split: 0.4 }));
    P.push(placed(hex(r * 0.9, r * 0.93, 0.05), C.basaltTop2, p, { x: Math.cos(a) * (p.hx + 0.25), y: y0 + h + 0.02, z: Math.sin(a) * (p.hz + 0.25), ry: a }));
  }
  return P;
}
/** A cap of cracked rock on a thin spire: the kind of stack that crumbles. */
function capParts(p) {
  const seed = seedOf(p);
  return [
    placed(flatTopped(box(p.hx * 2, 0.5, p.hz * 2, 3, 1, 2), 0.08, seed, 0.5), C.cinder, p, { y: p.top - 0.25 }, { c2: C.cinderDark, split: 0.5 }),
    placed(jitter(box(p.hx * 1.9, 0.06, p.hz * 1.8, 3, 1, 2), 0.03, seed + 1), C.cinderTop, p, { y: p.top }),
    placed(new THREE.ConeGeometry(0.55, 0.7, 6), C.cinderDark, p, { y: p.top - 0.8, rx: Math.PI }),
  ];
}
/** The top of the Horn's column: a round of pale column ends to stand on. */
function tipParts(p) {
  const P = [placed(new THREE.CylinderGeometry(p.r, p.r * 0.94, p.thick, 9), C.basalt, p, { y: p.top - p.thick / 2 }, { c2: C.basaltDark, split: 0.4 })];
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9, r = k ? p.r * 0.62 : 0;
    P.push(placed(hex(0.62, 0.62, 0.05), k % 2 ? C.basaltTop : C.basaltTop2, p, { x: Math.cos(a) * r, y: p.top + 0.01, z: Math.sin(a) * r, ry: a }));
  }
  return P;
}

/** The parts of one of the layout's pieces. */
export function pieceArt(p) {
  switch (p.kind) {
    case 'step': return basaltStepParts(p);
    case 'vent': return ventParts(p);
    case 'shelf': return shelfParts(p);
    case 'basalt': return basaltParts(p);
    case 'slab': case 'lip': return cinderParts(p, true);
    case 'cinder': return cinderParts(p);
    case 'spine': return spineParts(p);
    case 'knoll': return knollParts(p);
    case 'crag': return stackParts(p);
    case 'cap': return capParts(p);
    case 'disc': return basaltDiscParts(p);
    case 'tip': return tipParts(p);
    default: return [];
  }
}

// ------------------------------------------------------------------ the Horn
/** A tapered, faceted tube along a curve through `pts` ([x, y, z]…), closed with a point. */
function tube(pts, radius, sides, seed) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const SEG = pts.length * 2, fr = curve.computeFrenetFrames(SEG, false), pos = [], idx = [], Q = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) {
    curve.getPointAt(i / SEG, Q);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * TAU + i * 0.3;
      D.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      const k = radius(i / SEG) * (1 + 0.14 * Math.sin(seed + i * 2.1 + j * 1.7));
      pos.push(Q.x + D.x * k, Q.y + D.y * k, Q.z + D.z * k);
    }
  }
  curve.getPointAt(1, Q);
  pos.push(Q.x, Q.y, Q.z);
  for (let i = 0; i < SEG; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + ((j + 1) % sides);
    idx.push(a, b, a + sides, b, b + sides, a + sides);
  }
  for (let j = 0; j < sides; j++) idx.push(SEG * sides + j, SEG * sides + ((j + 1) % sides), (SEG + 1) * sides);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** The Horn: a great bundle of basalt columns standing on the broken rim, and the hook that curls up and over from its top. */
export function hornParts(L) {
  const H = CINDER.horn, at = L.hornAt, y0 = CINDER.broken - 2, top = H.top - 0.8, P = [];
  const p = { cx: at.x, cz: at.z, rot: 0 };
  P.push(placed(jitter(new THREE.CylinderGeometry(H.r * 0.99, H.r * 1.14, top - y0, 9, 5), 0.12, 31), C.basalt, p, { y: (top + y0) / 2 }, { c2: C.rust, split: 0.3, soft: 0.25 }));
  // ribs of columns up its sides, each stopping at its own height
  for (let k = 0; k < 9; k++) {
    const a = k * 0.7 + 0.3, h = (top - y0) * (0.55 + 0.4 * ((k * 5) % 7) / 7), r = 0.68;
    P.push(placed(hex(r * 0.95, r, h), k % 2 ? C.basalt : C.basaltDark, p, { x: Math.cos(a) * 2.5, y: y0 + h / 2, z: Math.sin(a) * 2.5, ry: a }, { c2: C.basaltDark, split: 0.35 }));
    P.push(placed(hex(r * 0.88, r * 0.92, 0.06), C.basaltTop2, p, { x: Math.cos(a) * 2.5, y: y0 + h + 0.02, z: Math.sin(a) * 2.5, ry: a }));
  }
  // the hook: from the outer side of the top, up and over towards the crater
  const K = L.hook, ox = Math.cos(K.a), oz = Math.sin(K.a), q = (out, up) => [K.x + ox * out, K.y + up, K.z + oz * out];
  P.push(part(tube([q(0.1, -0.6), q(0.35, 1.6), q(0.1, 3.4), q(-1.1, 4.9), q(-2.6, 5.5), q(-3.9, 5.0)], (t) => lerp(0.95, 0.12, Math.pow(t, 0.8)), 6, 3), C.basalt, { c2: C.basaltDark, split: 0.35 }));
  P.push(part(new THREE.SphereGeometry(0.3, 6, 3, 0, TAU, 0, Math.PI / 2), C.sulphur, { x: K.x - ox * 0.5, y: K.y + 0.02, z: K.z - oz * 0.5, sy: 0.4 }));
  return P;
}
/** The thin spires the crumbling caps sit on. */
export function spireParts(L) {
  return L.spires.map((S, k) => part(jitter(new THREE.CylinderGeometry(S.r * 0.75, S.r * 1.5, S.y1 - S.y0 + 0.2, 6, 3), 0.07, 40 + k), C.basaltDark, { x: S.x, y: (S.y0 + S.y1) / 2, z: S.z, ry: k }));
}

// ------------------------------------------------------------------ the camps
/** His camp on the beach: sailcloth pegged to a boulder for shade, his crate, the note, and the kettle boiling on a vent of its own. */
export function campParts(L) {
  const K = L.camp, y = K.y, cs = Math.cos(K.rot), sn = Math.sin(K.rot), P = [];
  const at = (lx, lz, ly = 0) => ({ x: K.x + lx * cs + lz * sn, y: y + ly, z: K.z - lx * sn + lz * cs });
  // the boulder (solid in the layout), and the cloth from its top down to two pegs
  P.push(part(jitter(new THREE.DodecahedronGeometry(1.35, 1), 0.2, 12), C.ground2, { x: K.x - 1.5, y: y + 0.7, z: K.z + 1.3, sy: 0.95, c2: C.basaltDark, split: 0.35 }));
  const bx = K.x - 1.5, bz = K.z + 1.3, px = at(0.9, 0.2).x, pz = at(0.9, 0.2).z;
  const len = Math.hypot(px - bx, pz - bz) + 0.4, mid = { x: (bx + px) / 2 + 0.2 * cs, y: y + 1.05, z: (bz + pz) / 2 - 0.2 * sn }, yaw = Math.atan2(-(pz - bz), px - bx);
  P.push(part(box(len, 0.03, 1.9), C.canvas, { ...mid, ry: yaw, rz: -0.62 }));
  P.push(part(box(len * 0.98, 0.035, 0.22), C.canvas2, { ...mid, y: mid.y + 0.005, ry: yaw, rz: -0.62 }));
  for (const s of [-0.85, 0.85]) P.push(part(box(0.05, 0.5, 0.05), C.plank2, { x: px + s * Math.sin(yaw) + 0.35 * Math.cos(yaw), y: y + 0.18, z: pz + s * Math.cos(yaw) - 0.35 * Math.sin(yaw), rz: 0.3 }));
  // his crate, with the note pinned above it on the cloth
  P.push(part(box(1.0, 0.76, 0.7), C.plank, { ...at(0, 0, 0.38), ry: K.rot }));
  P.push(part(box(1.02, 0.07, 0.1), C.plank2, { ...at(0, -0.34, 0.6), ry: K.rot }));
  P.push(part(box(0.34, 0.012, 0.26), C.paper, { ...at(0.1, 0.02, 0.775), ry: K.rot + 0.25 }));
  P.push(part(box(0.2, 0.26, 0.2), C.iron2, { ...at(-0.3, 0.1, 0.89), ry: K.rot }));   // his tin mug
  // the kettle on its own little vent
  const V = L.kettle;
  P.push(part(jitter(new THREE.CylinderGeometry(0.3, 0.55, 0.4, 8, 1), 0.04, 5), C.ash, { x: V.x, y: V.y + 0.16, z: V.z, c2: C.scree, split: 0.5 }));
  P.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 8), C.sulphur, { x: V.x, y: V.y + 0.365, z: V.z }));
  P.push(part(new THREE.SphereGeometry(0.2, 10, 7), C.iron, { x: V.x, y: V.y + 0.55, z: V.z, sy: 0.85 }));
  P.push(part(new THREE.CylinderGeometry(0.09, 0.11, 0.04, 8), C.iron2, { x: V.x, y: V.y + 0.73, z: V.z }));
  P.push(part(new THREE.ConeGeometry(0.045, 0.24, 6), C.iron, { x: V.x + 0.22, y: V.y + 0.62, z: V.z, rz: -1.0 }));
  P.push(part(new THREE.TorusGeometry(0.15, 0.015, 4, 10, Math.PI), C.iron2, { x: V.x, y: V.y + 0.7, z: V.z }));
  return P;
}
/** The old forge (the vault): a stone hearth over a vent, an anvil on a block, a quenching trough, crates under a lean-to. */
export function forgeParts(L) {
  const F = L.forge, y = F.y, P = [];
  // the hearth: a round of stacked stones, open at the top (its glow is forgeGlowParts)
  for (let k = 0; k < 3; k++) P.push(part(jitter(new THREE.CylinderGeometry(0.92 - k * 0.06, 0.98 - k * 0.06, 0.42, 9, 1), 0.05, 60 + k), k % 2 ? C.stone2 : C.stone, { x: F.x + 0.9, y: y + 0.2 + k * 0.4, z: F.z + 0.8, ry: k * 0.4 }));
  P.push(part(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 10), C.ink, { x: F.x + 0.9, y: y + 1.2, z: F.z + 0.8 }));
  // the anvil on its block
  const cs = Math.cos(F.rot), sn = Math.sin(F.rot), ax = F.x - 1.0, az = F.z + 0.9;
  P.push(part(box(0.7, 0.5, 0.4), C.plank2, { x: ax, y: y + 0.25, z: az, ry: F.rot }));
  P.push(part(box(0.62, 0.2, 0.26), C.iron, { x: ax, y: y + 0.72, z: az, ry: F.rot }));
  P.push(part(box(0.3, 0.14, 0.18), C.iron2, { x: ax, y: y + 0.56, z: az, ry: F.rot }));
  P.push(part(new THREE.ConeGeometry(0.11, 0.4, 6), C.iron, { x: ax + 0.48 * cs, y: y + 0.74, z: az - 0.48 * sn, rz: -Math.PI / 2, ry: F.rot }));
  // the trough, a hammer left on its edge
  P.push(part(box(1.3, 0.42, 0.6), C.stone2, { x: F.x - 0.3, y: y + 0.21, z: F.z + 2.2, ry: F.rot + 0.3 }));
  P.push(part(box(1.1, 0.04, 0.42), C.quench, { x: F.x - 0.3, y: y + 0.41, z: F.z + 2.2, ry: F.rot + 0.3 }));
  P.push(part(box(0.5, 0.05, 0.05), C.plank, { x: F.x - 0.9, y: y + 0.46, z: F.z + 2.0, ry: 0.8 }));
  P.push(part(box(0.12, 0.12, 0.2), C.iron, { x: F.x - 1.08, y: y + 0.47, z: F.z + 1.85, ry: 0.8 }));
  // the lean-to: two posts, a roof of planks sloping back, the traders' crates under it
  const lx = F.x + 2.6, lz = F.z - 0.6;
  for (const s of [-1, 1]) P.push(part(box(0.12, 2.1, 0.12), C.plank2, { x: lx - 0.9, y: y + 1.05, z: lz + s * 1.2 }));
  P.push(part(box(2.3, 0.07, 2.9), C.plank, { x: lx, y: y + 1.75, z: lz, rz: -0.32 }));
  for (const zz of [-1.0, 0, 1.0]) P.push(part(box(2.34, 0.03, 0.05), C.plank2, { x: lx, y: y + 1.8, z: lz + zz, rz: -0.32 }));
  P.push(part(box(0.8, 0.6, 0.7), C.plank, { x: lx + 0.2, y: y + 0.3, z: lz - 0.5, ry: 0.2 }));
  P.push(part(box(0.6, 0.5, 0.6), C.plank2, { x: lx + 0.1, y: y + 0.25, z: lz + 0.6, ry: -0.3 }));
  P.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8), C.canvas, { x: lx + 0.25, y: y + 0.8, z: lz - 0.5, rz: Math.PI / 2, ry: 0.2 }));   // a bolt of sailcloth
  return P;
}
/** The forge's fire, still glowing (drawn unlit). */
export function forgeGlowParts(L) {
  const F = L.forge;
  return [0, 1, 2, 3].map((k) => part(new THREE.DodecahedronGeometry(0.2, 0), k % 2 ? '#ff8a2e' : '#ffc04a', { x: F.x + 0.9 + Math.cos(k * 1.7) * 0.28, y: F.y + 1.24, z: F.z + 0.8 + Math.sin(k * 1.7) * 0.28, sy: 0.5 }));
}

/** His trail markers: white chalk arrows on the black rock, pointing the way (L.arrows). */
export function trailParts(L) {
  const P = [];
  for (const A of L.arrows) {
    const g = [part(box(0.11, 0.02, 0.8), C.chalk, { z: -0.05 }), part(box(0.1, 0.02, 0.42), C.chalk, { x: 0.13, z: 0.24, ry: -0.7 }), part(box(0.1, 0.02, 0.42), C.chalk, { x: -0.13, z: 0.24, ry: 0.7 })];
    for (const q of g) { q.rotateY(A.yaw); q.translate(A.x, A.y + 0.025, A.z); P.push(q); }
  }
  return P;
}

// ------------------------------------------------------------------ the knoll
/** On the knoll: his bedroll, a ring of stones with no fire in it, and the slab with the tally marks. */
export function knollCampParts(L) {
  const B = L.bedroll, R = L.ring, T = L.tally, P = [];
  const cs = Math.cos(B.rot), sn = Math.sin(B.rot);
  P.push(part(box(0.85, 0.08, 1.9), C.canvas2, { x: B.x, y: B.y + 0.04, z: B.z, ry: B.rot }));
  P.push(part(box(0.87, 0.07, 0.95), C.blanket, { x: B.x - 0.45 * sn, y: B.y + 0.1, z: B.z - 0.45 * cs, ry: B.rot }));
  P.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 8), C.canvas, { x: B.x + 0.85 * sn, y: B.y + 0.15, z: B.z + 0.85 * cs, rz: Math.PI / 2, ry: B.rot }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    P.push(part(new THREE.DodecahedronGeometry(0.16, 0), k % 2 ? C.stone : C.stone2, { x: R.x + Math.cos(a) * 0.55, y: R.y + 0.08, z: R.z + Math.sin(a) * 0.55, sy: 0.7, ry: a }));
  }
  P.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 10), C.scree, { x: R.x, y: R.y + 0.02, z: R.z }));
  // the slab, and the marks scratched into the face that looks in at the camp
  const ts = Math.cos(T.rot), tn = Math.sin(T.rot);
  const on = (lx, ly, lz) => ({ x: T.x + lx * ts + lz * tn, y: T.y + ly, z: T.z - lx * tn + lz * ts });
  P.push(part(jitter(box(2.0, 1.85, 0.44, 2, 2, 1), 0.05, 9), C.basalt, { ...on(0, 0.9, 0), ry: T.rot, c2: C.basaltDark, split: 0.3 }));
  // (seen from in front of that face its x runs right to left, so the rows are laid out mirrored to read left to right)
  const mark = (lx, ly, w, h, rz = 0) => P.push(part(box(w, h, 0.012), C.chalk, { ...on(-lx, ly, -0.235), ry: T.rot, rz: -rz }));
  const rows = [1.5, 1.22, 0.94, 0.66];
  rows.forEach((ry, row) => {
    const groups = row === 3 ? 3 : 5;
    for (let gk = 0; gk < groups; gk++) {
      const x0 = -0.82 + gk * 0.35;
      for (let k = 0; k < 4; k++) mark(x0 + k * 0.055, ry + 0.01 * Math.sin(gk * 3 + k), 0.022, 0.19);
      mark(x0 + 0.08, ry, 0.26, 0.022, 0.55);
    }
  });
  // …and after the last full five, three more; one of them has a ring round it
  for (let k = 0; k < 3; k++) mark(0.3 + k * 0.17, 0.66, 0.022, 0.19);
  P.push(part(new THREE.TorusGeometry(0.075, 0.011, 4, 16), C.chalk, { ...on(-0.47, 0.66, -0.235), ry: T.rot, sy: 1.5 }));
  return P;
}
/** Journal VI, open on the bedroll (shown while it waits to be found). */
export function journalParts(L) {
  const J = L.spots.journal, y = J.y + 0.14, rot = L.bedroll.rot + 0.5;
  return [
    part(box(0.42, 0.04, 0.3), C.leather, { x: J.x, y: y + 0.02, z: J.z, ry: rot }),
    part(box(0.38, 0.03, 0.27), C.paper, { x: J.x, y: y + 0.05, z: J.z, ry: rot, rz: 0.02 }),
    part(box(0.01, 0.031, 0.27), C.ink, { x: J.x, y: y + 0.055, z: J.z, ry: rot }),
  ];
}
