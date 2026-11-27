// The moving parts of a volcanic island: the lava in the moat (a slow,
// flowing crust over glowing rock, with bubbles that swell and pop), veins
// of lava glowing in the cracks of the rock (decoration: they don't burn), the
// steam from the vents (wisps while they rest, a column when one throws you
// up) and the crumbling basalt (drawn piece by piece so it can shake, fall
// into the lava or down the face, and come back). levelgen.js builds it for a
// level with `lava`; the rules it shows are hazards.js, passed in each frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial, thinOutline } from '../props.js';
import { toonMaterial } from '../toon.js';
import { mulberry32, TAU, clamp } from '../util.js';
import { pieceParts } from './pieces.js';
import { emberParts } from './volcanic-art.js';

const LAVA_Y = 0.1;      // the lava's surface (the splash that sends you back is under it)
const TILE = 7;          // metres of lava one repeat of its texture covers
const BURST = 1.4;       // seconds a vent's column of steam lasts
const WISPS = 3, PUFFS = 10;

/** The lava's look: dark crust plates with glowing seams, on a canvas that tiles. */
function lavaTexture(seed) {
  const W = 256, H = 128, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), rng = mulberry32(seed);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#ff7a1e'); grad.addColorStop(0.5, '#ffb238'); grad.addColorStop(1, '#ff7a1e');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // plates of cooling crust, drawn three times across the seam so the tile wraps
  for (let i = 0; i < 24; i++) {
    const cx = rng() * W, cy = rng() * H, r = 8 + rng() * 16, n = 5 + Math.floor(rng() * 3);
    const pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU + rng() * 0.6; pts.push([Math.cos(a) * r * (0.7 + rng() * 0.4), Math.sin(a) * r * (0.6 + rng() * 0.4)]); }
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(cx + x + ox, cy + y + oy) : g.moveTo(cx + x + ox, cy + y + oy)));
      g.closePath();
      g.fillStyle = rng() < 0.5 ? '#3a1d15' : '#4a2419'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = '#c2401a'; g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A ring of lava over the moat, wide enough that its edges hide under the banks. */
