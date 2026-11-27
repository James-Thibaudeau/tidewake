// The Sunken Temple, as seen from the sea. Journal IV's clue: "a whole temple
// half drowned among the palms". It stands over the edge of Sunken Temple
// Isle, facing Port Haven: a stepped platform rising out of the shallows to a
// portico of six columns, two broken, under a broken pediment; behind it a
// roofless hall with palms growing out of it. In front, the drowned
// colonnade, two rows of columns standing in the sea, runs straight out from
// the steps, far enough apart to sail up between them; a giant stone face
// lies half sunk beside it with a beard of weed.
//
// Built to read from far off, like the Elder Tree: waves break white round
// the columns' feet, water spills out of the flooded hall down the steps,
// turtles doze on the lowest step and slide in when a boat comes close,
// frigatebirds circle over the hall, mist rises off it at dawn and dusk,
// now and then the sun flashes off gold in the doorway, and at night the
// water round the colonnade glows blue, pulsing as the waves come through.
//
// Sea view only. The walkable temple is built with its own level
// (ashore/temple.js). Authored in temple space: sea level at y = 0, the
// portico's front edge at the origin, the colonnade running out to sea along
// -z and the hall inland on +z. `deck` is the portico's height, high enough
// that the island's ground never shows through the hall's floor.
import * as THREE from 'three';
import { part, merge, propMaterial, jitter } from './props.js';
import { toonGradient, toonMaterial, outlineMaterial } from './toon.js';
import { waveHeight } from './waves.js';
import { mulberry32, noise2, smoothstep, lerp, clamp, TAU } from './util.js';

/** The shape the world's collision rocks and the chart agree on. */
export const TEMPLE_SEA = {
  rows: 15, colR: 2.1, colTop: 23, colZ: [-30, -45, -60, -75, -90, -105, -120],
  stairHalf: 13, half: 31, porticoZ: 8, deckZ: 28,
  hall: { half: 21, z0: 30, z1: 68, wall: 3, rise: 13 },
};
const T = TEMPLE_SEA;
const STAIR0 = -0.6;   // the stair starts in front of the platform's moulding

const C = {
  stone: '#d9c08c', stone2: '#c7aa76', stone3: '#b0935f', shade: '#8f7650', course: '#a88c5c', dark: '#3d3226', wet: '#7a845a', wet2: '#56664a',
  moss: '#7d9a45', weed: '#4f7a34', weed2: '#3c6128', vine: '#5d8f3a',
  pool: '#3f9aa0', palm: '#4f9a3c', palm2: '#3a7d2f', trunk: '#8a6a45', gold: '#f6cf55',
  shell: '#6f7a3e', shell2: '#55602e', skin: '#9fae7a', bird: '#2a2a30', bird2: '#4a4a52',
};
const box = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(x, y, z, sx, sy, sz);
const WET = new THREE.Color(C.wet), WET2 = new THREE.Color(C.wet2), MOSS = new THREE.Color(C.moss);

/** Old stone by the sea: dark and green at the waterline, stained up to the old high water, moss on the tops. */
function weather(g, seed) {
  const p = g.attributes.position, c = g.attributes.color, n = g.attributes.normal, col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = noise2(x * 0.08, z * 0.08 + y * 0.05, seed);
    col.setRGB(c.getX(i), c.getY(i), c.getZ(i)).multiplyScalar(1 + k * 0.06);
    if (y < 0.6) col.lerp(WET2, 0.8);
    else if (y < 3 + k * 0.8) col.lerp(WET, 0.6);
    if (n && n.getY(i) > 0.6 && noise2(x * 0.15, z * 0.15, seed + 5) > 0.35) col.lerp(MOSS, 0.65);
    c.setXYZ(i, col.r, col.g, col.b);
  }
  return g;
}
const stone = (geo, color, t, seed = 0) => weather(part(geo, color, t), seed);

