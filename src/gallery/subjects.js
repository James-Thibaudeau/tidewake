// What the look-dev gallery can show. Each builder takes the parameters from
// the URL (all strings) and the stage to build into, and returns:
//   group      the thing itself (already added to the stage)
//   ground     'floor' | 'sea' | 'none': what it stands on
//   shoal      { x, z, r, fade }: the sea's shallows round it, for an island (optional)
//   calm       { x, z, r }: still water inside r, as the game has it in an island's moat (optional)
//   look       { y }: the height the game cameras aim at (optional)
//   face, helm, bow   { x, y, z, span }: what a close-up camera frames (optional)
//   note       a line for the caption (optional)
//   update     (dt, t, env): animate one step (optional)
//   freeze     (phase): hold a walk or run at one point of the stride (optional)
//   dispose    free what it made
//   warnings   parameters that were not understood
//
// Nothing here knows about the page: gallery/main.js owns the scene, the
// cameras and the lighting. Subjects are built by the game's own code, so what
// the gallery shows is what the game draws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Explorer } from '../explorer.js';
import { DEFAULT_PROFILE, SLOTS, STYLES, normalizeProfile } from '../cosmetics.js';
import { SABLE_PROFILE, SABLE_LIVERY } from '../rival-text.js';
import { Boat, pointOfSail } from '../boat.js';
import { MAX_TIER } from '../boat/parts.js';
import { LIVERY_PARTS, paintsOf, paintInfo, liveryFor } from '../paints.js';
import { PAINT_PARAMS } from './sheets.js';
import { UPGRADES, ASHORE_BIOMES, upgradeValue } from '../config.js';
import { PROPS, initProps, propMesh, propMaterial, thinOutline } from '../props.js';
import { buildElderTree } from '../elder-tree.js';
import { glowTexture } from '../world.js';
import { buildWreckModel } from '../ashore/wreck.js';
import { buildGroveLevel } from '../ashore/grove.js';
import { buildGroveLayout } from '../ashore/grove-layout.js';
import { pieceArt } from '../ashore/grove-art.js';
import { buildArchwayLevel } from '../ashore/archway.js';
import { buildArchwayLayout } from '../ashore/archway-layout.js';
import { pieceArt as archwayPieceArt } from '../ashore/archway-art.js';
import { buildSeaArch, ARCH } from '../sea-arch.js';
import { buildSeaTemple, TEMPLE_SEA } from '../sea-temple.js';
import { buildTempleLevel } from '../ashore/temple.js';
import { buildTempleLayout } from '../ashore/temple-layout.js';
import { pieceArt as templePieceArt } from '../ashore/temple-art.js';
import { buildWhale, buildDolphin, buildTurtle } from '../sea-life.js';
import { buildWaterspout, buildIceberg, buildBottle } from '../sea-wonders.js';
import { buildGull, buildFish } from '../sea-ambient.js';
import { buildGhostShip } from '../ghost-model.js';
import { generateLevel } from '../ashore/levelgen.js';
import { layoutLevel } from '../ashore/modules.js';
import { pieceParts } from '../ashore/pieces.js';
import { shoalOf } from '../ashore/shapes.js';
import { clamp } from '../util.js';
import { POSES } from './presets.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const int = (v, d = 0) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const num = (v, d = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

// ------------------------------------------------------------- the explorer
/**
 * An appearance profile from URL parameters: `profile=sable` to start from
 * Sable, then a style per slot (`top=coat`), a colour per slot
 * (`topColor=crimson`), and `shirt`, `skin`, `head`, `eyeColor`, `eyeShape`,
 * `hairColor`, `blush`, `freckles`. Unknown ids are reported, not guessed.
 */
