// The look of the Sunken Temple's walkable level: the stone you stand on (the
// causeway's paving, broken columns, the fallen column, capitals and beams,
// the stairs, the fallen blocks, the gable), the hall's walls with their rows
// of carved fish, the statues with seaweed beards, the treasury's gold, the
// tide shrine, grandfather's camp and his red sailcloth trail markers.
// Everything is built straight into temple space as vertex-coloured parts, to
// be merged into a few meshes by temple.js. The layout is temple-layout.js.
import * as THREE from 'three';
import { part, jitter } from '../props.js';
import { mulberry32, noise2, smoothstep, lerp, TAU } from '../util.js';
import { TEMPLE, groundH } from './temple-layout.js';

export const C = {
  stone: '#dccca4', stone2: '#cdb98e', stone3: '#bca77c', shade: '#a99368', dark: '#8a7552', wet: '#7f8a5e', wet2: '#62704c',
  moss: '#7d9a45', moss2: '#94b252', weed: '#4f7a34', weed2: '#3c6128', vine: '#5d8f3a',
  sand: '#eedfb4', sand2: '#e3d1a0', grass: '#7cb24b', grass2: '#6ba03f', seabed: '#c9b98f',
  gold: '#f2c443', gold2: '#d39a27', gold3: '#ffe27a', red: '#c8402f', red2: '#9e2f22',
  plank: '#b98a52', plank2: '#8f6a3e', canvas: '#e2d3ad', canvas2: '#c9b78c', rope: '#d9c08a', paper: '#efe3c4', ink: '#2b2430',
  shell: '#f6e4d4', shell2: '#e9b9a4', leather: '#7a4a24', iron: '#3b3f45',
};

const box = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(x, y, z, sx, sy, sz);
const ICO = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

/** Recolour a part's vertices: fn(color, x, y, z, ny) in temple space. */
function tint(g, fn) {
  const p = g.attributes.position, c = g.attributes.color, n = g.attributes.normal, col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    col.setRGB(c.getX(i), c.getY(i), c.getZ(i));
    fn(col, p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 0);
    c.setXYZ(i, col.r, col.g, col.b);
  }
  return g;
}
const WET = new THREE.Color(C.wet), WET2 = new THREE.Color(C.wet2), MOSS = new THREE.Color(C.moss), DARK = new THREE.Color(C.dark);
/**
 * Old stone by the sea: green-stained and darker up to the old waterlines,
 * moss on the tops in patches, and a little variation along it.
 */
export function weather(g, seed = 0, { moss = 0.3 } = {}) {
  return tint(g, (c, x, y, z, ny) => {
    const n = noise2(x * 0.45, z * 0.45 + y * 0.3, seed + 3);
    c.multiplyScalar(1 + n * 0.05);
    if (y < 0.15) c.lerp(WET2, 0.75);
    else if (y < 0.9 + n * 0.25) c.lerp(WET, 0.6);
    else if (y < 2.2 + n * 0.4) c.lerp(WET, 0.18);
    if (ny > 0.6 && noise2(x * 0.7, z * 0.7, seed + 9) > 1 - moss * 2) c.lerp(MOSS, 0.7);
  });
}
/** A stone part: placed, then weathered where it stands. */
function stone(geo, color, t, seed, o) { return weather(part(geo, color, t), seed, o); }

/** A fluted column shaft from y0 to y1 at (x, z). `broken`: a jagged top. */
export function shaft(x, z, r, y0, y1, seed = 0, broken = false) {
  const g = new THREE.CylinderGeometry(r * 0.94, r, y1 - y0, 16, Math.max(1, Math.round((y1 - y0) / 1.6)));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.06 * Math.cos(a * 16);
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    if (broken && p.getY(i) > (y1 - y0) / 2 - 0.01) p.setY(i, p.getY(i) - 0.35 - 0.3 * (0.5 + 0.5 * Math.sin(a * 3 + seed)));
  }
  g.computeVertexNormals();
  return stone(g, C.stone, { x, y: (y0 + y1) / 2, z }, seed, { moss: 0.15 });
}
/** A capital: a square slab on a flared cushion, its top at y. */
function capital(x, z, y, half, seed, tilt = 0) {
  return [
    stone(box(half * 2, 0.36, half * 2), C.stone2, { x, y: y - 0.18, z, rz: tilt }, seed),
    stone(new THREE.CylinderGeometry(half * 0.95, TEMPLE.cols.r * 1.02, 0.5, 16), C.stone, { x, y: y - 0.6, z, rz: tilt }, seed + 1),
    stone(new THREE.CylinderGeometry(TEMPLE.cols.r * 1.06, TEMPLE.cols.r * 1.06, 0.14, 16), C.shade, { x, y: y - 0.9, z }, seed + 2),
  ];
}
/** A rough-cut block: a jittered box with a flat top at y. */
function roughBlock(cx, cz, top, sx, sy, sz, rot, seed, color = C.stone2) {
  const g = jitter(box(sx, sy, sz, 2, 1, 2), 0.05, seed);
  const q = g.attributes.position;
  for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) q.setY(i, sy / 2);
  g.computeVertexNormals();
  return stone(g, color, { x: cx, y: top - sy / 2, z: cz, ry: rot }, seed);
}

