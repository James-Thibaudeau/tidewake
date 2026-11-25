// A sailboat: model (with tiered visual upgrades), sailing physics,
// collisions, wake particles, and the explorer at the helm. The player's boat
// is `new Boat(scene)`; a second, computer-sailed boat (the rival's redwing) is
// `new Boat(scene, { npc: true, profile, livery })`.
//
// Boat is one class split over several files. This file holds the core: the
// constructor, placement, sailing physics and collisions (simulate), and the
// wake. The rest is mixed in from boat/:
//   boat/model.js     build(): hull tiers, mast, sails, flags; anchor; wreckage
//   boat/fittings.js  helm, keel, lanterns, crow's nest
//   boat/rig.js       applyUpgrades, colours and livery, layoutRig, animate
//   boat/parts.js     shared constants, textures, ropes and decoration helpers
// Every method is called as this.method() whichever file it lives in; grep
// for the method name to find it.
import * as THREE from 'three';
import { clamp, damp, wrapAngle, lerp, mixin } from './util.js';
import { WORLD_HALF } from './config.js';
import { SAIL_H, decoMat, thinInk, ropeMat } from './boat/parts.js';
import { BoatModel } from './boat/model.js';
import { BoatFittings } from './boat/fittings.js';
import { BoatRig } from './boat/rig.js';

// Efficiency by angle between bow and where the wind comes from (0 = into wind).
export function pointOfSail(a) {
  a = Math.abs(a);
  if (a < 0.6) return 0.05 + (a / 0.6) * 0.1;
  if (a < 1.0) return lerp(0.15, 0.78, (a - 0.6) / 0.4);
  if (a < 1.75) return lerp(0.78, 1.0, (a - 1.0) / 0.75);
  return lerp(1.0, 0.72, (a - 1.75) / (Math.PI - 1.75));
}

export function pointOfSailName(a) {
  a = Math.abs(a);
  if (a < 0.6) return 'In irons';
  if (a < 1.1) return 'Close hauled';
  if (a < 1.9) return 'Beam reach';
  if (a < 2.7) return 'Broad reach';
  return 'Running';
}

export class Boat {
  /**
   * opts.npc      not the player's boat: no PointLights (adding lights at
   *               runtime recompiles every shader), lantern glow meshes only
   * opts.profile  appearance profile for the explorer at the helm
   * opts.livery   { hull, trim, deck, sail, flag, pennant } colours that
   *               replace the tier colours (see setLivery)
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.npc = !!opts.npc;
    this.profile = opts.profile || null;
    this.livery = opts.livery || null;
    this.dismasted = false;
    this.up = null;        // upgrade values { sail, rudder, keel, hull, lantern }: an NPC's driver reads and writes these
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.sailLevel = 0;
    this.sailVis = 0;
    this.rudder = 0;
    this.push = new THREE.Vector2();
    this.heel = 0; this.roll = 0; this.pitch = 0; this.y = 0;
    this.sink = 0;
    this.maxHealth = 100;
    this.boomAngle = 0;
    this.relWind = 0;
    this.efficiency = 0;
    this.hitCooldown = 0;
    this.lookYaw = null;   // world yaw the explorer should look toward (or null)
    this.lookPitch = 0;
    this.levels = { sail: 0, hull: 0, rudder: 0, keel: 0, lantern: 0, spyglass: 0 };
    this.sailH = SAIL_H[0];
    this._grip = new THREE.Vector3(); this._grip2 = new THREE.Vector3();
    this.build();
    this.buildWake();
  }

  /** Show or hide the whole boat (the model and its wake). */
  setVisible(on) {
    this.group.visible = !!on;
    this.wake.mesh.visible = !!on;
  }

