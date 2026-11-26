// Sea races against the rival captain: an AI helmsman for a second boat, a
// planner that lays a course of buoys in open water, and the race itself
// (line-up, countdown, gates, a gently rubber-banded rival, the HUD line).
//
// The race only *moves* the rival's redwing (boat.simulate); whoever owns the
// redwing (rival.js) animates it once a frame and decides what the result
// means. Heading convention as everywhere: forward = (sin h, cos h).
import * as THREE from 'three';
import { WORLD_HALF } from './config.js';
import { clamp, damp, lerp, wrapAngle, bearingDeg, TAU } from './util.js';
import { waveHeight, waveUniforms } from './waves.js';
import { bandAt, seaAt } from './sea-zones.js';
import { part, merge, propMaterial, thinOutline } from './props.js';

// ------------------------------------------------------------------ helm
const NO_GO = 0.95;     // a target closer than this to the wind's source has to be tacked to
const CLOSE = 1.0;      // close-hauled: how far off the wind a beat is sailed
const TACK_PAST = 0.3;  // go about once the target lies this far past the wind's axis
const TACK_MIN = 7;     // seconds on a tack before going about (no flapping)
const PROBES = [25, 50, 85];
const SWEEP = 0.25;     // heading step when looking for a way round
const FAN = 0.14;       // probe a narrow fan rather than a single line, for the hull's width

/**
 * AI helmsman. Sails an NPC boat toward a point: straight there when the
 * wind allows, beating upwind in tacks when it doesn't, and steering round
 * land and rocks in the way.
 */
export class AutoHelm {
  constructor(boat, world) {
    this.boat = boat;
    this.world = world;
    this.tack = 0;        // 0 = sailing direct, ±1 = beating on that side of the wind
    this.tackT = 0;
    this.detour = 0;      // heading offset that clears whatever is ahead
    this.detourT = 0;     // time until the way ahead is looked at again
    this.avoidSide = 1;   // which way round, remembered so it commits
    this.avoidT = 0;
    this.near = Infinity; // distance to the nearest thing in the way
    this.otherClear = true; // while beating: is the other tack open water?
  }

  /** Forget tacks and detours (after the boat is placed somewhere new). */
  reset() { this.tack = 0; this.tackT = 0; this.detour = 0; this.detourT = 0; this.avoidT = 0; this.near = Infinity; this.otherClear = true; }

  /** Distance along heading `h` to the first land or rock within `reach`, or Infinity. */
  blockedAt(h, reach) {
    const p = this.boat.pos, W = this.world;
    for (const d of PROBES) {
      if (d > reach) break;
      for (const o of [0, FAN, -FAN]) {
        const x = p.x + Math.sin(h + o) * d, z = p.z + Math.cos(h + o) * d;
        if (W.heightAt(x, z) > -4 || W.rockHit(x, z, 8)) return d;
      }
    }
    return Infinity;
  }

