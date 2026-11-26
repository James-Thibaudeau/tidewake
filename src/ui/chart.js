// UI part: the minimap, the full-screen sea chart, and the markers drawn on
// both (fog of war, islands, quests, the Redwing). Methods are mixed into UI
// (see ../ui.js), so `this` is the UI instance. Rough water's hatching and
// names on the chart are chart-seas.js; the landmarks' pictures, landmarks.js.
import { MAP_RES, MAP_CELL, WORLD_HALF } from '../config.js';
import { bearingDeg } from '../util.js';
import { $, TAU, clampN } from './shared.js';

const MINI_RANGE = 900; // world units from the boat to the minimap rim

export class ChartUI {
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
    // rough water you have charted, hatched as on the chart (chart-seas.js)
    this.drawMiniSeas(g, X, Y, k, Math.min(window.devicePixelRatio || 1, 2), bx, bz, MINI_RANGE);

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
    this.drawMiniLandmarks(g, X, Y, Math.max(5, Sz / 22), bx, bz, MINI_RANGE); // the ones you have found (landmarks.js)
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
    this.drawRivalMarkers(g, X, Y, k, Math.max(5, Sz / 22), false);
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
    this.buildSeas(); // what you've charted of the rough water changes with the fog
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
    // rough water you have charted, hatched (chart-seas.js)
    this.drawSeaHatch(g, X, Y, z, dpr);

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
    // the landmarks you have found, over the fog (landmarks.js)
    this.drawLandmarks(g, X, Y, z, dpr);

    // labels, treasures, ports
    const fs = Math.round(clampN(11 + m.zoom * 18, 11, 17) * dpr);
    g.font = `600 ${fs}px Fredoka, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    const pulse = 0.6 + 0.4 * Math.sin(now / 260);
    this.drawSeaNames(g, X, Y, dpr);
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
        let ty = sy - I.r * 0.9 * z - 4 * dpr;
        if (I.landmarkAt) ty = Math.min(ty, this.landmarkTop(I, Y, z, dpr) - 3 * dpr); // above its picture
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
    this.drawRivalMarkers(g, X, Y, z, 9 * dpr, true);
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

  /** Sable on the maps: the Redwing, race buoys and the Deep. */
  drawRivalMarkers(g, X, Y, scale, s, labels) {
    const marks = this.game.rival?.markers() || [];
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 220);
    for (const m of marks) {
      const x = X(m.x), y = Y(m.z);
      g.save();
      g.lineJoin = 'round'; g.strokeStyle = '#0b1830'; g.lineWidth = Math.max(1.2, s / 6);
      if (m.kind === 'deep') {
        g.beginPath(); g.arc(x, y, m.r * scale, 0, TAU);
        g.fillStyle = 'rgba(20,24,70,0.35)'; g.fill();
        g.setLineDash([s * 0.6, s * 0.5]); g.strokeStyle = 'rgba(40,30,90,0.8)'; g.stroke(); g.setLineDash([]);
        if (labels) {
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = s * 0.45; g.strokeStyle = 'rgba(255,248,231,0.9)'; g.strokeText(m.name, x, y);
          g.fillStyle = '#2a1e5a'; g.fillText(m.name, x, y);
        }
      } else if (m.kind === 'gate') {
        g.beginPath(); g.arc(x, y, s * (m.next ? 0.75 : 0.5), 0, TAU);
        g.fillStyle = m.next ? `rgba(255,213,74,${pulse})` : '#fff8e7'; g.fill(); g.stroke();
      } else {
        // a little crimson sail
        g.translate(x, y);
        g.beginPath(); g.moveTo(-s * 0.1, -s * 1.1); g.lineTo(s * 0.9, s * 0.45); g.lineTo(-s * 0.1, s * 0.45); g.closePath();
        g.fillStyle = '#e8413a'; g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-s * 0.9, s * 0.6); g.lineTo(s * 0.95, s * 0.6); g.lineTo(s * 0.6, s * 1.05); g.lineTo(-s * 0.6, s * 1.05); g.closePath();
        g.fillStyle = '#221c26'; g.fill(); g.stroke();
      }
      g.restore();
    }
  }
}