// ------------------------------------------------------------------ pieces
/** The parts for one layout piece. */
export function pieceArt(p, i) {
  const P = [], seed = 3100 + i * 7;
  switch (p.kind) {
    case 'slab': case 'floor': case 'gate': {
      // paving: a few slabs side by side, worn at the edges; roof slabs are thicker and darker beneath
      const thick = p.roof ? 0.7 : 0.45, n = Math.max(1, Math.round(p.hx / 1.6));
      for (let k = 0; k < n; k++) {
        const w = (p.hx * 2) / n, lx = -p.hx + w * (k + 0.5);
        const g = jitter(box(w - 0.06, thick, p.hz * 2 - 0.04, 2, 1, 2), 0.035, seed + k);
        const q = g.attributes.position;
        for (let j = 0; j < q.count; j++) if (q.getY(j) > 0) q.setY(j, thick / 2 - (k % 2) * 0.03);
        g.computeVertexNormals();
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
        P.push(stone(g, k % 2 ? C.stone2 : C.stone3, { x: p.cx + lx * cs, y: p.top - thick / 2, z: p.cz - lx * sn, ry: p.rot }, seed + k));
      }
      if (p.roof) P.push(stone(box(p.hx * 1.6, 0.25, p.hz * 1.4), C.shade, { x: p.cx, y: p.top - 0.8, z: p.cz, ry: p.rot }, seed));
      break;
    }
    case 'stump':
      P.push(shaft(p.cx, p.cz, p.r - 0.06, -4, p.top, seed, true));
      // the broken top you stand on: flat enough to land on
      // (deep enough to sit down in the jagged top of the shaft, so it never floats)
      P.push(stone(new THREE.CylinderGeometry(p.r - 0.12, p.r - 0.08, 0.9, 14), C.stone2, { x: p.cx, y: p.top - 0.45, z: p.cz }, seed + 4, { moss: 0.5 }));
      break;
    case 'capital': {
      const tilt = p.top < TEMPLE.deck - 0.1 ? 0.05 : 0;
      P.push(...capital(p.cx, p.cz, p.top, p.hx, seed, tilt));
      P.push(shaft(p.cx, p.cz, TEMPLE.cols.r, -4, p.top - 0.95, seed + 5));
      break;
    }
    case 'beam': {
      // an architrave: a heavy stone beam with a frieze band; broken ends ragged
      // (it runs along z down a row, or along x for the one that fell across the rows)
      // (drawn a little short of the capitals it rests on, so their tops never overlap in one plane)
      const along = p.hz > p.hx, L2 = (along ? p.hz : p.hx) * 2 - 0.1, H = 1.05;
      const g = jitter(box(along ? 1.18 : L2, H, along ? L2 : 1.18, along ? 1 : 4, 2, along ? 4 : 1), 0.03, seed);
      const q = g.attributes.position;
      for (let j = 0; j < q.count; j++) if (q.getY(j) > 0) q.setY(j, H / 2);
      g.computeVertexNormals();
      P.push(stone(g, C.stone, { x: p.cx, y: p.top - H / 2, z: p.cz }, seed, { moss: 0.35 }));
      P.push(stone(box(along ? 1.36 : L2 - 0.1, 0.16, along ? L2 - 0.1 : 1.36), C.shade, { x: p.cx, y: p.top - 0.72, z: p.cz }, seed + 1));
      break;
    }
    case 'ramp': break;   // the fallen column is drawn whole (fallenColumn)
    case 'deck':
      // (the body stops just under the moulding: two tops at one height flicker)
      P.push(stone(box(p.hx * 2, 12.9, p.hz * 2), C.stone2, { x: p.cx, y: p.top - 6.55, z: p.cz }, seed, { moss: 0.12 }));
      P.push(stone(box(p.hx * 2 + 0.3, 0.3, p.hz * 2 + 0.3), C.stone, { x: p.cx, y: p.top - 0.15, z: p.cz }, seed + 1));
      P.push(stone(box(p.hx * 2 + 0.5, 0.4, p.hz * 2 + 0.5), C.shade, { x: p.cx, y: 2.4, z: p.cz }, seed + 2));
      break;
    case 'door':
      P.push(stone(box(p.hx * 2, 0.3, p.hz * 2), C.stone3, { x: p.cx, y: p.top - 0.17, z: p.cz }, seed));   // a touch under the moulding it meets
      break;
    case 'stair': {
      const h = p.top + 4.4;
      // its ends run into the side walls, so no two faces lie in one plane
      P.push(stone(box(p.hx * 2 + 0.3, h, p.hz * 2 + 0.02), (i % 2) ? C.stone : C.stone2, { x: p.cx, y: p.top - h / 2, z: p.cz }, seed, { moss: 0.08 }));
      break;
    }
    case 'block': {
      const sy = Math.min(p.thick, p.fallen ? 1.05 : 1.6);
      P.push(roughBlock(p.cx, p.cz, p.top, p.hx * 2, sy, p.hz * 2, p.rot, seed, p.fallen ? C.stone : C.stone2));
      if (p.thick > sy + 0.25) P.push(roughBlock(p.cx, p.cz, p.top - sy, p.hx * 2 - 0.1, p.thick - sy, p.hz * 2 - 0.1, p.rot + 0.05, seed + 1, C.stone3));
      break;
    }
    case 'step':
      P.push(stone(box(p.hx * 2, 0.32, p.hz * 2 + 0.02), C.stone, { x: p.cx, y: p.top - 0.16, z: p.cz }, seed, { moss: 0 }));
      P.push(stone(box(p.hx * 2 - 0.1, 2.6, p.hz * 2 - 0.04), C.stone3, { x: p.cx, y: p.top - 1.6, z: p.cz }, seed, { moss: 0 }));
      break;
    case 'dais':
      P.push(stone(box(p.hx * 2, 3, p.hz * 2), C.stone2, { x: p.cx, y: p.top - 1.5, z: p.cz }, seed, { moss: 0 }));
      P.push(stone(box(p.hx * 2 - 0.2, 0.08, p.hz * 2 - 0.2), C.stone, { x: p.cx, y: p.top + 0.01, z: p.cz }, seed + 1, { moss: 0 }));
      break;
    case 'sill': P.push(roughBlock(p.cx, p.cz, p.top, p.hx * 2, p.top + 1.5, p.hz * 2, 0, seed, C.stone2)); break;
    case 'entab':
      P.push(stone(box(p.hx * 2, 0.6, p.hz * 2), C.stone, { x: p.cx, y: p.top - 0.3, z: p.cz }, seed, { moss: 0.3 }));
      P.push(stone(box(p.hx * 2 + 0.1, 0.14, p.hz * 2 + 0.12), C.shade, { x: p.cx, y: p.top - 0.5, z: p.cz }, seed + 1));
      break;
    case 'cornice': break;   // the gable is drawn whole (gableParts)
    case 'apex': P.push(roughBlock(p.cx, p.cz, p.top, p.hx * 2, 1.4, p.hz * 2, 0, seed, C.stone)); break;
    case 'plinth':
      P.push(stone(box(1.2, 3.3, 1.2), C.stone2, { x: p.cx, y: p.top - 1.75, z: p.cz, ry: p.rot }, seed));   // under the cap, not level with it
      P.push(stone(box(1.36, 0.18, 1.36), C.stone, { x: p.cx, y: p.top - 0.09, z: p.cz, ry: p.rot }, seed + 1));
      if (p.statue) P.push(...statueParts(p.cx, p.top, p.cz, p.a, seed));
      break;
    default:
      P.push(stone(box(p.hx * 2 || 1, 0.5, p.hz * 2 || 1), C.stone2, { x: p.cx, y: p.top - 0.25, z: p.cz }, seed));
  }
  return P;
}

