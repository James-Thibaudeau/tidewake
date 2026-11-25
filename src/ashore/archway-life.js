// Life on Archway Isle: the gulls. archway.js builds the level and adds this
// to it; archway-layout.js says where they sit.
//
// A few always wheel over the bay. The rest sit about the route (on ledges,
// the inlet's stacks, the arch's back, the stack's top, the cove) and lift
// off crying when you come close, circle out over the water for a while, and
// come back to the same spot once you've moved on. They're only company:
// nothing here gets in your way (the gulls that swoop are Phase 4.12).
import * as THREE from 'three';
import { part, merge, propMaterial, thinOutline } from '../props.js';
import { mulberry32, lerp, smoothstep, TAU } from '../util.js';

const G = { white: '#f4f4f0', grey: '#9aa3ad', tip: '#2b3038', beak: '#e8b23a' };
const NEAR = 4.5;      // how close you come before a gull takes off
const SPEED = 7;       // m/s on the wing
const AWAY = [22, 40]; // seconds circling before it thinks of coming back

/** A gull's body, standing on y = 0 and looking along +z (wings apart). */
function bodyGeometry() {
  return merge([
    part(new THREE.SphereGeometry(0.2, 8, 6), G.white, { y: 0.24, sz: 2.1, c2: G.grey, split: 0.35 }),
    part(new THREE.SphereGeometry(0.13, 8, 6), G.white, { y: 0.42, z: 0.34 }),
    part(new THREE.ConeGeometry(0.035, 0.16, 4), G.beak, { y: 0.41, z: 0.5, rx: Math.PI / 2 }),
    part(new THREE.BoxGeometry(0.22, 0.04, 0.22), G.grey, { y: 0.25, z: -0.42 }),
    part(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 4), G.beak, { x: 0.06, y: 0.06 }),
    part(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 4), G.beak, { x: -0.06, y: 0.06 }),
  ]);
}
/** One wing, from the shoulder out along +x (s = 1) or -x (s = -1): grey, with a dark tip. */
function wingGeometry(s) {
  return merge([
    part(new THREE.BoxGeometry(0.6, 0.035, 0.3), G.grey, { x: s * 0.3 }),
    part(new THREE.BoxGeometry(0.22, 0.035, 0.24), G.tip, { x: s * 0.7, z: -0.02 }),
  ]);
}

/** One gull: a body and two wings that fold (sitting) or flap (flying). */
function makeGull(geo) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo.body, propMaterial), new THREE.Mesh(geo.body, thinOutline));
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(s > 0 ? geo.wingR : geo.wingL, propMaterial));
    w.position.set(s * 0.17, 0.3, 0.12);
    root.add(w);
    return w;
  });
  /** fold: 1 folded along the back, 0 spread; flap: the beat's angle. */
  const pose = (fold, flap = 0) => {
    for (const [i, w] of wings.entries()) {
      const s = i ? 1 : -1;
      w.rotation.set(0, s * fold * 1.52, s * (flap - fold * 0.12));
    }
  };
  pose(1);
  return { root, pose };
}

/** A point on a quadratic curve from a over c to b. */
const bez = (a, c, b, t) => ({ x: lerp(lerp(a.x, c.x, t), lerp(c.x, b.x, t), t), y: lerp(lerp(a.y, c.y, t), lerp(c.y, b.y, t), t), z: lerp(lerp(a.z, c.z, t), lerp(c.z, b.z, t), t) });

/**
 * The gulls for a layout (archway-layout.js: L.gulls). Returns
 * { group, update(dt, t, pos, night, play), dispose() }: pos is where the
 * explorer stands, play(name, opts) makes a sound.
 */
