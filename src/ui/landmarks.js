// UI part: the landmarks' pictures on the sea chart and the minimap (the Elder
// Tree, the arch, the temple, the volcano, the spire), drawn once the island
// is discovered. Each stands at `I.landmarkAt` (world.js), where the sea view
// builds it. Methods are mixed into UI (see ../ui.js), so `this` is the UI
// instance; the pictures themselves are plain functions below.
import { TAU } from './shared.js';

const INK = '#0b1830';

/**
 * One picture per `I.landmark` key, in the chart's style (flat fills, a dark
 * ink outline). Each is drawn upright in a box from -1 to 1 each way, y down,
 * with the ink already set; `lw` is the outline's width in those units. A key
 * with no picture draws nothing.
 */
const PICTURES = {
  /** The Elder Tree: a broad round canopy over a thick trunk and arching roots. */
  grove(g, lw) {
    g.beginPath();
    g.moveTo(-0.66, 0.92); g.quadraticCurveTo(-0.26, 0.82, -0.18, 0.5); g.lineTo(-0.14, 0); g.lineTo(0.14, 0);
    g.lineTo(0.18, 0.5); g.quadraticCurveTo(0.26, 0.82, 0.66, 0.92);
    g.lineTo(0.32, 0.92); g.quadraticCurveTo(0.14, 0.72, 0, 0.94); g.quadraticCurveTo(-0.14, 0.72, -0.32, 0.92); g.closePath();
    g.fillStyle = '#6e4c30'; g.fill(); g.stroke();
    blobs(g, lw, [[0, -0.36, 0.54], [-0.52, -0.2, 0.38], [0.52, -0.2, 0.38], [-0.28, -0.62, 0.36], [0.3, -0.6, 0.36]], '#45973f');
    g.fillStyle = '#73c052';
    for (const [x, y, r] of [[-0.32, -0.7, 0.18], [0.16, -0.62, 0.2], [-0.58, -0.3, 0.15], [-0.05, -0.3, 0.16]]) {
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  },

  /** The arch, its legs on the arms of the bay, its feet in the water between them. */
  arch(g, lw) {
    const shape = () => {
      g.beginPath();
      g.moveTo(-0.98, 0.62); g.lineTo(-0.94, -0.08); g.quadraticCurveTo(-0.86, -0.78, 0, -0.8); g.quadraticCurveTo(0.86, -0.78, 0.94, -0.08);
      g.lineTo(0.98, 0.62); g.lineTo(0.5, 0.62); g.lineTo(0.52, 0.04); g.quadraticCurveTo(0.46, -0.4, 0, -0.42);
      g.quadraticCurveTo(-0.46, -0.4, -0.52, 0.04); g.lineTo(-0.5, 0.62); g.closePath();
    };
    shape(); g.fillStyle = '#a39b91'; g.fill();
    g.save(); shape(); g.clip();
    g.fillStyle = '#837b73'; g.fillRect(0.74, -1, 0.4, 2); // the shaded side
    g.beginPath(); g.moveTo(-0.5, 0.62); g.lineTo(-0.52, 0.04); g.quadraticCurveTo(-0.46, -0.4, 0, -0.42);
    g.quadraticCurveTo(0.46, -0.4, 0.52, 0.04); g.lineTo(0.5, 0.62);
    g.strokeStyle = '#837b73'; g.lineWidth = 0.2; g.stroke(); // and round the opening
    g.fillStyle = '#7d9a4a'; g.fillRect(-1, -1, 2, 0.36); // turf on top
    g.restore();
    shape(); g.stroke();
    water(g, -1, 1, 0.5, 0.94);
  },

  /** A few columns under a broken pediment, with water at their feet. */
  ruins(g, lw) {
    const stone = '#ece0c2', shade = '#c9b48a';
    g.beginPath(); g.moveTo(-0.86, -0.4); g.lineTo(-0.04, -0.86); g.lineTo(0.12, -0.7); g.lineTo(0.06, -0.6); g.lineTo(0.28, -0.52); g.lineTo(0.34, -0.4); g.closePath();
    g.fillStyle = stone; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-0.9, -0.4); g.lineTo(0.38, -0.4); g.lineTo(0.3, -0.32); g.lineTo(0.42, -0.24); g.lineTo(-0.9, -0.24); g.closePath();
    g.fillStyle = shade; g.fill(); g.stroke();
    const cols = [[-0.7, -0.24], [-0.32, -0.24], [0.06, -0.24], [0.48, 0.02]]; // the last one broken off
    for (const [x, top] of cols) {
      g.beginPath();
      if (top > -0.2) { g.moveTo(x - 0.11, 0.6); g.lineTo(x - 0.11, top + 0.08); g.lineTo(x - 0.02, top); g.lineTo(x + 0.04, top + 0.1); g.lineTo(x + 0.11, top - 0.02); g.lineTo(x + 0.11, 0.6); }
      else g.rect(x - 0.11, top, 0.22, 0.84);
      g.closePath(); g.fillStyle = stone; g.fill();
      g.fillStyle = shade; g.fillRect(x + 0.03, top + 0.06, 0.08, 0.6 - top - 0.06);
      g.stroke();
    }
    water(g, -1, 1, 0.42, 0.9);
  },

  /** A cone with a glowing orange crater and a puff of smoke. */
  volcano(g, lw) {
    const glow = g.createRadialGradient(0, -0.34, 0, 0, -0.34, 0.6);
    glow.addColorStop(0, 'rgba(255,150,60,0.75)'); glow.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(0, -0.34, 0.6, 0, TAU); g.fill();
    const cone = () => { g.beginPath(); g.moveTo(-0.96, 0.84); g.lineTo(-0.32, -0.34); g.lineTo(0.32, -0.34); g.lineTo(0.96, 0.84); g.closePath(); };
    cone(); g.fillStyle = '#ab917d'; g.fill();
    g.save(); cone(); g.clip();
    g.fillStyle = '#806a5c'; g.beginPath(); g.moveTo(0.06, -0.34); g.lineTo(0.4, -0.34); g.lineTo(1, 0.9); g.lineTo(0.3, 0.9); g.closePath(); g.fill();
    g.fillStyle = '#ff7a24'; g.beginPath(); g.moveTo(-0.12, -0.34); g.lineTo(-0.02, -0.34); g.lineTo(-0.1, 0.1); g.lineTo(-0.2, 0.26); g.closePath(); g.fill(); // a lava run
    g.restore();
    cone(); g.stroke();
    g.beginPath(); g.ellipse(0, -0.34, 0.32, 0.1, 0, 0, TAU); g.fillStyle = '#ff7a24'; g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, -0.35, 0.18, 0.05, 0, 0, TAU); g.fillStyle = '#ffd54a'; g.fill();
    blobs(g, lw, [[-0.08, -0.6, 0.16], [0.16, -0.76, 0.17], [0.42, -0.86, 0.12]], '#d8d2cc');
  },

  /** A tall white needle of ice, shaded ice-blue. */
  frost(g, lw) {
    const spire = () => {
      g.beginPath(); g.moveTo(0, -1); g.lineTo(0.13, -0.32); g.lineTo(0.3, 0.02); g.lineTo(0.46, 0.84);
      g.lineTo(-0.46, 0.84); g.lineTo(-0.3, 0.14); g.lineTo(-0.13, -0.32); g.closePath();
    };
    spire(); g.fillStyle = '#f6fafc'; g.fill();
    g.save(); spire(); g.clip();
    g.fillStyle = '#9cc8e6'; g.beginPath(); g.moveTo(0, -1); g.lineTo(0.6, 0.9); g.lineTo(0.06, 0.9); g.lineTo(0.02, -0.2); g.closePath(); g.fill();
    g.fillStyle = '#cfe6f5'; g.beginPath(); g.moveTo(-0.06, -0.5); g.lineTo(-0.02, 0.3); g.lineTo(-0.22, 0.84); g.lineTo(-0.26, 0.3); g.closePath(); g.fill();
    g.restore();
    spire(); g.stroke();
  },
};

