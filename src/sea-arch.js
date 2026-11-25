// The great arch of Archway Isle, as seen from the sea. Journal III: "a great
// stone arch that stands in the open sea like a doorway with no house behind
// it". Grandfather sailed straight through it. The island is a U round a bay
// (world.js, bayFor) and the arch spans the bay's mouth, so the way into the
// bay is through it.
//
// Built to read from far off, like the Elder Tree: a heavy span of layered
// rock on two legs, undercut where the surf hits them, fallen blocks round
// its feet, turf and two wind-bent pines on its back and white streaks where
// the seabirds nest. Surf bursts against the legs as the waves come through,
// gulls circle the crown and sit on the ledges, and now and then a small
// squall drifts past out beyond it. Under the span, too small to see from
// outside the channel, a colony of crabs lives upside down.
//
// Sea view only. The walkable arch is built with the Archway Isle level.
// Authored in arch space: sea level at y = 0, the span along x (legs at
// x = ±ARCH.legX, on the tips of the bay's two arms), the channel along z
// (+z into the bay, -z out to sea). The world draws it ARCH.scale times
// bigger, so it holds its own against the island.
import * as THREE from 'three';
import { part, merge, propMaterial, jitter } from './props.js';
import { toonGradient, toonMaterial, outlineMaterial } from './toon.js';
import { waveHeight } from './waves.js';
import { mulberry32, noise2, hash2, smoothstep, lerp, clamp, TAU } from './util.js';

/** The shape the island's collision rocks and the level agree on. */
export const ARCH = { legX: 17.5, rise: 25, base: -6, crown: 19, depth: 8, scale: 1.35 };

const C = {
  rock: '#a39b91', band: '#bf9f78', dark: '#837b73', wet: '#4f4944', foot: '#5d5650',
  turf: '#7d9a4a', turf2: '#94b05a', guano: '#e9e5da',
  pine: '#3f6b3a', pine2: '#2f5530', bark: '#5d4535',
  crab: '#e0553a', crab2: '#b33a26', crabEye: '#1b1410',
  gull: '#f4f4f0', gull2: '#9aa3ad', gullTip: '#2b3038', beak: '#e8b23a',
  squall: '#7d8693', squall2: '#535b67',
};

// ------------------------------------------------------------------ the span
// The centre line is half an ellipse from one leg's foot to the other's.
const centre = (phi) => [ARCH.legX * Math.cos(phi), ARCH.base + ARCH.rise * Math.sin(phi)];
/** Outward normal of the centre line (in the xy plane). */
function outward(phi) {
  const nx = ARCH.rise * Math.cos(phi), ny = ARCH.legX * Math.sin(phi), l = Math.hypot(nx, ny);
  return [nx / l, ny / l];
}
// Thickness in the plane of the arch (rN) and across it (rB): stout legs, a
// thinner crown, and a notch at the waterline where the surf has cut in.
function radii(phi, y) {
  const crown = Math.sin(phi);
  const notch = 1 - 0.2 * Math.exp(-((y - 1.2) ** 2) / 3);
  return [lerp(6.6, 4.3, crown ** 2) * notch, lerp(ARCH.depth, 6.2, crown ** 2) * notch];
}

function rockColour(c, x, y, z, up) {
  const n = noise2(x * 0.11 + z * 0.07, y * 0.05 + z * 0.09, 5);
  // strata: warmer bands every few metres, wavering a little
  const band = Math.floor((y + 40 + n * 0.7) / 3.1) % 3;
  c.set(band === 1 ? C.band : band === 2 ? C.dark : C.rock);
  if (y < 2.2 + n) c.set(C.wet);
  else if (up > 0.6 && y > ARCH.crown - 2) c.set(n > 0.15 ? C.turf2 : C.turf);
  else if (up > 0.45 && y > 4 && n > 0.25) c.set(C.guano);
}

function spanGeometry() {
  const segs = 90, radial = 22;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const phi = Math.PI * (1 - i / segs);
    const [cx, cy] = centre(phi), [nx, ny] = outward(phi);
    const [rN, rB] = radii(phi, cy);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      // rock lumps, and a stepped edge to each layer of strata
      const ly = cy + ny * ca * rN;
      let k = 1 + (noise2(i * 0.35 + j * 0.9, ly * 0.2, 11) * 0.14) + (hash2(i, j, 3) - 0.5) * 0.06;
      k += clamp(Math.sin(ly * 1.15) * 3, -1, 1) * 0.035;
      // the top of the span is flatter, so turf can sit on it
      const top = 1 - 0.18 * smoothstep(0.3, 0.8, ny * ca);
      const x = cx + nx * ca * rN * k, y = cy + ny * ca * rN * k * top, z = sa * rB * k;
      pos.push(x, y, z);
      rockColour(c, x, y, z, ny * ca);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), cc = a + radial, d = b + radial;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Fallen blocks round the feet, ledges for the gulls, and the pines on top. */