  /**
   * Steer toward (tx, tz). Sets boat.sailLevel and returns the ctl for
   * boat.simulate: { steer, drive }.
   * opts: { sail: 0|1|2 (default 2), drive (default 1), arrive: radius at
   * which to ease off and furl }
   */
  update(dt, tx, tz, wind, opts = {}) {
    const b = this.boat;
    const dx = tx - b.pos.x, dz = tz - b.pos.z, dist = Math.hypot(dx, dz);
    const direct = Math.atan2(dx, dz);
    const src = wind.angle + Math.PI;          // heading that points at where the wind comes from
    const off = wrapAngle(direct - src);       // the target's bearing from the wind's source

    // ---- upwind: beat in tacks; anything else is sailed straight
    const beating = Math.abs(off) < (this.tack ? NO_GO + 0.08 : NO_GO);
    if (beating) {
      if (!this.tack) { this.tack = off >= 0 ? 1 : -1; this.tackT = 0; }
      this.tackT += dt;
      // go about once the target is past the wind's axis, but never onto a tack that runs into land
      if (off * this.tack < -TACK_PAST && this.tackT > TACK_MIN && this.otherClear) { this.tack = -this.tack; this.tackT = 0; this.detourT = 0; }
    } else this.tack = 0;
    let goal = beating ? src + this.tack * CLOSE : direct;

    // ---- land and rocks: look ahead a few times a second, and commit to a way round
    this.avoidT -= dt;
    this.detourT -= dt;
    if (this.detourT <= 0) {
      this.detourT = 0.2;
      const reach = dist + 10; // what lies beyond the target doesn't matter
      this.near = this.blockedAt(goal, reach);
      this.otherClear = beating && this.blockedAt(src - this.tack * CLOSE, PROBES[2]) === Infinity;
      this.detour = 0;
      if (this.near < Infinity && this.otherClear && this.tackT > 2) {
        // beating into land: the other tack is the way round
        this.tack = -this.tack; this.tackT = 0;
        goal = src + this.tack * CLOSE;
        this.near = Infinity;
        this.otherClear = false;
      } else if (this.near < Infinity) {
        const sides = this.avoidT > 0 ? [[this.avoidSide], [-this.avoidSide]] : [[1, -1]];
        let found = false;
        search: for (const pass of sides) {
          for (let k = 1; k <= 11; k++) for (const s of pass) {
            const o = s * k * SWEEP;
            if (Math.abs(wrapAngle(goal + o - src)) < 0.7) continue; // that way lies in irons
            if (this.blockedAt(goal + o, PROBES[2]) === Infinity) { this.detour = o; this.avoidSide = s; found = true; break search; }
          }
        }
        if (!found) this.detour = this.avoidSide * Math.PI * 0.6; // boxed in: turn hard and try again
        this.avoidT = 4;
      }
    }
    const desired = goal + this.detour;

    const err = wrapAngle(b.heading - desired);
    const steer = clamp(err * 2.2, -1, 1);
    let sail = opts.sail ?? 2;
    if (this.near <= PROBES[0] || Math.abs(err) > 1.4) sail = Math.min(sail, 1);
    let drive = opts.drive ?? 1;
    if (opts.arrive) {
      if (dist < opts.arrive) sail = 0;
      else drive *= clamp((dist - opts.arrive) / (opts.arrive * 2), 0.2, 1);
    }
    b.sailLevel = sail;
    return { steer, drive };
  }
}

// ---------------------------------------------------------------- course
const GATE_R = 24;
const EDGE = WORLD_HALF - 500;

/** Open water a race can use: clear of land, rocks and the edge, and of rough water and home waters too. */
function clearAt(world, x, z, rad = 30) {
  return Math.abs(x) < EDGE && Math.abs(z) < EDGE && world.heightAt(x, z) < -6 && !world.rockHit(x, z, rad) && raceWater(x, z);
}
const seaHere = {};
/** Races (and the kraken's trench, rival.js) keep out of rough water, where the sea would decide them, and out of home waters. */
export function raceWater(x, z) {
  return seaAt(x, z, seaHere).rough === 0 && bandAt(x, z) !== 'home';
}

/** Is the water open from A to B? `fan` also checks the diamond a tacking boat sails in. */
function legClear(world, A, B, fan = false) {
  const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
  const px = -dz / L, pz = dx / L;
  const n = Math.max(1, Math.ceil(L / 25));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = A.x + dx * t, z = A.z + dz * t;
    if (!clearAt(world, x, z)) return false;
    if (fan && i % 2 === 0) {
      const w = Math.min(t, 1 - t) * L * 0.6;
      for (const k of [-1, -0.5, 0.5, 1]) if (w > 20 && !clearAt(world, x + px * w * k, z + pz * w * k)) return false;
    }
  }
  return true;
}

/**
 * Lay a race course in open water near `from`. Every leg is clear of land,
 * rocks and the world's edge, of rough water and of home waters (sea-zones.js),
 * and every buoy stands well off any island.
 * opts: { legs, legLen: [min, max], heading (preferred first leg), windAngle,
 *   rng, upwind (with 3+ legs, the second is a beat to windward),
 *   finish ({ x, z }: the last buoy goes exactly here) }
 * Returns { start: { x, z, heading }, gates: [{ x, z, r }], length } or null.
 * Deterministic for a given rng.
 */
