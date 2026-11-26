// Rough water's hazards in the game (Phase 9.3): the rogue waves of every rough zone and
// the ice growlers of the Frostspire Reach. The rules are rogue.js (when a wave comes,
// where from, what a strike costs, where the ice lies) and the numbers ROGUE and GROWLERS
// in config.js; this file runs them against the boat: the clock, the warning, the sound,
// the strike (hull, a shove, the camera's lurch) and the ice you can run into.
//
// The wave itself is drawn by the sea (waves.js adds its ridge to every wave-aware
// shader and to waveHeight), so the boat rides it as it rides any other.
// The ice is the loose ice of Phase 7's iceberg (sea-wonders.js), and striking it is the
// same knock (sea-events.js, bump). Nothing is saved, and the random stream is this
// file's own: nothing draws from the world's rng().
import * as THREE from 'three';
import { WORLD_SEED, ROGUE, GROWLERS } from './config.js';
import { mulberry32, smoothstep, wrapAngle } from './util.js';
import { setRogueWave, waveHeight } from './waves.js';
import { SEA_ZONES, zoneDistance } from './sea-zones.js';
import { rogueGap, bearingKey, launchRogue, stepRogue, rogueToll, growlersNear, growlerAt } from './rogue.js';
import { chunkGeometry } from './sea-wonders.js';
import { propMaterial, thinOutline } from './props.js';
import { SEAS } from './story-text.js';

const MAX_ICE = 96;   // growlers drawn at once (about 45 are in sight in the thick of it)
const LEFT = 60;      // seconds out of rough water before the next visit counts as a new one

export class RoughWater {
  constructor(game) {
    this.game = game;
    this.rng = mulberry32(WORLD_SEED * 71 + 9);
    this.wave = null;     // the rogue wave out there now (rogue.js), or null
    this.warn = null;     // the warning to show while it comes (game.js shows it)
    this.timer = null;    // seconds to the next wave, counted only in rough water; null = a first one is due
    this.zone = null;
    this.away = 0;
    this.last = null;     // what the last strike cost
    this.count = { waves: 0, struck: 0, ice: 0 };
    this.afloat = new Map(); // growler id → whether it is clear of every shore (asked of the world once)
    this.near = [];
    this.iceZone = SEA_ZONES.findIndex((Z) => Z.id === GROWLERS.zone);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._at = {};
    // nothing follows you into port, onto an island or through a wreck
    for (const name of ['dock', 'wreck', 'respawn', 'ashore:enter']) game.events.on(name, () => this.clear());
  }

  /** A different voyage was loaded or started: no wave, and the clock starts again. */
  reset(state) {
    this.syncedState = state;
    this.clear();
    this.rng = mulberry32((WORLD_SEED * 71 + (state.day || 1) * 7919 + Math.floor(state.stats?.distance || 0)) | 0);
    this.count = { waves: 0, struck: 0, ice: 0 };
    this.last = null;
  }

  /** Drop the wave at once. */
  clear() {
    this.wave = null; this.warn = null; this.timer = null;
    setRogueWave();
  }

  boatNow() {
    const b = this.game.boat, sailing = this.game.mode === 'sailing';
    return { x: b.pos.x, z: b.pos.z, heading: b.heading, vx: sailing ? Math.sin(b.heading) * b.speed + b.push.x : 0, vz: sailing ? Math.cos(b.heading) * b.speed + b.push.y : 0 };
  }

  /** Where a wave lies from the boat as she heads now: a key for the words (a heading grows to port, so the sign turns). */
  bearing(W) { return bearingKey(wrapAngle(this.game.boat.heading - Math.atan2(-W.dx, -W.dz))); }

  /** Every frame, before the boat is moved: the sea must have the wave before anything rides it. */
  update(dt) {
    const g = this.game;
    if (this.syncedState !== g.state) this.reset(g.state);
    const sailing = g.mode === 'sailing';
    this.updateWave(dt, sailing);
    this.updateIce(sailing);
  }

