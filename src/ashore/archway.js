// Archway Isle as a walkable level: the second landmark level, hand-built
// like the Elder Grove. archway-layout.js decides where everything stands
// (and is checked in Node); this file assembles it: the U of the island round
// its bay, the cove and the basin, the gully, the cliffs, the great arch over
// the mouth and the seaward stack. The rock itself, the camp, the cairns and
// the handline are made in archway-art.js.
//
// Unlike the grove it doesn't turn to face your ship: the cove is always at
// the head of the bay, where the rowboat comes in.
// The story lives here too: the note on grandfather's weather board, his mark
// scratched into the keystone with Journal IV under a stone beside it, and his
// storm lantern on its crook (the keystone's lantern, which burns after dark).
// Follows the level contract in shapes.js, plus:
//   spots: { note, journal }      story interactions ({ x, y, z, r } and their wording; journal has the journal's id)
//   syncStory({ journal })        show the journal while it waits to be found
//   update(dt, t, { pos, night, play })   the gulls (archway-life.js)
//   hubs: [{ x, z, orbit, base, top }]   the seaward stack, which the camera circles (camera.js)
//   faces: [{ path, base, top, reach }]   the traverse's cliff face, which the camera looks in at
//   fallBack: { drop, below, safe, down }  a long fall puts you back at your last lantern
//       (ashore.js); lanterns that high offer to climb down to the cove
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial, thinOutline, PROPS } from '../props.js';
import { toonGradient, toonMaterial } from '../toon.js';
import { mulberry32, noise2, TAU } from '../util.js';
import { rowboatParts } from './pieces.js';
import { buildArchwayLayout, archwayGrid, groundH, ARCHWAY } from './archway-layout.js';
import { C, bandFaces, pieceArt, archBody, stackBody, campParts, cairnParts, handlineParts, caveParts, noteParts, keystoneParts, pouchParts, stormLanternParts, markTexture, markGeometry } from './archway-art.js';
import { buildArchwayLife } from './archway-life.js';
import { LINES } from '../story-text.js';

function merged(parts) {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ ground
let terrainMat = null;
function terrainMesh() {
  // the same grid you walk on (archway-layout.js, groundH)
  const { E, S, n, hs, tags } = archwayGrid();
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    pos[k * 3] = -E + i * S; pos[k * 3 + 1] = hs[k]; pos[k * 3 + 2] = -E + j * S;
  }
  const cs = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, new THREE.Color(v)]));
  const tmp = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = pos[k * 3], z = pos[k * 3 + 2], h = hs[k];
    // steepness from the neighbours: cliffs are banded rock, flats are turf or shingle
    const hx = hs[j * n + Math.min(n - 1, i + 1)] - hs[j * n + Math.max(0, i - 1)];
    const hz = hs[Math.min(n - 1, j + 1) * n + i] - hs[Math.max(0, j - 1) * n + i];
    const slope = Math.hypot(hx, hz) / (2 * S);
    const nz = noise2(x * 0.17, z * 0.17, 6);
    if (h < -0.4) tmp.copy(cs.seabed);
    else if (tags[k] === 'sand' || h < 0.5) tmp.copy(nz > 0.1 ? cs.shingle2 : cs.shingle);
    else if (slope > 0.7) tmp.copy(cs.scree).lerp(cs.grass2, 0.25);
    else tmp.copy(nz > 0.05 ? cs.grass2 : cs.grass);
    const v = 1 + noise2(x * 0.4, z * 0.4, 9) * 0.035;
    col[k * 3] = tmp.r * v; col[k * 3 + 1] = tmp.g * v; col[k * 3 + 2] = tmp.b * v;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (hs[a] < -5 && hs[b] < -5 && hs[c] < -5 && hs[d] < -5) continue;
    idx.push(a, c, b, b, c, d);
  }
  const ix = new THREE.BufferGeometry();
  ix.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ix.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ix.setIndex(idx);
  ix.computeVertexNormals();
  // smooth shading, but the cliffs coloured a face at a time so their bands stay crisp
  const g = bandFaces(ix.toNonIndexed(), { flat: 0.5, keepFlat: true, fluted: true });
  ix.dispose();
  g.computeBoundingSphere();
  terrainMat ||= toonMaterial({ vertexColors: true, gradientMap: toonGradient() }, { rim: false });
  const m = new THREE.Mesh(g, terrainMat);
  m.name = 'archway:ground';
  return m;
}

