// Game rules: sailing loop, economy, discovery, treasure, docking/saving,
// storms and shipwrecks, camera.
import * as THREE from 'three';
import { UPGRADES, REFITS, upgradeValue, MAP_RES, MAP_CELL, WORLD_HALF, DAY_LENGTH, ROUGH, isTouch } from './config.js';
import { clamp, damp, dampAngle, smoothstep, lerp, wrapAngle, bearingDeg, TAU } from './util.js';
import { updateWaves, waveHeight } from './waves.js';
import { bandAt, seaAt, swellAt, roughWear, goldBonus, zoneWeather } from './sea-zones.js';
import { ringUniforms } from './world.js';
import { propMesh } from './props.js';
import { pointOfSailName } from './boat.js';
import { loadSave, writeSave, clearSave, encodeBytes, decodeBytes, loadSettings, saveSettings, migrate } from './save.js';
import { Emitter } from './events.js';
import { STYLES, normalizeProfile } from './cosmetics.js';
import { LINES, SIGHTINGS, SEAS } from './story-text.js';

const SPYGLASS_HINT = LINES.spyglassHint;
// Sea camera: the lowest it orbits (radians above the boat), and how far past
// that the view can tilt up to take in tall landmarks.
const CAM_LOW = 0.04, CAM_LOOK_UP = 0.55;

