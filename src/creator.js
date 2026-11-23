// Character creator and port wardrobe: a little studio scene with the
// explorer on a turntable, plus the side panel of swatches and styles.
// One Explorer instance is borrowed from the boat while the screen is open.
import * as THREE from 'three';
import { toon, outlineMaterial } from './toon.js';
import { propMesh } from './props.js';
import { clamp, damp, wrapAngle } from './util.js';
import {
  SKIN_TONES, HAIR_COLORS, EYE_COLORS, EYE_SHAPES, CLOTH_COLORS, FIXED_COLOR,
  stylesFor, styleInfo, owns, lockText, normalizeProfile, randomProfile,
} from './cosmetics.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';

const TABS = [
  { id: 'body', label: 'Body' },
  { id: 'hair', label: 'Hair' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'extras', label: 'Accessories' },
];

// Camera framings: `span` is how much of the world (metres, vertically) the
// free part of the screen should show: the whole body, or a face close-up.
const FOV = 30;
const FRAMES = {
  body: { span: 3.0, y: 0.98 },
  face: { span: 1.3, y: 1.6 },
};

export class Creator {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.tab = 'body';
    this.frame = 'body';
    this.yaw = 0.35;
    this.spinVel = 0;
    this.idle = 0;
    this.t = 0;
    this.cam = { dist: 6.4, y: FRAMES.body.y };
    this.buildStudio();
    this.bindUI();
  }

  // ------------------------------------------------------------ studio scene
  buildStudio() {
    const scene = new THREE.Scene();
    // soft dusk-to-sea gradient backdrop
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#f6c88a'); gr.addColorStop(0.45, '#7fb6d9'); gr.addColorStop(1, '#1b3a66');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const bg = new THREE.CanvasTexture(c);
    bg.colorSpace = THREE.SRGBColorSpace;
    scene.background = bg;

    scene.add(new THREE.HemisphereLight(0xdcefff, 0x47607a, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
    key.position.set(2.5, 5, 4);
    scene.add(key);

    // round plank platform with a rope rim
    const deck = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.32, 0.22, 40), toon('#b9834c'));
    top.position.y = -0.11;
    const ink = outlineMaterial(0.03, 0x1a1420);
    deck.add(top, new THREE.Mesh(top.geometry, ink).translateY(-0.11));
    const rope = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.05, 6, 40), toon('#e2c38a'));
    rope.rotation.x = Math.PI / 2; rope.position.y = -0.02;
    deck.add(rope);
    for (let i = 0; i < 6; i++) { // plank seams
      const seam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.005, 0.02), toon('#8a5a30'));
      seam.position.set(0, 0.002, -1 + i * 0.4);
      seam.scale.x = Math.sqrt(Math.max(0.05, 1 - ((-1 + i * 0.4) / 1.25) ** 2));
      deck.add(seam);
    }
    scene.add(deck);
    // a few props for a dockside feel
    const barrel = propMesh('barrel'); barrel.position.set(-2.1, -0.2, -2.6); barrel.scale.setScalar(0.32);
    const crate = propMesh('crate'); crate.position.set(1.9, -0.2, -2.8); crate.rotation.y = 0.5; crate.scale.setScalar(0.3);
    const chest = propMesh('chest'); chest.position.set(2.5, -0.2, -1.6); chest.rotation.y = -0.9; chest.scale.setScalar(0.24);
    scene.add(barrel, crate, chest);

    this.pivot = new THREE.Group(); // the turntable holds the explorer
    scene.add(this.pivot);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);
    this.view = { scene, camera: this.camera };
  }

  // ---------------------------------------------------------------- open/close
  /**
   * mode 'new': fresh voyage (all body options, starter clothing).
   * mode 'wardrobe': at a port tailor; owned items plus tailor stock to buy.
   * Resolves with the chosen profile, or null if cancelled.
   */
  open(mode = 'new', profile = null) {
    const g = this.game;
    this.mode = mode;
    this.profile = normalizeProfile(profile || g.state.profile);
    this.original = clone(this.profile);
    this.tab = 'body';
    this.frame = 'body';
    this.yaw = 0.35; this.spinVel = 0; this.idle = 0;
    const ex = g.boat.explorer;
    this.savedParent = ex.root.parent;
    this.pivot.add(ex.root);
    ex.root.position.set(0, 0, 0);
    ex.root.rotation.set(0, 0, 0);
    ex.setPose('preview');
    ex.root.visible = true;
    ex.setAppearance?.(this.profile);
    g.setView(this.view);
    g.input.setScheme('menu');
    this.active = true;

    const el = $('creatorScreen');
    document.body.classList.add('creator-open');
    el.classList.toggle('wardrobe', mode === 'wardrobe');
    $('creatorTitle').textContent = mode === 'new' ? 'Create your captain' : 'Tailor';
    $('creatorEyebrow').textContent = mode === 'new' ? 'A new voyage' : (g.dockedIsland?.name || 'Harbor');
    $('creatorDone').textContent = mode === 'new' ? 'Set sail!' : 'Done';
    $('creatorName').value = this.profile.name;
    el.classList.remove('hidden');
    $('creatorMsg')?.classList.add('hidden');
    this.renderTabs();
    this.renderPanel();
    this.updateGold();
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  close(result) {
    if (!this.active) return;
    const g = this.game, ex = g.boat.explorer;
    this.active = false;
    $('creatorScreen').classList.add('hidden');
    document.body.classList.remove('creator-open');
    this.camera.clearViewOffset();
    (this.savedParent || g.boat.group).add(ex.root);
    ex.setPose('helm');
    g.boat.applyUpgrades(g.state.upgrades, g.upv); // puts the explorer back at the helm
    // cancelled: put back what they had on
    if (!result) ex.setAppearance?.(this.original);
    g.setView(null);
    g.input.setScheme('sea');
    const r = this.resolve; this.resolve = null;
    r?.(result);
  }

  // ----------------------------------------------------------------- changes
  set(path, value) {
    const [a, b] = path.split('.');
    if (b) this.profile[a][b] = value; else this.profile[a] = value;
    this.profile = normalizeProfile(this.profile);
    this.game.boat.explorer.setAppearance?.(this.profile);
    // jump to the face when changing facial features, back to the body for clothes
    const faceish = a === 'eyes' || a === 'face' || a === 'hair' || a === 'hat';
    this.frame = faceish ? 'face' : 'body';
    this.renderPanel();
    this.syncFrameButtons();
  }

  async tryStyle(slot, style) {
    const s = styleInfo(slot, style);
    if (!s) return;
    const g = this.game;
    if (owns(g.state.wardrobe, slot, style)) { this.set(`${slot}.style`, style); return; }
    if (s.source === 'tailor' && this.mode === 'wardrobe') {
      if (g.state.banked < s.price) { this.say(`${s.name} costs ${s.price} gold. You have ${Math.floor(g.state.banked)}.`); return; }
      const ok = await g.ui.confirmBox(`Buy the ${s.name} for ${s.price} gold?`, 'Buy');
      if (ok && g.buyCosmetic(s.id)) { this.set(`${slot}.style`, style); this.updateGold(); }
      return;
    }
    this.say(`${s.name}: ${lockText(s)}`);
  }

  /** A short message under the tabs (the HUD's toasts are hidden behind the creator). */
  say(text) {
    const el = $('creatorMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._sayT);
    this._sayT = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  randomize() {
    this.profile = randomProfile(this.game.state.wardrobe, this.profile.name);
    this.game.boat.explorer.setAppearance?.(this.profile);
    this.frame = 'body';
    this.spinVel = 6; // a little twirl
    this.renderPanel();
    this.syncFrameButtons();
  }

  // ---------------------------------------------------------------------- UI
  bindUI() {
    const click = (id, fn) => $(id)?.addEventListener('click', (e) => { this.game.ui.click(); e.currentTarget.blur(); fn(e); });
    click('creatorDone', () => {
      this.profile.name = this.cleanName();
      this.close(normalizeProfile(this.profile));
    });
    click('creatorCancel', () => this.close(null));
    click('creatorRandom', () => this.randomize());
    click('creatorFaceBtn', () => { this.frame = this.frame === 'face' ? 'body' : 'face'; this.syncFrameButtons(); });
    $('creatorName')?.addEventListener('input', () => { this.profile.name = this.cleanName(); });
    $('creatorTabs')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      this.game.ui.click();
      this.tab = b.dataset.tab;
      this.frame = this.tab === 'body' || this.tab === 'hair' ? 'face' : 'body';
      this.renderTabs(); this.renderPanel(); this.syncFrameButtons();
      $('creatorBody').scrollTop = 0;
    });
    $('creatorBody')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-set], button[data-style], button[data-toggle]');
      if (!b) return;
      this.game.ui.click();
      if (b.dataset.style) { const [slot, style] = b.dataset.style.split(':'); this.tryStyle(slot, style); }
      else if (b.dataset.toggle) { const [a, k] = b.dataset.toggle.split('.'); this.set(b.dataset.toggle, !this.profile[a][k]); }
      else this.set(b.dataset.set, b.dataset.val);
    });
    // keep wheel/drags on the panel from turning the model
    for (const id of ['creatorPanel']) $(id)?.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  cleanName() {
    const v = ($('creatorName')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 18);
    return v || 'Captain';
  }

  updateGold() {
    const el = $('creatorGold');
    if (el) el.textContent = Math.floor(this.game.state.banked || 0).toLocaleString();
  }

  syncFrameButtons() {
    $('creatorFaceBtn')?.classList.toggle('on', this.frame === 'face');
  }

  renderTabs() {
    $('creatorTabs').innerHTML = TABS.map((t) =>
      `<button class="tab${t.id === this.tab ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
  }

  swatches(path, palette, current, kind = 'cloth') {
    return `<div class="swatches">${palette.map((c) => {
      const bg = kind === 'eyes'
        ? `radial-gradient(circle at 50% 60%, ${c.light} 0 25%, ${c.base} 45%, ${c.dark} 75%)`
        : kind === 'hair' ? `linear-gradient(135deg, ${c.dark}, ${c.base} 60%)`
          : `linear-gradient(180deg, ${c.base} 0 62%, ${c.dark} 62%)`;
      return `<button class="swatch${c.id === current ? ' on' : ''}" data-set="${path}" data-val="${c.id}" title="${esc(c.name)}" aria-label="${esc(c.name)}" style="background:${bg}"></button>`;
    }).join('')}</div>`;
  }

  chips(slot, current) {
    const g = this.game;
    return `<div class="chips">${stylesFor(slot).map((s) => {
      const have = owns(g.state.wardrobe, slot, s.style);
      // hide undiscovered quest/story/found items in a fresh voyage to keep the list tidy
      if (!have && this.mode === 'new' && s.source !== 'tailor') return '';
      const lock = have ? '' : `<span class="lock">${LOCK}</span>`;
      const price = !have && s.source === 'tailor' ? `<span class="price">${s.price}</span>` : '';
      const title = have ? s.name : `${s.name}: ${lockText(s)}`;
      return `<button class="chip${s.style === current ? ' on' : ''}${have ? '' : ' locked'}" data-style="${s.id}" title="${esc(title)}">${lock}${esc(s.name)}${price}</button>`;
    }).join('')}</div>`;
  }

  section(title, body) { return `<div class="cSection"><h4>${title}</h4>${body}</div>`; }

  renderPanel() {
    const p = this.profile;
    let html = '';
    if (this.tab === 'body') {
      html += this.section('Skin', this.swatches('skin', SKIN_TONES, p.skin, 'skin'));
      html += this.section('Eye colour', this.swatches('eyes.color', EYE_COLORS, p.eyes.color, 'eyes'));
      html += this.section('Eye shape', `<div class="chips">${EYE_SHAPES.map((e) =>
        `<button class="chip${e.id === p.eyes.shape ? ' on' : ''}" data-set="eyes.shape" data-val="${e.id}">${e.name}</button>`).join('')}</div>`);
      html += this.section('Face', `<div class="chips">
        <button class="chip toggle${p.face.blush ? ' on' : ''}" data-toggle="face.blush">Rosy cheeks</button>
        <button class="chip toggle${p.face.freckles ? ' on' : ''}" data-toggle="face.freckles">Freckles</button></div>`);
    } else if (this.tab === 'hair') {
      html += this.section('Style', this.chips('hair', p.hair.style));
      html += this.section('Colour', this.swatches('hair.color', HAIR_COLORS, p.hair.color, 'hair'));
    } else if (this.tab === 'outfit') {
      html += this.section('Top', this.chips('top', p.top.style) + this.swatches('top.color', CLOTH_COLORS, p.top.color));
      html += this.section('Shirt &amp; trim', this.swatches('top.shirt', CLOTH_COLORS, p.top.shirt));
      html += this.section('Bottoms', this.chips('bottom', p.bottom.style) + this.swatches('bottom.color', CLOTH_COLORS, p.bottom.color));
      html += this.section('Boots', this.chips('boots', p.boots.style) + this.swatches('boots.color', CLOTH_COLORS, p.boots.color));
    } else {
      for (const [slot, title] of [['hat', 'Hat'], ['neck', 'Neck'], ['extra', 'Bag']]) {
        const st = p[slot].style;
        const fixed = FIXED_COLOR.has(`${slot}:${st}`);
        html += this.section(title, this.chips(slot, st) + (fixed ? '' : this.swatches(`${slot}.color`, CLOTH_COLORS, p[slot].color)));
      }
    }
    if (this.mode === 'new') html += '<p class="cHint">More hats, coats and boots are sold at port tailors, and rarer ones are hidden on the islands.</p>';
    $('creatorBody').innerHTML = html;
  }

  // ------------------------------------------------------------------ update
  update(dt, look) {
    this.t += dt;
    const ex = this.game.boat.explorer;
    // drag spins the turntable with a little inertia; idle drifts slowly
    if (look.dx) {
      const d = look.dx * 0.012;
      this.yaw += d;
      this.spinVel = clamp(d / Math.max(dt, 1e-3), -8, 8);
      this.idle = 0;
    } else {
      this.idle += dt;
      this.yaw += this.spinVel * dt;
      this.spinVel = damp(this.spinVel, this.idle > 4 ? 0.25 : 0, 3, dt);
    }
    if (look.zoom) { this.frame = look.zoom < 0 ? 'face' : 'body'; this.syncFrameButtons(); }
    this.pivot.rotation.y = this.yaw;

    // look at the camera while facing it, otherwise glance about
    const toCam = wrapAngle(-this.yaw);
    ex.update(dt, this.t, { footSpeed: 0, grounded: true, lookRel: Math.abs(toCam) < 1.25 ? toCam : null, lookPitch: this.frame === 'face' ? 0.05 : -0.1, windStrength: 0.25, windRel: Math.PI });

    // keep the character clear of the panel: left of it on wide screens,
    // above it on tall ones, and sized to fit the space that's left
    const W = window.innerWidth, H = window.innerHeight;
    const panel = $('creatorPanel')?.getBoundingClientRect();
    let ox = 0, oy = 0, freeW = W, freeH = H;
    if (panel && panel.width) {
      if (W > H && panel.left > W * 0.3) { ox = (W - panel.left) / 2; freeW = panel.left; }
      else if (panel.top > H * 0.2) { oy = (H - panel.top) / 2; freeH = panel.top; }
    }
    // camera: ease between body and face framing
    const F = FRAMES[this.frame];
    const tanH = Math.tan((FOV * Math.PI) / 360);
    // fit the span into the free height (the character is narrow, so height is what binds)
    const want = (F.span / (2 * tanH)) * (H / freeH);
    this.cam.dist = damp(this.cam.dist, want, 6, dt);
    this.cam.y = damp(this.cam.y, F.y, 6, dt);
    const cam = this.camera;
    cam.position.set(0, this.cam.y + 0.15 + this.cam.dist * 0.08, this.cam.dist);
    cam.lookAt(0, this.cam.y, 0);
    cam.aspect = W / H;
    if (ox || oy) cam.setViewOffset(W, H, ox, oy, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
}
