// Boat part: the rig. Applying upgrade tiers, colours and livery, dismasting,
// laying out mast, boom and sails for the current tiers (layoutRig), and the
// per-frame animation of sails, sheets, flags and lanterns (animate).
// Methods are mixed into Boat (see ../boat.js), so `this` is the boat.
import * as THREE from 'three';
import { glowBoost } from '../toon.js';
import { waveHeight } from '../waves.js';
import { clamp, damp, wrapAngle } from '../util.js';
import { part, mergeParts } from '../explorer.js';
import { SAIL_U, SAIL_V, JIB_U, JIB_V, TOP_U, TOP_V, BOOM_Y, BOOM_LEN, MAST_Z, MAST_BASE, SAIL_H, MAST_TOP, SIZE_SCALE, MAX_TIER, SAIL_BASE, HULL_STYLE, GOLD, BRASS, halfW, sailTexture, makeFlag, decoMat, ropePart, coilPart, setSeg, V3, STUB_H } from './parts.js';

export class BoatRig {
  applyUpgrades(levels, values) {
    const L = (k) => clamp(levels[k] || 0, 0, MAX_TIER);
    this.levels = { sail: L('sail'), hull: L('hull'), rudder: L('rudder'), keel: L('keel'), lantern: L('lantern'), spyglass: L('spyglass') };
    const lv = this.levels;
    this._values = values;
    // hull (tiers 4-5 also make the whole ship bigger)
    this.hullTiers.forEach((t, i) => { t.visible = i === lv.hull; });
    this.sizeScale = SIZE_SCALE[lv.hull];
    this.model.scale.setScalar(this.sizeScale);
    this.hasBowsprit = lv.hull >= 4;
    // sails & rig
    this.jib.visible = lv.sail >= 1;
    this.topsail.visible = lv.sail >= 4;
    this.pennant.mesh.visible = lv.sail >= 2;
    for (const p of this.extraPennants || []) p.mesh.visible = lv.sail >= 4;
    // helm
    this.tiller.visible = lv.rudder <= 1;
    this.rudderBlade.visible = lv.rudder >= 1;
    this.helm.visible = lv.rudder >= 2;
    this.wheels.forEach((w, i) => { w.visible = i === lv.rudder - 2; });
    this.binnacle.visible = lv.rudder >= 5;
    this.wheelR = lv.rudder >= 2 ? this.wheels[lv.rudder - 2].userData.R : 0.42;
    const ex = this.explorer, k = this.sizeScale;
    // only place the explorer at the helm while they're aboard (a story find
    // ashore, like the spyglass, applies upgrades too)
    const aboard = ex.root.parent === this.group;
    if (lv.rudder >= 2) { ex.setControl('wheel'); if (aboard) { ex.root.position.set(0, 1.0 * k, -3.0 * k); ex.root.rotation.y = 0; } }
    else { ex.setControl('tiller'); if (aboard) { ex.root.position.set(0.38 * k, 1.0 * k, -2.55 * k); ex.root.rotation.y = -0.25; } }
    // keel
    this.keelFin.visible = lv.keel >= 1;
    this.keelBulb.visible = lv.keel >= 2;
    this.runeBand.visible = lv.keel >= 3;
    this.runeMat.color.set(lv.keel >= 5 ? 0x3ff0d8 : 0x7ff6ff);
    this.keelBilge.visible = lv.keel >= 4;
    this.waterGlow.visible = lv.keel >= 5;
    // lantern
    this.lanterns.forEach((l, i) => {
      l.group.visible = i === lv.lantern;
      if (l.extra) l.extra.group.visible = i === lv.lantern;
    });
    this.activeLantern = this.lanterns[lv.lantern];
    if (this.light) {
      this.light.position.copy(this.activeLantern.light);
      this.light.color.set(this.activeLantern.color);
    }
    this.lanternMat = this.activeLantern.glowMat;
    // spyglass: belt spyglass, then a crow's nest, a mounted scope and a deck telescope
    ex.setSpyglass(lv.spyglass);
    this.nests[0].visible = lv.spyglass === 2;
    this.nests[1].visible = lv.spyglass >= 3;
    this.nestScope.visible = lv.spyglass >= 4;
    this.deckScope.visible = lv.spyglass >= 5;
    this.layoutRig();
    this.applyColors();
    this.applyDismast();

    this.maxHealth = values.hull;
    this.lanternRange = values.lantern;
  }