/** The fallen column leaning up from the stumps to the first capital: one long fluted drum. */
export function fallenColumn(L) {
  // its top runs through the middle of every step's top (the steps are what you walk on)
  const R = L.ramp, a = R[0], b = R[R.length - 1], r = 1.05, k = (b.top - a.top) / (b.cz - a.cz);
  // (a tilted drum's top stands r / cos(tilt) above its axis, and the flutes stand a little proud)
  const lift = r * Math.sqrt(1 + k * k) + 0.05;
  const z0 = a.cz - a.hz - 0.6, z1 = b.cz + b.hz, y0 = a.top + (z0 - a.cz) * k - lift, y1 = a.top + (z1 - a.cz) * k - lift;
  const len = Math.hypot(z1 - z0, y1 - y0), tilt = Math.atan2(y1 - y0, z1 - z0);
  const g = new THREE.CylinderGeometry(r, r, len, 16, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const ang = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.05 * Math.cos(ang * 16);
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const P = [stone(g, C.stone, { x: a.cx, y: (y0 + y1) / 2, z: (z0 + z1) / 2, rx: Math.PI / 2 - tilt }, 3601, { moss: 0.4 })];
  // its broken foot in the water, and the drums that came off it
  P.push(stone(jitter(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.7, 14), 0.06, 3605), C.stone2, { x: a.cx, y: y0 - 0.3, z: z0 - 0.4, rx: Math.PI / 2 - tilt - 0.2 }, 3606));
  for (const [dx, dz, ry] of [[2.2, 2, 0.4], [-2.6, 5, 1.2]]) P.push(stone(new THREE.CylinderGeometry(r, r, 1.4, 14), C.stone2, { x: a.cx + dx, y: -0.2, z: z0 + dz, rz: Math.PI / 2, ry }, 3610 + dz));
  return P;
}

/** The gable over the portico: the east half still stands, a triangle under its rising cornice; the west half lies in pieces. */
export function gableParts(L) {
  const P = [], ET = TEMPLE.entab, first = L.cornice[0], top = L.apex;
  const xa = first.cx + first.hx + 0.6, xb = top.cx - top.hx + 0.08;   // from the entablature's east end to just inside the broken edge
  const slope = 0.35, yAt = (x) => ET.y + slope * (12.6 - x);
  // the tympanum: a wall under the cornice
  const shape = new THREE.Shape();
  // (its top edge stays under the cornice steps all the way along)
  shape.moveTo(xa, ET.y - 0.05); shape.lineTo(xb, ET.y - 0.05); shape.lineTo(xb, yAt(xb) - 0.9); shape.lineTo(xb + 0.6, yAt(xb + 0.6) - 0.75);
  shape.lineTo(xa, ET.y - 0.05);
  const tg = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false });
  tg.translate(0, 0, ET.z - 0.45);
  P.push(stone(tg, C.stone2, {}, 3701, { moss: 0.2 }));
  // the raking cornice along its top, the steps you climb
  // (a little proud of the entablature's faces, so the two never share a plane)
  for (const S of L.cornice) P.push(stone(box(S.hx * 2 + 0.04, 0.5, S.hz * 2 + 0.16), C.stone, { x: S.cx, y: S.top - 0.25, z: S.cz }, 3710 + S.cx * 10, { moss: 0.35 }));
  // a carved fish in the tympanum, staring out to sea
  P.push(...fishParts(6.4, 16.25, ET.z - 0.5, 0, Math.PI, 2.2));
  // the west half, fallen on the portico and down the stair
  for (const [x, z, y, ry, s] of [[-9.6, 7.2, 8.45, 0.3, 1], [-11.8, 4.6, 8.4, -0.5, 0.8], [-5.5, -3.0, 6.9, 0.9, 0.9]]) {
    P.push(roughBlock(x, z, y + 0.45 * s, 2.4 * s, 0.9 * s, 1.3 * s, ry, 3730 + x * 3, C.stone));
  }
  return P;
}