export function profileFrom(q, warnings = []) {
  const p = clone(q.profile === 'sable' ? SABLE_PROFILE : DEFAULT_PROFILE);
  const asked = [];
  const set = (obj, key, value, label) => { if (value != null) { obj[key] = value; asked.push([label, value]); } };
  for (const slot of SLOTS) {
    set(p[slot], 'style', q[slot], slot);
    set(p[slot], 'color', q[slot + 'Color'], slot + 'Color');
  }
  set(p.top, 'shirt', q.shirt, 'shirt');
  set(p, 'skin', q.skin, 'skin');
  set(p, 'head', q.head, 'head');
  set(p.eyes, 'color', q.eyeColor, 'eyeColor');
  set(p.eyes, 'shape', q.eyeShape, 'eyeShape');
  if (q.blush != null) p.face.blush = q.blush !== '0';
  if (q.freckles != null) p.face.freckles = q.freckles !== '0';
  const out = normalizeProfile(p);
  // normalizeProfile swaps anything it doesn't know for the default: say so
  const got = { ...Object.fromEntries(SLOTS.flatMap((s) => [[s, out[s].style], [s + 'Color', out[s].color]])),
    shirt: out.top.shirt, skin: out.skin, head: out.head, eyeColor: out.eyes.color, eyeShape: out.eyes.shape };
  for (const [label, value] of asked) if (got[label] !== value) warnings.push(`${label}=${value} is not a known id (showing ${got[label]})`);
  return out;
}

function outfit(q, stage) {
  const warnings = [];
  const ex = new Explorer(profileFrom(q, warnings));
  ex.setPose('ground');
  stage.add(ex.root);
  if (q.pose && !POSES[q.pose]) warnings.push(`pose=${q.pose} is not a pose (${Object.keys(POSES).join(', ')})`);
  const pose = POSES[q.pose] || POSES.stand;
  const ctx = { ...pose, lookRel: 0, windRel: num(q.windRel, 0), windStrength: num(q.wind, 0.85) }; // lookRel: no idle glances
  const air = pose.grounded === false ? 0.45 : 0; // held off the floor so a jump reads as one
  return {
    group: ex.root, ground: 'floor', warnings, explorer: ex,
    look: { y: 0.95 },
    face: { y: 1.63, span: 1.15 },
    update(dt, t) { ex.root.position.y = air; ex.update(dt, t, ctx); },
    freeze(phase) { ex.gait = phase; ex.update(1e-4, 0, ctx); },
    dispose() { ex.dispose(); },
  };
}

