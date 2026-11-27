// The moving parts of Mount Cinderhorn's level: the lake of lava in the crater
// (a slow crust over glowing rock, with bubbles that swell and pop), the fall
// of lava that pours down the wall into it, sparks drifting up off the lake,
// the steam of the vents (and of grandfather's kettle and the forge) and the
// crumbling pieces. The lava's look, the steam and the falling pieces are
// volcanic-life.js's, as on any volcanic island; the rules they show are
// hazards.js, passed in each frame. Decor only: nothing here moves you.
import * as THREE from 'three';
import { mulberry32, TAU } from '../util.js';
import { CINDER } from './cinderhorn-layout.js';
import { pieceArt } from './cinderhorn-art.js';
import { lavaTexture, ventSteam, crumblingPieces } from './volcanic-life.js';

const TILE = 7;   // metres of lava one repeat of its texture covers, as on generated islands

/** A soft round dot for the sparks. */
function dotTexture() {
  const S = 32, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

/**
 * Build the moving parts for layout L. Returns { group, update(dt, t, night,
 * hazards), dispose() }.
 */
export function buildCinderhornLife(L, { quality } = {}) {
  const group = new THREE.Group(), own = [], low = quality === 'low', C = CINDER;
  group.name = 'cinderhorn:life';
  // ---- the lake: a disc that reaches in under the crater's wall
  const tex = lavaTexture(0x51d3);
  const lavaMat = new THREE.MeshBasicMaterial({ map: tex });
  const lakeGeo = new THREE.CircleGeometry(C.lakeR + 1.6, 56);
  lakeGeo.rotateX(-Math.PI / 2);
  { const p = lakeGeo.attributes.position, uv = lakeGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / TILE, p.getZ(i) / TILE); }
  const lake = new THREE.Mesh(lakeGeo, lavaMat);
  lake.position.y = C.lake;
  lake.name = 'cinderhorn:lake';
  group.add(lake);
  // ---- the fall: a ribbon down the wall, its own copy of the texture running fast
  const F = L.fall, fallTex = lavaTexture(0x77a1);
  fallTex.repeat.set(0.3, 1);
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, color: 0xffe0b0, side: THREE.DoubleSide });
  const pos = [], uvs = [], idx = [];
  F.path.forEach(([r, y], k) => {
    const w = 0.75 + 0.25 * Math.sin(k * 1.9) + (k === F.path.length - 1 ? 0.8 : 0);
    for (const s of [-1, 1]) { const a = F.a + (s * w) / r; pos.push(r * Math.cos(a), y, r * Math.sin(a)); uvs.push((s + 1) / 2, k * 0.35); }
    if (k) { const b = (k - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  });
  const fallGeo = new THREE.BufferGeometry();
  fallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  fallGeo.setIndex(idx);
  fallGeo.computeBoundingSphere();
  const fall = new THREE.Mesh(fallGeo, fallMat);
  fall.name = 'cinderhorn:fall';
  group.add(fall);
  own.push(tex, lavaMat, lakeGeo, fallTex, fallMat, fallGeo);
  // ---- bubbles that swell out of the lake and pop (more of them where the fall lands)
  const rng = mulberry32(0xb0b);
  const bubbleGeo = new THREE.SphereGeometry(0.3, 8, 5, 0, TAU, 0, Math.PI / 2), bubbleMat = new THREE.MeshBasicMaterial({ color: '#ffc450' });
  const nB = low ? 8 : 18, foot = F.path[F.path.length - 1][0];
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, nB);
  bubbles.frustumCulled = false;
  const place = (b, i) => {
    if (i < 4) { b.x = (foot - 0.6 - rng() * 1.4) * Math.cos(F.a + (rng() - 0.5) * 0.12); b.z = (foot - 0.6 - rng() * 1.4) * Math.sin(F.a + (rng() - 0.5) * 0.12); b.life = 0.7 + rng() * 0.8; return; }
    // (not under the knoll or the ridges: out in the open lava)
    for (let tries = 0; tries < 8; tries++) {
      const a = rng() * TAU, r = 5.6 + rng() * (C.lakeR - 6.6);
      b.x = r * Math.cos(a); b.z = r * Math.sin(a);
      if (!L.pieces.some((p) => p.top < C.lake + 1.5 && Math.hypot(p.cx - b.x, p.cz - b.z) < (p.r ?? Math.max(p.hx, p.hz)) + 0.5)) break;
    }
    b.life = 1.5 + rng() * 2;
  };
  const bub = Array.from({ length: nB }, (_, i) => { const b = { t: rng() * 3 }; place(b, i); return b; });
  group.add(bubbles);
  own.push(bubbleGeo, bubbleMat);
  // ---- sparks drifting up off the lake: faint by day, bright after dark
  const nS = low ? 14 : 30, sPos = new Float32Array(nS * 3), sCol = new Float32Array(nS * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const dot = dotTexture();
  const sparkMat = new THREE.PointsMaterial({ size: 0.34, map: dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  const sp = Array.from({ length: nS }, () => ({ a: rng() * TAU, r: 2 + rng() * (C.lakeR - 3), k: rng(), w: 0.07 + rng() * 0.08, sway: rng() * TAU }));
  group.add(sparks);
  own.push(sparkGeo, sparkMat, dot);
  // ---- steam: the vents that throw you, and wisps from the kettle and the forge's hearth
  const steam = ventSteam([...L.vents, { x: L.kettle.x + 0.28, y: L.kettle.y + 0.55, z: L.kettle.z, lift: 1 }, { x: L.forge.x + 0.9, y: L.forge.y + 1.1, z: L.forge.z + 0.8, lift: 1 }]);
  const fallers = crumblingPieces(L.pieces.filter((p) => p.crumble), pieceArt);
  group.add(steam.group, fallers.group);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  function update(dt, t, night = 0, hz = null) {
    tex.offset.x = (tex.offset.x + dt * 0.012) % 1;
    lavaMat.color.setScalar(0.94 + 0.06 * Math.sin(t * 0.9));
    fallTex.offset.y = (fallTex.offset.y + dt * 0.55) % 1;
    bub.forEach((b, i) => {
      b.t += dt;
      if (b.t > b.life) { b.t = 0; place(b, i); }
      const k = b.t / b.life, size = k < 0.9 ? 0.2 + k * 0.9 : 0.001;
      bubbles.setMatrixAt(i, m.compose(v.set(b.x, C.lake - 0.05, b.z), q, s.set(size, size * 0.85, size)));
    });
    bubbles.instanceMatrix.needsUpdate = true;
    const glow = 0.3 + night * 0.7;
    sp.forEach((p, i) => {
      p.k = (p.k + dt * p.w) % 1;
      const r = p.r + Math.sin(t * 0.6 + p.sway) * 0.5, fade = glow * (1 - p.k) * Math.min(1, p.k * 8);
      sPos[i * 3] = r * Math.cos(p.a); sPos[i * 3 + 1] = C.lake + 0.2 + p.k * 10; sPos[i * 3 + 2] = r * Math.sin(p.a);
      sCol[i * 3] = fade; sCol[i * 3 + 1] = fade * 0.55; sCol[i * 3 + 2] = fade * 0.15;
    });
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
    steam.update(t, hz);
    fallers.update(dt, t, hz);
  }
  update(0, 0, 0, null);

  return {
    group, update,
    dispose() { for (const o of own) o.dispose(); bubbles.dispose(); steam.dispose(); fallers.dispose(); group.removeFromParent(); },
  };
}