// ------------------------------------------------------------------ carvings
/**
 * A carved fish in relief: body, tail, an eye and a brow that turns down at
 * the inner end, so it looks slightly disappointed. Its flat side is the
 * wall's face; `ry` turns it to face along the wall, `side` which way it swims.
 */
export function fishParts(x, y, z, ry, side, s) {
  const P = [], at = (lx, ly, lz) => {
    const cs = Math.cos(ry), sn = Math.sin(ry), dx = lx * Math.cos(side) + lz * Math.sin(side), dz = -lx * Math.sin(side) + lz * Math.cos(side);
    return { x: x + dx * cs + dz * sn, y: y + ly, z: z - dx * sn + dz * cs };
  };
  const rot = ry + side;
  P.push(part(ICO(1, 1), C.stone, { ...at(0, 0, 0), sx: 0.55 * s, sy: 0.3 * s, sz: 0.08 * s, ry: rot }));
  P.push(part(new THREE.ConeGeometry(0.28 * s, 0.36 * s, 4), C.stone2, { ...at(-0.62 * s, 0, 0), rz: Math.PI / 2, ry: rot, sz: 0.25 }));
  P.push(part(box(0.07 * s, 0.07 * s, 0.05 * s), C.ink, at(0.3 * s, 0.07 * s, 0.07 * s)));
  P.push(part(box(0.16 * s, 0.03 * s, 0.04 * s), C.dark, { ...at(0.3 * s, 0.15 * s, 0.075 * s), ry: rot, rz: 0.35 }));
  P.push(part(box(0.14 * s, 0.025 * s, 0.04 * s), C.dark, { ...at(0.43 * s, -0.08 * s, 0.075 * s), ry: rot, rz: -0.3 }));
  return P;
}

/** A worn statue in a robe, with a beard of seaweed, facing along angle a. */
export function statueParts(x, y, z, a, seed, s = 1) {
  const P = [], f = [Math.cos(a), Math.sin(a)];
  const at = (fwd, up) => ({ x: x + f[0] * fwd, y: y + up * s, z: z + f[1] * fwd });
  P.push(stone(new THREE.CylinderGeometry(0.3 * s, 0.44 * s, 1.5 * s, 10), C.stone, { ...at(0, 0.75) }, seed, { moss: 0.5 }));
  P.push(stone(new THREE.CylinderGeometry(0.36 * s, 0.3 * s, 0.35 * s, 10), C.stone2, { ...at(0, 1.55) }, seed + 1));
  P.push(stone(jitter(ICO(0.26 * s, 1), 0.02, seed), C.stone, { ...at(0.02, 1.92) }, seed + 2, { moss: 0.6 }));
  P.push(stone(box(0.1 * s, 0.14 * s, 0.1 * s), C.stone2, { ...at(0.25 * s, 1.92) }, seed + 3));
  // the beard: strands of weed hanging from the chin
  const rng = mulberry32(seed);
  for (let k = 0; k < 6; k++) {
    const side = (k - 2.5) * 0.06 * s, len = (0.4 + rng() * 0.35) * s;
    const p = at(0.24 * s, 1.75 - len / 2 / s);
    P.push(part(new THREE.ConeGeometry(0.05 * s, len, 4), k % 2 ? C.weed : C.weed2, { x: p.x - f[1] * side, y: p.y, z: p.z + f[0] * side, rx: Math.PI, rz: (rng() - 0.5) * 0.3 }));
  }
  return P;
}

/** The giant stone face half sunk beside the colonnade, looking up, weed for a beard. */
export function headParts(h) {
  const P = [], s = h.r, rot = h.rot;
  P.push(stone(jitter(ICO(1, 2), 0.03, 3801), C.stone2, { x: h.x, y: -0.9, z: h.z, sx: s, sy: s * 0.55, sz: s * 1.2, ry: rot }, 3801, { moss: 0.5 }));
  const at = (fwd, side, up) => ({ x: h.x + Math.cos(rot) * side + Math.sin(rot) * fwd, y: up, z: h.z - Math.sin(rot) * side + Math.cos(rot) * fwd });
  P.push(stone(box(0.6, 0.6, 1.2), C.stone, { ...at(0.1 * s, 0, 0.45), ry: rot }, 3802));                       // the nose
  for (const sd of [-1, 1]) {
    P.push(stone(box(0.9, 0.3, 0.35), C.stone, { ...at(0.55 * s, sd * 0.42 * s, 0.25), ry: rot + sd * 0.15 }, 3803));   // brows
    P.push(part(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10), C.wet2, { ...at(0.35 * s, sd * 0.42 * s, 0.14) }));  // eyes, full of water
  }
  P.push(stone(box(1.2, 0.2, 0.3), C.shade, { ...at(-0.45 * s, 0, 0.05), ry: rot }, 3804));                      // the mouth
  const rng = mulberry32(3805);
  for (let k = 0; k < 9; k++) {
    const p = at(-0.75 * s - rng() * 0.6, (k - 4) * 0.25 * s, 0.05);
    P.push(part(new THREE.ConeGeometry(0.12, 0.9 + rng() * 0.6, 4), k % 2 ? C.weed : C.weed2, { ...p, rx: -Math.PI / 2 + 0.3, ry: rot + (rng() - 0.5) * 0.6 }));
  }
  return P;
}