export function planCourse(world, from, opts = {}) {
  const rng = opts.rng || Math.random;
  const legs = Math.max(1, opts.legs || 1);
  const [lmin, lmax] = opts.legLen || [450, 750];
  const src = (opts.windAngle ?? 0) + Math.PI;
  const beat = opts.upwind && legs >= 3 ? 1 : -1; // which leg has to be tacked
  const fin = opts.finish || null;
  const offWind = (h) => Math.abs(wrapAngle(h - src));
  const turn = () => 0.87 + rng() * 1.4;          // 50-130 degrees between legs

  for (let t = 0; t < 120; t++) {
    // the start: where asked, or a little way off if that spot is no good
    const ja = rng() * TAU, jd = t === 0 ? 0 : rng() * (40 + t * 6);
    const S = { x: from.x + Math.cos(ja) * jd, z: from.z + Math.sin(ja) * jd };

    const pts = [];
    if (legs === 1 && fin) pts.push({ x: fin.x, z: fin.z });
    else {
      const base = opts.heading ?? rng() * TAU;
      let h = base + (opts.heading != null ? (rng() - 0.5) * (0.5 + Math.min(1, t / 40) * 2.6) : 0);
      const hs = [];
      if (beat === 1) {
        // choose the beat first, then a first leg that reaches across the wind into it
        const hb = src + (rng() - 0.5) * 0.8, tn = 1.4 + rng() * 0.85;
        const a = hb + tn, b = hb - tn;
        if (opts.heading != null) h = Math.abs(wrapAngle(a - base)) < Math.abs(wrapAngle(b - base)) ? a : b;
        else h = rng() < 0.5 ? a : b;
        hs.push(h, hb);
      } else {
        // never start dead upwind: both boats should get moving at "Go"
        const o = wrapAngle(h - src);
        if (Math.abs(o) < 1.0) h = src + (o >= 0 ? 1 : -1) * (1.05 + rng() * 0.3);
        hs.push(h);
      }
      while (hs.length < legs) {
        const prev = hs[hs.length - 1], tn = turn(), sg = rng() < 0.5 ? 1 : -1;
        // of the two ways to turn, take the one that can be sailed without tacking
        const a = prev + sg * tn, b = prev - sg * tn;
        hs.push(offWind(a) >= 1.0 || offWind(a) >= offWind(b) ? a : b);
      }
      let x = S.x, z = S.z;
      const n = fin ? legs - 1 : legs;
      for (let i = 0; i < n; i++) {
        const len = lerp(lmin, lmax, rng()) * (i === beat ? 0.7 : 1);
        x += Math.sin(hs[i]) * len; z += Math.cos(hs[i]) * len;
        pts.push({ x, z });
      }
      if (fin) {
        const last = pts[pts.length - 1], d = Math.hypot(fin.x - last.x, fin.z - last.z);
        if (d < lmin * 0.4 || d > lmax * 2) continue;
        pts.push({ x: fin.x, z: fin.z });
      }
    }

    // ---- is it all open water?
    const g0 = pts[0];
    const heading = Math.atan2(g0.x - S.x, g0.z - S.z);
    const px = -Math.cos(heading), pz = Math.sin(heading);
    let ok = clearAt(world, S.x, S.z) && clearAt(world, S.x + px * 14, S.z + pz * 14) && clearAt(world, S.x - px * 14, S.z - pz * 14);
    let length = 0, A = S;
    for (let i = 0; ok && i < pts.length; i++) {
      const B = pts[i];
      const tacked = i === beat || offWind(Math.atan2(B.x - A.x, B.z - A.z)) < NO_GO;
      ok = legClear(world, A, B, tacked) && !world.rockHit(B.x, B.z, 60) &&
        world.islands.every((I) => Math.hypot(I.x - B.x, I.z - B.z) > I.bound + 120);
      length += Math.hypot(B.x - A.x, B.z - A.z);
      A = B;
    }
    if (!ok) continue;
    return { start: { x: S.x, z: S.z, heading }, gates: pts.map((p) => ({ x: p.x, z: p.z, r: GATE_R })), length };
  }
  return null;
}

// ----------------------------------------------------------------- buoys
const CRIMSON = '#c2212f', CREAM = '#f4efe4', POLE = '#3b2614';
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const LAMP_Y = 5.95;

