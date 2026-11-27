// The Sunken Temple as a walkable level: the third landmark level, hand-built
// like the Elder Grove and Archway Isle. temple-layout.js decides where
// everything stands (and is checked in Node); this file assembles it: the
// beach and the palms, the drowned causeway, the colonnade, the platform and
// its stair, the portico and the broken gable, the flooded hall and the
// treasury. The stone itself is made in temple-art.js, the turtles, fish and
// ripples in temple-life.js.
//
// The sea is opaque, so a floor a hand's depth under water can't be seen
// through it: each wading floor gets a pale patch on the still water over it
// (the sea lies flat here, level.calm), and at night those patches, and the
// water round the colonnade, glow blue.
//
// Like Archway Isle it doesn't turn to face your ship: the rowboat always
// comes in on the beach by the causeway.
// The story lives here too: the note on grandfather's camp table, Journal V
// on his crate in the treasury, the carved fish and his one camp stool.
// Follows the level contract in shapes.js, plus:
//   spots: { note, journal, looks }   story interactions ({ x, y, z, r } and their wording; looks show a line)
//   syncStory({ journal })            show the journal while it waits to be found
//   update(dt, t, { pos, night, play })   turtles, fish, ripples, the glow and the light in the treasury
//   fallBack: { drop, below, safe, down }  a long fall puts you back at your last lantern
//       (ashore.js); the portico's and the gable's lanterns offer to climb down to the beach
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial, thinOutline, PROPS } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { mulberry32, noise2, TAU } from '../util.js';
import { rowboatParts } from './pieces.js';
import { buildTempleLayout, templeGrid, groundH } from './temple-layout.js';
import { pieceArt, fallenColumn, gableParts, headParts, hallParts, porticoParts, goldParts, seatedStatueParts, desk, journalParts, campParts, hammockPalms, shrineParts, trailParts, groundColour } from './temple-art.js';
import { buildTempleLife } from './temple-life.js';
import { LINES } from '../story-text.js';

function merged(parts) {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ ground
let terrainMat = null, goldMat = null;
function terrainMesh() {
  // the same grid you walk on (temple-layout.js, groundH)
  const { E, S, n, hs } = templeGrid();
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), c = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -E + i * S, z = -E + j * S, h = hs[k];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const hx = hs[j * n + Math.min(n - 1, i + 1)] - hs[j * n + Math.max(0, i - 1)];
    const hz = hs[Math.min(n - 1, j + 1) * n + i] - hs[Math.max(0, j - 1) * n + i];
    groundColour(c, x, z, h, Math.hypot(hx, hz) / (2 * S));
    const v = 1 + noise2(x * 0.4, z * 0.4, 9) * 0.03;
    col[k * 3] = c.r * v; col[k * 3 + 1] = c.g * v; col[k * 3 + 2] = c.b * v;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, cc = a + n, d = cc + 1;
    if (hs[a] < -3.5 && hs[b] < -3.5 && hs[cc] < -3.5 && hs[d] < -3.5) continue;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  terrainMat ||= toonMaterial({ vertexColors: true, gradientMap: toonGradient() }, { rim: false });
  const m = new THREE.Mesh(g, terrainMat);
  m.name = 'temple:ground';
  return m;
}

