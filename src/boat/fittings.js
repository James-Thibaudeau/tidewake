// Boat part: upgrade fittings built once and shown by tier: the helm (tiller
// or wheel), keel, lanterns, and the crow's nest with the deck spyglass.
// Methods are mixed into Boat (see ../boat.js), so `this` is the boat.
import * as THREE from 'three';
import { TAU } from '../util.js';
import { part } from '../explorer.js';
import { MAST_Z, GOLD, BRASS, COPPER, halfW, sideAt, bandGeo, canvasTex, softHalo, runeTexture, makeFlag, decoMesh } from './parts.js';

export class BoatFittings {
  buildHelm() {
    const g = this.model;
    // tiller (tiers 0-1), angled up so the explorer can reach it
    this.tiller = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4).translate(0, 0, 0.7), this.woodMat);
    this.tiller.position.set(0, 1.15, -3.3);
    this.tiller.rotation.order = 'YXZ';
    this.tiller.rotation.x = -0.5;
    g.add(this.tiller);
    // visible rudder blade (tier 1+)
    this.rudderBlade = new THREE.Group();
    this.rudderBlade.position.set(0, 0.35, -3.42);
    this.rudderBlade.add(decoMesh([
      part(new THREE.BoxGeometry(0.08, 1.35, 0.55), '#6e4a2c', { y: -0.35, z: -0.26 }),
      part(new THREE.BoxGeometry(0.1, 0.2, 0.6), '#5b3a1f', { y: -0.98, z: -0.28 }),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), BRASS, { y: 0.2, z: 0.02 }),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), BRASS, { y: -0.3, z: 0.02 }),
    ], true));
    g.add(this.rudderBlade);
    // ship's wheel on a pedestal (tier 2+, gold at tier 3)
    this.helm = new THREE.Group();
    g.add(this.helm);
    this.helm.add(decoMesh([
      part(new THREE.BoxGeometry(0.24, 0.8, 0.2), '#6e4a2c', { y: 1.4, z: -2.36 }),
      part(new THREE.BoxGeometry(0.38, 0.08, 0.32), '#5b3a1f', { y: 1.04, z: -2.36 }),
      part(new THREE.BoxGeometry(0.28, 0.06, 0.24), '#5b3a1f', { y: 1.8, z: -2.36 }),
    ], true));
    this.wheels = [];
    // rudder tiers 2..5
    const specs = [
      { R: 0.42, wood: '#8b5a2b', metal: BRASS, knob: null, n: 8 },
      { R: 0.42, wood: '#4a2a1c', metal: GOLD, knob: GOLD, n: 8 },
      { R: 0.52, wood: '#3b2214', metal: BRASS, knob: BRASS, n: 10 },
      { R: 0.55, wood: '#5a3018', metal: GOLD, knob: GOLD, n: 12, gilded: true },
    ];
    for (const sp of specs) {
      const { R, wood, metal } = sp;
      const parts = [
        part(new THREE.TorusGeometry(R, 0.04 + (R - 0.42) * 0.12, 6, 30), wood),
        part(new THREE.TorusGeometry(R, 0.012, 4, 30), metal, { z: 0.045 }),
        part(new THREE.CylinderGeometry(0.09 + (R - 0.42) * 0.3, 0.09, 0.14, 12), metal, { rx: Math.PI / 2 }),
      ];
      if (sp.gilded) {
        parts.push(part(new THREE.TorusGeometry(R * 0.55, 0.02, 4, 24), GOLD, { z: 0.03 }));
        parts.push(part(new THREE.TorusGeometry(R + 0.05, 0.015, 4, 30), GOLD, { z: -0.03 }));
      }
      for (let k = 0; k < sp.n / 2; k++) parts.push(part(new THREE.CylinderGeometry(0.022, 0.022, R * 2 + 0.22, 5), sp.gilded ? GOLD : wood, { rz: (k / (sp.n / 2)) * Math.PI }));
      for (let k = 0; k < sp.n; k++) {
        const a = (k / sp.n) * TAU;
        parts.push(part(new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6), wood, { x: Math.sin(a) * (R + 0.16), y: Math.cos(a) * (R + 0.16), rz: -a }));
        if (sp.knob) parts.push(part(new THREE.SphereGeometry(0.045, 6, 4), sp.knob, { x: Math.sin(a) * (R + 0.24), y: Math.cos(a) * (R + 0.24) }));
      }
      const w = decoMesh(parts, true);
      w.position.set(0, 1.8, -2.48);
      w.userData.R = R;
      this.helm.add(w);
      this.wheels.push(w);
    }
    // compass binnacle ahead of the gilded wheel (rudder tier 5)
    const bin = [
      part(new THREE.CylinderGeometry(0.16, 0.22, 0.75, 10), '#3a2014', { y: 1.38, z: -1.85 }),
      part(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 14), GOLD, { y: 1.78, z: -1.85 }),
      part(new THREE.SphereGeometry(0.21, 14, 8, 0, TAU, 0, Math.PI / 2), '#bfe6ff', { y: 1.8, z: -1.85 }),
      part(new THREE.TorusGeometry(0.21, 0.025, 6, 16), GOLD, { y: 1.82, z: -1.85, rx: Math.PI / 2 }),
      part(new THREE.SphereGeometry(0.06, 8, 6), GOLD, { y: 2.03, z: -1.85 }),
    ];
    for (const sd of [-1, 1]) bin.push(part(new THREE.SphereGeometry(0.08, 8, 6), sd < 0 ? '#d4402e' : '#2fa04a', { x: sd * 0.32, y: 1.8, z: -1.85 }));
    this.binnacle = decoMesh(bin, true);
    g.add(this.binnacle);
    this.wheelCenter = new THREE.Vector3(0, 1.8, -2.54);
  }

  buildKeel() {
    const g = this.model;
    this.keelFin = decoMesh([
      part(new THREE.BoxGeometry(0.14, 0.75, 3.0), COPPER, { y: -0.95, z: -0.3 }),
      part(new THREE.BoxGeometry(0.18, 0.06, 3.02), '#9a5428', { y: -0.6, z: -0.3 }),
      part(bandGeo(-0.22, 0.04, 0.008), COPPER),
    ]);
    this.keelBulb = decoMesh([
      part(new THREE.SphereGeometry(0.3, 12, 8), '#4a4f57', { y: -1.38, z: -0.4, sx: 0.75, sy: 0.65, sz: 2.4 }),
    ]);
    this.runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(), color: 0x7ff6ff, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.runeBand = new THREE.Mesh(bandGeo(0.13, 0.27, 0.035, 14), this.runeMat);
    // tier 4: twin bilge keels and riveted copper sheathing at the waterline
    const bilge = [];
    for (const side of [-1, 1]) {
      bilge.push(part(new THREE.BoxGeometry(0.1, 0.55, 2.4), COPPER, { x: side * 0.72, y: -0.62, z: -0.4, rz: side * 0.45 }));
      for (let z = -2.9; z <= 3.0; z += 0.32) {
        if (halfW(z) < 0.2) continue;
        for (const y of [-0.12, 0.0]) {
          const S = sideAt(z, y, side, 0.02);
          bilge.push(part(new THREE.SphereGeometry(0.028, 5, 3), '#e8a060', { x: S.x, y, z: S.z }));
        }
      }
    }
    bilge.push(part(bandGeo(-0.18, 0.06, 0.012), '#b8652e'));
    this.keelBilge = decoMesh(bilge);
    // tier 5: soft teal glow skirting the waterline
    const glowTex = canvasTex(8, 64, (gx, w, h) => {
      const gr = gx.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      gx.fillStyle = gr; gx.fillRect(0, 0, w, h);
    });
    this.waterGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x3ff0d8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.waterGlow = new THREE.Mesh(bandGeo(-0.35, 0.45, 0.25), this.waterGlowMat);
    for (const m of [this.keelFin, this.keelBulb, this.runeBand, this.keelBilge, this.waterGlow]) { m.visible = false; g.add(m); }
  }

  buildLanterns() {
    const root = new THREE.Group();
    root.position.set(-0.78, 1.0, -2.95);
    this.model.add(root);
    this.lanternRoot = root;
    const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
    const post = (h, c = '#6e4a2c') => part(new THREE.CylinderGeometry(0.05, 0.06, h, 6), c, { y: h / 2 });
    this.lanterns = [];
    // tier 0: candle in a dish
    {
      const grp = decoMesh([
        post(1.0),
        part(new THREE.CylinderGeometry(0.14, 0.1, 0.04, 10), BRASS, { y: 1.02 }),
        part(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), '#f8f1dc', { y: 1.12 }),
      ], true);
      const gm = glow(0xffc870);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), gm);
      flame.position.y = 1.26;
      grp.add(flame);
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 1.3, 0), color: 0xffb860, anim: flame });
    }
    // tier 1: oil lantern
    {
      const grp = decoMesh([
        post(1.6),
        part(new THREE.BoxGeometry(0.4, 0.06, 0.4), '#2b2b33', { y: 1.62 }),
        part(new THREE.ConeGeometry(0.33, 0.28, 4), '#2b2b33', { y: 2.22, ry: Math.PI / 4 }),
        part(new THREE.TorusGeometry(0.08, 0.015, 4, 10), '#2b2b33', { y: 2.42 }),
      ], true);
      const gm = glow(0xffd27a);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), gm);
      glass.position.y = 1.86;
      grp.add(glass);
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 1.9, 0), color: 0xffc070 });
    }
    // tier 2: brass lantern with a glass globe
    {
      const parts = [
        post(1.7, BRASS),
        part(new THREE.CylinderGeometry(0.2, 0.16, 0.08, 12), BRASS, { y: 1.72 }),
        part(new THREE.ConeGeometry(0.24, 0.24, 12), BRASS, { y: 2.26 }),
        part(new THREE.SphereGeometry(0.06, 8, 6), BRASS, { y: 2.42 }),
      ];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        parts.push(part(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4), BRASS, { x: Math.cos(a) * 0.18, y: 1.95, z: Math.sin(a) * 0.18 }));
      }
      const grp = decoMesh(parts, true);
      const gm = glow(0xffdc8a);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), gm);
      globe.position.y = 1.95; globe.scale.y = 1.2;
      grp.add(globe);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softHalo(), color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.y = 1.95; halo.scale.setScalar(1.4);
      grp.add(halo);
      this.lanterns.push({ group: grp, glowMat: gm, light: new THREE.Vector3(0, 1.95, 0), color: 0xffc880, halo, haloSize: 1.4 });
    }
    const haloSprite = (color, size) => {
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: softHalo(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      h.scale.setScalar(size);
      return h;
    };
    // Starlight Beacon: a floating crystal with a soft halo (tier 3, and the stern light of tier 5)
    const starlight = () => {
      const parts = [
        post(1.9, GOLD),
        part(new THREE.CylinderGeometry(0.16, 0.12, 0.06, 10), GOLD, { y: 1.92 }),
        part(new THREE.TorusGeometry(0.22, 0.025, 6, 20), GOLD, { y: 2.3, rx: Math.PI / 2 }),
      ];
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        parts.push(part(new THREE.ConeGeometry(0.03, 0.42, 5), GOLD, { x: Math.cos(a) * 0.14, y: 2.12, z: Math.sin(a) * 0.14, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 }));
      }
      const grp = decoMesh(parts, true);
      const gm = glow(0xcff6ff);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), gm);
      crystal.position.y = 2.32; crystal.scale.y = 1.6;
      grp.add(crystal);
      const halo = haloSprite(0x9fe8ff, 2.2);
      halo.position.y = 2.32;
      grp.add(halo);
      return { group: grp, glowMat: gm, light: new THREE.Vector3(0, 2.32, 0), color: 0xbfe6ff, halo, haloSize: 2.2, anim: crystal, spin: true, animY: 2.32 };
    };
    this.lanterns.push(starlight());
    // tier 4: twin brass lanterns, one at the stern and one at the bow
    {
      const brass = (h) => {
        const parts = [
          post(h, '#3b2214'),
          part(new THREE.CylinderGeometry(0.24, 0.2, 0.08, 12), BRASS, { y: h + 0.02 }),
          part(new THREE.ConeGeometry(0.29, 0.3, 12), BRASS, { y: h + 0.62 }),
          part(new THREE.TorusGeometry(0.09, 0.02, 4, 10), BRASS, { y: h + 0.84 }),
          part(new THREE.TorusGeometry(0.22, 0.02, 4, 16), BRASS, { y: h + 0.3, rx: Math.PI / 2 }),
        ];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          parts.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 4), BRASS, { x: Math.cos(a) * 0.21, y: h + 0.3, z: Math.sin(a) * 0.21 }));
        }
        const grp = decoMesh(parts, true);
        const gm = glow(0xffd98a);
        const globe = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.44, 12), gm);
        globe.position.y = h + 0.3;
        grp.add(globe);
        const halo = haloSprite(0xffc070, 1.6);
        halo.position.y = h + 0.3;
        grp.add(halo);
        return { grp, gm, halo, y: h + 0.3 };
      };
      const st = brass(1.7), bw = brass(1.0);
      const bowRoot = new THREE.Group();
      bowRoot.position.set(0.62, 1.0, 2.6);
      bowRoot.add(bw.grp);
      bowRoot.visible = false;
      this.model.add(bowRoot);
      this.lanterns.push({
        group: st.grp, glowMat: st.gm, light: new THREE.Vector3(0, st.y, 0), color: 0xffc878, halo: st.halo, haloSize: 1.6,
        extra: { group: bowRoot, glowMat: bw.gm, halo: bw.halo, haloSize: 1.5, color: 0xffc878, light: new THREE.Vector3(0.62, 1.0 + bw.y, 2.6) },
      });
    }
    // tier 5: Starlight stern beacon + the "Lighthouse Heart" crowning the mast
    {
      const stern = starlight();
      const heart = new THREE.Group();
      heart.add(decoMesh([
        part(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 12), GOLD),
        part(new THREE.TorusGeometry(0.34, 0.03, 6, 24), GOLD, { y: 0.42, rx: Math.PI / 2 }),
        part(new THREE.TorusGeometry(0.34, 0.02, 6, 24), GOLD, { y: 0.42 }),
        part(new THREE.ConeGeometry(0.06, 0.25, 6), GOLD, { y: 0.92 }),
      ], true));
      const hm = glow(0xfff1c8);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), hm);
      crystal.position.y = 0.42; crystal.scale.y = 1.5;
      heart.add(crystal);
      const halo = haloSprite(0xffe7a8, 4.5);
      halo.position.y = 0.42;
      heart.add(halo);
      heart.visible = false;
      this.model.add(heart);
      this.heart = heart;
      stern.extra = { group: heart, glowMat: hm, halo, haloSize: 4.5, color: 0xffe9b8, light: new THREE.Vector3(0, 10, MAST_Z), anim: crystal, spin: true, animY: 0.42 };
      this.lanterns.push(stern);
    }
    for (const L of this.lanterns) { L.group.visible = false; root.add(L.group); }
    // An NPC boat casts no light of its own: a scene's light count is baked
    // into every shader, so lights that come and go would recompile them all.
    this.light = this.light2 = null;
    if (this.npc) return;
    this.light = new THREE.PointLight(0xffc070, 0, 40, 1.2);
    root.add(this.light);
    // second light for the bow lantern / masthead heart (always present so shaders don't recompile)
    this.light2 = new THREE.PointLight(0xffc070, 0, 40, 1.2);
    this.model.add(this.light2);
  }

  buildNest() {
    this.nests = [];
    for (const gold of [false, true]) {
      const rim = gold ? GOLD : '#5b3a1f';
      const parts = [
        part(new THREE.CylinderGeometry(0.52, 0.42, 0.5, 16, 1, true), gold ? '#6e3b22' : '#8b5a2b'),
        part(new THREE.CircleGeometry(0.43, 16), '#6e4522', { y: -0.24, rx: Math.PI / 2 }),
        part(new THREE.TorusGeometry(0.52, 0.045, 6, 18), rim, { y: 0.25, rx: Math.PI / 2 }),
        part(new THREE.TorusGeometry(0.47, 0.03, 6, 18), rim, { y: -0.1, rx: Math.PI / 2 }),
      ];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.785;
        parts.push(part(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4), '#5b3a1f', { x: Math.cos(a) * 0.22, y: -0.55, z: Math.sin(a) * 0.22, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 }));
      }
      if (gold) {
        parts.push(part(new THREE.TorusGeometry(0.5, 0.02, 4, 18), GOLD, { y: 0.08, rx: Math.PI / 2 }));
        parts.push(part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), GOLD, { x: 0.5, y: 0.6 }));
        parts.push(part(new THREE.SphereGeometry(0.05, 6, 4), GOLD, { x: 0.5, y: 1.06 }));
      }
      const grp = decoMesh(parts, true);
      if (gold) {
        const p = makeFlag(0.9, 0.3, true, GOLD);
        p.mesh.position.set(0.5, 0.95, 0);
        grp.add(p.mesh);
        this.flags.push(p);
        this.nestPennant = p;
      }
      grp.visible = false;
      this.model.add(grp);
      this.nests.push(grp);
    }
    // tier 4+: a brass telescope mounted on the nest rim
    const tube = (len, r, metal) => [
      part(new THREE.CylinderGeometry(r, r * 1.25, len, 10), metal, { rx: Math.PI / 2 }),
      part(new THREE.CylinderGeometry(r * 1.35, r * 1.35, len * 0.12, 10), '#3b2214', { z: len * 0.15, rx: Math.PI / 2 }),
      part(new THREE.TorusGeometry(r * 1.3, r * 0.25, 4, 12), GOLD, { z: len * 0.5 }),
      part(new THREE.TorusGeometry(r * 1.05, r * 0.2, 4, 12), GOLD, { z: -len * 0.5 }),
    ];
    const mount = decoMesh([
      ...tube(0.9, 0.06, BRASS).map((g) => g.translate(0, 0.42, 0.25).rotateX(-0.15)),
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), '#3b2214', { y: 0.22, z: 0.2 }),
    ], true);
    mount.position.set(0.42, 0.1, 0.15);
    mount.rotation.y = 0.5;
    mount.visible = false;
    this.nests[1].add(mount);
    this.nestScope = mount;
    // tier 5: an ornate long telescope on a tripod on the quarterdeck
    const legs = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.3;
      legs.push(part(new THREE.CylinderGeometry(0.025, 0.03, 1.25, 5), '#3b2214', { x: Math.cos(a) * 0.28, y: 0.58, z: Math.sin(a) * 0.28, rx: Math.sin(a) * 0.24, rz: -Math.cos(a) * 0.24 }));
      legs.push(part(new THREE.SphereGeometry(0.035, 5, 4), GOLD, { x: Math.cos(a) * 0.43, y: 0.02, z: Math.sin(a) * 0.43 }));
    }
    legs.push(part(new THREE.SphereGeometry(0.07, 8, 6), GOLD, { y: 1.18 }));
    legs.push(...tube(1.5, 0.075, GOLD).map((g) => g.rotateX(-0.22).translate(0, 1.3, 0.1)));
    this.deckScope = decoMesh(legs, true);
    this.deckScope.position.set(-0.85, 1.0, -2.2);
    this.deckScope.rotation.y = 0.35;
    this.deckScope.visible = false;
    this.model.add(this.deckScope);
  }
}