/** A fluted column from y0 to y1; `broken` gives it a jagged top. */
function column(x, z, r, y0, y1, seed, broken = false) {
  const g = new THREE.CylinderGeometry(r * 0.93, r, y1 - y0, 14, Math.max(1, Math.round((y1 - y0) / 6)));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.06 * Math.cos(a * 14);
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    if (broken && p.getY(i) > (y1 - y0) / 2 - 0.01) p.setY(i, p.getY(i) - 1.2 - 1.2 * (0.5 + 0.5 * Math.sin(a * 3 + seed)));
  }
  g.computeVertexNormals();
  const P = [stone(g, C.stone, { x, y: (y0 + y1) / 2, z }, seed)];
  if (!broken) {
    P.push(stone(new THREE.CylinderGeometry(r * 1.35, r * 1.02, 1.2, 14), C.stone2, { x, y: y1 + 0.6, z }, seed + 1));
    P.push(stone(box(r * 3, 0.9, r * 3), C.stone2, { x, y: y1 + 1.65, z }, seed + 2));
  }
  return P;
}

/** The stone: platform, stair, portico and gable, hall, colonnade, the sunken face. */
function stoneParts(deck) {
  const P = [], H = T.hall, rng = mulberry32(0x7e3a);
  // the platform, deep into the ground, with a moulding at the top
  // (the body stops just under the moulding, and the stair starts in front of it:
  // faces that share a plane flicker)
  P.push(stone(box(T.half * 2, deck + 7.7, T.deckZ + 2), C.stone2, { y: (deck - 8.3) / 2, z: (T.deckZ + 2) / 2 }, 1));
  P.push(stone(box(T.half * 2 + 1.2, 1.2, T.deckZ + 1.2), C.stone, { y: deck - 0.6, z: T.deckZ / 2 }, 2));
  // courses of masonry round the platform, and pilasters on its front either side of the stair
  for (let y = 3; y < deck - 2; y += 3.2) P.push(stone(box(T.half * 2 + 0.3, 0.35, T.deckZ + 2.3), C.course, { y, z: (T.deckZ + 2) / 2 }, 3 + y));
  for (const x of [-27, -20, 20, 27]) P.push(stone(box(2.4, deck + 1.85, 1.2), C.stone, { x, y: (deck - 2.15) / 2, z: -0.5 }, 8 + x));   // tops just under the moulding
  // the front stair, down into the sea
  const steps = Math.round((deck + 3) / 0.9), run = 1.45;
  for (let i = 0; i < steps; i++) {
    const top = deck - (i + 1) * 0.9;
    P.push(stone(box(T.stairHalf * 2 + 0.4, 1.0, run + 0.05), i % 2 ? C.stone : C.stone2, { y: top - 0.5, z: STAIR0 - (i + 0.5) * run }, 10 + i));
  }
  const len = steps * run, tilt = Math.atan2(deck + 3, len);
  for (const s of [-1, 1]) P.push(stone(box(2.2, 2.4, Math.hypot(len, deck + 3) + 2), C.stone2, { x: s * (T.stairHalf + 1.1), y: (deck - 3) / 2 + 1, z: STAIR0 - len / 2, rx: -tilt }, 20 + s));
  // the portico: six columns, two broken; the entablature, broken in the west; the east half of the pediment
  const ET = deck + 18, PZ = T.porticoZ;
  for (const [k, x] of [-25, -15, -5, 5, 15, 25].entries()) {
    const broken = k === 0 || k === 2;
    P.push(...column(x, PZ, 1.9, deck, broken ? deck + (k ? 13 : 7) : ET - 2.4, 30 + k, broken));
  }
  P.push(stone(box(36, 2.6, 5.6), C.stone, { x: 9, y: ET - 1.3, z: PZ }, 40));
  P.push(stone(box(37, 0.7, 6.2), C.shade, { x: 9, y: ET - 2.3, z: PZ }, 41));
  const ped = new THREE.Shape(), apex = ET + 12;
  ped.moveTo(27, ET); ped.lineTo(-3, ET); ped.lineTo(-3, apex - 1); ped.lineTo(-0.5, apex + 0.3); ped.lineTo(1.5, apex - 0.6); ped.lineTo(27, ET);
  const pg = new THREE.ExtrudeGeometry(ped, { depth: 3.6, bevelEnabled: false });
  pg.translate(0, 0, PZ - 1.8);
  P.push(stone(pg, C.stone2, {}, 42));
  const rake = Math.atan2(apex - ET, 28.5), rl = Math.hypot(28.5, apex - ET);
  P.push(stone(box(rl + 1, 1.2, 5), C.stone, { x: 12.5, y: (ET + apex) / 2 + 0.8, z: PZ, rz: -rake }, 43));
  // a carved fish in the pediment, looking out to sea
  P.push(part(new THREE.IcosahedronGeometry(1, 1), C.stone, { x: 12, y: ET + 3.4, z: PZ - 1.9, sx: 4.2, sy: 2.1, sz: 0.5 }));
  P.push(part(new THREE.ConeGeometry(2, 2.6, 4), C.stone3, { x: 17.4, y: ET + 3.4, z: PZ - 1.9, rz: Math.PI / 2, sz: 0.25 }));
  // the fallen half: blocks on the portico and down the stair
  for (const [x, y, z, s, r] of [[-17, deck + 1.2, 16, 1, 0.3], [-24, deck + 1, 12, 0.8, -0.4], [-9, deck - 6.5, -8, 0.9, 0.9], [-20, 0.4, -24, 1.1, 0.2]]) {
    P.push(stone(jitter(box(9 * s, 3 * s, 4.5 * s, 2, 1, 2), 0.4, 50 + x), C.stone, { x, y, z, ry: r, rz: r * 0.2 }, 50 + x));
  }
  // the hall: walls standing round an open roof, the great door in the front, the
  // tops broken; at the back, one slab of roof still standing
  const top = deck + H.rise, wo = H.half + H.wall;
  const wall = (x0, x1, z0, z1, y1, seed) => P.push(stone(jitter(box(x1 - x0, y1 - deck + 10, z1 - z0, Math.max(1, Math.round((x1 - x0) / 8)), 3, Math.max(1, Math.round((z1 - z0) / 8))), 0.25, seed), C.stone2, { x: (x0 + x1) / 2, y: (y1 + deck - 10) / 2, z: (z0 + z1) / 2 }, seed));
  wall(-wo, -5, H.z0, H.z0 + H.wall, top + 2, 60);
  wall(5, wo, H.z0, H.z0 + H.wall, top + 2, 61);
  wall(-5, 5, H.z0, H.z0 + H.wall, top + 2, 62);
  wall(-wo, -H.half, H.z0, H.z1, top - 1, 63);
  wall(H.half, wo, H.z0, H.z1, top, 64);
  wall(-wo, wo, H.z1 - H.wall, H.z1, top - 2, 65);
  for (let k = 0; k < 16; k++) {
    const side = k % 3, t = rng();
    const x = side === 0 ? -H.half - H.wall / 2 : side === 1 ? H.half + H.wall / 2 : lerp(-H.half, H.half, t);
    const z = side === 2 ? H.z1 - H.wall / 2 : lerp(H.z0 + 4, H.z1 - 4, t);
    P.push(stone(jitter(box(4, 2 + rng() * 2, 3.4), 0.3, 70 + k), C.stone, { x, y: top + 1, z }, 70 + k));
  }
  P.push(part(box(9, 10, 1.4), C.dark, { y: deck + 5, z: H.z0 - 0.5 }));                // the dark of the doorway
  for (let y = deck + 3; y < top; y += 3.4) {                                              // courses on the hall's walls
    P.push(stone(box(0.3, 0.3, H.z1 - H.z0), C.course, { x: -wo - 0.1, y, z: (H.z0 + H.z1) / 2 }, 90 + y));
    P.push(stone(box(0.3, 0.3, H.z1 - H.z0), C.course, { x: wo + 0.1, y, z: (H.z0 + H.z1) / 2 }, 91 + y));
  }
  for (const sx of [-1, 1]) for (let z = H.z0 + 8; z < H.z1 - 4; z += 9) P.push(part(box(0.6, 4.5, 1.6), C.dark, { x: sx * (wo + 0.05), y: deck + 7, z }));   // high windows
  P.push(stone(box(H.half * 2, 1.6, 16), C.stone2, { y: top - 3, z: H.z1 - 11 }, 81)); // the roof that's left
  P.push(part(box(H.half * 2, 1.0, H.z1 - H.z0 - H.wall), C.pool, { y: deck + 0.5, z: (H.z0 + H.z1 + H.wall) / 2 })); // the hall, flooded
  // the drowned colonnade: two rows; most columns whole with beams between, some broken short
  const broken = new Set(['-1:1', '-1:4', '1:2', '1:5', '-1:6']);
  for (const s of [-1, 1]) {
    for (const [k, z] of T.colZ.entries()) {
      const b = broken.has(`${s}:${k}`);
      P.push(...column(s * T.rows, z, T.colR, -10, b ? 6 + (k % 3) * 4 : T.colTop, 100 + k * 2 + s, b));
      const nz = T.colZ[k + 1];
      if (nz != null && !b && !broken.has(`${s}:${k + 1}`)) P.push(stone(box(3, 2.2, Math.abs(nz - z) + 1), C.stone, { x: s * T.rows, y: T.colTop + 3.2, z: (z + nz) / 2 }, 120 + k));
    }
    // the beam from the first columns into the platform
    P.push(stone(box(3, 2.2, Math.abs(T.colZ[0]) + 2), C.stone, { x: s * T.rows, y: T.colTop + 3.2, z: T.colZ[0] / 2 }, 130 + s));
  }
  // a column fallen outside the east row, half out of the water (the avenue stays open)
  P.push(stone(new THREE.CylinderGeometry(T.colR, T.colR, 26, 14), C.stone2, { x: 24, y: 0.6, z: -82, rx: Math.PI / 2, rz: 0.12 }, 140));
  // the giant face, half sunk, looking up, a beard of weed
  const F = { x: -33, z: -58, r: 7 };
  P.push(part(jitter(new THREE.IcosahedronGeometry(1, 2), 0.04, 150), C.stone2, { x: F.x, y: -2.2, z: F.z, sx: F.r, sy: F.r * 0.55, sz: F.r * 1.25, ry: 0.4, c2: C.wet, split: 0.62 }));
  for (const s of [-1, 1]) P.push(part(new THREE.CylinderGeometry(1, 1, 0.3, 12), C.dark, { x: F.x + s * 2.4 + 0.5, y: 1.62, z: F.z - 1.4 + s * 1.1, ry: 0.4 }));   // eyes, full of shadow
  P.push(stone(box(1.8, 2.2, 3.6), C.stone, { x: F.x + 0.6, y: 1.2, z: F.z - 0.5, ry: 0.4 }, 151));
  for (const s of [-1, 1]) P.push(stone(box(3.2, 1, 1.2), C.stone, { x: F.x + s * 2.6 + 1.2, y: 0.5, z: F.z - 2.6 + s * 1.2, ry: 0.4 }, 152 + s));
  for (let k = 0; k < 8; k++) P.push(part(new THREE.ConeGeometry(0.5, 3 + rng() * 2, 4), k % 2 ? C.weed : C.weed2, { x: F.x - 1 + (k - 3.5) * 1.3, y: 0.2, z: F.z + 5.5 + rng(), rx: -1.2 }));
  return P;
}