  /** Hull paint, sail cloth and flags: the tier's own colours, or the livery's where it names one. */
  applyColors() {
    const lv = this.levels, Lv = this.livery || {};
    const hs = HULL_STYLE[lv.hull];
    this.hullMat.color.set(Lv.hull || hs.hull);
    this.trimMat.color.set(Lv.trim || hs.trim);
    this.deckMat.color.set(Lv.deck || hs.deck);
    this.stripeMat.color.set(Lv.trim || '#3f7fd0');
    const cloth = Lv.sail || null;
    const mark = Lv.emblem || null;
    this.sailMat.map = sailTexture(lv.sail, false, cloth, mark);
    this.sailMat.needsUpdate = true;
    this.jibMat.map = sailTexture(lv.sail, true, cloth, mark);
    this.jibMat.needsUpdate = true;
    this.topMat.map = sailTexture(lv.sail, true, cloth, mark);
    this.topMat.needsUpdate = true;
    this.flagMat.color.set(Lv.flag || (lv.sail >= 3 ? GOLD : '#d64a3a'));
    this.pennant.mat.color.set(Lv.pennant || (lv.sail === 4 ? '#9c2f27' : lv.sail >= 3 ? GOLD : '#2f6fd0'));
    for (const p of this.extraPennants || []) p.mat.color.set(Lv.pennant || (lv.sail === 4 ? '#9c2f27' : GOLD));
    this.wreckClothMat?.color.set(cloth || SAIL_BASE[lv.sail]);
  }

  /**
   * Repaint the boat. livery: { hull, trim, deck, sail, flag, pennant, emblem } (CSS
   * hex, each optional; `sail` dyes every sail), or null for the tier's look.
   */
  setLivery(livery) {
    this.livery = livery || null;
    this.applyColors();
  }

  /** Mast gone by the board: a broken stub, no sails or rigging, a spar and canvas across the deck. */
  setDismasted(on) {
    on = !!on;
    if (on === this.dismasted) return;
    this.dismasted = on;
    if (on) { this.buildWreckage(); this.sailLevel = 0; }
    // un-breaking the mast is a full re-rig (applyUpgrades ends with applyDismast)
    if (!on && this._values) this.applyUpgrades(this.levels, this._values);
    else this.applyDismast();
  }

  /** Show or hide what a dismasting takes away. Runs after every applyUpgrades, which re-shows parts by tier. */
  applyDismast() {
    const on = this.dismasted;
    for (const m of [this.boom, this.rig, this.mainSheet, this.flag]) m.visible = !on;
    if (this.wreckage) this.wreckage.visible = on;
    if (!on) return;
    for (const m of [this.jib, this.jibSheet, this.jibSheetSlack, this.pennant.mesh, this.heart, ...this.nests,
      ...(this.extraPennants || []).map((p) => p.mesh)]) m.visible = false;
    this.mast.scale.y = this.mastInk.scale.y = STUB_H;
  }

