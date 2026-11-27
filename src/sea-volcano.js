// Mount Cinderhorn, as seen from the sea. Journal V's clue: "a mountain that
// smokes like a kettle left on the stove"; in Journal VI grandfather watched
// it "spit sparks at the stars". The mountain itself is the island's own cone
// (world.js). This is its top and its fire, built by hand over that cone: the
// crater's jagged rim, cut by a notch on the side facing Port Haven; the Horn,
// a hooked spire on the far side of the rim, which gives the mountain its name
// and its outline; the lake of lava inside; and a river of lava that leaves by
// the notch and runs down the flank to the sea between banks of black rock.
//
// Built to read from far off, like the Elder Tree: the lava creeps downhill,
// smoke billows out of the crater in a tall leaning column, steam boils up
// where the river meets the sea, a collar of cloud turns slowly round the
// peak, and every so often the mountain throws a handful of glowing rocks
// into the air. At night the lake lights the smoke from below, the river is a
// bright thread from the summit to the shore, and the sparks carry for miles.
//
// Sea view only. The walkable mountain is built with its own level
// (ashore/cinderhorn.js). Authored in volcano space: the island's centre at
// the origin, sea level at y = 0, the river running down the flank along -z.
// `ground(x, z)` is the island's terrain as drawn; `lake` is the height of
// the lava lake, above every lump of ground inside the rim.
import * as THREE from 'three';
import { part, merge, propMaterial, jitter } from './props.js';
import { toonGradient, toonMaterial, outlineMaterial, glowBoost } from './toon.js';
import { lavaTexture } from './ashore/volcanic-life.js';
import { mulberry32, noise2, hash2, smoothstep, lerp, clamp, TAU } from './util.js';

/** The shape the world's placement, the gallery and the chart agree on. */
export const VOLCANO_SEA = {
  rimR: 62, lakeR: 46, rim: 24, skirtR: 112,   // the crest's and the lake's radius, the crest's height over the lake, where the crown meets the cone
  notchA: -Math.PI / 2, notch: 0.2,             // the notch the river leaves by: its bearing and half-width (radians)
  hornA: Math.PI / 2 + 0.6, horn: 72,           // the Horn: its bearing, and its height over the rim
};
const V = VOLCANO_SEA;

const C = {
  rock: '#4a3d3a', band: '#5c4a44', dark: '#352b2a', ash: '#8f8680', sulphur: '#d6bd4c', ember: '#a8431c', hot: '#ff8a34',
  cold: '#2b2325', cold2: '#3a2f30', smoke: '#6b6466', smokeTop: '#c9c2bc', steam: '#f4f1ec', cloud: '#eef1f4',
};
const ROCK = new THREE.Color(C.rock), BAND = new THREE.Color(C.band), DARK = new THREE.Color(C.dark), ASH = new THREE.Color(C.ash);
const SULPHUR = new THREE.Color(C.sulphur), EMBER = new THREE.Color(C.ember), HOT = new THREE.Color(C.hot);

const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The crest's height over the lake at bearing a: jagged, higher towards the Horn, cut down to the lake at the notch. */
function rimRise(a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const teeth = 4.5 * noise2(ca * 2.6 + 3, sa * 2.6, 7) + 2.5 * noise2(ca * 7 + 1, sa * 7, 9);
  const horn = 10 * (1 - smoothstep(0, 1.0, angDist(a, V.hornA)));
  const open = 1 - smoothstep(V.notch * 0.55, V.notch * 1.7, angDist(a, V.notchA));
  return lerp(V.rim + teeth + horn, -0.8, open);
}

