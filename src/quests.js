// Quests from port boards: chart an island, carry a parcel between ports,
// salvage a wreck. The system listens to game events (discover, dock,
// wreck) instead of patching the sailing rules, and keeps all of its state
// in game.state.quests so it saves with everything else.
//
// state.quests = {
//   active: [quest], done: [questId], pinned: questId|null,
//   boards: { [portId]: { day, offers: [offer] } },
// }
// A quest is an accepted offer plus { state, acceptedDay }.
//   chart:   active → ready (island discovered) → done at any port
//   deliver: active (parcel aboard) → done at the target port
//            lost (wrecked) → re-collect at the origin port → active
//   salvage: active (haul at the site) → ready (item aboard) → done at any port
//            a wreck while ready drops the item back at the site
import * as THREE from 'three';
import { toonMaterial } from './toon.js';
import { WORLD_HALF, WORLD_SEED } from './config.js';
import { mulberry32, headingOf, bearingDeg, TAU, clamp } from './util.js';
import { waveHeight, waveUniforms } from './waves.js';
import { propMesh } from './props.js';
import { STYLES, owns } from './cosmetics.js';

export const MAX_ACTIVE = 3;
const OFFERS_PER_BOARD = 3;

// --------------------------------------------------------------- flavour
const FIRST_NAMES = ['Maren', 'Tobin', 'Isolde', 'Bram', 'Wren', 'Corin', 'Delphine', 'Osric', 'Liesel', 'Pim',
  'Saoirse', 'Hollis', 'Ines', 'Jory', 'Kit', 'Nell', 'Ansel', 'Rosalind', 'Teague', 'Vesna', 'Ambrose', 'Calla',
  'Dov', 'Ellery', 'Fenna', 'Gideon', 'Hester', 'Ivo', 'Juno', 'Lark'];
export const ROLES = { chart: 'Cartographer', deliver: 'Merchant', salvage: 'Old Salt' };
const PARCELS = ['Crate of lamp oil', 'Bundle of sealed letters', 'Barrel of pickled herring', 'Chest of spices',
  'Brass barometer', 'Bolt of sailcloth', 'Jar of wild honey', 'Cask of cider', 'Sack of seed potatoes',
  'Roll of sea charts', 'Box of ship nails', 'Basket of oranges'];
const SALVAGE = ["Ship's bell", "Captain's strongbox", 'Carved figurehead', 'Brass astrolabe', 'Lost cargo crate',
  'Old storm lantern', 'Silver compass', "Navigator's sextant"];
const POINT_NAMES = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