/** Palms growing out of the roofless hall. */
function palmParts(deck) {
  const P = [], rng = mulberry32(0x9a1);
  for (const [x, z, h] of [[-12, 46, 15], [8, 58, 18], [-4, 70, 13], [16, 40, 12]]) {
    const lean = (rng() - 0.5) * 0.4;
    P.push(part(new THREE.CylinderGeometry(0.45, 0.7, h, 7), C.trunk, { x, y: deck + h / 2, z, rz: lean }));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + rng() * 0.3;
      P.push(part(box(7, 0.3, 1.6), k % 2 ? C.palm : C.palm2, { x: x + Math.cos(a) * 3.2 - lean * h / 2, y: deck + h - 0.6, z: z + Math.sin(a) * 3.2, ry: -a, rz: -0.35 }));
    }
  }
  return P;
}

/** Turtles dozing on the lowest dry step. */
function turtleGeometry() {
  return [
    part(new THREE.SphereGeometry(0.9, 10, 5, 0, TAU, 0, Math.PI / 2), C.shell, { sx: 1.2, sy: 0.55, c2: C.shell2, split: 0.3 }),
    part(new THREE.SphereGeometry(0.3, 8, 6), C.skin, { x: 1.2, y: 0.15, sx: 1.3 }),
    part(box(0.9, 0.1, 0.35), C.skin, { x: 0.5, y: 0.06, z: 0.85, ry: 0.6 }),
    part(box(0.9, 0.1, 0.35), C.skin, { x: 0.5, y: 0.06, z: -0.85, ry: -0.6 }),
  ];
}

