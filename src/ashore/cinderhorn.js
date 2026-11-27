// Mount Cinderhorn as a walkable level: the fourth landmark level, hand-built
// like the Elder Grove, Archway Isle and the Sunken Temple, and the first made
// of another level's mechanics: the steam vents, crumbling basalt and lava of
// volcanic islands (hazards.js). cinderhorn-layout.js decides where everything
// stands (and is checked in Node); this file assembles it: the black beach and
// the old flow, the mountain's face and its shelves, the crater and its
// ledges, the ridge and the knoll, the broken rim and the Horn. The rock is
// made in cinderhorn-art.js (and volcanic-art.js), the lava, sparks, steam and
// falling pieces in cinderhorn-life.js.
//
// The rock next to the lava is drawn a second time, unlit, with how hot it is
// for a colour: faint by day, and after dark it is what lights the crater.
//
// Like Archway Isle and the temple it doesn't turn to face your ship: the
// rowboat always comes in on the beach at the foot of the old flow.
// The story lives here too: the note at grandfather's camp, Journal VI on his
// bedroll on the knoll, the view from the shoulder and the tally marks.
// Follows the level contract in shapes.js, plus:
//   spots: { note, journal, looks }   story interactions ({ x, y, z, r } and their wording; looks show a line)
//   syncStory({ journal })            show the journal while it waits to be found
//   update(dt, t, { night, hazards }) the lava, sparks, steam and crumbling pieces, and the glow
//   vents, crumbles, pools            what hazards.js runs on: the launches, the falling rock, the lake
//   hubs, faces                       where the camera orbits (the Horn) and looks in at a wall (the descent)
//   fallBack: { drop, below, safe, down }  a long fall puts you back at your last lantern
//       (ashore.js); the shoulder's, the knoll's and the Horn's lanterns offer to climb down to the beach
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial, thinOutline, PROPS } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { mulberry32, noise2, clamp, TAU } from '../util.js';
import { rowboatParts } from './pieces.js';
import { buildCinderhornLayout, cinderGrid, groundH, rimAt, CINDER } from './cinderhorn-layout.js';
import { pieceArt, hornParts, spireParts, campParts, forgeParts, forgeGlowParts, trailParts, knollCampParts, journalParts, groundColour } from './cinderhorn-art.js';
import { buildCinderhornLife } from './cinderhorn-life.js';
import { LINES } from '../story-text.js';

function merged(parts) {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ ground
let terrainMat = null;
/** The ground, and over it the heat of the rock by the lava: { terrain, heat } (they share their vertices). */
function terrainMeshes(heatMat) {
  // the same grid you walk on (cinderhorn-layout.js, groundH)
  const { E, S, n, hs, tags } = cinderGrid();
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), hot = new Float32Array(n * n * 3), c = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -E + i * S, z = -E + j * S, h = hs[k];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const hx = hs[j * n + Math.min(n - 1, i + 1)] - hs[j * n + Math.max(0, i - 1)];
    const hz = hs[Math.min(n - 1, j + 1) * n + i] - hs[Math.max(0, j - 1) * n + i];
    groundColour(c, x, z, h, Math.hypot(hx, hz) / (2 * S), tags[k]);
    const v = 1 + noise2(x * 0.4, z * 0.4, 9) * 0.035;
    col[k * 3] = c.r * v; col[k * 3 + 1] = c.g * v; col[k * 3 + 2] = c.b * v;
    // how hot: only inside the crater, strongest at the lava, gone a dozen metres up the wall
    const r = Math.hypot(x, z), up = h - CINDER.lake;
    const heat = r < rimAt(Math.atan2(z, x)).ri ? clamp(1 - up / 12, 0, 1) ** 2 : 0;
    hot[k * 3] = heat; hot[k * 3 + 1] = heat * 0.36; hot[k * 3 + 2] = heat * 0.08;
  }
  const idx = [], hotIdx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, cc = a + n, d = cc + 1;
    if (hs[a] < -3.5 && hs[b] < -3.5 && hs[cc] < -3.5 && hs[d] < -3.5) continue;
    idx.push(a, cc, b, b, cc, d);
    if (hot[a * 3] + hot[b * 3] + hot[cc * 3] + hot[d * 3] > 0) hotIdx.push(a, cc, b, b, cc, d);
  }
  const position = new THREE.BufferAttribute(pos, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', position);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  terrainMat ||= toonMaterial({ vertexColors: true, gradientMap: toonGradient() }, { rim: false });
  const terrain = new THREE.Mesh(g, terrainMat);
  terrain.name = 'cinderhorn:ground';
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', position);
  hg.setAttribute('color', new THREE.BufferAttribute(hot, 3));
  hg.setIndex(hotIdx);
  hg.computeBoundingSphere();
  const heat = new THREE.Mesh(hg, heatMat);
  heat.name = 'cinderhorn:heat';
  heat.renderOrder = 1;
  return { terrain, heat };
}