// ----------------------------------------------------------------- the ship
// `tier` sets every upgrade at once; a key of its own (`hull=5`) overrides it.
// `canvas` is how much sail is up (0 furled, 1 reefed, 2 full), `anchor` the
// refit tier (0-4, or `none`), `livery=redwing` is Sable's ship, `crew=0`
// hides the explorer, and the outfit parameters dress them. The paint yard's
// choices (paints.js) each have a parameter of their own (PAINT_PARAMS):
// `hullPaint=harborBlue&cloth=striped&emblem=owl&figurehead=mermaid`.
function ship(q, stage) {
  const warnings = [];
  const redwing = q.livery === 'redwing';
  if (q.livery && !redwing) warnings.push(`livery=${q.livery} is not a livery (redwing)`);
  const painted = {};
  for (const [key, part] of Object.entries(PAINT_PARAMS)) {
    if (!q[key]) continue;
    const kind = LIVERY_PARTS.find((p) => p.id === part).kind;
    if (paintInfo(kind, q[key])) painted[part] = q[key];
    else warnings.push(`${key}=${q[key]} is not a ${kind} (${paintsOf(kind).map((p) => p.id).join(', ')})`);
  }
  const livery = redwing ? SABLE_LIVERY : liveryFor(painted);
  const boat = new Boat(stage, redwing ? { npc: true, profile: SABLE_PROFILE, livery } : { livery });
  if (!redwing) boat.explorer.setAppearance(profileFrom(q, warnings));
  const tier = clamp(int(q.tier, 0), 0, MAX_TIER);
  const levels = {};
  for (const U of UPGRADES) levels[U.key] = clamp(int(q[U.key], tier), 0, MAX_TIER);
  const values = Object.fromEntries(UPGRADES.map((U) => [U.key, upgradeValue(levels, U.key)]));
  boat.applyUpgrades(levels, values);
  if (q.anchor === 'none') boat.setAnchor('none');
  else { boat.setAnchorTier(clamp(int(q.anchor, 0), 0, 4)); boat.setAnchor(q.anchor === 'down' ? 'down' : 'stowed'); }
  boat.setCharacterVisible(q.crew !== '0');
  boat.place(0, 0, 0);
  boat.lookYaw = 0; // eyes ahead: no idle glances
  boat.sailLevel = clamp(int(q.canvas, 2), 0, 2);
  boat.sailVis = [0.06, 0.55, 1][boat.sailLevel]; // already set, not easing up
  const wind = { angle: 0, strength: num(q.wind, 0.85) };
  const ex = boat.explorer.root.position;
  return {
    group: boat.group, ground: 'sea', warnings, boat,
    look: { y: 3.5 },
    helm: { x: ex.x, y: ex.y + 1.1, z: ex.z, span: 3.2 },
    bow: { x: 0.8 * boat.sizeScale, y: 0.75 * boat.sizeScale, z: 2.7 * boat.sizeScale, span: 4.6 * boat.sizeScale },
    stem: { y: 0.95 * boat.sizeScale, z: 4.0 * boat.sizeScale, span: 2.4 * boat.sizeScale },
    masthead: { y: (boat.mastTop.y - 0.8) * boat.sizeScale, z: (0.9 + 1.3) * boat.sizeScale, span: 4.2 * boat.sizeScale },
    update(dt, t, env) {
      // a steady beam reach: the wind over the port side, sails drawing
      boat.relWind = num(q.windRel, 1.8);
      boat.efficiency = pointOfSail(boat.relWind);
      boat.wakeMat.uniforms.uLight.value.copy(env.light);
      boat.animate(dt, t, wind, 1, env.night, values);
    },
    dispose() { boat.dispose(); },
  };
}

// --------------------------------------------------------------- still life
/** One mesh and its ink outline from a list of parts, the way levels are built. */
function inkedParts(parts) {
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, thinOutline));
  return { group: g, geo };
}

function prop(q, stage) {
  initProps();
  const warnings = [];
  let id = q.id || 'palm';
  if (!PROPS[id]) { warnings.push(`id=${id} is not a prop (${Object.keys(PROPS).join(', ')})`); id = 'palm'; }
  const group = propMesh(id);
  stage.add(group);
  return { group, ground: 'floor', warnings, dispose() {} };
}

function tree(q, stage) {
  initProps();
  const T = buildElderTree({ ground: () => 0, glowMap: glowTexture() });
  stage.add(T.group);
  return {
    group: T.group, ground: 'floor', warnings: [],
    update(dt, t, env) { T.update(t, env.night); },
    dispose() { T.group.traverse((o) => o.geometry?.dispose()); },
  };
}

function wreck(q, stage) {
  initProps();
  const M = buildWreckModel({ sea: q.sea !== '0' });
  stage.add(M.group);
  return { group: M.group, ground: 'sea', warnings: [], dispose() { M.group.traverse((o) => o.geometry?.dispose()); } };
}

/** The nth piece of a kind, moved so it stands at the origin with its foot on the floor. */
function onePiece(pieces, q, build, warnings) {
  const kinds = [...new Set(pieces.map((p) => p.kind))];
  let kind = q.kind;
  if (!kinds.includes(kind)) { warnings.push(`kind=${kind} is not a piece here (${kinds.join(', ')})`); kind = kinds[0]; }
  const all = pieces.filter((p) => p.kind === kind);
  const n = clamp(int(q.n, 0), 0, all.length - 1);
  const p = all[n];
  const made = inkedParts(build(p, pieces.indexOf(p)));
  made.geo.computeBoundingBox();
  made.group.position.set(-p.cx, -made.geo.boundingBox.min.y, -p.cz);
  const holder = new THREE.Group();
  holder.add(made.group);
  holder.userData.note = `${kind} ${n + 1} of ${all.length}`;
  return { holder, geo: made.geo };
}

