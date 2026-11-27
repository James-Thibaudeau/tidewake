// Boat part: the paint yard's painted marks. The sail emblems (star, wave,
// anchor, crab, owl; the compass rose is drawEmblem in parts.js) drawn into
// the mainsail's canvas, and the flag cloths (chequered, banded, swallowtail)
// as textures. Plain canvas drawing: no materials or meshes here.
import * as THREE from 'three';

// An emblem's colours: dark on pale cloth, cream and gold on a dark one.
const INK = { pale: { ink: '#24324f', accent: '#c8433a', light: '#f3e7c9', gold: '#e0a92e' },
  dark: { ink: '#f3e7c9', accent: '#ffcf4a', light: '#24324f', gold: '#ffcf4a' } };

const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); };

// Each emblem draws itself in a box from -1 to 1 (y down), centred on the
// mark's place on the sail; sailTexture squashes the box to the sail's taper.
const EMBLEMS = {
  star(g, c) {
    const star = (R, r) => {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, L = k % 2 ? r : R;
        g.lineTo(Math.cos(a) * L, Math.sin(a) * L);
      }
      g.closePath();
    };
    star(1, 0.42); g.fillStyle = c.ink; g.fill();
    star(0.6, 0.25); g.fillStyle = c.accent; g.fill();
  },
  wave(g, c) {
    // a curling crest over two rolling swells, with spray
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.fillStyle = c.ink;
    g.beginPath();
    g.moveTo(-1, 0.55);
    g.bezierCurveTo(-0.7, 0.2, -0.5, -0.75, 0.1, -0.8);
    g.bezierCurveTo(0.65, -0.82, 0.85, -0.35, 0.55, -0.12);
    g.bezierCurveTo(0.4, -0.38, 0.05, -0.4, 0.05, -0.05);
    g.bezierCurveTo(0.05, 0.25, 0.5, 0.35, 1, 0.2);
    g.lineTo(1, 0.55);
    g.closePath(); g.fill();
    g.strokeStyle = c.accent; g.lineWidth = 0.1;
    for (const y of [0.72, 0.92]) {
      g.beginPath();
      for (let x = -1; x <= 1.001; x += 0.05) g.lineTo(x, y + Math.sin(x * 6) * 0.05);
      g.stroke();
    }
    g.fillStyle = c.ink;
    for (const [x, y, r] of [[0.72, -0.5, 0.07], [0.86, -0.32, 0.05], [0.9, -0.6, 0.04]]) { circle(g, x, y, r); g.fill(); }
  },
  anchor(g, c) {
    g.strokeStyle = c.ink; g.lineCap = 'round'; g.lineWidth = 0.17;
    circle(g, 0, -0.78, 0.16); g.stroke();                       // the ring
    g.beginPath(); g.moveTo(0, -0.6); g.lineTo(0, 0.82); g.stroke(); // the shank
    g.beginPath(); g.moveTo(-0.45, -0.38); g.lineTo(0.45, -0.38); g.stroke(); // the stock
    g.beginPath(); g.arc(0, 0.2, 0.7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); // the arms
    g.fillStyle = c.ink;
    for (const s of [-1, 1]) {                                     // the flukes
      const a = s < 0 ? 0.85 * Math.PI : 0.15 * Math.PI, x = Math.cos(a) * 0.7, y = 0.2 + Math.sin(a) * 0.7;
      g.beginPath(); g.moveTo(x - s * 0.02, y - 0.3); g.lineTo(x + s * 0.2, y + 0.06); g.lineTo(x - s * 0.22, y + 0.02); g.fill();
    }
    g.fillStyle = c.accent; circle(g, 0, -0.38, 0.1); g.fill();
  },
  crab(g, c) {
    g.lineCap = 'round';
    g.strokeStyle = c.accent; g.lineWidth = 0.09;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {                                 // legs
        g.beginPath(); g.moveTo(s * 0.4, 0.15 + k * 0.14); g.lineTo(s * 0.8, 0.25 + k * 0.2); g.lineTo(s * 0.92, 0.5 + k * 0.18); g.stroke();
      }
      g.lineWidth = 0.12;                                           // arms up to the claws
      g.beginPath(); g.moveTo(s * 0.35, -0.05); g.lineTo(s * 0.62, -0.35); g.stroke();
      g.lineWidth = 0.09;
      g.fillStyle = c.accent;
      g.beginPath(); g.ellipse(s * 0.68, -0.6, 0.24, 0.3, s * 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = c.light;                                        // the nip in each claw
      g.beginPath(); g.moveTo(s * 0.68, -0.6); g.lineTo(s * 0.62, -0.95); g.lineTo(s * 0.86, -0.85); g.fill();
    }
    g.fillStyle = c.accent;
    g.beginPath(); g.ellipse(0, 0.12, 0.55, 0.38, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = c.ink; g.lineWidth = 0.07; g.stroke();
    for (const s of [-1, 1]) {                                      // eyes on stalks
      g.beginPath(); g.moveTo(s * 0.14, -0.2); g.lineTo(s * 0.2, -0.38); g.stroke();
      g.fillStyle = c.ink; circle(g, s * 0.2, -0.42, 0.08); g.fill();
    }
  },
  owl(g, c) {
    g.fillStyle = c.ink;
    g.beginPath(); g.ellipse(0, 0.12, 0.66, 0.86, 0, 0, Math.PI * 2); g.fill();     // body
    for (const s of [-1, 1]) {                                                       // ear tufts
      g.beginPath(); g.moveTo(s * 0.18, -0.6); g.lineTo(s * 0.55, -0.98); g.lineTo(s * 0.6, -0.45); g.fill();
    }
    for (const s of [-1, 1]) {                                                       // the eyes
      g.fillStyle = c.light; circle(g, s * 0.27, -0.24, 0.25); g.fill();
      g.fillStyle = c.gold; circle(g, s * 0.27, -0.24, 0.15); g.fill();
      g.fillStyle = c.ink; circle(g, s * 0.27, -0.24, 0.07); g.fill();
    }
    g.fillStyle = c.gold;                                                            // beak
    g.beginPath(); g.moveTo(-0.08, -0.06); g.lineTo(0.08, -0.06); g.lineTo(0, 0.12); g.fill();
    g.strokeStyle = c.light; g.lineWidth = 0.06; g.lineCap = 'round';                // breast feathers
    for (const [x, y] of [[-0.22, 0.35], [0.22, 0.35], [0, 0.5], [-0.22, 0.65], [0.22, 0.65]]) {
      g.beginPath(); g.arc(x, y, 0.1, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }
  },
};

/** The emblem ids this file draws ('compass' and Sable's 'wing' are drawn in parts.js). */
export const MARK_IDS = Object.keys(EMBLEMS);

/**
 * Draw an emblem in the canvas's current transform (a box from -1 to 1).
 * dark: the cloth is too dark for dark ink. Returns false for an id it doesn't know.
 */
export function drawMark(g, id, dark) {
  const draw = EMBLEMS[id];
  if (!draw) return false;
  g.save();
  draw(g, dark ? INK.dark : INK.pale);
  g.restore();
  return true;
}

// ------------------------------------------------------------------ flags
const flagCache = {};
/**
 * A flag's cloth: { color, color2, pattern: 'chequer' | 'band', shape: 'swallow' }.
 * u runs from the mast (0) to the fly (1). A swallowtail's fork is cut out,
 * so its material needs alphaTest.
 */
export function flagTexture(look) {
  const key = [look.color, look.color2, look.pattern, look.shape].join('|');
  if (flagCache[key]) return flagCache[key];
  const c = document.createElement('canvas');
  const W = c.width = 128, H = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = look.color; g.fillRect(0, 0, W, H);
  if (look.pattern === 'chequer') {
    const n = 8, m = 4;
    g.fillStyle = look.color2;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if ((i + j) % 2) g.fillRect((i * W) / n, (j * H) / m, W / n + 0.5, H / m + 0.5);
  }
  if (look.pattern === 'band') { g.fillStyle = look.color2; g.fillRect(0, H * 0.36, W, H * 0.28); }
  if (look.shape === 'swallow') {
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(W * 0.68, H / 2); g.lineTo(W + 1, -1); g.lineTo(W + 1, H + 1); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (flagCache[key] = t);
}