/** The height of the crown (or, beyond its skirt, of the island) at a point. */
function crownY(ground, lake, x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), g = ground(x, z);
  if (r >= V.skirtR) return g;
  if (r >= V.rimR) {
    // the outer wall: from under the ground at the skirt up to the crest, bulging outwards
    const t = (V.skirtR - r) / (V.skirtR - V.rimR);
    const foot = ground(Math.cos(a) * V.skirtR, Math.sin(a) * V.skirtR) - 5;
    const y = lerp(foot, lake + rimRise(a), 1 - Math.pow(1 - t, 1.7));
    return Math.max(y, g + lerp(-5, 3, smoothstep(0, 0.25, t)));
  }
  const t = (V.rimR - r) / (V.rimR - V.lakeR);   // 0 at the crest, 1 at the lake's edge
  return t >= 1 ? lake - 1 : lerp(lake + rimRise(a), lake - 1, Math.pow(t, 0.7));
}
/** …and the highest of it within a stride, so what is laid on it never dips under a lump between. */
function laidOn(ground, lake, x, z, lift) {
  const R = 2.7;
  return Math.max(crownY(ground, lake, x, z), crownY(ground, lake, x + R, z), crownY(ground, lake, x - R, z), crownY(ground, lake, x, z + R), crownY(ground, lake, x, z - R)) + lift;
}

/** Colour a rock geometry a face at a time (so the bands stay crisp): strata, ash on the ledges, sulphur by the rim, scorched towards the lava. */
function paint(geo, lake, inside = () => false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const k = noise2(x * 0.05 + z * 0.03, y * 0.06 + z * 0.05, 5), up = y - lake, band = Math.floor((y + 400 + k * 3) / 7) % 3;
    c.copy(band === 1 ? BAND : band === 2 ? DARK : ROCK);
    const isIn = inside(x, z);
    if (!isIn && n.getY(i) > 0.5 && up > 2 && noise2(x * 0.07, z * 0.07, 11) > 0) c.lerp(ASH, 0.55);
    if (up > V.rim - 9 && up < V.rim + 26 && noise2(x * 0.12, z * 0.12 + y * 0.05, 21) > 0.56) c.lerp(SULPHUR, 0.7);
    if (isIn) c.lerp(EMBER, clamp(1 - up / 15, 0, 1) * 0.8).lerp(HOT, clamp(1 - up / 3, 0, 1) * 0.7);
    c.multiplyScalar(1 + k * 0.05);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** The rim: a ring of rock from the cone up over the crest and down to the lake. */
function crownGeometry(ground, lake) {
  const N = 96, pos = [], idx = [];
  // rows from the skirt up to the crest, then down the inside
  const rows = [];
  for (const t of [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 1]) rows.push(lerp(V.skirtR, V.rimR, t));
  for (const t of [0.16, 0.36, 0.6, 0.82, 1.06]) rows.push(lerp(V.rimR, V.lakeR, t));
  for (let j = 0; j <= N; j++) {
    const a = (j / N) * TAU, ja = j % N;
    for (const [i, r0] of rows.entries()) {
      // ragged between the skirt and the crest, and again down the inside
      const rag = i > 0 && i !== 8 && i < rows.length - 1 ? 2.4 * noise2(ja * 0.9, i * 1.7, 33) : 0;
      const r = r0 + rag, x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, crownY(ground, lake, x, z), z);
    }
  }
  const R = rows.length;
  for (let j = 0; j < N; j++) for (let i = 0; i < R - 1; i++) {
    const p = j * R + i, q = p + R;
    idx.push(p, p + 1, q, p + 1, q + 1, q);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return paint(g, lake, (x, z) => Math.hypot(x, z) < V.rimR - 1);
}

/** The Horn: a hooked spire on the rim, leaning in over the crater; and a few lesser teeth along the crest. */
function hornGeometry(lake) {
  const P = [], ca = Math.cos(V.hornA), sa = Math.sin(V.hornA), y0 = lake + rimRise(V.hornA) - 12, H = V.horn + 12;
  // its centre line: up, a little out, then hooking in over the lake
  const at = (up, inw) => new THREE.Vector3(ca * (V.rimR + 3 - inw), y0 + up, sa * (V.rimR + 3 - inw));
  const curve = new THREE.CatmullRomCurve3([at(0, 0), at(H * 0.3, -6), at(H * 0.58, -4), at(H * 0.8, 6), at(H * 0.96, 20), at(H * 0.92, 33)]);
  const SEG = 13, SIDES = 7, pos = [], idx = [], fr = curve.computeFrenetFrames(SEG, false), Q = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, r = lerp(21, 1.2, Math.pow(t, 0.75)) * (1 + 0.12 * noise2(i * 1.3, 0, 51));
    curve.getPointAt(t, Q);
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * TAU + i * 0.25;
      D.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      const k = r * (1 + 0.16 * (hash2(i, j, 5) - 0.5));
      pos.push(Q.x + D.x * k, Q.y + D.y * k, Q.z + D.z * k);
    }
  }
  curve.getPointAt(1, Q);
  pos.push(Q.x, Q.y, Q.z);
  for (let i = 0; i < SEG; i++) for (let j = 0; j < SIDES; j++) {
    const a = i * SIDES + j, b = i * SIDES + ((j + 1) % SIDES), c = a + SIDES, d = b + SIDES;
    idx.push(a, b, c, b, d, c);
  }
  const tip = (SEG + 1) * SIDES;
  for (let j = 0; j < SIDES; j++) idx.push(SEG * SIDES + j, SEG * SIDES + ((j + 1) % SIDES), tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  P.push(paint(g, lake));
  // lesser teeth along the crest, away from the notch
  const rng = mulberry32(0xc1d3);
  for (let k = 0; k < 9; k++) {
    const a = V.notchA + 0.7 + (k / 9) * (TAU - 1.4) + (rng() - 0.5) * 0.25;
    if (angDist(a, V.hornA) < 0.3) continue;
    const h = 9 + rng() * 12, r = 4.5 + rng() * 3.5, rr = V.rimR + (rng() - 0.5) * 3;
    P.push(paint(jitter(new THREE.ConeGeometry(r, h, 5, 2), 0.9, 60 + k).rotateZ((rng() - 0.5) * 0.3).translate(Math.cos(a) * rr, lake + rimRise(a) + h * 0.3, Math.sin(a) * rr), lake));
  }
  return P;
}