// ------------------------------------------------------------------- decor
/** Palms, bushes and rocks on the beach and inland; palms growing in the hall; the hammock's two. */
function buildDecor(L, group, colliders, quality) {
  const rng = mulberry32(5521), low = quality === 'low';
  const buckets = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (type, x, y, z, s, rot = rng() * TAU) => {
    q.setFromAxisAngle(up, rot);
    m.compose(v.set(x, y, z), q, sc.set(s, s * (0.9 + rng() * 0.25), s));
    (buckets[type] ||= []).push(m.clone());
  };
  const palm = (x, y, z, s) => {
    put('palm', x, y - 0.2, z, s);
    colliders.push({ type: 'cyl', x, z, r: 0.22 * s, y0: y - 0.5, y1: y + 4 * s, tag: 'wood' });
  };
  const trunks = [];
  for (let n = 0, done = 0; n < 1200 && done < (low ? 45 : 85); n++) {
    const x = -10 + rng() * 120, z = -60 + rng() * 140;
    if (!L.clear(x, z, 0.4)) continue;
    const roll = rng(), y = groundH(x, z);
    if (roll < 0.45) {
      if (trunks.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 3.5)) continue;
      palm(x, y, z, 1.1 + rng() * 0.7);
      trunks.push([x, z]);
    } else put(roll < 0.75 ? 'bush' : roll < 0.9 ? 'grassTuft' : 'rock', x, y - 0.1, z, 0.7 + rng() * 0.6);
    done++;
  }
  for (const p of hammockPalms(L)) palm(p.x, groundH(p.x, p.z), p.z, 1.35);
  // palms growing out of the flooded hall, through where the roof was
  for (const [x, z, s] of [[-8.0, 27.9, 1.6], [7.4, 25.6, 1.8], [-8.2, 21.9, 1.3]]) palm(x, -0.3, z, s);
  const made = [];
  for (const [type, mats] of Object.entries(buckets)) {
    if (!PROPS[type]) continue;
    for (const mat of [propMaterial, thinOutline]) {
      const mesh = new THREE.InstancedMesh(PROPS[type], mat, mats.length);
      mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.computeBoundingSphere();
      group.add(mesh);
      made.push(mesh);
    }
  }
  return made;
}

