// Going ashore: drop anchor beside an island and explore it on foot as a
// separate 3D level. This module owns the whole visit: entering and leaving
// (with a fade), the island scene (which borrows the sea's sky, sun, clouds,
// ocean and weather so time of day and weather carry over), the explorer on
// foot, pickups, lantern checkpoints, splash respawns and per-island saves.
//
// state.ashore[islandId] = { visited, coins: [id], caches: [id], chest: bool }
// Quest items (retrieve quests) wait at the level's vault; their state lives
// in the quest, not here.
import * as THREE from 'three';
import { toonMaterial, glowBoost } from '../toon.js';
import { ASHORE } from '../config.js';
import { edgeFactor } from '../world.js';
import { propMesh, part, merge, propMaterial, thinOutline } from '../props.js';
import { STYLES, owns } from '../cosmetics.js';
import { siteBeam, MAP_FRAGMENT } from '../quests.js';
import { generateLevel } from './levelgen.js';
import { buildWreckLevel } from './wreck.js';
import { CharacterController } from './controller.js';
import { FollowCamera } from './camera.js';
import { LandRace } from './pacer.js';

const LAND_BIOMES = new Set(['temperate']); // Phase 3: temperate islands only
const LAND_RANGE = 46;                       // how close to the shore the boat must be
const LAND_SPEED = 5;                        // boat speed (m/s) below which you can land

// ------------------------------------------------------------- pickup art
let coinGeo = null, pileGeo = null, postGeo = null, handGeo = null, bundleGeo = null, scrollGeo = null;
const handGlow = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
const coinMat = toonMaterial({ color: '#ffd54a', emissive: '#6a4a00', emissiveIntensity: 0.35 });
const glowOff = new THREE.MeshBasicMaterial({ color: '#6b5a3a' });
const glowOn = new THREE.MeshBasicMaterial({ color: '#ffe8a0' });
function pickupGeometry() {
  if (coinGeo) return;
  coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 14).rotateX(Math.PI / 2);
  const P = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.3, r = i < 5 ? 0.32 : 0.16;
    P.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), i % 2 ? '#ffd54a' : '#f0b43c', { x: Math.cos(a) * r, y: 0.04 + Math.floor(i / 3) * 0.07, z: Math.sin(a) * r, rx: (i % 3) * 0.2 }));
  }
  P.push(part(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e8b33a', { y: 0, sy: 0.55 }));
  pileGeo = merge(P);
  // a little brass lantern that hangs at the explorer's hip ashore
  handGeo = merge([
    part(new THREE.BoxGeometry(0.16, 0.03, 0.16), '#7a5426', { y: 0.0 }),
    part(new THREE.BoxGeometry(0.16, 0.03, 0.16), '#7a5426', { y: 0.2 }),
    part(new THREE.ConeGeometry(0.12, 0.08, 4), '#7a5426', { y: 0.25, ry: Math.PI / 4 }),
    part(new THREE.TorusGeometry(0.05, 0.012, 4, 8), '#c9a44a', { y: 0.32 }),
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => part(new THREE.BoxGeometry(0.02, 0.2, 0.02), '#7a5426', { x: a * 0.07, y: 0.1, z: b * 0.07 })),
  ]);
  // quest items: a cloth bundle tied with twine, and a rolled chart with a ribbon
  bundleGeo = merge([
    part(new THREE.BoxGeometry(0.62, 0.42, 0.5), '#cdb68a', { y: 0.21 }),
    part(new THREE.BoxGeometry(0.66, 0.06, 0.08), '#7a5426', { y: 0.3 }),
    part(new THREE.BoxGeometry(0.08, 0.46, 0.54), '#7a5426', { y: 0.21 }),
    part(new THREE.SphereGeometry(0.08, 8, 6), '#7a5426', { y: 0.44 }),
    part(new THREE.ConeGeometry(0.1, 0.2, 5), '#b9a072', { y: 0.5, x: 0.07, rz: -0.7 }),
    part(new THREE.ConeGeometry(0.1, 0.2, 5), '#b9a072', { y: 0.5, x: -0.07, rz: 0.7 }),
  ]);
  scrollGeo = merge([
    part(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 12), '#efe3c4', { rz: Math.PI / 2, y: 0.14 }),
    part(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 12), '#d9c8a0', { rz: Math.PI / 2, y: 0.14, x: 0.34 }),
    part(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 12), '#d9c8a0', { rz: Math.PI / 2, y: 0.14, x: -0.34 }),
    part(new THREE.TorusGeometry(0.135, 0.03, 6, 14), '#c8322b', { ry: Math.PI / 2, y: 0.14 }),
    part(new THREE.BoxGeometry(0.05, 0.16, 0.03), '#c8322b', { y: -0.01, z: 0.05, rx: 0.3 }),
  ]);
  postGeo = merge([
    part(new THREE.CylinderGeometry(0.08, 0.1, 2.0, 6), '#5b3c22', { y: 1.0 }),
    part(new THREE.BoxGeometry(0.5, 0.06, 0.08), '#5b3c22', { y: 1.95, x: 0.2 }),
    part(new THREE.BoxGeometry(0.26, 0.06, 0.26), '#3b2614', { y: 1.62, x: 0.42 }),
    part(new THREE.ConeGeometry(0.2, 0.16, 4), '#3b2614', { y: 2.0, x: 0.42, ry: Math.PI / 4 }),
  ]);
}