/** Where the river runs: from the lake out through the notch and down the flank to the sea. Each point { x, z, y, d, w }. */
function riverPath(ground, lake) {
  const pts = [];
  for (let d = V.lakeR - 8; d < 640; d += 6) {
    const out = smoothstep(V.rimR, V.rimR + 90, d);
    const x = out * (24 * Math.sin(d * 0.017 + 0.6) + 9 * Math.sin(d * 0.043)), z = -d;
    const y = d < V.rimR - 5 ? lake + 0.5 : laidOn(ground, lake, x, z, 1.5);
    // it widens down the mountain, and fans out where it meets the sea
    const sea = ground(x, z);
    pts.push({ x, z, y: Math.max(y, -1), d, w: lerp(5, 9.5, smoothstep(V.rimR, 300, d)) * (1 + 0.9 * smoothstep(6, 0, sea)) });
    if (sea < -1.6) break;   // it runs on under the water's edge
  }
  return pts;
}
/** The river's branch round an outcrop, part of the way down: it leaves to one side and comes back. */
function branchPath(ground, lake, main) {
  const d0 = 150, d1 = 270;
  return main.filter((p) => p.d >= d0 - 6 && p.d <= d1 + 6).map((p) => {
    const k = clamp((p.d - d0) / (d1 - d0), 0, 1), x = p.x + 30 * Math.sin(k * Math.PI);
    return { x, z: p.z, y: laidOn(ground, lake, x, p.z, 1.5), d: p.d, w: p.w * 0.7 };
  });
}

/**
 * A strip laid along a path, `cols` vertices across. width(p, i) is its
 * half-width there; y(x, z, u) the height of a vertex (u from -1 to 1 across).
 * With `uv` it carries texture coordinates (v runs downhill).
 */