function buoyGeometry(finish) {
  const P = [
    part(new THREE.CylinderGeometry(1.15, 1.35, 1.1, 12), CRIMSON, { y: 0.35 }),
    part(new THREE.CylinderGeometry(0.95, 1.15, 0.7, 12), CREAM, { y: 1.25 }),
    part(new THREE.CylinderGeometry(0.6, 0.95, 0.6, 12), CRIMSON, { y: 1.9 }),
    part(new THREE.CylinderGeometry(0.34, 0.6, 0.3, 12), CREAM, { y: 2.35 }),
    part(new THREE.CylinderGeometry(0.09, 0.11, 3.5, 6), POLE, { y: 4.1 }),
  ];
  if (finish) {
    // a chequered flag for the last buoy
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      P.push(part(new THREE.BoxGeometry(0.06, 0.42, 0.42), (r + c) % 2 ? '#1b1e26' : '#ffffff', { y: 4.55 + r * 0.42, z: 0.3 + c * 0.42 }));
    }
  } else {
    P.push(part(new THREE.ConeGeometry(0.5, 1.7, 3), CRIMSON, { y: 5.2, z: 0.95, rx: Math.PI / 2, sx: 0.1 }));
  }
  return merge(P);
}

const beamVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const beamFrag = `uniform float uTime; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
  void main(){ float a = pow(1.0 - vUv.y, 1.4) * (0.55 + 0.2 * sin(uTime * 2.6 + vUv.y * 11.0 + vUv.x * 12.566)) * uAlpha;
    // colours are sRGB: decode, so they match with or without the linear post pipeline
    gl_FragColor = vec4(sRGBTransferEOTF(vec4(uColor, 1.0)).rgb, a);
    #include <colorspace_fragment>
  }`;
function beamMaterial(r, g, b) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: waveUniforms.uTime, uColor: { value: new THREE.Vector3(r, g, b) }, uAlpha: { value: 1 } },
    vertexShader: beamVert, fragmentShader: beamFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ race
const COUNT_STEP = 1.2;                 // seconds between "3", "2", "1" and "Go!"
const BAND_FAR = 150;                   // a lead this long (m) gets the full rubber band
const BAND_AHEAD = 0.93, BAND_BEHIND = 1.06;

/**
 * One race between the player's boat and the rival's redwing round a course
 * from planCourse.
 * opts: { title, goal (HUD wording for a one-buoy sprint), fog (no beams, no
 *   map markers: buoys by compass bearing), pace (the Redwing's sail value as a
 *   fraction of the player's, default 0.94), onFinish({ won, time }) }
 * phase: 'ready' (built, not started) → 'countdown' → 'racing' → 'done'
 */
export class SeaRace {
  constructor(game, redwing, course, opts = {}) {
    this.game = game;
    this.redwing = redwing;
    this.course = course;
    this.opts = opts;
    this.title = opts.title || 'Race';
    this.fog = !!opts.fog;
    this.pace = opts.pace ?? 0.94;
    this.phase = 'ready';
    this.hold = false;       // true until "Go": the player's boat must not move
    this.result = null;
    this.clock = 0;          // since start()
    this.time = 0;           // since "Go"
    this.count = -1;         // countdown step last shown
    this.band = 1;
    this.pg = 0;             // the player's next gate
    this.sg = 0;             // the Redwing's next gate
    this.ahead = true;
    this.line = null;
    this.bearingT = 0;
    this.bearing = '';
    this.helm = new AutoHelm(redwing, game.world);
    // leg lengths, and the distance still to sail after each gate
    const G = course.gates, S = course.start;
    this.after = new Array(G.length).fill(0);
    for (let i = G.length - 2; i >= 0; i--) this.after[i] = this.after[i + 1] + Math.hypot(G[i + 1].x - G[i].x, G[i + 1].z - G[i].z);
    this.total = this.after[0] + Math.hypot(G[0].x - S.x, G[0].z - S.z);
    this.buildBuoys();
  }