  layoutRig() {
    const lv = this.levels;
    this.sailH = SAIL_H[lv.sail];
    const sailTop = BOOM_Y + this.sailH + 0.08;
    let top = MAST_TOP[lv.sail];
    // the gaff topsail's head sits just under the masthead
    this.topHead = lv.sail >= 4 ? top - 0.75 : sailTop;
    this.nestY = (lv.sail >= 4 ? this.topHead : sailTop) + 0.55;
    if (lv.spyglass >= 2) top = Math.max(top, this.nestY + 1.0);
    const h = top - MAST_BASE;
    this.mast.scale.y = h; this.mastInk.scale.y = h;
    this.mastTop.set(0, top, MAST_Z);
    this.flag.position.set(0, top - 0.35, MAST_Z);
    this.pennant.mesh.position.set(0, top - 1.05, MAST_Z);
    for (const n of this.nests) n.position.set(0, this.nestY, MAST_Z);
    this.heart.position.set(0, top + 0.05, MAST_Z);
    if (this.lanterns[5].extra) this.lanterns[5].extra.light.set(0, top + 0.47, MAST_Z);
    if (lv.lantern === 5) this.flag.position.y = top - 0.6;

    // ---- forestay, jib geometry anchors
    this.tack = this.hasBowsprit ? V3(0, 1.77, 5.42) : V3(0, 1.12, 3.74);
    this.stayHead = V3(0, top - 0.5, MAST_Z + 0.08);
    const jibHeadY = Math.min(top - 1.0, BOOM_Y + this.sailH * 0.92);
    const t = (jibHeadY - this.tack.y) / (this.stayHead.y - this.tack.y);
    this.jibHead = this.tack.clone().lerp(this.stayHead, t);
    this.stayAxis = this.stayHead.clone().sub(this.tack).normalize();
    // clew (centred, before swinging): about 60% of the way from tack to mast, low over the deck
    this.clew0 = V3(0, 1.5 + (this.hasBowsprit ? 0.2 : 0), MAST_Z + 0.35 + (this.hasBowsprit ? 0.5 : 0));
    this.jibCleat = (side) => this._c.set(side * 1.0, 1.08, MAST_Z - 0.15);

    // ---- standing rigging, merged into one mesh
    for (const c of [...this.rig.children]) { this.rig.remove(c); c.geometry?.dispose(); }
    const R = [];
    const r = 0.02;
    // forestay (with a bobstay under the bowsprit)
    R.push(ropePart(this.tack, this.stayHead, 0, 0.024));
    if (this.hasBowsprit) R.push(ropePart(V3(0, 1.75, 5.4), V3(0, 0.25, 3.78), 0, 0.022));
    // shrouds: two per side from the hounds to chainplates on the rail
    const hounds = V3(0, top - 0.95, MAST_Z);
    const chain = [];
    for (const side of [-1, 1]) {
      const pair = [];
      for (const z of [MAST_Z + 0.25, MAST_Z - 0.75]) {
        const cp = V3(side * (halfW(z) + 0.12), 1.08, z);
        R.push(ropePart(V3(side * 0.1, hounds.y, MAST_Z), cp, 0, r));
        R.push(part(new THREE.BoxGeometry(0.05, 0.28, 0.1), BRASS, { x: cp.x, y: 0.98, z: cp.z }));
        pair.push(cp);
      }
      chain.push([side, pair]);
    }
    // ratlines between the shrouds (sail tier 3+)
    if (lv.sail >= 3) {
      for (const [side, [a, b]] of chain) {
        const ta = V3(side * 0.1, hounds.y, MAST_Z);
        for (let y = 1.55; y < hounds.y - 1.2; y += 0.42) {
          const fa = (y - a.y) / (ta.y - a.y), fb = (y - b.y) / (ta.y - b.y);
          const pa = a.clone().lerp(ta, fa), pb = b.clone().lerp(ta, fb);
          R.push(ropePart(pa, pb, 0.03, 0.012));
        }
      }
    }
    // twin backstays to the stern quarters
    for (const side of [-1, 1]) R.push(ropePart(V3(0, top - 0.3, MAST_Z), V3(side * 0.98, 1.12, -3.05), 0, r));
    // halyards running down the mast to cleats
    for (const side of [-1, 1]) {
      R.push(ropePart(V3(side * 0.13, top - 0.2, MAST_Z + 0.04), V3(side * 0.13, 1.25, MAST_Z + 0.04), 0, 0.012));
      R.push(part(new THREE.BoxGeometry(0.05, 0.04, 0.16), '#3b2214', { x: side * 0.16, y: 1.25, z: MAST_Z + 0.04 }));
    }
    // topsail halyard + gaff peak lift (tiers 4-5)
    if (lv.sail >= 4) R.push(ropePart(V3(0.05, top - 0.15, MAST_Z - 0.05), V3(0.05, this.topHead, MAST_Z - 0.05), 0, 0.012));
    // coiled ropes on deck
    R.push(...coilPart(0.45, 1.02, MAST_Z - 0.45, 0.2), ...coilPart(-0.45, 1.02, MAST_Z - 0.45, 0.18));
    R.push(...coilPart(0.75, 1.02, -1.95, 0.2), ...coilPart(-0.55, 1.02, 2.75, 0.17));
    const rigMesh = new THREE.Mesh(mergeParts(R), decoMat);
    rigMesh.frustumCulled = false;
    this.rig.add(rigMesh);

    // extra pennants on the backstays for the grand rigs
    if (!this.extraPennants) {
      this.extraPennants = [];
      for (const side of [-1, 1]) {
        const p = makeFlag(1.4, 0.3, true, GOLD);
        this.model.add(p.mesh); this.flags.push(p); this.extraPennants.push(p);
      }
    }
    this.extraPennants.forEach((p, i) => {
      const side = i ? 1 : -1;
      p.mesh.position.set(side * 0.55, top * 0.62, MAST_Z - 1.6);
      p.mesh.visible = lv.sail >= 4;
    });
  }

