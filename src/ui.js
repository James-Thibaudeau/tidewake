// DOM user interface: HUD, minimap, sea chart, port, pause, wreck and title
// screens. Reads game state; calls game methods for actions.
import { UPGRADES, MAP_RES, MAP_CELL, WORLD_HALF } from './config.js';
import { STYLES, owns } from './cosmetics.js';
import { MAX_ACTIVE, fmtDist } from './quests.js';
import { PROLOGUE, EPILOGUE, JOURNALS, LETTERS, LINES } from './story-text.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const fillVars = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
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
  book: S(`<path d="M4 5.5C7 4 9.5 4 12 6c2.5-2 5-2 8-.5V19c-3-1.5-5.5-1.5-8 .5-2.5-2-5-2-8-.5z" ${STROKE}/><path d="M12 6v13.5" ${STROKE}/>`),
  letters: S(`<rect x="3" y="6" width="18" height="13" rx="1.5" ${STROKE}/><path d="M3.5 7l8.5 6.5L20.5 7" ${STROKE}/><path d="M12 13.5V19" stroke="#c8322b" stroke-width="2.2"/>`),
  scarf: S(`<path d="M5 6c3 2.5 11 2.5 14 0l-1.5 4c-3.5 2-7.5 2-11 0z" fill="#c8322b" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 10.5l2.5 9 2.5-1-1.5-8.5" fill="#c8322b" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`),
  helmet: S(`<path d="M5 15a7 7 0 0 1 14 0z" fill="#e6cf92" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 15.5h20c0 1.6-4.5 2.5-10 2.5S2 17.1 2 15.5z" fill="#e6cf92" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5.4 12.6h13.2" stroke="#c8322b" stroke-width="2"/><circle cx="12" cy="7.4" r="1.1" fill="currentColor"/>`),
  dice: S(`<rect x="3.5" y="3.5" width="17" height="17" rx="4" ${STROKE}/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/>`),
};

// ------------------------------------------------------------ story art
// Little painted scenes for the story cards (320×170, flat shapes, ink lines).
const INK = 'stroke="#2a1d12" stroke-width="2.5" stroke-linejoin="round"';
const sky = (a, b, sea = '#3f86c9', sea2 = '#2c6aa8') => `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="320" height="170" fill="url(#sk)"/><rect y="110" width="320" height="60" fill="${sea}"/>
  <path d="M0 122 Q20 118 40 122 T80 122 T120 122 T160 122 T200 122 T240 122 T280 122 T320 122 V170 H0Z" fill="${sea2}" opacity=".55"/>
  <path d="M30 140 q10 -4 20 0 M120 150 q10 -4 20 0 M230 136 q10 -4 20 0 M270 156 q10 -4 20 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>`;
