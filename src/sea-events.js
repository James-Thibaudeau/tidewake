// The living sea's event director (Phase 7). Every few minutes of sailing it
// rolls for something to turn up between the islands (a whale, dolphins, sea
// turtles, a bottle, the glowing bloom, an iceberg, a waterspout, the ghost
// ship), places it off the bow quarter in open water, and keeps the Sightings
// log. One thing at a time: the next roll waits until the last has gone, and
// Captain Sable (rival.js) is delivered through here too, so a meeting with
// the Redwing never lands on top of a whale.
//
// The rules (what can happen where, picking, placing, the log) are in
// sightings.js; the actors are sea-life.js, sea-wonders.js and ghost-ship.js;
// the always-on gulls and fish are sea-ambient.js; the ghost ship's side
// chain is ghost-chain.js; the words are in story-text.js. Seeing a kind for
// the first time starts a report quest (reports.js), and a quest board can ask
// for a sighting (quests.js), which makes that kind likelier in its circle.
//
// "Seen" means it came within NEAR metres, or you held it in the spyglass for
// a couple of seconds; a better spyglass reaches further. Each sighting emits
// `sighting` ({ kind, x, z, day }), and the log is written from that event, so
// the crabs under the arch (reports.js) go in the same book.
//
// The director has a random stream of its own: it never draws from the
// world's. Nothing about a live event is saved; state.sightings (the log, the
// pity counts and the ghost ship's chain) is.
import * as THREE from 'three';
import { WORLD_SEED } from './config.js';
import { mulberry32, wrapAngle, damp } from './util.js';
import { waveHeight } from './waves.js';
import { propMesh } from './props.js';
import { STYLES } from './cosmetics.js';
import { siteBeam, dirWord } from './quests.js';
import { EVENTS, NEAR, SPY_RANGE, SPY_HOLD, eventWeights, applyBounties, pickKind, placeEvent, nextRoll, recordSighting } from './sightings.js';
import { Puffs, Whale, DolphinPod, Turtles } from './sea-life.js';
import { Waterspout, Iceberg, Bloom, Bottle } from './sea-wonders.js';
import { GhostShip } from './ghost-ship.js';
import { GhostChain } from './ghost-chain.js';
import { SeaAmbient } from './sea-ambient.js';
import { SIGHTINGS, BOTTLES, GHOST_LOG } from './story-text.js';