  // -------------------------------------------------------------- rogue waves
  updateWave(dt, sailing) {
    const g = this.game, sea = g.sea, W = this.wave;
    if (W) {
      if (!sailing && W.passed === false) W.passed = 0; // nobody at the helm: it runs out
      if (stepRogue(W, dt, this.boatNow()) && sailing) this.strike(W);
      // the warning follows the wave round as the boat turns: bow-on, it reads "dead ahead"
      this.warn = W.passed === false ? SEAS.wave[this.bearing(W)] : null;
      if (W.done) { this.wave = null; setRogueWave(); } else setRogueWave(W.x, W.z, W.dx, W.dz, W.h);
    }
    // the clock runs in rough water only, slower in its fades; not in a race, the tow or the kraken's fight
    const severity = sea.severity, far = sea.rough;
    if (!sailing || g.rival?.exclusive || !(far >= ROGUE.from) || !ROGUE.every[severity]) {
      this.away += dt;
      if (this.away > LEFT) this.timer = null;
      return;
    }
    this.away = 0;
    if (this.timer == null || this.zone !== sea.roughZone) { this.timer = rogueGap(severity, this.rng, true); this.zone = sea.roughZone; }
    this.timer -= dt * far;
    if (this.timer <= 0 && !this.wave) this.timer = this.launch(severity) ? rogueGap(severity, this.rng) : 4; // no room for one: look again shortly
  }

  /**
   * Send a wave at the boat now. `rel`: radians off the bow it comes from (positive =
   * starboard), or null to pick. Returns the wave, or null if every way in runs over land.
   */
  launch(severity = 3, rel = null) {
    const g = this.game, boat = this.boatNow();
    for (let tries = 0; tries < 6; tries++) {
      const W = launchRogue(boat, this.rng, severity, rel);
      if (!this.openRun(W, boat)) continue;
      this.wave = W;
      this.count.waves++;
      g.audio.play('rogue');
      return W;
    }
    return null;
  }

  /** Whether a wave's whole run to the boat, and a little beyond, is over open water. */
  openRun(W, boat) {
    const world = this.game.world, far = Math.hypot(boat.x - W.x, boat.z - W.z) + 150, half = ROGUE.reach[0];
    for (let d = 0; d <= far; d += 45) {
      for (const b of [-half, 0, half]) {
        if (world.heightAt(W.x + W.dx * d - W.dz * b, W.z + W.dz * d + W.dx * b) > -4) return false;
      }
    }
    return true;
  }

  /** The crest has reached the boat: what it costs, the shove and the lurch. */
  strike(W) {
    const g = this.game, b = g.boat, T = rogueToll(W, b.heading, b.sailLevel, g.upv.keel);
    const hull = T.share * b.maxHealth, hard = T.shove / ROGUE.shove;
    this.count.struck++;
    this.last = { share: T.share, hull, side: T.side, angle: T.angle, sail: b.sailLevel, squarely: W.hitK };
    b.push.x += W.dx * T.shove; b.push.y += W.dz * T.shove;
    b.speed *= 1 - 0.35 * T.side;
    g.cam.lurch = T.from * ROGUE.lurch * Math.max(hard, T.side * 0.4);
    g.cam.shake = Math.max(g.cam.shake, 0.5 + T.side * 0.8);
    g.audio.play('breach', { volume: 0.4 + 0.6 * Math.max(T.side, b.sailLevel / 2) });
    g.seaEvents?.sprays().splash(b.pos.x, b.pos.z, Math.round(10 + 16 * T.side), 5 + 4 * T.side, 8 + 5 * T.side, 0.8);
    if (T.side > 0.5) g.damage(hull, 'rogue');            // taken on the side: told as a blow
    else if (b.sailLevel === 2) g.damage(hull, 'rogueSail');
    else { g.damage(hull, 'rough'); if (g.mode === 'sailing') g.ui.toast(SEAS.waveOver, 'info'); }
  }