export function buildArchwayLife(L, { quality } = {}) {
  const group = new THREE.Group();
  group.name = 'archway:gulls';
  const geo = { body: bodyGeometry(), wingR: wingGeometry(1), wingL: wingGeometry(-1) };
  const rng = mulberry32(0x9011);

  // the wheelers: always over the bay, by day
  const wheel = [];
  for (let i = 0; i < (quality === 'low' ? 3 : 6); i++) {
    const g = makeGull(geo);
    g.p = { a: rng() * TAU, R: 14 + rng() * 22, y: 18 + rng() * 12, w: (0.16 + rng() * 0.1) * (i % 3 ? 1 : -1), k: rng() * TAU, cz: -12 + rng() * 10 };
    group.add(g.root);
    wheel.push(g);
  }

  // the sitters: each has its own perch and a little life of its own
  const sitters = L.gulls.map((s, i) => {
    const g = makeGull(geo);
    const home = { x: s.x, y: s.y, z: s.z };
    g.root.position.set(home.x, home.y, home.z);
    g.root.rotation.y = rng() * TAU;
    group.add(g.root);
    return { ...g, home, state: 'sit', t: 0, away: 0, loop: null, k: rng() * TAU, i };
  });

  function circlePoint(o, t) {
    const a = o.a + t * o.w;
    return { x: Math.cos(a) * o.R, y: o.y + Math.sin(t * 0.5 + o.k) * 1.5, z: o.cz + Math.sin(a) * o.R, a };
  }
  /** Face the way it's going (from p to q). */
  const face = (g, p, q) => { if (Math.hypot(q.x - p.x, q.z - p.z) > 1e-4) g.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z); };

  function update(dt, t, pos, night, play) {
    const day = 1 - smoothstep(0.55, 0.8, night);
    for (const g of wheel) {
      g.root.visible = day > 0.05;
      if (!g.root.visible) continue;
      const p = circlePoint(g.p, t), q = circlePoint(g.p, t + 0.1);
      g.root.position.set(p.x, p.y, p.z);
      face(g, p, q);
      g.root.rotation.z = g.p.w > 0 ? -0.35 : 0.35; // banked into the turn
      g.pose(0, Math.sin(t * 6 + g.p.k) * 0.5 * (Math.sin(t * 0.7 + g.p.k) > 0.2 ? 1 : 0.1)); // flap, then glide
    }
    for (const g of sitters) {
      const d = Math.hypot(pos.x - g.home.x, pos.z - g.home.z), dy = Math.abs(pos.y - g.home.y);
      g.t += dt;
      if (g.state === 'sit') {
        g.pose(1);
        // a look round now and then
        g.root.rotation.y += Math.sin(t * 0.6 + g.k) > 0.97 ? dt * 2 : 0;
        if (d < NEAR && dy < 3) {
          // off, away from you, out over the water, into a loop of its own
          const away = { x: g.home.x - pos.x, z: g.home.z - pos.z }, l = Math.hypot(away.x, away.z) || 1;
          g.from = { ...g.home };
          g.via = { x: g.home.x + (away.x / l) * 6, y: g.home.y + 4, z: g.home.z + (away.z / l) * 6 };
          // its loop starts on the side of the bay it's heading for
          g.loop = { a: 0, R: 10 + rng() * 14, y: 16 + rng() * 10, w: (0.25 + rng() * 0.1) * (rng() < 0.5 ? 1 : -1), k: g.k, cz: -8 };
          g.loop.a = Math.atan2(g.via.z - g.loop.cz, g.via.x);
          g.to = circlePoint(g.loop, 0);
          g.dur = Math.max(1.5, Math.hypot(g.to.x - g.home.x, g.to.z - g.home.z) / SPEED);
          g.state = 'off'; g.t = 0; g.away = AWAY[0] + rng() * (AWAY[1] - AWAY[0]);
          play?.('gull', { volume: 1 / (1 + d * 0.15) });
        }
      } else if (g.state === 'off' || g.state === 'back') {
        const u = Math.min(1, g.t / g.dur), e = u * u * (3 - 2 * u);
        const p = bez(g.from, g.via, g.to, e), q = bez(g.from, g.via, g.to, Math.min(1, e + 0.02));
        g.root.position.set(p.x, p.y, p.z);
        face(g, p, q);
        g.root.rotation.z = 0;
        const landing = g.state === 'back' && u > 0.85;
        g.pose(landing ? smoothstep(0.85, 1, u) : 0, Math.sin(g.t * 11) * 0.7);
        if (u >= 1) {
          if (g.state === 'off') { g.state = 'circle'; g.t = 0; } else { g.state = 'sit'; g.t = 0; g.root.position.set(g.home.x, g.home.y, g.home.z); }
        }
      } else if (g.state === 'circle') {
        const p = circlePoint(g.loop, g.t), q = circlePoint(g.loop, g.t + 0.1);
        g.root.position.set(p.x, p.y, p.z);
        face(g, p, q);
        g.root.rotation.z = g.loop.w > 0 ? -0.35 : 0.35;
        g.pose(0, Math.sin(t * 6 + g.k) * 0.5 * (Math.sin(t * 0.8 + g.k) > 0 ? 1 : 0.1));
        // home again once you've gone on
        if (g.t > g.away && d > NEAR * 2.2) {
          g.from = p;
          g.via = { x: lerp(p.x, g.home.x, 0.5), y: Math.max(p.y, g.home.y) + 3, z: lerp(p.z, g.home.z, 0.5) };
          g.to = { ...g.home };
          g.dur = Math.max(2, Math.hypot(g.home.x - p.x, g.home.z - p.z) / SPEED);
          g.state = 'back'; g.t = 0;
        }
      }
    }
  }

  return {
    group, update,
    dispose() { for (const g of Object.values(geo)) g.dispose(); },
  };
}
