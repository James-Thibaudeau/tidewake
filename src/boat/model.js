// Boat part: the model. build() assembles the hull (every tier, shown one at
// a time), mast, sails and flags; plus the anchor, the wake and the wreckage
// of a dismasted boat. Methods are mixed into Boat (see ../boat.js), so `this` is the boat.
import * as THREE from 'three';
import { toon, toonGradient, toonMaterial } from '../toon.js';
import { Wake } from '../wake.js';
import { Explorer, part, mergeParts } from '../explorer.js';
import { SAIL_U, SAIL_V, JIB_U, JIB_V, TOP_U, TOP_V, BOOM_Y, BOOM_LEN, MAST_Z, MAST_BASE, MAST_TOP, SAIL_BASE, GOLD, BRASS, hullShape, taper, sideAt, onSide, bandGeo, deckTexture, sailTexture, makeFlag, thinInk, decoMesh, _up, ropePart, segMesh, V3, figurehead, STUB_H } from './parts.js';

export class BoatModel {
  build() {
    // Everything that makes up the ship lives in `model`, which scales up with the
    // big hull tiers. The explorer stays on the unscaled group so he keeps his size.
    this.model = new THREE.Group();
    this.group.add(this.model);
    this.sizeScale = 1;
    const g = this.model;
    const s = hullShape();
    // Hull: extruded top-view outline, tapered toward the keel, with plank banding
    const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.18, bevelSegments: 2, curveSegments: 12 });
    hullGeo.rotateX(Math.PI / 2);
    hullGeo.translate(0, 0.75, 0);
    const p = hullGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * taper(y));
      const band = Math.floor((y + 0.7) / 0.19);
      const v = band % 2 ? 0.88 : 1.0;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    hullGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    hullGeo.computeVertexNormals();
    this.hullMat = toon('#8f5e2e', { vertexColors: true });
    const hull = new THREE.Mesh(hullGeo, this.hullMat);
    const hullInk = new THREE.Mesh(hullGeo, new THREE.MeshBasicMaterial({ color: 0x1b2233, side: THREE.BackSide }));
    hullInk.scale.set(1.05, 1.05, 1.03);
    g.add(hull, hullInk);

    const rimGeo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 12 });
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.scale(1.07, 1, 1.04);
    rimGeo.translate(0, 0.98, 0);
    this.trimMat = toon('#cdb892');
    g.add(new THREE.Mesh(rimGeo, this.trimMat));

    const deckGeo = new THREE.ShapeGeometry(s, 12);
    deckGeo.rotateX(Math.PI / 2);
    deckGeo.rotateZ(Math.PI);
    deckGeo.scale(0.93, 1, 0.93);
    deckGeo.translate(0, 1.0, 0);
    this.deckMat = toon('#c89b62', { map: deckTexture() });
    g.add(new THREE.Mesh(deckGeo, this.deckMat));

    // Mast (unit height, scaled per rig tier) + boom + sail
    const woodMat = toon('#7a5432');
    this.woodMat = woodMat;
    const mastGeo = new THREE.CylinderGeometry(0.1, 0.14, 1, 8).translate(0, 0.5, 0);
    this.mast = new THREE.Mesh(mastGeo, woodMat);
    this.mastInk = new THREE.Mesh(mastGeo, thinInk);
    for (const m of [this.mast, this.mastInk]) m.position.set(0, MAST_BASE, MAST_Z);
    g.add(this.mast, this.mastInk);
    this.mastTop = new THREE.Vector3(0, MAST_TOP[0], MAST_Z);

    this.boom = new THREE.Group();
    this.boom.position.set(0, BOOM_Y, MAST_Z);
    g.add(this.boom);
    const boomBar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, BOOM_LEN + 0.1, 6), woodMat);
    boomBar.rotation.x = Math.PI / 2;
    boomBar.position.z = -BOOM_LEN / 2;
    this.boom.add(boomBar);

    this.sailGeo = new THREE.BufferGeometry();
    const n = (SAIL_U + 1) * (SAIL_V + 1);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= SAIL_V; j++) for (let i = 0; i <= SAIL_U; i++) {
      const k = j * (SAIL_U + 1) + i;
      uv[k * 2] = i / SAIL_U; uv[k * 2 + 1] = j / SAIL_V;
    }
    this.sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sailGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 0; j < SAIL_V; j++) for (let i = 0; i < SAIL_U; i++) {
      const a = j * (SAIL_U + 1) + i, b = a + 1, c = a + SAIL_U + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    this.sailGeo.setIndex(idx);
    this.sailMat = toonMaterial({ map: sailTexture(0), gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.sail = new THREE.Mesh(this.sailGeo, this.sailMat);
    this.sail.frustumCulled = false;
    this.boom.add(this.sail);

    // Jib: luff along the forestay, tack at the bow (or bowsprit), clew sheeted to leeward
    this.jibGeo = this.makeSailGrid(JIB_U, JIB_V, true);
    this.jibMat = toonMaterial({ map: sailTexture(1), gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.jib = new THREE.Mesh(this.jibGeo, this.jibMat);
    this.jib.frustumCulled = false;
    g.add(this.jib);
    // Gaff topsail above the main (sail tiers 4-5): lives on the boom so it swings with it
    this.topGeo = this.makeSailGrid(TOP_U, TOP_V, false);
    this.topMat = toonMaterial({ map: sailTexture(4), gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.topsail = new THREE.Mesh(this.topGeo, this.topMat);
    this.topsail.frustumCulled = false;
    this.boom.add(this.topsail);
    // standing rigging (rebuilt on upgrade) + running rigging (re-aimed every frame)
    this.rig = new THREE.Group();
    g.add(this.rig);
    this.mainSheet = segMesh(0.02);
    this.jibSheet = segMesh(0.018);
    this.jibSheetSlack = segMesh(0.016);
    g.add(this.mainSheet, this.jibSheet, this.jibSheetSlack);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    // Flag at the masthead + racing pennant (tier 2+), both stream downwind
    this.flags = [];
    const flag = makeFlag(1.5, 0.75, false, '#d64a3a');
    this.flag = flag.mesh; this.flagMat = flag.mat;
    g.add(flag.mesh); this.flags.push(flag);
    const pen = makeFlag(2.6, 0.42, true, '#2f6fd0');
    this.pennant = pen;
    g.add(pen.mesh); this.flags.push(pen);

    this.buildHullTiers();
    this.buildHelm();
    this.buildKeel();
    this.buildLanterns();
    this.buildNest();

    this.buildAnchor();

    // The explorer
    this.explorer = this.profile ? new Explorer(this.profile) : new Explorer();
    this.group.add(this.explorer.root);
  }

  /** Grandfather's anchor, hung at the starboard bow once it's fitted; its look follows the refit tier. */
  buildAnchor() {
    this.anchorStowed = new THREE.Group();
    this.anchorDown = new THREE.Group(); // dropped: a chain running from the bow down into the water
    this.anchorStowed.visible = false;
    this.anchorDown.visible = false;
    this.model.add(this.anchorStowed, this.anchorDown);
    this.anchorState = 'none';
    this.anchorTier = -1;
    this.setAnchorTier(0);
  }

  /** Rebuild the anchor for a refit tier (0 as found … 4 gilded, with ice spikes). */
  setAnchorTier(tier) {
    if (tier === this.anchorTier) return;
    this.anchorTier = tier;
    for (const g of [this.anchorStowed, this.anchorDown]) {
      for (const o of [...g.children]) { g.remove(o); o.traverse((m) => m.geometry?.dispose()); }
    }
    const anchor = decoMesh(anchorParts(tier), true);
    anchor.position.set(0.98, 0.42, 2.85);
    anchor.rotation.set(0.12, 0.3, 0.22);
    anchor.scale.setScalar(1.7); // big enough to read from the chase camera
    // from the cathead to the ring: a rope, then the tempered chain from tier 3
    const a = V3(0.6, 1.2, 3.15), b = V3(0.98, 1.3, 2.95);
    const hang = decoMesh(tier >= 3 ? chainParts(a, b, 5, TEMPERED) : [ropePart(a, b, 0.05, 0.025)]);
    this.anchorStowed.add(anchor, hang);
    this.anchorDown.add(decoMesh([ropePart(V3(0.62, 1.05, 3.35), V3(1.0, -1.8, 5.0), 0.25, tier >= 3 ? 0.045 : 0.035, tier >= 3 ? TEMPERED : '#4a525c')]));
  }

  /** 'none' (no anchor yet) | 'stowed' (at the bow) | 'down' (dropped, chain in the water). */
  setAnchor(state) {
    this.anchorState = state;
    this.anchorStowed.visible = state === 'stowed';
    this.anchorDown.visible = state === 'down';
  }

  buildHullTiers() {
    const tiers = [];
    // tier 0: weathered planks with patch boards and nails
    {
      const parts = [];
      for (const [side, z, y, c] of [[1, -1.4, 0.32, '#a77a48'], [1, 1.25, 0.5, '#6e4522'], [-1, 0.5, 0.3, '#a1733f'], [-1, -2.1, 0.55, '#b0844f']]) {
        const S = sideAt(z, y, side, 0.02);
        parts.push(part(new THREE.BoxGeometry(0.55, 0.22, 0.04), c, { x: S.x, y, z: S.z, ry: S.yaw }));
        for (const [lx, ly] of [[-0.22, -0.07], [0.22, -0.07], [-0.22, 0.07], [0.22, 0.07]]) {
          const q = onSide(S, lx, ly, 0.025);
          parts.push(part(new THREE.BoxGeometry(0.035, 0.035, 0.02), '#3a2a1e', { x: q.x, y: q.y, z: q.z, ry: S.yaw }));
        }
      }
      tiers.push(decoMesh(parts));
    }
    // tier 1: painted stripe + rope fenders
    {
      const parts = [];
      for (const side of [-1, 1]) for (const z of [-1.3, 0.5]) {
        const S = sideAt(z, 0.3, side, 0.14);
        parts.push(part(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 10), '#e9d7a8', { x: S.x, y: 0.3, z: S.z }));
        parts.push(part(new THREE.TorusGeometry(0.11, 0.02, 4, 10), '#b89a62', { x: S.x, y: 0.42, z: S.z, rx: Math.PI / 2 }));
        parts.push(part(new THREE.TorusGeometry(0.11, 0.02, 4, 10), '#b89a62', { x: S.x, y: 0.18, z: S.z, rx: Math.PI / 2 }));
        parts.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 4), '#8a6a3a', { x: S.x * 0.97, y: 0.75, z: S.z }));
      }
      const grp = decoMesh(parts);
      // the stripe is its own mesh so a livery's trim colour can repaint it
      this.stripeMat = toon('#3f7fd0', { side: THREE.DoubleSide });
      grp.add(new THREE.Mesh(bandGeo(0.36, 0.48, 0.012), this.stripeMat));
      tiers.push(grp);
    }
    // tiers 2 and 3: rub rail, portholes, figurehead (+ gold filigree and stern brackets)
    for (const gold of [false, true]) {
      const rail = gold ? GOLD : BRASS;
      const parts = [
        part(bandGeo(0.64, 0.75, 0.03), rail),
        part(bandGeo(0.36, 0.45, 0.012), gold ? '#7a1f1f' : '#f5efe0'),
      ];
      if (gold) parts.push(part(bandGeo(0.1, 0.15, 0.012), GOLD));
      for (const side of [-1, 1]) {
        for (const z of [-1.8, -0.6, 0.6]) {
          const S = sideAt(z, 0.54, side, 0.015);
          parts.push(part(new THREE.TorusGeometry(0.1, 0.028, 6, 16), rail, { x: S.x, y: 0.54, z: S.z, ry: S.yaw }));
          const q = onSide(S, 0, 0, -0.005);
          parts.push(part(new THREE.CircleGeometry(0.085, 14), '#24507f', { x: q.x, y: 0.54, z: q.z, ry: S.yaw }));
          const h = onSide(S, -0.03, 0.03, 0.002);
          parts.push(part(new THREE.CircleGeometry(0.025, 8), '#bfe6ff', { x: h.x, y: h.y, z: h.z, ry: S.yaw }));
        }
        if (gold) {
          for (const z of [-2.5, -1.2, 0.0, 1.2]) {
            const S = sideAt(z, 0.24, side, 0.02);
            parts.push(part(new THREE.TorusGeometry(0.15, 0.022, 4, 14, Math.PI * 1.4), GOLD, { x: S.x, y: 0.24, z: S.z, ry: S.yaw, rz: z * 1.7 }));
            parts.push(part(new THREE.SphereGeometry(0.04, 6, 4), GOLD, { x: S.x, y: 0.24, z: S.z }));
          }
          // ornate stern lantern brackets
          parts.push(part(new THREE.TorusGeometry(0.22, 0.035, 5, 16, Math.PI * 1.5), GOLD, { x: side * 1.15, y: 1.25, z: -3.3, ry: Math.PI / 2, rz: 0.6 }));
          parts.push(part(new THREE.SphereGeometry(0.07, 8, 6), GOLD, { x: side * 1.15, y: 1.5, z: -3.3 }));
          parts.push(part(new THREE.ConeGeometry(0.05, 0.16, 6), GOLD, { x: side * 1.15, y: 1.62, z: -3.3 }));
        }
      }
      const grp = decoMesh(parts);
      grp.add(figurehead(gold));
      tiers.push(grp);
    }
    // tiers 4 and 5: galleon and royal flagship (the whole model also scales up)
    for (const royal of [false, true]) tiers.push(this.grandHull(royal));
    this.hullTiers = tiers;
    for (const t of tiers) { t.visible = false; this.model.add(t); }
  }

  grandHull(royal) {
    const gold = GOLD, accent = royal ? '#1d8c8c' : '#f3e7c9', dark = royal ? '#0c2a40' : '#2a120c';
    const parts = [
      // double gold stripes with a coloured band between them
      part(bandGeo(0.66, 0.76, 0.03), gold),
      part(bandGeo(0.5, 0.6, 0.015), accent),
      part(bandGeo(0.42, 0.48, 0.03), gold),
      part(bandGeo(0.08, 0.14, 0.015), gold),
    ];
    for (const side of [-1, 1]) {
      // a row of gold portholes
      for (const z of [-2.2, -1.3, -0.4, 0.5, 1.4]) {
        const S = sideAt(z, 0.3, side, 0.015);
        parts.push(part(new THREE.TorusGeometry(0.085, 0.024, 6, 14), gold, { x: S.x, y: 0.3, z: S.z, ry: S.yaw }));
        const q = onSide(S, 0, 0, -0.005);
        parts.push(part(new THREE.CircleGeometry(0.07, 12), royal ? '#ffd88a' : '#24507f', { x: q.x, y: 0.3, z: q.z, ry: S.yaw }));
      }
      // gold scrollwork at the bow
      for (const [z, y, r] of [[2.6, 0.55, 0.22], [3.05, 0.6, 0.16], [2.2, 0.2, 0.18]]) {
        const S = sideAt(z, y, side, 0.03);
        parts.push(part(new THREE.TorusGeometry(r, 0.03, 4, 16, Math.PI * 1.5), gold, { x: S.x, y, z: S.z, ry: S.yaw, rz: z * 2.1 }));
      }
      // deck lockers and lashed barrels
      parts.push(part(new THREE.BoxGeometry(0.42, 0.3, 0.7), dark, { x: side * 0.78, y: 1.15, z: -1.25 }));
      parts.push(part(new THREE.BoxGeometry(0.46, 0.05, 0.74), gold, { x: side * 0.78, y: 1.31, z: -1.25 }));
      parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10), '#9c6b3a', { x: side * 0.7, y: 1.21, z: 2.05 }));
      parts.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 10), '#3a2a1e', { x: side * 0.7, y: 1.32, z: 2.05 }));
      parts.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 10), '#3a2a1e', { x: side * 0.7, y: 1.1, z: 2.05 }));
      // stern lantern brackets
      parts.push(part(new THREE.TorusGeometry(0.24, 0.035, 5, 16, Math.PI * 1.5), gold, { x: side * 1.18, y: 1.3, z: -3.35, ry: Math.PI / 2, rz: 0.6 }));
      parts.push(part(new THREE.SphereGeometry(0.08, 8, 6), gold, { x: side * 1.18, y: 1.58, z: -3.35 }));
    }
    // carved transom: stern windows with a little gallery and balusters
    parts.push(part(new THREE.BoxGeometry(2.1, 0.62, 0.06), dark, { y: 0.55, z: -3.43 }));
    for (const x of [-0.6, 0, 0.6]) {
      parts.push(part(new THREE.BoxGeometry(0.36, 0.34, 0.03), royal ? '#ffd88a' : '#ffcf7a', { x, y: 0.56, z: -3.47 }));
      parts.push(part(new THREE.TorusGeometry(0.2, 0.025, 4, 4), gold, { x, y: 0.56, z: -3.48, rz: Math.PI / 4, sx: 1.0, sy: 1.0 }));
    }
    parts.push(part(new THREE.BoxGeometry(2.3, 0.07, 0.42), dark, { y: 0.18, z: -3.62 }));
    parts.push(part(new THREE.BoxGeometry(2.32, 0.05, 0.05), gold, { y: 0.48, z: -3.82 }));
    for (let k = 0; k < 9; k++) parts.push(part(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 5), gold, { x: -1.08 + k * 0.27, y: 0.33, z: -3.81 }));
    parts.push(part(new THREE.TorusGeometry(0.32, 0.04, 5, 18, Math.PI), gold, { y: 0.88, z: -3.44 }));
    // bowsprit with a gilded tip and a bobstay to the stem
    parts.push(part(new THREE.CylinderGeometry(0.07, 0.11, 2.3, 8), royal ? '#5b3a1f' : '#6e4a2c', { y: 1.37, z: 4.32, rx: Math.PI / 2 - 0.36 }));
    parts.push(part(new THREE.SphereGeometry(0.1, 8, 6), gold, { y: 1.77, z: 5.42 }));
    parts.push(part(new THREE.CylinderGeometry(0.115, 0.115, 0.08, 10), gold, { y: 1.2, z: 3.85, rx: Math.PI / 2 - 0.36 }));
    const grp = decoMesh(parts);
    const fig = figurehead(true, royal);
    if (royal) fig.scale.setScalar(1.25);
    grp.add(fig);
    return grp;
  }

  buildWake() {
    this.wake = new Wake(this.scene);
    this.wakeMat = this.wake.material; // game.js feeds it the scene light
  }

  // An indexed grid of (u+1)*(v+1) vertices with uvs; positions are written every frame.
  makeSailGrid(nu, nv, swapUV) {
    const geo = new THREE.BufferGeometry();
    const n = (nu + 1) * (nv + 1);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      if (swapUV) { uv[k * 2] = j / nv; uv[k * 2 + 1] = i / nu; } else { uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv; }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    return geo;
  }

  buildWreckage() {
    if (this.wreckage) return;
    const WOOD = '#7a5432', top = MAST_BASE + STUB_H;
    const parts = [];
    // splintered top of the stub
    for (const [x, z, h, r] of [[0.05, 0.03, 0.42, 0.06], [-0.05, 0.04, 0.3, 0.05], [0.0, -0.06, 0.24, 0.05], [0.06, -0.04, 0.16, 0.04]]) {
      parts.push(part(new THREE.ConeGeometry(r, h, 4), WOOD, { x, y: top + h / 2 - 0.04, z: MAST_Z + z, ry: x * 9 }));
    }
    // the rest of the mast: fallen aft and to starboard, its head over the side
    const a = V3(0.1, 1.5, MAST_Z - 0.35), b = V3(2.7, 0.9, -2.3); // resting on the rail
    const mid = a.clone().lerp(b, 0.5), len = a.distanceTo(b);
    const q = new THREE.Quaternion().setFromUnitVectors(_up, b.clone().sub(a).normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.12, len, 7), WOOD, { x: mid.x, y: mid.y, z: mid.z, rx: e.x, ry: e.y, rz: e.z }));
    parts.push(part(new THREE.ConeGeometry(0.12, 0.3, 4), WOOD, { x: a.x - 0.05, y: a.y + 0.04, z: a.z + 0.14, rx: 1.9, rz: 0.5 }));
    // the gaff, snapped off and lying across the foredeck
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.06, 2.3, 6), WOOD, { x: -0.25, y: 1.1, z: MAST_Z + 1.35, rx: Math.PI / 2, rz: 0.75 }));
    // tangled rigging trailing over the side
    parts.push(ropePart(V3(0.3, 1.25, MAST_Z - 0.2), V3(1.5, 0.95, -0.2), 0.2, 0.02));
    parts.push(ropePart(V3(1.25, 1.02, -0.9), V3(1.9, -0.2, -2.9), 0.25, 0.02));
    parts.push(ropePart(V3(-0.2, 1.3, MAST_Z + 0.2), V3(-1.25, 1.02, 1.9), 0.18, 0.02));
    const wood = decoMesh(parts, true);
    // sailcloth heaped round the stub and dragged over the rail with the mast
    const cloth = [];
    for (const [x, y, z, sx, sy, sz, ry] of [
      [0.25, 1.12, MAST_Z - 0.7, 0.95, 0.2, 0.75, 0.3], [0.85, 1.16, MAST_Z - 1.35, 0.8, 0.24, 0.6, -0.4],
      [-0.35, 1.1, MAST_Z - 0.15, 0.6, 0.16, 0.7, 0.9], [1.45, 0.98, -1.25, 0.6, 0.2, 0.75, 0.2],
      [1.9, 0.72, -1.8, 0.4, 0.42, 0.8, 0.5], [0.45, 1.3, MAST_Z - 1.0, 0.5, 0.2, 0.4, 1.2],
    ]) cloth.push(part(new THREE.SphereGeometry(1, 10, 6), '#ffffff', { x, y, z, sx, sy, sz, ry }));
    const clothGeo = mergeParts(cloth);
    this.wreckClothMat = toon(this.livery?.sail || SAIL_BASE[this.levels.sail], { vertexColors: true });
    const heap = new THREE.Mesh(clothGeo, this.wreckClothMat);
    const heapInk = new THREE.Mesh(clothGeo, thinInk);
    this.wreckage = new THREE.Group();
    this.wreckage.add(wood, heap, heapInk);
    this.model.add(this.wreckage);
  }
}