  buildBuoys() {
    const G = this.course.gates;
    this.geos = [buoyGeometry(false), buoyGeometry(true)];
    this.lampMat = new THREE.MeshBasicMaterial({ color: '#ffe2a0' });
    this.lampGeo = new THREE.SphereGeometry(0.26, 10, 8);
    this.beamGeo = this.fog ? null : new THREE.CylinderGeometry(3.0, 1.2, 110, 14, 1, true).translate(0, 54, 0);
    this.beamMats = [];
    this.buoys = G.map((gate, i) => {
      const last = i === G.length - 1;
      const group = new THREE.Group();
      group.position.set(gate.x, 0, gate.z);
      const geo = this.geos[last ? 1 : 0];
      const buoy = new THREE.Group();
      const lamp = new THREE.Mesh(this.lampGeo, this.lampMat);
      lamp.position.y = LAMP_Y;
      buoy.add(new THREE.Mesh(geo, propMaterial), new THREE.Mesh(geo, thinOutline), lamp);
      buoy.rotation.y = i * 1.9;
      group.add(buoy);
      let beam = null;
      if (!this.fog) {
        const mat = last ? beamMaterial(1.0, 0.82, 0.3) : beamMaterial(1.0, 0.36, 0.3);
        this.beamMats.push(mat);
        beam = new THREE.Mesh(this.beamGeo, mat);
        beam.frustumCulled = false;
        group.add(beam);
      }
      this.game.scene.add(group);
      return { group, buoy, beam, phase: i * 2.1 };
    });
    this.syncBeams();
  }

  /** The player's next buoy shines; later ones are dim; passed ones go out. */
  syncBeams() {
    this.buoys.forEach((B, i) => {
      if (!B.beam) return;
      B.beam.visible = i >= this.pg;
      B.beam.material.uniforms.uAlpha.value = i === this.pg ? 1 : 0.28;
    });
  }

  // --------------------------------------------------------------- start
  /** Line both boats up at the start, sails furled, and begin the countdown. */
  start() {
    const g = this.game, S = this.course.start, G = this.course.gates, h = S.heading;
    const px = -Math.cos(h), pz = Math.sin(h);
    // the player takes the inside of the first turn (the left, if there is none)
    let side = -1;
    if (G.length > 1) side = (G[1].x - G[0].x) * px + (G[1].z - G[0].z) * pz >= 0 ? 1 : -1;
    g.boat.place(S.x + px * 6 * side, S.z + pz * 6 * side, h);
    this.redwing.place(S.x - px * 6 * side, S.z - pz * 6 * side, h);
    this.redwing.rudder = 0;
    this.helm.reset();
    g.cam.yaw = h; g.cam.lastLook = -10;
    this.phase = 'countdown';
    this.hold = true;
    this.clock = 0; this.time = 0; this.count = -1;
    this.pg = 0; this.sg = 0; this.band = 1; this.result = null;
    this.syncBeams();
    this.updateHud(0, true);
  }

  // -------------------------------------------------------------- update
  update(dt, wind) {
    const g = this.game, t = g.elapsed || 0;
    for (const B of this.buoys) {
      const p = B.group.position;
      B.buoy.position.y = waveHeight(p.x, p.z) + Math.sin(t * 1.5 + B.phase) * 0.08;
      B.buoy.rotation.x = Math.sin(t * 1.1 + B.phase) * 0.06;
      B.buoy.rotation.z = Math.cos(t * 0.9 + B.phase) * 0.06;
    }
    if (this.phase === 'ready' || this.phase === 'done') {
      if (this.clearAt != null && (this.clock += dt) >= this.clearAt) { this.clearAt = null; g.ui.countdown?.(null); }
      return;
    }
    this.clock += dt;
    const redwing = this.redwing;

    if (this.phase === 'countdown') {
      redwing.speed = 0; redwing.sailLevel = 0;
      const step = Math.min(3, Math.floor(this.clock / COUNT_STEP));
      if (step !== this.count) {
        this.count = step;
        g.ui.countdown?.(['3', '2', '1', 'Go!'][step]);
        g.audio?.play(step < 3 ? 'click' : 'discover');
        if (step === 3) {
          this.phase = 'racing';
          this.hold = false;
          this.clearAt = this.clock + 0.9;
          g.boat.sailLevel = 2; // the sail goes up for you: the race is the steering
        }
      }
      if (this.phase === 'countdown') return;
    }
    if (this.clearAt != null && this.clock >= this.clearAt) { this.clearAt = null; g.ui.countdown?.(null); }

    // ---- racing
    this.time += dt;
    const G = this.course.gates, pb = g.boat.pos, sb = redwing.pos;
    const left = (pos, i) => Math.hypot(G[i].x - pos.x, G[i].z - pos.z) + this.after[i];
    // how far the Redwing leads, in metres of course still to sail
    const lead = left(pb, this.pg) - left(sb, this.sg);

    // gentle rubber band: the Redwing eases off when well ahead, presses on when well behind
    const k = clamp(lead / BAND_FAR, -1, 1);
    this.band = damp(this.band, k > 0 ? lerp(1, BAND_AHEAD, k) : lerp(1, BAND_BEHIND, -k), 0.5, dt);
    const up = redwing.up || (redwing.up = { sail: 1, rudder: 1.25, keel: 0.6, hull: 150, lantern: 48 });
    up.sail = g.upv.sail * this.pace * this.band;
    up.rudder = Math.max(1.25, g.upv.rudder);

    const sgate = G[this.sg];
    const ctl = this.helm.update(dt, sgate.x, sgate.z, wind);
    redwing.simulate(dt, ctl, wind, g.world, up); // a rival's knocks don't count

    // ---- gates, in order; the first boat through the last one ends it
    const pgate = G[this.pg];
    if (Math.hypot(pgate.x - pb.x, pgate.z - pb.z) < pgate.r) {
      this.pg++;
      g.audio?.play('coin');
      if (this.pg >= G.length) return this.finish(true);
      this.syncBeams();
      this.bearingT = 0;
    }
    if (Math.hypot(sgate.x - sb.x, sgate.z - sb.z) < sgate.r) {
      this.sg++;
      if (this.sg >= G.length) return this.finish(false);
    }
    this.updateHud(dt, false, lead);
  }