  /** World-space point between the explorer's eyes. */
  getEyePosition(target = new THREE.Vector3()) { return this.explorer.getEyePosition(target); }

  setCharacterVisible(v) { this.explorer.root.visible = v; }

  animate(dt, t, wind, healthFrac, night, up) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const x = this.pos.x, z = this.pos.z;
    const K = this.sizeScale;
    const hb = waveHeight(x + fx * 3 * K, z + fz * 3 * K), hs = waveHeight(x - fx * 3 * K, z - fz * 3 * K);
    const hp = waveHeight(x - rx * 1.4 * K, z - rz * 1.4 * K), hst = waveHeight(x + rx * 1.4 * K, z + rz * 1.4 * K);
    const hc = (hb + hs + hp + hst) * 0.25;
    const lowRide = (1 - healthFrac) * 0.35;
    this.y = damp(this.y, hc - lowRide - this.sink, 8, dt);
    this.pitch = damp(this.pitch, -Math.atan2(hb - hs, 6 * K) * 0.8, 5, dt);
    const heelTarget = Math.sign(this.relWind) * [0, 0.5, 1][this.sailLevel] * this.efficiency * wind.strength * 0.16 * (1 - up.keel * 0.5)
      + this.rudder * Math.min(1, this.speed / 10) * 0.06;
    this.heel = damp(this.heel, heelTarget, 2, dt);
    this.roll = damp(this.roll, Math.atan2(hp - hst, 2.8 * K) * 0.7 + this.heel, 5, dt);
    this.group.position.set(x, this.y, z);
    this.group.rotation.set(this.pitch + this.sink * 0.05, this.heading, this.roll + this.sink * 0.12);