// ------------------------------------------------------------------ the hall
/** The hall's walls: front with the great door, the sides (the breach in the east one), the back; carved fish inside. */
export function hallParts(L) {
  const H = TEMPLE.hall, P = [], wo = H.half + H.wall, B = L.breach, rng = mulberry32(3900);
  const wallBox = (x0, x1, z0, z1, y0, y1, seed, color = C.stone2) => {
    const g = jitter(box(x1 - x0, y1 - y0, z1 - z0, Math.max(1, Math.round((x1 - x0) / 3)), Math.max(1, Math.round((y1 - y0) / 3)), Math.max(1, Math.round((z1 - z0) / 3))), 0.04, seed);
    P.push(stone(g, color, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, seed, { moss: 0.35 }));
  };
  const top = H.top;
  wallBox(-wo, -2, 10, H.z0, -4, top + 1, 3901);
  wallBox(2, wo, 10, H.z0, -4, top + 1, 3902);
  wallBox(-2, 2, 10, H.z0, 12, top + 1, 3903, C.stone);
  // the door's jambs and lintel stand proud of the wall
  for (const sx of [-1, 1]) wallBox(sx * 2.45 - 0.45, sx * 2.45 + 0.45, 9.7, 10.1, 8, 12.2, 3904 + sx, C.stone);
  wallBox(-2.9, 2.9, 9.7, 10.1, 12.2, 12.9, 3906, C.stone);
  wallBox(-wo, -H.half, H.z0, H.z1, -4, top, 3907);   // the side walls stop at the back wall, so the corners don't share a face
  wallBox(H.half, wo, H.z0, B.z - B.half, -4, top, 3908);
  wallBox(H.half, wo, B.z + B.half, H.z1, -4, top, 3909);
  wallBox(H.half, wo, B.z - B.half, B.z + B.half, B.top, top, 3910);
  // the breach's broken edges, and what fell out of it onto the sand
  for (const [dz, y0, h] of [[-B.half + 0.25, B.sill, 1.6], [B.half - 0.3, B.sill + 1.2, 2.2], [-B.half + 0.35, B.top - 1.3, 1.3], [B.half - 0.2, B.top - 0.9, 0.9]]) {
    P.push(roughBlock(H.half + H.wall / 2, B.z + dz, y0 + h, H.wall + 0.3, h, 0.7, 0.1, 3912 + dz * 10, C.stone2));   // proud of both faces of the wall
  }
  for (const [x, dz, s, r] of B.rubble) {
    P.push(roughBlock(x, B.z + dz, groundH(x, B.z + dz) + 0.5 * s, 1.3 * s, 0.9 * s, 1.0 * s, r, 3916 + x, C.stone));
  }
  wallBox(-wo, wo, H.z1, H.z1 + H.wall, -4, top, 3911);
  // broken blocks along the wall tops
  for (let k = 0; k < 22; k++) {
    const t = rng(), side = k % 3;
    const x = side === 0 ? -H.half - H.wall / 2 : side === 1 ? H.half + H.wall / 2 : (rng() - 0.5) * 2 * H.half;
    const z = side === 2 ? H.z1 + H.wall / 2 : lerp(H.z0 + 1, H.z1, t);
    if (side === 1 && Math.abs(z - B.z) < B.half + 1) continue;
    P.push(roughBlock(x, z, top + 0.4 + rng() * 0.3, 1.2, 0.6, 1.1, rng(), 3920 + k, C.stone));
  }
  // rows of carved fish on the side walls and the back, every one of them slightly disappointed
  for (const y of [2.4, 4.3, 6.2, 8.1]) {
    const dir = (y * 10) % 2 ? 0 : Math.PI;
    for (let z = H.z0 + 1.6; z < H.z1 - 0.6; z += 2.3) {
      P.push(...fishParts(-H.half + 0.02, y, z, Math.PI / 2, dir, 1));
      if (Math.abs(z - B.z) > B.half + 0.9 || y > B.top) P.push(...fishParts(H.half - 0.02, y, z, -Math.PI / 2, dir, 1));
    }
    for (let x = -H.half + 1.6; x < H.half - 1; x += 2.3) if (Math.abs(x) > 2.4) P.push(...fishParts(x, y, H.z1 - 0.02, Math.PI, dir, 1));
  }
  // vines hanging down the inside of the walls
  for (let k = 0; k < 14; k++) {
    const sd = k % 2 ? 1 : -1, z = H.z0 + 1 + rng() * (H.z1 - H.z0 - 2), len = 2 + rng() * 4;
    P.push(part(box(0.1, len, 0.35), k % 3 ? C.vine : C.moss, { x: sd * (H.half - 0.1 - (k % 4) * 0.03), y: top - 0.05 - (k % 3) * 0.04 - len / 2, z }));   // no two in one plane
  }
  // the one piece of roof left, over the treasury, coffered underneath
  const R = L.roof, w = H.half + H.wall - R.gap;
  for (const s of [-1, 1]) {
    const g = jitter(box(w, 1, R.z1 - R.z0 + 0.6, 4, 1, 3), 0.06, 3990 + s);
    P.push(stone(g, C.stone2, { x: s * (R.gap + w) / 2, y: R.y + 0.5, z: (R.z0 + R.z1) / 2 }, 3990 + s, { moss: 0.6 }));
  }
  for (let x = R.x0 + 1.5; x < R.x1; x += 3) for (let z = R.z0 + 1.1; z < R.z1; z += 2.2) if (Math.abs(x) > R.gap + 1) P.push(part(box(2.4, 0.12, 1.7), C.shade, { x, y: R.y - 0.04, z }));
  return P;
}