// ------------------------------------------------------------------- water
/** A soft-edged pale patch (the floor seen through shallow water), with faint paving joints. */
function shallowTexture() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ex = Math.min(x, S - 1 - x) / (S * 0.12), ey = Math.min(y, S - 1 - y) / (S * 0.12);
    const edge = Math.min(1, ex, ey), joint = (x % 32 < 2 || y % 32 < 2) ? 0.65 : 1;
    const k = (y * S + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.round(255 * edge * edge * joint);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A beam of light: bright down its middle, soft at the sides, fading out at both ends. */
function shaftTexture() {
  const W = 32, H = 64, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = 1 - Math.abs((x + 0.5) / W - 0.5) * 2, sy = Math.sin(((y + 0.5) / H) * Math.PI);
    const k = (y * W + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.round(255 * sx * sx * Math.pow(sy, 0.6));
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
}
/** A round soft glow for the water at night. */
function glowTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}
/** One quad per wading floor, on the water over it: { geo } with UVs 0..1 across each. */
function shallowGeometry(L) {
  const quads = [];
  for (const p of L.pieces) {
    if (!(p.top < 0) || p.r != null) continue;
    const g = new THREE.PlaneGeometry(p.hx * 2 + 0.3, p.hz * 2 + 0.3);
    g.rotateX(-Math.PI / 2);
    g.rotateY(p.rot);
    g.translate(p.cx, 0.04, p.cz);
    quads.push(g);
  }
  return merged(quads);
}

// ------------------------------------------------------------------- level
/** Build the walkable Sunken Temple for island I. opts: { quality }. */
export function buildTempleLevel(I, opts = {}) {
  const L = buildTempleLayout();
  const group = new THREE.Group();
  group.name = `ashore:${I.name || 'temple'}`;
  const own = [];
  const terrain = terrainMesh();
  group.add(terrain);
  own.push(terrain.geometry);

  const stoneParts = [];
  for (const [i, p] of L.pieces.entries()) stoneParts.push(...pieceArt(p, i));
  stoneParts.push(...fallenColumn(L), ...gableParts(L), ...headParts(L.head), ...porticoParts(), ...shrineParts(L));
  const hall = merged(hallParts(L));
  const stone = merged(stoneParts);
  const things = merged([...rowboatParts(L.rowboat), ...campParts(L), ...trailParts(L), ...seatedStatueParts(L), ...desk(L)]);
  // the gold shines a little of its own, even in the shade of the roof
  const gold = merged(goldParts(L));
  goldMat ||= toonMaterial({ vertexColors: true, gradientMap: toonGradient(), emissive: '#6a4a08', emissiveIntensity: 0.55 });
  own.push(hall, stone, things, gold);
  for (const [geo, name, mat] of [[stone, 'temple:stone'], [hall, 'temple:hall'], [things, 'temple:things'], [gold, 'temple:gold', goldMat]]) {
    const mesh = new THREE.Mesh(geo, mat || propMaterial);
    mesh.name = name;
    group.add(mesh, new THREE.Mesh(geo, thinOutline));
  }
  // Journal V open on the crate, until it's found
  const bookGeo = merged(journalParts(L));
  own.push(bookGeo);
  const book = new THREE.Group();
  book.add(new THREE.Mesh(bookGeo, propMaterial), new THREE.Mesh(bookGeo, thinOutline));
  book.visible = false;
  group.add(book);

  // the floors a hand's depth under water, pale through it; blue at night
  const shallowMap = shallowTexture(), shallowGeo = shallowGeometry(L);
  const shallowMat = new THREE.MeshBasicMaterial({ color: 0xbff2e6, map: shallowMap, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const shallow = new THREE.Mesh(shallowGeo, shallowMat);
  shallow.name = 'temple:shallows';
  shallow.renderOrder = 1;
  group.add(shallow);
  // the glow in the water round the colonnade and in the hall at night
  const glowMap = glowTexture(), glowMat = new THREE.MeshBasicMaterial({ color: 0x3fc6ff, map: glowMap, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowGeo = new THREE.PlaneGeometry(2, 2);
  glowGeo.rotateX(-Math.PI / 2);
  const glows = L.glow.map((G) => {
    const g = new THREE.Mesh(glowGeo, glowMat);
    g.position.set(G.x, 0.05, G.z);
    g.scale.set(G.r, 1, G.r);
    g.visible = false;
    group.add(g);
    return g;
  });
  // the light falling through the crack in the roof onto the gold: a few crossed
  // planes, bright down the middle and fading at the ends (edge-on from above)
  const shaftMap = shaftTexture(), R = L.roof;
  const shaftGeo = merged([0, 1, 2].map((k) => new THREE.PlaneGeometry(R.gap * 2.2, R.y - L.dais.top).rotateY((k * Math.PI) / 3)));
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff0b8, map: shaftMap, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shafts = [-0.8, 0.8].map((dz) => {
    const m = new THREE.Mesh(shaftGeo, shaftMat);
    m.position.set(0, (R.y + L.dais.top) / 2, L.statue.z - 1.6 + dz * 1.6);
    m.scale.set(1, 1, 1 + dz * 0.1);
    group.add(m);
    return m;
  });
  own.push(shallowMap, shallowGeo, shallowMat, glowMap, glowMat, glowGeo, shaftMap, shaftGeo, shaftMat);

  const colliders = [...L.colliders];
  const decor = buildDecor(L, group, colliders, opts.quality);
  const life = buildTempleLife(L, { quality: opts.quality });
  group.add(life.group);

  const day = new THREE.Color(0xbff2e6), blue = new THREE.Color(0x58d8ff);
  return {
    group,
    colliders,
    groundAt: L.groundAt,
    groundTag: L.groundTag,
    waterY: 0,
    bounds: L.bounds,
    calm: L.calm,
    spawn: L.spawn,
    exit: L.exit,
    checkpoints: L.checkpoints,
    coins: L.coins,
    caches: L.caches,
    chests: L.chests.map((c) => ({ ...c, text: LINES.circlet })),
    summit: L.summit,
    vault: L.vault,
    spots: {
      note: { ...L.spots.note, prompt: 'Read the note on the camp table', title: 'A note on the camp table', line: LINES.templeNote, text: LINES.templeNoteText },
      journal: { ...L.spots.journal, take: 'Take the journal from the crate', read: "Read grandfather's journal in the treasury", look: 'Look at the crate', lookText: LINES.templeStool },
      looks: L.spots.looks.map((s) => ({ ...s, line: LINES[`temple${s.text[0].toUpperCase()}${s.text.slice(1)}`] })),
    },
    syncStory({ journal = false } = {}) { book.visible = journal; },
    update(dt, t, { pos, night, play }) {
      life.update(dt, t, pos, night, play);
      shallowMat.color.copy(day).lerp(blue, night);
      shallowMat.opacity = 0.5 + night * 0.25;
      const pulse = 0.85 + Math.sin(t * 0.9) * 0.15;
      for (const g of glows) g.visible = night > 0.05;
      glowMat.opacity = night * 0.45 * pulse;
      shaftMat.opacity = 0.22 * (1 - night);
      for (const m of shafts) m.visible = night < 0.95;
    },
    fallBack: L.fallBack,
    dispose() {
      group.removeFromParent();
      for (const o of own) o.dispose();
      for (const d of decor) d.dispose();
      life.dispose();
    },
  };
}