const CACHE_LIFE = 240; // seconds the ghost ship's find waits for you
const HEAR = 320;       // sounds from an event carry this far
const WAKE_GLOW = new THREE.Color(0.3, 0.92, 1.05); // the wake's light inside the bloom
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SeaEvents {
  constructor(game) {
    this.game = game;
    this.live = null;    // the event out there now: { kind, actor, seen, spyT }
    this.cache = null;   // what the ghost ship led you to: { x, z, gold, t, mesh }
    this.actors = {};    // built the first time each kind turns up, then kept
    this.puffs = null;
    this.ambient = null;
    this.chain = new GhostChain(game);
    this.timer = 200;
    this.hitCd = 0;      // seconds before the waterspout can batter the hull again
    this.wakeGlow = 0;
    this.stormy = false;
    this.rng = mulberry32(WORLD_SEED * 53 + 7);
    const ev = game.events;
    ev.on('sighting', (e) => this.record(e));
    // nothing follows you into port, onto an island or through a wreck
    for (const name of ['dock', 'wreck', 'respawn', 'ashore:enter']) ev.on(name, () => this.clear());
  }

  /** The saved part: the log, how often each kind has missed its roll, and the ghost ship's chain. */
  get S() {
    const st = this.game.state;
    const s = st.sightings && typeof st.sightings === 'object' ? st.sightings : (st.sightings = {});
    s.seen ||= {}; s.miss ||= {};
    if (s.chain === undefined) s.chain = null;
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
    return { z: g.boat.pos.z, night: g.env.night, weather: g.weather.type, chapter: g.story?.chapter ?? g.state.story?.chapter ?? 0, sea: g.sea };
  }

  /** Sightings a quest board has asked for, still to be made: [{ kind, x, z, r }]. */
  bounties() {
    return (this.game.quests?.active || []).filter((q) => q.type === 'sighting' && q.state === 'active').map((q) => ({ kind: q.kind, ...q.area }));
  }

  /** How likely each kind is here and now, with the bounties and the ghost ship's chain counted in. */
  weights() {
    const b = this.game.boat.pos, w = eventWeights(this.conditions());
    const wanted = applyBounties(w, this.bounties(), b.x, b.z);
    w.ghostShip *= this.chain.boost;
    return { w, wanted };
  }

  /** Not while Sable has your attention: the races, the tow, the kraken, or a hail across the water. */
  get blocked() {
    const rv = this.game.rival;
    return !!rv && (rv.exclusive || (!!rv.act && rv.act.type !== 'waiting'));
  }

  // ------------------------------------------------------------------ update
  /** Every frame at sea (not ashore, not on the title). */
  update(dt, elapsed) {
    const g = this.game;
    if (this.syncedState !== g.state) this.reset(g.state);
    const ctx = this.context();
    this.puffs?.update(dt);
    this.updateCache(dt, elapsed);
    this.hitCd -= dt;
    (this.ambient ||= new SeaAmbient(g.scene, this.sprays())).update(dt, { boat: ctx.boat, world: g.world, night: g.env.night, storm: g.weather.p.storm, wave: g.weather.p.wave, play: ctx.play });
    this.meetSable();
    const ev = this.live;
    this.wakeGlow = damp(this.wakeGlow, ev?.actor.wake || 0, 2, dt);
    // a storm doesn't last: when one blows up, look for its waterspout soon (once a storm)
    const stormy = g.weather.type === 'storm' && g.weather.p.storm > 0.6;
    if (stormy && !this.stormy) this.timer = Math.min(this.timer, 15 + this.rng() * 25);
    this.stormy = stormy;
    if (ev) {
      ev.actor.update(dt, ctx);
      if (!ev.seen && !ev.actor.done && this.sees(ev, dt)) this.witness(ev);
      if (ev.actor.done) this.end();
      return;
    }
    // sailing time only: not at anchor, in port, or drifting with the sail down
    if (g.mode !== 'sailing' || this.blocked || Math.abs(g.boat.speed) < 2) return;
    // inside a search circle a board has posted, the clock runs at twice the speed
    this.timer -= dt * (this.weights().wanted ? 2 : 1);
    if (this.timer <= 0) this.roll();
  }

  /**
   * Captain Sable is delivered by the director: with nothing of theirs live,
   * rival.js is asked whether the Redwing should appear. A meeting at sea
   * waits for the sea to be clear, so whatever is out there is sent on its way.
   */
  meetSable() {
    const g = this.game, rv = g.rival;
    if (!rv || rv.act || rv.cool > 0 || g.mode !== 'sailing') return;
    if (rv.spawn(g.boat.pos, !this.live) === 'wait') this.live?.actor.leave();
  }

  /** What an actor is told each frame, and what it can do to the ship and the sea. */
  context() {
    const g = this.game, b = g.boat;
    return {
      boat: { x: b.pos.x, z: b.pos.z, heading: b.heading, speed: g.mode === 'sailing' ? b.speed : 0 },
      sea: g.world, night: g.env.night,
      play: (name, x, z) => this.play(name, x, z),
      say: (text) => g.ui.toast(text, 'info'),
      bump: (x, z, r, kind, soft) => this.bump(x, z, r, kind, soft),
      knock: (damage, kind) => { if (g.mode === 'sailing') g.damage(damage * (1 - g.upv.keel * 0.5), kind); },
      batter: (x, z, r, damage) => this.batter(x, z, r, damage),
      glow: (x, z, r, k) => g.ocean.uniforms.uBloom.value.set(x, z, r, k),
    };
  }

  /** A sound from out on the water, quieter with distance. */
  play(name, x, z) {
    const b = this.game.boat.pos, v = 1.15 - Math.hypot(x - b.x, z - b.z) / HEAR;
    if (v > 0.05) this.game.audio.play(name, { volume: Math.min(1, v) });
  }

  /**
   * Something solid in the water (ice, a whale): the boat is kept out of it,
   * and a hard knock costs hull, as a rock does (`soft` scales that: a whale
   * gives). Returns false if the boat is clear of it, 'hit' for a hard knock,
   * true for a touch.
   */
  bump(x, z, r, kind, soft = 1) {
    const g = this.game, b = g.boat;
    if (g.mode !== 'sailing') return false;
    let nx = b.pos.x - x, nz = b.pos.z - z;
    const d = Math.hypot(nx, nz) || 1, reach = r + 2.4 * b.sizeScale;
    if (d >= reach) return false;
    nx /= d; nz /= d;
    const into = -(Math.sin(b.heading) * nx + Math.cos(b.heading) * nz) * b.speed;
    b.pos.x += nx * (reach - d); b.pos.z += nz * (reach - d);
    if (into > 3 && b.hitCooldown <= 0) {
      b.hitCooldown = 0.8;
      b.push.set(nx * into * 0.7, nz * into * 0.7);
      b.speed *= -0.3;
      g.damage((into - 3) * 4.5 * soft * (1 - g.upv.keel * 0.4), kind);
      return 'hit';
    }
    if (into > 0) b.speed *= 0.92;
    return true;
  }

  /** The waterspout: within r of it the hull takes `damage` (less with a better keel) and the boat is thrown clear. */
  batter(x, z, r, damage) {
    const g = this.game, b = g.boat;
    if (g.mode !== 'sailing' || this.hitCd > 0) return;
    let nx = b.pos.x - x, nz = b.pos.z - z;
    const d = Math.hypot(nx, nz) || 1;
    if (d >= r + 2.4 * b.sizeScale) return;
    nx /= d; nz /= d;
    this.hitCd = 1.3;
    b.push.set(nx * 10, nz * 10);
    b.speed *= 0.5;
    g.damage(damage * (1 - g.upv.keel * 0.5), 'spout');
  }

  /** The wake's light: blue while the boat is in the glowing bloom. (Called by the game after it sets the day's light.) */
  tintWake(color) { if (this.wakeGlow > 0.01) color.lerp(WAKE_GLOW, this.wakeGlow); }

  roll() {
    const kind = pickKind(this.rng, this.weights().w, this.S.miss);
    // nothing can happen here and now, or there's no room: look again in a minute
    if (!kind || !this.spawn(kind)) this.timer = 45 + this.rng() * 45;
  }

  /** Bring an event on now. Returns false if there's no open water to put it in. */
  spawn(kind, { say = true } = {}) {
    const g = this.game, b = g.boat;
    if (!EVENTS[kind]) return false;
    if (this.live) this.end();
    const boat = { x: b.pos.x, z: b.pos.z, heading: b.heading, speed: b.speed };
    const at = placeEvent(this.rng, g.world, boat, EVENTS[kind].place);
    if (!at) return false;
    const actor = this.actor(kind);
    // with the chain begun, the ghost ship has somewhere to take you
    actor.start({ at, boat, rng: this.rng, sea: g.world, cove: kind === 'ghostShip' ? this.chain.cove(at) : null });
    this.live = { kind, actor, seen: false, spyT: 0 };
    if (say) g.ui.toast(fill(SIGHTINGS[kind].cue, { side: at.side > 0 ? 'right' : 'left' }), kind === 'waterspout' ? 'warn' : 'info');
    if (kind === 'ghostShip') this.play('ghost', at.x, at.z);
    return true;
  }

  sprays() { return (this.puffs ||= new Puffs(this.game.scene)); }

  actor(kind) {
    const scene = this.game.scene, puffs = this.sprays();
    const make = {
      whale: () => new Whale(scene, puffs), dolphins: () => new DolphinPod(scene, puffs), turtles: () => new Turtles(scene),
      waterspout: () => new Waterspout(scene, puffs), iceberg: () => new Iceberg(scene, puffs), bloom: () => new Bloom(),
      bottle: () => new Bottle(scene), ghostShip: () => new GhostShip(scene),
    };
    return (this.actors[kind] ||= make[kind]());
  }

  /** The event has gone: the clock starts for the next one. */
  end() {
    const ev = this.live;
    if (!ev) return;
    this.live = null;
    ev.actor.stop();
    this.game.ocean.uniforms.uBloom.value.w = 0;
    if (ev.actor.cacheAt) { this.dropCache(ev.actor.cacheAt); ev.actor.cacheAt = null; }
    if (ev.actor.ledTo) { this.followed(ev.actor.ledTo); ev.actor.ledTo = null; }
    this.timer = nextRoll(this.rng);
  }

  /** Drop everything at once (port, island, wreck, another voyage). */
  clear() {
    if (this.live) { this.live.actor.stop(); this.live = null; this.timer = nextRoll(this.rng); }
    this.game.ocean.uniforms.uBloom.value.w = 0;
    this.wakeGlow = 0;
    this.puffs?.clear();
    this.ambient?.clear();
    this.removeCache();
  }

  // ----------------------------------------------------------------- seeing
  /** Close enough, or held in the spyglass for long enough. */
  sees(ev, dt) {
    const g = this.game, b = g.boat.pos, p = ev.actor.pos;
    const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
    if (d < (EVENTS[ev.kind].near ?? NEAR)) return true;
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
      // the bottle's news is inside it (openBottle); the rest is worth telling as it is
      if (e.kind !== 'bottle') g.reports?.start(e.kind, e);
    }
    if (e.kind === 'ghostShip') this.chain.onSighting(r.n);
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

  // ------------------------------------------------- the ghost ship's leads
  /** You followed her to the island she was making for (ghost-chain.js): the chain moves on. */
  followed(lead) {
    const g = this.game, I = g.world.islands[lead.island];
    if (!I) return;
    this.chain.arrive(lead.island);
    g.ui.toast(fill(GHOST_LOG.fades, { place: I.name }), 'gold');
  }

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

  // -------------------------------------------------------------- the bottle
  /** Contextual action while sailing: haul up a bottle, or what the ghost ship left. */
  interaction(x, z, speed) {
    const ev = this.live, c = this.cache, slow = Math.abs(speed) < 7;
    if (ev?.kind === 'bottle' && !ev.actor.done && ev.actor.phase === 'bob' && Math.hypot(ev.actor.pos.x - x, ev.actor.pos.z - z) < 13) {
      return slow ? { prompt: SIGHTINGS.bottlePrompt, action: () => this.openBottle() } : { prompt: SIGHTINGS.bottleSlow };
    }
    if (!c || Math.hypot(c.x - x, c.z - z) > 14) return null;
    return slow ? { prompt: SIGHTINGS.cachePrompt, action: () => this.haulCache() } : { prompt: SIGHTINGS.cacheSlow };
  }

  /**
   * What's in the bottle. The first holds a letter to carry to a harbor some
   * way off (a report that never goes stale); after that, turn about, a scrap
   * of chart showing an island you haven't found, and a note from a stranger.
   */
  async openBottle() {
    const g = this.game, ev = this.live;
    if (ev?.kind !== 'bottle') return;
    if (!ev.seen) this.witness(ev);
    const at = { x: ev.actor.pos.x, z: ev.actor.pos.z };
    ev.actor.stop();
    this.end();
    const s = this.S.seen.bottle, n = (s.opened = (s.opened || 0) + 1);
    g.audio.play('treasure');
    let page;
    const port = this.letterPort(at), isle = n % 2 === 0 ? this.uncharted(at) : null;
    if (!g.reports.R.bottle && port && g.reports.start('bottle', port.dock)) {
      page = { title: BOTTLES.letter.title, items: [{ icon: 'letters', name: fill(BOTTLES.letter.name, { port: port.name }), text: BOTTLES.letter.text }], main: BOTTLES.letter.main };
    } else if (isle) {
      g.state.discovered.add(isle.id);
      g.state.stats.discoveries = g.state.discovered.size;
      g.revealAround(isle.x, isle.z, isle.r + 160);
      g.events.emit('discover', isle, 'map');
      page = { title: BOTTLES.chart.title, items: [{ icon: 'map', name: isle.name, text: fill(BOTTLES.chart.text, { place: isle.name }) }] };
    } else {
      // the notes come in order, and round again
      const notes = BOTTLES.notes, k = (s.notes = (s.notes || 0) + 1) - 1;
      page = { title: BOTTLES.note.title, items: [{ icon: 'scroll', name: BOTTLES.note.name, text: notes[k % notes.length] }] };
    }
    g.saveVoyage();
    await sleep(700); // the sighting's banner first
    while (g.ui.isStoryOpen || g.ui.isFoundOpen) await sleep(200);
    await g.ui.showFound({ eyebrow: BOTTLES.eyebrow, main: 'Wonderful!', ...page });
  }

  /** Who the letter is for: a harbor a fair sail away (the third nearest), so carrying it is a voyage. */
  letterPort(at) {
    const ports = [...this.game.world.ports].sort((a, b) => Math.hypot(a.dock.x - at.x, a.dock.z - at.z) - Math.hypot(b.dock.x - at.x, b.dock.z - at.z));
    return ports[Math.min(2, ports.length - 1)] || null;
  }

  /** The nearest island that isn't on your chart yet. */
  uncharted(at) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const I of g.world.islands) {
      if (I.port || g.state.discovered.has(I.id)) continue;
      const d = Math.hypot(I.x - at.x, I.z - at.z);
      if (d < bd) { bd = d; best = I; }
    }
    return best;
  }

  // ------------------------------------------------------------------ debug
  /** For `tidewake.debug.sea()`: what's out there, and what could be. */
  debugState() {
    const ev = this.live, b = this.game.boat.pos;
    return {
      live: ev ? { kind: ev.kind, seen: ev.seen, phase: ev.actor.phase, x: Math.round(ev.actor.pos.x), z: Math.round(ev.actor.pos.z), dist: Math.round(Math.hypot(ev.actor.pos.x - b.x, ev.actor.pos.z - b.z)) } : null,
      nextRoll: Math.round(this.timer), blocked: this.blocked, weights: this.weights().w, bounties: this.bounties(),
      cache: this.cache ? { x: Math.round(this.cache.x), z: Math.round(this.cache.z), gold: this.cache.gold } : null,
      seen: JSON.parse(JSON.stringify(this.S.seen)), miss: { ...this.S.miss }, chain: this.S.chain,
    };
  }
}