  /** Take the boat out of the scene and free what it owns (shared caches and materials stay). */
  dispose() {
    this.explorer.dispose();
    this.scene.remove(this.group);
    this.scene.remove(this.wake.mesh);
    this.wake.mesh.geometry.dispose();
    this.wake.material.dispose();
    const shared = new Set([decoMat, thinInk, ropeMat]);
    const geos = new Set(), mats = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !o.isSprite) geos.add(o.geometry); // every sprite shares one geometry
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) if (!shared.has(m)) mats.add(m);
    });
    for (const g of geos) g.dispose();
    // textures made for this boat alone (sail and halo textures are shared caches)
    for (const m of [this.deckMat, this.runeMat, this.waterGlowMat]) m.map?.dispose();
    for (const m of mats) m.dispose();
  }

  forward(out = new THREE.Vector2()) { return out.set(Math.sin(this.heading), Math.cos(this.heading)); }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.push.set(0, 0);
    this.sink = 0;
    this.sailLevel = 0;
    this.sailVis = 0;
    this.wake.reset();
  }

  /**
   * ctl: {steer, drive?}; wind: {angle, strength}; up: upgrade values.
   * Returns an array of collision events: {damage, kind}.
   */
  simulate(dt, ctl, wind, world, up) {
    const events = [];
    this.hitCooldown -= dt;
    this.rudder = damp(this.rudder, ctl.steer, 6, dt);
    // where the wind comes FROM, relative to the bow (positive = from port/left)
    this.relWind = wrapAngle(wind.angle + Math.PI - this.heading);
    this.efficiency = pointOfSail(this.relWind);
    // Thrust follows how much canvas is actually up (sailVis eases between
    // settings), so reefing or furling eases the drive off instead of cutting it.
    const sailF = clamp((this.sailVis - 0.06) / 0.94, 0, 1);
    const drive = ctl.drive ?? 1; // scales the sail's thrust (a boat in tow, a paced rival)
    let target = sailF * this.efficiency * wind.strength * 15 * up.sail * drive;
    if (this.sailLevel > 0) target = Math.max(target, 1.2 * sailF * drive);
    // Hull drag grows with speed: a fast boat sheds speed noticeably, but a
    // slow one coasts on for a good while (roughly 10-15 s to glide to a stop).
    const rate = target > this.speed ? 0.45 : 0.1 + Math.abs(this.speed) * 0.011;
    this.speed = damp(this.speed, target, rate, dt);
    const turnRate = (0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 8)) * 0.85 * up.rudder;
    this.heading -= this.rudder * turnRate * dt;
    this.speed *= 1 - Math.abs(this.rudder) * 0.08 * dt;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += (fx * this.speed + this.push.x) * dt;
    this.pos.z += (fz * this.speed + this.push.y) * dt;
    this.push.multiplyScalar(Math.exp(-2.5 * dt));

    // world edge: a strong current pushes you back
    const edge = WORLD_HALF - 250;
    const ax = Math.abs(this.pos.x), az = Math.abs(this.pos.z);
    this.atEdge = ax > edge || az > edge;
    if (ax > edge) this.push.x -= Math.sign(this.pos.x) * (ax - edge) * 0.3 * dt * 10;
    if (az > edge) this.push.y -= Math.sign(this.pos.z) * (az - edge) * 0.3 * dt * 10;
    this.pos.x = clamp(this.pos.x, -WORLD_HALF + 20, WORLD_HALF - 20);
    this.pos.z = clamp(this.pos.z, -WORLD_HALF + 20, WORLD_HALF - 20);

    // Terrain collision: probe bow, sides and stern
    const rx = -fz, rz = fx;
    const k = this.sizeScale;
    const probes = [[3.6, 0], [1.2, 1.3], [1.2, -1.3], [-2.9, 0.9], [-2.9, -0.9]];
    for (const [f0, r0] of probes) {
      const f = f0 * k, r = r0 * k;
      const px = this.pos.x + fx * f + rx * r, pz = this.pos.z + fz * f + rz * r;
      const h = world.heightAt(px, pz);
      if (h > -0.7) {
        const gx = world.heightAt(px + 1, pz) - world.heightAt(px - 1, pz);
        const gz = world.heightAt(px, pz + 1) - world.heightAt(px, pz - 1);
        const gl = Math.hypot(gx, gz) || 1;
        const nx = gx / gl, nz = gz / gl; // uphill direction
        const into = (fx * nx + fz * nz) * this.speed;
        const pen = Math.min(2, (h + 0.7) * 0.6 + 0.15);
        this.pos.x -= nx * pen; this.pos.z -= nz * pen;
        if (into > 0) {
          if (into > 3.5 && this.hitCooldown <= 0) {
            events.push({ damage: (into - 3.5) * 4.5 * (1 - up.keel * 0.4), kind: 'ground', speed: into });
            this.hitCooldown = 0.8;
            this.push.set(-nx * into * 0.6, -nz * into * 0.6);
            this.speed *= -0.25;
          } else {
            this.speed *= Math.exp(-6 * dt);
          }
        }
        break;
      }
    }
    // Rocks
    const rock = world.rockHit(this.pos.x + fx * 1.5 * k, this.pos.z + fz * 1.5 * k, 2.2 * k);
    if (rock) {
      let nx = this.pos.x - rock.x, nz = this.pos.z - rock.z;
      const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d;
      const into = -(fx * nx + fz * nz) * this.speed;
      const pen = rock.r + 3.6 * k - d;
      if (pen > 0) { this.pos.x += nx * pen * 0.5; this.pos.z += nz * pen * 0.5; }
      if (into > 3 && this.hitCooldown <= 0) {
        events.push({ damage: (into - 3) * 5 * (1 - up.keel * 0.4), kind: 'rock', speed: into });
        this.hitCooldown = 0.8;
        this.push.set(nx * into * 0.7, nz * into * 0.7);
        this.speed *= -0.3;
      } else if (into > 0) this.speed *= Math.exp(-5 * dt);
    }
    return events;
  }

  updateWake(dt, fx, fz) {
    const x = this.pos.x, z = this.pos.z;
    const k = this.sizeScale;
    this.wake.update(dt, x - fx * 2.9 * k, z - fz * 2.9 * k, x + fx * (this.hasBowsprit ? 3.5 : 3.2) * k, z + fz * (this.hasBowsprit ? 3.5 : 3.2) * k, fx, fz, this.speed);
  }
}

mixin(Boat, BoatModel, BoatFittings, BoatRig);
