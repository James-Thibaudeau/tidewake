// The moving parts of a cold island: the ice on a frozen moat (all the way
// round) and on the meadow's pond, the pennants that show what the wind is
// doing (one by each gust, hanging in the lull, stirring as a warning and
// streaming while it blows; one on the summit's cairn), the streaks of snow a
// gust carries through its box, and the snow drifting down round you.
// levelgen.js builds it for a level with `snow`; the gusts' rules are
// hazards.js, passed in each frame (the gallery has none, so there they keep
// their own time).
import * as THREE from 'three';
import { propMaterial, thinOutline, merge } from '../props.js';
import { toonMaterial, toonGradient } from '../toon.js';
import { mulberry32, TAU, clamp } from '../util.js';
import { ASHORE } from '../config.js';
import { gustNow } from './hazards.js';
import { toWorld } from './stairs.js';
import { poleParts, cairnParts } from './cold-art.js';

const TILE = 6;                 // metres of ice one repeat of its texture covers
const POLE = 2.7, FLAG = 0.95;  // a pennant's pole and its length (m)
const SEGS = 6;                 // strips along a pennant
const BOX = { w: 26, h: 13 };   // the box of air round you that the snow falls through

/** The ice's look: pale blue, scored white where things have slid, a few dark cracks. Tiles. */
function iceTexture(seed) {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#c9ebf7'; g.fillRect(0, 0, S, S);
  // soft patches of thicker, whiter ice
  for (let i = 0; i < 14; i++) {
    const x = rng() * S, y = rng() * S, r = 18 + rng() * 34;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(240, 250, 255, 0.55)'); grad.addColorStop(1, 'rgba(240, 250, 255, 0)');
      g.fillStyle = grad; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const line = (pts, style, width) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy)));
      g.strokeStyle = style; g.lineWidth = width; g.stroke();
    }
  };
  // cracks: a few wandering dark lines, each with a white edge
  for (let i = 0; i < 5; i++) {
    let x = rng() * S, y = rng() * S, a = rng() * TAU;
    const pts = [[x, y]];
    for (let k = 0; k < 7; k++) { a += (rng() - 0.5) * 1.3; x += Math.cos(a) * (14 + rng() * 16); y += Math.sin(a) * (14 + rng() * 16); pts.push([x, y]); }
    line(pts, 'rgba(255, 255, 255, 0.7)', 3);
    line(pts, 'rgba(92, 158, 196, 0.85)', 1.2);
  }
  // score marks
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, a = rng() * TAU, l = 8 + rng() * 26;
    line([[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 'rgba(255, 255, 255, 0.6)', 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A ring of ice over the moat at height y, wide enough that its edges run in under the banks. */
function moatIce(T, y) {
  const SEG = 168, ROWS = 4, pos = [], uv = [], idx = [];
  for (let j = 0; j <= SEG; j++) {
    const a = (j / SEG) * TAU, rm = T.Rm(a), w = T.mw(a) + 1.25;
    for (let i = 0; i < ROWS; i++) {
      const r = rm - w + (2 * w * i) / (ROWS - 1);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push((Math.cos(a) * r) / TILE, (Math.sin(a) * r) / TILE);
    }
  }
  for (let j = 0; j < SEG; j++) for (let i = 0; i < ROWS - 1; i++) {
    const a = j * ROWS + i, b = a + ROWS;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return flat(pos, uv, idx);
}

/** A pond's ice (a disc) and the rim of snow round it (a ring, in `rim`). */
function pondIce(P, rim) {
  const SEG = 28, pos = [P.x, P.y + 0.03, P.z], uv = [P.x / TILE, P.z / TILE], idx = [];
  for (let j = 0; j <= SEG; j++) {
    const a = (j / SEG) * TAU, c = Math.cos(a), s = Math.sin(a), wob = 1 + 0.05 * Math.sin(a * 5 + P.x);
    pos.push(P.x + c * P.r * wob, P.y + 0.03, P.z + s * P.r * wob);
    uv.push((P.x + c * P.r) / TILE, (P.z + s * P.r) / TILE);
    if (j) idx.push(0, j + 1, j);
    const base = rim.pos.length / 3;
    rim.pos.push(P.x + c * P.r * wob * 0.97, P.y + 0.045, P.z + s * P.r * wob * 0.97, P.x + c * (P.r * wob + 0.4), P.y + 0.07, P.z + s * (P.r * wob + 0.4));
    if (j) rim.idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
  }
  return flat(pos, uv, idx);
}

function flat(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Build the moving parts for layout L. Returns { group, update(dt, t,
 * hazards, ctx), dispose() }. ctx.pos: where you are (the snow falls round
 * it); ctx.night: 0-1.
 */
export function buildColdLife(L, quality) {
  const group = new THREE.Group(), own = [], low = quality === 'low', T = L.T;
  group.name = 'cold';
  const rng = mulberry32(((T.Rt * 613) | 0) + 7);

  // ---- ice: the frozen moat and the pond
  const tex = iceTexture((T.Sm * 1000) | 0);
  const iceMat = toonMaterial({ map: tex, gradientMap: toonGradient(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  own.push(tex, iceMat);
  const sheet = L.pieces.find((p) => p.kind === 'sheet');
  const ices = [];
  if (L.frozen && sheet) ices.push(moatIce(T, sheet.top));
  const rim = { pos: [], idx: [] };
  for (const P of L.ponds || []) ices.push(pondIce(P, rim));
  for (const g of ices) { const m = new THREE.Mesh(g, iceMat); m.name = 'ice'; group.add(m); own.push(g); }
  if (rim.pos.length) {
    const g = flat(rim.pos, null, rim.idx), mat = toonMaterial({ color: '#f4f8ff', gradientMap: toonGradient() });
    group.add(new THREE.Mesh(g, mat));
    own.push(g, mat);
  }

  // ---- pennants: one by each gust (on the rest you wait on, at the corner
  // nearest the hop; by a walk, beside the path) and one on the cairn
  const flags = [], fixed = [];
  const byId = Object.fromEntries(L.pieces.map((p) => [p.id, p]));
  (L.gusts || []).forEach((g, i) => {
    const v = byId[g.from];
    let x, y, z;
    if (v) {
      const rx = g.x - v.cx, rz = g.z - v.cz, lx = rx * Math.cos(v.rot) - rz * Math.sin(v.rot);
      const [wx, wz] = toWorld(Math.sign(lx) * (v.hx - 0.18), -(v.hz - 0.18), v.rot);
      x = v.cx + wx; y = v.top; z = v.cz + wz;
    } else {
      // beside the walk, on the side nearer the middle of the island
      const s = (g.x * g.dz - g.z * g.dx) > 0 ? -1 : 1;
      x = g.x + g.dz * s * 2.3; z = g.z - g.dx * s * 2.3; y = T.groundAt(x, z);
    }
    fixed.push(...poleParts(x, y, z, POLE));
    flags.push({ gust: i, x, y: y + POLE - 0.05, z, dx: g.dx, dz: g.dz, len: FLAG, seed: i * 1.7 });
  });
  if (L.cairn) {
    const c = L.cairn;
    fixed.push(...cairnParts(c), ...poleParts(c.x, c.y + 0.7, c.z, 1.5));
    flags.push({ gust: -1, x: c.x, y: c.y + 2.15, z: c.z, dx: 0.8, dz: 0.6, len: 0.7, seed: 9 });
  }
  if (fixed.length) {
    const g = merge(fixed);
    for (const f of fixed) f.dispose();
    group.add(new THREE.Mesh(g, propMaterial), new THREE.Mesh(g, thinOutline));
    own.push(g);
  }
  const flagMat = toonMaterial({ color: '#d8433a', side: THREE.DoubleSide, gradientMap: toonGradient() });
  own.push(flagMat);
  for (const f of flags) {
    const idx = [];
    for (let i = 0; i < SEGS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((SEGS + 1) * 6), 3));
    g.setIndex(idx);
    f.mesh = new THREE.Mesh(g, flagMat);
    f.mesh.frustumCulled = false;
    f.mesh.name = 'pennant';
    group.add(f.mesh);
    own.push(g);
  }
  /** Lay a pennant out: `blow` 0 (hanging) to 1 (streaming along the wind), with a ripple down its length. */
  const fly = (f, blow, t) => {
    const p = f.mesh.geometry.attributes.position, lean = 0.22 + 1.28 * blow; // angle from straight down
    const rate = 3 + 13 * blow, amp = 0.025 + 0.06 * blow;
    for (let i = 0; i <= SEGS; i++) {
      const s = i / SEGS, out = Math.sin(lean) * s * f.len, down = Math.cos(lean) * s * f.len;
      const rip = Math.sin(t * rate - s * 5 + f.seed) * amp * s, bob = Math.sin(t * rate * 0.7 - s * 4 + f.seed) * amp * s * 0.6;
      const x = f.x + f.dx * out + f.dz * rip, z = f.z + f.dz * out - f.dx * rip, y = f.y - down + bob;
      const half = 0.17 * (1 - s * 0.85);
      p.setXYZ(i * 2, x, y + half, z);
      p.setXYZ(i * 2 + 1, x, y - half, z);
    }
    p.needsUpdate = true;
    f.mesh.geometry.computeVertexNormals();
  };

  // ---- the snow a gust carries: streaks through its box, along the wind
  const gusts = L.gusts || [], perGust = low ? 8 : 16;
  const streakGeo = new THREE.BoxGeometry(0.7, 0.03, 0.03);
  const streakMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, Math.max(1, gusts.length * perGust));
  streaks.frustumCulled = false;
  streaks.name = 'gust';
  group.add(streaks);
  own.push(streakGeo, streakMat);
  const streak = gusts.map(() => Array.from({ length: perGust }, () => ({ u: rng(), side: rng() * 2 - 1, h: 0.15 + rng() * 2.6, speed: 0.75 + rng() * 0.5 })));

  // ---- snow in the air, drifting down round you
  const nFlakes = low ? 90 : 220;
  const flakes = Array.from({ length: nFlakes }, () => ({ x: rng() * BOX.w, y: rng() * BOX.h, z: rng() * BOX.w, fall: 0.7 + rng() * 0.7, sway: rng() * TAU }));
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nFlakes * 3), 3));
  const flakeMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
  const snow = new THREE.Points(flakeGeo, flakeMat);
  snow.frustumCulled = false;
  snow.name = 'snowfall';
  group.add(snow);
  own.push(flakeGeo, flakeMat);
  const wrap = (v, c, size) => ((((v - c) % size) + size) % size) - size / 2 + c;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const now = {}, blowing = gusts.map(() => 0); // how hard each gust's pennant flies (0-1)

  function update(dt, t, hz, ctx) {
    // ---- gusts: the pennants and the streaks
    let n = 0;
    gusts.forEach((g, gi) => {
      const st = hz?.gusts[gi] || gustNow(ASHORE, t, g.phase, now);
      blowing[gi] = st.state === 'blow' ? Math.max(0.6, st.k) : st.stir * 0.45;
      const reach = g.along + 1.6, show = st.state === 'blow' ? st.k : st.stir * 0.35;
      q.setFromAxisAngle(up, -Math.atan2(g.dz, g.dx));
      streak[gi].forEach((k, i) => {
        const along = ((t * k.speed * 0.9 + k.u) % 1) * 2 * reach - reach, across = k.side * g.across * 0.85;
        const fade = show * clamp((reach - Math.abs(along)) / 1.2, 0, 1) * (st.state === 'blow' || i % 3 === 0 ? 1 : 0);
        v.set(g.x + g.dx * along + g.dz * across, g.y + k.h + Math.sin(t * 3 + i) * 0.08, g.z + g.dz * along - g.dx * across);
        streaks.setMatrixAt(n++, m.compose(v, q, s.set(Math.max(0.001, fade * (0.7 + k.speed * 0.5)), fade || 0.001, fade || 0.001)));
      });
    });
    streaks.count = n;
    streaks.instanceMatrix.needsUpdate = true;
    for (const f of flags) fly(f, f.gust < 0 ? 0.5 + 0.2 * Math.sin(t * 0.4) : blowing[f.gust], t);
    // ---- the snow in the air
    const c = ctx?.pos, cx = c ? c.x : 0, cy = c ? c.y + 3.5 : T.summit, cz = c ? c.z : 0, p = flakeGeo.attributes.position;
    flakes.forEach((f, i) => {
      p.setXYZ(i, wrap(f.x + t * 0.5 + Math.sin(t * 0.6 + f.sway) * 0.4, cx, BOX.w), wrap(f.y - t * f.fall, cy, BOX.h), wrap(f.z + t * 0.25 + Math.cos(t * 0.5 + f.sway) * 0.4, cz, BOX.w));
    });
    p.needsUpdate = true;
    flakeMat.opacity = 0.9 - 0.45 * (ctx?.night || 0);
  }
  update(0, 0, null, null);

  return {
    group, update,
    dispose() { for (const o of own) o.dispose(); streaks.dispose(); },
  };
}