function birdGeometry() {
  const g = part(box(1.6, 0.25, 0.5), C.bird, {});
  const w = [-1, 1].map((s) => part(box(0.6, 0.08, 3.4), C.bird2, { y: 0.1, z: s * 1.8, rx: s * 0.15 }));
  return [g, ...w];
}

const fineOutline = outlineMaterial(0.06), stoneOutline = outlineMaterial(0.22);

/**
 * Build the temple. world(x, z) → [wx, wz] maps temple space to the world,
 * for the surf (which follows the waves where it stands). Returns { group,
 * outlines, detail, rocks, update(time, night, boat) }; rocks are the hidden
 * collision rocks in temple space ({ x, z, r }), boat the boat's position.
 */
export function buildSeaTemple({ deck = 14, world = (x, z) => [x, z], glowMap = null } = {}) {
  const group = new THREE.Group();
  group.name = 'seaTemple';
  const outlines = [], detail = [];
  const sg = mergeAll(stoneParts(deck)), pg = mergeAll(palmParts(deck));
  for (const [geo, ol] of [[sg, stoneOutline], [pg, fineOutline]]) {
    const o = new THREE.Mesh(geo, ol);
    group.add(new THREE.Mesh(geo, propMaterial), o);
    outlines.push(o);
  }

  // surf: white rings that swell round the columns' feet and the stair's foot as each wave passes
  const ringGeo = new THREE.RingGeometry(0.8, 1, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const surf = [];
  const feet = [];
  for (const s of [-1, 1]) for (const z of T.colZ) feet.push([s * T.rows, z, T.colR + 0.4]);
  for (const x of [-9, 0, 9]) feet.push([x, -Math.round((deck + 3) / 0.9) * 1.45 + 1.5, 4]);
  for (const [k, [x, z, r]] of feet.entries()) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(ringGeo, mat);
    const [wx, wz] = world(x, z);
    m.position.set(x, 0.25, z);
    m.userData.p = { r, wx, wz, last: 0, t: 9 + k * 0.37 };
    group.add(m);
    surf.push(m);
  }
  detail.push(...surf);

  // the spill: water pouring out of the flooded hall and down the stair
  const spillTex = spillTexture();
  const steps = Math.round((deck + 3) / 0.9), len = steps * 1.45;
  const spillMat = new THREE.MeshBasicMaterial({ color: 0xcff4ff, map: spillTex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(7, Math.hypot(len, deck + 3)), spillMat);
  spill.rotation.x = Math.atan2(len, deck + 3);   // lying on the stair, from the portico down into the sea
  spill.position.set(0, (deck - 3) / 2 + 0.2, STAIR0 - len / 2);
  group.add(spill);
  detail.push(spill);

  // turtles on the lowest dry step: they slide in when a boat comes close, and climb back out
  const tg = mergeAll(turtleGeometry());
  const stepY = (i) => deck - (i + 1) * 0.9;
  const lowest = Math.ceil((deck - 0.9) / 0.9) - 1;   // the last step clear of the water
  const turtles = [-8, -3, 5, 10].map((x, k) => {
    const m = new THREE.Mesh(tg, propMaterial);
    const home = { x, y: stepY(lowest) + 0.02, z: STAIR0 - (lowest + 0.5) * 1.45 + 0.2 };
    m.position.set(home.x, home.y, home.z);
    m.rotation.y = Math.PI / 2 + (k - 1.5) * 0.4;
    group.add(m);
    detail.push(m);
    return { m, home, state: 'rest', t: 0, away: 0 };
  });

  // frigatebirds circling over the hall
  const bg = mergeAll(birdGeometry());
  const birdMat = toonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const rng = mulberry32(0x51f);
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(bg, birdMat);
    b.userData.p = { a: rng() * TAU, R: 22 + rng() * 30, y: deck + 40 + rng() * 25, w: (0.12 + rng() * 0.08) * (i % 2 ? 1 : -1), k: rng() * TAU };
    group.add(b);
    birds.push(b);
  }

  // mist off the flooded hall, drifting out through the colonnade at dawn and dusk
  const mistMat = new THREE.SpriteMaterial({ map: glowMap || null, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const mist = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(mistMat);
    s.userData.k = i / 9;
    group.add(s);
    mist.push(s);
  }

  // a glint of gold in the doorway now and then; the colonnade's water glowing at night
  const glintMat = new THREE.SpriteMaterial({ map: glowMap || null, color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glint = new THREE.Sprite(glintMat);
  glint.position.set(0, deck + 3, T.hall.z0 - 1);
  group.add(glint);
  // (sprites low over the water, so the waves can't hide them and they carry a long way)
  const glowMat = new THREE.SpriteMaterial({ color: 0x2fb8ff, map: glowMap || null, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glowAt = [[0, -12, 26]];
  for (const s of [-1, 1]) for (const z of T.colZ) glowAt.push([s * T.rows, z, 18]);
  for (const z of [-50, -85, -115]) glowAt.push([0, z, 24]);
  const glows = glowAt.map(([x, z, r], k) => {
    const m = new THREE.Sprite(glowMat);
    m.position.set(x, 1.5, z);
    m.scale.set(r, r * 0.45, 1);
    m.userData.k = k;
    m.visible = false;
    group.add(m);
    return m;
  });

  const rocks = buildSeaTempleRocks(deck);

  let prev = 0;
  function update(time, night, boat) {
    const dt = clamp(time - prev, 0, 0.1);
    prev = time;
    for (const m of surf) {
      const p = m.userData.p, h = waveHeight(p.wx, p.wz);
      if (h > 0.1 && p.last <= 0.1 && p.t > 2) p.t = 0;
      p.last = h;
      p.t += dt;
      const u = p.t / 2.4;
      m.visible = u < 1;
      if (!m.visible) continue;
      m.scale.setScalar(p.r * (1 + u * 0.9));
      m.material.opacity = (1 - u) * 0.75;
    }
    spillTex.offset.y = -time * 0.35;
    spillMat.opacity = 0.42 - night * 0.25;
    // turtles: near enough to see them, they slip off the step
    let near = Infinity;
    if (boat) { const loc = group.worldToLocal(_v.set(boat.x, 0, boat.z)); near = Math.hypot(loc.x, loc.z + 30); }
    for (const Tt of turtles) {
      if (Tt.state === 'rest') {
        Tt.m.visible = night < 0.6;
        if (near < 55) { Tt.state = 'slide'; Tt.t = 0; }
      } else if (Tt.state === 'slide') {
        Tt.t += dt;
        const u = smoothstep(0, 1.2, Tt.t);
        Tt.m.position.set(Tt.home.x, Tt.home.y - u * 1.6, Tt.home.z - u * 2.2);
        if (Tt.t > 1.4) { Tt.state = 'gone'; Tt.m.visible = false; Tt.away = 0; }
      } else {
        Tt.away = near > 120 ? Tt.away + dt : 0;
        if (Tt.away > 30) { Tt.state = 'rest'; Tt.m.position.set(Tt.home.x, Tt.home.y, Tt.home.z); }
      }
    }
    for (const b of birds) {
      const p = b.userData.p, a = p.a + time * p.w;
      b.position.set(Math.cos(a) * p.R, p.y + Math.sin(time * 0.4 + p.k) * 3, 55 + Math.sin(a) * p.R * 0.8);
      b.rotation.set(0, -a + (p.w > 0 ? 0 : Math.PI), p.w > 0 ? 0.35 : -0.35);
      b.visible = night < 0.7;
    }
    // mist: thickest at dawn and dusk (when the light is low but it isn't night)
    const low = clamp(1 - Math.abs(night - 0.35) * 3, 0, 1);
    mistMat.opacity = (0.14 + low * 0.28) * (1 - smoothstep(0.45, 0.85, night));
    for (const s of mist) {
      const k = (s.userData.k + time * 0.006) % 1;
      s.position.set(Math.sin(k * 11) * 10, deck + 2 + k * 8, lerp(60, -110, k));
      s.scale.setScalar(16 + k * 26);
    }
    // the glint: a flash every so often, by day
    const g = (time % 23) / 23;
    glintMat.opacity = (1 - night) * Math.max(0, 1 - Math.abs(g - 0.5) * 14) * 0.95;
    glint.scale.setScalar(6 + (1 - Math.abs(g - 0.5) * 14) * 5);
    // the glow at night, pulsing
    const lit = smoothstep(0.3, 0.7, night);
    for (const m of glows) m.visible = lit > 0.01;
    glowMat.opacity = lit * (0.85 + Math.sin(time * 0.8) * 0.15);
  }
  update(0, 0, null);
  return { group, outlines, detail, rocks, update };
}
const _v = new THREE.Vector3();

/** Where the boat can't go, in temple space ({ x, z, r }): the colonnade's columns, the foot of the stair, the face, the fallen column. */
export function buildSeaTempleRocks(deck) {
  const rocks = [], len = Math.round((deck + 3) / 0.9) * 1.45;
  for (const s of [-1, 1]) for (const z of T.colZ) rocks.push({ x: s * T.rows, z, r: T.colR + 1.5 });
  for (const x of [-9, 0, 9]) rocks.push({ x, z: -len + 4, r: 6 });
  rocks.push({ x: -33, z: -58, r: 8 });
  for (const z of [-93, -87, -81, -75, -70]) rocks.push({ x: 24 + (z + 82) * 0.12, z, r: 2.6 });
  return rocks;
}

/** Streaks of falling water, to scroll down the stair. */
function spillTexture() {
  const W = 64, H = 128, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), rng = mulberry32(77);
  const cols = Array.from({ length: W }, () => rng());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.min(1, Math.min(x, W - 1 - x) / 10), streak = 0.35 + 0.65 * Math.max(0, Math.sin((y / H) * TAU * 3 + cols[x] * 9));
    const k = (y * W + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.round(255 * edge * streak * (0.5 + cols[x] * 0.5));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  return t;
}

/** Merge vertex-coloured parts into one geometry (and let the parts go). */
function mergeAll(parts) {
  const g = merge(parts);
  for (const p of parts) p.dispose();
  return g;
}
