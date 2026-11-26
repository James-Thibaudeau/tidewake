// The rival captain. Sable keeps turning up in a ship with crimson sails:
// races at sea and on foot, a tow after a storm, a letter, and at the end a
// rescue from the kraken (see docs/rival-captain.md). This module owns the
// story state, decides when and where each encounter happens, and drives the
// redwing between the set pieces; the races, the tow line and the kraken live
// in race.js, tow.js, kraken.js and ashore/pacer.js.
//
// state.rival = { chapter, wins, losses, flags, log }
//   chapter 0-5  the next encounter is ENCOUNTERS[chapter]
//   chapter 6    Sable is refitting at flags.port: bring the letter
//   chapter 7    the Deep: a flare at dusk (flags.flare), then the kraken
//   chapter 8    friends: Sable visits ports, rematches for gold
//   log          everything Sable has said to you, for the journal:
//                [{ title, day, lines, scene? }], oldest first (scene: a story card deck)
//   flags.relicsIsle  the island Sable was found waiting on for the relic
//                scramble. The scramble is on a tropical island, but a save
//                that had already found Sable on its old temperate island
//                (before Phase 4.6) keeps that one.
// Nothing about a live encounter is saved: quit mid-race and Sable simply
// turns up again.
import * as THREE from 'three';
import { WORLD_HALF } from './config.js';
import { mulberry32, headingOf, bearingDeg, clamp, TAU } from './util.js';
import { glowBoost } from './toon.js';
import { Boat } from './boat.js';
import { AutoHelm, planCourse, raceWater, SeaRace } from './race.js';
import { TowLine } from './tow.js';
import { Kraken } from './kraken.js';
import { SPEAKER, CRIMSON, SABLE_PROFILE, SABLE_LIVERY, ENCOUNTERS, LETTER, DEEP, CARDS, REWARDS, TITLE, FRIEND, LINES } from './rival-text.js';

