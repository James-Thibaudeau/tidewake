// Land races against the rival captain. Sable doesn't use the character
// controller: they follow the level's designed route (the same nodes and
// walked paths the validator checks) at a set pace, walking the ground and
// the joined steps and taking canned jump arcs across the gaps. Because the
// path is the route itself, Sable never needs collisions.
//
//   'summit'  King of the hill: first to the summit.
//   'relics'  Relic scramble: five relics on the island, first to three.
//             Sable walks the route and stops to search for the four that
//             lie along it; the fifth is off the route, for the player.
//
// The encounter object comes from game.rival.landEncounter(island):
//   { kind, profile, onMeet(), onStart(), onFinish({ won }) }
// rival.js owns the story (lines, rewards, chapters); this module only runs
// the race and reports who won. Disposing mid-race reports nothing.
import * as THREE from 'three';
import { Explorer } from '../explorer.js';
import { part, merge, propMaterial, thinOutline } from '../props.js';
import { waveUniforms } from '../waves.js';
import { clamp, lerp, dampAngle, wrapAngle } from '../util.js';
import { walkableEdge } from './modules.js';

// Tuning. The player walks 4.3 m/s and runs 7.0 (config.js ASHORE).
export const PACE = {
  walk: 4.4,               // Sable's speed on the ground and across platforms (m/s)
  slow: 3.4, fast: 5.4,    // rubber-band limits
  leadSlow: [10, 28],      // metres ahead of the player where Sable starts / finishes slowing
  lagFast: [8, 26],        // metres behind where Sable starts / finishes hurrying
  crouch: 0.12,            // pause before each jump (s)
  hop: [0.55, 0.72],       // jump duration range (s), longer for longer jumps
  search: 2.5,             // how long Sable looks for each relic (s)
};
const SIDE = 2.4;          // Sable waits this far to the side of the landing spot
const MEET_R = 3.2;        // walk this close to Sable for the challenge prompt
const SUMMIT_R = 2.2;      // reaching the summit
const RELIC_R = 1.1;       // picking up a relic
const RELICS_TO_WIN = 3;
const COUNT = [[0, '3'], [0.9, '2'], [1.8, '1'], [2.7, 'Go!']], COUNT_END = 3.4;