function rubbleAndTop(rng) {
  const P = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const a = rng() * TAU, d = 6 + rng() * 7, r = 1.6 + rng() * 2.6;
      const x = s * ARCH.legX + Math.cos(a) * d * 0.8, z = Math.sin(a) * d * 1.3;
      if (Math.abs(x) < 9) continue; // keep the channel clear
      const g = jitter(new THREE.DodecahedronGeometry(r, 0), 0.3, k * 7 + (s > 0 ? 3 : 0));
      P.push(part(g, rng() < 0.5 ? C.wet : C.foot, { x, y: -0.6 + rng() * 1.2, z, ry: rng() * TAU, sy: 0.7, c2: C.wet, split: 0.5 }));
    }
    // a big slab fallen on the seaward side of each leg
    const g = jitter(new THREE.BoxGeometry(7, 3, 5, 2, 1, 2), 0.5, s > 0 ? 41 : 43);
    P.push(part(g, C.dark, { x: s * (ARCH.legX + 2), y: 0.6, z: -9, ry: 0.4 * s, rx: 0.3, c2: C.wet, split: 0.45 }));
  }
  // two wind-bent pines on the back of the span, leaning away from the open sea
  for (const [x, h, lean] of [[-4.5, 4.2, 0.28], [3.2, 3.2, 0.22]]) {
    const y = ARCH.crown + 3.2;
    P.push(part(new THREE.CylinderGeometry(0.22, 0.34, h, 5), C.bark, { x, y: y + h / 2, z: 0.6, rz: lean }));
    for (let t = 0; t < 3; t++) {
      const r = 1.8 - t * 0.45, ty = y + h * 0.55 + t * 1.05;
      P.push(part(new THREE.ConeGeometry(r, 1.7, 7), t % 2 ? C.pine : C.pine2, { x: x - lean * (ty - y) * 1.1, y: ty, z: 0.6, rz: lean, sx: 1.3, c2: C.pine2, split: 0.4 }));
    }
  }
  return P;
}

/** A gull at rest: on a ledge, or (wings out) in the air. */
function gullParts(P, o = {}) {
  const { x = 0, y = 0, z = 0, ry = 0, flying = false } = o;
  const rot = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
  const [bx, bz] = rot(0, 0);
  P.push(part(new THREE.SphereGeometry(0.42, 8, 6), C.gull, { x: bx, y: y + 0.4, z: bz, ry, sz: 2.1, c2: C.gull2, split: 0.35 }));
  const [hx, hz] = rot(0, 0.75);
  P.push(part(new THREE.SphereGeometry(0.28, 8, 6), C.gull, { x: hx, y: y + 0.72, z: hz }));
  const [kx, kz] = rot(0, 1.05);
  P.push(part(new THREE.ConeGeometry(0.07, 0.3, 4), C.beak, { x: kx, y: y + 0.7, z: kz, ry, rx: Math.PI / 2 }));
  if (flying) {
    for (const s of [-1, 1]) {
      P.push(part(new THREE.BoxGeometry(2.4, 0.08, 0.7), C.gull2, { x: s * 1.3, y: 0.55, rz: s * 0.18 }));
      P.push(part(new THREE.BoxGeometry(0.8, 0.09, 0.55), C.gullTip, { x: s * 2.75, y: 0.75, rz: s * 0.25 }));
    }
  } else {
    for (const s of [-1, 1]) {
      const [wx, wz] = rot(s * 0.32, -0.1);
      P.push(part(new THREE.SphereGeometry(0.3, 6, 5), C.gull2, { x: wx, y: y + 0.48, z: wz, ry, sz: 2.2, sx: 0.4 }));
    }
  }
}

/** Gulls sat on the arch's ledges, where the white streaks are. */
function ledgeGulls(rng) {
  const P = [];
  // [where along the span (0..1 of half a turn), which side]
  const spots = [[0.82, 1], [0.85, -1], [0.18, 1], [0.15, -1], [0.75, 1], [0.24, -1]];
  for (const [u, side] of spots) {
    const phi = Math.PI * u, [cx, cy] = centre(phi), [nx, ny] = outward(phi);
    const [rN, rB] = radii(phi, cy);
    gullParts(P, { x: cx + nx * 0.6 * rN, y: cy + ny * 0.6 * rN + 0.15, z: side * 0.8 * rB, ry: rng() * TAU });
  }
  return P;
}