function ribbon(pts, cols, width, y, uv = 0) {
  const pos = [], uvs = [], idx = [];
  let len = 0;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / tl, nz = (b.x - a.x) / tl, w = width(p, i);
    if (i) len += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1, x = p.x + nx * w * u, z = p.z + nz * w * u;
      pos.push(x, y(x, z, u, p), z);
      uvs.push((u + 1) / 2, len / uv);
    }
  });
  for (let i = 0; i < pts.length - 1; i++) for (let c = 0; c < cols - 1; c++) {
    const a = i * cols + c, b = a + cols;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** A soft round clump (spherical normals), paler on top: smoke, steam and cloud. */
function puffGeometry() {
  const lumps = [[0, 0, 0, 1], [0.95, -0.15, 0.2, 0.7], [-0.9, -0.1, -0.15, 0.76], [0.3, 0.5, -0.1, 0.72], [-0.4, 0.4, 0.35, 0.6], [0.2, -0.1, 0.75, 0.62], [-0.2, -0.15, -0.75, 0.6]];
  return merge(lumps.map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
    return part(g, '#ffffff', { x, y, z, sy: 0.85, c2: '#b9b3b6', split: 0.36, soft: 0.14 });
  }));
}

const rockOutline = outlineMaterial(0.5);
const SMOKE = 16, STEAM = 7, COLLAR = 7, ROCKS = 12, PERIOD = 23;

/**
 * Build the mountain's top and its fire. ground(x, z): the island's terrain
 * in volcano space; lake: the lava lake's height; glowMap: a soft dot.
 * Returns { group, outlines (to hide when far), river (its path, for keeping
 * trees out of it), mouth (where it meets the sea), update(time, night),
 * dispose() }.
 */