const smallBoat = (x, y, s = 1, patch = true) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-26 0 H26 L18 12 H-18 Z" fill="#a8693a" ${INK}/><path d="M0 0 V-46" ${INK}/>
  <path d="M2 -44 L30 -6 H2 Z" fill="#fff4dc" ${INK}/>${patch ? '<rect x="9" y="-22" width="8" height="7" fill="#e0b070" stroke="#2a1d12" stroke-width="1.5"/>' : ''}
  <path d="M0 -46 l9 3 -9 3" fill="#c8322b" stroke="#2a1d12" stroke-width="1.5"/></g>`;
const rocks = (x) => `<g transform="translate(${x} 0)"><path d="M0 116 L6 52 L30 44 L40 116 Z" fill="#8f877d" ${INK}/><path d="M6 52 L30 44 L28 54 L8 58 Z" fill="#6fae55" ${INK}/>
  <path d="M34 116 L40 76 L60 72 L66 116 Z" fill="#7d766d" ${INK}/><path d="M40 76 L60 72 L59 79 L41 81Z" fill="#6fae55" stroke="#2a1d12" stroke-width="2"/></g>`;
const STORY_ART = {
  harbor: () => sky('#ffe3b0', '#9fd0ee') + `<circle cx="258" cy="40" r="18" fill="#ffd54a" ${INK}/>
    <path d="M0 112 Q50 60 120 70 T200 112 Z" fill="#6cc24a" ${INK}/><path d="M60 80 h22 v14 h-22z M100 74 h18 v12 h-18z" fill="#ead7b0" ${INK}/>
    <path d="M56 80 l15 -12 15 12 M97 74 l12 -10 12 10" fill="#c2573f" ${INK}/>
    <path d="M150 112 H300 V118 H150 Z" fill="#9b7650" ${INK}/><path d="M170 118v14 M210 118v14 M250 118v14 M290 118v14" ${INK}/>
    ${smallBoat(255, 112, 0.8)}<path d="M150 40 q6 -5 12 0 q6 -5 12 0 M190 26 q5 -4 10 0 q5 -4 10 0" stroke="#2a1d12" stroke-width="2" fill="none"/>`,
  boat: () => sky('#bfe4ff', '#e8f6ff') + `<circle cx="60" cy="38" r="14" fill="#ffe27a" ${INK}/>${smallBoat(165, 116, 1.4)}
    <path d="M110 30 q16 -10 32 0 q12 -8 24 0 q-28 6 -56 0" fill="#fff" stroke="#2a1d12" stroke-width="2"/>`,
  wreck: () => sky('#d9e8f2', '#a9c9dd', '#4a7fae', '#3a6b96') + rocks(190) + `
    <g transform="translate(150 112) rotate(-14)"><path d="M-70 -6 H40 L60 -26 L56 0 Q-10 22 -70 4 Z" fill="#6a4527" ${INK}/>
    <path d="M-60 -6 H36" ${INK}/><path d="M-30 -6 V-34 L-26 -40" fill="none" ${INK}/><path d="M-26 -40 l12 4 -12 4z" fill="#c8322b" stroke="#2a1d12" stroke-width="1.5"/>
    <path d="M-50 -6 v-10 M-40 -6 v-12" stroke="#7a5333" stroke-width="3"/></g>
    <path d="M40 150 h22 M70 156 h14" stroke="#9a7046" stroke-width="5" stroke-linecap="round"/>`,
  letters: () => `<rect width="320" height="170" fill="#e9d9b4"/><rect x="12" y="12" width="296" height="146" rx="8" fill="#f4e8cc" stroke="#b09060" stroke-width="2"/>
    <g transform="rotate(-6 150 90)"><rect x="70" y="52" width="130" height="78" fill="#fffaf0" ${INK}/><path d="M70 52 L135 96 L200 52" fill="none" ${INK}/></g>
    <g transform="rotate(4 170 100)"><rect x="96" y="66" width="130" height="78" fill="#fff6e6" ${INK}/><path d="M96 66 L161 110 L226 66" fill="none" ${INK}/>
    <path d="M161 66 V144 M96 105 H226" stroke="#c8322b" stroke-width="4"/><circle cx="161" cy="105" r="7" fill="#b3261e" ${INK}/></g>
    <path d="M232 124 q22 -40 40 -10 q10 18 -10 26" fill="none" stroke="#c8322b" stroke-width="9" stroke-linecap="round"/>
    <g transform="translate(52 120)"><path d="M0 0 v-28" stroke="#4a7a3a" stroke-width="2.5"/><circle cy="-32" r="7" fill="#f2a6c0" ${INK}/><circle cy="-32" r="2.5" fill="#ffd54a"/></g>`,
  sunset: () => sky('#5a3c7a', '#ff9a5a', '#3a4f8a', '#2c3c70') + `<circle cx="160" cy="112" r="34" fill="#ffcf6a" ${INK}/>
    <rect y="112" width="320" height="58" fill="#3a4f8a"/><path d="M128 124 h64 M138 134 h44 M148 144 h24" stroke="#ffcf6a" stroke-width="4" stroke-linecap="round"/>
    ${smallBoat(70, 120, 0.7, false)}`,
  home: () => sky('#ffb877', '#ffe6b8') + `<path d="M0 112 Q90 84 200 96 T320 112 Z" fill="#6cc24a" ${INK}/>
    <rect x="96" y="56" width="92" height="48" fill="#ead7b0" ${INK}/><path d="M86 60 L142 22 L198 60 Z" fill="#c2573f" ${INK}/>
    <rect x="112" y="70" width="20" height="18" fill="#ffd54a" ${INK}/><path d="M122 70 v18 M112 79 h20" stroke="#2a1d12" stroke-width="1.5"/>
    <rect x="150" y="74" width="18" height="30" fill="#7a4a24" ${INK}/><path d="M90 104 H194 V110 H90Z" fill="#9b7650" ${INK}/>
    <path d="M160 22 v-12 h10 v18" fill="#8f877d" ${INK}/><path d="M166 6 q6 -6 0 -10" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>`,
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
      'btnJournal', 'paneQuests', 'questCount', 'questOffers', 'questBadge', 'journalScreen', 'journalBody', 'journalClose',
      'journalTabs', 'journalTitle', 'storyCards', 'storyArt', 'storyTitle', 'storyText', 'storyDots', 'storySkip', 'storyNext',
      'foundScreen', 'foundEyebrow', 'foundTitle', 'foundItems', 'foundMain', 'foundLater'];
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
    this.el.journalTabs?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-jtab]');
      if (!b) return;
      this.click();
      this.journalTab = b.dataset.jtab;
      this.renderJournal();
    });
    // story cards: buttons, tap anywhere on the card, or Space / Enter / E / →
    this.on('foundMain', () => this.closeFound('main'));
    this.on('foundLater', () => this.closeFound('later'));
    this.on('storyNext', () => this.storyStep(1));
    this.on('storySkip', () => this.storyStep(Infinity));
    this.el.storyCards?.addEventListener('click', (e) => { if (!e.target.closest('button')) { this.click(); this.storyStep(1); } });
    window.addEventListener('keydown', (e) => {
      if (this.foundOpen && !e.repeat && ['Space', 'Enter', 'NumpadEnter', 'KeyE'].includes(e.code)) { e.preventDefault(); this.click(); this.closeFound('main'); return; }
      if (!this.storyCardsOpen || e.repeat) return;
      if (['Space', 'Enter', 'NumpadEnter', 'KeyE', 'ArrowRight'].includes(e.code)) { e.preventDefault(); this.click(); this.storyStep(1); }
    });
    this.el.journalBody?.addEventListener('click', async (e) => {
      const page = e.target.closest('button[data-page]');
      if (page) { if (!page.classList.contains('missing')) { this.click(); this.journalPage = page.dataset.page; this.renderJournal(); } return; }
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
    const Wk = game.world.wreck;
    if (Wk && Math.abs(Wk.x - bx) < MINI_RANGE + 50 && Math.abs(Wk.z - bz) < MINI_RANGE + 50) this.drawWreck(g, X(Wk.x), Y(Wk.z), Math.max(5, Sz / 22));
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

  /** Grandfather's wreck: a little broken hull on its rocks (always on the chart). */
  drawWreck(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.lineJoin = 'round'; g.lineWidth = Math.max(1.2, s / 6); g.strokeStyle = '#0b1830';
    g.fillStyle = '#9a938a';
    g.beginPath(); g.arc(s * 0.7, -s * 0.35, s * 0.45, 0, TAU); g.fill(); g.stroke();
    g.rotate(-0.35);
    g.beginPath(); g.moveTo(-s, -s * 0.15); g.lineTo(s * 0.7, -s * 0.15); g.lineTo(s * 0.45, s * 0.4); g.lineTo(-s * 0.75, s * 0.4); g.closePath();
    g.fillStyle = '#7a4a24'; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.15, -s * 0.15); g.lineTo(-s * 0.05, -s * 0.95); g.stroke();
    g.fillStyle = '#c8322b';
    g.beginPath(); g.moveTo(-s * 0.05, -s * 0.95); g.lineTo(s * 0.4, -s * 0.8); g.lineTo(-s * 0.08, -s * 0.65); g.closePath(); g.fill();
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

    const Wk = world.wreck;
    if (Wk) {
      this.drawWreck(g, X(Wk.x), Y(Wk.z), 10 * dpr);
      const ty = Y(Wk.z) - 14 * dpr;
      g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(255,248,231,0.9)'; g.lineJoin = 'round';
      g.strokeText(Wk.name, X(Wk.x), ty);
      g.fillStyle = '#6a2a14'; g.fillText(Wk.name, X(Wk.x), ty);
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
    if (q.type === 'story') {
      const pinned = Qs.pinned?.id === q.id;
      return `<div class="card qCard storyQ${pinned ? ' pinned' : ''}">
        <div class="giver">${this.avatar(q.giver)}<span><b>Main story</b> · Grandfather's Journals</span></div>
        <div class="qTitle">${esc(q.title)}</div>
        <div class="qText">${esc(q.text)}</div>
        <div class="qStatus">${esc(Qs.status(q))}</div>
        <div class="row2"><button class="btn" data-pin="story" ${pinned ? 'disabled' : ''}>${pinned ? 'Tracking' : 'Track'}</button></div></div>`;
    }
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
  /** tab: 'quests' | 'story'; page: a journal id ('I'..'VII') or 'letters'. */
  openJournal(tab, page) {
    if (!this.game.quests) return;
    if (tab) this.journalTab = tab;
    if (page) this.journalPage = page;
    this.journalOpen = true;
    this.renderJournal();
    this.el.journalScreen?.classList.remove('hidden');
    const sheet = this.el.journalScreen?.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
  }
  closeJournal() { this.journalOpen = false; this.el.journalScreen?.classList.add('hidden'); }
  toggleJournal() { if (this.journalOpen) this.closeJournal(); else this.openJournal(); }

  renderJournal() {
    const tab = this.journalTab || 'quests';
    this.el.journalTabs?.querySelectorAll('button[data-jtab]').forEach((b) => b.classList.toggle('on', b.dataset.jtab === tab));
    this.el.journalTitle.textContent = tab === 'story' ? "Grandfather's Journals" : 'Quests';
    if (tab === 'story') { this.el.journalBody.innerHTML = this.renderStoryPages(); return; }
    const Qs = this.game.quests;
    let html = '';
    if (Qs.story) html += `<h3 class="sectionTitle">Main story</h3><div class="grid">${this.questCard(Qs.story, 'active')}</div>`;
    html += `<h3 class="sectionTitle">Active (${Qs.active.length}/${MAX_ACTIVE})</h3>`;
    html += Qs.active.length
      ? `<div class="grid">${Qs.active.map((q) => this.questCard(q, 'active')).join('')}</div>`
      : '<div class="qEmpty">No quests yet. Quest boards are posted in every port.</div>';
    const done = (this.game.state.stats?.quests || 0);
    html += `<h3 class="sectionTitle">Completed</h3><div class="qEmpty">${done ? `${done} quest${done === 1 ? '' : 's'} completed.` : 'None yet.'}</div>`;
    this.el.journalBody.innerHTML = html;
  }

  renderStoryPages() {
    const story = this.game.story, S = story?.S;
    if (!S) return '';
    const found = new Set(S.journals);
    const pages = [...ROMAN.map((id) => ({ id, j: JOURNALS.find((x) => x.id === id) })), { id: 'letters', j: LETTERS }];
    const have = (id) => (id === 'letters' ? !!S.flags.letters : found.has(id));
    let cur = this.journalPage;
    if (!cur || !have(cur)) cur = [...pages].reverse().find((p) => have(p.id))?.id || null;
    this.journalPage = cur;
    const list = pages.map((p) => {
      const ok = have(p.id);
      const label = p.id === 'letters' ? (ok ? esc(p.j.title) : 'A sealed chest…') : `<span class="num">${p.id}</span>${ok ? esc(p.j.title) : 'Not yet found'}`;
      return `<button data-page="${p.id}" class="${ok ? '' : 'missing'}${p.id === cur ? ' on' : ''}">${label}</button>`;
    }).join('');
    let page;
    if (!cur) page = '<div class="jPage torn">His first journal is still aboard the wreck, just past the point.</div>';
    else {
      const p = pages.find((x) => x.id === cur).j;
      const paras = p.body.split('\n\n');
      const sign = cur === 'letters' ? '' : paras.pop();
      page = `<div class="jPage"><div class="jNo">${cur === 'letters' ? 'From the chest under the bunk' : `Journal ${cur}`}</div><h3>${esc(p.title)}</h3>
        ${paras.map((x) => `<p>${esc(x)}</p>`).join('')}${sign ? `<p class="sign">${esc(sign)}</p>` : ''}
        ${p.clue ? `<p class="clue">${esc(p.clue)}</p>` : ''}</div>`;
    }
    return `<div class="jStory"><div class="jList">${list}</div>${page}</div>`;
  }

  // ------------------------------------------------------------ found!
  get isFoundOpen() { return !!this.foundOpen; }

  /**
   * A celebratory pop-up for things the player finds.
   * opts: { eyebrow, title, items: [{ icon, name, text (may contain <kbd>) }], main, later }
   * Resolves 'main' or 'later' (Esc, the Later button).
   */
  showFound({ eyebrow = '', title = 'You found something!', items = [], main = 'Wonderful!', later = null }) {
    this.foundOpen = true;
    this.setPrompt(null);
    this.el.foundEyebrow.textContent = eyebrow;
    this.el.foundTitle.textContent = title;
    this.el.foundItems.innerHTML = items.map((it) => `<div class="foundItem">
      <div class="foundIcon">${ICONS[it.icon] || ICONS.star}</div>
      <div><div class="foundName">${esc(it.name)}</div><div class="foundText">${it.text || ''}</div></div></div>`).join('');
    this.el.foundMain.textContent = main;
    this.el.foundLater.textContent = later || '';
    this.el.foundLater.classList.toggle('hidden', !later);
    this.el.foundScreen.classList.remove('hidden');
    return new Promise((resolve) => { this.foundResolve = resolve; });
  }

  closeFound(choice) {
    if (!this.foundOpen) return;
    this.foundOpen = false;
    this.el.foundScreen.classList.add('hidden');
    this.game.input?.consumeActions(); // the key that closed it shouldn't also act in the game
    const r = this.foundResolve; this.foundResolve = null;
    r?.(choice);
  }

  // ------------------------------------------------------------ story cards
  get isStoryOpen() { return !!this.storyCardsOpen; }

  /** Show the prologue or epilogue. Resolves when the player has read (or skipped) them. */
  showStoryCards(kind) {
    const cards = kind === 'epilogue' ? EPILOGUE : PROLOGUE;
    this.storyDeck = cards;
    this.storyIndex = 0;
    this.storyCardsOpen = true;
    this.setPrompt(null);
    this.el.storyCards.classList.remove('hidden');
    this.renderStoryCard();
    return new Promise((resolve) => { this.storyResolve = resolve; });
  }

  storyStep(n) {
    if (!this.storyCardsOpen) return;
    this.storyIndex += n;
    if (this.storyIndex >= this.storyDeck.length) {
      this.storyCardsOpen = false;
      this.el.storyCards.classList.add('hidden');
      this.game.input?.consumeActions(); // the key that closed the cards shouldn't also dock or search
      const r = this.storyResolve; this.storyResolve = null;
      r?.();
      return;
    }
    this.renderStoryCard();
  }

  renderStoryCard() {
    const c = this.storyDeck[this.storyIndex], vars = { captain: this.game.state.profile?.name || 'Captain' };
    this.el.storyArt.innerHTML = `<svg viewBox="0 0 320 170" aria-hidden="true">${(STORY_ART[c.art] || STORY_ART.boat)()}</svg>`;
    this.el.storyTitle.textContent = c.title ? fillVars(c.title, vars) : '';
    this.el.storyText.textContent = fillVars(c.text, vars);
    this.el.storyDots.innerHTML = this.storyDeck.map((_, i) => `<i class="${i === this.storyIndex ? 'on' : ''}"></i>`).join('');
    const last = this.storyIndex === this.storyDeck.length - 1;
    this.el.storyNext.textContent = last ? (this.storyDeck === PROLOGUE ? 'Set sail' : 'Onward') : 'Next';
    this.el.storySkip.classList.toggle('hidden', last);
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
    const list = Qs ? Qs.tracked : [];
    if (!list.length) return;
    const pinned = Qs.pinned;
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 300);
    for (const q of list) {
      const t = Qs.target(q);
      if (!t) continue;
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
      const found = u.key === 'spyglass' && lvl === 0; // the first spyglass is grandfather's, not for sale
      const btn = found ? `<button class="btn" disabled>${esc(LINES.shipwrightSpyglass)}</button>`
        : next
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