// The Elder Grove: the whole level, or `kind=fungus&n=2` for one of its pieces.
function grove(q, stage) {
  initProps();
  const warnings = [];
  if (q.kind) {
    const L = buildGroveLayout();
    const { holder, geo } = onePiece(L.pieces, q, (p, i) => pieceArt(p, i, false), warnings);
    stage.add(holder);
    return { group: holder, ground: 'floor', warnings, note: holder.userData.note, dispose() { geo.dispose(); } };
  }
  const level = buildGroveLevel({ name: 'Elder Grove' }, { quality: 'high' });
  stage.add(level.group);
  const pos = { x: 0, y: 0, z: 0 };
  return {
    group: level.group, ground: 'sea', warnings, shoal: shoalOf(level), calm: level.calm,
    update(dt, t, env) { level.update(dt, t, { pos, night: env.night, play: () => {} }); },
    dispose() { level.dispose(); },
  };
}

// Archway Isle: the whole level, or `kind=ledge&n=2` for one of its pieces.
// `at` picks a place for the `spot` view (the story's places, close up), and
// `journal=0` shows the keystone after Journal IV has been taken.
function archway(q, stage) {
  initProps();
  const warnings = [];
  const L = buildArchwayLayout();
  if (q.kind) {
    const { holder, geo } = onePiece(L.pieces, q, (p, i) => archwayPieceArt(p, i), warnings);
    stage.add(holder);
    return { group: holder, ground: 'floor', warnings, note: holder.userData.note, dispose() { geo.dispose(); } };
  }
  const level = buildArchwayLevel({ name: 'Archway Isle' }, { quality: 'high' });
  level.syncStory({ journal: q.journal !== '0' });
  stage.add(level.group);
  const lamp = L.checkpoints.find((c) => c.id === 'keystone');
  const PLACES = {
    // as you come to it along the arch's back, from the shoulder
    keystone: { ...L.spots.journal, span: 4.5, yaw: -Math.PI / 2, pitch: 0.75 },
    lantern: { x: lamp.x, y: lamp.y + 1.3, z: lamp.z, span: 4, yaw: -0.9, pitch: 0.2 },
    cove: { x: L.camp.x, y: L.camp.y + 1.1, z: L.camp.z, span: 5 },
    cave: { x: L.vault.x, y: L.vault.y + 1.5, z: L.vault.z, span: 9 },
    stack: { x: L.chests[0].x, y: L.chests[0].y + 0.8, z: L.chests[0].z, span: 9 },
    arch: { x: 0, y: L.summit.y - 4, z: L.summit.z, span: 48 },
  };
  let at = q.at || 'keystone';
  if (!PLACES[at]) { warnings.push(`at=${at} is not a place here (${Object.keys(PLACES).join(', ')})`); at = 'keystone'; }
  const pos = { x: 0, y: 0, z: 0 };
  return {
    group: level.group, ground: 'sea', warnings, shoal: shoalOf(level), calm: level.calm, spot: PLACES[at], note: q.at ? at : undefined,
    update(dt, t, env) { level.update(dt, t, { pos, night: env.night, play: () => {} }); },
    dispose() { level.dispose(); },
  };
}
const ARCHWAY_PLACES = ['keystone', 'lantern', 'cove', 'cave', 'stack', 'arch'];

