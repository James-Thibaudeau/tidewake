// Life in the Elder Grove level: the owl that guides you up the tree, and the
// fireflies round the roots at night. grove.js builds the level and adds this
// to it; grove-layout.js says where the owl perches.
//
// The owl never talks. It waits at a perch a little ahead of you on the
// route, hoots when you come close, and flies on to the next. Where it has
// got to isn't saved: on every visit it starts on the arch over the path.
import * as THREE from 'three';
import { part, merge, propMaterial, thinOutline } from '../props.js';
import { glowTexture } from '../world.js';
import { mulberry32, clamp, lerp, smoothstep, TAU } from '../util.js';
import { groveGround, GROVE } from './grove-layout.js';

const O = { owl: '#8c6c48', owl2: '#6e5236', face: '#e4d2a8', eye: '#f2c14a', pupil: '#1b1410' };
const OWL_SCALE = 0.36;  // about 1.3 m tall: a storybook owl, easy to spot from a ledge below
const OWL_SPEED = 9;     // m/s on the wing
const TAKE_OFF = 0.55;   // seconds between the hoot and leaving the perch

/** The owl, standing on y = 0 and looking along +z (the sea view's owl, whole). */
function owlGeometry() {
  const P = [];
  P.push(part(new THREE.SphereGeometry(1, 10, 8), O.owl, { y: 1.25, sy: 1.25, c2: O.owl2, split: 0.5 }));
  P.push(part(new THREE.SphereGeometry(0.7, 10, 8), O.face, { y: 1.15, z: 0.5, sy: 1.15, sz: 0.55 }));
  P.push(part(new THREE.SphereGeometry(0.85, 10, 8), O.owl, { y: 2.75, z: 0.05 }));
  for (const s of [-1, 1]) {
    P.push(part(new THREE.SphereGeometry(0.42, 10, 8), O.face, { x: s * 0.34, y: 2.8, z: 0.67, sz: 0.4 }));
    P.push(part(new THREE.SphereGeometry(0.22, 8, 6), O.eye, { x: s * 0.34, y: 2.83, z: 0.83 }));
    P.push(part(new THREE.SphereGeometry(0.11, 6, 5), O.pupil, { x: s * 0.34, y: 2.83, z: 1.02 }));
    P.push(part(new THREE.ConeGeometry(0.2, 0.6, 5), O.owl2, { x: s * 0.5, y: 3.6, z: 0.05, rz: -s * 0.35 }));
    P.push(part(new THREE.BoxGeometry(0.3, 0.12, 0.45), O.eye, { x: s * 0.35, y: 0.06, z: 0.4 }));
  }
  P.push(part(new THREE.ConeGeometry(0.12, 0.35, 5), O.eye, { y: 2.55, z: 0.9, rx: Math.PI / 2 + 0.4 }));
  return merge(P);
}

function buildOwl() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = 'grove:owl';
  const geo = owlGeometry(), own = [geo];
  body.add(new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, thinOutline));
  const wings = [-1, 1].map((s) => {
    const wg = part(new THREE.BoxGeometry(1.8, 0.14, 1.1).translate(s * 0.9, 0, 0), O.owl2);
    own.push(wg);
    const w = new THREE.Group();
    w.add(new THREE.Mesh(wg, propMaterial), new THREE.Mesh(wg, thinOutline));
    w.position.set(s * 0.8, 2.0, -0.1);
    w.userData.side = s;
    body.add(w);
    return w;
  });
  body.scale.setScalar(OWL_SCALE);
  root.add(body);
  /** How far the wings hang: 1.35 folded against the body, about 0 spread flat. */
  const setWings = (down) => { for (const w of wings) w.rotation.z = -w.userData.side * down; };
  setWings(1.35);
  return { root, body, setWings, dispose() { for (const g of own) g.dispose(); } };
}

/** Three drifts of fireflies, each pulsing at its own pace. */
function buildFireflies(low) {
  const rng = mulberry32(0xf1e5), sets = [];
  for (let s = 0; s < 3; s++) {
    const n = low ? 22 : 54, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // most over the roots and the hilltop, some up the lower trunk
      const trunk = rng() < 0.3, a = rng() * TAU;
      const r = trunk ? GROVE.trunkR + 0.8 + rng() * 2.5 : Math.sqrt(lerp(81, 26 * 26, rng()));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos[i * 3] = x; pos[i * 3 + 2] = z;
      pos[i * 3 + 1] = trunk ? GROVE.hill + 0.6 + rng() * 9 : groveGround(x, z).h + 0.5 + rng() * 4.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.45, map: glowTexture(), color: 0xd6ff8a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    sets.push(pts);
  }
  return sets;
}