/** Round shapes filled as one, with the ink round the outside only. */
function blobs(g, lw, list, fill) {
  g.save();
  g.lineWidth = lw * 2;
  for (const [x, y, r] of list) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  g.fillStyle = fill;
  for (const [x, y, r] of list) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.restore();
}

/** A strip of sea with a wavy top, from x0 to x1 and y0 down to y1. */
function water(g, x0, x1, y0, y1) {
  const n = 4, w = (x1 - x0) / n;
  g.beginPath(); g.moveTo(x0, y0);
  for (let i = 0; i < n; i++) g.quadraticCurveTo(x0 + w * (i + 0.5), y0 - 0.1, x0 + w * (i + 1), y0);
  g.lineTo(x1, y1); g.lineTo(x0, y1); g.closePath();
  g.fillStyle = '#5aa7d6'; g.fill();
  g.beginPath(); g.moveTo(x0, y0);
  for (let i = 0; i < n; i++) g.quadraticCurveTo(x0 + w * (i + 0.5), y0 - 0.1, x0 + w * (i + 1), y0);
  g.stroke();
}

/** The picture's turn on the chart: the arch spans the bay's mouth as it does at sea, kept the right way up. */
function turnOf(I) {
  if (I.landmark !== 'arch') return 0;
  let a = -I.landmarkAt.rot; // its local x, across the mouth, on a canvas with z down
  a = Math.atan2(Math.sin(a), Math.cos(a));
  if (a > Math.PI / 2) a -= Math.PI; else if (a <= -Math.PI / 2) a += Math.PI;
  return a;
}