// The Sunken Temple: the whole level, or `kind=capital&n=2` for one of its
// pieces. `at` picks a place for the `spot` view, and `journal=0` shows the
// treasury after Journal V has been taken.
function ruins(q, stage) {
  initProps();
  const warnings = [];
  const L = buildTempleLayout();
  if (q.kind) {
    const { holder, geo } = onePiece(L.pieces, q, (p, i) => templePieceArt(p, i), warnings);
    stage.add(holder);
    return { group: holder, ground: 'floor', warnings, note: holder.userData.note, dispose() { geo.dispose(); } };
  }
  const level = buildTempleLevel({ name: 'Sunken Temple Isle' }, { quality: 'high' });
  level.syncStory({ journal: q.journal !== '0' });
  stage.add(level.group);
  const lamp = (id) => L.checkpoints.find((c) => c.id === id);
  const PLACES = {
    beach: { x: L.camp.x - 2, y: L.camp.y + 1.2, z: L.camp.z - 2, span: 9 },
    causeway: { x: L.slabs[2].cx, y: 0.5, z: L.slabs[2].cz, span: 16 },
    colonnade: { x: 0, y: 6, z: -32, span: 34 },
    portico: { x: 0, y: 11, z: 4, span: 24 },
    stair: { x: 0, y: 7, z: -1.5, span: 15, yaw: Math.PI + 0.55, pitch: 0.3 },   // the top of the front stair, from out over the water
    hall: { x: 0, y: 1, z: 23, span: 24, yaw: Math.PI + 0.35, pitch: 1.15 },
    treasury: { x: L.crate.x + 0.6, y: L.crate.y + 1, z: L.crate.z + 0.6, span: 6, yaw: Math.PI, pitch: 0.35 },
    gable: { x: L.chests[0].x, y: L.chests[0].y + 0.8, z: L.chests[0].z, span: 8 },
    shrine: { x: L.vault.x, y: L.vault.y + 1.5, z: L.vault.z, span: 9, yaw: -Math.PI / 2 - 0.3, pitch: 0.3 },   // from the water, into its open front
    breach: { x: 10.5, y: 2.6, z: L.breach.z, span: 13, yaw: Math.PI / 2 + 0.4, pitch: 0.25 },   // from the beach outside
    lantern: { ...lamp('colonnade'), y: lamp('colonnade').y + 1.3, span: 5 },
    // the whole temple: from above the beach, and from the sea as the rowboat comes in
    overview: { x: 4, y: 2, z: -12, span: 105, yaw: 0.9, pitch: 0.8 },
    sea: { x: 4, y: 6, z: -18, span: 72, yaw: Math.PI + 0.55, pitch: 0.3 },
  };
  let at = q.at || 'treasury';
  if (!PLACES[at]) { warnings.push(`at=${at} is not a place here (${Object.keys(PLACES).join(', ')})`); at = 'treasury'; }
  const pos = { x: 0, y: 5, z: -200 };
  return {
    group: level.group, ground: 'sea', warnings, shoal: { x: 0, z: 0, r: L.bounds.r * 0.94, fade: 300 }, calm: L.calm, spot: PLACES[at], note: q.at ? at : undefined,
    update(dt, t, env) { level.update(dt, t, { pos, night: env.night, play: () => {} }); },
    dispose() { level.dispose(); },
  };
}
const TEMPLE_PLACES = ['overview', 'sea', 'beach', 'causeway', 'colonnade', 'stair', 'portico', 'hall', 'treasury', 'gable', 'shrine', 'breach', 'lantern'];

// The great arch as seen from the sea (sea-arch.js). The `spot` view is the
// storm lantern on its keystone.
function arch(q, stage) {
  initProps();
  const A = buildSeaArch({ world: (x, z) => [x, z], glowMap: glowTexture() });
  stage.add(A.group);
  return {
    group: A.group, ground: 'sea', warnings: [], spot: { x: 0.8, y: ARCH.crown + 5, z: -3.4, span: 9 },
    update(dt, t, env) { A.update(t, env.night); },
    dispose() {}, // its geometry is shared with the game's own arch
  };
}