/**
 * The grove's owl and fireflies, in grove space. L: the layout (for its perches).
 * Returns { group, update(dt, t, pos, night, play), dispose() }: pos is where
 * the explorer stands (grove space), play(name, opts) makes a sound.
 */
export function buildGroveLife(L, { quality } = {}) {
  const group = new THREE.Group();
  group.name = 'grove:life';
  const owl = buildOwl(), flies = buildFireflies(quality === 'low');
  group.add(owl.root, ...flies);

  const perches = L.perches;
  let at = 0, leaveIn = 0, flight = null, yaw = Math.PI / 2 - perches[0].a;
  const sit = (p) => owl.root.position.set(p.x, p.y, p.z);
  sit(perches[0]);
  owl.root.rotation.y = yaw;

  const hoot = (pos, play, soft = 1) => {
    const o = owl.root.position, d = Math.hypot(o.x - pos.x, o.y - pos.y, o.z - pos.z);
    play?.('hoot', { volume: soft * clamp(1.15 - d / 45, 0.3, 1) });
  };
  const turnTo = (want, dt, rate) => {
    yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * Math.min(1, dt * rate);
    owl.root.rotation.y = yaw;
  };

  function update(dt, t, pos, night, play) {
    const glow = smoothstep(0.35, 0.75, night);
    flies.forEach((f, s) => {
      f.visible = glow > 0.01;
      f.material.opacity = glow * (0.55 + 0.45 * Math.sin(t * (1.7 + s * 0.6) + s * 2));
      f.rotation.y = t * 0.015 * (s % 2 ? 1 : -1);
      f.position.y = Math.sin(t * 0.5 + s) * 0.35;
    });

    const o = owl.root.position;
    if (flight) {
      const f = flight, A = f.from, B = f.to;
      f.t += dt;
      const k = smoothstep(0, 1, f.t / f.dur), arc = Math.sin(Math.PI * k);
      const a = lerp(A.a, B.a, k), r = lerp(A.r, B.r, k) + f.out * arc;
      const x = Math.cos(a) * r, y = lerp(A.y, B.y, k) + f.lift * arc, z = Math.sin(a) * r;
      if (Math.hypot(x - o.x, z - o.z) > 1e-4) turnTo(Math.atan2(x - o.x, z - o.z), dt, 10);
      o.set(x, y, z);
      owl.body.rotation.x = 0.95 * arc;                    // leaning into the flight
      owl.setWings(-0.15 + Math.sin(f.t * 15) * 0.7);
      if (f.t >= f.dur) {
        flight = null;
        sit(B);
        owl.body.rotation.x = 0;
        owl.setWings(1.35);
        hoot(pos, play, 0.6); // "over here"
      }
      return;
    }
    // perched: it watches you, and breathes
    turnTo(Math.atan2(pos.x - o.x, pos.z - o.z), dt, 3);
    owl.body.scale.y = OWL_SCALE * (1 + Math.sin(t * 1.7) * 0.02);
    const P = perches[at], next = perches[at + 1];
    if (!next) return;
    if (leaveIn > 0) {
      owl.setWings(1.35 - 1.1 * (1 - leaveIn / TAKE_OFF)); // wings come up
      if ((leaveIn -= dt) > 0) return;
      const len = Math.hypot((next.a - P.a) * (P.r + next.r) / 2, next.r - P.r, next.y - P.y);
      flight = { from: P, to: next, t: 0, dur: clamp(len / OWL_SPEED, 1.2, 4.5),
        // swing out round the trunk; keep low under the ledges of the turn above
        out: clamp(Math.abs(next.a - P.a) * 1.6, 0.5, 3.5), lift: P.stub || next.stub ? 0.5 : clamp(len * 0.08, 0.6, 3) };
      at++;
    } else if (Math.hypot(pos.x - P.x, pos.y - P.y, pos.z - P.z) < P.near) {
      leaveIn = TAKE_OFF;
      hoot(pos, play);
    }
  }

  return {
    group, update,
    /** For tests: which perch the owl is on (or flying to). */
    get perch() { return at; },
    dispose() {
      owl.dispose();
      for (const f of flies) { f.geometry.dispose(); f.material.dispose(); }
    },
  };
}