// ------------------------------------------------------------- the anchor
const TEMPERED = '#2b3644';

/**
 * Grandfather's anchor at a refit tier, in its own space (shank along y, ring
 * at the top). 1 adds grapnel arms across the first pair, 2 broad flukes
 * crusted with coral, 3 the tempered chain (in setAnchorTier), 4 ice spikes
 * and gilding. The wooden stock stays: it is still his anchor.
 */
function anchorParts(tier) {
  const gilded = tier >= 4;
  const IRON = gilded ? BRASS : '#3c434c', IRON2 = gilded ? GOLD : '#5b6570';
  const P = [
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.9, 6), IRON),                            // shank
    part(new THREE.TorusGeometry(0.09, 0.025, 4, 10), IRON2, { y: 0.52 }),                   // ring
    part(new THREE.CylinderGeometry(0.032, 0.032, 0.62, 5), '#6b4a2b', { y: 0.36, rz: Math.PI / 2 }), // wooden stock
    part(new THREE.TorusGeometry(0.28, 0.045, 5, 12, Math.PI), IRON, { y: -0.2, rz: Math.PI }), // arms
    part(new THREE.SphereGeometry(0.07, 6, 4), IRON2, { y: -0.47 }),                         // crown
  ];
  const tips = [[1, 0], [-1, 0]];
  if (tier >= 1) {
    P.push(part(new THREE.TorusGeometry(0.28, 0.04, 5, 12, Math.PI), IRON, { y: -0.2, ry: Math.PI / 2, rz: Math.PI }));
    tips.push([0, 1], [0, -1]);
  }
  for (const [sx, sz] of tips) {
    const x = sx * 0.28, z = sz * 0.28, rz = sx * -0.25, rx = sz * 0.25;
    if (tier >= 2) {
      P.push(part(new THREE.SphereGeometry(0.11, 7, 5), gilded ? GOLD : '#d9735a', { x, y: -0.12, z, rx, rz, sx: sz ? 1 : 0.45, sy: 1.25, sz: sx ? 1 : 0.45 }));
      P.push(part(new THREE.ConeGeometry(0.03, 0.1, 4), '#f6b09a', { x: x * 1.15, y: -0.03, z: z * 1.15, rx, rz }));
    } else P.push(part(new THREE.ConeGeometry(0.09, 0.2, 4), IRON2, { x, y: -0.13, z, rx, rz }));
    if (tier >= 4) P.push(part(new THREE.ConeGeometry(0.035, 0.15, 4), '#dff3ff', { x: x * 0.92, y: -0.28, z: z * 0.92, rx: Math.PI + rx, rz }));
  }
  if (tier >= 4) P.push(part(new THREE.ConeGeometry(0.045, 0.18, 4), '#dff3ff', { y: -0.6, rx: Math.PI }));
  return P;
}

/** n links of chain from a to b, alternately flat and edge-on. */
function chainParts(a, b, n, color) {
  const d = b.clone().sub(a), len = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()));
  const P = [];
  for (let i = 0; i < n; i++) {
    const p = a.clone().addScaledVector(d, (i + 0.5) / n);
    const geo = new THREE.TorusGeometry(len / n * 0.62, 0.02, 4, 8).scale(0.55, 1, 1);
    if (i % 2) geo.rotateY(Math.PI / 2);
    P.push(part(geo, color, { x: p.x, y: p.y, z: p.z, rx: e.x, ry: e.y, rz: e.z }));
  }
  return P;
}