function lavaMesh(T, mat) {
  const SEG = 168, ROWS = 5, pos = [], uv = [], idx = [];
  for (let j = 0; j <= SEG; j++) {
    const a = (j / SEG) * TAU, rm = T.Rm(a), w = T.mw(a) + 1.1;
    for (let i = 0; i < ROWS; i++) {
      const r = rm - w + (2 * w * i) / (ROWS - 1);
      pos.push(Math.cos(a) * r, LAVA_Y, Math.sin(a) * r);
      uv.push((a * T.Sm) / TILE, ((r - rm) / TILE) * 1.2);
    }
  }
  for (let j = 0; j < SEG; j++) for (let i = 0; i < ROWS - 1; i++) {
    const a = j * ROWS + i, b = a + ROWS;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = 'lava';
  return m;
}

/**
 * Glowing cracks in the rock, for the look only: veins that wander across
 * the meadow, the terrace and the summit, branch now and then and taper
 * out, kept clear of the walked paths and of everything you climb (so they
 * never look like something to jump over), and a few that run down the cliff
 * faces from the rim. One unlit mesh, a hot core between dark red edges.
 */
function veinMesh(L, rng, low, mat) {
  const { T, walks, keepOut } = L;
  const segs = [];
  for (const w of walks) for (let i = 1; i < w.length; i++) segs.push([w[i - 1], w[i]]);
  const nearWalk = (x, z, r) => segs.some(([[x0, z0], [x1, z1]]) => {
    const dx = x1 - x0, dz = z1 - z0, t = clamp(((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(x - x0 - dx * t, z - z0 - dz * t) < r;
  });
  const clear = (x, z) => !nearWalk(x, z, 1.4) && !keepOut.some(([kx, kz, kr]) => Math.hypot(kx - x, kz - z) < kr);
  const lines = []; // each [[x, z, half-width, out]]: out pushes a point off a cliff face, outwards
  // ---- across the flat ground: [inner edge, outer edge, how many]
  const zones = [
    [(a) => T.R1(a) + 1.6, (a) => T.moatIn(a) - 1.2, low ? 9 : 18],
    [(a) => T.R2(a) + 1.6, (a) => T.R1(a) - T.W1 - 1.2, low ? 6 : 11],
    [() => 0.8, (a) => T.R2(a) - T.W2 - 1.0, low ? 2 : 3],
  ];
  for (const [lo, hi, n] of zones) {
    const inside = (x, z) => { const r = Math.hypot(x, z), a = Math.atan2(z, x); return r >= lo(a) && r <= hi(a); };
    const grow = (x, z, h, len, w0) => {
      const pts = [];
      for (let s = 0; s < len && inside(x, z) && clear(x, z); s++) {
        const w = w0 * (1 - s / len) + 0.03;
        pts.push([x, z, w, 0]);
        if (s > 2 && rng() < 0.15) grow(x, z, h + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.6), Math.floor((len - s) * 0.6), w * 0.75);
        h += (rng() - 0.5) * 0.9;
        x += Math.cos(h) * 0.5; z += Math.sin(h) * 0.5;
      }
      if (pts.length >= 3) lines.push(pts);
    };
    for (let i = 0, made = 0; i < n * 6 && made < n; i++) {
      const a = rng() * TAU, r = lo(a) + rng() * Math.max(0, hi(a) - lo(a)), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z)) continue;
      grow(x, z, rng() * TAU, 12 + Math.floor(rng() * 16), 0.16 + rng() * 0.1);
      made++;
    }
  }
  // ---- down the cliff faces, from just behind the rim to the foot
  for (let i = 0, made = 0; i < 40 && made < (low ? 3 : 7); i++) {
    const a = rng() * TAU, mesa = rng() < 0.4, Rf = mesa ? T.R2 : T.R1, W = mesa ? T.W2 : T.W1;
    const r0 = Rf(a) - W - 0.5, r1 = Rf(a) + 0.4;
    if (!clear(Math.cos(a) * r0, Math.sin(a) * r0) || !clear(Math.cos(a) * r1, Math.sin(a) * r1)) continue;
    const pts = [], w0 = 0.1 + rng() * 0.06;
    for (let r = r0; r <= r1; r += 0.12) {
      const wob = Math.sin(r * 9 + i) * 0.05 / Math.max(1, r);
      pts.push([Math.cos(a + wob) * r, Math.sin(a + wob) * r, w0 * (0.6 + 0.4 * Math.sin(r * 5 + i)), 0.06]);
    }
    lines.push(pts);
    made++;
  }
  // ---- one strip per vein, five across: scorched rock, glowing edge, the hot core, edge, scorched rock
  const pos = [], col = [], idx = [];
  const scorch = new THREE.Color('#3e2420'), edge = new THREE.Color('#d2481a'), core = new THREE.Color('#ffc04a');
  const ACROSS = [[-2, scorch], [-0.6, edge], [0, core], [0.6, edge], [2, scorch]];
  for (const pts of lines) {
    const base = pos.length / 3;
    pts.forEach(([x, z, w, out], i) => {
      const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
      const tl = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / tl, nz = (bx - ax) / tl;
      const r = Math.hypot(x, z) || 1, ox = (x / r) * out, oz = (z / r) * out;
      for (const [k, c] of ACROSS) {
        const px = x + nx * w * k, pz = z + nz * w * k;
        pos.push(px + ox, T.heightAt(px, pz) + (out ? 0 : 0.05), pz + oz);
        col.push(c.r, c.g, c.b);
      }
    });
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < ACROSS.length - 1; j++) {
        const a = base + i * ACROSS.length + j, b = a + ACROSS.length;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = 'veins';
  return m;
}

/**
 * Build the moving parts for layout L. `crumbles` are its pieces that
 * crumble (levelgen leaves them out of the merged mesh). Returns { group,
 * update(dt, t, hazards), dispose() }.
 */
export function buildVolcanicLife(L, crumbles, quality) {
  const group = new THREE.Group(), own = [], low = quality === 'low';
  group.name = 'volcanic';
  // ---- lava
  const tex = lavaTexture((L.T.Sm * 1000) | 0);
  const lavaMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const lava = lavaMesh(L.T, lavaMat);
  group.add(lava);
  own.push(tex, lavaMat, lava.geometry);
  // bubbles that swell out of the lava and pop
  const rng = mulberry32(((L.T.Rt * 977) | 0) + 3);
  const bubbleGeo = new THREE.SphereGeometry(0.3, 8, 5, 0, TAU, 0, Math.PI / 2);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#ffc450' });
  const nB = low ? 6 : 14;
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, nB);
  bubbles.frustumCulled = false;
  const bub = Array.from({ length: nB }, () => ({ a: rng() * TAU, off: rng() * 2 - 1, life: 1.5 + rng() * 2, t: rng() * 3 }));
  group.add(bubbles);
  own.push(bubbleGeo, bubbleMat);
  // veins of lava in the rock (they pulse a little, out of step with the moat)
  const veinMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const veins = veinMesh(L, mulberry32(((L.T.Rt * 331) | 0) + 11), low, veinMat);
  group.add(veins);
  own.push(veinMat, veins.geometry);
  // ---- steam: wisps over each vent, and a column when it fires
  const vents = L.vents || [];
  const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const puffMat = toonMaterial({ color: '#f4f1ec' });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, Math.max(1, vents.length * (WISPS + PUFFS)));
  puffs.frustumCulled = false;
  const puffInk = new THREE.InstancedMesh(puffGeo, thinOutline, puffs.count);
  puffInk.instanceMatrix = puffs.instanceMatrix;
  puffInk.frustumCulled = false;
  group.add(puffs, puffInk);
  own.push(puffGeo, puffMat);
  // ---- crumbling pieces, each its own mesh with its glowing cracks
  const emberDim = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#b35a2a' });
  const emberHot = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ffffff' });
  own.push(emberDim, emberHot);
  const pieces = crumbles.map((p) => {
    const body = mergeGeometries(pieceParts(p)), cracks = mergeGeometries(emberParts(p));
    for (const g of [body, cracks]) { g.translate(-p.cx, -p.top, -p.cz); g.computeBoundingSphere(); }
    const holder = new THREE.Group();
    const glow = new THREE.Mesh(cracks, emberDim);
    holder.add(new THREE.Mesh(body, propMaterial), new THREE.Mesh(body, thinOutline), glow);
    holder.position.set(p.cx, p.top, p.cz);
    group.add(holder);
    own.push(body, cracks);
    return { id: p.id, holder, glow, x: p.cx, y: p.top, z: p.cz, was: 'solid', grow: 1 };
  });

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const put = (mesh, i, x, y, z, k, ry = 0) => {
    q.setFromAxisAngle(v.set(0, 1, 0), ry);
    mesh.setMatrixAt(i, m.compose(v.set(x, y, z), q, s.set(k, k * 0.85, k)));
  };

  function update(dt, t, hz) {
    tex.offset.x = (tex.offset.x + dt * 0.012) % 1;
    lavaMat.color.setScalar(0.94 + 0.06 * Math.sin(t * 0.9));
    veinMat.color.setScalar(0.85 + 0.15 * Math.sin(t * 1.3 + 1));
    bub.forEach((b, i) => {
      b.t += dt;
      if (b.t > b.life) { b.t = 0; b.a = rng() * TAU; b.off = rng() * 2 - 1; b.life = 1.5 + rng() * 2; }
      const k = b.t / b.life, r = L.T.Rm(b.a) + b.off * L.T.mw(b.a) * 0.7;
      // swell slowly, then pop in the last tenth
      put(bubbles, i, Math.cos(b.a) * r, LAVA_Y - 0.05, Math.sin(b.a) * r, k < 0.9 ? 0.2 + k * 0.9 : 0.001);
    });
    bubbles.instanceMatrix.needsUpdate = true;
    let n = 0;
    vents.forEach((vent, vi) => {
      const fired = hz?.vents[vi]?.fired ?? -9, age = (hz?.clock ?? 0) - fired;
      for (let i = 0; i < WISPS; i++) {
        const k = (t * 0.45 + i / WISPS + vi * 0.37) % 1;
        put(puffs, n++, vent.x + Math.sin(t + i) * 0.15 * k, vent.y + 0.1 + k * 2.4, vent.z + Math.cos(t * 0.7 + i) * 0.15 * k, (0.25 + k * 0.45) * (1 - k * k), t + i);
      }
      // the column: puffs shot up one after another, the first ones furthest,
      // racing up behind you, then billowing and thinning out where they stop
      for (let i = 0; i < PUFFS; i++) {
        const k = clamp((age - i * 0.03) / BURST, 0, 1), rise = 1 - (1 - Math.min(1, k * 2.2)) ** 3;
        const up = vent.lift * 0.85 * rise * (1 - (i / PUFFS) * 0.75);
        const size = k <= 0 || k >= 1 ? 0.001 : (0.5 + 0.8 * rise + 0.25 * (i % 3)) * (1 - k ** 4);
        put(puffs, n++, vent.x + Math.sin(i * 2.3) * 0.35 * rise, vent.y + 0.2 + up, vent.z + Math.cos(i * 1.7) * 0.35 * rise, size, i);
      }
    });
    puffs.count = puffInk.count = n;
    puffs.instanceMatrix.needsUpdate = true;
    for (const c of pieces) {
      const st = hz?.byId[c.id], state = st?.state || 'solid', h = c.holder;
      if (state === 'solid' && c.was === 'fallen') c.grow = 0; // back: rises into place
      c.was = state;
      c.glow.material = state === 'shaking' ? emberHot : emberDim;
      if (state === 'fallen') {
        const k = st.t;
        h.position.set(c.x, c.y - 4.9 * k * k, c.z);
        h.rotation.set(k * 0.9, 0, k * 0.6);
        h.visible = k < 1.2;
        continue;
      }
      c.grow = Math.min(1, c.grow + dt * 4);
      const shake = state === 'shaking' ? 0.02 + 0.05 * Math.min(1, st.t) : 0;
      h.visible = true;
      h.rotation.set(0, 0, 0);
      h.position.set(c.x + Math.sin(t * 61) * shake, c.y - (1 - c.grow) * 0.6 - shake * 0.5, c.z + Math.cos(t * 53) * shake);
    }
  }
  update(0, 0, null);

  return {
    group, update,
    dispose() { for (const o of own) o.dispose(); bubbles.dispose(); puffs.dispose(); },
  };
}
