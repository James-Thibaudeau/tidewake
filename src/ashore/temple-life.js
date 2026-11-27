// Life in the Sunken Temple (decor only, nothing that gets in your way):
// turtles dozing on the causeway's plinths, which slide into the water as you
// come by and climb back out once you've gone; shoals of fish, seen as dark
// shapes just under the still water, that dart off from your feet; and rings
// spreading from your feet as you wade, which glow blue at night like the
// water round them. The sea is opaque, so everything here lives on its surface.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, propMaterial, thinOutline } from '../props.js';
import { mulberry32, smoothstep, clamp, TAU } from '../util.js';

const C = { shell: '#6f7a3e', shell2: '#55602e', plate: '#8f9a52', skin: '#9fae7a', skin2: '#7d8c5c', eye: '#1b1410' };

/** A sea turtle, nose along +x, its belly at y = 0. */
function turtleGeometry() {
  const P = [
    part(new THREE.SphereGeometry(0.42, 12, 6, 0, TAU, 0, Math.PI / 2), C.shell, { sx: 1.15, sy: 0.55, c2: C.shell2, split: 0.3 }),
    part(new THREE.CylinderGeometry(0.47, 0.47, 0.05, 14), C.plate, { y: 0.03, sx: 1.15 }),
    part(new THREE.SphereGeometry(0.13, 8, 6), C.skin, { x: 0.58, y: 0.08, sx: 1.3 }),
    part(new THREE.BoxGeometry(0.03, 0.03, 0.03), C.eye, { x: 0.66, y: 0.13, z: 0.07 }),
    part(new THREE.BoxGeometry(0.03, 0.03, 0.03), C.eye, { x: 0.66, y: 0.13, z: -0.07 }),
  ];
  for (const [x, z, ry, s] of [[0.25, 0.38, 0.7, 1], [0.25, -0.38, -0.7, 1], [-0.32, 0.3, -0.5, 0.6], [-0.32, -0.3, 0.5, 0.6]]) {
    P.push(part(new THREE.BoxGeometry(0.42 * s, 0.04, 0.16 * s), C.skin2, { x, y: 0.03, z, ry }));
  }
  const g = mergeGeometries(P);
  for (const p of P) p.dispose();
  return g;
}

