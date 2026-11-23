// DOM user interface: HUD, minimap, sea chart, port, pause, wreck and title
// screens. Reads game state; calls game methods for actions.
import { UPGRADES, MAP_RES, MAP_CELL, WORLD_HALF } from './config.js';
import { STYLES, owns } from './cosmetics.js';
import { MAX_ACTIVE, fmtDist } from './quests.js';
import { bearingDeg } from './util.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.floor(n || 0).toLocaleString();

const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const ICONS = {
  coin: S('<circle cx="12" cy="12" r="10" fill="#ffd54a" stroke="#0b1830" stroke-width="2"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#c98a00" stroke-width="2"/><path d="M9 7.5a6 6 0 0 1 4-1.3" stroke="#fff6c8" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  chest: S('<path d="M3 11h18v9H3z" fill="#a8693a" stroke="#0b1830" stroke-width="2" stroke-linejoin="round"/><path d="M3 11a9 5 0 0 1 18 0z" fill="#c07d44" stroke="#0b1830" stroke-width="2" stroke-linejoin="round"/><path d="M3 13h18" stroke="#ffd54a" stroke-width="2"/><rect x="10" y="11.5" width="4" height="4.5" rx="1" fill="#ffd54a" stroke="#0b1830" stroke-width="1.5"/>'),
  hull: S('<path d="M2 13h20l-3 6H5z" fill="#c8915a" stroke="#0b1830" stroke-width="2" stroke-linejoin="round"/><path d="M12 13V3l7 8h-7" fill="#fff8e7" stroke="#0b1830" stroke-width="1.8" stroke-linejoin="round"/>'),
  sail: S(`<path d="M10 3v15" ${STROKE}/><path d="M11 4c5 3 7 8 7 12h-7z" fill="currentColor" opacity=".9"/><path d="M4 18h16l-2 3H6z" fill="currentColor"/>`),
  rudder: S(`<circle cx="12" cy="12" r="7" ${STROKE}/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5" ${STROKE}/>`),
  keel: S(`<path d="M2 7h20l-3 5H5z" fill="currentColor"/><path d="M10 12h4l-1 9h-2z" fill="currentColor"/><path d="M8 20h8" ${STROKE}/>`),
  lantern: S(`<path d="M9 3h6M12 3v2" ${STROKE}/><path d="M7 7h10l-1 12H8z" ${STROKE}/><path d="M12 10c1.6 2 1.6 4 0 5.5-1.6-1.5-1.6-3.5 0-5.5z" fill="currentColor"/><path d="M6 21h12" ${STROKE}/>`),
  spyglass: S(`<path d="M3 15l5-2 1.5 3.5-5 2z" fill="currentColor"/><path d="M9 12.5l6-2.6 1.6 3.6-6 2.6z" fill="currentColor" opacity=".85"/><path d="M15.5 9.5l5-2.1 1.6 3.6-5 2.1z" fill="currentColor" opacity=".7"/><path d="M11 17l-2 5M13 16l2 5" ${STROKE}/>`),
  anchor: S(`<circle cx="12" cy="5" r="2.2" ${STROKE}/><path d="M12 7.2V21M8 11h8M4 14c0 4 3.5 7 8 7s8-3 8-7" ${STROKE}/><path d="M2.5 15.5L4 13l2 2.2M21.5 15.5L20 13l-2 2.2" ${STROKE}/>`),
  map: S(`<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" ${STROKE}/><path d="M9 4v14M15 6v14" ${STROKE}/><path d="M11.5 10.5l2 2m0-2l-2 2" stroke="#ff6b5b" stroke-width="2" stroke-linecap="round"/>`),
  pause: S('<rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/>'),
  sun: S('<circle cx="12" cy="12" r="5" fill="#ffd54a" stroke="#0b1830" stroke-width="1.6"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="#ffd54a" stroke-width="2.2" stroke-linecap="round"/>'),
  moon: S('<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z" fill="#e8ecff" stroke="#0b1830" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="14" r="1.2" fill="#b8c2e8"/><circle cx="13" cy="9" r=".9" fill="#b8c2e8"/>'),
  star: S('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="#ffd54a" stroke="#0b1830" stroke-width="1.5" stroke-linejoin="round"/>'),
  close: S(`<path d="M6 6l12 12M18 6L6 18" ${STROKE} stroke-width="2.8"/>`),
  plus: S(`<path d="M12 5v14M5 12h14" ${STROKE} stroke-width="2.8"/>`),
  minus: S(`<path d="M5 12h14" ${STROKE} stroke-width="2.8"/>`),
  target: S(`<circle cx="12" cy="12" r="7" ${STROKE}/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" ${STROKE}/>`),
  check: S(`<path d="M4 12.5l5 5L20 6.5" ${STROKE} stroke-width="3"/>`),
  chevUp: S(`<path d="M5 15l7-7 7 7" ${STROKE} stroke-width="3.2"/>`),
  chevDown: S(`<path d="M5 9l7 7 7-7" ${STROKE} stroke-width="3.2"/>`),
  chevLeft: S(`<path d="M15 5l-7 7 7 7" ${STROKE} stroke-width="3"/>`),
  chevRight: S(`<path d="M9 5l7 7-7 7" ${STROKE} stroke-width="3"/>`),
  needle: S(`<path d="M19.5 3.5L6 17" ${STROKE} stroke-width="2.6"/><ellipse cx="18" cy="5" rx="1.1" ry="2.2" transform="rotate(45 18 5)" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 17c-2 1-3.5 2.5-3 4 1.5.5 3-1 4-3" ${STROKE}/><path d="M17 6c-4 0-9 3-11 8" fill="none" stroke="#ff6b5b" stroke-width="1.8" stroke-linecap="round"/>`),
  face: S(`<circle cx="12" cy="12" r="9" ${STROKE}/><circle cx="9" cy="11" r="1.4" fill="currentColor"/><circle cx="15" cy="11" r="1.4" fill="currentColor"/><path d="M8.5 15c2 2 5 2 7 0" ${STROKE}/>`),
  scroll: S(`<path d="M6 4h11a3 3 0 0 1 0 6h-1v8a3 3 0 0 1-3 3H6a3 3 0 0 1 0-6h1V7a3 3 0 0 1 3-3" ${STROKE}/><path d="M10 9h4M10 13h4" ${STROKE}/>`),
  dice: S(`<rect x="3.5" y="3.5" width="17" height="17" rx="4" ${STROKE}/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/>`),
};

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PX_PER_DEG = 2.6;
const MINI_RANGE = 900;

export class UI {
  constructor(game) {
    this.game = game;
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon] || ''; });
    const ids = ['hud', 'goldBanked', 'goldCargo', 'rowCargo', 'hullBar', 'hullText', 'toasts', 'compass', 'compassStrip',
      'compassDeg', 'warning', 'minimap', 'clockIcon', 'clockText', 'weatherText', 'windArrow', 'windDial', 'windLabel',
      'sailGauge', 'speedText', 'prompt', 'banner', 'bannerSub', 'bannerTitle', 'btnAction', 'btnActionLabel', 'btnSpy',
      'vignette', 'damageFlash', 'fade', 'loading', 'loadingText', 'title', 'btnContinue', 'btnNew', 'titleHint',
      'portScreen', 'portName', 'portGold', 'portHull', 'btnRepair', 'upgradeGrid', 'btnSetSail', 'mapScreen', 'mapCanvas',
      'mapStats', 'pauseScreen', 'setSound', 'setMusic', 'setQuality', 'controlsHelp', 'wreckScreen', 'wreckText',
      'btnRespawn', 'confirm', 'confirmText', 'confirmYes', 'confirmNo', 'portTabs', 'paneShipwright', 'paneTailor',
      'tailorGrid', 'btnWardrobe', 'creatorScreen', 'questTracker', 'qtTitle', 'qtArrow', 'qtLabel', 'qtDist', 'compassQuest',
      'btnJournal', 'paneQuests', 'questCount', 'questOffers', 'questBadge', 'journalScreen', 'journalBody', 'journalClose'];
    this.el = {};
    for (const id of ids) this.el[id] = $(id);
    this.notches = [...document.querySelectorAll('#sailGauge .notches span')];

    this.last = { banked: null, cargo: null, prompt: undefined, warning: undefined, clock: '', clockIcon: '',
      sail: -1, speed: '', hull: -1, windLabel: '', windColor: '', spy: null, low: null, bearing: null };
    this.timers = { clock: 0, mini: 0 };
    this.bannerQueue = [];
    this.bannerBusy = false;
    this.map = { open: false, zoom: 0.1, cx: 0, cz: 0, pointers: new Map(), pinch: 0, dirty: true, fogT: 0, lastDraw: 0 };

    this.buildCompass();
    this.bindButtons();
    this.setupMinimap();
    this.setupMap();
    this.buildControlsHelp();

    window.addEventListener('resize', () => {
      this.compassW = this.el.compass ? this.el.compass.clientWidth : 300;
      this.resizeMinimap();
      if (this.map.open) this.resizeMap();
    });
    // Keep UI interactions from leaking to the 3D view
    for (const id of ['portScreen', 'pauseScreen', 'wreckScreen', 'confirm', 'title', 'creatorScreen', 'journalScreen']) {
      const e = this.el[id];
      if (e) e.addEventListener('wheel', (ev) => ev.stopPropagation(), { passive: true });
    }
  }

  // ------------------------------------------------------------ helpers
  click() {
    const a = this.game.audio;
    if (a) { a.unlock?.(); a.play?.('click'); }
  }

  on(id, fn) {
    const el = typeof id === 'string' ? $(id) : id;
    if (!el) return;
    el.addEventListener('click', (e) => {
      this.click();
      e.currentTarget.blur();
      fn(e);
    });
  }

  get touch() { return document.body.classList.contains('touch'); }

  confirmBox(text, yes = 'Yes') {
    return new Promise((resolve) => {
      const c = this.el.confirm;
      if (!c) { resolve(window.confirm(text)); return; }
      this.el.confirmText.textContent = text;
      this.el.confirmYes.textContent = yes;
      c.classList.remove('hidden');
      const done = (v) => {
        c.classList.add('hidden');
        this.el.confirmYes.onclick = null; this.el.confirmNo.onclick = null;
        this.click();
        resolve(v);
      };
      this.el.confirmYes.onclick = () => done(true);
      this.el.confirmNo.onclick = () => done(false);
    });
  }

  bindButtons() {
    const g = this.game;
    this.on('btnMap', () => g.toggleMap?.());
    this.on('btnPause', () => g.setPaused?.(true));
    this.on('btnContinue', () => g.continueGame?.());
    this.on('btnNew', async () => {
      if (g.hasSave?.()) {
        const ok = await this.confirmBox('Start a new voyage? Your current save will be lost.', 'Start fresh');
        if (!ok) return;
      }
      g.newVoyage?.();
    });
    this.on('btnSetSail', () => g.setSail?.());
    this.on('btnRepair', () => { g.repair?.(); this.refreshPort(); });
    this.on('btnResume', () => g.setPaused?.(false));
    this.on('setSound', () => { g.setSetting?.('sound', !g.settings?.sound); this.refreshSettings(); });
    this.on('setMusic', () => { g.setSetting?.('music', !g.settings?.music); this.refreshSettings(); });
    this.on('setQuality', () => { g.setSetting?.('quality', g.settings?.quality === 'low' ? 'high' : 'low'); this.refreshSettings(); });
    this.on('btnReset', async () => {
      const ok = await this.confirmBox('Erase your save and start a new voyage? This cannot be undone.', 'Erase & restart');
      if (ok) g.resetSave?.();
    });
    this.on('btnRespawn', () => g.respawn?.());
    this.on('mapClose', () => g.toggleMap ? g.toggleMap() : this.closeMap());
    this.on('mapZoomIn', () => this.zoomMapAt(1.5));
    this.on('mapZoomOut', () => this.zoomMapAt(1 / 1.5));
    this.on('mapCenter', () => {
      const b = g.boat;
      if (b) { this.map.cx = b.pos.x; this.map.cz = b.pos.z; this.map.zoom = Math.max(this.map.zoom, this.mapFitZoom() * 4); this.map.dirty = true; }
    });
    // Port tabs
    this.portTab = 'shipwright';
    this.el.portTabs?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      this.click();
      this.setPortTab(b.dataset.tab);
    });
    this.on('btnWardrobe', () => g.openWardrobe?.());
    // Quests: board, tracker, journal
    this.el.questOffers?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-accept]');
      if (!b || b.disabled) return;
      this.click();
      g.quests?.accept(b.dataset.accept, this.portIsland);
      this.refreshPort();
    });
    this.on('btnJournal', () => this.toggleJournal());
    this.on('questTracker', () => this.openJournal());
    this.on('journalClose', () => this.closeJournal());
    this.el.journalBody?.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-pin], button[data-abandon]');
      if (!b) return;
      this.click();
      if (b.dataset.pin) { g.quests?.pin(b.dataset.pin); this.renderJournal(); return; }
      const q = g.quests?.active.find((x) => x.id === b.dataset.abandon);
      if (!q) return;
      const ok = await this.confirmBox(`Abandon "${q.title}"?${q.type === 'deliver' ? ' The parcel stays with you; nobody will pay for it.' : ''}`, 'Abandon');
      if (ok) { g.quests.abandon(q.id); this.renderJournal(); }
    });
    this.el.tailorGrid?.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-buy]');
      if (!b || b.disabled) return;
      this.click();
      g.buyCosmetic?.(b.dataset.buy);
      this.refreshPort();
    });
    // Upgrade buy buttons (delegated)
    if (this.el.upgradeGrid) {
      this.el.upgradeGrid.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-key]');
        if (!b || b.disabled) return;
        this.click();
        const ok = g.buyUpgrade?.(b.dataset.key);
        if (!ok) this.toast('Not enough gold', 'warn');
        this.refreshPort();
      });
    }
  }

  buildControlsHelp() {
    const el = this.el.controlsHelp;
    if (!el) return;
    const rows = [
      ['<kbd>W</kbd><kbd>S</kbd> / <kbd>&uarr;</kbd><kbd>&darr;</kbd>', 'Raise / lower sail', 'Sail buttons ▲ ▼'],
      ['<kbd>A</kbd><kbd>D</kbd> / <kbd>&larr;</kbd><kbd>&rarr;</kbd>', 'Steer', 'Drag the tiller'],
      ['<kbd>E</kbd> / <kbd>Space</kbd>', 'Dock, haul treasure', 'Gold action button'],
      ['Drag &middot; Wheel', 'Look around &middot; Zoom', 'Drag &middot; Pinch'],
      ['Hold <kbd>Z</kbd> / <kbd>Shift</kbd>', 'Spyglass (once upgraded)', 'Spyglass button'],
      ['<kbd>M</kbd>', 'Sea chart', 'Map button'],
      ['<kbd>J</kbd>', 'Journal &amp; quests', 'Journal button'],
      ['<kbd>Esc</kbd>', 'Pause', 'Pause button'],
    ];
    el.innerHTML = rows.map(([k, what, t]) =>
      `<div class="k">${this.touch ? t : k}</div><div>${what}</div>`).join('');
    if (this.el.titleHint) {
      this.el.titleHint.innerHTML = this.touch
        ? 'Drag the tiller to steer &middot; ▲▼ raise and lower the sail &middot; drag to look, pinch to zoom'
        : '<kbd>W</kbd><kbd>S</kbd> sail &nbsp; <kbd>A</kbd><kbd>D</kbd> steer &nbsp; <kbd>E</kbd> interact &nbsp; <kbd>M</kbd> chart &nbsp; drag to look';
    }
  }

  // ------------------------------------------------------------ loading / fade
  setLoading(text) {
    const l = this.el.loading;
    if (!l) return;
    l.classList.remove('hidden', 'out');
    if (this.el.loadingText) this.el.loadingText.textContent = text;
  }
  hideLoading() {
    const l = this.el.loading;
    if (!l) return;
    l.classList.add('out');
    setTimeout(() => l.classList.add('hidden'), 650);
  }
  fade(to, seconds = 0.6) {
    const f = this.el.fade;
    return new Promise((resolve) => {
      if (!f) { resolve(); return; }
      f.style.transition = `opacity ${seconds}s ease`;
      f.style.pointerEvents = to > 0.01 ? 'auto' : 'none';
      void f.offsetWidth;
      f.style.opacity = String(to);
      setTimeout(resolve, seconds * 1000 + 20);
    });
  }

  // ------------------------------------------------------------ title
  showTitle(hasSave) {
    this.el.title?.classList.remove('hidden');
    this.el.btnContinue?.classList.toggle('hidden', !hasSave);
    this.el.hud?.classList.add('hidden');
    this.buildControlsHelp();
  }
  hideTitle() { this.el.title?.classList.add('hidden'); }

  // ------------------------------------------------------------ HUD
  buildCompass() {
    const strip = this.el.compassStrip;
    if (!strip) return;
    let html = '';
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const x = (d + 360) * PX_PER_DEG;
      if (n % 45 === 0) {
        const lab = POINTS[n / 45];
        html += `<div class="ctick major${lab === 'N' ? ' north' : ''}${lab.length > 1 ? ' minor' : ''}" style="left:${x}px"><span>${lab}</span></div>`;
      } else {
        html += `<div class="ctick" style="left:${x}px"></div>`;
      }
    }
    strip.innerHTML = html;
    this.compassW = this.el.compass ? this.el.compass.clientWidth : 300;
  }

  update(dt) {
    const g = this.game;
    const st = g.state;
    const mode = g.mode;
    const hud = this.el.hud;
    if (hud) hud.classList.toggle('hidden', mode === 'title' || !st);
    if (!st || mode === 'title') return;
    const b = g.boat;

    // gold
    if (st.banked !== this.last.banked) {
      if (this.last.banked != null && st.banked > this.last.banked) this.bump(this.el.goldBanked);
      this.el.goldBanked.textContent = fmt(st.banked);
      this.last.banked = st.banked;
    }
    if (st.cargo !== this.last.cargo) {
      if (this.last.cargo != null && st.cargo > this.last.cargo) this.bump(this.el.goldCargo);
      this.el.goldCargo.textContent = fmt(st.cargo);
      this.el.rowCargo?.classList.toggle('empty', !st.cargo);
      this.last.cargo = st.cargo;
    }

    // hull
    const maxH = (b && b.maxHealth) || 100;
    const ratio = clampN((st.health || 0) / maxH, 0, 1);
    // key on the actual numbers so a hull upgrade (same %, bigger max) still refreshes
    const hullKey = `${Math.ceil(st.health || 0)}/${maxH}`;
    if (hullKey !== this.last.hull) {
      this.last.hull = hullKey;
      const bar = this.el.hullBar;
      bar.style.width = `${ratio * 100}%`;
      bar.style.backgroundColor = ratio > 0.6 ? '#7be07b' : ratio > 0.3 ? '#ffd54a' : '#ff6b5b';
      bar.classList.toggle('critical', ratio < 0.3);
      this.el.hullText.textContent = `${Math.ceil(st.health || 0)}/${maxH}`;
    }
    const low = ratio < 0.3 && (mode === 'sailing' || mode === 'wrecking');
    if (low !== this.last.low) { this.el.vignette?.classList.toggle('low', low); this.last.low = low; }

    if (b) {
      // compass
      const bearing = bearingDeg(b.heading);
      if (this.last.bearing == null || Math.abs(bearing - this.last.bearing) > 0.05) {
        this.last.bearing = bearing;
        const w = this.compassW || 300;
        this.el.compassStrip.style.transform = `translateX(${w / 2 - (bearing + 360) * PX_PER_DEG}px)`;
        this.el.compassDeg.textContent = `${Math.round(bearing) % 360}° ${POINTS[Math.round(bearing / 45) % 8]}`;
      }
      // wind dial
      const wthr = g.weather;
      if (wthr) {
        const wb = bearingDeg(wthr.windAngle || 0);
        let rel = wb - bearing;
        rel = ((rel % 360) + 540) % 360 - 180;
        this.el.windArrow.setAttribute('transform', `rotate(${rel.toFixed(1)})`);
        const pos = 180 - Math.abs(rel); // angle off the wind source
        const label = pos < 35 ? 'In irons' : pos < 65 ? 'Close-hauled' : pos < 115 ? 'Beam reach' : pos < 155 ? 'Broad reach' : 'Running';
        if (label !== this.last.windLabel) { this.el.windLabel.textContent = label; this.last.windLabel = label; }
        const eff = g.sailEfficiency ?? 1;
        const col = eff > 0.75 ? '#7be07b' : eff > 0.4 ? '#ffd54a' : '#ff6b5b';
        if (col !== this.last.windColor) { this.el.windDial.style.color = col; this.last.windColor = col; }
      }
      // sail gauge
      const sl = b.sailLevel | 0;
      if (sl !== this.last.sail) {
        this.notches.forEach((n, i) => n.classList.toggle('on', i === sl));
        this.last.sail = sl;
      }
      const kn = `${Math.round(Math.abs(b.speed || 0) * 1.2)} kn`;
      if (kn !== this.last.speed) { this.el.speedText.textContent = kn; this.last.speed = kn; }
    }

    // clock & weather (twice a second)
    this.timers.clock -= dt;
    if (this.timers.clock <= 0) {
      this.timers.clock = 0.5;
      const dayT = st.dayT ?? 0.5;
      const isDay = dayT > 0.23 && dayT < 0.77;
      const icon = isDay ? 'sun' : 'moon';
      if (icon !== this.last.clockIcon) { this.el.clockIcon.innerHTML = ICONS[icon]; this.last.clockIcon = icon; }
      const hr = Math.floor(dayT * 24) % 24;
      const h12 = hr % 12 === 0 ? 12 : hr % 12;
      const txt = `Day ${st.day || 1} · ${h12} ${hr < 12 ? 'AM' : 'PM'}`;
      if (txt !== this.last.clock) { this.el.clockText.textContent = txt; this.last.clock = txt; }
      const wl = g.weather?.label || '';
      if (this.el.weatherText.textContent !== wl) this.el.weatherText.textContent = wl;
      const spyOn = (st.upgrades?.spyglass || 0) > 0;
      if (spyOn !== this.last.spy) { this.el.btnSpy?.classList.toggle('hidden', !spyOn); this.last.spy = spyOn; }
    }

    this.updateQuestTracker();

    // minimap
    this.timers.mini -= dt;
    if (this.timers.mini <= 0) { this.timers.mini = 0.1; this.drawMinimap(); }
  }

  bump(el) {
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setSpyglass(on, zoomLabel = '') {
    document.body.classList.toggle('spy', !!on);
    const z = document.getElementById('spyZoom');
    if (z) z.textContent = zoomLabel;
  }

  setSpyBearing(deg) {
    const el = document.getElementById('spyBearing');
    const t = `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
    if (el && el.textContent !== t) el.textContent = t;
  }

  setPrompt(text) {
    const t = text || null;
    if (t === this.last.prompt) return;
    this.last.prompt = t;
    const p = this.el.prompt, btn = this.el.btnAction;
    if (!t) {
      p?.classList.add('hidden');
      btn?.classList.add('hidden');
      return;
    }
    if (p) { p.innerHTML = `<kbd>E</kbd>${esc(t)}`; p.classList.remove('hidden'); }
    if (btn) { this.el.btnActionLabel.textContent = t; btn.classList.remove('hidden'); }
  }

  banner(title, sub = '') {
    this.bannerQueue.push({ title, sub });
    if (!this.bannerBusy) this.nextBanner();
  }
  nextBanner() {
    const item = this.bannerQueue.shift();
    const el = this.el.banner;
    if (!item || !el) { this.bannerBusy = false; return; }
    this.bannerBusy = true;
    this.el.bannerTitle.textContent = item.title;
    this.el.bannerSub.textContent = item.sub;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => this.nextBanner(), 600);
    }, 3500);
  }

  toast(text, kind = 'info') {
    const box = this.el.toasts;
    if (!box) return;
    const max = window.innerHeight < 460 ? 3 : 5;
    while (box.children.length >= max) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    box.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 3000);
  }

  warning(text) {
    const t = text || null;
    if (t === this.last.warning) return;
    this.last.warning = t;
    const w = this.el.warning;
    if (!w) return;
    w.textContent = t || '';
    w.classList.toggle('show', !!t);
  }

  flashDamage(amount = 10) {
    const f = this.el.damageFlash;
    if (!f) return;
    f.style.transition = 'none';
    f.style.opacity = String(clampN(0.25 + amount / 30, 0.25, 0.9));
    void f.offsetWidth;
    f.style.transition = 'opacity 0.7s ease-out';
    f.style.opacity = '0';
  }

  // ------------------------------------------------------------ revealed helpers
  revealedAt(x, z) {
    const rev = this.game.state?.revealed;
    if (!rev) return true;
    const cx = Math.floor((x + WORLD_HALF) / MAP_CELL), cz = Math.floor((z + WORLD_HALF) / MAP_CELL);
    if (cx < 0 || cz < 0 || cx >= MAP_RES || cz >= MAP_RES) return false;
    return rev[cz * MAP_RES + cx] > 0;
  }

  treasureAvailable(I) {
    const st = this.game.state;
    if (!st || !I.treasure) return false;
    return st.discovered?.has(I.id) && !st.treasures?.has(I.id) && !st.pending?.has(I.id);
  }

  // ------------------------------------------------------------ minimap
  setupMinimap() {
    this.miniCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.resizeMinimap();
  }
  resizeMinimap() {
    const c = this.el.minimap;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(60, c.clientWidth || 170);
    c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
  }

  drawMinimap() {
    const g = this.miniCtx, c = this.el.minimap, game = this.game, b = game.boat;
    if (!g || !b || !game.world) return;
    if (c.clientWidth && Math.abs(c.width - c.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) > 2) this.resizeMinimap();
    const Sz = c.width, R = Sz / 2, k = R / MINI_RANGE;
    const bx = b.pos.x, bz = b.pos.z;
    const X = (x) => R + (x - bx) * k, Y = (z) => R + (z - bz) * k;
    g.save();
    g.clearRect(0, 0, Sz, Sz);
    g.beginPath(); g.arc(R, R, R, 0, TAU); g.clip();
    g.fillStyle = '#2f74d0'; g.fillRect(0, 0, Sz, Sz);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = Math.max(1, Sz / 170);
    g.beginPath(); g.arc(R, R, R * 0.5, 0, TAU); g.stroke();

    // fog of war cells + outside world
    const rev = game.state.revealed;
    const cs = MAP_CELL * k;
    const c0x = Math.floor((bx - MINI_RANGE + WORLD_HALF) / MAP_CELL), c1x = Math.floor((bx + MINI_RANGE + WORLD_HALF) / MAP_CELL);
    const c0z = Math.floor((bz - MINI_RANGE + WORLD_HALF) / MAP_CELL), c1z = Math.floor((bz + MINI_RANGE + WORLD_HALF) / MAP_CELL);
    g.fillStyle = 'rgba(8,22,48,0.55)';
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const out = cx < 0 || cz < 0 || cx >= MAP_RES || cz >= MAP_RES;
        if (!out && (!rev || rev[cz * MAP_RES + cx])) continue;
        const wx = cx * MAP_CELL - WORLD_HALF, wz = cz * MAP_CELL - WORLD_HALF;
        g.fillRect(X(wx) - 0.5, Y(wz) - 0.5, cs + 1, cs + 1);
      }
    }

    // islands
    const lw = Math.max(1, Sz / 150);
    for (const I of game.world.islands) {
      if (Math.abs(I.x - bx) > MINI_RANGE + I.r * 1.3 || Math.abs(I.z - bz) > MINI_RANGE + I.r * 1.3) continue;
      if (!this.revealedAt(I.x, I.z) || !I.coast) continue;
      this.islandPath(g, I, X, Y, 1);
      g.fillStyle = '#f0dca0'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = lw; g.stroke();
      this.islandPath(g, I, X, Y, 0.72);
      g.fillStyle = I.biome === 'cold' ? '#dfe8ee' : I.biome === 'volcanic' ? '#6e5a50' : '#6cc24a'; g.fill();
    }
    // treasure glints & ports
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
    for (const I of game.world.islands) {
      const dx = I.x - bx, dz = I.z - bz;
      if (Math.abs(dx) > MINI_RANGE + 300 || Math.abs(dz) > MINI_RANGE + 300) continue;
      if (this.treasureAvailable(I)) {
        g.fillStyle = `rgba(255,213,74,${pulse})`;
        g.beginPath(); g.arc(X(I.treasure.x), Y(I.treasure.z), Math.max(2.5, Sz / 55), 0, TAU); g.fill();
        g.strokeStyle = '#0b1830'; g.lineWidth = lw; g.stroke();
      }
      if (I.port && this.revealedAt(I.x, I.z)) {
        const px = I.dock ? I.dock.x : I.x, pz = I.dock ? I.dock.z : I.z;
        this.drawAnchor(g, X(px), Y(pz), Math.max(5, Sz / 22), I.id === game.state.savePort);
      }
    }
    this.drawQuestMarkers(g, X, Y, k, Math.max(6, Sz / 16), R, R, R);
    // boat arrow
    g.translate(R, R);
    g.rotate((bearingDeg(b.heading) * Math.PI) / 180);
    const s = Math.max(5, Sz / 20);
    g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * 0.8, s); g.lineTo(0, s * 0.5); g.lineTo(-s * 0.8, s); g.closePath();
    g.fillStyle = '#ff5a4a'; g.fill(); g.strokeStyle = '#fff8e7'; g.lineWidth = Math.max(1.5, Sz / 100); g.stroke();
    g.restore();

    // north marker
    g.save();
    g.font = `700 ${Math.round(Sz / 11)}px Fredoka, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineWidth = Sz / 45; g.strokeStyle = '#0b1830'; g.strokeText('N', R, Sz * 0.03);
    g.fillStyle = '#ff8a7a'; g.fillText('N', R, Sz * 0.03);
    g.restore();
  }

  islandPath(g, I, X, Y, scale) {
    g.beginPath();
    const pts = I.coast;
    for (let i = 0; i < pts.length; i++) {
      const x = I.x + (pts[i][0] - I.x) * scale, z = I.z + (pts[i][1] - I.z) * scale;
      if (i === 0) g.moveTo(X(x), Y(z)); else g.lineTo(X(x), Y(z));
    }
    g.closePath();
  }

  drawAnchor(g, x, y, s, highlight) {
    g.save();
    g.translate(x, y);
    g.beginPath(); g.arc(0, 0, s, 0, TAU);
    g.fillStyle = highlight ? '#ffd54a' : '#12284a'; g.fill();
    g.lineWidth = Math.max(1.2, s / 5); g.strokeStyle = highlight ? '#0b1830' : '#f4d58d'; g.stroke();
    g.strokeStyle = highlight ? '#0b1830' : '#fff8e7';
    g.lineWidth = Math.max(1, s / 6); g.lineCap = 'round';
    g.beginPath();
    g.arc(0, -s * 0.48, s * 0.17, 0, TAU);
    g.moveTo(0, -s * 0.3); g.lineTo(0, s * 0.6);
    g.moveTo(-s * 0.35, -s * 0.08); g.lineTo(s * 0.35, -s * 0.08);
    g.moveTo(-s * 0.55, s * 0.2); g.quadraticCurveTo(-s * 0.45, s * 0.62, 0, s * 0.62); g.quadraticCurveTo(s * 0.45, s * 0.62, s * 0.55, s * 0.2);
    g.stroke();
    g.restore();
  }

  drawStar(g, x, y, r) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#ffd54a'; g.fill(); g.lineWidth = Math.max(1, r / 5); g.strokeStyle = '#0b1830'; g.stroke();
    g.restore();
  }

  // ------------------------------------------------------------ sea chart
  setupMap() {
    const c = this.el.mapCanvas;
    if (!c) return;
    this.mapCtx = c.getContext('2d');
    const m = this.map;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      m.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (m.pointers.size === 2) m.pinch = this.mapPinch();
    });
    c.addEventListener('pointermove', (e) => {
      const p = m.pointers.get(e.pointerId);
      if (!p) return;
      if (m.pointers.size === 1) {
        m.cx -= (e.clientX - p.x) / m.zoom;
        m.cz -= (e.clientY - p.y) / m.zoom;
        this.clampMap();
        m.dirty = true;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (m.pointers.size >= 2) {
        const d = this.mapPinch();
        if (m.pinch > 0 && d > 0) {
          const pts = [...m.pointers.values()];
          this.zoomMapAt(d / m.pinch, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        }
        m.pinch = d;
      }
    });
    const up = (e) => {
      m.pointers.delete(e.pointerId);
      m.pinch = m.pointers.size >= 2 ? this.mapPinch() : 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = c.getBoundingClientRect();
      this.zoomMapAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  mapPinch() {
    const pts = [...this.map.pointers.values()];
    return pts.length < 2 ? 0 : Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  mapFitZoom() {
    const c = this.el.mapCanvas;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    return Math.min(w, h) / (WORLD_HALF * 2.15);
  }

  zoomMapAt(f, px, py) {
    const m = this.map, c = this.el.mapCanvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (px == null) { px = w / 2; py = h / 2; }
    const wx = m.cx + (px - w / 2) / m.zoom, wz = m.cz + (py - h / 2) / m.zoom;
    m.zoom = clampN(m.zoom * f, this.mapFitZoom() * 0.8, 1.2);
    m.cx = wx - (px - w / 2) / m.zoom;
    m.cz = wz - (py - h / 2) / m.zoom;
    this.clampMap();
    m.dirty = true;
  }

  clampMap() {
    const m = this.map;
    m.cx = clampN(m.cx, -WORLD_HALF, WORLD_HALF);
    m.cz = clampN(m.cz, -WORLD_HALF, WORLD_HALF);
  }

  resizeMap() {
    const c = this.el.mapCanvas;
    if (!c) return;
    this.mapDpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(c.clientWidth * this.mapDpr);
    c.height = Math.round(c.clientHeight * this.mapDpr);
    this.map.dirty = true;
  }

  get isMapOpen() { return this.map.open; }

  openMap() {
    const m = this.map;
    if (m.open) return;
    m.open = true;
    this.el.mapScreen?.classList.remove('hidden');
    this.resizeMap();
    const b = this.game.boat;
    const fit = this.mapFitZoom();
    m.zoom = clampN(Math.min((this.el.mapCanvas.clientWidth || 800), (this.el.mapCanvas.clientHeight || 600)) / 4200, fit, 1.2);
    m.cx = b ? b.pos.x : 0; m.cz = b ? b.pos.z : 0;
    this.clampMap();
    this.buildFog();
    m.dirty = true;
    this.updateMapStats();
    const loop = (now) => {
      if (!m.open) return;
      if (now - m.fogT > 1000) { this.buildFog(); m.fogT = now; m.dirty = true; }
      if (m.dirty || now - m.lastDraw > 200) {
        this.drawMap(now);
        m.dirty = false; m.lastDraw = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  closeMap() {
    this.map.open = false;
    this.map.pointers.clear();
    this.el.mapScreen?.classList.add('hidden');
  }

  buildFog() {
    const rev = this.game.state?.revealed;
    const P = 2, N = MAP_RES + P * 2;
    if (!this.fogCanvas) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width = this.fogCanvas.height = N;
      this.fogCtx = this.fogCanvas.getContext('2d');
      this.fogImg = this.fogCtx.createImageData(N, N);
    }
    const d = this.fogImg.data;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const cx = x - P, cz = y - P;
        const inside = cx >= 0 && cz >= 0 && cx < MAP_RES && cz < MAP_RES;
        const seen = inside && (!rev || rev[cz * MAP_RES + cx] > 0);
        const i = (y * N + x) * 4;
        // parchment fog with a little mottling
        const n = ((x * 73856093) ^ (y * 19349663)) & 15;
        d[i] = 214 + (n >> 1); d[i + 1] = 193 + (n >> 1); d[i + 2] = 140 + (n >> 2); d[i + 3] = seen ? 0 : 255;
      }
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
  }

  updateMapStats() {
    const st = this.game.state, w = this.game.world;
    if (!st || !w || !this.el.mapStats) return;
    const total = w.islands.length;
    const found = (st.treasures?.size || 0);
    this.el.mapStats.innerHTML =
      `<span>Islands charted <b>${st.discovered?.size || 0}</b>/${total}</span>` +
      `<span>Treasures <b>${found}</b>/${total}</span>` +
      `<span>Day <b>${st.day || 1}</b></span>`;
  }

  drawMap(now) {
    const g = this.mapCtx, c = this.el.mapCanvas, game = this.game, st = game.state, world = game.world;
    if (!g || !st || !world) return;
    const dpr = this.mapDpr || 1, m = this.map;
    const W = c.width, H = c.height, z = m.zoom * dpr;
    const X = (x) => W / 2 + (x - m.cx) * z, Y = (zz) => H / 2 + (zz - m.cz) * z;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#cdb57e'; g.fillRect(0, 0, W, H);
    const x0 = X(-WORLD_HALF), y0 = Y(-WORLD_HALF), ws = WORLD_HALF * 2 * z;
    // sea
    const grad = g.createRadialGradient(X(0), Y(0), 0, X(0), Y(0), ws * 0.75);
    grad.addColorStop(0, '#a9d1e0'); grad.addColorStop(1, '#8dbad0');
    g.fillStyle = grad; g.fillRect(x0, y0, ws, ws);
    // grid
    g.strokeStyle = 'rgba(40,80,110,0.18)'; g.lineWidth = Math.max(1, dpr);
    g.beginPath();
    for (let v = -WORLD_HALF; v <= WORLD_HALF; v += 1000) {
      g.moveTo(X(v), y0); g.lineTo(X(v), y0 + ws);
      g.moveTo(x0, Y(v)); g.lineTo(x0 + ws, Y(v));
    }
    g.stroke();

    // islands
    const lw = Math.max(1, 1.5 * dpr);
    for (const I of world.islands) {
      if (!I.coast) continue;
      const sx = X(I.x), sy = Y(I.z), rr = I.r * 1.3 * z;
      if (sx + rr < 0 || sy + rr < 0 || sx - rr > W || sy - rr > H) continue;
      // shallow halo
      this.islandPath(g, I, X, Y, 1.12);
      g.fillStyle = 'rgba(190,232,236,0.7)'; g.fill();
      this.islandPath(g, I, X, Y, 1);
      g.fillStyle = I.biome === 'volcanic' ? '#8d7a6c' : '#f3e2ae'; g.fill();
      g.strokeStyle = '#6b5536'; g.lineWidth = lw; g.stroke();
      this.islandPath(g, I, X, Y, 0.72);
      g.fillStyle = I.biome === 'cold' ? '#e4ecf0' : I.biome === 'volcanic' ? '#5b4a42' : I.biome === 'tropical' ? '#7fcf5c' : '#8cc56a';
      g.fill();
      if (I.r * z > 14 * dpr) {
        this.islandPath(g, I, X, Y, 0.4);
        g.fillStyle = 'rgba(70,90,50,0.25)'; g.fill();
      }
    }

    // fog of war
    if (this.fogCanvas) {
      const cell = MAP_CELL * z;
      g.save();
      g.imageSmoothingEnabled = true;
      const blur = clampN(cell * 0.45, 2, 40);
      if ('filter' in g) g.filter = `blur(${blur.toFixed(1)}px)`;
      g.drawImage(this.fogCanvas, x0 - cell * 2, y0 - cell * 2, ws + cell * 4, ws + cell * 4);
      g.restore();
      if ('filter' in g) g.filter = 'none';
    }
    // world border
    g.strokeStyle = 'rgba(90,60,30,0.6)'; g.lineWidth = 3 * dpr; g.setLineDash([10 * dpr, 8 * dpr]);
    g.strokeRect(x0, y0, ws, ws); g.setLineDash([]);

    // labels, treasures, ports
    const fs = Math.round(clampN(11 + m.zoom * 18, 11, 17) * dpr);
    g.font = `600 ${fs}px Fredoka, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    const pulse = 0.6 + 0.4 * Math.sin(now / 260);
    for (const I of world.islands) {
      const sx = X(I.x), sy = Y(I.z);
      if (sx < -200 || sy < -200 || sx > W + 200 || sy > H + 200) continue;
      const known = st.discovered?.has(I.id);
      if (this.treasureAvailable(I)) {
        const tx = X(I.treasure.x), ty = Y(I.treasure.z), s = 6 * dpr;
        g.strokeStyle = '#b3261e'; g.lineWidth = 3 * dpr; g.lineCap = 'round';
        g.beginPath(); g.moveTo(tx - s, ty - s); g.lineTo(tx + s, ty + s); g.moveTo(tx + s, ty - s); g.lineTo(tx - s, ty + s); g.stroke();
        g.fillStyle = `rgba(255,213,74,${pulse * 0.6})`;
        g.beginPath(); g.arc(tx, ty, s * 1.7, 0, TAU); g.fill();
      }
      if (I.port && this.revealedAt(I.x, I.z)) {
        const px = I.dock ? I.dock.x : I.x, pz = I.dock ? I.dock.z : I.z;
        const save = I.id === st.savePort;
        this.drawAnchor(g, X(px), Y(pz), 9 * dpr, save);
        if (save) this.drawStar(g, X(px) + 10 * dpr, Y(pz) - 10 * dpr, 6 * dpr);
      }
      if (known) {
        const ty = sy - I.r * 0.9 * z - 4 * dpr;
        g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(255,248,231,0.9)'; g.lineJoin = 'round';
        g.strokeText(I.name, sx, ty);
        g.fillStyle = I.port ? '#12284a' : '#3a2a14';
        g.fillText(I.name, sx, ty);
      }
    }

    this.drawQuestMarkers(g, X, Y, z, 14 * dpr);
    // ship
    const b = game.boat;
    if (b) {
      g.save();
      g.translate(X(b.pos.x), Y(b.pos.z));
      g.rotate((bearingDeg(b.heading) * Math.PI) / 180);
      const s = 9 * dpr;
      g.beginPath(); g.moveTo(0, -s * 1.4); g.lineTo(s * 0.85, s); g.lineTo(0, s * 0.5); g.lineTo(-s * 0.85, s); g.closePath();
      g.fillStyle = '#e0483a'; g.fill(); g.strokeStyle = '#fff8e7'; g.lineWidth = 2.2 * dpr; g.stroke();
      g.restore();
      g.strokeStyle = `rgba(224,72,58,${0.5 * pulse})`; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(X(b.pos.x), Y(b.pos.z), 18 * dpr, 0, TAU); g.stroke();
    }

    this.drawCompassRose(g, W, H, dpr);
    this.drawScale(g, W, H, dpr, z);
  }

  drawCompassRose(g, W, H, dpr) {
    const r = 34 * dpr, x = 20 * dpr + r, y = H - 60 * dpr - r;
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(255,248,231,0.55)'; g.strokeStyle = '#6b5536'; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.stroke();
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate((i * Math.PI) / 2);
      g.beginPath(); g.moveTo(0, -r * 0.9); g.lineTo(r * 0.16, 0); g.lineTo(-r * 0.16, 0); g.closePath();
      g.fillStyle = i === 0 ? '#b3261e' : '#6b5536'; g.fill();
      g.restore();
    }
    g.font = `700 ${Math.round(12 * dpr)}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3a2a14'; g.fillText('N', 0, -r - 9 * dpr);
    // wind arrow
    const w = this.game.weather;
    if (w) {
      g.rotate((bearingDeg(w.windAngle || 0) * Math.PI) / 180);
      g.strokeStyle = '#1f5fa8'; g.fillStyle = '#1f5fa8'; g.lineWidth = 3 * dpr;
      g.beginPath(); g.moveTo(0, r * 0.55); g.lineTo(0, -r * 0.45); g.stroke();
      g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(r * 0.18, -r * 0.4); g.lineTo(-r * 0.18, -r * 0.4); g.closePath(); g.fill();
    }
    g.restore();
    g.font = `600 ${Math.round(11 * dpr)}px Fredoka, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#1f5fa8';
    g.fillText('wind', x, y + r + 12 * dpr);
  }

  drawScale(g, W, H, dpr, z) {
    const target = 120 * dpr / z;
    const steps = [100, 250, 500, 1000, 2000, 5000];
    let units = steps[steps.length - 1];
    for (const s of steps) if (s >= target) { units = s; break; }
    const len = units * z, x = W - 20 * dpr - len, y = H - 64 * dpr;
    g.strokeStyle = '#3a2a14'; g.lineWidth = 3 * dpr;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.moveTo(x, y - 6 * dpr); g.lineTo(x, y + 6 * dpr); g.moveTo(x + len, y - 6 * dpr); g.lineTo(x + len, y + 6 * dpr); g.stroke();
    g.font = `600 ${Math.round(12 * dpr)}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = '#3a2a14';
    g.fillText(units >= 1000 ? `${units / 1000} km` : `${units} m`, x + len / 2, y - 8 * dpr);
  }

  // ------------------------------------------------------------ port
  openPort(island, tab = 'shipwright') {
    this.portIsland = island || this.game.dockedIsland || null;
    this.setPortTab(tab);
    if (this.el.portName) this.el.portName.textContent = this.portIsland ? this.portIsland.name : 'Harbor';
    this.el.portScreen?.classList.remove('hidden');
    this.refreshPort();
    const sheet = this.el.portScreen?.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
  }
  closePort() { this.el.portScreen?.classList.add('hidden'); }

  setPortTab(tab) {
    this.portTab = tab;
    this.el.portTabs?.querySelectorAll('button[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.el.paneShipwright?.classList.toggle('hidden', tab !== 'shipwright');
    this.el.paneQuests?.classList.toggle('hidden', tab !== 'quests');
    this.el.paneTailor?.classList.toggle('hidden', tab !== 'tailor');
  }

  // ------------------------------------------------------------ quests
  avatar(giver) {
    const hue = [...giver.name].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360;
    return `<span class="avatar" style="background:hsl(${hue} 70% 72%)">${esc(giver.name[0])}</span>`;
  }

  questCard(q, mode) {
    const g = this.game, Qs = g.quests;
    const cos = q.reward.cosmetic ? STYLES.find((s) => s.id === q.reward.cosmetic) : null;
    const meta = [`<span class="gold">${ICONS.coin.replace('<svg', '<svg class="ico" style="width:13px;height:13px;vertical-align:-2px"')} ${fmt(q.reward.gold)}</span>`];
    if (q.type === 'deliver' && q.days) meta.push(`<span>+${fmt(q.bonus)} within ${q.days} day${q.days === 1 ? '' : 's'}</span>`);
    if (cos) meta.push(`<span class="cos">+ ${esc(cos.name)}</span>`);
    if (q.dist) meta.push(`<span>${fmtDist(q.dist)}</span>`);
    let foot = '';
    if (mode === 'offer') {
      const can = Qs.canAccept();
      foot = `<button class="btn${can ? ' primary' : ''}" data-accept="${q.id}" ${can ? '' : 'disabled'}>${can ? 'Accept' : `${MAX_ACTIVE} quests already`}</button>`;
    } else {
      const pinned = Qs.pinned?.id === q.id;
      foot = `<div class="qStatus">${esc(Qs.status(q))}</div>
        <div class="row2"><button class="btn" data-pin="${q.id}" ${pinned ? 'disabled' : ''}>${pinned ? 'Tracking' : 'Track'}</button>
        <button class="btn danger" data-abandon="${q.id}">Abandon</button></div>`;
    }
    const from = g.world.islands[q.from];
    return `<div class="card qCard${mode !== 'offer' && Qs.pinned?.id === q.id ? ' pinned' : ''}">
      <div class="giver">${this.avatar(q.giver)}<span><b>${esc(q.giver.name)}</b> · ${esc(q.giver.role)}${mode !== 'offer' && from ? `, ${esc(from.name)}` : ''}</span></div>
      <div class="qTitle">${esc(q.title)}</div>
      <div class="qText">${esc(q.text)}</div>
      <div class="qMeta">${meta.join('')}</div>
      ${foot}</div>`;
  }

  refreshQuests() {
    const g = this.game, Qs = g.quests, port = this.portIsland;
    if (!Qs || !port || !this.el.questOffers) return;
    const offers = Qs.board(port);
    const n = Qs.active.length;
    this.el.questCount.innerHTML = `Active quests: <b>${n}/${MAX_ACTIVE}</b>${n ? ' · open the journal (<kbd>J</kbd>) to track or abandon them' : ''}. Rewards are paid when you dock.`;
    this.el.questOffers.innerHTML = offers.length
      ? offers.map((o) => this.questCard(o, 'offer')).join('')
      : '<div class="qEmpty">No work posted today. Check back tomorrow.</div>';
    const badge = this.el.questBadge;
    if (badge) { badge.textContent = offers.length; badge.classList.toggle('hidden', !offers.length || !Qs.canAccept()); }
  }

  // ------------------------------------------------------------ journal
  get isJournalOpen() { return !!this.journalOpen; }
  openJournal() {
    if (this.journalOpen || !this.game.quests) return;
    this.journalOpen = true;
    this.renderJournal();
    this.el.journalScreen?.classList.remove('hidden');
  }
  closeJournal() { this.journalOpen = false; this.el.journalScreen?.classList.add('hidden'); }
  toggleJournal() { if (this.journalOpen) this.closeJournal(); else this.openJournal(); }

  renderJournal() {
    const Qs = this.game.quests;
    let html = `<h3 class="sectionTitle">Active (${Qs.active.length}/${MAX_ACTIVE})</h3>`;
    html += Qs.active.length
      ? `<div class="grid">${Qs.active.map((q) => this.questCard(q, 'active')).join('')}</div>`
      : '<div class="qEmpty">No quests yet. Quest boards are posted in every port.</div>';
    const done = (this.game.state.stats?.quests || 0);
    html += `<h3 class="sectionTitle">Completed</h3><div class="qEmpty">${done ? `${done} quest${done === 1 ? '' : 's'} completed.` : 'None yet.'}</div>`;
    this.el.journalBody.innerHTML = html;
  }

  // ------------------------------------------------------------ tracker
  updateQuestTracker() {
    const g = this.game, Qs = g.quests, b = g.boat;
    const q = Qs && (g.mode === 'sailing' || g.mode === 'docked' || g.mode === 'docking') ? Qs.pinned : null;
    const tr = this.el.questTracker, cq = this.el.compassQuest;
    if (!q) {
      if (this.last.qt !== null) { tr?.classList.add('hidden'); cq?.classList.add('hidden'); this.last.qt = null; }
      return;
    }
    const t = Qs.target(q);
    const dx = t.x - b.pos.x, dz = t.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    const inside = t.r && d < t.r;
    const key = `${q.id}|${t.label}`;
    if (this.last.qt !== key) {
      this.last.qt = key;
      tr.classList.remove('hidden');
      this.el.qtTitle.textContent = q.title;
      this.el.qtLabel.textContent = t.label;
    }
    const distTxt = inside ? 'In the area' : fmtDist(t.r ? d - t.r : d);
    if (this.el.qtDist.textContent !== distTxt) this.el.qtDist.textContent = distTxt;
    // arrow relative to the ship's heading; the compass pin by bearing
    const brg = bearingDeg(Math.atan2(dx, dz)), head = bearingDeg(b.heading);
    let rel = ((brg - head) % 360 + 540) % 360 - 180;
    this.el.qtArrow.style.transform = `rotate(${rel.toFixed(1)}deg)`;
    this.el.qtArrow.style.opacity = inside ? 0.35 : 1;
    if (cq) {
      if (!this.compassW) this.compassW = this.el.compass?.clientWidth || 0; // measured while hidden at boot
      const w = this.compassW || 300, half = w / 2 - 10;
      const x = clampN(rel * PX_PER_DEG, -half, half);
      cq.classList.remove('hidden');
      cq.classList.toggle('edge', Math.abs(rel * PX_PER_DEG) > half);
      cq.style.left = `${w / 2 + x}px`;
    }
  }

  /** Quest markers on a map canvas. X/Y project world → canvas; `scale` px per world unit. */
  drawQuestMarkers(g, X, Y, scale, size, clipR = null, cx = 0, cy = 0) {
    const Qs = this.game.quests;
    if (!Qs || !Qs.active.length) return;
    const pinned = Qs.pinned;
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 300);
    for (const q of Qs.active) {
      const t = Qs.target(q);
      const on = q === pinned;
      let x = X(t.x), y = Y(t.z);
      g.save();
      if (t.r) {
        g.beginPath(); g.arc(x, y, t.r * scale, 0, TAU);
        g.fillStyle = `rgba(111,240,255,${on ? 0.16 : 0.08})`; g.fill();
        g.setLineDash([size * 0.7, size * 0.5]);
        g.strokeStyle = `rgba(30,150,170,${on ? 0.95 : 0.5})`; g.lineWidth = Math.max(1.5, size / 5); g.stroke();
        g.setLineDash([]);
      }
      // clamp to the rim of a round minimap so off-screen targets still show a direction
      if (clipR) {
        const vx = x - cx, vy = y - cy, l = Math.hypot(vx, vy), lim = clipR - size * 1.1;
        if (l > lim) { x = cx + (vx / l) * lim; y = cy + (vy / l) * lim; }
      }
      const s = size * (on ? 1 : 0.75);
      g.translate(x, y); g.rotate(Math.PI / 4);
      g.fillStyle = on ? `rgba(111,240,255,${pulse})` : 'rgba(111,240,255,0.6)';
      g.fillRect(-s / 2, -s / 2, s, s);
      g.strokeStyle = '#0b1830'; g.lineWidth = Math.max(1.2, size / 6); g.strokeRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
  }

  refreshTailor() {
    const st = this.game.state, grid = this.el.tailorGrid;
    if (!grid) return;
    const SLOT = { hat: 'Hat', top: 'Top', bottom: 'Bottoms', boots: 'Boots', neck: 'Neck', extra: 'Bag' };
    grid.innerHTML = STYLES.filter((s) => s.source === 'tailor').map((s) => {
      const have = owns(st.wardrobe, s.slot, s.style);
      const afford = st.banked >= s.price;
      const btn = have ? '<button class="btn" disabled>Owned</button>'
        : `<button class="btn${afford ? ' primary' : ''}" data-buy="${s.id}" ${afford ? '' : 'disabled'}>Buy <span class="ico">${ICONS.coin}</span> ${fmt(s.price)}</button>`;
      return `<div class="card${have ? ' owned' : ''}">
        <div class="cardHead"><div class="cardIcon">${ICONS.needle}</div>
          <div><div class="cardName">${esc(s.name)}</div><div class="cardStat">${SLOT[s.slot] || s.slot}</div></div></div>
        <div class="cardCur">${have ? 'In your wardrobe' : 'Sold at every port tailor'}</div>
        ${btn}</div>`;
    }).join('');
  }

  refreshPort() {
    const g = this.game, st = g.state, b = g.boat;
    if (!st || !this.el.upgradeGrid) return;
    this.el.portGold.textContent = fmt(st.banked);
    this.refreshTailor();
    this.refreshQuests();
    const maxH = (b && b.maxHealth) || 100;
    this.el.portHull.textContent = `Hull ${Math.ceil(st.health || 0)}/${maxH}`;
    const cost = g.repairCost ? g.repairCost() : 0;
    const full = (st.health || 0) >= maxH - 0.5;
    const rb = this.el.btnRepair;
    rb.disabled = full || (cost > 0 && st.banked <= 0);
    rb.innerHTML = full ? `${ICONS.check.replace('<svg', '<svg class="ico"')} Hull sound`
      : `Repair <span class="ico">${ICONS.coin}</span> ${fmt(cost)}${cost > st.banked ? ' (partial)' : ''}`;

    this.el.upgradeGrid.innerHTML = UPGRADES.map((u) => {
      const lvl = Math.min(st.upgrades?.[u.key] || 0, u.tiers.length - 1);
      const cur = u.tiers[lvl], next = u.tiers[lvl + 1];
      const pips = u.tiers.map((_, i) => `<span class="pip${i <= lvl ? ' on' : ''}"></span>`).join('');
      const afford = next && st.banked >= next.cost;
      const btn = next
        ? `<button class="btn${afford ? ' primary' : ''}" data-key="${u.key}" ${afford ? '' : 'disabled'}>Buy <span class="ico">${ICONS.coin}</span> ${fmt(next.cost)}</button>`
        : '<button class="btn" disabled>Fully upgraded</button>';
      return `<div class="card${next ? '' : ' maxed'}">
        <div class="cardHead"><div class="cardIcon">${ICONS[u.icon] || ''}</div>
          <div><div class="cardName">${esc(u.name)}</div><div class="cardStat">${esc(u.stat)}</div></div>
          <div class="pips">${pips}</div></div>
        <div class="cardCur">${esc(cur.label)}</div>
        <div class="cardNext">${next ? `Next: <b>${esc(next.label)}</b>` : 'The finest on the seas.'}</div>
        ${btn}</div>`;
    }).join('');
  }

  // ------------------------------------------------------------ pause
  showPause() {
    this.refreshSettings();
    this.buildControlsHelp();
    this.el.pauseScreen?.classList.remove('hidden');
  }
  hidePause() { this.el.pauseScreen?.classList.add('hidden'); }

  refreshSettings() {
    const s = this.game.settings || {};
    const set = (el, on, label) => { if (!el) return; el.textContent = label; el.classList.toggle('off', !on); };
    set(this.el.setSound, s.sound !== false, `Sound: ${s.sound !== false ? 'On' : 'Off'}`);
    set(this.el.setMusic, s.music !== false, `Music: ${s.music !== false ? 'On' : 'Off'}`);
    set(this.el.setQuality, s.quality !== 'low', `Quality: ${s.quality === 'low' ? 'Low' : 'High'}`);
  }

  // ------------------------------------------------------------ wreck
  showWreck(lostCargo, portName) {
    const n = Math.floor(lostCargo || 0);
    this.el.wreckText.textContent = n > 0
      ? `Your ship splintered on the waves. The ${fmt(n)} gold in your hold sank to the bottom of the sea.`
      : 'Your ship splintered on the waves. Luckily your hold was empty.';
    this.el.btnRespawn.textContent = `Wash ashore at ${portName || 'port'}`;
    this.el.wreckScreen?.classList.remove('hidden');
  }
  hideWreck() { this.el.wreckScreen?.classList.add('hidden'); }
}