  finish(won) {
    this.phase = 'done';
    this.hold = false;
    this.pg = Math.min(this.pg, this.course.gates.length - 1);
    this.sg = Math.min(this.sg, this.course.gates.length - 1);
    for (const B of this.buoys) if (B.beam) B.beam.visible = false;
    this.result = { won, time: this.time };
    this.opts.onFinish?.(this.result);
  }

  updateHud(dt, force = false, lead = 0) {
    const g = this.game, G = this.course.gates, n = G.length;
    // a little hysteresis so "Ahead"/"Behind" doesn't flicker when neck and neck
    if (lead > 8) this.ahead = false; else if (lead < -8) this.ahead = true;
    const where = n === 1 ? (this.opts.goal || 'To the point') : `Buoy ${Math.min(this.pg + 1, n)} of ${n}`;
    let tail = this.phase === 'countdown' ? 'Get ready' : this.ahead ? 'Ahead' : 'Behind';
    if (this.fog) {
      // no beams in fog: sail by the compass
      this.bearingT -= dt;
      if (this.bearingT <= 0 || force || !this.bearing) {
        this.bearingT = 1;
        const p = g.boat.pos, gt = G[Math.min(this.pg, n - 1)];
        const deg = Math.round(bearingDeg(Math.atan2(gt.x - p.x, gt.z - p.z))) % 360;
        this.bearing = `bearing ${String(deg).padStart(3, '0')}° ${POINTS[Math.round(deg / 45) % 8]}`;
      }
      tail = this.bearing;
    }
    const line = `${where} · ${tail}`;
    if (line !== this.line || force) { this.line = line; g.ui.setRace?.({ title: this.title, line }); }
  }

  // ------------------------------------------------------------- queries
  /** The gate the player is sailing for (also set in fog: for off-course checks only). */
  get playerNext() {
    const G = this.course.gates, gt = G[Math.min(this.pg, G.length - 1)];
    return { x: gt.x, z: gt.z };
  }

  /** Index of the player's next gate, or -1 in fog (nothing for the map). */
  get playerGate() { return this.fog ? -1 : this.pg; }

  /** Gates for the map: [{ x, z, passed, next }]. Empty in fog. */
  get gates() {
    if (this.fog) return [];
    return this.course.gates.map((gt, i) => ({ x: gt.x, z: gt.z, passed: i < this.pg, next: i === this.pg && this.phase !== 'done' }));
  }

  dispose() {
    for (const B of this.buoys) this.game.scene.remove(B.group);
    this.buoys = [];
    for (const geo of this.geos) geo.dispose();
    this.lampGeo.dispose(); this.lampMat.dispose();
    this.beamGeo?.dispose();
    for (const m of this.beamMats) m.dispose();
    this.hold = false;
    this.game.ui.setRace?.(null);
    this.game.ui.countdown?.(null);
  }
}