/** A fish's shape seen from above, as a flat dark shadow: nose along +x. */
function fishShadow() {
  const s = new THREE.Shape();
  s.moveTo(0.3, 0); s.quadraticCurveTo(0.12, 0.11, -0.12, 0.05); s.lineTo(-0.28, 0.12); s.lineTo(-0.24, 0);
  s.lineTo(-0.28, -0.12); s.lineTo(-0.12, -0.05); s.quadraticCurveTo(0.12, -0.11, 0.3, 0);
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Turtles at L.turtles, fish in L.shoals, ripples from your feet.
 * update(dt, t, pos, night, play): pos is where the explorer stands (temple
 * space), play(name, opts) makes a sound.
 */
export function buildTempleLife(L, { quality } = {}) {
  const group = new THREE.Group();
  group.name = 'temple:life';
  const rng = mulberry32(5150);

  // ---- turtles
  const tGeo = turtleGeometry();
  const turtles = L.turtles.map((p, k) => {
    const m = new THREE.Group();
    m.add(new THREE.Mesh(tGeo, propMaterial), new THREE.Mesh(tGeo, thinOutline));
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = -p.a + (k % 2 ? 0.4 : -0.3);
    group.add(m);
    return { m, home: { ...p }, state: 'rest', t: 0, away: 0, k };
  });

  // ---- fish: dark shapes under the surface, circling until you come near
  const fGeo = fishShadow();
  const fMat = new THREE.MeshBasicMaterial({ color: 0x0b2a3a, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const fish = [];
  const per = quality === 'low' ? 4 : 7;
  for (const S of L.shoals) {
    for (let i = 0; i < per; i++) {
      const m = new THREE.Mesh(fGeo, fMat);
      const s = 0.8 + rng() * 0.6;
      m.scale.setScalar(s);
      group.add(m);
      fish.push({ m, S, a: rng() * TAU, r: S.r * (0.35 + rng() * 0.65), w: (0.35 + rng() * 0.3) * (i % 2 ? 1 : -1), scare: 0, off: { x: 0, z: 0 } });
    }
  }

  // ---- ripples where you wade
  const ringGeo = new THREE.RingGeometry(0.82, 1, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const m = new THREE.Mesh(ringGeo, mat);
    m.visible = false;
    group.add(m);
    rings.push({ m, t: 1 });
  }
  let ringT = 0, ringI = 0;
  const last = { x: 0, z: 0 };
  const DAY = new THREE.Color(0xffffff), NIGHT = new THREE.Color(0x7fe0ff);

  function update(dt, t, pos, night, play = () => {}) {
    dt = clamp(dt, 0, 0.1);
    // turtles: slide off into the water when you come close; back out when you've gone
    for (const T of turtles) {
      const d = Math.hypot(pos.x - T.home.x, pos.z - T.home.z);
      if (T.state === 'rest') {
        T.m.position.y = T.home.y + Math.sin(t * 0.8 + T.k) * 0.004;
        if (d < 4.5) { T.state = 'slide'; T.t = 0; }
      } else if (T.state === 'slide') {
        T.t += dt;
        const u = smoothstep(0, 0.9, T.t), dir = T.m.rotation.y;
        T.m.position.set(T.home.x + Math.cos(dir) * u * 1.1, T.home.y - smoothstep(0.4, 1, T.t) * 0.9, T.home.z - Math.sin(dir) * u * 1.1);
        T.m.rotation.z = -smoothstep(0.3, 0.8, T.t) * 0.45;
        if (T.t > 0.55 && !T.splashed) { T.splashed = true; play('splash', { volume: 0.35 }); }
        if (T.t > 1.1) { T.state = 'gone'; T.m.visible = false; T.away = 0; }
      } else if (T.state === 'gone') {
        T.away = d > 12 ? T.away + dt : 0;
        if (T.away > 20) {
          T.state = 'rest'; T.splashed = false;
          T.m.visible = true; T.m.position.set(T.home.x, T.home.y, T.home.z); T.m.rotation.z = 0;
        }
      }
    }
    // fish: circle their pool; dart off from your feet, then drift back
    for (const F of fish) {
      F.a += F.w * dt;
      const hx = F.S.x + Math.cos(F.a) * F.r, hz = F.S.z + Math.sin(F.a) * F.r;
      const dx = hx + F.off.x - pos.x, dz = hz + F.off.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 2.6 && pos.y < 1) { F.off.x += (dx / (d || 1)) * dt * 9; F.off.z += (dz / (d || 1)) * dt * 9; }
      else { F.off.x *= 1 - dt * 0.4; F.off.z *= 1 - dt * 0.4; }
      F.m.position.set(hx + F.off.x, 0.03, hz + F.off.z);
      F.m.rotation.y = -F.a - Math.sign(F.w) * Math.PI / 2;
    }
    fMat.opacity = 0.38 * (1 - night * 0.6);
    // ripples: a ring every few steps while you move through shallow water
    const moved = Math.hypot(pos.x - last.x, pos.z - last.z);
    last.x = pos.x; last.z = pos.z;
    ringT -= dt;
    if (pos.y < 0.05 && pos.y > -0.55 && moved > dt * 0.8 && ringT <= 0) {
      const R = rings[ringI++ % rings.length];
      R.t = 0; R.m.visible = true; R.m.position.set(pos.x, 0.04, pos.z);
      ringT = 0.32;
    }
    for (const R of rings) {
      if (!R.m.visible) continue;
      R.t += dt / 1.4;
      if (R.t >= 1) { R.m.visible = false; continue; }
      R.m.scale.setScalar(0.3 + R.t * 1.5);
      R.m.material.color.copy(DAY).lerp(NIGHT, night);
      R.m.material.opacity = (1 - R.t) * (0.55 + night * 0.4);
    }
  }

  return {
    group, update,
    dispose() {
      tGeo.dispose(); fGeo.dispose(); fMat.dispose(); ringGeo.dispose();
      for (const R of rings) R.m.material.dispose();
      group.removeFromParent();
    },
  };
}
