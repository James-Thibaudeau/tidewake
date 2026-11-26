// UI part: rough water on the sea chart. Once you have charted part of a rough zone
// (sea-zones.js), the chart hatches what you have seen of it and writes its name there.
// Nothing new is saved: it is drawn from the fog-of-war cells already charted.
// Methods are mixed into UI (see ../ui.js), so `this` is the UI instance.
import { MAP_RES, MAP_CELL, WORLD_HALF } from '../config.js';
import { SEA_ZONES, seaAt } from '../sea-zones.js';
import { SEAS } from '../story-text.js';

const NAMED = 12;   // charted cells of a zone's worst water before its name is written
const HATCH = 7;    // pixels between the hatching's lines

/** The rough water in every chart cell, worked out once: how strong, and which zone's. */
function roughCells() {
  const k = new Float32Array(MAP_RES * MAP_RES), zone = new Int8Array(MAP_RES * MAP_RES).fill(-1), S = {};
  for (let cz = 0; cz < MAP_RES; cz++) for (let cx = 0; cx < MAP_RES; cx++) {
    seaAt((cx + 0.5) * MAP_CELL - WORLD_HALF, (cz + 0.5) * MAP_CELL - WORLD_HALF, S);
    if (!S.rough) continue;
    k[cz * MAP_RES + cx] = S.rough * (0.55 + 0.15 * S.severity);
    zone[cz * MAP_RES + cx] = SEA_ZONES.findIndex((Z) => Z.id === S.roughZone);
  }
  return { k, zone };
}

export class SeasUI {
  /** What of the rough water has been charted: a mask for the hatching, and where each name goes. */
  buildSeas() {
    const rev = this.game.state?.revealed;
    const C = (this.seaCells ||= roughCells());
    if (!this.seaMask) {
      this.seaMask = document.createElement('canvas');
      this.seaMask.width = this.seaMask.height = MAP_RES;
      this.seaMaskCtx = this.seaMask.getContext('2d');
      this.seaMaskImg = this.seaMaskCtx.createImageData(MAP_RES, MAP_RES);
    }
    const d = this.seaMaskImg.data;
    // charted cells of each zone's worst water, and where they lie on average: a ring's
    // from its centre, the edge band's along each of its four sides
    const sums = new Map();
    for (let cz = 0; cz < MAP_RES; cz++) for (let cx = 0; cx < MAP_RES; cx++) {
      const i = cz * MAP_RES + cx, seen = C.zone[i] >= 0 && (!rev || rev[i] > 0);
      d[i * 4 + 3] = seen ? Math.min(255, Math.round(C.k[i] * 255)) : 0;
      if (!seen || C.k[i] < 0.5) continue;
      const Z = SEA_ZONES[C.zone[i]], x = (cx + 0.5) * MAP_CELL - WORLD_HALF, z = (cz + 0.5) * MAP_CELL - WORLD_HALF;
      const side = !Z.edge ? '' : Math.abs(x) > Math.abs(z) ? (x > 0 ? 'E' : 'W') : (z > 0 ? 'S' : 'N');
      const key = Z.id + side;
      const s = sums.get(key) || { Z, side, n: 0, x: 0, z: 0, along: [] };
      s.n++; s.x += x; s.z += z;
      if (side) s.along.push(side === 'E' || side === 'W' ? z : x);
      sums.set(key, s);
    }
    this.seaMaskCtx.putImageData(this.seaMaskImg, 0, 0);
    this.seaLabels = [];
    for (const { Z, side, n, x, z, along } of sums.values()) {
      if (n < NAMED) continue;
      const mx = x / n, mz = z / n, mid = (Z.inner + Z.outer) / 2;
      if (Z.edge) {
        // along the side, on water you have charted (the nearest to the middle of what you've
        // seen of that side, which may be in two pieces); upright on the east and west sides
        const at = Z.inner + 150, across = side === 'E' || side === 'W', mean = across ? mz : mx;
        const on = along.reduce((best, v) => (Math.abs(v - mean) < Math.abs(best - mean) ? v : best), along[0]);
        this.seaLabels.push({ text: SEAS[Z.id], x: across ? Math.sign(mx) * at : on, z: across ? on : Math.sign(mz) * at, rot: side === 'E' ? Math.PI / 2 : side === 'W' ? -Math.PI / 2 : 0 });
      } else {
        // on the band, on the side you charted (all of it: the side facing Port Haven)
        let dx = mx - Z.x, dz = mz - Z.z;
        if (Math.hypot(dx, dz) < 150) { dx = -Z.x; dz = -Z.z; }
        const l = Math.hypot(dx, dz) || 1;
        this.seaLabels.push({ text: SEAS[Z.id], x: Z.x + (dx / l) * mid, z: Z.z + (dz / l) * mid, rot: 0 });
      }
    }
  }

  /** The hatching, under the islands and the fog. X/Y project world → canvas; `z` is pixels a metre. */
  drawSeaHatch(g, X, Y, z, dpr) {
    if (!this.seaMask || !this.seaLabels) return;
    const W = g.canvas.width, H = g.canvas.height;
    const sc = (this.seaScratch ||= document.createElement('canvas'));
    if (sc.width !== W || sc.height !== H) { sc.width = W; sc.height = H; }
    const s = sc.getContext('2d');
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, W, H);
    s.imageSmoothingEnabled = true;
    s.drawImage(this.seaMask, X(-WORLD_HALF), Y(-WORLD_HALF), WORLD_HALF * 2 * z, WORLD_HALF * 2 * z);
    // keep the mask's shape, fill it with slanting lines that stay put on the chart as it is dragged
    s.globalCompositeOperation = 'source-in';
    const step = HATCH * dpr;
    if (!this.seaHatch || this.seaHatchStep !== step) {
      const p = document.createElement('canvas');
      p.width = p.height = Math.round(step);
      const c = p.getContext('2d');
      c.strokeStyle = '#27496b'; c.lineWidth = 1.3 * dpr; c.lineCap = 'square';
      c.beginPath();
      for (const o of [-p.width, 0, p.width]) { c.moveTo(o, p.height); c.lineTo(o + p.width, 0); }
      c.stroke();
      this.seaHatch = s.createPattern(p, 'repeat');
      this.seaHatchStep = step;
    }
    const period = Math.round(step), ox = ((X(0) % period) + period) % period, oy = ((Y(0) % period) + period) % period;
    s.translate(ox, oy);
    s.fillStyle = this.seaHatch;
    s.fillRect(-period, -period, W + period * 2, H + period * 2);
    g.save();
    g.globalAlpha = 0.8;
    g.drawImage(sc, 0, 0);
    g.restore();
  }

  /** The zones' names, over the fog. The caller has set the label font's size. */
  drawSeaNames(g, X, Y, dpr) {
    if (!this.seaLabels?.length) return;
    g.save();
    g.font = g.font.replace(/^600/, 'italic 600');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(255,248,231,0.9)'; g.lineJoin = 'round';
    g.fillStyle = '#1f3d5c';
    for (const L of this.seaLabels) {
      g.save();
      g.translate(X(L.x), Y(L.z));
      g.rotate(L.rot);
      g.strokeText(L.text, 0, 0);
      g.fillText(L.text, 0, 0);
      g.restore();
    }
    g.restore();
  }
}