/** The portico's four columns and the stair's side walls. */
export function porticoParts() {
  const P = [], ET = TEMPLE.entab;
  for (const [k, x] of TEMPLE.portico.entries()) {
    P.push(shaft(x, ET.z, 0.78, TEMPLE.deck, ET.under - 0.7, 4000 + k));
    P.push(stone(box(1.9, 0.34, 1.9), C.stone2, { x, y: ET.under - 0.17, z: ET.z }, 4010 + k));
    P.push(stone(new THREE.CylinderGeometry(0.95, 0.82, 0.4, 16), C.stone, { x, y: ET.under - 0.52, z: ET.z }, 4020 + k));
    P.push(stone(box(1.9, 0.3, 1.9), C.stone3, { x, y: TEMPLE.deck + 0.15, z: ET.z }, 4030 + k));
  }
  // the stair's side walls, sloping down into the water
  const S = TEMPLE.stair, len = Math.hypot(-S.z0, TEMPLE.deck + 0.6), tilt = Math.atan2(TEMPLE.deck + 0.6, -S.z0);
  for (const sx of [-1, 1]) P.push(stone(box(0.8, 1.2, len + 1), C.stone2, { x: sx * (S.half + 0.4), y: (TEMPLE.deck - 0.6) / 2 + 0.2, z: S.z0 / 2, rx: -tilt }, 4040 + sx, { moss: 0.3 }));
  return P;
}

// ------------------------------------------------------------------ the treasury
/** The gold heaped round the seated statue: mounds, coins, cups, plates and an open chest. */
export function goldParts(L) {
  const P = [], S = L.statue, y = TEMPLE.dais.y, rng = mulberry32(4100);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI - Math.PI, d = 1.6 + rng() * 1.6;
    P.push(part(ICO(1, 1), k % 2 ? C.gold : C.gold2, { x: S.x + Math.cos(a) * d * 1.3, y: y - 0.1, z: S.z + Math.sin(a) * d * 0.6 - 0.3, sx: 0.7 + rng() * 0.6, sy: 0.3 + rng() * 0.25, sz: 0.6 + rng() * 0.4 }));
  }
  for (let k = 0; k < 40; k++) {
    const x = S.x + (rng() - 0.5) * 8, z = S.z - 1 - rng() * 3;
    P.push(part(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 8), rng() < 0.5 ? C.gold : C.gold3, { x, y: y + 0.03, z, rx: (rng() - 0.5) * 0.6, rz: (rng() - 0.5) * 0.6 }));
  }
  for (const [x, z, s] of [[-2.6, 34.2, 1], [3.0, 34.6, 0.8], [1.2, 33.7, 0.7]]) {
    P.push(part(new THREE.CylinderGeometry(0.16 * s, 0.1 * s, 0.32 * s, 10), C.gold, { x, y: y + 0.16 * s, z }));
    P.push(part(new THREE.CylinderGeometry(0.05 * s, 0.14 * s, 0.12 * s, 8), C.gold2, { x, y: y + 0.05 * s, z }));
  }
  for (const [x, z, r] of [[-3.4, 35.3, 0.4], [3.6, 35.4, -0.3], [-0.9, 34.3, 0.2]]) P.push(part(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 14), C.gold2, { x, y: y + 0.36, z, rx: 1.2, rz: r }));
  // an old chest, burst open, spilling coins
  P.push(part(box(1.1, 0.6, 0.7), C.plank2, { x: 3.4, y: y + 0.3, z: 33.4, ry: -0.3 }));
  P.push(part(box(1.1, 0.08, 0.7), C.plank, { x: 3.5, y: y + 0.78, z: 33.85, ry: -0.3, rx: -1.1 }));
  P.push(part(ICO(1, 1), C.gold, { x: 3.4, y: y + 0.6, z: 33.4, sx: 0.5, sy: 0.18, sz: 0.3, ry: -0.3 }));
  return P;
}

