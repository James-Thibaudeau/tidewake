// The paint yard: buying paints, cloth, emblems, flags and figureheads at the
// shipwright, putting them on the ship, the earned ones turning up, and the
// side view of your ship that the paint yard shows (preview).
// What there is and what it costs is in paints.js; game.state.paints holds
// what you own ('kind:id'), game.state.livery what the ship wears.
import * as THREE from 'three';
import { Boat } from './boat.js';
import { keyOf, paintInfo, kindOf, ownsPaint, newlyEarned, liveryFor, blankLivery } from './paints.js';

// The preview: a still ship from abeam, drawn into a small picture.
const PREVIEW_W = 480, PREVIEW_H = 300; // index.html #yardPreview and its CSS aspect-ratio match

export class PaintYard {
  constructor(game) {
    this.game = game;
    this.preview = null;
    game.events.on('dock', () => this.claimEarned());
  }

  /** What the save alone can't say: is every island on the chart? */
  ctx() {
    const g = this.game, seen = g.state.discovered;
    const charted = g.world.islands.every((I) => I.isReef || I.wreck || seen.has(I.id));
    return { charted };
  }

  owns(kind, id) { return ownsPaint(this.game.state, kind, id, this.ctx()); }

  /** Buy one item with banked gold. Returns true on success. */
  buy(kind, id) {
    const g = this.game, s = g.state, p = paintInfo(kind, id);
    if (!p || p.earn || this.owns(kind, id)) return false;
    if (s.banked < p.price) { g.ui.toast('Not enough gold', 'warn'); return false; }
    s.banked -= p.price;
    s.paints.push(keyOf(p));
    g.audio.play('upgrade');
    g.ui.toast(`${p.name} added to the paint yard`, 'gold');
    g.events.emit('paint', keyOf(p));
    g.savePortState();
    return true;
  }

  /** Put an owned item on a part (null: back to the hull tier's look). Free. */
  wear(part, id) {
    const g = this.game, s = g.state, kind = kindOf(part);
    if (!kind) return false;
    if (id != null && !this.owns(kind, id)) return false;
    s.livery = { ...blankLivery(), ...s.livery, [part]: id ?? null };
    this.apply();
    if (g.mode === 'docked') g.savePortState(); else g.saveVoyage();
    return true;
  }

  /** Paint the player's ship (and the preview) from the saved livery. */
  apply() {
    const L = liveryFor(this.game.state.livery);
    this.game.boat.setLivery(L);
    this.preview?.boat.setLivery(L);
  }

  /** Earned items that turned up since the last port: say so, once each. */
  claimEarned() {
    const g = this.game, s = g.state;
    for (const p of newlyEarned(s, this.ctx())) {
      s.paints.push(keyOf(p));
      g.ui.toast(`New at the paint yard: ${p.name}`, 'gold');
    }
  }

