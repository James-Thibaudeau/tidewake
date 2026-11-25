// The living sea's event director (Phase 7). Every few minutes of sailing it
// rolls for something to turn up between the islands (a whale, a pod of
// dolphins, the ghost ship), places it off the bow quarter in open water, and
// keeps the Sightings log. One event at a time: the next roll waits until the
// last one has gone.
//
// The rules (what can happen where, picking, placing, the log) are in
// sightings.js; the creatures are sea-life.js and ghost-ship.js; the words are
// SIGHTINGS in story-text.js. Seeing something for the first time starts a
// report quest (reports.js).
//
// "Seen" means it came within NEAR metres, or you held it in the spyglass for
// a couple of seconds; a better spyglass reaches further. Each sighting emits
// `sighting` ({ kind, x, z, day }), and the log is written from that event, so
// the crabs under the arch (reports.js) go in the same book.
//
// The director has a random stream of its own: it never draws from the
// world's. Nothing about a live event is saved; state.sightings (the log and
// the pity counts) is.
import * as THREE from 'three';
import { WORLD_SEED } from './config.js';
import { mulberry32, wrapAngle } from './util.js';
import { waveHeight } from './waves.js';
import { propMesh } from './props.js';
import { STYLES } from './cosmetics.js';
import { siteBeam, dirWord } from './quests.js';
import { EVENTS, NEAR, SPY_RANGE, SPY_HOLD, eventWeights, pickKind, placeEvent, nextRoll, recordSighting } from './sightings.js';
import { Puffs, Whale, DolphinPod } from './sea-life.js';
import { GhostShip } from './ghost-ship.js';
import { SIGHTINGS } from './story-text.js';