const TUTORIAL = isTouch ? [
  'Raise your sail with the ▲ button.',
  'Drag the tiller (bottom left) to steer. Drag elsewhere to look around.',
  "The red flag shows the wind. Sail across it for speed; you can't sail straight into it.",
  'Golden light beams mark sunken treasure. Stop on one and haul it up.',
  'Gold in your hold sinks if you are shipwrecked. Dock at a port to bank it, repair, upgrade and save.',
] : [
  'Raise your sail with W (lower it with S).',
  'Steer with A / D. Drag the mouse to look around, scroll to zoom.',
  "The red flag shows the wind. Sail across it for speed; you can't sail straight into it.",
  'Golden light beams mark sunken treasure. Stop on one and press E to haul it up.',
  'Gold in your hold sinks if you are shipwrecked. Dock at a port to bank it, repair, upgrade and save.',
];

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.events = new Emitter();
    // What main.js renders. Ashore swaps in its own scene; the sea is the default.
    this.seaView = { scene: this.scene, camera: this.camera };
    this.view = this.seaView;
    this.settings = loadSettings();
    this.mode = 'title';
    this.paused = false;
    this.state = this.freshState();
    this.saveData = {};
    this.cam = { yaw: 0, pitch: 0.3, dist: 30, lastLook: -10, shake: 0, lurch: 0, fov: 55, spyYaw: 0, spyPitch: 0 };
    this.spyOn = false;
    this.elapsed = 0;
    this.sailEfficiency = 0;
    this.pointOfSail = '';
    this.flotsam = [];
    this.dockedIsland = null;
    this.timers = { discover: 0, save: 0, reveal: 0, tutorial: 6, flotsam: 0 };
    this.dockCooldown = 0;
    this.prompt = null;
    this.titleAngle = 0.6;
    this.effects = [];
    this.weather.onThunder = (d) => this.audio.play('thunder', { delay: d / 450, volume: clamp(1.2 - d / 1100, 0.3, 1) });
    this.sea = seaAt(0, 0); // the sea where the boat is, kept up to date in update()
    this._v = new THREE.Vector3();
    this.applyUpgrades();
  }

  freshState() {
    return {
      banked: 0, cargo: 0, health: 100,
      // anchor: grandfather's anchor's refit tier, 0-4 (refits.js); old saves start at 0
      upgrades: { sail: 0, hull: 0, rudder: 0, keel: 0, lantern: 0, spyglass: 0, anchor: 0 },
      discovered: new Set([0]), treasures: new Set(), pending: new Set(), savePort: 0,
      dayT: 0.3, day: 1, revealed: new Uint8Array(MAP_RES * MAP_RES),
      stats: { distance: 0, treasures: 0, wrecks: 0, discoveries: 1 }, tutorial: 0,
      // v2: character, quests, story, ashore progress and quest cargo
      profile: normalizeProfile(null), wardrobe: [],
      quests: { active: [], done: [], boards: {}, pinned: null, reports: {} },
      story: { chapter: 0, journals: [], flags: {}, seenCards: [] },
      ashore: {}, hold: [],
      // the rival captain (rival.js)
      rival: { chapter: 0, wins: 0, losses: 0, flags: {}, log: [] },
      // the living sea's log: what you've seen, and the pity counts (sea-events.js)
      sightings: { seen: {}, miss: {}, chain: null },
    };
  }

  get up() {
    const u = {};
    for (const U of UPGRADES) u[U.key] = upgradeValue(this.state.upgrades, U.key);
    return u;
  }

  applyUpgrades() {
    this.upv = this.up;
    this.boat.applyUpgrades(this.state.upgrades, this.upv);
    this.syncAnchor();
    this.state.health = Math.min(this.state.health, this.boat.maxHealth);
  }

  /** Grandfather's anchor shows at the bow once it's fitted (and is down while you're ashore), refitted to its tier. */
  syncAnchor() {
    const fitted = this.state.story?.flags?.anchor === 'fitted';
    this.boat.setAnchorTier(this.state.upgrades.anchor || 0);
    this.boat.setAnchor(!fitted ? 'none' : this.mode === 'ashore' || this.mode === 'landing' ? 'down' : 'stowed');
  }

  // ------------------------------------------------------------ save / load
  hasSave() { return !!loadSave(); }

  knowledge() {
    const s = this.state, d = this.saveData;
    d.discovered = [...s.discovered];
    d.revealed = encodeBytes(s.revealed);
    d.dayT = s.dayT; d.day = s.day; d.stats = s.stats; d.tutorial = s.tutorial;
    // Things that persist the moment they happen (not banked like gold)
    d.profile = s.profile; d.wardrobe = s.wardrobe; d.quests = s.quests;
    d.story = s.story; d.ashore = s.ashore; d.hold = s.hold; d.rival = s.rival; d.sightings = s.sightings;
    migrate(d); // stamps the current version
    return d;
  }

  savePortState() {
    const s = this.state, d = this.knowledge();
    d.banked = s.banked; d.upgrades = { ...s.upgrades }; d.treasures = [...s.treasures];
    d.savePort = s.savePort; d.health = s.health;
    d.voyage = null;
    writeSave(d);
  }

  saveVoyage() {
    const s = this.state, d = this.knowledge();
    if (this.mode === 'sailing' || this.mode === 'landing' || this.mode === 'ashore') {
      // ashore, the boat waits at anchor: Continue puts you back aboard it
      d.voyage = { x: this.boat.pos.x, z: this.boat.pos.z, heading: this.boat.heading, cargo: s.cargo, health: s.health, pending: [...s.pending] };
    }
    writeSave(d);
  }

  /** Switch what main.js renders (the sea, or a scene of our own like ashore). */
  setView(view) { this.view = view || this.seaView; }

  /** Title → character creator → a fresh voyage (or back to the title if cancelled). */
  async newVoyage() {
    if (!this.creator) return this.startNew();
    this.ui.hideTitle();
    const profile = await this.creator.open('new', normalizeProfile(null));
    if (!profile) { this.ui.showTitle(this.hasSave()); return; }
    this.startNew(profile);
  }

  startNew(profile = null) {
    clearSave();
    this.state = this.freshState();
    this.state.profile = normalizeProfile(profile);
    this.applyProfile();
    this.saveData = {};
    for (const I of this.world.islands) I.treasureTaken = false;
    this.applyUpgrades();
    this.state.health = this.boat.maxHealth;
    this.weather.set('clear', true);
    this.weather.calmTimer = 300;
    this.weather.windAngle = Math.PI / 2; // a friendly beam reach out of Port Haven
    this.weather.timer = 120;
    const home = this.world.home;
    this.placeAtDock(home);
    this.revealAround(home.x, home.z, 700);
    this.savePortState();
    this.beginSailing();
    this.story?.showPrologue();
  }

  continueGame() {
    const d = loadSave();
    if (!d) return this.startNew();
    const s = this.freshState();
    s.banked = d.banked || 0;
    Object.assign(s.upgrades, d.upgrades || {});
    s.discovered = new Set(d.discovered || [0]);
    s.treasures = new Set(d.treasures || []);
    s.savePort = d.savePort ?? 0;
    s.dayT = d.dayT ?? 0.3; s.day = d.day ?? 1;
    s.revealed = decodeBytes(d.revealed, MAP_RES * MAP_RES);
    s.stats = { ...s.stats, ...(d.stats || {}) };
    s.tutorial = d.tutorial ?? 5;
    s.profile = normalizeProfile(d.profile); s.wardrobe = d.wardrobe; s.quests = d.quests;
    s.story = d.story; s.ashore = d.ashore; s.hold = d.hold; s.rival = d.rival; s.sightings = d.sightings;
    this.state = s;
    this.saveData = d;
    this.applyUpgrades();
    this.applyProfile();
    s.health = d.health ?? this.boat.maxHealth;
    const v = d.voyage;
    if (v) {
      s.cargo = v.cargo || 0;
      s.health = v.health ?? s.health;
      s.pending = new Set(v.pending || []);
    }
    for (const I of this.world.islands) I.treasureTaken = s.treasures.has(I.id) || s.pending.has(I.id);
    this.weather.set(Math.random() < 0.6 ? 'clear' : 'breezy', true);
    if (v) {
      this.boat.place(v.x, v.z, v.heading);
      this.streamer.buildAll(v.x, v.z);
    } else {
      this.placeAtDock(this.world.islands[s.savePort] || this.world.home);
    }
    this.beginSailing();
    // voyages from before the story get the prologue once
    if ((s.story?.chapter || 0) === 0) this.story?.showPrologue();
  }

  beginSailing() {
    this.mode = 'sailing';
    this.dockCooldown = 4;
    this.cam.yaw = this.boat.heading;
    this.cam.dist = 30; this.cam.pitch = 0.3;
    this.ui.hideTitle();
    this.input.enabled = true;
  }

  placeAtDock(I) {
    const D = I.dock;
    this.boat.place(D.x, D.z, D.heading);
    this.streamer.buildAll(D.x, D.z);
  }

  // ---------------------------------------------------------------- port
  startDocking(I) {
    this.mode = 'docking';
    this.dockFrom = { x: this.boat.pos.x, z: this.boat.pos.z, h: this.boat.heading };
    this.dockIsland = I;
    this.dockT = 0;
    this.boat.sailLevel = 0;
    this.ui.setPrompt(null);
  }

  arriveAtPort(I) {
    const s = this.state;
    this.mode = 'docked';
    this.dockedIsland = I;
    this.boat.speed = 0;
    this.discover(I);
    s.savePort = I.id;
    if (s.cargo > 0) this.ui.toast(`Banked ${s.cargo} gold`, 'gold');
    s.banked += s.cargo;
    s.cargo = 0;
    for (const id of s.pending) s.treasures.add(id);
    s.pending.clear();
    this.savePortState();
    this.audio.play('dock');
    this.events.emit('dock', I);
    this.ui.openPort(I);
  }

  setSail() {
    this.events.emit('setSail', this.dockedIsland);
    this.ui.closePort();
    this.dockedIsland = null;
    this.mode = 'sailing';
    this.dockCooldown = 4;
    this.boat.speed = 0;
    this.cam.lastLook = -10;
  }

  buyUpgrade(key) {
    const s = this.state, U = UPGRADES.find((u) => u.key === key);
    const lvl = s.upgrades[key];
    if (!U || lvl >= U.tiers.length - 1) return false;
    if (key === 'spyglass' && lvl === 0) return false; // the first spyglass is grandfather's, found in his wreck
    const cost = U.tiers[lvl + 1].cost;
    if (s.banked < cost) return false;
    const oldMax = this.boat.maxHealth;
    s.banked -= cost;
    s.upgrades[key] = lvl + 1;
    this.applyUpgrades();
    if (key === 'hull') s.health += this.boat.maxHealth - oldMax;
    this.audio.play('upgrade');
    this.ui.toast(`${U.tiers[lvl + 1].label} installed!`, 'gold');
    // the hull that landing at Frostspire asks for comes with a word about the water round it
    if (key === 'hull' && lvl + 1 === REFITS[REFITS.length - 1].needs.lvl) this.ui.toast(SEAS.shipwright, 'info');
    this.events.emit('upgrade', key, lvl + 1);
    this.savePortState();
    this.ui.refreshPort();
    return true;
  }

  // ------------------------------------------------------------ wardrobe
  applyProfile() { this.boat.explorer.setAppearance?.(this.state.profile); }

  /** Open the creator in wardrobe mode from the port's Tailor tab. */
  async openWardrobe() {
    if (this.mode !== 'docked' || !this.creator) return;
    this.ui.closePort();
    const profile = await this.creator.open('wardrobe', this.state.profile);
    if (profile) {
      this.state.profile = profile;
      this.savePortState();
      this.events.emit('outfit', profile);
    }
    this.applyProfile();
    this.ui.openPort(this.dockedIsland, 'tailor');
  }

  /** Buy a tailor item with banked gold. Returns true on success. */
  buyCosmetic(id) {
    const s = this.state, item = STYLES.find((x) => x.id === id);
    if (!item || item.source !== 'tailor' || s.wardrobe.includes(id)) return false;
    if (s.banked < item.price) { this.ui.toast('Not enough gold', 'warn'); return false; }
    s.banked -= item.price;
    s.wardrobe.push(id);
    this.audio.play('upgrade');
    this.ui.toast(`${item.name} added to your wardrobe`, 'gold');
    this.events.emit('cosmetic', id, 'tailor');
    this.savePortState();
    this.ui.refreshPort();
    return true;
  }

  /** Unlock a cosmetic from a chest, quest or the story (saved straight away). */
  unlockCosmetic(id, how = 'found') {
    const s = this.state;
    if (!STYLES.some((x) => x.id === id) || s.wardrobe.includes(id)) return false;
    s.wardrobe.push(id);
    this.events.emit('cosmetic', id, how);
    this.saveVoyage();
    return true;
  }

  repairCost() { return Math.ceil((this.boat.maxHealth - this.state.health) * 0.5); }

  repair() {
    const s = this.state;
    const missing = this.boat.maxHealth - s.health;
    if (missing <= 0) return;
    const hp = Math.min(missing, s.banked / 0.5);
    if (hp <= 0) { this.ui.toast('Not enough gold to repair', 'warn'); return; }
    s.health = Math.min(this.boat.maxHealth, s.health + hp);
    s.banked = Math.max(0, s.banked - Math.ceil(hp * 0.5));
    this.audio.play('upgrade');
    this.savePortState();
    this.ui.refreshPort();
  }

  // -------------------------------------------------------------- damage
  damage(amount, kind) {
    if (this.mode !== 'sailing') return;
    const s = this.state;
    s.health -= amount;
    if (kind !== 'storm' && kind !== 'rough') {
      this.ui.flashDamage(amount);
      this.audio.play('crash');
      this.cam.shake = Math.min(1.5, 0.3 + amount / 15);
      this.ui.toast({ rock: 'Crunch! You struck a rock.', ice: SIGHTINGS.hitIce, spout: SIGHTINGS.hitSpout, whale: SIGHTINGS.hitWhale, breach: SIGHTINGS.hitBreach, rogue: SEAS.waveBeam, rogueSail: SEAS.waveSail }[kind] || 'You ran aground!', 'warn');
    } else if (Math.random() < (kind === 'rough' ? (amount * 100) / this.boat.maxHealth : amount) * 0.6) {
      // (rough water takes a share of the hull, so its flicker goes by the share: a big hull loses more points to the same sea)
      this.ui.flashDamage(2);
      this.cam.shake = 0.25;
    }
    if (s.health <= 0) { s.health = 0; this.wreck(); }
  }

  wreck() {
    const s = this.state;
    this.mode = 'wrecking';
    this.wreckT = 0;
    this.lostCargo = s.cargo;
    s.cargo = 0;
    for (const id of s.pending) {
      const I = this.world.islands[id];
      I.treasureTaken = false;
      this.streamer.setTreasureVisible(I, true);
    }
    s.pending.clear();
    s.stats.wrecks++;
    this.saveData.voyage = null;
    this.knowledge();
    writeSave(this.saveData);
    this.ui.setPrompt(null);
    this.ui.warning(null);
    this.audio.play('wreck');
    this.events.emit('wreck', this.lostCargo);
  }

  async respawn() {
    this.ui.hideWreck();
    const s = this.state;
    s.health = this.boat.maxHealth;
    const port = this.world.islands[s.savePort] || this.world.home;
    this.placeAtDock(port);
    this.boat.sink = 0;
    this.mode = 'docked';
    this.dockedIsland = port;
    this.cam.yaw = this.boat.heading + Math.PI * 0.8;
    this.savePortState();
    this.events.emit('respawn', port);
    await this.ui.fade(0, 1);
    this.ui.openPort(port);
  }

  // ------------------------------------------------------------ discovery
  discover(I, how) {
    const s = this.state;
    if (s.discovered.has(I.id)) return;
    s.discovered.add(I.id);
    s.stats.discoveries = s.discovered.size;
    s.cargo += I.discoverValue;
    this.ui.banner(I.name, how || (I.port ? 'Port discovered' : I.landmark ? 'Landmark discovered' : 'Island discovered'));
    this.ui.toast(`+${I.discoverValue} gold for charting ${I.name}`, 'gold');
    this.audio.play('discover');
    this.events.emit('discover', I, how || 'sailing');
  }

  revealAround(x, z, r) {
    const rev = this.state.revealed;
    const c0x = Math.max(0, Math.floor((x - r + WORLD_HALF) / MAP_CELL)), c1x = Math.min(MAP_RES - 1, Math.floor((x + r + WORLD_HALF) / MAP_CELL));
    const c0z = Math.max(0, Math.floor((z - r + WORLD_HALF) / MAP_CELL)), c1z = Math.min(MAP_RES - 1, Math.floor((z + r + WORLD_HALF) / MAP_CELL));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const wx = (cx + 0.5) * MAP_CELL - WORLD_HALF, wz = (cz + 0.5) * MAP_CELL - WORLD_HALF;
      if ((wx - x) ** 2 + (wz - z) ** 2 < r * r) rev[cz * MAP_RES + cx] = 1;
    }
  }

  // ------------------------------------------------------------- flotsam
  updateFlotsam(dt) {
    const b = this.boat.pos;
    this.timers.flotsam -= dt;
    if (this.flotsam.length < 14 && this.timers.flotsam <= 0) {
      this.timers.flotsam = 1.5;
      const a = Math.random() * TAU, d = 250 + Math.random() * 900;
      const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
      if (Math.abs(x) < WORLD_HALF - 300 && Math.abs(z) < WORLD_HALF - 300 && this.world.heightAt(x, z) < -5 && !this.world.rockHit(x, z, 10)) {
        const kind = Math.random() < 0.5 ? 'barrel' : 'crate';
        const mesh = propMesh(kind);
        mesh.rotation.set(Math.random() * 0.5, Math.random() * TAU, Math.random() * 0.5);
        this.scene.add(mesh);
        // (salvage adrift in rough water is worth more, like the treasure sunk there)
        this.flotsam.push({ x, z, mesh, value: Math.round((4 + Math.floor(Math.random() * 11)) * goldBonus(x, z)), phase: Math.random() * 10 });
      }
    }
    for (let i = this.flotsam.length - 1; i >= 0; i--) {
      const f = this.flotsam[i];
      const d = Math.hypot(f.x - b.x, f.z - b.z);
      f.mesh.position.set(f.x, waveHeight(f.x, f.z) + 0.15 + Math.sin(this.elapsed * 2 + f.phase) * 0.1, f.z);
      f.mesh.rotation.y += dt * 0.2;
      if (this.mode === 'sailing' && d < 5.5) {
        this.state.cargo += f.value;
        this.ui.toast(`+${f.value} gold (salvage)`, 'gold');
        this.audio.play('coin');
      }
      if ((this.mode === 'sailing' && d < 5.5) || d > 1600) {
        this.scene.remove(f.mesh);
        this.flotsam.splice(i, 1);
      }
    }
  }

  haulTreasure(I) {
    const s = this.state;
    // treasure lying in rough water is worth more: it costs hull to reach
    const bonus = goldBonus(I.treasure.x, I.treasure.z), gold = Math.round(I.treasure.value * bonus);
    I.treasureTaken = true;
    s.pending.add(I.id);
    s.cargo += gold;
    s.stats.treasures++;
    this.streamer.setTreasureVisible(I, false);
    this.audio.play('treasure');
    this.ui.banner(`${gold} gold`, bonus > 1.05 ? SEAS.haul : 'Treasure hauled aboard!');
    this.events.emit('haul', I);
    this.spawnChestRise();
  }

  /** A chest rises out of the water beside the boat and spins away. */
  spawnChestRise() {
    const chest = propMesh('chest');
    const r = new THREE.Vector2(-Math.cos(this.boat.heading), Math.sin(this.boat.heading));
    chest.position.set(this.boat.pos.x + r.x * 4, -2, this.boat.pos.z + r.y * 4);
    chest.rotation.y = this.boat.heading;
    this.scene.add(chest);
    this.effects.push({ t: 0, life: 2.4, mesh: chest, kind: 'chest' });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.kind === 'chest') {
        const k = e.t / e.life;
        const p = e.mesh.position;
        p.y = lerp(-2, 2.5, smoothstep(0, 0.4, k)) + (k > 0.7 ? (k - 0.7) * 6 : 0);
        e.mesh.rotation.y += dt * 2;
        e.mesh.scale.setScalar(k > 0.75 ? Math.max(0.01, 1 - (k - 0.75) * 4) : 1);
      }
      if (e.t >= e.life) { this.scene.remove(e.mesh); this.effects.splice(i, 1); }
    }
  }

  // -------------------------------------------------------------- ui glue
  setPaused(p) {
    if (this.mode === 'title') return;
    this.paused = p;
    if (p) { this.ui.showPause(); this.saveVoyage(); } else this.ui.hidePause();
  }

  toggleMap() {
    if (this.mode === 'title' || this.mode === 'wrecking' || this.mode === 'wrecked') return;
    if (this.ui.isMapOpen) this.ui.closeMap(); else this.ui.openMap();
  }

  setSetting(k, v) {
    this.settings[k] = v;
    saveSettings(this.settings);
    if (k === 'sound') this.audio.setSound(v);
    if (k === 'music') this.audio.setMusic(v);
    if (k === 'effects') this.fx?.setEnabled(v);
  }

  resetSave() { clearSave(); location.reload(); }

  // ----------------------------------------------------------------- loop
  update(dt) {
    // The creator borrows the explorer and renders its own studio scene
    if (this.creator?.active) {
      const a = this.input.consumeActions();
      if (a.pause && this.creator.mode === 'wardrobe') this.creator.close(null);
      const look = this.input.consumeLook();
      if (this.creator.active) this.creator.update(dt, look);
      return;
    }
    const acts = this.input.consumeActions();
    if (acts.pause && this.ui.isStoryOpen) { this.ui.storyStep(Infinity); acts.pause = 0; }
    if (acts.pause && this.ui.isFoundOpen) { this.ui.closeFound('later'); acts.pause = 0; }
    if (acts.pause && this.mode !== 'title') {
      if (this.ui.isJournalOpen) this.ui.closeJournal();
      else if (this.ui.isMapOpen) this.ui.closeMap();
      else if (this.mode !== 'wrecked') this.setPaused(!this.paused);
    }
    if (acts.map && !this.paused) this.toggleMap();
    if (acts.journal && !this.paused && !this.ui.isMapOpen && this.mode !== 'title') this.ui.toggleJournal();
    const frozen = this.paused || this.ui.isMapOpen || this.ui.isJournalOpen || this.ui.isStoryOpen || this.ui.isFoundOpen;
    if (frozen) { this.input.consumeLook(); return; }

    this.elapsed += dt;
    const s = this.state, boat = this.boat, w = this.weather;
    s.dayT += dt / DAY_LENGTH;
    if (s.dayT >= 1) { s.dayT -= 1; s.day++; }
    // where the boat is on the map shapes the weather to come and the swell it feels (sea-zones.js)
    this.sea = seaAt(boat.pos.x, boat.pos.z, this.sea);
    w.update(dt, this.camera, boat.group.position, bandAt(boat.pos.x, boat.pos.z), zoneWeather(boat.pos.x, boat.pos.z));
    // Run the sea a bit slower than real time: calmer, rolling swells that
    // don't drag the foam across the screen. CPU + GPU share this clock.
    // ashore, keep the swell gentle so it doesn't wash over the beach
    const ashoreSea = this.mode === 'ashore' || this.mode === 'landing' ? 0.35 : 1;
    // (and of rough water's own swell, less still: an island inside it would otherwise stand
    // in a storm's surf for good. This leaves it a rainy day's sea.)
    updateWaves(this.elapsed * 0.6, w.p.wave * ashoreSea, w.p.swell * ashoreSea, ashoreSea * ashoreSea);
    // rough water's rogue wave and loose ice (rough-water.js): the wave is part of the sea from here on
    if (this.mode !== 'title') this.rough?.update(dt);
    const wind = { angle: w.windAngle, strength: w.windStrength };
    const up = this.upv;

    if (this.mode === 'sailing') {
      // on a race's start line the boat is held until "Go!"
      const held = !!this.rival?.hold;
      const ds = held ? 0 : acts.sailUp - acts.sailDown;
      const nl = clamp(boat.sailLevel + ds, 0, 2);
      if (nl !== boat.sailLevel) { boat.sailLevel = nl; this.audio.play('sail'); }
      const px = boat.pos.x, pz = boat.pos.z;
      // a ship in tow takes some of the sail's drive; dolphins on the bow wave add a little
      const drive = (this.rival?.drive ?? 1) * (this.seaEvents?.drive ?? 1);
      const events = held ? [] : boat.simulate(dt, { steer: this.input.steer, drive }, wind, this.world, up);
      if (held) { boat.speed = 0; boat.rudder = damp(boat.rudder, 0, 6, dt); }
      s.stats.distance += Math.hypot(boat.pos.x - px, boat.pos.z - pz);
      for (const e of events) this.damage(e.damage, e.kind);
      // storms batter the hull, more so under full sail
      const storm = w.p.storm;
      if (storm > 0.3 && this.mode === 'sailing') {
        const sf = [0, 0.5, 1][boat.sailLevel];
        this.damage(storm * (0.15 + 1.4 * sf * sf) * (1 - up.keel) * dt, 'storm'); // slams add the rest
      }
      // rough water does the same under any sky, by the metre sailed and as a share of the hull,
      // so it weighs the same on every ship; the keel is only part of the answer to it
      if (this.sea.rough > 0 && this.mode === 'sailing') {
        const metres = Math.max(Math.hypot(boat.pos.x - px, boat.pos.z - pz), ROUGH.drift * dt);
        this.damage(roughWear(this.sea, boat.sailLevel, up.keel) * metres * boat.maxHealth, 'rough');
      }
      this.announceSea();
      this.updateSailingChecks(dt, acts);
    } else if (this.mode === 'docking') {
      this.dockT += dt / 1.6;
      const k = smoothstep(0, 1, this.dockT);
      const D = this.dockIsland.dock;
      boat.pos.x = lerp(this.dockFrom.x, D.x, k);
      boat.pos.z = lerp(this.dockFrom.z, D.z, k);
      boat.heading = this.dockFrom.h + wrapAngle(D.heading - this.dockFrom.h) * k;
      boat.speed = 0;
      if (this.dockT >= 1) this.arriveAtPort(this.dockIsland);
    } else if (this.mode === 'docked') {
      boat.speed = 0;
      boat.rudder = 0;
    } else if (this.mode === 'ashore') {
      boat.speed = 0;
      this.ashore.update(dt, acts);
    } else if (this.mode === 'wrecking') {
      this.wreckT += dt;
      boat.sink = Math.min(6, this.wreckT * this.wreckT * 0.6);
      boat.speed = damp(boat.speed, 0, 2, dt);
      if (this.wreckT > 3.2 && !this.wreckShown) {
        this.wreckShown = true;
        this.ui.fade(1, 1.2).then(() => {
          this.mode = 'wrecked';
          this.wreckShown = false;
          const port = this.world.islands[s.savePort] || this.world.home;
          this.ui.showWreck(this.lostCargo, port.name);
        });
      }
    }

    // ashore, the boat waits at anchor in the sea scene and the explorer is on the island
    const onLand = this.mode === 'ashore' || this.mode === 'landing';
    if (!onLand) {
      boat.animate(dt, this.elapsed, wind, s.health / boat.maxHealth, this.env.night, up);
      this.checkBowSlam(dt);
      this.sailEfficiency = boat.efficiency;
      this.pointOfSail = pointOfSailName(boat.relWind);
      if (this.mode !== 'title') this.updateFlotsam(dt);
      this.updateEffects(dt);
      if (this.mode !== 'title') { this.quests?.update(dt, this.elapsed); this.story?.update(dt, this.elapsed); this.rival?.update(dt, this.elapsed, wind); this.reports?.update(dt); this.seaEvents?.update(dt, this.elapsed); }
      this.updateCamera(dt);
    }
    this.env.update(dt, s.dayT, w.p, this.camera, w.wind, this.elapsed);
    if (this.spyOn) this.scene.fog.far *= 1.35; // the glass cuts through haze
    const ou = this.ocean.uniforms;
    ou.uSunDir.value.copy(this.env.lightDir);
    ou.uLightCol.value.copy(this.env.oceanLight);
    // Night water should read as dark, moonlit blue rather than teal
    ou.uAmbient.value.copy(this.env.oceanAmbient).multiplyScalar(lerp(1, 0.55, this.env.night));
    ou.uLantern.value.set(boat.pos.x, 0, boat.pos.z, this.env.night);
    ou.uLanternR.value = up.lantern;
    ou.uRain.value = w.p.rain;
    this.ocean.setWind(w.wind.x, w.wind.y, w.windStrength);
    this.ocean.setSky(this.env, w.p);
    ou.uSkyColor.value.copy(this.env.horizon);
    const L = ringUniforms.uLight.value.copy(this.env.oceanAmbient).add(this.env.oceanLight);
    L.r = Math.min(L.r, 1.1); L.g = Math.min(L.g, 1.1); L.b = Math.min(L.b, 1.1);
    boat.wakeMat.uniforms.uLight.value.copy(L);
    this.seaEvents?.tintWake(boat.wakeMat.uniforms.uLight.value); // blue, in the glowing bloom
    boat.wakeMat.uniforms.uScale.value = this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.ocean.update(this.camera);
    if (!onLand) {
      this.streamer.update(boat.pos.x, boat.pos.z, 1);
      this.streamer.animate(this.elapsed, this.env.night);
      this.streamer.lod(this.camera.position.x, this.camera.position.z, this.spyOn ? 55 / this.camera.fov : 1);
    }

    this.audio.update(dt, {
      speed: Math.abs(boat.speed), wind: w.windStrength, rain: w.p.rain, storm: w.p.storm,
      inPort: this.mode === 'docked', night: this.env.night,
      ashore: this.mode === 'ashore' ? this.ashore.island.biome || 'rocky' : null, // (the wreck lies on bare rock)
    });
    this.ui.update(dt);
  }

  updateSailingChecks(dt, acts) {
    const s = this.state, boat = this.boat, b = boat.pos, w = this.weather;
    this.dockCooldown -= dt;

    this.timers.reveal -= dt;
    if (this.timers.reveal <= 0) {
      this.timers.reveal = 0.3;
      this.revealAround(b.x, b.z, this.upv.spyglass);
    }
    this.timers.discover -= dt;
    if (this.timers.discover <= 0) {
      this.timers.discover = 0.4;
      for (const I of this.world.islands) {
        if (s.discovered.has(I.id)) continue;
        if (Math.hypot(I.x - b.x, I.z - b.z) < I.r + 220 + this.upv.spyglass * 0.25) this.discover(I);
      }
    }
    this.timers.save -= dt;
    if (this.timers.save <= 0) { this.timers.save = 8; this.saveVoyage(); }

    // tutorial hints for a brand new voyage
    if (s.tutorial < TUTORIAL.length) {
      this.timers.tutorial -= dt;
      const ready = s.tutorial === 0 ? this.timers.tutorial <= 0 : this.timers.tutorial <= 0 && (s.tutorial !== 1 || boat.sailLevel > 0);
      if (ready) {
        this.ui.toast(TUTORIAL[s.tutorial], 'info');
        s.tutorial++;
        this.timers.tutorial = 11;
      }
    }

    // contextual action
    let prompt = null, action = null;
    // Sable first; during a race or the kraken nothing else is on offer.
    // Her race challenge is the exception: it follows you about, so it gives way to any spot you're at.
    const rx = this.rival?.interaction(b.x, b.z, boat.speed);
    const busy = !!this.rival?.exclusive;
    const hail = rx?.hail ? rx : null;
    if (rx && !hail) { prompt = rx.prompt; action = rx.action || null; }
    const sx = !prompt && !busy ? this.story?.interaction(b.x, b.z, boat.speed) : null;
    if (sx) { prompt = sx.prompt; action = sx.action || null; }
    if (!prompt && !busy && this.dockCooldown <= 0) {
      for (const I of this.world.ports) {
        const D = I.dock;
        if (Math.hypot(D.x - b.x, D.z - b.z) < 34) {
          if (Math.abs(boat.speed) < 8) { prompt = `Dock at ${I.name}`; action = () => this.startDocking(I); }
          else prompt = 'Slow down to dock';
          break;
        }
      }
    }
    if (!action && !busy && this.quests) {
      const q = this.quests.salvageNear(b.x, b.z);
      if (q) {
        if (Math.abs(boat.speed) < 7) { prompt = `Haul up the ${q.item.toLowerCase()}`; action = () => this.quests.haul(q); }
        else prompt = 'Slow down to haul up the salvage';
      }
    }
    if (!prompt && !busy) {
      // what the ghost ship left behind, if you followed her
      const ex = this.seaEvents?.interaction(b.x, b.z, boat.speed);
      if (ex) { prompt = ex.prompt; action = ex.action || null; }
    }
    if (!action && !busy) {
      // From the chase camera a beam a few lengths ahead already looks like it's under the bow,
      // so when you've slowed near one, say so before the shore offers a landing instead.
      let close = false;
      for (const I of this.world.near(b.x, b.z)) {
        if (I.isReef || I.treasureTaken || !I.treasure) continue;
        const d = Math.hypot(I.treasure.x - b.x, I.treasure.z - b.z);
        if (d < 13) {
          if (Math.abs(boat.speed) < 7) { prompt = 'Haul up treasure'; action = () => this.haulTreasure(I); }
          else prompt = 'Slow down to haul the treasure';
          break;
        }
        if (d < 40) close = true;
      }
      if (close && !prompt && Math.abs(boat.speed) < 7) prompt = 'Sail onto the treasure to haul it up';
    }
    // a spot's hint ("Slow down to dock", "Sail onto the treasure…") keeps E from starting Sable's race there
    const spot = !!prompt;
    if (!prompt && !busy && this.ashore) {
      const ax = this.ashore.interaction(boat);
      if (ax) { prompt = ax.prompt; action = ax.action || null; }
    }
    if (hail && !action && !spot) { prompt = hail.prompt; action = hail.action; }
    if (prompt !== this.prompt) { this.prompt = prompt; this.ui.setPrompt(prompt); }
    if (acts.action && action) { action(); this.prompt = null; this.ui.setPrompt(null); }

    // warnings
    const hf = s.health / boat.maxHealth;
    let warn = null;
    if (this.rough?.warn) warn = this.rough.warn; // a rogue wave on its way comes before everything
    else if (boat.atEdge) warn = 'The currents of the world’s edge push you back';
    else if (w.p.storm > 0.5 && boat.sailLevel === 2) warn = 'Storm! Lower your sails to ride it out';
    else if (w.p.storm > 0.5) warn = 'Storm: hull taking a beating';
    else if (this.sea.rough > ROUGH.warn && boat.sailLevel === 2) warn = SEAS.reef;
    else if (this.sea.rough > ROUGH.warn) warn = SEAS.beating;
    else if (hf < 0.3) warn = 'Hull badly damaged: make for port!';
    else if (boat.efficiency < 0.2 && boat.sailLevel > 0) warn = 'In irons: turn across the wind';
    if (warn !== this.warn) { this.warn = warn; this.ui.warning(warn); }
  }

  /** Sailing into rough water shows its name, like a discovery (and again if you come back after a while). */
  announceSea() {
    const id = this.sea.rough > 0.12 ? this.sea.roughZone : null, said = this._seaSaid;
    if (!id || (said && said.id === id && this.elapsed - said.t < 120)) {
      if (id && said) said.t = this.elapsed; // still in it: the clock starts when you leave
      return;
    }
    this._seaSaid = { id, t: this.elapsed };
    this.ui.banner(SEAS[id], SEAS.rough);
  }

  // In heavy seas the bow plunges into troughs: a thud, spray-shake and a knock to the hull.
  checkBowSlam(dt) {
    const boat = this.boat, w = this.weather;
    const rate = (boat.pitch - (this._lastPitch ?? boat.pitch)) / Math.max(dt, 1e-3);
    this._lastPitch = boat.pitch;
    this._slamCd = (this._slamCd || 0) - dt;
    const swell = swellAt(this.sea, w.p.swell); // the swell here: half the weather's in home waters, never under rough water's floor
    if (this.mode !== 'sailing' || swell < 0.4 || this._slamCd > 0) return;
    if (boat.pitch > 0.08 && rate > 0.11 && Math.abs(boat.speed) > 2) {
      this._slamCd = 3.5;
      const k = Math.min(1, (rate - 0.11) * 4 + 0.4) * swell;
      this.cam.shake = Math.max(this.cam.shake, 0.5 + k * 0.8);
      this.audio.play('slam', { volume: k });
      const sail = [0, 0.5, 1][boat.sailLevel];
      this.damage((0.8 + 2.2 * sail) * k * (1 - this.upv.keel), 'storm');
    }
  }

  updateCamera(dt) {
    const c = this.cam, cam = this.camera, boat = this.boat;
    const L = this.input.consumeLook();
    let tx, ty, tz;
    if (this.mode === 'title') {
      this.titleAngle += dt * 0.04;
      const h = this.world.home;
      tx = h.x; ty = 12; tz = h.z;
      cam.position.set(h.x + Math.sin(this.titleAngle) * 330, 95, h.z + Math.cos(this.titleAngle) * 330);
      cam.lookAt(tx, ty, tz);
      this.setFov(55, dt);
      return;
    }

    // ---- spyglass: first person from the explorer's eyes, looking where he looks
    const tier = this.state.upgrades.spyglass;
    if (this.input.spyHeld && tier === 0 && !this._spyHint) {
      this._spyHint = true;
      this.ui.toast(SPYGLASS_HINT, 'info');
    }
    const spy = this.input.spyHeld && tier > 0 && (this.mode === 'sailing' || this.mode === 'docked');
    if (spy !== this.spyOn) {
      this.spyOn = spy;
      boat.group.visible = !spy; // nothing of the boat should block the lens
      this.ui.setSpyglass(spy, ['', '×2', '×4', '×7', '×9', '×12'][tier]);
      if (spy) { c.spyYaw = c.yaw; c.spyPitch = 0.0; this._spyHeading = boat.heading; this.audio.play('click'); }
      else if (Number.isFinite(c.spyYaw)) { c.yaw = c.spyYaw; c.lastLook = this.elapsed; }
    }
    if (spy) {
      const fov = [55, 26, 14, 8, 6, 4.5][tier];
      const k = c.fov / 55; // pan slower the more we zoom
      if (L.dx || L.dy) {
        c.spyYaw -= L.dx * 0.005 * k;
        c.spyPitch = clamp(c.spyPitch + L.dy * 0.004 * k, -0.45, 0.35);
      }
      // A/D still steers the boat, so the view turns with the hull
      c.spyYaw += wrapAngle(boat.heading - (this._spyHeading ?? boat.heading));
      this._spyHeading = boat.heading;
      const eye = boat.getEyePosition ? boat.getEyePosition(this._v) : boat.group.localToWorld(this._v.set(-0.2, 2.4, -2.2));
      cam.position.copy(eye);
      const cp = Math.cos(c.spyPitch);
      cam.lookAt(eye.x + Math.sin(c.spyYaw) * cp, eye.y + Math.sin(c.spyPitch), eye.z + Math.cos(c.spyYaw) * cp);
      boat.lookYaw = c.spyYaw;
      this.ui.setSpyBearing(bearingDeg(c.spyYaw));
      c.fov = damp(c.fov, fov, 14, dt);
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
      this.spotIslands(dt, tier, c.spyYaw, fov);
      return;
    }

    // Pitch below CAM_LOW doesn't drop the camera any lower: it tilts the view
    // up past the horizon instead, so tall landmarks fit on screen.
    if (L.dx || L.dy) {
      c.yaw -= L.dx * 0.006;
      c.pitch = clamp(c.pitch + L.dy * 0.004, CAM_LOW - CAM_LOOK_UP, 1.3);
      c.lastLook = this.elapsed;
    }
    if (L.zoom) c.dist = clamp(c.dist * Math.exp(L.zoom * 0.0012), 12, 120);
    if (this.mode === 'sailing' && this.elapsed - c.lastLook > 2.5) {
      c.yaw = dampAngle(c.yaw, boat.heading, 0.9 * Math.min(1, Math.abs(boat.speed) / 4 + 0.3), dt);
      // once under way, the view settles back down to the horizon
      if (c.pitch < CAM_LOW) c.pitch = damp(c.pitch, CAM_LOW, 0.9 * Math.min(1, Math.abs(boat.speed) / 4), dt);
    }
    if (this.mode === 'docked') c.yaw += dt * 0.05;
    // The explorer looks where you look (while you're steering the view)
    boat.lookYaw = this.elapsed - c.lastLook < 4 ? c.yaw : null;
    const p = boat.group.position;
    tx = p.x; ty = p.y + 3.5; tz = p.z;
    const orbit = Math.max(c.pitch, CAM_LOW), lookUp = CAM_LOW - Math.min(c.pitch, CAM_LOW);
    const cp = Math.cos(orbit), sp = Math.sin(orbit);
    let x = tx - Math.sin(c.yaw) * c.dist * cp, z = tz - Math.cos(c.yaw) * c.dist * cp;
    let y = ty + c.dist * sp;
    y = Math.max(y, waveHeight(x, z) + 1.8, this.world.heightAt(x, z) + 3);
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 2);
      x += (Math.random() - 0.5) * c.shake; y += (Math.random() - 0.5) * c.shake; z += (Math.random() - 0.5) * c.shake;
    }
    cam.position.set(x, y, z);
    cam.lookAt(tx, ty, tz);
    if (lookUp > 0) cam.rotateX(lookUp);
    // in heavy seas the horizon tilts a little with the hull, and a rogue wave taken on the side throws it over
    const heavy = swellAt(this.sea, this.weather.p.swell);
    const tilt = (heavy > 0.05 ? boat.roll * 0.4 * heavy : 0) + c.lurch;
    if (tilt) cam.rotateZ(-tilt);
    c.lurch = Math.abs(c.lurch) < 0.002 ? 0 : damp(c.lurch, 0, 1.6, dt);
    this.setFov(55, dt);
  }

  // Islands caught in the spyglass's field of view get charted from afar.
  spotIslands(dt, tier, yaw, fov) {
    this.timers.spot = (this.timers.spot || 0) - dt;
    if (this.timers.spot > 0) return;
    this.timers.spot = 0.3;
    const b = this.boat.pos, s = this.state;
    const range = [0, 1500, 2100, 2700, 3300, 3900][tier];
    const half = (fov * Math.PI) / 360 * Math.max(1, this.camera.aspect) * 0.8;
    for (const I of this.world.islands) {
      if (s.discovered.has(I.id)) continue;
      const dx = I.x - b.x, dz = I.z - b.z, d = Math.hypot(dx, dz);
      if (d > range + I.r) continue;
      const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw));
      if (off < half + Math.atan2(I.r, d)) {
        this.revealAround(I.x, I.z, I.r + 120);
        this.discover(I, 'Spotted through the spyglass');
      }
    }
  }

  setFov(f, dt) {
    const c = this.cam;
    c.fov = damp(c.fov, f, 6, dt);
    if (Math.abs(this.camera.fov - c.fov) > 0.01) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