// ------------------------------------------------------------- relic art
let idolGeo = null, glowGeo = null, glowMat = null;
function relicArt() {
  if (idolGeo) return;
  const JADE = '#38c9a4', JADE2 = '#4fe0b8', DARK = '#1d6f5b', GOLD = '#ffd54a';
  const P = [
    part(new THREE.CylinderGeometry(0.2, 0.25, 0.1, 8), '#7d8a86', { y: 0.05 }),
    part(new THREE.BoxGeometry(0.26, 0.34, 0.2), JADE, { y: 0.27 }),
    part(new THREE.BoxGeometry(0.32, 0.22, 0.24), JADE2, { y: 0.55 }),
    part(new THREE.BoxGeometry(0.37, 0.05, 0.27), DARK, { y: 0.685 }),
    part(new THREE.BoxGeometry(0.14, 0.03, 0.03), DARK, { y: 0.49, z: 0.125 }),
  ];
  for (const s of [-1, 1]) {
    P.push(part(new THREE.BoxGeometry(0.07, 0.07, 0.03), GOLD, { x: s * 0.08, y: 0.57, z: 0.125 }));
    P.push(part(new THREE.BoxGeometry(0.07, 0.2, 0.1), JADE, { x: s * 0.17, y: 0.28 }));
  }
  idolGeo = merge(P);
  // a soft column of gold light above each relic (no PointLights: adding
  // lights at runtime would recompile every shader)
  glowGeo = new THREE.CylinderGeometry(0.75, 0.3, 5, 12, 1, true).translate(0, 2.5, 0);
  glowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: waveUniforms.uTime },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.2 * sin(uTime * 3.0 + vUv.x * 12.566));
        // sRGB colour, decoded so it matches with or without the linear post pipeline
        gl_FragColor = vec4(sRGBTransferEOTF(vec4(1.0, 0.82, 0.35, 1.0)).rgb, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ path
function inside(poly, x, z) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The route as an ordered list of waypoints { x, y, z, node }. Route nodes
 * come in order; a ground node reached by walking is reached along the next
 * walked polyline, and whatever walk is left at the end leads to the summit.
 */
function waypoints(L, groundY) {
  const out = [];
  const add = (n) => {
    const last = out[out.length - 1];
    if (last && !n.piece && !last.node.piece && Math.hypot(n.x - last.x, n.z - last.z) < 0.05) return;
    out.push({ x: n.x, y: n.y, z: n.z, node: n });
  };
  const ground = (x, z) => ({ type: 'ground', x, z, y: groundY(x, z), edge: 'walk' });
  let wi = 0;
  const followWalk = () => { const w = L.walks[wi++]; if (w) for (const [x, z] of w) add(ground(x, z)); };
  const R = L.route;
  add(R[0]);
  for (let i = 1; i < R.length; i++) {
    const A = R[i - 1], B = R[i];
    if (B.type === 'ground' && B.edge === 'walk' && A.type === 'ground') followWalk();
    add(B);
  }
  while (wi < L.walks.length) followWalk();
  return out;
}

/** Where a jump from P to Q leaves P's platform and lands on Q's (fractions of the line between them). */
function hopEnds(P, Q) {
  const dx = Q.x - P.x, dz = Q.z - P.z, len = Math.hypot(dx, dz) || 1e-6;
  const N = Math.max(8, Math.ceil(len / 0.05));
  const fa = P.node.piece?.foot, fb = Q.node.piece?.foot;
  let t0 = 0, t1 = 1;
  if (fa) for (let i = 0; i <= N; i++) { const t = i / N; if (inside(fa, P.x + dx * t, P.z + dz * t)) t0 = t; }
  if (fb) for (let i = N; i >= 0; i--) { const t = i / N; if (inside(fb, P.x + dx * t, P.z + dz * t)) t1 = t; }
  // take off a step back from the lip, land a step onto the next platform
  if (fa) t0 = Math.max(0, t0 - 0.25 / len);
  if (fb) t1 = Math.min(1, t1 + 0.3 / len);
  if (t1 - t0 < 0.15) { const m = clamp((t0 + t1) / 2, 0.2, 0.8); t0 = m - 0.2; t1 = m + 0.2; } // stacked steps
  return [t0, t1];
}

/**
 * Turn waypoints into segments Sable can play back:
 *   walk  { ax..bz, len, ground (sample the terrain), rim }
 *   pause { dur }  the crouch before a jump
 *   hop   { ax..bz, len, dur, a, b }  y(u) = ay + a·u + b·u²
 * Each carries d0, the distance travelled before it.
 */
function buildSegments(pts) {
  const segs = [];
  let d = 0;
  const walk = (ax, ay, az, bx, by, bz, ground, rim) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.03 && Math.abs(by - ay) < 0.03) return;
    segs.push({ k: 'walk', ax, ay, az, bx, by, bz, len: Math.max(len, 0.01), ground, rim, d0: d });
    d += Math.max(len, 0.01);
  };
  for (let i = 1; i < pts.length; i++) {
    const P = pts[i - 1], Q = pts[i], A = P.node, B = Q.node;
    const bothGround = !A.piece && !B.piece;
    if (bothGround) { walk(P.x, P.y, P.z, Q.x, Q.y, Q.z, true, !!(A.rim || B.rim)); continue; }
    if (walkableEdge(A, B)) { walk(P.x, P.y, P.z, Q.x, Q.y, Q.z, false, false); continue; }
    const [t0, t1] = hopEnds(P, Q);
    const dx = Q.x - P.x, dz = Q.z - P.z;
    const ex = P.x + dx * t0, ez = P.z + dz * t0, lx = P.x + dx * t1, lz = P.z + dz * t1;
    walk(P.x, P.y, P.z, ex, P.y, ez, false, false);
    const len = Math.hypot(lx - ex, lz - ez), dy = Q.y - P.y;
    // a ballistic arc whose top is h above the take-off (and at least 0.6 above the landing)
    const h = Math.max(0.7, dy + 0.6);
    const a = 2 * h + 2 * Math.sqrt(h * (h - dy)), b = dy - a;
    segs.push({ k: 'pause', dur: PACE.crouch, x: ex, y: P.y, z: ez, bx: lx, bz: lz, d0: d });
    segs.push({ k: 'hop', ax: ex, ay: P.y, az: ez, bx: lx, by: Q.y, bz: lz, len,
      dur: clamp(0.5 + len * 0.05 + Math.max(0, dy) * 0.05, PACE.hop[0], PACE.hop[1]), a, b, d0: d });
    d += len;
    walk(lx, Q.y, lz, Q.x, Q.y, Q.z, false, false);
  }
  return { segs, length: d };
}