const CACHE_LIFE = 240; // seconds the ghost ship's find waits for you
const HEAR = 320;       // sounds from an event carry this far
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SeaEvents {
  constructor(game) {
    this.game = game;
    this.live = null;    // the event out there now: { kind, actor, seen, spyT }
    this.cache = null;   // what the ghost ship led you to: { x, z, gold, t, mesh }
    this.actors = {};    // built the first time each kind turns up, then kept
    this.puffs = null;
    this.timer = 200;
    this.rng = mulberry32(WORLD_SEED * 53 + 7);
    const ev = game.events;
    ev.on('sighting', (e) => this.record(e));
    // nothing follows you into port, onto an island or through a wreck
    for (const name of ['dock', 'wreck', 'respawn', 'ashore:enter']) ev.on(name, () => this.clear());
  }

  /** The saved part: the log, and how often each kind has missed its roll. */
  get S() {
    const st = this.game.state;
    const s = st.sightings && typeof st.sightings === 'object' ? st.sightings : (st.sightings = {});
    s.seen ||= {}; s.miss ||= {};
    return s;
  }
  /** The player's sail drive: a little more while dolphins ride the bow wave. */
  get drive() { return this.live?.actor.boost ?? 1; }

  /** A different voyage was loaded or started: drop whatever was live, and start the clock. */
  reset(state) {
    this.syncedState = state;
    this.clear();
    const seen = Object.values(this.S.seen).reduce((n, s) => n + (s.n || 0), 0);
    this.rng = mulberry32((WORLD_SEED * 53 + (state.day || 1) * 7919 + seen * 131 + Math.floor(state.stats?.distance || 0)) | 0);
    // the first one comes a little sooner than the rest
    this.timer = 120 + this.rng() * 120;
  }

  /** Where and when, for the weights. */
  conditions() {
    const g = this.game;
    return { z: g.boat.pos.z, night: g.env.night, weather: g.weather.type, chapter: g.story?.chapter ?? g.state.story?.chapter ?? 0 };
  }

  /** Not while Sable has your attention: her races, the tow, the kraken, or a hail across the water. */
  get blocked() {
    const rv = this.game.rival;
    return !!rv && (rv.exclusive || (!!rv.act && rv.act.type !== 'waiting'));
  }

  // ------------------------------------------------------------------ update
  /** Every frame at sea (not ashore, not on the title). */
  update(dt, elapsed) {
    const g = this.game;
    if (this.syncedState !== g.state) this.reset(g.state);
    this.puffs?.update(dt);
    this.updateCache(dt, elapsed);
    const ev = this.live;
    if (ev) {
      ev.actor.update(dt, this.context());
      if (!ev.seen && !ev.actor.done && this.sees(ev, dt)) this.witness(ev);
      if (ev.actor.done) this.end();
      return;
    }
    // sailing time only: not at anchor, in port, or drifting with the sail down
    if (g.mode !== 'sailing' || this.blocked || Math.abs(g.boat.speed) < 2) return;
    this.timer -= dt;
    if (this.timer <= 0) this.roll();
  }

  /** What an actor is told each frame. */
  context() {
    const g = this.game, b = g.boat;
    return {
      boat: { x: b.pos.x, z: b.pos.z, heading: b.heading, speed: g.mode === 'sailing' ? b.speed : 0 },
      sea: g.world, night: g.env.night,
      play: (name, x, z) => this.play(name, x, z),
      say: (text) => g.ui.toast(text, 'info'),
    };
  }

  /** A sound from out on the water, quieter with distance. */
  play(name, x, z) {
    const b = this.game.boat.pos, v = 1.15 - Math.hypot(x - b.x, z - b.z) / HEAR;
    if (v > 0.05) this.game.audio.play(name, { volume: Math.min(1, v) });
  }

  roll() {
    const kind = pickKind(this.rng, eventWeights(this.conditions()), this.S.miss);
    // nothing can happen here and now, or there's no room: look again in a minute
    if (!kind || !this.spawn(kind)) this.timer = 45 + this.rng() * 45;
  }

  /** Bring an event on now. Returns false if there's no open water to put it in. */
  spawn(kind, { say = true } = {}) {
    const g = this.game, b = g.boat;
    if (!EVENTS[kind]) return false;
    if (this.live) this.end();
    const boat = { x: b.pos.x, z: b.pos.z, heading: b.heading, speed: b.speed };
    const at = placeEvent(this.rng, g.world, boat);
    if (!at) return false;
    const actor = this.actor(kind);
    actor.start({ at, boat, rng: this.rng, sea: g.world });
    this.live = { kind, actor, seen: false, spyT: 0 };
    if (say) g.ui.toast(fill(SIGHTINGS[kind].cue, { side: at.side > 0 ? 'right' : 'left' }), 'info');
    if (kind === 'ghostShip') this.play('ghost', at.x, at.z);
    return true;
  }

  actor(kind) {
    const scene = this.game.scene;
    this.puffs ||= new Puffs(scene);
    return (this.actors[kind] ||= kind === 'whale' ? new Whale(scene, this.puffs) : kind === 'dolphins' ? new DolphinPod(scene, this.puffs) : new GhostShip(scene));
  }

  /** The event has gone: the clock starts for the next one. */
  end() {
    const ev = this.live;
    if (!ev) return;
    this.live = null;
    ev.actor.stop();
    if (ev.actor.cacheAt) { this.dropCache(ev.actor.cacheAt); ev.actor.cacheAt = null; }
    this.timer = nextRoll(this.rng);
  }

  /** Drop everything at once (port, island, wreck, another voyage). */
  clear() {
    if (this.live) { this.live.actor.stop(); this.live = null; this.timer = nextRoll(this.rng); }
    this.puffs?.clear();
    this.removeCache();
  }

  // ----------------------------------------------------------------- seeing
  /** Close enough, or held in the spyglass for long enough. */
  sees(ev, dt) {
    const g = this.game, b = g.boat.pos, p = ev.actor.pos;
    const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
    if (d < NEAR) return true;
    const tier = g.state.upgrades.spyglass || 0;
    if (!g.spyOn || d > SPY_RANGE[tier]) { ev.spyT = 0; return false; }
    const half = (g.cam.fov * Math.PI) / 360 * Math.max(1, g.camera.aspect) * 0.8;
    const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - g.cam.spyYaw));
    ev.spyT = off < half + Math.atan2(ev.actor.size, d) ? ev.spyT + dt : 0;
    return ev.spyT >= SPY_HOLD;
  }

  witness(ev) {
    const g = this.game, p = ev.actor.pos;
    ev.seen = true;
    g.events.emit('sighting', { kind: ev.kind, x: p.x, z: p.z, day: g.state.day || 1 });
  }

  /** "north of Port Haven": the nearest place on your chart. */
  whereWords(x, z) {
    const g = this.game;
    let best = g.world.home, bd = Infinity;
    for (const I of g.world.islands) {
      if (!g.state.discovered.has(I.id)) continue;
      const d = Math.hypot(I.x - x, I.z - z);
      if (d < bd) { bd = d; best = I; }
    }
    return bd < best.r + 120 ? `off ${best.name}` : `${dirWord(x - best.x, z - best.z)} of ${best.name}`;
  }

  /** Any sighting goes in the log; the living sea's own also get a banner and a report to make. */
  record(e) {
    const g = this.game, S = this.S;
    const r = recordSighting(S.seen, e.kind, { day: e.day || g.state.day || 1, near: this.whereWords(e.x, e.z) });
    S.miss[e.kind] = 0;
    const T = SIGHTINGS[e.kind];
    if (EVENTS[e.kind] && T) {
      g.audio.play('sighting');
      g.ui.banner(T.name, r.first ? SIGHTINGS.first : fill(SIGHTINGS.again, { n: r.n }));
      if (r.first) setTimeout(() => g.ui.toast(T.tip, 'info'), 1200);
      g.reports?.start(e.kind, e);
    }
    if (r.milestone) this.reward(e.kind, r.milestone);
    g.saveVoyage();
  }

  /** A milestone's piece for the wardrobe, shown once the banner has had its moment. */
  async reward(kind, M) {
    const g = this.game, T = SIGHTINGS.rewards[kind], item = STYLES.find((s) => s.id === M.cosmetic);
    if (!T || !item || !g.unlockCosmetic(M.cosmetic, 'sighting')) return;
    await sleep(2600);
    while (g.ui.isStoryOpen || g.ui.isFoundOpen) await sleep(200);
    g.audio.play('treasure');
    await g.ui.showFound({ eyebrow: SIGHTINGS.rewardEyebrow, title: T.title, items: [{ icon: 'needle', name: item.name, text: T.text }], main: 'Wonderful!' });
  }

  // ------------------------------------------------- the ghost ship's find
  dropCache(at) {
    this.removeCache();
    const mesh = new THREE.Group();
    const beam = siteBeam();
    const box = propMesh('chest');
    box.rotation.set(0.25, this.rng() * 6, 0.15);
    mesh.add(beam, box);
    mesh.userData.box = box;
    mesh.position.set(at.x, 0, at.z);
    this.game.scene.add(mesh);
    this.cache = { x: at.x, z: at.z, gold: 110 + Math.floor(this.rng() * 9) * 10, t: CACHE_LIFE, mesh };
  }

  removeCache() {
    if (!this.cache) return;
    this.game.scene.remove(this.cache.mesh);
    this.cache = null;
  }

  updateCache(dt, elapsed) {
    const c = this.cache;
    if (!c) return;
    const b = this.game.boat.pos, box = c.mesh.userData.box;
    box.position.y = waveHeight(c.x, c.z) + 0.1 + Math.sin(elapsed * 1.6) * 0.12;
    box.rotation.y += dt * 0.15;
    c.t -= dt;
    if (c.t <= 0 || Math.hypot(c.x - b.x, c.z - b.z) > 1500) this.removeCache();
  }

  /** Contextual action while sailing: haul up what the ghost ship left. */
  interaction(x, z, speed) {
    const c = this.cache;
    if (!c || Math.hypot(c.x - x, c.z - z) > 14) return null;
    if (Math.abs(speed) >= 7) return { prompt: SIGHTINGS.cacheSlow };
    return { prompt: SIGHTINGS.cachePrompt, action: () => this.haulCache() };
  }

  haulCache() {
    const g = this.game, c = this.cache;
    if (!c) return;
    g.state.cargo += c.gold;
    this.removeCache();
    g.audio.play('treasure');
    g.ui.banner(fill(SIGHTINGS.cacheTitle, { gold: c.gold }), SIGHTINGS.cacheSub);
    g.spawnChestRise();
    g.saveVoyage();
  }

  // ------------------------------------------------------------------ debug
  /** For `tidewake.debug.sea()`: what's out there, and what could be. */
  debugState() {
    const ev = this.live, b = this.game.boat.pos;
    return {
      live: ev ? { kind: ev.kind, seen: ev.seen, phase: ev.actor.phase, x: Math.round(ev.actor.pos.x), z: Math.round(ev.actor.pos.z), dist: Math.round(Math.hypot(ev.actor.pos.x - b.x, ev.actor.pos.z - b.z)) } : null,
      nextRoll: Math.round(this.timer), blocked: this.blocked, weights: eventWeights(this.conditions()),
      cache: this.cache ? { x: Math.round(this.cache.x), z: Math.round(this.cache.z), gold: this.cache.gold } : null,
      seen: JSON.parse(JSON.stringify(this.S.seen)), miss: { ...this.S.miss },
    };
  }
}