// The Sunken Temple as seen from the sea (sea-temple.js), on a sand mound that
// stands in for the island. `at` picks a close look for the `spot` view.
const TEMPLE_SEA_PLACES = ['portico', 'colonnade', 'steps', 'face', 'hall'];
function temple(q, stage) {
  initProps();
  const warnings = [], deck = 14;
  const M = buildSeaTemple({ deck, glowMap: glowTexture() });
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12), new THREE.MeshLambertMaterial({ color: '#e8d6a6' }));
  mound.scale.set(150, deck + 4, 130);
  mound.position.set(0, -6, 95);
  M.group.add(mound);
  stage.add(M.group);
  const H = TEMPLE_SEA.hall;
  const PLACES = {
    portico: { x: 0, y: deck + 22, z: TEMPLE_SEA.porticoZ, span: 70, yaw: Math.PI + 0.4, pitch: 0.25 },
    colonnade: { x: 0, y: 10, z: -75, span: 120, yaw: Math.PI + 0.3, pitch: 0.2 },
    steps: { x: 0, y: deck / 2, z: -14, span: 64, yaw: Math.PI + 1.0, pitch: 0.22 },
    face: { x: -33, y: 0, z: -58, span: 22, yaw: Math.PI - 0.6, pitch: 0.5 },
    hall: { x: 0, y: deck, z: (H.z0 + H.z1) / 2, span: 80, yaw: Math.PI + 0.2, pitch: 0.9 },
  };
  let at = q.at || 'portico';
  if (!PLACES[at]) { warnings.push(`at=${at} is not a place here (${Object.keys(PLACES).join(', ')})`); at = 'portico'; }
  return {
    group: M.group, ground: 'sea', warnings, spot: PLACES[at], note: q.at ? at : undefined,
    update(dt, t, env) { M.update(t, env.night, null); },
    dispose() { M.group.traverse((o) => o.geometry?.dispose()); mound.material.dispose(); },
  };
}

// The living sea (sea-life.js, sea-wonders.js, sea-ambient.js, ghost-ship.js):
// `kind` picks one. The animals stand on the floor, whole, so the parts the sea
// hides in the game can be checked; the ghost ship, the iceberg and the
// waterspout stand in the sea, as they do there. (The glowing bloom is drawn
// by the ocean itself, so it can only be looked at in the game.)
const SEALIFE = ['whale', 'dolphin', 'turtle', 'gull', 'fish', 'bottle', 'berg', 'spout', 'ghost'];
function sealife(q, stage) {
  initProps();
  const warnings = [];
  let kind = q.kind || 'whale';
  if (!SEALIFE.includes(kind)) { warnings.push(`kind=${kind} is not sea life (${SEALIFE.join(', ')})`); kind = 'whale'; }
  if (kind === 'ghost') {
    const G = buildGhostShip();
    G.setFade(1);
    stage.add(G.group);
    return {
      group: G.group, ground: 'sea', warnings, look: { y: 8 },
      update(dt, t) { G.setFade(1, t); },
      dispose() { G.group.traverse((o) => o.material?.dispose()); }, // her geometry is shared with the game's
    };
  }
  if (kind === 'dolphin' || kind === 'turtle' || kind === 'fish') {
    const D = kind === 'dolphin' ? buildDolphin() : kind === 'turtle' ? buildTurtle() : buildFish();
    D.position.y = kind === 'fish' ? 0.2 : 0.5;
    stage.add(D);
    return { group: D, ground: 'floor', warnings, look: { y: D.position.y }, dispose() {} }; // shared geometry
  }
  if (kind === 'gull') {
    const G = buildGull();
    G.group.position.y = 1;
    stage.add(G.group);
    return {
      group: G.group, ground: 'floor', warnings, look: { y: 1 },
      update(dt, t) { const a = Math.sin(t * 5) * 0.45; G.wings[0].rotation.z = a; G.wings[1].rotation.z = -a; },
      dispose() {},
    };
  }
  if (kind === 'bottle') {
    const B = buildBottle();
    B.tilt.rotation.z = 0.95;
    B.group.position.y = 0.6;
    B.glint.scale.setScalar(1.6);
    stage.add(B.group);
    return { group: B.group, ground: 'floor', warnings, look: { y: 0.6 }, dispose() { B.glint.material.dispose(); } };
  }
  if (kind === 'berg' || kind === 'spout') {
    const M = kind === 'berg' ? buildIceberg() : buildWaterspout();
    stage.add(M.group);
    return {
      group: M.group, ground: 'sea', warnings, look: { y: kind === 'berg' ? 6 : 30 },
      update(dt) { if (M.funnel) M.funnel.rotation.y -= dt * 3.4; },
      dispose() { M.group.traverse((o) => o.geometry?.dispose()); },
    };
  }
  const W = buildWhale();
  W.group.position.y = -new THREE.Box3().setFromObject(W.group).min.y + 0.1; // belly on the floor, whatever her size
  stage.add(W.group);
  return {
    group: W.group, ground: 'floor', warnings, look: { y: W.group.position.y },
    update(dt, t) { W.tail.rotation.x = Math.sin(t * 1.5) * 0.22; },
    dispose() { W.group.traverse((o) => o.geometry?.dispose()); },
  };
}