/** The seated statue at the back of the treasury, big and worn, with a beard of weed. */
export function seatedStatueParts(L) {
  const S = L.statue, y = TEMPLE.dais.y, P = [];
  P.push(stone(box(2.6, 1.2, 1.6), C.stone2, { x: S.x, y: y + 0.6, z: S.z + 0.3 }, 4201, { moss: 0 }));        // the seat
  P.push(stone(box(1.8, 2.2, 1.1), C.stone, { x: S.x, y: y + 2.3, z: S.z + 0.5 }, 4202, { moss: 0.3 }));      // the body
  for (const sx of [-1, 1]) {
    P.push(stone(box(0.6, 0.55, 1.5), C.stone, { x: S.x + sx * 0.5, y: y + 1.45, z: S.z - 0.35 }, 4203 + sx));  // knees
    P.push(stone(box(0.55, 1.2, 0.55), C.stone2, { x: S.x + sx * 0.5, y: y + 0.6, z: S.z - 0.95 }, 4205 + sx));  // shins
    P.push(stone(box(0.4, 0.3, 0.6), C.stone, { x: S.x + sx * 0.5, y: y + 1.85, z: S.z - 0.7 }, 4207 + sx));    // hands
  }
  P.push(stone(jitter(ICO(0.6, 1), 0.04, 4210), C.stone, { x: S.x, y: y + 3.85, z: S.z + 0.35 }, 4210, { moss: 0.5 }));
  P.push(stone(box(0.22, 0.3, 0.25), C.stone2, { x: S.x, y: y + 3.85, z: S.z - 0.25 }, 4211));
  const rng = mulberry32(4212);
  for (let k = 0; k < 8; k++) {
    const len = 0.6 + rng() * 0.6;
    P.push(part(new THREE.ConeGeometry(0.09, len, 4), k % 2 ? C.weed : C.weed2, { x: S.x + (k - 3.5) * 0.11, y: y + 3.45 - len / 2, z: S.z - 0.2, rx: Math.PI }));
  }
  return P;
}

/** His crate desk, the inkpot on it, and the one camp stool. */
export function desk(L) {
  const K = L.crate, St = L.stool, y = TEMPLE.dais.y, cs = Math.cos(K.rot), sn = Math.sin(K.rot);
  const at = (lx, lz) => ({ x: K.x + lx * cs + lz * sn, z: K.z - lx * sn + lz * cs });
  return [
    part(box(0.84, 0.6, 0.64), C.plank, { x: K.x, y: y + 0.3, z: K.z, ry: K.rot }),
    part(box(0.86, 0.06, 0.08), C.plank2, { ...at(0, -0.31), y: y + 0.5, ry: K.rot }),
    part(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), C.ink, { ...at(0.28, 0.12), y: y + 0.65 }),
    part(box(0.02, 0.2, 0.02), C.canvas, { ...at(0.3, 0.12), y: y + 0.75, rz: 0.4 }),
    // the stool: canvas between crossed legs
    part(box(0.5, 0.05, 0.36), C.canvas2, { x: St.x, y: y + 0.48, z: St.z }),
    ...[-1, 1].map((s) => part(box(0.04, 0.6, 0.04), C.plank2, { x: St.x + s * 0.2, y: y + 0.24, z: St.z, rx: 0.5 })),
    ...[-1, 1].map((s) => part(box(0.04, 0.6, 0.04), C.plank2, { x: St.x + s * 0.2, y: y + 0.24, z: St.z, rx: -0.5 })),
  ];
}

/** Journal V, open on the crate (shown while it waits to be found). */
export function journalParts(L) {
  const K = L.crate, y = TEMPLE.dais.y + 0.6;
  return [
    part(box(0.42, 0.04, 0.3), C.leather, { x: K.x - 0.08, y: y + 0.02, z: K.z - 0.04, ry: K.rot - 0.2 }),
    part(box(0.38, 0.03, 0.27), C.paper, { x: K.x - 0.08, y: y + 0.05, z: K.z - 0.04, ry: K.rot - 0.2, rz: 0.02 }),
    part(box(0.01, 0.031, 0.27), C.dark, { x: K.x - 0.08, y: y + 0.055, z: K.z - 0.04, ry: K.rot - 0.2 }),
  ];
}

// ------------------------------------------------------------------ the beach
/** His camp: a hammock slung between two palms (temple.js plants them), his table with rubbings and the note. */
export function campParts(L) {
  const K = L.camp, y = K.y, cs = Math.cos(K.rot), sn = Math.sin(K.rot);
  const at = (lx, lz, ly = 0) => ({ x: K.x + lx * cs + lz * sn, y: y + ly, z: K.z - lx * sn + lz * cs });
  const P = [];
  P.push(part(box(1.0, 0.06, 0.7), C.plank, { ...at(0, 0, 0.74), ry: K.rot }));
  for (const [lx, lz] of [[-0.42, -0.28], [0.42, -0.28], [-0.42, 0.28], [0.42, 0.28]]) P.push(part(box(0.06, 0.74, 0.06), C.plank2, { ...at(lx, lz, 0.37), ry: K.rot }));
  for (let k = 0; k < 6; k++) P.push(part(box(0.5, 0.012, 0.36), k % 2 ? C.paper : '#e4d6b2', { ...at(-0.15 + k * 0.01, 0.02, 0.785 + k * 0.015), ry: K.rot + (k - 2.5) * 0.05 }));
  P.push(part(box(0.4, 0.012, 0.3), C.paper, { ...at(0.2, -0.05, 0.875), ry: K.rot + 0.2 }));     // the note, on top
  P.push(part(new THREE.ConeGeometry(0.09, 0.2, 7), C.shell, { ...at(0.26, -0.02, 0.92), rz: 1.3, ry: K.rot, c2: C.shell2 }));
  // the hammock, sagging between the palms at ±2.4 along the camp's x
  const pts = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8, lx = lerp(-2.1, 2.1, t); pts.push(at(lx, 1.6, 1.25 - Math.sin(t * Math.PI) * 0.55)); }
  for (let k = 0; k < 8; k++) {
    const a = pts[k], b = pts[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    P.push(part(box(len, k % 2 ? 0.04 : 0.055, 0.85), k % 2 ? C.canvas : C.canvas2, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, ry: K.rot, rz: Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) * (k < 4 ? -1 : -1) }));
  }
  return P;
}
/** Where the hammock's palms stand. */
export function hammockPalms(L) {
  const K = L.camp, cs = Math.cos(K.rot), sn = Math.sin(K.rot);
  return [-2.4, 2.4].map((lx) => ({ x: K.x + lx * cs + 1.6 * sn, z: K.z - lx * sn + 1.6 * cs }));
}