export class Ashore {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.active = false;
    this.island = null;
    this._v = new THREE.Vector3();
  }

  // ----------------------------------------------------------- at sea
  /** Islands you can explore on foot (given an anchor): not ports, reefs or the wreck. */
  canLand(I) { return !I.isReef && !I.port && !I.wreck && LAND_BIOMES.has(I.biome); }

  /** The island the boat could land on from here, or null. */
  landingIsland(x, z) {
    for (const I of this.game.world.near(x, z)) {
      if (I.isReef || I.port) continue;
      const a = Math.atan2(z - I.z, x - I.x);
      const shore = I.r * edgeFactor(I, a);
      const d = Math.hypot(x - I.x, z - I.z);
      if (d > shore - 5 && d < shore + LAND_RANGE) return I;
    }
    return null;
  }

  /** The sailing prompt near a coast: land, or a hint about what's missing. */
  interaction(boat) {
    const I = this.landingIsland(boat.pos.x, boat.pos.z);
    if (!I) return null;
    const story = this.game.story, slow = Math.abs(boat.speed) < LAND_SPEED;
    // hints only when you've slowed by the shore, so passing islands stays quiet
    if (!story?.canGoAshore) return slow ? { prompt: "You'll need an anchor to go ashore" } : null;
    if (!LAND_BIOMES.has(I.biome)) return slow ? { prompt: `${I.name} is too treacherous to land on (yet)` } : null;
    if (!slow) return { prompt: 'Slow down to drop anchor' };
    // the rival captain may be waiting here for a race on foot
    const sable = this.game.rival?.landEncounter(I);
    return { prompt: sable ? `Drop anchor & go ashore: Sable is waiting on ${I.name}` : `Drop anchor & go ashore on ${I.name}`, action: () => this.enter(I) };
  }

  /** Climb aboard grandfather's wreck (no anchor needed: you tie up alongside). */
  enterWreck() {
    const W = this.game.world.wreck;
    return W ? this.enter(W) : Promise.resolve();
  }

  progress(I) {
    const A = this.game.state.ashore || (this.game.state.ashore = {});
    return (A[I.id] ||= { visited: false, coins: [], caches: [], chest: false });
  }

  // ------------------------------------------------------------- arrive
  async enter(I) {
    const g = this.game;
    if (this.active || g.mode !== 'sailing') return;
    g.boat.speed = 0; g.boat.sailLevel = 0;
    g.saveVoyage(); // the voyage remembers the anchored boat (saved while still 'sailing')
    g.mode = 'landing';
    g.ui.setPrompt(null);
    g.syncAnchor();
    g.audio.play('dock');
    await g.ui.fade(1, 0.6);

    this.island = I;
    // the rowboat is drawn up on the beach facing the anchored ship
    const landingAngle = Math.atan2(g.boat.pos.z - I.z, g.boat.pos.x - I.x);
    this.level = I.wreck ? buildWreckLevel(I, { quality: g.settings.quality })
      : generateLevel(I, { quality: g.settings.quality, landingAngle });
    this.syncStory();
    this.hintsShown = new Set();
    const calm = this.level.calm;
    g.ocean.uniforms.uCalm.value.set(calm?.x || 0, calm?.z || 0, calm?.r || 0);
    this.scene.add(this.level.group);
    this.buildPickups();
    this.borrowSky(true);

    const L = this.level, ex = g.boat.explorer;
    this.scene.add(ex.root);
    ex.setPose('ground');
    ex.root.position.set(L.spawn.x, L.spawn.y, L.spawn.z);
    ex.root.rotation.set(0, L.spawn.yaw, 0);
    this.ctl = new CharacterController(L, ASHORE);
    this.ctl.teleport(L.spawn.x, L.spawn.y, L.spawn.z, L.spawn.yaw);
    this.cam = new FollowCamera(g.camera, L);
    this.cam.snap(this.ctl, L.spawn.yaw);
    this.checkpoint = { x: L.spawn.x, y: L.spawn.y, z: L.spawn.z, yaw: L.spawn.yaw };
    // a land race, if the rival is waiting on this island (never aboard the wreck)
    const enc = !I.wreck && L.layout ? g.rival?.landEncounter(I) : null;
    this.race = enc ? new LandRace(this, L, enc) : null;
    this.trip = 0;
    this.prompt = null;
    this.splashT = 0;

    this.addHandLantern(ex);
    const P = this.progress(I);
    const first = !P.visited;
    P.visited = true;
    g.input.setScheme('land');
    g.setView({ scene: this.scene, camera: g.camera });
    g.mode = 'ashore';
    g.syncAnchor();
    document.body.classList.add('ashore');
    this.active = true;
    g.ui.setAshore(I.name, 0, this.remaining());
    g.saveVoyage();
    g.events.emit('ashore:enter', I);
    // let a frame render before fading in so the camera is placed
    this.update(0.016, { jump: 0, action: 0 });
    await g.ui.fade(0, 0.6);
    const flags = g.state.story.flags;
    if (I.wreck) {
      // the wreck is the walking tutorial; returning visitors don't need it again
      if (!flags.wreckWalked) g.ui.toast(g.ui.touch ? "Drag the stick to walk. Climb aboard and find grandfather's cabin at the stern!" : "WASD or the arrow keys to walk, Shift to run. Climb aboard and find grandfather's cabin at the stern!", 'info');
    } else if (first && !flags.ashoreTutorial) {
      flags.ashoreTutorial = true;
      g.ui.toast(g.ui.touch ? 'Drag the stick to walk, tap ▲ to jump. Find your way to the top!' : 'WASD to walk, Shift to run, Space to jump. Find your way to the top!', 'info');
    }
  }

  // ---------------------------------------------------------------- leave
  async leave() {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    g.ui.setPrompt(null);
    g.events.emit('ashore:leave', this.island);
    await g.ui.fade(1, 0.5);
    this.borrowSky(false);
    g.ocean.uniforms.uCalm.value.set(0, 0, 0);
    const ex = g.boat.explorer;
    this.removeHandLantern(ex);
    g.boat.group.add(ex.root);
    ex.setPose('helm');
    this.clearPickups();
    this.race?.dispose(); // leaving mid-race just cancels it
    this.race = null;
    this.scene.remove(this.level.group);
    this.level.dispose();
    this.level = null; this.ctl = null; this.cam = null;
    document.body.classList.remove('ashore');
    g.ui.setAshore(null);
    g.input.setScheme('sea');
    g.setView(null);
    g.mode = 'sailing';
    g.applyUpgrades(); // explorer back at the helm, anchor stowed
    g.dockCooldown = 3;
    g.cam.yaw = g.boat.heading; g.cam.lastLook = -10;
    g.saveVoyage();
    if (this.trip > 0) g.ui.toast(`${this.trip} gold aboard from ${this.island.name}. Bank it at a port!`, 'gold');
    await g.ui.fade(0, 0.6);
  }

  /** Move the sky, sun, clouds, ocean and weather into (or back out of) the island scene. */
  borrowSky(on) {
    const g = this.game, to = on ? this.scene : g.scene;
    const objs = [g.env.sky, g.env.sun, g.env.sun.target, g.env.hemi, g.env.clouds, g.ocean.mesh,
      g.weather.rain, g.weather.streaks, g.weather.bolt].filter(Boolean);
    for (const o of objs) to.add(o);
    this.scene.fog = g.scene.fog;
  }

  // -------------------------------------------------------------- pickups
  buildPickups() {
    pickupGeometry();
    const L = this.level, P = this.progress(this.island);
    this.coins = L.coins.filter((c) => !P.coins.includes(c.id)).map((c) => ({ ...c, taken: false }));
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, Math.max(1, this.coins.length));
    this.coinMesh.count = this.coins.length;
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);
    this.caches = L.caches.filter((c) => !P.caches.includes(c.id)).map((c) => {
      const m = new THREE.Group();
      m.add(new THREE.Mesh(pileGeo, propMaterial), new THREE.Mesh(pileGeo, thinOutline));
      m.position.set(c.x, c.y, c.z);
      this.scene.add(m);
      return { ...c, mesh: m };
    });
    this.chests = L.chests.filter(() => !P.chest).map((c) => {
      const m = propMesh('chest');
      m.position.set(c.x, c.y, c.z); m.rotation.y = c.yaw || 0; m.scale.setScalar(0.55);
      this.scene.add(m);
      return { ...c, mesh: m };
    });
    this.lanterns = L.checkpoints.map((c) => {
      const m = new THREE.Group();
      m.add(new THREE.Mesh(postGeo, propMaterial), new THREE.Mesh(postGeo, thinOutline));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), glowOff);
      glow.position.set(0.42, 1.78, 0);
      // every post glows a little at night to show the way; lit ones shine properly
      const light = new THREE.PointLight(0xffc878, 0, 16, 1.4);
      light.position.set(0.42, 1.7, 0);
      m.add(glow, light);
      m.position.set(c.x, c.y, c.z);
      this.scene.add(m);
      return { ...c, mesh: m, glow, light, lit: false };
    });
    // quest items wait at the vault, under a column of light you can see from below
    const V = L.vault, quests = this.game.quests;
    this.questItems = (V && quests ? quests.itemsOn(this.island.id) : []).map((q, i) => {
      const geo = q.item === MAP_FRAGMENT ? scrollGeo : bundleGeo;
      const m = new THREE.Group();
      const item = new THREE.Group();
      item.add(new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, thinOutline));
      item.scale.setScalar(1.25);
      const beam = siteBeam();
      beam.scale.set(0.3, 0.3, 0.3);
      beam.userData.shared = true; // the beam's geometry belongs to the salvage sites
      m.add(item, beam);
      const x = V.x + i * 1.1, z = V.z;
      m.position.set(x, V.y, z);
      this.scene.add(m);
      return { q, x, y: V.y, z, mesh: m, item };
    });
    this.owned = [this.coinMesh, ...this.caches.map((c) => c.mesh), ...this.chests.map((c) => c.mesh), ...this.lanterns.map((c) => c.mesh),
      ...this.questItems.map((c) => c.mesh)];
  }

  clearPickups() {
    for (const m of this.owned || []) {
      this.scene.remove(m);
      const shared = [coinGeo, pileGeo, postGeo, bundleGeo, scrollGeo];
      m.traverse((o) => { if (o.geometry && !shared.includes(o.geometry) && !o.isInstancedMesh && !o.userData.shared) o.geometry.dispose(); });
    }
    this.coinMesh?.dispose();
    this.owned = [];
  }

  remaining() {
    return { coins: (this.coins || []).filter((c) => !c.taken).length, chest: (this.chests || []).length > 0 };
  }

  // --------------------------------------------------------------- update
  update(dt, acts) {
    const g = this.game, ctl = this.ctl, L = this.level;
    if (!ctl) return;
    const t = g.elapsed;
    // stick / WASD relative to the camera: up = away from the camera
    const mv = g.input.move;
    const hold = !!this.race?.hold; // a race's countdown: stay on the start line
    const wish = hold ? { x: 0, z: 0 } : this.cam.toWorld(mv.x, mv.y);
    const ev = ctl.update(dt, { wishX: wish.x, wishZ: wish.z, run: g.input.run, jumpPressed: !hold && acts.jump > 0, jumpHeld: !hold && g.input.jumpHeld }) || {};

    // keep within the island
    const r = Math.hypot(ctl.pos.x, ctl.pos.z), R = L.bounds.r;
    if (r > R) { ctl.pos.x *= R / r; ctl.pos.z *= R / r; }

    if (ev.jumped) g.audio.play('sail', { volume: 0.4 });
    if (ev.landed > 6) { g.boat.explorer.land(Math.min(1, ev.landed / 18)); g.audio.play('slam', { volume: Math.min(0.5, ev.landed / 40) }); }
    if (ev.splashed && this.splashT <= 0) this.splash();
    this.splashT -= dt;

    // the explorer follows the controller
    const ex = g.boat.explorer;
    ex.root.position.set(ctl.pos.x, ctl.pos.y, ctl.pos.z);
    const lastYaw = this.lastYaw ?? ctl.yaw;
    ex.root.rotation.y = ctl.yaw;
    const turn = dt > 0 ? Math.atan2(Math.sin(ctl.yaw - lastYaw), Math.cos(ctl.yaw - lastYaw)) / dt : 0;
    this.lastYaw = ctl.yaw;
    const hs = Math.hypot(ctl.vel.x, ctl.vel.z);
    ex.update(dt, t, { footSpeed: hs, grounded: ctl.grounded, vy: ctl.vel.y, turn, windStrength: g.weather.windStrength * 0.6, windRel: Math.PI });
    this.race?.update(dt, t, acts);

    this.cam.update(dt, ctl, g.input.consumeLook(), hs > 0.3);
    this.updateLights(t);
    this.updatePickups(dt, t);
    this.updateHints();
    this.updatePrompt(acts);
  }

  /** One-time tips by place (the wreck teaches walking and jumping this way). */
  updateHints() {
    const L = this.level, g = this.game, p = this.ctl.pos, flags = g.state.story.flags;
    if (!L.hints || flags.wreckWalked) return; // reaching the cabin finishes the tutorial walk
    for (const h of L.hints) {
      if (this.hintsShown.has(h.id) || Math.hypot(h.x - p.x, h.z - p.z) > h.r) continue;
      if ((h.yMin != null && p.y < h.yMin) || (h.yMax != null && p.y > h.yMax)) continue;
      this.hintsShown.add(h.id);
      g.ui.toast(g.ui.touch ? h.touch : h.text, 'info');
      if (h.id === 'cabin') { flags.wreckWalked = true; g.saveVoyage(); }
    }
  }

  /** Show what's still waiting aboard the wreck (his journal, the chest). */
  syncStory() {
    const st = this.game.story;
    this.level?.syncStory?.({ journal: st ? !st.has('I') : false, chestOpen: st ? st.chapter >= 9 : false });
  }

  // --------------------------------------------------------------- lights
  addHandLantern(ex) {
    pickupGeometry();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(handGeo, propMaterial), new THREE.Mesh(handGeo, thinOutline));
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), handGlow);
    flame.position.y = 0.1;
    const light = new THREE.PointLight(0xffc878, 0, 16, 1.5);
    light.position.y = 0.12;
    g.add(flame, light);
    // at the left hip, just in front of the satchel (it rides on the pelvis)
    g.position.set(0.23, -0.06, 0.09);
    ex.pelvis.add(g);
    this.hand = { group: g, light, flame };
  }

  removeHandLantern(ex) {
    if (!this.hand) return;
    this.hand.group.removeFromParent();
    this.hand = null;
  }

  /** Lanterns fade in at dusk: the one you carry, and the posts along the route. */
  updateLights(t) {
    const night = this.game.env.night;
    const flick = 1 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23) * 0.03;
    if (this.hand) {
      this.hand.light.intensity = night * 7 * flick;
      this.hand.group.visible = night > 0.05;
      this.hand.group.rotation.x = Math.sin(t * 3.1) * 0.12 * Math.min(1, Math.hypot(this.ctl.vel.x, this.ctl.vel.z) / 3);
    }
    // follows the bloom boost, which the Effects switch changes at runtime
    if (this.glowBoost !== glowBoost.value) {
      this.glowBoost = glowBoost.value;
      glowOn.color.set('#ffe8a0').multiplyScalar(glowBoost.value);
    }
    for (const c of this.lanterns || []) {
      c.light.intensity = night * (c.lit ? 16 : 4) * flick;
      c.glow.material = c.lit || night > 0.3 ? glowOn : glowOff;
      c.glow.scale.setScalar(c.lit ? 1 : 0.7);
    }
  }

  updatePickups(dt, t) {
    const g = this.game, p = this.ctl.pos, P = this.progress(this.island);
    let changed = false;
    // coins spin and bob; walk through them to collect
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const c of this.coins) {
      if (c.taken) continue;
      if (Math.abs(c.x - p.x) < 0.75 && Math.abs(c.z - p.z) < 0.75 && c.y + 0.6 > p.y - 0.2 && c.y < p.y + ASHORE.height) {
        c.taken = true; P.coins.push(c.id); changed = true;
        g.state.cargo += c.value; this.trip += c.value;
        g.audio.play('coin', { volume: 0.5 });
        continue;
      }
      q.setFromAxisAngle(up, t * 2.4 + c.x);
      v.set(c.x, c.y + 0.55 + Math.sin(t * 2 + c.z) * 0.08, c.z);
      m.compose(v, q, s);
      this.coinMesh.setMatrixAt(n++, m);
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    // gold caches
    for (const c of this.caches) {
      if (c.taken || Math.hypot(c.x - p.x, c.z - p.z) > 1.1 || Math.abs(c.y - p.y) > 1.5) continue;
      c.taken = true; c.mesh.visible = false; P.caches.push(c.id); changed = true;
      g.state.cargo += c.value; this.trip += c.value;
      g.audio.play('treasure');
      g.ui.banner(`+${c.value} gold`, 'Gold cache!');
    }
    // quest items: bob and turn; walk into one to take it aboard
    for (const c of this.questItems) {
      if (c.taken) continue;
      c.item.position.y = 0.35 + Math.sin(t * 2) * 0.1;
      c.item.rotation.y = t * 0.8;
      if (Math.hypot(c.x - p.x, c.z - p.z) > 1.1 || Math.abs(c.y - p.y) > 1.6) continue;
      c.taken = true; c.mesh.visible = false; changed = true;
      g.quests.pickUp(c.q);
    }
    // lantern checkpoints light as you pass
    for (const c of this.lanterns) {
      if (c.lit || Math.hypot(c.x - p.x, c.z - p.z) > 2 || Math.abs(c.y - p.y) > 2) continue;
      c.lit = true; c.glow.material = glowOn;
      this.checkpoint = { x: c.x, y: c.y + 0.1, z: c.z, yaw: this.ctl.yaw };
      g.audio.play('click');
      g.ui.toast('Lantern lit: you\'ll return here if you fall in', 'info');
    }
    if (changed) {
      g.ui.setAshore(this.island.name, this.trip, this.remaining());
      this.saveT = 0.4; // batch saves
    }
    if (this.saveT > 0 && (this.saveT -= dt) <= 0) g.saveVoyage();
  }

  updatePrompt(acts) {
    const g = this.game, p = this.ctl.pos, L = this.level;
    let prompt = null, action = null;
    if (Math.hypot(L.exit.x - p.x, L.exit.z - p.z) < L.exit.r) { prompt = 'Row back to your ship'; action = () => this.leave(); }
    const near = (s) => s && Math.hypot(s.x - p.x, s.z - p.z) < s.r && Math.abs(s.y - p.y) < 1.2;
    const st = g.story;
    if (L.spots && st) {
      if (near(L.spots.table)) {
        if (!st.has('I')) { prompt = 'Search the chart table'; action = () => { st.findJournal('I'); this.syncStory(); }; }
        else { prompt = "Read grandfather's first journal"; action = () => g.ui.openJournal('story', 'I'); }
      } else if (near(L.spots.chest)) {
        if (st.chapter === 8) { prompt = 'Open the chest under the bunk'; action = () => { st.openChest(); this.syncStory(); }; }
        else if (st.chapter < 8) prompt = 'An old sea chest, locked tight';
        else prompt = 'The chest is empty now';
      }
    }
    for (const c of this.chests) {
      if (c.opened || Math.hypot(c.x - p.x, c.z - p.z) > 1.8 || Math.abs(c.y - p.y) > 1.5) continue;
      prompt = 'Open the chest'; action = () => this.openChest(c);
    }
    // the rival's challenge comes first; nothing else during a countdown
    const rp = this.race?.prompt();
    if (rp) { prompt = rp.prompt; action = rp.action; }
    else if (this.race?.hold) { prompt = null; action = null; }
    if (prompt !== this.prompt) { this.prompt = prompt; g.ui.setPrompt(prompt); }
    if (acts.action && action) { this.prompt = null; g.ui.setPrompt(null); action(); }
  }

  /** One per island: a tailor piece you don't own yet, or gold if you have them all. */
  async openChest(c) {
    const g = this.game, P = this.progress(this.island);
    c.opened = true; P.chest = true;
    c.mesh.rotation.x = -0.15;
    g.audio.play('treasure');
    const pool = STYLES.filter((s) => s.source === 'tailor' && !owns(g.state.wardrobe, s.slot, s.style));
    let item;
    if (pool.length) {
      const s = pool[(this.island.seed >>> 0) % pool.length];
      g.unlockCosmetic(s.id, 'chest');
      item = { icon: 'needle', name: s.name, text: 'Added to your wardrobe. Try it on at any port\'s Tailor.' };
    } else {
      g.state.cargo += 100; this.trip += 100;
      item = { icon: 'coin', name: '100 gold', text: 'You own every piece the tailors sell, so the chest held gold instead.' };
    }
    g.saveVoyage();
    g.ui.setAshore(this.island.name, this.trip, this.remaining());
    await g.ui.showFound({ eyebrow: this.island.name, title: 'A hidden chest!', items: [item], main: 'Onward' });
    this.chests = this.chests.filter((x) => x !== c);
  }

  async splash() {
    const g = this.game;
    this.splashT = 2;
    g.audio.play('slam', { volume: 0.4 });
    await g.ui.fade(1, 0.35);
    const c = this.checkpoint;
    this.ctl?.teleport(c.x, c.y, c.z, c.yaw);
    this.cam?.snap(this.ctl, c.yaw);
    await g.ui.fade(0, 0.4);
  }
}