// A generated island level: `biome`, `seed`, `r` (island radius) and `dist`
// (metres from Port Haven, which sets how hard it is). With `kind=arch&n=0`,
// one of its pieces on its own.
function level(q, stage) {
  initProps();
  const warnings = [];
  const dist = num(q.dist, 2500);
  const I = { id: 1, name: 'gallery', seed: int(q.seed, 4401), x: dist, z: 0, r: num(q.r, 120), biome: q.biome || 'temperate', landmark: null };
  const opts = { quality: 'high', landingAngle: Math.PI / 2 };
  if (q.kind) {
    const L = layoutLevel(I, opts);
    const { holder, geo } = onePiece(L.pieces, q, (p) => pieceParts(p), warnings);
    stage.add(holder);
    return { group: holder, ground: 'floor', warnings, note: holder.userData.note, dispose() { geo.dispose(); } };
  }
  const lv = generateLevel(I, opts);
  stage.add(lv.group);
  const PLACES = levelPlaces(lv.layout);
  let at = q.at || 'cliff';
  if (!PLACES[at]) { warnings.push(`at=${at} is not a place here (${Object.keys(PLACES).join(', ')})`); at = Object.keys(PLACES)[0]; }
  return { group: lv.group, ground: 'sea', warnings, shoal: shoalOf(lv), calm: lv.calm, spot: PLACES[at], note: `${lv.layout.biome}, ${lv.layout.tier}${q.at ? ', ' + at : ''}`,
    // (a volcanic island's lava flows and bubbles, and its vents steam)
    update: lv.update ? (dt, t, env) => lv.update(dt, t, { night: env.night }) : undefined, dispose() { lv.dispose(); } };
}

/**
 * Close-ups of a generated level for the `spot` view, each looked at from
 * outside the island: the moat crossing, the start of the climbs up cliff 1
 * and the mesa, the chest's branch, and the top (on a volcano, the crater
 * and the outcrop over it).
 */