// ------------------------------------------------------------------- decor
/** Burnt trees and dark boulders on the low ground round the mountain. */
function buildDecor(L, group, colliders, quality) {
  const rng = mulberry32(8123), low = quality === 'low';
  const buckets = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (type, x, y, z, s, rot = rng() * TAU) => {
    q.setFromAxisAngle(up, rot);
    m.compose(v.set(x, y, z), q, sc.set(s, s * (0.85 + rng() * 0.3), s));
    (buckets[type] ||= []).push(m.clone());
  };
  const stood = [];
  for (let n = 0, done = 0; n < 1600 && done < (low ? 40 : 80); n++) {
    const a = rng() * TAU, r = CINDER.foot + 1.5 + rng() * 26, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!L.clear(x, z, 0.3)) continue;
    const roll = rng(), y = groundH(x, z);
    if (roll < 0.3) {
      if (stood.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 4)) continue;
      const s = 1.0 + rng() * 0.6;
      put('deadTree', x, y - 0.15, z, s);
      colliders.push({ type: 'cyl', x, z, r: 0.2 * s, y0: y - 0.5, y1: y + 3 * s, tag: 'wood' });
      stood.push([x, z]);
    } else if (roll < 0.75) {
      const s = 0.7 + rng() * 1.1;
      put('darkRock', x, y - 0.12, z, s);
      if (s > 1.2) colliders.push({ type: 'cyl', x, z, r: 0.55 * s, y0: y - 0.5, y1: y + 0.7 * s, tag: 'stone' });
    } else put('pebble', x, y - 0.03, z, 1 + rng() * 1.6);
    done++;
  }
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

// ------------------------------------------------------------------- level
/** Build the walkable Mount Cinderhorn for island I. opts: { quality }. */
export function buildCinderhornLevel(I, opts = {}) {
  const L = buildCinderhornLayout();
  const group = new THREE.Group();
  group.name = `ashore:${I.name || 'cinderhorn'}`;
  const own = [];
  const heatMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const { terrain, heat } = terrainMeshes(heatMat);
  group.add(terrain, heat);
  own.push(terrain.geometry, heat.geometry, heatMat);

  // the rock: every piece that holds (the ones that crumble are drawn on their own, so they can fall), the Horn, the spires
  const rockParts = [];
  for (const p of L.pieces) if (!p.crumble) rockParts.push(...pieceArt(p));
  rockParts.push(...hornParts(L), ...spireParts(L));
  const rock = merged(rockParts);
  const things = merged([...rowboatParts(L.rowboat), ...campParts(L), ...forgeParts(L), ...trailParts(L), ...knollCampParts(L)]);
  own.push(rock, things);
  for (const [geo, name] of [[rock, 'cinderhorn:rock'], [things, 'cinderhorn:things']]) {
    const mesh = new THREE.Mesh(geo, propMaterial);
    mesh.name = name;
    group.add(mesh, new THREE.Mesh(geo, thinOutline));
  }
  // the forge's fire, unlit
  const embers = merged(forgeGlowParts(L)), emberMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(embers, emberMat));
  own.push(embers, emberMat);
  // Journal VI open on the bedroll, until it's found
  const bookGeo = merged(journalParts(L));
  own.push(bookGeo);
  const book = new THREE.Group();
  book.add(new THREE.Mesh(bookGeo, propMaterial), new THREE.Mesh(bookGeo, thinOutline));
  book.visible = false;
  group.add(book);

  const colliders = [...L.colliders];
  const decor = buildDecor(L, group, colliders, opts.quality);
  const life = buildCinderhornLife(L, { quality: opts.quality });
  group.add(life.group);

  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  return {
    group,
    colliders,
    groundAt: L.groundAt,
    groundTag: L.groundTag,
    waterY: 0,
    bounds: L.bounds,
    spawn: L.spawn,
    exit: L.exit,
    checkpoints: L.checkpoints,
    coins: L.coins,
    caches: L.caches,
    chests: L.chests.map((c) => ({ ...c, text: LINES.goggles })),
    summit: L.summit,
    vault: L.vault,
    spots: {
      note: { ...L.spots.note, prompt: 'Read the note on the sailcloth', title: 'A note on the sailcloth', line: LINES.cinderNote, text: LINES.cinderNoteText },
      journal: { ...L.spots.journal, take: 'Take the journal from the bedroll', read: "Read grandfather's journal on the knoll", look: 'Look at the bedroll', lookText: LINES.cinderBedroll },
      looks: L.spots.looks.map((s) => ({ ...s, line: LINES[`cinder${cap(s.text)}`] })),
    },
    syncStory({ journal = false } = {}) { book.visible = journal; },
    update(dt, t, { night = 0, hazards = null } = {}) {
      life.update(dt, t, night, hazards);
      // the glow of the rock by the lava: there by day, and at night the crater's light
      heatMat.opacity = (0.22 + night * 0.6) * (0.92 + 0.08 * Math.sin(t * 0.9));
    },
    // hazards (hazards.js): the vents that throw you, the rock that crumbles, and the lake of lava
    vents: L.vents,
    crumbles: L.crumbles,
    pools: L.pools,
    hubs: L.hubs,
    faces: L.faces,
    fallBack: L.fallBack,
    dispose() {
      group.removeFromParent();
      for (const o of own) o.dispose();
      for (const d of decor) d.dispose();
      life.dispose();
    },
  };
}