/** One crab, standing on its own up (+y). */
function crabGeometry() {
  const P = [];
  P.push(part(new THREE.SphereGeometry(0.34, 8, 6), C.crab, { y: 0.14, sx: 1.25, sy: 0.5, c2: C.crab2, split: 0.45 }));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      P.push(part(new THREE.BoxGeometry(0.42, 0.05, 0.06), C.crab2, { x: s * 0.42, y: 0.08, z: (k - 1) * 0.16, rz: s * 0.5, ry: s * (k - 1) * 0.4 }));
    }
    P.push(part(new THREE.SphereGeometry(0.12, 6, 5), C.crab, { x: s * 0.36, y: 0.16, z: 0.34, sz: 1.4 }));
    P.push(part(new THREE.SphereGeometry(0.05, 5, 4), C.crabEye, { x: s * 0.1, y: 0.3, z: 0.22 }));
  }
  return merge(P);
}

/** The colony on the underside of the span: each crab upside down on the rock. */
function crabColony(rng) {
  const one = crabGeometry();
  const P = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), spin = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let n = 0; n < 64; n++) {
    const phi = Math.PI * (0.3 + rng() * 0.4), [cx, cy] = centre(phi), [nx, ny] = outward(phi);
    const [rN, rB] = radii(phi, cy);
    const a = Math.PI + (rng() - 0.5) * 1.3, ca = Math.cos(a), sa = Math.sin(a);
    p.set(cx + nx * ca * rN * 0.96, cy + ny * ca * rN * 0.96, sa * rB * 0.96);
    d.set(nx * ca / rN, ny * ca / rN, sa / rB).normalize();
    q.setFromUnitVectors(up, d);
    spin.setFromAxisAngle(up, rng() * TAU);
    q.multiply(spin);
    s.setScalar(0.85 + rng() * 0.4);
    m.compose(p, q, s);
    P.push(one.clone().applyMatrix4(m));
  }
  one.dispose();
  return merge(P);
}

// ------------------------------------------------------------ live things
const rockOutline = outlineMaterial(0.28), fineOutline = outlineMaterial(0.05);

function blob(r, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}

function squallGeometry() {
  const lumps = [[0, 0, 0, 1], [1.2, -0.15, 0.3, 0.8], [-1.1, -0.1, -0.2, 0.85], [0.4, 0.45, -0.2, 0.75],
    [-0.5, 0.4, 0.4, 0.65], [2.1, -0.25, -0.1, 0.6], [-2.0, -0.2, 0.25, 0.6]];
  return merge(lumps.map(([x, y, z, r]) => part(blob(r, 1), C.squall, { x, y, z, sy: 0.7, c2: C.squall2, split: 0.45, soft: 0.1 })));
}

/** A burst of spray: a fan of small puffs, taller in the middle. */
function sprayGeometry() {
  const P = [], rng = mulberry32(0x5bea);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, d = 0.5 + rng() * 0.7, y = 0.3 + (1 - d) * 1.4 + rng() * 0.5;
    const g = blob(0.35 + rng() * 0.3, 1);
    g.translate(Math.cos(a) * d, y, Math.sin(a) * d);
    P.push(g);
  }
  return merge(P.map((g) => { g.deleteAttribute('uv'); return g; }));
}

/** Rain streaks for the squall's curtain: thin slanted lines that scroll down. */
function rainTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const x = cv.getContext('2d'), rng = mulberry32(0x7a17);
  for (let i = 0; i < 90; i++) {
    const px = rng() * 128, py = rng() * 128, len = 18 + rng() * 30;
    x.strokeStyle = `rgba(255,255,255,${0.25 + rng() * 0.5})`;
    x.lineWidth = 1 + rng() * 1.5;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px - len * 0.15, py + len); x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 1);
  return t;
}

let cache = null;
function geometries() {
  if (cache) return cache;
  const rng = mulberry32(0xa4c4);
  const flyer = [];
  gullParts(flyer, { flying: true });
  cache = {
    rock: merge([spanGeometry(), ...rubbleAndTop(rng)]),
    fine: merge(ledgeGulls(rng)),
    crabs: crabColony(rng),
    gull: merge(flyer),
    squall: squallGeometry(),
    spray: sprayGeometry(),
  };
  return cache;
}

/**
 * The arch in arch space. world(x, z): arch space to world x/z, so the surf
 * can follow the real waves at each leg. Returns { group, outlines (meshes
 * to hide when far), crabs (only worth drawing up close), update(time, night) }.
 */