// ------------------------------------------------------------------ race
export class LandRace {
  /**
   * @param ashore  the Ashore visit (scene, ctl, cam, game)
   * @param level   a generated island level (needs level.layout; never the wreck)
   * @param enc     { kind: 'summit' | 'relics', profile, onMeet, onStart, onFinish }
   */
  constructor(ashore, level, enc) {
    this.ashore = ashore;
    this.game = ashore.game;
    this.level = level;
    this.enc = enc;
    this.kind = enc.kind === 'relics' ? 'relics' : 'summit';
    this.state = 'meet';      // 'meet' → 'countdown' → 'racing' → 'done'
    this.clock = 0;           // time in the current state
    this.age = 0;
    this.met = false;
    this.finished = false;
    this.line = null;
    this.you = 0; this.them = 0;

    const sp = level.spawn;
    const groundY = (x, z, fb = sp.y) => { const h = level.groundAt(x, z); return Number.isFinite(h) ? h : fb; };
    this.groundY = groundY;

    // Sable waits beside the landing spot, on the side away from the rowboat
    const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw);
    const cands = [1, -1].map((s) => ({ x: sp.x + fz * SIDE * s, z: sp.z - fx * SIDE * s }))
      .filter((c) => Number.isFinite(level.groundAt(c.x, c.z)))
      .sort((p, q) => Math.hypot(q.x - level.exit.x, q.z - level.exit.z) - Math.hypot(p.x - level.exit.x, p.z - level.exit.z));
    const st = cands[0] || { x: sp.x + fx * 1.4, z: sp.z + fz * 1.4 };
    this.pos = { x: st.x, y: groundY(st.x, st.z), z: st.z };
    this.yaw = Math.atan2(sp.x - st.x, sp.z - st.z);

    // the route, starting from where Sable stands
    const pts = waypoints(level.layout, groundY);
    pts[0] = { x: this.pos.x, y: this.pos.y, z: this.pos.z, node: { type: 'ground', x: this.pos.x, z: this.pos.z, y: this.pos.y, edge: 'walk' } };
    if (this.kind === 'relics' && level.vault) {
      const V = level.vault;
      pts.push({ x: V.x, y: V.y, z: V.z, node: { type: 'ground', x: V.x, z: V.z, y: V.y, edge: 'walk' } });
    }
    const { segs, length } = buildSegments(pts);
    this.segs = segs; this.length = length;
    this.samples = segs.filter((s) => s.k !== 'pause').map((s) => ({ x: s.ax, y: s.ay, z: s.az, d: s.d0 }));
    const end = segs[segs.length - 1];
    this.samples.push({ x: end.bx, y: end.by, z: end.bz, d: length });
    this.si = 0; this.u = 0; this.dist = 0;
    this.vy = 0; this.grounded = true; this.speed = 0;
    this.playerD = 0; this.progT = 0;

    const ex = new Explorer(enc.profile);
    ex.setPose('ground');
    ex.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    ex.root.rotation.set(0, this.yaw, 0);
    ashore.scene.add(ex.root);
    this.ex = ex;