    // Sail trim and billow
    const sailTarget = [0.06, 0.55, 1][this.sailLevel];
    this.sailVis = damp(this.sailVis, sailTarget, 1.8, dt);
    const a = Math.abs(this.relWind);
    const boomMag = clamp((a - 0.45) * 0.55, 0.12, 1.45);
    this.boomAngle = damp(this.boomAngle, Math.sign(this.relWind || 1) * boomMag, 2.5, dt);
    this.boom.rotation.y = this.boomAngle;
    const billow = (0.25 + this.efficiency * 0.6) * wind.strength * (this.sailVis > 0.2 ? 1 : 0.2);
    const side = -Math.sign(this.relWind || 1);
    const pos = this.sailGeo.attributes.position;
    const H = this.sailH * this.sailVis;
    for (let j = 0; j <= SAIL_V; j++) for (let i = 0; i <= SAIL_U; i++) {
      const u = i / SAIL_U, v = j / SAIL_V;
      const hgt = H * (1 - 0.55 * u) * v + 0.08;
      const flap = Math.sin(t * 9 + u * 6 + v * 3) * 0.05 * (1 - this.efficiency);
      const bx = side * billow * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1)) * 0.9 + flap;
      pos.setXYZ(j * (SAIL_U + 1) + i, bx, hgt, -u * BOOM_LEN);
    }
    pos.needsUpdate = true;
    this.sailGeo.computeVertexNormals();
    this.updateTopsail(t, side, billow);
    this.updateJib(t, side, wind);
    this.updateSheets(side);

    // flags and pennants stream downwind
    const downwind = wrapAngle(wind.angle - this.heading);
    for (const f of this.flags) {
      if (!f.mesh.visible) continue;
      f.mesh.rotation.y = downwind;
      const fp = f.geo.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const bz = f.base[i * 3 + 2];
        fp.setX(i, f.base[i * 3] + Math.sin(t * 10 - bz * 3) * 0.12 * bz * (1.5 / f.w + 0.3));
      }
      fp.needsUpdate = true;
    }

    // Helm: tiller / rudder blade / wheel, and where the explorer's hands go
    const tillerYaw = this.rudder * 0.5;
    this.tiller.rotation.y = tillerYaw;
    this.rudderBlade.rotation.y = tillerYaw;
    const wheelRot = -this.rudder * 2.2;
    for (const w of this.wheels) w.rotation.z = wheelRot;
    let gripR, gripL = null;
    if (this.levels.rudder >= 2) {
      const R = this.wheelR, c = this.wheelCenter;
      const aL = 0.95 + wheelRot * 0.5, aR = -0.95 + wheelRot * 0.5;
      gripL = this._grip2.set(c.x + Math.sin(aL) * R, c.y + Math.cos(aL) * R, c.z).multiplyScalar(K);
      gripR = this._grip.set(c.x + Math.sin(aR) * R, c.y + Math.cos(aR) * R, c.z).multiplyScalar(K);
    } else {
      const phi = 0.62, L = 1.25;
      gripR = this._grip.set(Math.sin(tillerYaw) * Math.cos(phi) * L, 1.15 + Math.sin(phi) * L, -3.3 + Math.cos(tillerYaw) * Math.cos(phi) * L).multiplyScalar(K);
    }
    // apparent wind for the scarf
    const ws = wind.strength * 8;
    const ax = Math.sin(wind.angle) * ws - fx * this.speed, az = Math.cos(wind.angle) * ws - fz * this.speed;
    this.explorer.update(dt, t, {
      rudder: this.rudder, speed: this.speed, roll: this.roll,
      lookRel: this.lookYaw == null ? null : wrapAngle(this.lookYaw - this.heading),
      lookPitch: this.lookPitch || 0,
      windRel: wrapAngle(Math.atan2(ax, az) - this.heading),
      windStrength: Math.hypot(ax, az) / 10,
      gripR, gripL,
    });

    // Lantern
    const Lt = this.activeLantern;
    if (this.light) {
      this.light.intensity = night * 14 * (0.9 + Math.sin(t * 7) * 0.05) * (this.levels.lantern === 0 ? 0.7 : 1);
      this.light.distance = this.lanternRange || 30;
    }
    const glowK = (0.75 + night * 0.25) * glowBoost.value;
    Lt.glowMat.color.set(Lt.color).multiplyScalar(glowK).offsetHSL(0, 0, night * 0.08);
    const animLamp = (E) => {
      if (E.halo) {
        E.halo.material.opacity = 0.25 + night * 0.75;
        E.halo.scale.setScalar((E.haloSize || 1.4) * (1 + night * 0.6) * (1 + Math.sin(t * 2.2) * 0.04));
      }
      if (E.anim) {
        if (E.spin) { E.anim.rotation.y = t * 1.2; E.anim.position.y = (E.animY ?? 2.32) + Math.sin(t * 1.8) * 0.05; }
        else E.anim.scale.set(1, 1 + Math.sin(t * 13) * 0.15, 1);
      }
    };
    animLamp(Lt);
    const X = Lt.extra;
    if (X) {
      X.glowMat.color.set(X.color).multiplyScalar(glowK).offsetHSL(0, 0, night * 0.08);
      animLamp(X);
      if (this.light2) {
        this.light2.position.copy(X.light);
        this.light2.color.set(X.color);
        this.light2.intensity = night * 12 * (0.92 + Math.sin(t * 5.3) * 0.04);
        this.light2.distance = (this.lanternRange || 30) * 0.8;
      }
    } else if (this.light2) this.light2.intensity = 0;
    if (this.runeBand.visible) {
      const pulse = this.levels.keel >= 5 ? 0.5 + 0.5 * Math.sin(t * 2.4) : 0.5 + 0.5 * Math.sin(t * 1.6);
      this.runeMat.opacity = 0.35 + 0.45 * pulse + night * 0.2;
    }
    if (this.waterGlow.visible) {
      this.waterGlowMat.opacity = (0.25 + 0.2 * Math.sin(t * 2.4 + 1) + night * 0.35) * (0.6 + 0.4 * Math.min(1, Math.abs(this.speed) / 10));
    }

    this.updateWake(dt, fx, fz);
  }

  // Gaff topsail: a triangle from the main's head edge up to the masthead, on the boom.
  updateTopsail(t, side, billow) {
    if (!this.topsail.visible) return;
    const vis = clamp((this.sailVis - 0.06) / 0.94, 0, 1);
    const H = this.sailH * this.sailVis;
    const Ay = H + 0.08, Cy = 0.45 * H + 0.08, Cz = -BOOM_LEN * 0.92;
    const By = Ay + (this.topHead - BOOM_Y - Ay) * vis;
    const p = this.topGeo.attributes.position;
    for (let j = 0; j <= TOP_V; j++) for (let i = 0; i <= TOP_U; i++) {
      const u = i / TOP_U, v = j / TOP_V;
      const ey = Ay + (Cy - Ay) * u, ez = Cz * u;
      const y = ey + (By - ey) * v, z = ez * (1 - v);
      const bx = side * billow * 0.45 * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v + 0.15)) * (1 - v * 0.6)
        + Math.sin(t * 8 + u * 5 + v * 4) * 0.03 * (1 - this.efficiency);
      p.setXYZ(j * (TOP_U + 1) + i, bx, y, z);
    }
    p.needsUpdate = true;
    this.topGeo.computeVertexNormals();
  }

  // Jib: luff on the forestay, clew swings around the stay to leeward, rolls up when furled.
  updateJib(t, side, wind) {
    if (!this.jib.visible) return;
    const T = this.tack, Hd = this.jibHead;
    const swing = this.boomAngle * 0.85;
    this._q.setFromAxisAngle(this.stayAxis, swing);
    const C = this._a.copy(this.clew0).sub(T).applyQuaternion(this._q).add(T);
    const vis = clamp(this.sailVis * 1.05, 0.05, 1);
    // leeward normal of the sail plane
    const e1 = this._b.copy(Hd).sub(T), e2 = this._c.copy(C).sub(T);
    const n = e1.clone().cross(e2).normalize();
    if (n.x * side < 0) n.negate();
    const bil = (0.12 + this.efficiency * 0.35) * wind.strength * vis;
    const p = this.jibGeo.attributes.position;
    for (let j = 0; j <= JIB_V; j++) for (let i = 0; i <= JIB_U; i++) {
      const u = i / JIB_U, v = (j / JIB_V) * vis;
      // luff point and leech point at this height
      const lx = T.x + (Hd.x - T.x) * u, ly = T.y + (Hd.y - T.y) * u, lz = T.z + (Hd.z - T.z) * u;
      const ex = C.x + (Hd.x - C.x) * u, ey = C.y + (Hd.y - C.y) * u, ez = C.z + (Hd.z - C.z) * u;
      const b = bil * Math.sin(Math.PI * (j / JIB_V)) * (1 - u) * 1.4 + Math.sin(t * 9 + u * 6 + v * 4) * 0.025 * (1 - this.efficiency) * v;
      p.setXYZ(j * (JIB_U + 1) + i, lx + (ex - lx) * v + n.x * b, ly + (ey - ly) * v + n.y * b, lz + (ez - lz) * v + n.z * b);
    }
    p.needsUpdate = true;
    this.jibGeo.computeVertexNormals();
    this.jibClew = this._jc || (this._jc = new THREE.Vector3());
    this.jibClew.set(T.x + (C.x - T.x) * vis, T.y + (C.y - T.y) * vis, T.z + (C.z - T.z) * vis);
  }

  // Running rigging: main sheet from the boom end, jib sheets from the clew.
  updateSheets(side) {
    const b = this.boomAngle, zl = -BOOM_LEN + 0.15;
    const end = this._a.set(zl * Math.sin(b), BOOM_Y - 0.06, MAST_Z + zl * Math.cos(b));
    setSeg(this.mainSheet, this._b.set(0, 1.04, MAST_Z - BOOM_LEN + 0.3), end);
    const jv = this.jib.visible;
    this.jibSheet.visible = this.jibSheetSlack.visible = jv;
    if (!jv || !this.jibClew) return;
    setSeg(this.jibSheet, this.jibCleat(side).clone(), this.jibClew);
    // the windward sheet hangs slack across the deck
    const w = this.jibCleat(-side).clone();
    const mid = this._b.copy(w).lerp(this.jibClew, 0.5); mid.y = Math.max(1.06, mid.y - 0.5);
    setSeg(this.jibSheetSlack, w, mid);
  }
}