  // ------------------------------------------------------------ ice growlers
  buildIce() {
    const geo = chunkGeometry();
    this.ice = new THREE.InstancedMesh(geo, propMaterial, MAX_ICE);
    this.ink = new THREE.InstancedMesh(geo, thinOutline, MAX_ICE);
    for (const m of [this.ice, this.ink]) { m.count = 0; m.frustumCulled = false; m.name = 'growlers'; this.game.scene.add(m); }
    // They cast no shadows: the sea takes none, so it would only cost a draw for every
    // shadow cascade (fx.js would turn it on for any toon mesh not marked as seen to).
    this.ice.userData.fxShadow = true;
    this.ice.receiveShadow = true;
  }

  /** Is this growler's place clear of every shore and rock? Asked of the world once for each. */
  clearOfShore(G) {
    let ok = this.afloat.get(G.id);
    if (ok !== undefined) return ok;
    const world = this.game.world, R = GROWLERS.shore;
    ok = world.heightAt(G.x, G.z) < -8 && !world.rockHit(G.x, G.z, G.drift + G.r + 6);
    for (let a = 0; ok && a < 8; a++) ok = world.heightAt(G.x + Math.cos(a * 0.785) * R, G.z + Math.sin(a * 0.785) * R) < -6;
    this.afloat.set(G.id, ok);
    return ok;
  }

  updateIce(sailing) {
    const g = this.game, b = g.boat.pos, Z = SEA_ZONES[this.iceZone];
    // only within sight of the zone's own ring
    if (!Z || zoneDistance(this.iceZone, b.x, b.z) > Z.outer + Z.fade + GROWLERS.see) {
      if (this.ice?.count) this.ice.count = this.ink.count = 0;
      return;
    }
    if (!this.ice) this.buildIce();
    const t = g.elapsed, P = this._at, see = GROWLERS.see;
    let n = 0;
    for (const G of growlersNear(b.x, b.z, see, this.near)) {
      if (n >= MAX_ICE) break;
      if (!this.clearOfShore(G)) continue;
      growlerAt(G, t, P);
      const d = Math.hypot(P.x - b.x, P.z - b.z);
      const r = G.r * (1 - smoothstep(see - 60, see, d)); // it comes into sight small, not all at once
      if (r <= 0.01) continue;
      this._p.set(P.x, waveHeight(P.x, P.z) + Math.sin(t * 1.3 + G.p) * 0.15, P.z);
      this._m.compose(this._p, this._q.setFromAxisAngle(this._up, G.turn + t * G.w * 0.5), this._s.setScalar(r));
      this.ice.setMatrixAt(n, this._m); this.ink.setMatrixAt(n, this._m);
      n++;
      // solid, like the pieces an iceberg sheds: a hard knock is a rock strike
      if (sailing && d < G.r + 16 && g.seaEvents?.bump(P.x, P.z, G.r * 0.95, 'ice') === 'hit') this.count.ice++;
    }
    this.ice.count = this.ink.count = n;
    this.ice.instanceMatrix.needsUpdate = this.ink.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ debug
  /** For `tidewake.debug.rogue()`: the wave out there, the clock, and what the last strike cost. */
  debugState() {
    const W = this.wave, b = this.game.boat.pos, r = (n, p = 100) => Math.round(n * p) / p;
    return {
      wave: W ? { side: this.bearing(W), height: r(W.h), away: Math.round((b.x - W.x) * W.dx + (b.z - W.z) * W.dz), passed: W.passed !== false } : null,
      warning: this.warn, next: this.timer == null ? null : Math.round(this.timer),
      last: this.last && { share: r(this.last.share, 1000), hull: r(this.last.hull, 10), side: r(this.last.side), sail: this.last.sail, squarely: r(this.last.squarely) },
      count: { ...this.count }, growlers: this.ice?.count || 0,
    };
  }
}