export class LandmarksUI {
  /**
   * Half the size of a landmark's picture on the sea chart, in canvas pixels:
   * about 22 px across whatever the zoom, growing with the island once it is
   * bigger than that, to about half the island's width.
   */
  landmarkSize(I, z, dpr) { return Math.max(11 * dpr, I.r * z * 0.45); }

  /** Where the name goes so it clears the picture: the picture's top, on the chart. */
  landmarkTop(I, Y, z, dpr) { return Y(I.landmarkAt.z) - this.landmarkSize(I, z, dpr); }

  /** The pictures on the sea chart, for every landmark you have found. */
  drawLandmarks(g, X, Y, z, dpr) {
    const found = this.game.state?.discovered;
    if (!found) return;
    const W = g.canvas.width, H = g.canvas.height;
    for (const I of this.game.world.islands) {
      const P = I.landmarkAt;
      if (!P || !found.has(I.id)) continue;
      const s = this.landmarkSize(I, z, dpr), x = X(P.x), y = Y(P.z);
      if (x + s < 0 || y + s < 0 || x - s > W || y - s > H) continue;
      this.drawLandmark(g, I, x, y, s, Math.min(Math.max(1.2, s / 7), 2.2 * dpr));
    }
  }

  /** The pictures on the minimap, `s` = a port anchor's radius, within `range` of (bx, bz). */
  drawMiniLandmarks(g, X, Y, s, bx, bz, range) {
    const found = this.game.state?.discovered;
    if (!found) return;
    for (const I of this.game.world.islands) {
      const P = I.landmarkAt;
      if (!P || !found.has(I.id) || Math.abs(P.x - bx) > range + 100 || Math.abs(P.z - bz) > range + 100) continue;
      this.drawLandmark(g, I, X(P.x), Y(P.z), s, Math.max(1.2, s / 6));
    }
  }

  /** One landmark's picture centred on (x, y), `s` pixels from the middle to the edge, outlined `lw` wide. */
  drawLandmark(g, I, x, y, s, lw) {
    const draw = PICTURES[I.landmark];
    if (!draw) return;
    g.save();
    g.translate(x, y); g.rotate(turnOf(I)); g.scale(s, s);
    g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = lw / s; g.strokeStyle = INK;
    draw(g, lw / s);
    g.restore();
  }
}