export function buildSeaVolcano({ ground, lake = 190, glowMap = null }) {
  const group = new THREE.Group();
  group.name = 'seaVolcano';
  const outlines = [], own = [];
  const river = riverPath(ground, lake), branch = branchPath(ground, lake, river), mouth = river[river.length - 1];

  // ---- the rock: the rim, the Horn and its teeth, the river's banks and the outcrop it parts round
  const rock = [crownGeometry(ground, lake), ...hornGeometry(lake)];
  const rng = mulberry32(0x51c9);
  for (const path of [river, branch]) {
    for (const [i, p] of path.entries()) {
      if (p.d < V.rimR + 4 || i % 2 || ground(p.x, p.z) < 1) continue;
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      for (const s of [-1, 1]) {
        const x = p.x - ((b.z - a.z) / tl) * (p.w + 1.5) * s, z = p.z + ((b.x - a.x) / tl) * (p.w + 1.5) * s, r = 2.2 + rng() * 2.2;
        rock.push(part(jitter(new THREE.DodecahedronGeometry(r, 0), 0.5, i * 7 + s), rng() < 0.5 ? C.cold : C.cold2, { x, y: crownY(ground, lake, x, z) + r * 0.25, z, sy: 0.7, ry: rng() * TAU }));
      }
    }
  }
  const mid = branch[Math.floor(branch.length / 2)], split = river.find((p) => p.d === mid.d);
  const ox = (mid.x + split.x) / 2, oy = crownY(ground, lake, ox, mid.z);
  rock.push(part(jitter(new THREE.DodecahedronGeometry(11, 1), 2.2, 91), C.rock, { x: ox, y: oy + 3, z: mid.z, sy: 0.9, c2: C.dark, split: 0.4 }));
  const rockGeo = merge(rock);
  for (const g of rock) g.dispose();
  // ---- fields of cold black lava either side of the river (their edges run down into the ground)
  const cold = [river, branch].map((path) => {
    const pts = path.filter((p) => p.d > V.rimR + 10 && ground(p.x, p.z) > 0.4);
    const g = ribbon(pts, 7, (p, i) => p.w * (2.6 + 0.9 * noise2(i * 0.6, p.w, 71)), (x, z, u) => laidOn(ground, lake, x, z, Math.abs(u) > 0.9 ? -2.5 : 0.55)).toNonIndexed();
    g.computeVertexNormals();
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      c.set(noise2(p.getX(i) * 0.08, p.getZ(i) * 0.08, 77) > 0 ? C.cold : C.cold2);
      for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const coldGeo = merge(cold);
  for (const g of cold) g.dispose();
  own.push(rockGeo, coldGeo);
  const ink = new THREE.Mesh(rockGeo, rockOutline);
  group.add(new THREE.Mesh(rockGeo, propMaterial), ink, new THREE.Mesh(coldGeo, propMaterial));
  outlines.push(ink);

  // ---- the lava: the lake, and the river down to the sea (unlit, so it glows after dark)
  const lavaMap = lavaTexture(0x1a7a);
  const lavaMat = new THREE.MeshBasicMaterial({ map: lavaMap, side: THREE.DoubleSide });
  const lakeGeo = new THREE.CircleGeometry(V.lakeR + 3, 40);
  lakeGeo.rotateX(-Math.PI / 2);
  { const p = lakeGeo.attributes.position, uv = lakeGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 42, -p.getZ(i) / 42); }
  const lakeMesh = new THREE.Mesh(lakeGeo, lavaMat);
  lakeMesh.position.y = lake;
  const flow = merge([river, branch].map((path) => ribbon(path, 3, (p) => p.w, (x, z, u, p) => (p.d < V.rimR - 5 ? lake + 0.5 : Math.max(-1, laidOn(ground, lake, x, z, 1.5))), 34)));
  group.add(lakeMesh, new THREE.Mesh(flow, lavaMat));
  own.push(lavaMap, lavaMat, lakeGeo, flow);

  // ---- smoke out of the crater, steam where the river meets the sea, a collar of cloud round the peak
  const puffGeo = puffGeometry();
  const puffMat = toonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, SMOKE + STEAM + COLLAR);
  puffs.frustumCulled = false;
  group.add(puffs);
  own.push(puffGeo, puffMat);
  const collar = Array.from({ length: COLLAR }, (_, i) => ({ a: (i / COLLAR) * TAU + rng() * 0.5, R: 150 + rng() * 45, y: lake - 62 + rng() * 26, s: 22 + rng() * 12, w: (0.006 + rng() * 0.006) * (i % 3 ? 1 : -1), k: rng() * TAU }));

  // ---- the rocks it throws, and their light after dark
  const rockMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const bombGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const bombs = new THREE.InstancedMesh(bombGeo, rockMat, ROCKS);
  bombs.frustumCulled = false;
  const sparkPos = new Float32Array(ROCKS * 3), sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ size: 34, map: glowMap, color: 0xff9a40, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(bombs, sparks);
  own.push(rockMat, bombGeo, sparkGeo, sparkMat);

  // ---- the glow: over the lake (on the smoke's underside), along the river and at its mouth
  const glowMat = new THREE.SpriteMaterial({ color: 0xff6a22, map: glowMap, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glowAt = [[0, lake + 16, 0, 210, 130], [14, lake + 60, -10, 130, 110], [mouth.x, 9, mouth.z, 60, 34]];
  const glows = glowAt.map(([x, y, z, sx, sy]) => {
    const s = new THREE.Sprite(glowMat);
    s.position.set(x, y, z);
    s.scale.set(sx, sy, 1);
    group.add(s);
    return s;
  });
  own.push(glowMat);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const smokeLow = new THREE.Color(C.smoke), smokeTop = new THREE.Color(C.smokeTop), steamCol = new THREE.Color(C.steam), cloudCol = new THREE.Color(C.cloud), lit = new THREE.Color('#ffb070');
  const put = (i, x, y, z, sx, sy, sz, ry, col) => {
    q.setFromEuler(e.set(0, ry, 0));
    puffs.setMatrixAt(i, m.compose(v.set(x, y, z), q, sc.set(sx, sy, sz)));
    puffs.setColorAt(i, col);
  };
  const sm = new THREE.Vector3();

  function update(time, night) {
    // the lava creeps downhill, and breathes a little
    lavaMap.offset.y = -(time * 0.012) % 1;
    lavaMat.color.setScalar(0.93 + 0.07 * Math.sin(time * 0.7));
    const dark = smoothstep(0.3, 0.7, night);
    let n = 0;
    // the smoke: puffs rising one after another, swelling, leaning downwind, thinning out at the top;
    // after dark the low ones are lit from the lake
    for (let i = 0; i < SMOKE; i++) {
      const k = (time * 0.028 + i / SMOKE) % 1, lean = Math.pow(k, 1.5);
      const s = lerp(7, 40, Math.pow(k, 0.8)) * smoothstep(0, 0.05, k) * (1 - smoothstep(0.8, 1, k));
      c.copy(smokeLow).lerp(smokeTop, smoothstep(0.1, 0.8, k)).lerp(lit, dark * 0.5 * (1 - smoothstep(0.05, 0.4, k)));
      put(n++, (4 + 10 * k) * Math.sin(i * 2.4) + 14 + lean * 170, lake + 4 + k * 270, (4 + 10 * k) * Math.cos(i * 1.7) - 10 - lean * 40, s * 1.15, s, s, i * 1.3 + time * 0.05, c);
    }
    // steam boiling up where the river meets the sea
    for (let i = 0; i < STEAM; i++) {
      const k = (time * 0.06 + i / STEAM) % 1, s = lerp(5, 19, k) * smoothstep(0, 0.1, k) * (1 - k * k * k);
      put(n++, mouth.x + Math.sin(i * 2.1) * 7 + k * 26, 2 + k * 62, mouth.z + Math.cos(i * 3.3) * 7 + k * 10, s * 1.1, s, s, i + time * 0.1, steamCol);
    }
    // the collar of cloud, turning slowly
    for (const p of collar) {
      const a = p.a + time * p.w, s = p.s * (1 + Math.sin(time * 0.2 + p.k) * 0.08);
      put(n++, Math.cos(a) * p.R, p.y + Math.sin(time * 0.15 + p.k) * 3, Math.sin(a) * p.R, s * 1.7, s * 0.5, s, -a, cloudCol);
    }
    puffs.instanceMatrix.needsUpdate = true;
    puffs.instanceColor.needsUpdate = true;
    // the rocks: a handful thrown up out of the crater every so often, falling back in arcs
    const burst = Math.floor(time / PERIOD), t0 = time - burst * PERIOD;
    let live = 0;
    for (let i = 0; i < ROCKS; i++) {
      const t = t0 - hash2(burst, i, 3) * 0.9, a = hash2(burst, i, 4) * TAU, out = 4 + hash2(burst, i, 5) * 15, vy = 44 + hash2(burst, i, 6) * 30;
      const y = lake + 4 + vy * t - 11 * t * t;
      const up = t > 0 && y > lake - 4;
      sm.set(Math.cos(a) * (6 + out * Math.max(0, t)), up ? y : -500, Math.sin(a) * (6 + out * Math.max(0, t)));
      const s = up ? 0.6 + hash2(burst, i, 7) * 0.8 : 0.001;
      bombs.setMatrixAt(i, m.compose(sm, q.identity(), sc.set(s, s, s)));
      sparkPos[i * 3] = sm.x; sparkPos[i * 3 + 1] = sm.y; sparkPos[i * 3 + 2] = sm.z;
      if (up) live++;
    }
    bombs.instanceMatrix.needsUpdate = true;
    sparkGeo.attributes.position.needsUpdate = true;
    rockMat.color.set(0xffa040).multiplyScalar(Math.min(glowBoost.value, 1.8));
    sparks.visible = live > 0 && dark > 0.01;
    sparkMat.opacity = dark * 0.9;
    // the glow: a hot haze over the lake by day, and after dark the mountain's own light
    const pulse = 0.88 + 0.12 * Math.sin(time * 0.8), flare = live ? 1.25 : 1;
    glowMat.opacity = (0.12 + dark * 0.6) * pulse * flare;
    for (let i = 2; i < glows.length; i++) glows[i].visible = dark > 0.01;
  }
  update(0, 0);
  return { group, outlines, river, mouth, update, dispose() { for (const o of own) o.dispose(); puffs.dispose(); bombs.dispose(); } };
}