function levelPlaces(L) {
  const main = L.pieces.filter((p) => p.route === 'main' && p.kind !== 'vista');
  const out = {};
  const around = (ps, pad) => {
    if (!ps.length) return null;
    const x = ps.reduce((s, p) => s + p.cx, 0) / ps.length, z = ps.reduce((s, p) => s + p.cz, 0) / ps.length;
    const y = ps.reduce((s, p) => s + p.top, 0) / ps.length;
    const span = Math.max(...ps.map((p) => Math.hypot(p.cx - x, p.cz - z) + (p.r || p.hx))) * 2 + pad;
    const a = Math.atan2(z, x);
    return { x, y: y + 0.5, z, span, yaw: Math.atan2(Math.cos(a), Math.sin(a)), pitch: 0.35 };
  };
  out.moat = around(main.filter((p) => p.base === -2.4), 3);
  const climb = main.filter((p) => p.base !== -2.4);
  out.cliff = around(climb.filter((p) => p.top <= L.T.h1 + 0.1).slice(0, 4), 3);
  out.mesa = around(climb.filter((p) => p.top > L.T.h1 + 0.1).slice(0, 4), 3);
  const chest = L.branches.find((b) => b.name === 'chest');
  if (chest) out.chest = { ...around(chest.nodes.filter((n) => n.piece).map((n) => n.piece), 4), y: (chest.tree.base + chest.tree.top) / 2 };
  { const a = Math.atan2(L.summit.z, L.summit.x) + 0.8; out.top = { x: 0, y: L.summit.y - 1, z: 0, span: L.T.S2 * 2.2, yaw: Math.atan2(Math.cos(a), Math.sin(a)), pitch: 0.7 }; }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

export const SUBJECTS = { outfit, ship, prop, tree, arch, temple, wreck, grove, archway, ruins, level, sealife };

// Every parameter a subject reads, so a misspelt one is reported instead of ignored.
const DRESS = [...SLOTS, ...SLOTS.map((s) => s + 'Color'), 'shirt', 'skin', 'head', 'eyeColor', 'eyeShape', 'blush', 'freckles', 'profile'];
const PARAMS = {
  outfit: [...DRESS, 'pose', 'phase', 'wind', 'windRel'],
  ship: [...DRESS, ...UPGRADES.map((U) => U.key), 'tier', 'canvas', 'anchor', 'livery', 'crew', 'wind', 'windRel', ...Object.keys(PAINT_PARAMS)],
  prop: ['id'],
  tree: [],
  wreck: ['sea'],
  grove: ['kind', 'n'],
  arch: [],
  temple: ['at'],
  archway: ['kind', 'n', 'at', 'journal'],
  ruins: ['kind', 'n', 'at', 'journal'],
  level: ['biome', 'seed', 'r', 'dist', 'kind', 'n', 'at'],
  sealife: ['kind'],
};
/** The keys in `q` that the subject `show` doesn't read (`also`: the page's own parameters). */
export function unknownParams(show, q, also) {
  const known = new Set(['show', ...(PARAMS[show] || []), ...also]);
  return Object.keys(q).filter((k) => !known.has(k));
}

const PIECE_KINDS = ['block', 'bridge', 'column', 'disc', 'ledge', 'vista', 'plank', 'stone', 'stack', 'arch', 'log', 'palm', 'pool', 'rope', 'basalt', 'vent', 'shelf'];
const TIERS = ['0', '1', '2', '3', '4', '5'];
/** The parameters a subject takes, as [key, choices] pairs, for the page's menus. */
export function controlsFor(show) {
  const styles = (slot) => STYLES.filter((s) => s.slot === slot).map((s) => s.style);
  const dress = SLOTS.map((slot) => [slot, styles(slot)]);
  switch (show) {
    case 'outfit': return [...dress, ['pose', Object.keys(POSES)], ['profile', ['sable']]];
    case 'ship': return [['tier', TIERS], ['canvas', ['0', '1', '2']], ['anchor', ['none', '0', '1', '2', '3', '4', 'down']], ['livery', ['redwing']], ['crew', ['0']],
      ...Object.entries(PAINT_PARAMS).map(([key, part]) => [key, paintsOf(LIVERY_PARTS.find((p) => p.id === part).kind).map((p) => p.id)])];
    case 'prop': return [['id', Object.keys(initProps())]];
    case 'grove': return [['kind', [...new Set(buildGroveLayout().pieces.map((p) => p.kind))]], ['n', TIERS]];
    case 'archway': return [['at', ARCHWAY_PLACES], ['journal', ['0']], ['kind', [...new Set(buildArchwayLayout().pieces.map((p) => p.kind))]], ['n', TIERS]];
    case 'temple': return [['at', TEMPLE_SEA_PLACES]];
    case 'ruins': return [['at', TEMPLE_PLACES], ['journal', ['0']], ['kind', [...new Set(buildTempleLayout().pieces.map((p) => p.kind))]], ['n', TIERS]];
    case 'level': return [['biome', [...ASHORE_BIOMES]], ['kind', PIECE_KINDS], ['n', TIERS], ['seed', ['4401', '1121', '77', '31337']]];
    case 'sealife': return [['kind', SEALIFE]];
    default: return [];
  }
}