export const FINAL_CHAPTER = 8;
const SEE = 950;          // the Redwing appears when you're this close to where it waits
const HAIL = 62;          // close enough to shout across the water
const TOW_DRIVE = 0.72;   // how much of your sail's drive is left with a ship in tow
const LOG_MAX = 80;       // conversations kept in the journal
// Sable's ship keeps up with yours: every part is at least this tier, and
// matches yours once you've passed it (so she grows into a galleon when you do).
const SHIP_FLOOR = { sail: 2, hull: 1, rudder: 2, keel: 1, lantern: 1, spyglass: 0 };
const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const dirWord = (dx, dz) => POINTS[Math.round(bearingDeg(headingOf(dx, dz)) / 45) % 8];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Rival {
  constructor(game) {
    this.game = game;
    this.act = null;        // what Sable is doing right now (never saved)
    this.redwing = null;      // built the first time it's needed
    this.cool = 12;         // seconds before the next spawn attempt
    this.flareT = 0;
    this._dye = null;
    const ev = game.events;
    ev.on('dock', (port) => this.onDock(port));
    ev.on('wreck', () => this.onWreck());
    ev.on('ashore:leave', () => this.onLeaveIsland());
    ev.on('upgrade', () => this.syncShip());
    ev.on('story:chest', () => { if (this.R.flags.met) game.ui.toast(LETTER.found.text, 'info'); });
  }

  // ------------------------------------------------------------------ state
  get R() {
    const st = this.game.state;
    if (!st.rival || typeof st.rival !== 'object') st.rival = { chapter: 0, wins: 0, losses: 0, flags: {} };
    const r = st.rival;
    r.chapter ||= 0; r.wins ||= 0; r.losses ||= 0; r.flags ||= {};
    if (!Array.isArray(r.log)) r.log = [];
    return r;
  }
  get chapter() { return this.R.chapter; }
  get world() { return this.game.world; }
  get player() { return this.game.boat; }
  vars(extra = {}) { return { captain: this.game.state.profile?.name || 'Captain', ...extra }; }
  /** Sable calls across the water; the lines go in the journal under `title` too. */
  say(title, lines) {
    const said = lines.map((l) => fill(l, this.vars()));
    this.remember(title, said);
    return this.game.ui.hail(SPEAKER, said);
  }
  /** A deck of story cards, logged as a scene under its first card's title. */
  scene(deck) {
    this.remember(deck[0].title, deck.map((c) => fill(c.text, this.vars())), true);
    return this.game.ui.showStoryCards(deck);
  }

  /** Keep lines for the journal: new ones join today's entry of the same title; repeats are dropped. */
  remember(title, lines, scene = false) {
    const log = this.R.log, day = this.game.state.day || 1;
    const heard = new Set(log.filter((e) => e.title === title).flatMap((e) => e.lines));
    const fresh = lines.filter((l) => !heard.has(l));
    if (!fresh.length) return;
    const last = log[log.length - 1];
    if (last && last.title === title && last.day === day && !last.scene === !scene) last.lines.push(...fresh);
    else log.push(scene ? { title, day, scene: true, lines: fresh } : { title, day, lines: fresh });
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  }

  /** A sea race is on: the game shows no other prompts and hides the quest tracker. */
  get racing() { return this.act?.type === 'race'; }
  /** No docking, landing or hauling while a race or the kraken has your attention. */
  get exclusive() { return this.racing || this.act?.type === 'kraken'; }
  /** The player's boat is held still (the countdown). */
  get hold() { return !!(this.racing && this.act.race.hold); }
  /** How much of the sail's drive the player keeps (less with a ship in tow). */
  get drive() { return this.towing ? TOW_DRIVE : 1; }
  get towing() { return this.act?.type === 'tow' || (this.act?.type === 'kraken' && this.act.kraken.phase === 'tow'); }

  // ------------------------------------------------------------- conditions
  /** The soft gate for each encounter: Sable keeps pace with the main story and your ship. */
  gate(i) {
    if (this.forced) return true;
    const st = this.game.story, up = this.game.state.upgrades;
    switch (i) {
      case 0: return st.chapter >= 2;                         // Journal I found
      case 1: return st.chapter >= 3 && up.sail >= 1;         // Journal II, better sails
      case 2: return st.canGoAshore;
      case 3: return st.chapter >= 5 && up.rudder >= 1;       // Journal IV
      case 4: return st.chapter >= 6 && st.canGoAshore && this.relicsOpen(); // Journal V, and an anchor that holds where Sable is
      case 5: return st.chapter >= 7 && up.hull >= 2;         // Journal VI
      default: return false;
    }
  }

  /** Can your anchor hold on the relic scramble's island? (The tropical one needs the coral flukes.) */
  relicsOpen() {
    const at = this.places.relics, I = at && this.world.islands[at.island];
    return !I || !!this.game.refits?.holds(I);
  }

  /** The encounter that could happen now, or null. Needs a new day since the last one. */
  ready() {
    const R = this.R, i = R.chapter;
    if (i >= ENCOUNTERS.length || !this.gate(i)) return null;
    if (i > 0 && !this.forced && (this.game.state.day || 1) <= (R.flags.day || 0)) return null;
    return ENCOUNTERS[i];
  }

  // ------------------------------------------------------------------ places
  /**
   * Where each encounter happens: fixed for this world (own RNG, like the
   * camps), except that the relic scramble stays wherever Sable was first
   * found waiting for it (flags.relicsIsle).
   */
  get places() {
    const P = this._places ||= this.findPlaces(), R = this.R;
    // a save from before the scramble moved, with Sable already found on the old island: keep it there
    if (R.chapter === 4 && R.flags.heard === 4 && R.flags.relicsIsle == null && this._oldRelics) R.flags.relicsIsle = this._oldRelics.island;
    const id = R.flags.relicsIsle;
    if (id == null || id === P.relics?.island || !this.world.islands[id]) return P;
    if (this._keptRelics?.relics.island !== id) {
      const I = this.world.islands[id];
      this._keptRelics = { ...P, relics: { island: I.id, x: I.x, z: I.z, place: I.name } };
    }
    return this._keptRelics;
  }

  findPlaces() {
    const W = this.world, H = W.home, rng = mulberry32(W.seed * 53 + 0x5ab1e);
    const P = {};
    // open water between two ports a fair sail apart
    const pairs = [];
    for (const A of W.ports) for (const B of W.ports) {
      if (A.id >= B.id) continue;
      const d = dist(A.dock, B.dock);
      const mx = (A.dock.x + B.dock.x) / 2, mz = (A.dock.z + B.dock.z) / 2;
      if (d > 1800 && d < 4600) pairs.push({ A, B, mx, mz, score: Math.abs(Math.hypot(mx - H.x, mz - H.z) - 2200) + rng() * 300 });
    }
    pairs.sort((a, b) => a.score - b.score);
    for (const p of pairs) {
      const s = this.openSpot(p.mx, p.mz, 450, 320, rng);
      if (s) { P.open = { ...s, a: p.A.name, b: p.B.name }; break; }
    }
    // rocky waters: off Archway Isle
    const arch = W.islands.find((I) => I.landmark === 'arch') || W.islands.find((I) => I.biome === 'rocky');
    if (arch) {
      for (let t = 0; t < 60 && !P.fog; t++) {
        const a = rng() * TAU, d = arch.bound + 420 + rng() * 380;
        const s = this.openSpot(arch.x + Math.cos(a) * d, arch.z + Math.sin(a) * d, 0, 240, rng);
        if (s) P.fog = { ...s, place: arch.name, ref: arch };
      }
    }
    // two islands to race on foot: a gentle one fairly near home, and one down south
    const campII = this.game.story?.camps?.II?.island;
    // temperate only: every captain can land there, and new biomes don't move Sable's races in old saves
    const landable = W.islands.filter((I) => this.game.ashore?.canLand(I) && I.biome === 'temperate' && !I.landmark && I.id !== campII && I.r > 70);
    const near = [...landable].sort((a, b) => Math.abs(Math.hypot(a.x, a.z) - 1300) - Math.abs(Math.hypot(b.x, b.z) - 1300))[0];
    if (near) P.hill = { island: near.id, x: near.x, z: near.z, place: near.name };
    // where the relic scramble was before tropical islands could be landed on (old saves may keep it)
    const south = landable.filter((I) => I !== near && Math.hypot(I.x, I.z) < 3500).sort((a, b) => b.z - a.z)[0];
    this._oldRelics = south ? { island: south.id, x: south.x, z: south.z, place: south.name } : null;
    // the relic scramble: a tropical island a fair sail from home (needs the coral flukes)
    const tropic = W.islands.filter((I) => this.game.ashore?.canLand(I) && I.biome === 'tropical' && !I.landmark && I.id !== campII && I.r > 70)
      .sort((a, b) => Math.abs(Math.hypot(a.x, a.z) - 1600) - Math.abs(Math.hypot(b.x, b.z) - 1600))[0];
    P.relics = tropic ? { island: tropic.id, x: tropic.x, z: tropic.z, place: tropic.name } : this._oldRelics;
    // far out, a long way from any harbor
    for (let t = 0; t < 400 && !P.mast; t++) {
      const x = (rng() * 2 - 1) * (WORLD_HALF - 900), z = (rng() * 2 - 1) * (WORLD_HALF - 900);
      const far = t < 250 ? 1300 : 900;
      if (Math.hypot(x - H.x, z - H.z) < 2600 || W.ports.some((p) => dist(p.dock, { x, z }) < far)) continue;
      const s = this.openSpot(x, z, 0, 380, rng);
      if (s) P.mast = s;
    }
    // the Deep: the emptiest water on the chart
    let best = null;
    for (let x = -WORLD_HALF + 1100; x <= WORLD_HALF - 1100; x += 300) for (let z = -WORLD_HALF + 1100; z <= WORLD_HALF - 1100; z += 300) {
      let room = Infinity;
      for (const I of W.islands) room = Math.min(room, Math.hypot(I.x - x, I.z - z) - I.bound);
      for (const F of W.reefs) room = Math.min(room, Math.hypot(F.x - x, F.z - z) - F.bound);
      if (W.wreck) room = Math.min(room, Math.hypot(W.wreck.x - x, W.wreck.z - z) - W.wreck.bound);
      // …that is neither rough water nor home waters, anywhere in the trench (300 m: the most its r can be)
      if ([[0, 0], [300, 0], [-300, 0], [0, 300], [0, -300]].some(([ox, oz]) => !raceWater(x + ox, z + oz))) continue;
      if (!best || room > best.room) best = { x, z, room };
    }
    P.deep = { x: best.x, z: best.z, r: clamp(best.room - 120, 220, 300) };
    for (const k of ['open', 'fog', 'mast']) {
      if (!P[k]) continue;
      // the chart's search circle contains the spot but isn't centred on it
      const a = rng() * TAU, off = rng() * 200;
      P[k].hint = { x: P[k].x + Math.cos(a) * off, z: P[k].z + Math.sin(a) * off, r: 460 };
      const port = this.nearestPort(P[k].x, P[k].z, false), ref = P[k].ref || port.dock;
      P[k].dir = dirWord(P[k].x - ref.x, P[k].z - ref.z);
      P[k].place ||= port.name;
    }
    return P;
  }

  /** Deep water with nothing within `clear` of it, at or near (x, z). */
  openSpot(x, z, jitter, clear, rng) {
    const W = this.world;
    for (let t = 0; t < (jitter ? 30 : 1); t++) {
      const px = x + (t ? (rng() - 0.5) * 2 * jitter : 0), pz = z + (t ? (rng() - 0.5) * 2 * jitter : 0);
      if (this.isOpen(px, pz, clear)) return { x: px, z: pz };
    }
    return null;
  }

  isOpen(x, z, clear) {
    const W = this.world;
    if (Math.abs(x) > WORLD_HALF - 700 || Math.abs(z) > WORLD_HALF - 700) return false;
    if (W.islands.some((I) => Math.hypot(I.x - x, I.z - z) < I.bound + clear)) return false;
    if (W.reefs.some((F) => Math.hypot(F.x - x, F.z - z) < F.bound + clear * 0.5)) return false;
    if (W.wreck && Math.hypot(W.wreck.x - x, W.wreck.z - z) < W.wreck.bound + clear * 0.5) return false;
    return W.heightAt(x, z) < -8;
  }

  nearestPort(x, z, knownOnly = true) {
    let best = this.world.home, bd = Infinity;
    for (const P of this.world.ports) {
      if (knownOnly && !this.game.state.discovered.has(P.id)) continue;
      const d = Math.hypot(P.dock.x - x, P.dock.z - z);
      if (d < bd) { bd = d; best = P; }
    }
    return best;
  }

  /** The place for an encounter (by id), with the words that describe it. */
  placeFor(enc) { return this.places[enc.id] || null; }

  // ---------------------------------------------------------------- the Redwing
  ensureRedwing() {
    if (this.redwing) return this.redwing;
    const s = new Boat(this.game.scene, { npc: true, profile: SABLE_PROFILE, livery: SABLE_LIVERY });
    s.up = { sail: 1.5, rudder: 1.5, keel: 0.6, hull: 220, lantern: 48 };
    this.redwing = s;
    this._shipKey = null;
    this.syncShip();
    s.setVisible(false);
    this.helm = new AutoHelm(s, this.world);
    return s;
  }

  /** Rig Sable's ship to match the player's upgrades (never below SHIP_FLOOR). */
  syncShip() {
    const s = this.redwing, up = this.game.state.upgrades;
    if (!s) return;
    const lv = {};
    for (const k of Object.keys(SHIP_FLOOR)) lv[k] = Math.max(SHIP_FLOOR[k], up[k] || 0);
    const key = Object.values(lv).join('');
    if (key === this._shipKey) return;
    this._shipKey = key;
    s.applyUpgrades(lv, s.up); // keeps a broken mast broken
  }

  showRedwing(x, z, heading, { dismasted = false, crew = true } = {}) {
    const s = this.ensureRedwing();
    this.syncShip();
    s.place(x, z, heading);
    s.setDismasted(dismasted);
    s.setCharacterVisible(crew);
    s.setVisible(true);
    return s;
  }

  hideRedwing() { this.redwing?.setVisible(false); }

  /** Beside the pier, on the far side from where the player ties up. */
  mooring(port) {
    const D = port.dock, a = D.angle;
    return { x: D.x + Math.sin(a) * 15, z: D.z - Math.cos(a) * 15, heading: D.heading };
  }

  // ------------------------------------------------------------------ update
  /** Every frame at sea (not ashore, not on the title). */
  update(dt, elapsed, wind) {
    const g = this.game;
    if (this.syncedState !== g.state) this.reset(g.state);
    this.syncDye();
    this.cool -= dt;
    const b = this.player.pos, act = this.act;
    // (with nothing live, the living sea's director asks spawn() whether Sable should appear)
    if (!act) { /* nothing to drive: spawn() below decides when they turn up */ }
    else if (act.type === 'approach') this.updateApproach(dt, wind, act);
    else if (act.type === 'race') this.updateRace(dt, wind, act);
    else if (act.type === 'depart') this.updateDepart(dt, wind, act);
    else if (act.type === 'waiting') { if (dist(b, act) > SEE + 350) this.clearAct(); }
    else if (act.type === 'adrift') this.updateAdrift(dt, elapsed, act);
    else if (act.type === 'tow') act.tow.update(dt);
    else if (act.type === 'kraken') this.updateKraken(dt, elapsed, act);
    if (this.R.chapter === 7) this.updateFlare(dt, elapsed);
    else if (this.flare) this.endFlare();

    const s = this.redwing;
    if (s && s.group.visible) {
      this.keepApart(s);
      s.animate(dt, elapsed, wind, 1, g.env.night, s.up);
      const u = s.wakeMat.uniforms, pu = this.player.wakeMat.uniforms;
      u.uLight.value.copy(pu.uLight.value);
      u.uScale.value = pu.uScale.value;
    }
  }

  /** A different voyage was loaded or started: drop whatever was live. */
  reset(state) {
    this.syncedState = state;
    this.clearAct();
    this.cool = 12;
    this._dye = null;
    this.forced = false;
    this._landEnc = null;
  }

  clearAct() {
    const a = this.act;
    if (a) { a.race?.dispose(); a.tow?.dispose(); a.kraken?.dispose(); }
    this.act = null;
    this.hideRedwing();
    this.game.ui.setRace?.(null);
  }

  /** Two hulls can't share the same water. */
  keepApart(s) {
    const p = this.player, dx = s.pos.x - p.pos.x, dz = s.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    const min = 3.2 * (p.sizeScale + s.sizeScale);
    if (d >= min || this.towing) return;
    const k = (min - d) / d, fixed = ['waiting', 'adrift'].includes(this.act?.type);
    if (!fixed) { s.pos.x += dx * k * 0.6; s.pos.z += dz * k * 0.6; }
    p.pos.x -= dx * k * (fixed ? 1 : 0.4); p.pos.z -= dz * k * (fixed ? 1 : 0.4);
  }

  /**
   * Nothing of Sable's is live: should they appear? Called by the living
   * sea's director (sea-events.js) every couple of seconds of sailing. `free`
   * is false while one of the director's own events is out there: Sable can
   * still be found waiting in a harbor or off an island, but a meeting at sea
   * holds off, and 'wait' is returned so the director can clear the water.
   */
  spawn(b, free = true) {
    const g = this.game, R = this.R, P = this.places;
    this.cool = 2;
    if (g.ui.isStoryOpen || g.ui.isFoundOpen) return null;
    const enc = this.ready();
    if (enc) {
      if (enc.id === 'bows') {
        const H = this.world.home.dock, d = dist(b, H);
        if (!free) return d > 170 && d < 1400 ? 'wait' : null;
        this.spawnAcross(enc, b);
        return null;
      }
      const at = P[enc.id];
      if (at && dist(b, at) < SEE) {
        if (!free && enc.kind !== 'summit' && enc.kind !== 'relics') return 'wait';
        if (R.flags.heard !== R.chapter) {
          R.flags.heard = R.chapter;
          if (enc.id === 'relics') R.flags.relicsIsle = at.island; // found Sable there: the scramble stays put
          g.quests.pin('rival');
        }
        if (enc.kind === 'summit' || enc.kind === 'relics') this.anchorOff(g.world.islands[at.island], b);
        else if (enc.kind === 'tow') this.setAdrift(at);
        else this.spawnAt(enc, at);
      }
      return null;
    }
    if (R.chapter === 6 || (R.chapter === 8 && !R.flags.rematch)) {
      const port = R.chapter === 6 ? this.world.islands[R.flags.port] : this.friendPort();
      if (port && dist(b, port.dock) < SEE) {
        const m = this.mooring(port);
        this.showRedwing(m.x, m.z, m.heading);
        this.act = { type: 'waiting', x: port.dock.x, z: port.dock.z, port: port.id };
      }
    } else if (R.chapter === 8 && R.flags.rematch?.island != null) {
      const I = this.world.islands[R.flags.rematch.island];
      if (I && dist(b, I) < SEE) this.anchorOff(I, b);
    } else if (R.chapter === 7 && R.flags.flare && dist(b, P.deep) < P.deep.r + 160 && g.mode === 'sailing') {
      if (!free) return 'wait';
      this.startKraken();
    }
    return null;
  }

  // ------------------------------------------------------- meeting at sea
  /** Encounter 1: Sable comes in off the bow quarter and cuts across your course. */
  spawnAcross(enc, b) {
    const g = this.game, H = this.world.home, p = this.player;
    if (g.mode !== 'sailing' || dist(b, H.dock) < 170 || dist(b, H.dock) > 1400 || Math.abs(p.speed) < 2) return;
    const W = this.world.wreck;
    if (W && dist(b, W) < 150) return;
    for (const off of [0.75, -0.75, 1.1, -1.1, 0.4, -0.4]) {
      const a = p.heading + off, x = b.x + Math.sin(a) * 250, z = b.z + Math.cos(a) * 250;
      if (!this.isOpen(x, z, 60)) continue;
      // heading across the player's course
      this.showRedwing(x, z, p.heading - Math.sign(off) * 1.9);
      this.redwing.sailLevel = 2; this.redwing.speed = 6;
      this.act = { type: 'approach', enc, hailed: false, t: 0 };
      g.ui.banner(LINES.sighted, enc.title);
      g.audio.play('discover');
      g.quests.pin('rival');
      return;
    }
    this.cool = 6;
  }

  /** Later sea encounters: Sable is already out there, sailing lazy circles. */
  spawnAt(enc, at) {
    this.showRedwing(at.x, at.z, this.game.weather.windAngle + Math.PI / 2);
    this.redwing.sailLevel = 1;
    this.act = { type: 'approach', enc, hailed: false, t: 0, home: { x: at.x, z: at.z }, loiter: 0 };
    if (enc.kind === 'fog') this.fogIn();
  }

  /** The fog run needs fog: roll it in and hold it for the length of a race. */
  fogIn() { const w = this.game.weather; w.set('fog'); w.timer = Math.max(w.timer, 420); }

  updateApproach(dt, wind, act) {
    const s = this.redwing, p = this.player, d = dist(s.pos, p.pos);
    act.t += dt;
    s.up.sail = Math.max(1.3, this.game.upv.sail * 1.05);
    s.up.rudder = Math.max(1.5, this.game.upv.rudder);
    let tx, tz, opts = { sail: 2 };
    if (act.home && !act.hailed && d > 340) {
      // waiting about: a slow loop round the spot
      const a = act.loiter;
      tx = act.home.x + Math.cos(a) * 70; tz = act.home.z + Math.sin(a) * 70;
      if (Math.hypot(tx - s.pos.x, tz - s.pos.z) < 30) act.loiter += 1.1;
      opts = { sail: 1, drive: 0.7 };
      if (dist(p.pos, act.home) > SEE + 350) { this.clearAct(); return; }
    } else if (!act.hailed) {
      // close with the player, aiming a little ahead of their bow
      tx = p.pos.x + Math.sin(p.heading) * 28; tz = p.pos.z + Math.cos(p.heading) * 28;
      if (d < HAIL) {
        act.hailed = true;
        this.R.flags.met = true;
        this.say(act.enc.title, act.enc.hail);
      }
    } else {
      // keep station off the player's beam so they can answer
      const side = act.side ??= Math.sign((s.pos.x - p.pos.x) * Math.cos(p.heading) - (s.pos.z - p.pos.z) * Math.sin(p.heading)) || 1;
      tx = p.pos.x + Math.cos(p.heading) * 17 * side + Math.sin(p.heading) * 12;
      tz = p.pos.z - Math.sin(p.heading) * 17 * side + Math.cos(p.heading) * 12;
      const gap = Math.hypot(tx - s.pos.x, tz - s.pos.z);
      opts = { sail: gap > 40 ? 2 : 1, drive: clamp(gap / 30, 0.15, 1), arrive: 10 };
    }
    s.simulate(dt, this.helm.update(dt, tx, tz, wind, opts), wind, this.world, s.up);
    if (d > 1300) { this.clearAct(); this.cool = 90; }
  }

  /** The player took the challenge: plan a course from here and line up. */
  startRace(enc, from = null, rematch = false) {
    const g = this.game, p = this.player;
    const spec = { sprint: { legs: 1, legLen: [520, 680] }, buoys: { legs: 3, legLen: [380, 540], upwind: true }, fog: { legs: 3, legLen: [300, 420] } }[enc.kind];
    const rng = mulberry32(((g.state.day || 1) * 7919 + this.R.wins * 31 + this.R.losses * 17 + enc.id.length) | 0);
    let course = null;
    const origin = from || { x: p.pos.x, z: p.pos.z };
    for (let t = 0; t < 8 && !course; t++) {
      course = planCourse(this.world, origin, { ...spec, heading: t ? undefined : (from?.heading ?? p.heading), windAngle: g.weather.windAngle, rng });
    }
    if (!course) { g.ui.toast('There\'s no room to race here. Sail out into open water.', 'info'); return false; }
    const s = this.ensureRedwing();
    this.syncShip();
    s.setDismasted(false); s.setCharacterVisible(true); s.setVisible(true);
    const race = new SeaRace(g, s, course, { title: enc.title, fog: enc.kind === 'fog', pace: rematch ? 0.97 : 0.94,
      onFinish: (res) => this.finishRace(enc, res, rematch) });
    this.act = { type: 'race', enc, race, rematch };
    if (enc.kind === 'fog') this.fogIn();
    g.ui.setPrompt(null);
    race.start();
    return true;
  }

  updateRace(dt, wind, act) {
    const race = act.race, n = race.playerNext;
    race.update(dt, wind);
    if (this.act !== act) return; // finished this frame
    if (n && race.phase === 'racing' && dist(this.player.pos, n) > 1500) {
      this.game.ui.toast(LINES.left, 'info');
      this.clearAct();
      this.cool = 120;
    }
  }

  finishRace(enc, { won }, rematch) {
    const g = this.game;
    this.act.race.dispose();
    this.settle(enc, won, rematch);
    // Sable sails off
    const s = this.redwing, p = this.player;
    const away = Math.atan2(s.pos.x - p.pos.x, s.pos.z - p.pos.z);
    this.act = { type: 'depart', t: 0, x: s.pos.x + Math.sin(away) * 2500, z: s.pos.z + Math.cos(away) * 2500 };
    g.cam.lastLook = -10;
  }

  /** Record a result, pay a win, say the lines and move the story on. */
  settle(enc, won, rematch) {
    const g = this.game, R = this.R, s = g.state;
    const gold = rematch ? ((R.flags.rematchDay || 0) < (s.day || 1) ? FRIEND.rematchGold : 0) : enc.gold;
    if (won) R.wins++; else R.losses++;
    if (won && gold) { s.cargo += gold; g.ui.toast(`+${gold} gold from Sable's purse`, 'gold'); }
    g.ui.banner(won ? 'You won!' : 'Sable wins', enc.title);
    g.audio.play(won ? 'treasure' : 'dock');
    if (rematch) {
      if (won) R.flags.rematchDay = s.day || 1;
      R.flags.rematch = null;
      this.say(`Rematch: ${enc.title}`, won ? FRIEND.rematchWin : FRIEND.rematchLose);
    } else {
      this.say(enc.title, [...(won ? enc.win : enc.lose), ...enc.after]);
      this.advance();
    }
    g.events.emit('rival:race', enc.id, won);
    g.saveVoyage();
  }

  advance() {
    const R = this.R;
    R.chapter++;
    R.flags.day = this.game.state.day || 1;
    this._landEnc = null;
    this.forced = false;
    this.game.events.emit('rival:chapter', R.chapter);
  }

  updateDepart(dt, wind, act) {
    const s = this.redwing;
    act.t += dt;
    s.up.sail = Math.max(1.5, this.game.upv.sail * 1.1);
    s.simulate(dt, this.helm.update(dt, act.x, act.z, wind, { sail: 2 }), wind, this.world, s.up);
    if (act.t > 70 || dist(s.pos, this.player.pos) > 1100) { this.clearAct(); this.cool = 20; }
  }

  // ------------------------------------------------------------ on foot
  /** The Redwing rides at anchor off the island while they wait ashore. */
  anchorOff(I, b) {
    const W = this.world;
    const a0 = Math.atan2(b.z - I.z, b.x - I.x);
    for (let k = 0; k < 16; k++) {
      // near the side the player is coming from, but out of their way
      const a = a0 + (k % 2 ? 1 : -1) * (0.5 + 0.18 * Math.ceil(k / 2));
      for (let d = I.r * 0.9; d < I.bound * 2.2; d += 4) {
        const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
        if (W.heightAt(x, z) > -5) continue;
        if (W.rockHit(x + Math.cos(a) * 14, z + Math.sin(a) * 14, 12)) break;
        this.showRedwing(x + Math.cos(a) * 14, z + Math.sin(a) * 14, headingOf(-Math.sin(a), Math.cos(a)), { crew: false });
        this.act = { type: 'waiting', x: I.x, z: I.z, island: I.id };
        return;
      }
    }
    this.act = { type: 'waiting', x: I.x, z: I.z, island: I.id }; // no room for the Redwing: Sable is still ashore
  }

  /**
   * Is Sable waiting on this island? Returns what the on-foot race needs
   * (see ashore/pacer.js), or null. Cheap and pure: ashore.js asks every frame.
   */
  landEncounter(I) {
    const R = this.R;
    let enc = null, rematch = false;
    if (R.chapter === 8 && R.flags.rematch?.island === I.id) { enc = ENCOUNTERS.find((e) => e.id === R.flags.rematch.id); rematch = true; }
    else {
      const e = this.ready();
      if (e && (e.kind === 'summit' || e.kind === 'relics') && this.places[e.id]?.island === I.id) enc = e;
    }
    if (!enc || !this.game.story?.canGoAshore) return null;
    if (this._landEnc?.id === enc.id && this._landEnc.island === I.id) return this._landEnc;
    this._landEnc = {
      id: enc.id, island: I.id, kind: enc.kind, profile: SABLE_PROFILE,
      onMeet: () => { this.R.flags.met = true; this.say(rematch ? `Rematch: ${enc.title}` : enc.title, rematch ? [FRIEND.lines[3], enc.hail[2]] : enc.hail); },
      onStart: () => {},
      onFinish: ({ won }) => this.settle(enc, won, rematch),
    };
    return this._landEnc;
  }

  onLeaveIsland() {
    // back aboard after a race ashore: the Redwing has gone (Sable left first)
    if (this.act?.type === 'waiting' && this.act.island != null && !this.landEncounter(this.world.islands[this.act.island])) {
      this.clearAct();
      this.cool = 30;
    }
  }

  // ---------------------------------------------------------- dismasted
  setAdrift(at) {
    this.showRedwing(at.x, at.z, 1.3, { dismasted: true });
    this.act = { type: 'adrift', x: at.x, z: at.z, hailed: false };
  }

  updateAdrift(dt, elapsed, act) {
    const s = this.redwing, d = dist(s.pos, this.player.pos);
    s.speed = 0; s.sailLevel = 0;
    s.heading += Math.sin(elapsed * 0.21) * 0.05 * dt; // swinging slowly on the swell
    if (!act.hailed && d < HAIL) { act.hailed = true; this.R.flags.met = true; this.say(ENCOUNTERS[5].title, ENCOUNTERS[5].hail); }
    if (d > SEE + 350) this.clearAct();
  }

  throwLine() {
    const g = this.game, s = this.redwing;
    this.act = { type: 'tow', tow: new TowLine(g.scene, this.player, s, { length: 16 }), t: 0 };
    g.audio.play('treasure');
    g.ui.toast(LINES.towSlow, 'info');
    g.quests.pin('rival');
    setTimeout(() => { if (this.act?.type === 'tow') this.say(ENCOUNTERS[5].title, ENCOUNTERS[5].towing); }, 16000);
  }

  // -------------------------------------------------------------- the Deep
  updateFlare(dt, elapsed) {
    const g = this.game, R = this.R, D = this.places.deep, b = this.player.pos;
    const d = dist(b, D);
    if (!R.flags.flare) {
      const t = g.state.dayT, dusk = t > 0.72 || t < 0.2;
      this.sinceLetter = (this.sinceLetter ?? 30) + dt;
      if (g.mode !== 'sailing' || this.sinceLetter < 25 || !(dusk || d < 800)) return;
      R.flags.flare = true;
      g.ui.banner(...DEEP.flareBanner);
      g.audio.play('discover');
      g.quests.pin('rival');
      g.saveVoyage();
      this.flareT = 0;
    }
    // the flare goes up again every so often until you're there
    this.flareT -= dt;
    if (this.flareT <= 0 && d > D.r + 200 && this.act?.type !== 'kraken') { this.flareT = 38; this.fireFlare(b, D, d); }
    const f = this.flare;
    if (!f) return;
    f.t += dt;
    const k = f.t / 14, rise = 1 - Math.pow(1 - Math.min(1, f.t / 4), 3);
    f.group.position.y = f.h * rise - Math.max(0, f.t - 5) * f.h * 0.03;
    f.group.position.x += Math.sin(elapsed * 0.7) * dt * 2;
    const fade = clamp(1 - (k - 0.7) / 0.3, 0, 1), flick = 0.85 + 0.15 * Math.sin(elapsed * 23);
    f.core.material.color.set('#ff4a3a').multiplyScalar(glowBoost.value * flick);
    f.core.material.opacity = fade;
    f.halo.material.opacity = 0.75 * fade * flick;
    if (k >= 1) this.endFlare();
  }

  fireFlare(b, D, d) {
    this.endFlare();
    const far = Math.min(d, 1300), ux = (D.x - b.x) / d, uz = (D.z - b.z) / d, sc = far / 1300;
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(8 * sc + 1.5, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, fog: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ff5a48', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.setScalar(120 * sc + 20);
    group.add(core, halo);
    group.position.set(b.x + ux * far, 0, b.z + uz * far);
    this.game.scene.add(group);
    this.flare = { group, core, halo, t: 0, h: 150 * sc + 40 };
  }

  endFlare() {
    const f = this.flare;
    if (!f) return;
    this.game.scene.remove(f.group);
    f.core.geometry.dispose(); f.core.material.dispose(); f.halo.material.dispose();
    this.flare = null;
  }

  startKraken() {
    const g = this.game, D = this.places.deep;
    const s = this.showRedwing(D.x, D.z, 0.6);
    const kraken = new Kraken(g, s, D, {
      onRescue: () => this.rescued(),
      onCaught: () => this.say(DEEP.name, DEEP.caught),
    });
    this.act = { type: 'kraken', kraken, phase: 'approach', t: 0 };
    const w = g.weather; w.set('rain'); w.timer = 600;
    this.say(DEEP.name, DEEP.arrive);
    const tip = (text, ms) => setTimeout(() => { if (this.act?.kraken === kraken && !this.act.done) g.ui.toast(text, 'info'); }, ms);
    tip(DEEP.tip, 9000); tip(DEEP.tipLantern, 22000);
  }

  updateKraken(dt, elapsed, act) {
    const k = act.kraken;
    k.update(dt, elapsed);
    if (this.act !== act) return;
    if (k.phase !== act.phase) {
      if (k.phase === 'tow') this.say(DEEP.name, DEEP.lineFast);
      act.phase = k.phase;
    }
    // wandered off before throwing a line: the kraken (and Sable) will still be there
    if (k.phase === 'approach' && !k.caught && dist(this.player.pos, this.places.deep) > this.places.deep.r + 600) { this.clearAct(); this.cool = 5; }
  }

  async rescued() {
    const g = this.game, R = this.R, act = this.act;
    if (!act || act.done) return;
    act.done = true;
    this.player.sailLevel = 0;
    await sleep(1800);
    await this.scene(CARDS.finale);
    R.chapter = FINAL_CHAPTER;
    R.flags.day = g.state.day || 1;
    R.flags.title = TITLE;
    R.flags.dye = true; R.flags.dyeOn = true;
    g.unlockCosmetic('hat:rivalTricorn', 'story');
    const p = g.state.profile;
    p.hat = { ...p.hat, style: 'rivalTricorn' };
    g.applyProfile();
    this.endFlare();
    this.clearAct();
    this.cool = 40;
    const w = g.weather; w.set('clear'); w.timer = 240;
    g.events.emit('rival:complete');
    g.saveVoyage();
    await g.ui.showFound({ eyebrow: REWARDS.eyebrow, title: REWARDS.title,
      items: [{ icon: 'tricorn', ...REWARDS.hat }, { icon: 'sail', ...REWARDS.sails }, { icon: 'star', ...REWARDS.honour }], main: 'Onward' });
  }

  // ------------------------------------------------------------- interaction
  /**
   * The sailing prompt, when Sable has something for you. `hail` marks the race
   * challenge: she sails alongside until you answer, so it gives way to anything
   * else you can do right where you are.
   */
  interaction(x, z, speed) {
    const act = this.act;
    if (!act) return null;
    if (act.type === 'approach' && act.hailed && dist(this.redwing.pos, { x, z }) < 130) {
      return { prompt: act.enc.prompt, action: () => this.startRace(act.enc), hail: true };
    }
    if (act.type === 'adrift' && dist(this.redwing.pos, { x, z }) < 24) {
      if (Math.abs(speed) >= 8) return { prompt: 'Slow down to throw a line' };
      return { prompt: ENCOUNTERS[5].prompt, action: () => this.throwLine() };
    }
    if (act.type === 'kraken') return act.done ? null : act.kraken.interaction(x, z, speed);
    return null;
  }

  // -------------------------------------------------------------- at a port
  async onDock(port) {
    const g = this.game, R = this.R, ui = g.ui;
    // towed in: the end of encounter 6
    if (this.act?.type === 'tow') {
      this.act.tow.dispose();
      const m = this.mooring(port);
      this.showRedwing(m.x, m.z, m.heading);
      this.act = { type: 'waiting', x: port.dock.x, z: port.dock.z, port: port.id };
      this.advance();
      R.flags.port = port.id;
      g.savePortState();
      await this.afterDockDialogs();
      ui.closePort();
      await this.scene(CARDS.mast);
      ui.openPort(port);
      return;
    }
    // the letter: Sable is here, and you have the bundle from the chest
    if (R.chapter === 6 && R.flags.port === port.id && g.story.S.flags.letters && ((g.state.day || 1) > (R.flags.day || 0) || this.forced)) {
      R.chapter = 7;
      R.flags.day = g.state.day || 1;
      R.flags.flare = false;
      this.sinceLetter = 0;
      this.forced = false;
      g.savePortState();
      await this.afterDockDialogs();
      ui.closePort();
      await this.scene(CARDS.letter);
      this.clearAct();
      this.cool = 5;
      ui.openPort(port);
      return;
    }
    // harbor talk: where the crimson sails were last seen
    const enc = this.ready();
    if (enc?.rumour && R.flags.heard !== R.chapter && this.placeFor(enc)) {
      R.flags.heard = R.chapter;
      g.quests.pin('rival');
      g.savePortState();
      ui.toast('Harbor talk: crimson sails have been seen. Check the Quest Board.', 'info');
      ui.refreshPort();
    }
    // a friend in port
    if (R.chapter === FINAL_CHAPTER && this.friendPort()?.id === port.id && R.flags.greetDay !== g.state.day) {
      R.flags.greetDay = g.state.day;
      const n = (g.state.day || 1) % (FRIEND.lines.length - 1);
      await this.afterDockDialogs();
      this.say(FRIEND.card.title, [FRIEND.lines[n]]);
    }
  }

  /** Let the main story's own dock pop-ups (anchor, epilogue) finish first. */
  async afterDockDialogs() {
    const ui = this.game.ui;
    await sleep(60);
    while (ui.isStoryOpen || ui.isFoundOpen) await sleep(200);
  }

  onWreck() {
    const act = this.act;
    if (!act) return;
    if (act.type === 'race') this.game.ui.toast(LINES.wrecked, 'info');
    if (act.type === 'tow') this.game.ui.toast(LINES.towLost, 'warn');
    this.clearAct();
    this.cool = 30;
  }

  // ----------------------------------------------------------------- friends
  /** After the finale Sable ties up at a different known port each day. */
  friendPort() {
    const s = this.game.state;
    const known = this.world.ports.filter((P) => s.discovered.has(P.id));
    if (!known.length) return this.world.home;
    return known[Math.floor(mulberry32((s.day || 1) * 2654435 + this.world.seed)() * known.length)];
  }

  /** Notes for the port's Quest Board: harbor talk, or Sable in person. */
  portNotes(port) {
    const R = this.R, out = { rumour: null, friend: null };
    const enc = this.ready();
    if (enc?.rumour && this.placeFor(enc)) out.rumour = { title: LINES.rumourTitle, eyebrow: LINES.rumourEyebrow, text: fill(enc.rumour, this.vars(this.placeFor(enc))) };
    if (R.chapter === FINAL_CHAPTER && this.friendPort()?.id === port.id) {
      const paid = (R.flags.rematchDay || 0) < (this.game.state.day || 1);
      out.friend = { ...FRIEND.card, gold: paid ? FRIEND.rematchGold : 0,
        races: ENCOUNTERS.filter((e) => e.kind !== 'tow').map((e) => ({ id: e.id, title: e.title })) };
    }
    return out;
  }

  /** A rematch from the Quest Board: sea races start outside the harbor, land ones on the nearest island. */
  rematch(id) {
    const g = this.game, R = this.R, enc = ENCOUNTERS.find((e) => e.id === id), port = g.dockedIsland;
    if (!enc || !port || R.chapter !== FINAL_CHAPTER) return false;
    if (enc.kind === 'summit' || enc.kind === 'relics') {
      const land = this.world.islands.filter((I) => g.ashore?.canLandNow(I) && !I.landmark)
        .sort((a, b) => dist(a, port) - dist(b, port))[0];
      if (!land || !g.story.canGoAshore) { g.ui.toast('There is nowhere nearby to race on foot.', 'info'); return false; }
      R.flags.rematch = { id, island: land.id };
      this._landEnc = null;
      this.clearAct();
      g.quests.pin('rival');
      g.setSail();
      g.ui.toast(`Sable will meet you on ${land.name}.`, 'info');
      return true;
    }
    const D = port.dock, a = D.angle;
    let from = null;
    for (const d of [150, 220, 300]) {
      const x = D.x + Math.cos(a) * d, z = D.z + Math.sin(a) * d;
      if (this.isOpen(x, z, 20)) { from = { x, z, heading: D.heading }; break; }
    }
    if (!from) { g.ui.toast('There is no room to race off this harbor.', 'info'); return false; }
    g.setSail();
    this.clearAct();
    R.flags.rematch = null; // only a race on foot waits for you (on its island)
    return this.startRace(enc, from, true);
  }

  // ------------------------------------------------------------ crimson sails
  get canDye() { return !!this.R.flags.dye; }
  get dyeOn() { return !!(this.R.flags.dye && this.R.flags.dyeOn); }
  toggleDye() {
    if (!this.canDye) return;
    this.R.flags.dyeOn = !this.R.flags.dyeOn;
    this.syncDye();
    this.game.savePortState();
  }
  syncDye() {
    if (this._dye === this.dyeOn) return;
    this._dye = this.dyeOn;
    this.player.setLivery?.(this._dye ? { sail: CRIMSON } : null);
  }

  // ------------------------------------------------------- quest / map glue
  /** The rival story as a quest-like object for the tracker and journal (or none). */
  quests() {
    const step = this.step();
    if (!step) return [];
    return [{ id: 'rival', type: 'story', state: 'active', title: step.title, text: step.text,
      giver: { name: 'Sable', role: SPEAKER, label: LINES.questRole }, reward: { gold: 0 } }];
  }

  step() {
    const R = this.R, act = this.act, P = this.places;
    const text = (s, at) => ({ title: s.title, text: fill(s.text, this.vars(at || {})) });
    if (act?.type === 'tow') return text(ENCOUNTERS[5].towStep);
    if (R.chapter === 6) {
      const port = this.world.islands[R.flags.port];
      return port ? text(this.game.story.S.flags.letters ? LETTER.stepReady : LETTER.step, { place: port.name }) : null;
    }
    if (R.chapter === 7) return text(act?.type === 'kraken' && act.kraken.phase === 'tow' ? DEEP.towStep : R.flags.flare ? DEEP.flareStep : DEEP.waitStep);
    if (R.chapter === FINAL_CHAPTER) {
      const rm = R.flags.rematch, enc = rm && ENCOUNTERS.find((e) => e.id === rm.id);
      return enc && rm.island != null ? text(enc.step, { place: this.world.islands[rm.island].name }) : null;
    }
    const enc = this.ready();
    if (!enc) return null;
    if (enc.id === 'bows') return act ? text(enc.step) : null;
    return R.flags.heard === R.chapter && P[enc.id] ? text(enc.step, P[enc.id]) : null;
  }

  /** Where the tracker points: { x, z, r?, label }. Always set when quests() has an entry. */
  target() {
    const R = this.R, act = this.act, P = this.places, b = this.player.pos, s = this.redwing;
    if (act?.type === 'tow') { const port = this.nearestPort(b.x, b.z); return { x: port.dock.x, z: port.dock.z, label: `Tow Sable to ${port.name}` }; }
    if (act?.type === 'approach' || act?.type === 'adrift') return { x: s.pos.x, z: s.pos.z, label: act.type === 'adrift' ? 'A ship without a mast' : 'Hail the crimson sails' };
    if (R.chapter === 6) { const D = this.world.islands[R.flags.port].dock; return { x: D.x, z: D.z, label: `Sable is at ${this.world.islands[R.flags.port].name}` }; }
    if (R.chapter === 7) {
      const D = P.deep;
      if (act?.type === 'kraken') {
        if (act.kraken.phase === 'done') return { x: s.pos.x, z: s.pos.z, label: 'Safe in the shallows' };
        if (act.kraken.phase !== 'tow') return { x: s.pos.x, z: s.pos.z, label: 'Reach Sable\'s ship' };
        const d = dist(b, D) || 1;
        return { x: D.x + ((b.x - D.x) / d) * (D.r + 40), z: D.z + ((b.z - D.z) / d) * (D.r + 40), label: 'Tow Sable to the shallows' };
      }
      return R.flags.flare ? { x: D.x, z: D.z, label: 'Make for the Deep' } : { x: D.x + 160, z: D.z - 120, r: 620, label: 'Watch the horizon at dusk' };
    }
    const rm = R.chapter === FINAL_CHAPTER ? R.flags.rematch : null;
    const enc = rm ? ENCOUNTERS.find((e) => e.id === rm.id) : this.ready();
    const at = rm ? this.world.islands[rm.island] : enc && P[enc.id];
    if (!at) return { x: b.x, z: b.z, label: '' };
    if (at.hint && dist(b, at.hint) > at.hint.r) return { x: at.hint.x, z: at.hint.z, r: at.hint.r, label: `Look for crimson sails ${at.dir} of ${at.place}` };
    if (at.island != null || rm) {
      const I = rm ? at : this.world.islands[at.island];
      return { x: I.x, z: I.z, label: `Go ashore on ${I.name}` };
    }
    return { x: at.x, z: at.z, label: 'Look for crimson sails' };
  }

  /** Extra marks for the minimap and chart: [{ x, z, kind: 'sable' | 'gate' | 'deep', next?, name? }]. */
  markers() {
    const out = [], R = this.R;
    if (this.racing) for (const gt of this.act.race.gates) if (!gt.passed) out.push({ x: gt.x, z: gt.z, kind: 'gate', next: !!gt.next });
    if (this.redwing?.group.visible) out.push({ x: this.redwing.pos.x, z: this.redwing.pos.z, kind: 'sable', heading: this.redwing.heading });
    if (R.chapter >= 7 && (R.flags.flare || R.chapter === FINAL_CHAPTER)) out.push({ ...this.places.deep, kind: 'deep', name: DEEP.name });
    return out;
  }

  /** What the journal's Captain Sable tab shows (null until you've met). The log is newest first. */
  journal() {
    const R = this.R;
    if (!R.flags.met && !R.chapter) return null;
    return {
      record: fill(LINES.record, { wins: R.wins, losses: R.losses }),
      learned: ENCOUNTERS.slice(0, Math.min(R.chapter, ENCOUNTERS.length)).map((e) => e.learned),
      title: R.flags.title || null,
      friend: R.chapter === FINAL_CHAPTER,
      step: this.step(),
      log: [...R.log].reverse(),
    };
  }

  // ------------------------------------------------------------------- debug
  /**
   * Console helper for testing: `tidewake.rival.debug(3)` jumps to a chapter,
   * skips its gate and puts the boat near where it happens.
   */
  debug(chapter) {
    const g = this.game, R = this.R;
    this.reset(g.state);
    R.chapter = chapter; R.flags.heard = chapter; R.flags.day = 0; R.flags.met = true;
    if (chapter === 4) R.flags.relicsIsle = (this._places ||= this.findPlaces()).relics?.island; // today's island, not an old save's
    const P = this.places;
    this.forced = true; this._landEnc = null; this.cool = 1;
    let at = chapter < 6 ? P[ENCOUNTERS[chapter].id] : null;
    if (chapter === 0) at = { x: g.world.home.dock.x + 60, z: g.world.home.dock.z + 420 };
    if (chapter === 2 || chapter === 4) g.story.S.flags.anchor = 'fitted';
    if (chapter === 6) { R.flags.port ??= 0; g.story.S.flags.letters = true; at = g.world.islands[R.flags.port].dock; }
    if (chapter === 7) { R.flags.flare = true; at = P.deep; }
    if (chapter === FINAL_CHAPTER) { R.flags.dye = true; at = this.friendPort().dock; }
    g.syncAnchor();
    if (at) {
      for (let k = 0; k < 24; k++) {
        const a = k * 0.7, d = (at.r || 0) + (at.island != null ? g.world.islands[at.island].bound : 0) + 330;
        const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
        if (!this.isOpen(x, z, 40)) continue;
        g.boat.place(x, z, Math.atan2(at.x - x, at.z - z));
        g.streamer.buildAll(x, z);
        break;
      }
    }
    return { chapter, at };
  }
}

let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}