// ------------------------------------------------------------------- decor
/** Wind-bent pines, boulders and bushes on the cliff tops; boulders on the beach. */
function buildDecor(L, group, colliders, quality) {
  const rng = mulberry32(4421), low = quality === 'low';
  const buckets = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (type, x, z, s, sink = 0.12, rot = rng() * TAU) => {
    q.setFromAxisAngle(up, rot);
    m.compose(v.set(x, groundH(x, z) - sink, z), q, sc.set(s, s * (0.9 + rng() * 0.25), s));
    (buckets[type] ||= []).push(m.clone());
    // boulders are solid: you walk round them, not through them
    if (type === 'rock' && s > 0.5) {
      const bb = PROPS.rock.boundingBox || (PROPS.rock.computeBoundingBox(), PROPS.rock.boundingBox);
      colliders.push({ type: 'cyl', x, z, r: Math.max(bb.max.x, bb.max.z) * s * 0.85, y0: groundH(x, z) - 0.5, y1: groundH(x, z) - sink + bb.max.y * s * 0.9, tag: 'stone' });
    }
  };
  const trunks = [];
  for (let n = 0, done = 0; n < 900 && done < (low ? 40 : 75); n++) {
    const x = (rng() - 0.5) * 170, z = (rng() - 0.5) * 170;
    if (!L.clear(x, z, 0.5)) continue;
    const roll = rng(), type = roll < 0.42 ? 'pine' : roll < 0.7 ? 'rock' : roll < 0.92 ? 'bush' : 'grassTuft';
    if (type === 'pine') {
      if (trunks.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 4)) continue;
      const s = 1.4 + rng() * 0.9;
      put('pine', x, z, s, 0.3);
      trunks.push([x, z]);
      colliders.push({ type: 'cyl', x, z, r: 0.3 * s, y0: groundH(x, z) - 0.5, y1: groundH(x, z) + 3 * s, tag: 'wood' });
    } else put(type, x, z, type === 'rock' ? 0.6 + rng() * 0.9 : 0.8 + rng() * 0.6);
    done++;
  }
  // boulders strewn on the shingle either side of the cove
  for (let k = 0; k < 8; k++) {
    const x = (k % 2 ? 1 : -1) * (5 + rng() * 4.5), z = 34 + rng() * 5;
    if (Math.abs(x - L.rowboat.x) < 3 && Math.abs(z - L.rowboat.z) < 3) continue;
    put('rock', x, z, 0.4 + rng() * 0.5, 0.2);
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

/** Grandfather's trail: cairns along the cliff top, a rope bolted along the traverse. */
function trailParts(L) {
  const P = [], A = ARCHWAY;
  const tops = L.route.filter((n) => !n.piece && !n.tier && n.y > 12 && n.z > 10 && n.z < 72);
  for (const [k, n] of tops.entries()) {
    const x = n.x + 1.6, z = n.z + 0.8;
    P.push(...cairnParts(x, groundH(x, z) - 0.05, z, 1500 + k * 11));
  }
  // the handline: a pin in the face above each ledge, where the rock is at that height
  const pins = [];
  for (const n of L.route) {
    if (n.piece?.kind !== 'ledge') continue;
    const y = n.y + 1.15, a = n.piece.a;
    const at = (d) => (a != null ? [Math.cos(a) * (A.bay - 0.3 + d), Math.sin(a) * (A.bay - 0.3 + d)] : [-(A.mouth - 1 + d), n.z]);
    let d = 0;
    while (d < 6 && groundH(...at(d)) < y) d += 0.1;
    const [px, pz] = at(Math.max(0, d - 0.15));
    pins.push([px, y, pz]);
  }
  // only between neighbours: no rope across an inlet
  let run = [];
  for (const p of pins) {
    const last = run[run.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[2] - last[2]) > 4.5) { if (run.length > 1) P.push(...handlineParts(run)); run = []; }
    run.push(p);
  }
  if (run.length > 1) P.push(...handlineParts(run));
  return P;
}

// ------------------------------------------------------------------- level
/** Build the walkable Archway Isle for island I. opts: { quality }. */
export function buildArchwayLevel(I, opts = {}) {
  const L = buildArchwayLayout(), A = ARCHWAY;
  const group = new THREE.Group();
  group.name = `ashore:${I.name || 'archway'}`;
  const own = [];
  const terrain = terrainMesh();
  group.add(terrain);
  own.push(terrain.geometry);

  const rock = merged([...archBody(L, A), ...stackBody(A.stack), ...caveParts(L.cave, L.vault.y)]);
  const parts = [];
  for (const [i, p] of L.pieces.entries()) parts.push(...pieceArt(p, i));
  parts.push(...rowboatParts(L.rowboat), ...campParts(L.camp), ...trailParts(L));
  // the story: his note on the weather board, the keystone and his storm lantern
  const keyLantern = L.checkpoints.find((c) => c.id === 'keystone');
  parts.push(...noteParts(L.camp), ...keystoneParts(L), ...stormLanternParts(keyLantern));
  const walk = merged(parts);
  own.push(rock, walk);
  for (const [geo, name] of [[rock, 'archway:rock'], [walk, 'archway:pieces']]) {
    const mesh = new THREE.Mesh(geo, propMaterial);
    mesh.name = name;
    group.add(mesh, new THREE.Mesh(geo, thinOutline));
  }
  // what he scratched into the flagstone
  const markMap = markTexture(), markGeo = markGeometry(L.flag);
  const markMat = toonMaterial({ map: markMap, gradientMap: toonGradient(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }, { rim: false });
  const mark = new THREE.Mesh(markGeo, markMat);
  mark.name = 'archway:mark';
  group.add(mark);
  own.push(markMap, markGeo, markMat);
  // Journal IV in its pouch under the stone, until it's found
  const bookGeo = merged(pouchParts(L));
  own.push(bookGeo);
  const book = new THREE.Group();
  book.add(new THREE.Mesh(bookGeo, propMaterial), new THREE.Mesh(bookGeo, thinOutline));
  book.visible = false;
  group.add(book);

  const colliders = [...L.colliders];
  const decor = buildDecor(L, group, colliders, opts.quality);
  const life = buildArchwayLife(L, { quality: opts.quality });
  group.add(life.group);

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
    chests: L.chests.map((c) => ({ ...c, text: LINES.souwester })),
    summit: L.summit,
    vault: L.vault,
    spots: {
      note: { ...L.spots.note, prompt: 'Read the note on the weather board', title: 'A note on the weather board', line: LINES.archNote, text: LINES.archNoteText },
      journal: { ...L.spots.journal, take: 'Take the journal from under the stone', read: "Read grandfather's journal at the keystone", look: 'Look at the marks in the rock', lookText: LINES.keystone },
    },
    syncStory({ journal = false } = {}) { book.visible = journal; },
    update(dt, t, { pos, night, play }) { life.update(dt, t, pos, night, play); },
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