  // ------------------------------------------------------------ preview
  /**
   * Draw your ship from abeam into `canvas`, wearing `livery` (default: what
   * it wears now). focus: 'ship' (all of her), 'bow' (the bow and its
   * figurehead), 'masthead' (the flag and the pennant) or 'stem' (the
   * figurehead alone, for the tiles). A second, still Boat in a little scene of its own, rendered
   * by the game's renderer into a small target and copied out.
   */
  drawPreview(canvas, livery = this.game.state.livery, focus = 'ship') {
    const g = this.game, r = g.renderer;
    if (!r || !canvas) return;
    const P = this.preview || (this.preview = this.buildPreview());
    P.boat.applyUpgrades({ ...g.state.upgrades }, g.upv);
    P.boat.setLivery(liveryFor(livery));
    P.boat.setAnchor('none');
    P.boat.animate(1 / 60, 0, { angle: 0, strength: 0.7 }, 1, false, g.upv);
    P.boat.group.position.y = 0;
    P.boat.group.rotation.set(0, 0, 0);
    P.scene.updateMatrixWorld();
    // the bigger hulls step back, so the ship fills the picture at every tier
    const k = P.boat.sizeScale, top = P.boat.mastTop.y, cam = P.camera;
    if (focus === 'masthead') { cam.position.set(-9 * k, (top - 0.4) * k, 2.2 * k); cam.lookAt(0, (top - 0.8) * k, 2.0 * k); }
    else if (focus === 'stem') {
      // right on the figurehead, wherever this hull's mount puts it
      const m = P.boat.figureMounts[P.boat.levels.hull]?.mount;
      const at = m ? m.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0.6 * k, 4 * k);
      const f = m ? m.getWorldScale(new THREE.Vector3()).x : k;
      at.y += 0.2 * f;
      cam.position.set(at.x - 1.5 * f, at.y + 0.3 * f, at.z + 1.0 * f); cam.lookAt(at);
    }
    else if (focus === 'bow') { cam.position.set(-4.6 * k, 1.7 * k, 9.6 * k); cam.lookAt(0, 0.9 * k, 3.7 * k); }
    else {
      // abeam, the whole rig in the picture: keel to masthead flag, with a margin
      const lo = -0.6 * k, hi = (top + 1.8) * k, mid = (lo + hi) / 2;
      const d = ((hi - lo) / 2) * 1.08 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.set(-d, mid, 0.6 * k); cam.lookAt(0, mid, 0.6 * k);
    }
    cam.updateMatrixWorld();
    // where the waterline falls, so the page can draw the sea behind her to it
    const w = new THREE.Vector3(0, 0, 0.6 * k).project(cam);
    canvas.parentElement?.style.setProperty('--waterline', `${(((1 - w.y) / 2) * 100).toFixed(1)}%`);
    const prev = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(P.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(P.scene, cam);
    r.readRenderTargetPixels(P.target, 0, 0, PREVIEW_W, PREVIEW_H, P.pixels);
    r.setRenderTarget(prev);
    r.setClearColor(prevColor, prevAlpha);
    // a render target holds linear colour: bring it to sRGB and flip it the right way up
    const img = P.image.data, src = P.pixels, lut = P.lut;
    for (let y = 0; y < PREVIEW_H; y++) {
      const from = (PREVIEW_H - 1 - y) * PREVIEW_W * 4, to = y * PREVIEW_W * 4;
      for (let i = 0; i < PREVIEW_W * 4; i += 4) {
        img[to + i] = lut[src[from + i]]; img[to + i + 1] = lut[src[from + i + 1]]; img[to + i + 2] = lut[src[from + i + 2]];
        img[to + i + 3] = src[from + i + 3];
      }
    }
    canvas.width = PREVIEW_W; canvas.height = PREVIEW_H;
    canvas.getContext('2d').putImageData(P.image, 0, 0);
  }

  /** A small picture of a figurehead on this ship's bow (a data URL), kept per hull tier and paint. */
  figureThumb(id) {
    const L = this.game.state.livery;
    const key = [id, this.game.state.upgrades.hull, L.hull, L.trim, L.deck].join(':');
    this.thumbs ||= {};
    if (this.thumbs[key]) return this.thumbs[key];
    const big = document.createElement('canvas'), small = document.createElement('canvas');
    this.drawPreview(big, { ...this.game.state.livery, figurehead: id }, 'stem');
    small.width = 128; small.height = 80;
    const g = small.getContext('2d');
    g.fillStyle = '#bfe0f2'; g.fillRect(0, 0, 128, 80);
    g.drawImage(big, 0, 0, big.width, big.height, 0, 0, 128, 80);
    return (this.thumbs[key] = small.toDataURL());
  }

  buildPreview() {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x50607a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-6, 10, 5);
    scene.add(sun);
    const boat = new Boat(scene, { npc: true });
    boat.setCharacterVisible(false);
    boat.place(0, 0, 0);
    boat.sailLevel = 2; boat.sailVis = 1;
    boat.relWind = 1.8;
    boat.wake?.mesh && (boat.wake.mesh.visible = false);
    const target = new THREE.WebGLRenderTarget(PREVIEW_W, PREVIEW_H, { samples: 4 });
    const camera = new THREE.PerspectiveCamera(30, PREVIEW_W / PREVIEW_H, 0.5, 200);
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      lut[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
    }
    return { scene, boat, target, camera, lut, pixels: new Uint8Array(PREVIEW_W * PREVIEW_H * 4), image: new ImageData(PREVIEW_W, PREVIEW_H) };
  }
}