    this.relics = [];
    this.stops = [];
    if (this.kind === 'relics') this.placeRelics();
  }

  /** True during the countdown: the player can't move yet. */
  get hold() { return this.state === 'countdown' && this.clock < COUNT[3][0]; }

  // --------------------------------------------------------------- relics
  placeRelics() {
    relicArt();
    const L = this.level.layout, W = L.walks, gy = this.groundY;
    const spots = [];
    const onWalk = (w, f) => { if (!w?.length) return null; const p = w[Math.min(w.length - 1, Math.round((w.length - 1) * f))]; return { x: p[0], z: p[1] }; };
    spots.push(onWalk(W[1], 0.6));                          // 1 the meadow
    spots.push(onWalk(W[2], 0));                            // 2 just past the first cliff's rim
    spots.push(onWalk(W[2], 0.5));                          // 3 the terrace
    spots.push(this.level.vault ? { x: this.level.vault.x, z: this.level.vault.z } : null); // 4 by the summit
    const a = L.a0 - L.dir * 0.4;                           // 5 off the route, round the meadow the other way
    spots.push(L.T.at(L.T.meadowR(a), a));
    spots.forEach((s, i) => {
      if (!s) return;
      const y = gy(s.x, s.z, 0);
      const m = new THREE.Group();
      const idol = new THREE.Group();
      idol.add(new THREE.Mesh(idolGeo, propMaterial), new THREE.Mesh(idolGeo, thinOutline));
      idol.scale.setScalar(1.15);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.frustumCulled = false;
      m.add(idol, glow);
      m.position.set(s.x, y, s.z);
      this.ashore.scene.add(m);
      const relic = { id: i, x: s.x, y, z: s.z, mesh: m, idol, taken: false };
      this.relics.push(relic);
      // the four along the route: where on the path Sable stops to look
      if (i < 4) {
        let best = null, bd = Infinity;
        for (const p of this.samples) { const d = Math.hypot(p.x - s.x, p.z - s.z) + Math.abs(p.y - y) * 1.5; if (d < bd) { bd = d; best = p; } }
        this.stops.push({ d: best.d, relic });
      }
    });
    this.stops.sort((p, q) => p.d - q.d);
  }

  take(relic, bySable) {
    if (relic.taken) return;
    relic.taken = true;
    relic.mesh.visible = false;
    const g = this.game;
    if (bySable) {
      this.them++;
      if (this.them < RELICS_TO_WIN) g.ui.toast(`Sable found a relic (${this.them} of ${RELICS_TO_WIN})`, 'warn');
    } else {
      this.you++;
      g.audio.play('coin');
      if (this.you < RELICS_TO_WIN) g.ui.toast(`Relic found: ${this.you} of ${RELICS_TO_WIN}`, 'gold');
    }
    if (this.you >= RELICS_TO_WIN || this.them >= RELICS_TO_WIN) this.finish(this.you >= RELICS_TO_WIN);
  }

  // ---------------------------------------------------------------- flow
  /** The challenge prompt, while Sable is waiting on the beach. */
  prompt() {
    if (this.state !== 'meet') return null;
    const p = this.ashore.ctl?.pos;
    if (!p || Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > MEET_R || Math.abs(p.y - this.pos.y) > 1.6) return null;
    return { prompt: this.kind === 'summit' ? 'Race Sable to the summit' : 'Start the relic scramble', action: () => this.begin() };
  }

  /** Line up at the landing spot and count down. */
  begin() {
    if (this.state !== 'meet') return;
    const A = this.ashore, sp = this.level.spawn;
    A.ctl.teleport(sp.x, sp.y, sp.z, sp.yaw);
    A.cam?.snap(A.ctl, sp.yaw);
    A.lastYaw = sp.yaw;
    this.state = 'countdown';
    this.clock = 0;
    this.countI = -1;
    this.met = true;
  }

  finish(won) {
    if (this.finished) return;
    this.finished = true;
    this.state = 'done';
    this.game.ui.setRace?.(null);
    this.line = null;
    this.searchT = 0; this.searching = null;
    if (this.kind === 'relics') for (const r of this.relics) r.mesh.visible = false;
    this.enc.onFinish?.({ won });
  }

  // -------------------------------------------------------------- update
  update(dt, t, acts) {
    void acts;
    const g = this.game, ui = g.ui, p = this.ashore.ctl?.pos;
    if (!p) return;
    this.clock += dt;
    this.age += dt;
    if (!this.met && this.age > 0.9) { this.met = true; this.enc.onMeet?.(); } // after the fade-in

    if (this.state === 'countdown') {
      let i = -1;
      for (let k = 0; k < COUNT.length; k++) if (this.clock >= COUNT[k][0]) i = k;
      if (i !== this.countI) {
        this.countI = i;
        ui.countdown?.(COUNT[i][1]);
        g.audio.play(i === 3 ? 'discover' : 'click');
        if (i === 3) { this.state = 'racing'; this.clock = 0; this.goT = COUNT_END - COUNT[3][0]; this.enc.onStart?.(); }
      }
    }
    if (this.goT > 0 && (this.goT -= dt) <= 0) ui.countdown?.(null);

    const first = this.segs[0];
    let moving = false;
    // after the race Sable carries on to the summit (or just lands the jump they're in)
    const cur = this.segs[this.si];
    if (this.state === 'racing' || (this.state === 'done' && cur && (this.kind === 'summit' || cur.k !== 'walk'))) {
      // gentle rubber-banding on how far along the route each of you is
      this.progT -= dt;
      if (this.progT <= 0) { this.progT = 0.25; this.playerD = this.progressOf(p); }
      const lead = this.dist - this.playerD;
      let v = PACE.walk;
      if (this.state === 'racing') {
        if (lead > PACE.leadSlow[0]) v = lerp(PACE.walk, PACE.slow, clamp((lead - PACE.leadSlow[0]) / (PACE.leadSlow[1] - PACE.leadSlow[0]), 0, 1));
        else if (lead < -PACE.lagFast[0]) v = lerp(PACE.walk, PACE.fast, clamp((-lead - PACE.lagFast[0]) / (PACE.lagFast[1] - PACE.lagFast[0]), 0, 1));
      }
      moving = this.advance(dt, v, t);
    } else if (this.state === 'countdown') {
      // turn to face the way the route sets off
      this.yaw = dampAngle(this.yaw, Math.atan2(first.bx - first.ax, first.bz - first.az), 6, dt);
    }
    if (!moving && this.state !== 'countdown' && !(this.searchT > 0)) {
      // waiting: turn to face the player
      this.speed = 0; this.grounded = true; this.vy = 0;
      this.yaw = dampAngle(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), 5, dt);
    }

    // who's there first
    if (this.state === 'racing') {
      if (this.kind === 'summit') {
        const S = this.level.summit;
        if (Math.hypot(p.x - S.x, p.z - S.z) < SUMMIT_R && Math.abs(p.y - S.y) < 1.6) this.finish(true);
        else if (this.si >= this.segs.length) this.finish(false);
      } else {
        for (const r of this.relics) {
          if (!r.taken && Math.hypot(p.x - r.x, p.z - r.z) < RELIC_R && Math.abs(p.y - r.y) < 1.6) this.take(r, false);
        }
      }
    }
    if (this.state === 'racing') {
      let line;
      if (this.kind === 'summit') {
        const lead = this.dist - this.playerD;
        if (lead > 2) this.ahead = true; else if (lead < -2) this.ahead = false;
        line = `Race to the summit · ${this.ahead ? 'Sable is ahead' : "you're ahead"}`;
      } else line = `You ${this.you} · Sable ${this.them} · first to ${RELICS_TO_WIN}`;
      if (line !== this.line) { this.line = line; ui.setRace?.({ title: this.kind === 'summit' ? 'King of the hill' : 'Relic scramble', line }); }
    }

    // relics bob and turn
    for (const r of this.relics) {
      if (r.taken) continue;
      r.idol.position.y = 0.3 + Math.sin(t * 2 + r.id) * 0.08;
      r.idol.rotation.y = t * 0.9 + r.id;
    }

    // the rig follows
    const ex = this.ex, last = this.lastYaw ?? this.yaw;
    ex.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    ex.root.rotation.y = this.yaw;
    const turn = dt > 0 ? wrapAngle(this.yaw - last) / dt : 0;
    this.lastYaw = this.yaw;
    ex.update(dt, t, {
      footSpeed: this.speed, grounded: this.grounded, vy: this.vy, turn,
      lookRel: moving || this.searchT > 0 ? null : Math.atan2(p.x - this.pos.x, p.z - this.pos.z),
      windStrength: (g.weather?.windStrength || 0) * 0.6, windRel: Math.PI,
    });
  }

  /** How far along Sable's path the player is, roughly: the nearest point of the path. */
  progressOf(p) {
    let best = 0, bd = Infinity;
    for (const s of this.samples) {
      const d = Math.hypot(s.x - p.x, s.z - p.z) + Math.abs(s.y - p.y) * 1.5;
      if (d < bd) { bd = d; best = s.d; }
    }
    return best;
  }

  /** Move Sable along the path for dt seconds at walking speed v. Returns whether they're on the move. */
  advance(dt, v, t) {
    // searching for a relic: stand and look about, then pick it up if it's still there
    if (this.searchT > 0) {
      this.searchT -= dt;
      this.speed = 0; this.grounded = true; this.vy = 0;
      this.yaw += Math.cos(t * 2.6) * 2.2 * dt;
      if (this.searchT <= 0) { const r = this.searching; this.searching = null; if (this.state === 'racing') this.take(r, true); }
      return false;
    }
    const stop = this.state === 'racing' ? this.nextStop() : null;
    let left = dt;
    while (left > 1e-6 && this.si < this.segs.length) {
      const s = this.segs[this.si];
      if (s.k === 'walk') {
        let room = s.len - this.u, halt = false;
        if (stop && stop.d <= s.d0 + s.len + 1e-6) { room = Math.max(0, stop.d - s.d0 - this.u); halt = true; }
        const step = v * left;
        if (step < room) { this.u += step; left = 0; break; }
        this.u += room; left -= room / v;
        if (halt) { this.beginSearch(stop); break; }
        this.u = 0; this.si++;
      } else {
        if (s.k === 'pause' && !this.u) this.ex.land(0.45); // a quick crouch before the jump
        const room = s.dur - this.u;
        if (left < room) { this.u += left; left = 0; break; }
        left -= room; this.u = 0; this.si++;
        if (s.k === 'hop') this.ex.land(0.55);
      }
    }
    if (this.si >= this.segs.length) {
      const e = this.segs[this.segs.length - 1];
      this.pos.x = e.bx; this.pos.y = e.by; this.pos.z = e.bz;
      this.dist = this.length;
      this.speed = 0; this.grounded = true; this.vy = 0;
      if (stop) this.beginSearch(stop); // the last relic, at the end of the path
      return false;
    }
    this.place(this.segs[this.si], v, dt);
    return !(this.searchT > 0);
  }

  nextStop() {
    while (this.stops.length && this.stops[0].relic.taken) this.stops.shift();
    return this.stops[0] || null;
  }

  beginSearch(stop) {
    this.stops.shift();
    if (stop.relic.taken) return;
    this.searching = stop.relic;
    this.searchT = PACE.search;
  }

  /** Put Sable where the path cursor (segment si, offset u) says. */
  place(s, v, dt) {
    const P = this.pos;
    let yawT = this.yaw;
    if (s.k === 'walk') {
      const k = clamp(this.u / s.len, 0, 1);
      P.x = lerp(s.ax, s.bx, k); P.z = lerp(s.az, s.bz, k);
      const chord = lerp(s.ay, s.by, k);
      // on the ground, follow the terrain (a rim's top is solid above the rock face, so keep to the chord there)
      P.y = s.ground ? (s.rim ? Math.max(this.groundY(P.x, P.z, chord), chord) : this.groundY(P.x, P.z, chord)) : chord;
      if (s.len > 0.05) yawT = Math.atan2(s.bx - s.ax, s.bz - s.az);
      this.dist = s.d0 + this.u;
      this.speed = v; this.grounded = true; this.vy = 0;
    } else if (s.k === 'pause') {
      P.x = s.x; P.y = s.y; P.z = s.z;
      yawT = Math.atan2(s.bx - s.x, s.bz - s.z);
      this.dist = s.d0;
      this.speed = 0; this.grounded = true; this.vy = 0;
    } else {
      const k = clamp(this.u / s.dur, 0, 1);
      P.x = lerp(s.ax, s.bx, k); P.z = lerp(s.az, s.bz, k);
      P.y = s.ay + s.a * k + s.b * k * k;
      yawT = Math.atan2(s.bx - s.ax, s.bz - s.az);
      this.dist = s.d0 + s.len * k;
      this.speed = s.len / s.dur; this.grounded = false; this.vy = (s.a + 2 * s.b * k) / s.dur;
    }
    this.yaw = dampAngle(this.yaw, yawT, 14, dt);
  }

  // -------------------------------------------------------------- dispose
  /** Take Sable, the relics and the race HUD away. Safe mid-race (nothing is reported). */
  dispose() {
    const ui = this.game.ui;
    ui.setRace?.(null);
    ui.countdown?.(null);
    this.finished = true;
    this.state = 'done';
    this.ex.root.removeFromParent();
    this.ex.dispose?.();
    for (const r of this.relics) r.mesh.removeFromParent(); // shared geometry and materials stay
    this.relics = [];
    this.stops = [];
  }
}