export function buildSeaArch({ world }) {
  const G = geometries();
  const group = new THREE.Group();
  group.name = 'seaArch';
  const outlines = [];
  for (const [geo, ol] of [[G.rock, rockOutline], [G.fine, fineOutline]]) {
    const o = new THREE.Mesh(geo, ol);
    group.add(new THREE.Mesh(geo, propMaterial), o);
    outlines.push(o);
  }
  const crabs = new THREE.Mesh(G.crabs, propMaterial);
  group.add(crabs);

  // surf at the legs: white bursts that climb the rock and blow downwind
  const surfGeo = G.spray;
  const surf = [], L = ARCH.legX;
  // the seaward faces of the legs take the most; then the channel faces
  const SURF = [[L, -8], [L + 4, -6.5], [-L, -8], [-L - 4, -6.5], [L - 6.2, -3], [-L + 6.2, -2], [L - 6.2, 3]];
  for (const [k, [x, z]] of SURF.entries()) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(surfGeo, mat);
    const [wx, wz] = world(x, z);
    m.userData.p = { x, z, wx, wz, last: 0, t: 9 + k };
    m.visible = false;
    group.add(m);
    surf.push(m);
  }

  // gulls circling the crown
  const rng = mulberry32(0x9a11);
  const gullMat = toonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const gulls = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(G.gull, gullMat);
    b.userData.p = { a: rng() * TAU, R: 14 + rng() * 26, y: 30 + rng() * 16, w: (0.18 + rng() * 0.12) * (i % 3 ? 1 : -1), k: rng() * TAU };
    group.add(b);
    gulls.push(b);
  }

  // a small squall that drifts past out to sea beyond the arch now and then
  const squall = new THREE.Group();
  const cloud = new THREE.Mesh(G.squall, propMaterial);
  cloud.scale.set(20, 11, 15);
  const rainMat = new THREE.MeshBasicMaterial({ color: 0x6f7c8a, map: rainTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const rain = new THREE.Mesh(new THREE.CylinderGeometry(26, 34, 76, 18, 1, true), rainMat);
  rain.position.y = -38;
  rain.rotation.z = 0.12;
  squall.add(cloud, rain);
  squall.visible = false;
  group.add(squall);
  const SQUALL = { period: 420, pass: 240, z: -150, y: 78, span: 340 };

  let prev = 0;
  function update(time, night) {
    const dt = clamp(time - prev, 0, 0.1);
    prev = time;
    for (const m of surf) {
      const p = m.userData.p;
      // a burst each time the sea at the leg rises through its mean
      const h = waveHeight(p.wx, p.wz);
      if (h > 0.15 && p.last <= 0.15 && p.t > 2.5) p.t = 0;
      p.last = h;
      p.t += dt;
      const u = p.t / 2.2;
      m.visible = u < 1;
      if (!m.visible) continue;
      const s = 0.6 + smoothstep(0, 0.4, u) * 2.2;
      m.scale.set(s, 0.5 + smoothstep(0, 0.5, u) * 3.2, s);
      m.position.set(p.x, 0.2 + u * 1.5, p.z + u * 2);
      m.material.opacity = (1 - smoothstep(0.3, 1, u)) * 0.85;
    }
    for (const b of gulls) {
      const p = b.userData.p, a = p.a + time * p.w;
      b.position.set(Math.cos(a) * p.R, p.y + Math.sin(time * 0.6 + p.k) * 2.5, Math.sin(a) * p.R * 0.8);
      b.rotation.set(0, -a + (p.w > 0 ? 0 : Math.PI), p.w > 0 ? 0.3 : -0.3);
      b.scale.y = 0.7 + Math.abs(Math.sin(time * 3 + p.k)) * 0.5;
    }
    // the squall: crosses in `pass` seconds out of every `period`
    const t = (time + 60) % SQUALL.period;
    squall.visible = t < SQUALL.pass;
    if (squall.visible) {
      const u = t / SQUALL.pass, grow = smoothstep(0, 0.15, u) * (1 - smoothstep(0.85, 1, u));
      squall.position.set(lerp(-SQUALL.span, SQUALL.span, u), SQUALL.y, SQUALL.z);
      squall.scale.setScalar(Math.max(0.01, grow));
      rainMat.opacity = 0.55 * grow * (1 - clamp(night, 0, 1) * 0.5);
      rainMat.map.offset.y = -time * 0.6;
    }
  }
  update(0, 0);
  return { group, outlines, crabs, update };
}