const dirWord = (dx, dz) => POINT_NAMES[Math.round(bearingDeg(headingOf(dx, dz)) / 45) % 8];
export const fmtDist = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(d / 10) * 10)} m`);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Stable quest givers for a port: one per role. */
export function giversFor(port) {
  const rng = mulberry32((port.id + 1) * 7919 + WORLD_SEED);
  const used = new Set(), out = {};
  for (const type of Object.keys(ROLES)) {
    let n;
    do { n = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]; } while (used.has(n));
    used.add(n);
    out[type] = { name: n, role: ROLES[type] };
  }
  return out;
}

// ------------------------------------------------------------- site visuals
const siteBeamMat = new THREE.ShaderMaterial({
  uniforms: { uTime: waveUniforms.uTime },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main(){ float a = pow(1.0 - vUv.y, 1.5) * (0.5 + 0.22 * sin(uTime * 2.4 + vUv.y * 12.0 + vUv.x * 12.566));
      // colours are sRGB: decode, so they match with or without the linear post pipeline
      gl_FragColor = vec4(sRGBTransferEOTF(vec4(0.45, 0.95, 1.0, 1.0)).rgb, a);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const siteBeamGeo = new THREE.CylinderGeometry(2.6, 1.0, 80, 14, 1, true).translate(0, 39, 0);

/** A salvage beam on its own (the story's anchor spot uses one too). */
export function siteBeam() {
  const beam = new THREE.Mesh(siteBeamGeo, siteBeamMat);
  beam.frustumCulled = false;
  return beam;
}

function buildSiteMesh() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(siteBeamGeo, siteBeamMat);
  beam.frustumCulled = false;
  g.add(beam);
  // floating wreckage: a broken spar, a barrel and a crate
  const debris = new THREE.Group();
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 7, 8), toonMaterial({ color: '#7a5230' }));
  spar.rotation.set(Math.PI / 2, 0, 0.4);
  spar.userData.own = true;
  const barrel = propMesh('barrel'); barrel.position.set(2.2, 0, 1.2); barrel.rotation.set(1.3, 0.4, 0);
  const crate = propMesh('crate'); crate.position.set(-2, 0, -1.5); crate.rotation.set(0.2, 0.7, 0.15);
  debris.add(spar, barrel, crate);
  g.add(debris);
  g.userData.debris = debris;
  return g;
}

// ------------------------------------------------------------------ system
export class QuestSystem {
  constructor(game) {
    this.game = game;
    this.sites = new Map(); // questId -> mesh group
    this.version = 0;       // bump to resync site meshes
    const ev = game.events;
    ev.on('discover', (I) => this.onDiscover(I));
    ev.on('dock', (I) => this.onDock(I));
    ev.on('respawn', (I) => this.onDock(I)); // washing ashore at a port counts as arriving
    ev.on('wreck', () => this.onWreck());
  }

  get Q() {
    const s = this.game.state;
    if (!s.quests) s.quests = { active: [], done: [], boards: {}, pinned: null };
    const q = s.quests;
    q.active ||= []; q.done ||= []; q.boards ||= {};
    if (q.pinned === undefined) q.pinned = null;
    return q;
  }
  get active() { return this.Q.active; }
  get world() { return this.game.world; }
  island(id) { return this.world.islands[id]; }

  // ------------------------------------------------------------- the board
  /** Today's offers at a port (generated once per port per in-game day). */
  board(port) {
    const Q = this.Q, day = this.game.state.day || 1;
    let b = Q.boards[port.id];
    if (!b || b.day !== day) {
      b = { day, offers: this.generate(port, day) };
      Q.boards[port.id] = b;
    }
    // drop offers that went stale (target charted meanwhile, already taken)
    const taken = new Set([...Q.done, ...Q.active.map((q) => q.id)]);
    b.offers = b.offers.filter((o) => !taken.has(o.id) && !(o.type === 'chart' && this.game.state.discovered.has(o.target)));
    return b.offers;
  }

  generate(port, day) {
    const rng = mulberry32(Math.floor((port.id + 1) * 104729 + day * 7907 + WORLD_SEED));
    const offers = [];
    const types = ['chart', 'deliver', 'salvage'];
    // shuffle so the order varies day to day, but each board tries for variety
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    const bands = [[500, 1800], [1500, 3200], [2600, 5200]];
    for (let k = 0; k < OFFERS_PER_BOARD; k++) {
      const band = bands[k];
      // try the types this board doesn't have yet first, then any that fits
      const used = new Set(offers.map((o) => o.type));
      const order = [...types.filter((t) => !used.has(t)), ...types.filter((t) => used.has(t))];
      let offer = null;
      for (let t = 0; t < order.length && !offer; t++) {
        offer = this.makeOffer(order[t], port, band, rng, `${port.id}.${day}.${k}`);
      }
      if (offer) offers.push(offer);
    }
    return offers;
  }

  makeOffer(type, port, [dmin, dmax], rng, id) {
    const st = this.game.state;
    const P = port.dock || port;
    const giver = giversFor(port)[type];
    const base = { id, type, from: port.id, giver, reward: { gold: 0 } };
    if (type === 'chart') {
      const cands = this.world.islands.filter((I) => {
        if (I.port || st.discovered.has(I.id)) return false;
        const d = Math.hypot(I.x - P.x, I.z - P.z);
        return d >= dmin && d <= dmax;
      });
      if (!cands.length) return null;
      const I = cands[Math.floor(rng() * cands.length)];
      const d = Math.hypot(I.x - P.x, I.z - P.z);
      // the search circle contains the island but isn't centred on it
      const hintR = clamp(260 + d * 0.07, 320, 680);
      const a = rng() * TAU, off = rng() * (hintR - I.r) * 0.6;
      const hint = { x: I.x + Math.cos(a) * off, z: I.z + Math.sin(a) * off, r: hintR };
      base.reward.gold = Math.round(60 + d * 0.05 + I.r * 0.25);
      return { ...base, target: I.id, hint, dist: d,
        title: `Chart ${I.name}`,
        text: `Fishermen speak of an island they call ${I.name}, somewhere ${dirWord(I.x - P.x, I.z - P.z)} of here, about ${fmtDist(d)} out. Sail close enough to put it on a proper chart.`,
        ...this.maybeCosmetic(base, d, rng) };
    }
    if (type === 'deliver') {
      const cands = this.world.ports.filter((T) => {
        if (T.id === port.id) return false;
        const d = Math.hypot(T.dock.x - P.x, T.dock.z - P.z);
        return d >= dmin * 0.8 && d <= dmax * 1.3;
      });
      if (!cands.length) return null;
      // prefer ports the player knows, but sometimes send them somewhere new
      const known = cands.filter((T) => st.discovered.has(T.id));
      const pool = known.length && rng() < 0.75 ? known : cands;
      const T = pool[Math.floor(rng() * pool.length)];
      const d = Math.hypot(T.dock.x - P.x, T.dock.z - P.z);
      const parcel = PARCELS[Math.floor(rng() * PARCELS.length)];
      base.reward.gold = Math.round(45 + d * 0.06);
      const days = Math.ceil(d / 1700) + 1;
      return { ...base, target: T.id, item: parcel, dist: d, days, bonus: Math.round(base.reward.gold * 0.4),
        title: `Deliver to ${T.name}`,
        text: `This ${lc(parcel)} has to reach ${T.name}, ${dirWord(T.dock.x - P.x, T.dock.z - P.z)} of here. Keep it out of the storms; if your ship goes down, so does the parcel.`,
        ...this.maybeCosmetic(base, d, rng) };
    }
    if (type === 'salvage') {
      for (let tries = 0; tries < 40; tries++) {
        const a = rng() * TAU, d = dmin + rng() * (dmax - dmin);
        const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
        if (Math.abs(x) > WORLD_HALF - 450 || Math.abs(z) > WORLD_HALF - 450) continue;
        if (this.world.heightAt(x, z) > -9 || this.world.rockHit(x, z, 30)) continue;
        if (this.world.islands.some((I) => Math.hypot(I.x - x, I.z - z) < I.bound + 140)) continue;
        const item = SALVAGE[Math.floor(rng() * SALVAGE.length)];
        base.reward.gold = Math.round(70 + d * 0.055);
        return { ...base, site: { x, z }, item, dist: d,
          title: `Salvage the ${lc(item)}`,
          text: `A trader went down ${dirWord(x - P.x, z - P.z)} of here, about ${fmtDist(d)} out. Her ${lc(item)} is still on the bottom. Haul it up and bring it to any harbor.`,
          ...this.maybeCosmetic(base, d, rng) };
      }
      return null;
    }
    return null;
  }

  /** Far-flung jobs sometimes come with a tailor piece as a bonus. */
  maybeCosmetic(base, d, rng) {
    if (d < 1800 || rng() > 0.25) return {};
    const st = this.game.state;
    const pool = STYLES.filter((s) => s.source === 'tailor' && !owns(st.wardrobe, s.slot, s.style));
    if (!pool.length) return {};
    const s = pool[Math.floor(rng() * pool.length)];
    return { reward: { gold: base.reward.gold, cosmetic: s.id } };
  }

  canAccept() { return this.active.length < MAX_ACTIVE; }

  accept(offerId, port) {
    if (!this.canAccept()) return false;
    const offers = this.board(port);
    const o = offers.find((x) => x.id === offerId);
    if (!o) return false;
    const q = { ...o, state: 'active', acceptedDay: this.game.state.day || 1 };
    this.Q.active.push(q);
    this.Q.pinned = q.id;
    this.syncHold();
    this.version++;
    this.game.events.emit('quest:accept', q);
    this.game.audio.play('click');
    this.game.ui.toast(q.type === 'deliver' ? `${q.item} loaded aboard` : `Quest taken: ${q.title}`, 'info');
    this.game.savePortState();
    return true;
  }

  abandon(id) {
    const Q = this.Q, i = Q.active.findIndex((q) => q.id === id);
    if (i < 0) return;
    Q.active.splice(i, 1);
    Q.done.push(id); // abandoned offers don't come back today
    if (Q.pinned === id) Q.pinned = Q.active[0]?.id ?? null;
    this.syncHold();
    this.version++;
    this.game.saveVoyage();
  }

  pin(id) { this.Q.pinned = id; }
  /** Story-track steps (main story, grandfather's anchor): never take a side-quest slot. */
  get storyQuests() { return this.game.story?.quests() || []; }
  /** Everything worth tracking: story steps first, then side quests. */
  get tracked() { return [...this.storyQuests, ...this.active]; }
  get pinned() {
    const id = this.Q.pinned, list = this.tracked;
    return list.find((q) => q.id === id) || list[0] || null;
  }

  /** Quest items aboard (mirrored into state.hold for the save). */
  syncHold() {
    this.game.state.hold = this.active
      .filter((q) => (q.type === 'deliver' && q.state === 'active') || (q.type === 'salvage' && q.state === 'ready'))
      .map((q) => ({ quest: q.id, name: q.item }));
  }

  // ----------------------------------------------------------------- events
  onDiscover(I) {
    for (const q of this.active) {
      if (q.type === 'chart' && q.state === 'active' && q.target === I.id) {
        q.state = 'ready';
        this.game.ui.toast(`${I.name} charted! Return to any port for your reward.`, 'gold');
        this.game.events.emit('quest:progress', q);
      }
    }
  }

  onDock(port) {
    const g = this.game, ui = g.ui;
    let changed = false;
    for (const q of [...this.active]) {
      const done =
        (q.type === 'deliver' && q.state === 'active' && q.target === port.id) ||
        ((q.type === 'chart' || q.type === 'salvage') && q.state === 'ready');
      if (done) { this.complete(q, port); changed = true; continue; }
      if (q.type === 'deliver' && q.state === 'lost' && q.from === port.id) {
        q.state = 'active';
        ui.toast(`A fresh ${lc(q.item)} is loaded aboard`, 'info');
        changed = true;
      }
    }
    if (changed) {
      this.syncHold();
      this.version++;
      g.savePortState(); // the dock already saved; save again with rewards
    }
  }

  complete(q, port) {
    const g = this.game, s = g.state, Q = this.Q;
    let gold = q.reward.gold;
    let note = '';
    if (q.type === 'deliver' && q.days && (s.day - q.acceptedDay) <= q.days) { gold += q.bonus; note = ` (+${q.bonus} on time)`; }
    s.banked += gold;
    let cosmetic = null;
    if (q.reward.cosmetic) {
      const st = STYLES.find((x) => x.id === q.reward.cosmetic);
      if (st && !owns(s.wardrobe, st.slot, st.style)) { s.wardrobe.push(st.id); cosmetic = st; }
      else if (st) { s.banked += Math.round(st.price / 2); }
    }
    Q.active.splice(Q.active.indexOf(q), 1);
    Q.done.push(q.id);
    if (Q.pinned === q.id) Q.pinned = Q.active[0]?.id ?? null;
    s.stats.quests = (s.stats.quests || 0) + 1;
    g.ui.banner(`+${gold} gold${note}`, `Quest complete: ${q.title}`);
    if (cosmetic) g.ui.toast(`${cosmetic.name} added to your wardrobe`, 'gold');
    g.audio.play('treasure');
    g.events.emit('quest:complete', q, port);
  }

  onWreck() {
    let changed = false;
    for (const q of this.active) {
      if (q.type === 'deliver' && q.state === 'active') {
        q.state = 'lost'; changed = true;
        this.game.ui.toast(`The ${lc(q.item)} went down with the ship. Collect another at ${this.island(q.from).name}.`, 'warn');
      }
      if (q.type === 'salvage' && q.state === 'ready') {
        q.state = 'active'; changed = true;
        this.game.ui.toast(`The ${lc(q.item)} sank back to the bottom.`, 'warn');
      }
    }
    if (changed) { this.syncHold(); this.version++; this.game.saveVoyage(); }
  }

  // ---------------------------------------------------------------- salvage
  /** The salvage site within haul range of (x, z), if any. */
  salvageNear(x, z, r = 14) {
    for (const q of this.active) {
      if (q.type === 'salvage' && q.state === 'active' && Math.hypot(q.site.x - x, q.site.z - z) < r) return q;
    }
    return null;
  }

  haul(q) {
    const g = this.game;
    q.state = 'ready';
    this.syncHold();
    this.version++;
    g.audio.play('treasure');
    g.ui.banner(q.item, 'Salvage hauled aboard!');
    g.ui.toast('Bring it to any harbor for your reward', 'info');
    g.events.emit('quest:progress', q);
    g.spawnChestRise?.();
    g.saveVoyage();
  }

  // --------------------------------------------------------------- tracking
  /**
   * Where a quest points right now: { x, z, r?, label }. `r` marks a search
   * area rather than an exact spot.
   */
  target(q) {
    if (q.type === 'story') return this.game.story.target(q.id);
    const b = this.game.boat.pos;
    const nearestPort = () => {
      let best = null, bd = Infinity;
      for (const P of this.world.ports) {
        if (!this.game.state.discovered.has(P.id)) continue;
        const d = Math.hypot(P.dock.x - b.x, P.dock.z - b.z);
        if (d < bd) { bd = d; best = P; }
      }
      return best || this.world.home;
    };
    if (q.type === 'chart') {
      if (q.state === 'ready') { const P = nearestPort(); return { x: P.dock.x, z: P.dock.z, label: `Return to port: ${P.name}` }; }
      return { x: q.hint.x, z: q.hint.z, r: q.hint.r, label: `Search for ${this.island(q.target).name}` };
    }
    if (q.type === 'deliver') {
      if (q.state === 'lost') { const O = this.island(q.from); return { x: O.dock.x, z: O.dock.z, label: `Collect a new parcel at ${O.name}` }; }
      const T = this.island(q.target);
      return { x: T.dock.x, z: T.dock.z, label: `Deliver to ${T.name}` };
    }
    if (q.type === 'salvage') {
      if (q.state === 'ready') { const P = nearestPort(); return { x: P.dock.x, z: P.dock.z, label: `Return to port: ${P.name}` }; }
      return { x: q.site.x, z: q.site.z, label: 'Find the wreck site' };
    }
    return null;
  }

  /** One-line progress for cards and the journal. */
  status(q) {
    const t = this.target(q);
    if (q.type === 'deliver' && q.state === 'active' && q.days) {
      const left = q.days - ((this.game.state.day || 1) - q.acceptedDay);
      return `${t.label} · ${left >= 0 ? `${left} day${left === 1 ? '' : 's'} left for the bonus` : 'bonus missed'}`;
    }
    return t.label;
  }

  // ----------------------------------------------------------------- update
  update(dt, elapsed) {
    if (this.syncedVersion !== this.version || this.syncedState !== this.game.state) this.syncSites();
    for (const [id, m] of this.sites) {
      const p = m.position;
      const d = m.userData.debris;
      d.position.y = waveHeight(p.x, p.z) + 0.2 + Math.sin(elapsed * 1.7 + id.length) * 0.15;
      d.rotation.y += dt * 0.08;
    }
  }

  syncSites() {
    this.syncedVersion = this.version;
    this.syncedState = this.game.state;
    const want = new Map(this.active.filter((q) => q.type === 'salvage' && q.state === 'active').map((q) => [q.id, q]));
    for (const [id, m] of this.sites) {
      if (!want.has(id)) {
        this.game.scene.remove(m);
        m.traverse((o) => { if (o.userData.own) o.geometry?.dispose(); });
        this.sites.delete(id);
      }
    }
    for (const [id, q] of want) {
      if (this.sites.has(id)) continue;
      const m = buildSiteMesh();
      m.position.set(q.site.x, 0, q.site.z);
      this.game.scene.add(m);
      this.sites.set(id, m);
    }
  }
}