/** The tide shrine: a little domed rotunda on the beach, open to the sea, with an offering bowl inside. */
export function shrineParts(L) {
  const S = L.shrine, y = groundH(S.x, S.z), P = [];
  P.push(stone(new THREE.CylinderGeometry(S.r + 0.15, S.r + 0.35, 0.6, 20), C.stone2, { x: S.x, y: y - 0.28, z: S.z }, 4301, { moss: 0.2 }));
  // the back wall, a half round of blocks on the landward side (+x)
  for (let k = 0; k < 9; k++) {
    const t = ((k + 0.5) / 9) * Math.PI, r = S.r - 0.2;
    P.push(stone(box(0.4, 2.8, (Math.PI * r) / 9 + 0.06), k % 2 ? C.stone2 : C.stone3, { x: S.x + Math.sin(t) * r, y: y + 1.4, z: S.z + Math.cos(t) * r, ry: t - Math.PI / 2 }, 4302 + k, { moss: 0.4 }));
  }
  for (const s of [-1, 1]) P.push(shaft(S.x + 0.4, S.z + s * (S.r - 0.2), 0.3, y, y + 2.8, 4304 + s));
  P.push(stone(new THREE.TorusGeometry(S.r - 0.15, 0.22, 6, 20), C.stone, { x: S.x, y: y + 2.9, z: S.z, rx: Math.PI / 2 }, 4306));
  P.push(stone(new THREE.SphereGeometry(S.r, 16, 6, 0, TAU, 0, Math.PI / 2), C.stone, { x: S.x, y: y + 2.9, z: S.z }, 4307, { moss: 0.6 }));
  P.push(part(new THREE.ConeGeometry(0.12, 0.5, 6), C.stone2, { x: S.x, y: y + 5.2, z: S.z }));
  // the offering bowl on its pedestal at the back, a shell in it
  P.push(stone(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 10), C.stone, { x: S.x + 1.4, y: y + 0.45, z: S.z }, 4308));
  P.push(part(new THREE.CylinderGeometry(0.4, 0.22, 0.2, 12), C.stone2, { x: S.x + 1.4, y: y + 1.0, z: S.z }));
  P.push(part(new THREE.ConeGeometry(0.08, 0.18, 7), C.shell, { x: S.x + 1.4, y: y + 1.16, z: S.z, rz: 1.2, c2: C.shell2 }));
  return P;
}

/** His trail markers: a strip of red sailcloth tied round a column, the end blowing loose. */
export function ragParts(x, y, z, r, seed) {
  const a = (seed * 1.7) % TAU;
  return [
    part(new THREE.CylinderGeometry(r + 0.04, r + 0.05, 0.2, 14, 1, true), C.red, { x, y, z }),
    part(box(0.12, 0.55, 0.02), C.red2, { x: x + Math.cos(a) * (r + 0.06), y: y - 0.3, z: z + Math.sin(a) * (r + 0.06), ry: -a, rz: 0.25 }),
  ];
}
/** Rags along the route: on the stumps, the first capital's column, where you turn, and down the west row. */
export function trailParts(L) {
  const P = [], C0 = TEMPLE.cols, colZ = (k) => C0.z0 + k * C0.step;
  for (const s of L.stumps) P.push(...ragParts(s.cx, s.top - 0.55, s.cz, s.r - 0.06, s.cx));
  for (const [x, k] of [[C0.x, 0], [C0.x, 3], [-C0.x, 3], [-C0.x, 6], [-C0.x, 9]]) P.push(...ragParts(x, TEMPLE.deck - 1.7, colZ(k), C0.r * 1.06, k + x));
  P.push(...ragParts(TEMPLE.portico[1], TEMPLE.deck + 1.4, TEMPLE.entab.z, 0.84, 7));
  return P;
}

/** The ground colour at a point, for the terrain mesh. */
export function groundColour(c, x, z, h, slope) {
  const n = noise2(x * 0.17, z * 0.17, 6);
  if (h < -0.4) c.set(C.seabed);
  else if (h < 1.5) c.set(n > 0.1 ? C.sand2 : C.sand);
  else c.set(n > 0.05 ? C.grass2 : C.grass).lerp(new THREE.Color(C.sand), smoothstep(2.0, 1.5, h) * 0.6);
  if (slope > 0.7) c.lerp(DARK, 0.2);
  return c;
}
