// DOM user interface. Reads game state; calls game methods for actions.
//
// UI is one class split over several files. This file holds the core: element
// lookup, button wiring, loading/fade, the title, the HUD update, banners and
// toasts, pause and the shipwreck screen. The rest is mixed in from ui/:
//   ui/chart.js   minimap, sea chart, map markers
//   ui/port.js    port screen (shipwright, quest board, tailor), journal
//   ui/story.js   ashore panel, Found! pop-up, story cards, quest tracker, races and hails
//   ui/icons.js   SVG icons and story card art
//   ui/shared.js  esc(), fmt() and other small helpers
// Every method is called as this.method() whichever file it lives in; grep
// for the method name to find it.
import { bearingDeg, mixin } from './util.js';
import { $, PX_PER_DEG, clampN, esc, fmt } from './ui/shared.js';
import { ICONS } from './ui/icons.js';
import { ChartUI } from './ui/chart.js';
import { PortUI } from './ui/port.js';
import { StoryUI } from './ui/story.js';

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class UI {
  constructor(game) {
    this.game = game;
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon] || ''; });
    const ids = ['hud', 'goldBanked', 'goldCargo', 'rowCargo', 'hullBar', 'hullText', 'toasts', 'screenToasts', 'compass', 'compassStrip',
      'compassDeg', 'warning', 'minimap', 'clockIcon', 'clockText', 'weatherText', 'windArrow', 'windDial', 'windLabel',
      'sailGauge', 'speedText', 'prompt', 'banner', 'bannerSub', 'bannerTitle', 'btnAction', 'btnActionLabel', 'btnSpy',
      'vignette', 'damageFlash', 'fade', 'loading', 'loadingText', 'title', 'btnContinue', 'btnNew', 'titleHint',
      'portScreen', 'portName', 'portGold', 'portHull', 'btnRepair', 'upgradeGrid', 'btnSetSail', 'mapScreen', 'mapCanvas',
      'mapStats', 'pauseScreen', 'setSound', 'setMusic', 'setQuality', 'setEffects', 'controlsHelp', 'wreckScreen', 'wreckText',
      'btnRespawn', 'confirm', 'confirmText', 'confirmYes', 'confirmNo', 'portTabs', 'paneShipwright', 'paneTailor',
      'tailorGrid', 'btnWardrobe', 'creatorScreen', 'questTracker', 'qtTitle', 'qtArrow', 'qtLabel', 'qtDist', 'compassQuest',
      'btnJournal', 'paneQuests', 'questCount', 'questOffers', 'questBadge', 'journalScreen', 'journalBody', 'journalClose',
      'journalTabs', 'journalTitle', 'storyCards', 'storyArt', 'storyTitle', 'storyText', 'storyDots', 'storySkip', 'storyNext',
      'foundScreen', 'foundEyebrow', 'foundTitle', 'foundItems', 'foundMain', 'foundLater',
      'ashorePanel', 'apName', 'apGold', 'apLeft',
      'racePanel', 'rpTitle', 'rpLine', 'countdown', 'hail', 'hailName', 'hailText', 'rivalNotes', 'sailDye', 'btnSailDye'];
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
    this.on('btnReturnShip', () => { g.setPaused?.(false); g.ashore?.leave(); });
    this.on('setSound', () => { g.setSetting?.('sound', !g.settings?.sound); this.refreshSettings(); });
    this.on('setMusic', () => { g.setSetting?.('music', !g.settings?.music); this.refreshSettings(); });
    this.on('setEffects', () => { if (g.settings?.quality === 'low') return; g.setSetting?.('effects', g.settings?.effects === false); this.refreshSettings(); });
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
    this.on('btnSailDye', () => { g.rival?.toggleDye(); this.refreshPort(); });
    this.el.rivalNotes?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-rematch]');
      if (!b) return;
      this.click();
      g.rival?.rematch(b.dataset.rematch);
    });
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
      const b = e.target.closest('button[data-pin], button[data-abandon], button[data-ghostlog]');
      if (!b) return;
      this.click();
      if (b.dataset.ghostlog) { this.closeJournal(); g.seaEvents?.chain.read(); return; }
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
        if (e.target.closest('button[data-refit]:not([disabled])')) { this.click(); g.refits.fit(); return; }
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
    const sea = [
      ['<kbd>W</kbd><kbd>S</kbd> / <kbd>&uarr;</kbd><kbd>&darr;</kbd>', 'Raise / lower sail', 'Sail buttons ▲ ▼'],
      ['<kbd>A</kbd><kbd>D</kbd> / <kbd>&larr;</kbd><kbd>&rarr;</kbd>', 'Steer', 'Drag the tiller'],
      ['<kbd>E</kbd> / <kbd>Space</kbd>', 'Dock, haul treasure, go ashore', 'Gold action button'],
      ['Hold <kbd>Z</kbd>', 'Spyglass (once found)', 'Spyglass button'],
    ];
    const foot = [
      ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows', 'Walk', 'Joystick'],
      ['Hold <kbd>Shift</kbd>', 'Run', 'Push the joystick to its edge'],
      ['<kbd>Space</kbd>', 'Jump (hold for higher)', 'Jump button ▲'],
      ['<kbd>E</kbd>', 'Open chests, row back to the ship', 'Gold action button'],
    ];
    const both = [
      ['Drag &middot; Wheel', 'Look around &middot; Zoom', 'Drag &middot; Pinch'],
      ['<kbd>M</kbd>', 'Sea chart', 'Map button'],
      ['<kbd>J</kbd>', 'Journal &amp; quests', 'Journal button'],
      ['<kbd>Esc</kbd>', 'Pause', 'Pause button'],
    ];
    const rows = (list) => list.map(([k, what, t]) => `<div class="k">${this.touch ? t : k}</div><div>${what}</div>`).join('');
    const group = (title, list) => `<div class="ctlSub">${title}</div>${rows(list)}`;
    // the section you're using right now comes first
    const ashore = document.body.classList.contains('ashore');
    el.innerHTML = ashore
      ? group('On foot', foot) + group('Sailing', sea) + group('Anywhere', both)
      : group('Sailing', sea) + group('On foot', foot) + group('Anywhere', both);
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
      // compass: the ship's heading at sea, the way the camera faces on foot
      const cam = mode === 'ashore' ? g.ashore?.cam : null;
      const bearing = bearingDeg(cam ? cam.yaw : b.heading);
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
    // the HUD sits under menus (port, pause...), so toasts go above them while one is open
    const onScreen = document.querySelector('.screen:not(.hidden)');
    const box = onScreen ? this.el.screenToasts : this.el.toasts;
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
    const fxOn = s.quality !== 'low' && s.effects !== false;
    set(this.el.setEffects, fxOn, `Effects: ${fxOn ? 'On' : 'Off'}`);
    if (this.el.setEffects) this.el.setEffects.disabled = s.quality === 'low';
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

mixin(UI, ChartUI, PortUI, StoryUI);
