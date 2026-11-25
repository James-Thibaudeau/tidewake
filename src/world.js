// Procedural archipelago: island layout, terrain height function, and a
// streamer that builds/destroys island meshes around the player.
import * as THREE from 'three';
import { WORLD_HALF } from './config.js';
import { mulberry32, noise2, fbm2, clamp, smoothstep, TAU, headingOf } from './util.js';
import { PROPS, propMaterial, propOutline, thinOutline, part, merge, propMesh } from './props.js';
import { toonGradient, toonMaterial } from './toon.js';
import { WAVE_GLSL, waveUniforms } from './waves.js';
import { buildWreckModel, WRECK_STACKS, WRECK_SOLID, WRECK_MOORING } from './ashore/wreck.js';

const PREFIX = ['Gull', 'Coral', 'Ember', 'Whale', 'Mist', 'Thorn', 'Kelp', 'Sable', 'Amber', 'Moss',
  'Drift', 'Shell', 'Pebble', 'Storm', 'Sun', 'Moon', 'Star', 'Otter', 'Heron', 'Crab', 'Pelican',
  'Turtle', 'Barnacle', 'Willow', 'Juniper', 'Saffron', 'Cobalt', 'Copper', 'Hollow', 'Tangle',
  'Breaker', 'Squall', 'Brine', 'Lark', 'Puffin', 'Marlin', 'Wren', 'Cinder', 'Glimmer', 'Echo',
  'Halcyon', 'Bramble', 'Fern', 'Cedar', 'Seal', 'Minnow', 'Clam', 'Kestrel', 'Tern', 'Dune',
  'Lagoon', 'Spindle', 'Whisper', 'Rook', 'Ivy', 'Cockle', 'Orca', 'Nautilus', 'Sprat', 'Flint',
  'Saltire', 'Bluff', 'Pumice', 'Briar', 'Hazel', 'Rowan', 'Thistle', 'Gannet', 'Plover', 'Skua'];
const SUFFIX_S = ['Rock', 'Cay', 'Key', 'Islet', 'Skerry', 'Rest'];
const SUFFIX_M = ['Isle', 'Island', 'Atoll', 'Point', 'Reach', 'Cove'];
const SUFFIX_L = ['Isle', 'Island', 'Spire', 'Crag', 'Heights', 'Highlands'];

export const BIOMES = {
  temperate: { sand: '#ecd9a0', grass: '#6cc24a', grass2: '#58b043', rock: '#8f877d', wet: '#c9b27a',
    trees: [['roundTree', 0.34], ['pine', 0.22], ['birch', 0.12], ['fruitTree', 0.07], ['bush', 0.12], ['berryBush', 0.06], ['flower', 0.07]], density: 1 },
  tropical: { sand: '#f7e3a6', grass: '#7fd35a', grass2: '#66c24c', rock: '#a39079', wet: '#d8c084',
    trees: [['palm', 0.58], ['bush', 0.18], ['berryBush', 0.08], ['fruitTree', 0.04], ['flower', 0.12]], density: 0.85 },
  cold: { sand: '#d9d3c3', grass: '#8fb07e', grass2: '#7ea573', rock: '#7d8590', wet: '#b9b3a3', snow: '#f4f8ff',
    trees: [['snowPine', 0.72], ['snowRock', 0.18], ['deadTree', 0.1]], density: 0.7 },
  volcanic: { sand: '#5d504b', grass: '#6f8a4a', grass2: '#62803f', rock: '#4a3d3a', wet: '#463c39', lava: '#ff7a2a',
    trees: [['darkRock', 0.5], ['deadTree', 0.28], ['palm', 0.22]], density: 0.35 },
  rocky: { sand: '#e0cda0', grass: '#7aa95c', grass2: '#6a9a50', rock: '#9a8f86', wet: '#c2ae80',
    trees: [['rock', 0.42], ['pine', 0.33], ['birch', 0.1], ['bush', 0.15]], density: 0.55 },
};

export function edgeFactor(I, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return 0.84 + 0.24 * noise2(c * 1.1 + I.ox, s * 1.1 + I.oz, I.seed) +
    0.1 * noise2(c * 2.7 + I.oz, s * 2.7 + I.ox, I.seed + 5);
}

export function islandHeight(I, x, z) {
  const dx = x - I.x, dz = z - I.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > I.bound2) return -40;
  const d = Math.sqrt(d2);
  const edge = I.r * edgeFactor(I, Math.atan2(dz, dx));
  const s = 1 - d / edge;
  if (s <= 0) return Math.max(-40, s * I.slopeOut);
  let h = I.peak * Math.pow(s, I.exp) + 1.3 * smoothstep(0, 0.1, s);
  h += fbm2(x * I.nf, z * I.nf, 4, I.seed) * I.rough * smoothstep(0.06, 0.35, s);
  if (I.crater) h -= smoothstep(0.8, 0.92, s) * I.peak * 0.3;
  return h;
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.islands = [];
    this.reefs = [];
    this.grid = new Map();
    this.cell = 500;
    this.generate();
  }

  generate() {
    const rng = mulberry32(this.seed);
    const used = new Set();
    const nameFor = (r) => {
      const pool = r < 90 ? SUFFIX_S : r < 190 ? SUFFIX_M : SUFFIX_L;
      for (let i = 0; i < 200; i++) {
        const p = PREFIX[Math.floor(rng() * PREFIX.length)];
        const s = pool[Math.floor(rng() * pool.length)];
        const name = `${p} ${s}`;
        if (!used.has(name)) { used.add(name); return name; }
      }
      return 'Nameless Isle';
    };
    const biomeFor = (z) => {
      const lat = -z / WORLD_HALF + (rng() - 0.5) * 0.35;
      const roll = rng();
      if (lat > 0.55) return roll < 0.8 ? 'cold' : 'rocky';
      if (lat < -0.45) return roll < 0.72 ? 'tropical' : roll < 0.88 ? 'volcanic' : 'temperate';
      return roll < 0.52 ? 'temperate' : roll < 0.74 ? 'tropical' : roll < 0.9 ? 'rocky' : 'volcanic';
    };
    const fits = (x, z, r) => {
      for (const I of this.islands) {
        if (Math.hypot(I.x - x, I.z - z) < (I.r + r) * 1.35 + 170) return false;
      }
      return true;
    };
    const add = (o) => {
      const r = o.r;
      let biome = o.biome || biomeFor(o.z);
      if (o.port && biome === 'volcanic') biome = 'tropical';
      let peak = o.peak, exp = o.exp;
      if (peak == null) {
        const roll = rng();
        if (biome === 'volcanic') { peak = r * (0.5 + rng() * 0.25); exp = 1.8; o.crater = true; }
        else if (roll < 0.2) { peak = 4 + rng() * 5; exp = 0.6; }
        else if (roll < 0.75) { peak = r * (0.12 + rng() * 0.2); exp = 1.2 + rng() * 0.8; }
        else { peak = r * (0.38 + rng() * 0.35); exp = 1.8 + rng() * 0.8; }
        if (biome === 'rocky') peak *= 1.3;
      }
      const I = {
        id: this.islands.length, name: o.name || nameFor(r), x: o.x, z: o.z, r, peak, exp,
        biome, port: !!o.port, landmark: o.landmark || null, crater: !!o.crater,
        seed: Math.floor(rng() * 100000), ox: rng() * 50, oz: rng() * 50,
        rough: 2 + peak * 0.12, nf: 1 / (25 + r * 0.15), slopeOut: 28 + r * 0.05,
        bound: r * 1.32, rocks: [], isReef: false,
      };
      I.bound2 = I.bound * I.bound;
      if (o.dockAngle != null) I.dockAngle = o.dockAngle;
      this.islands.push(I);
      return I;
    };

    // Hand-placed: home port and landmarks
    add({ x: 0, z: 0, r: 150, biome: 'temperate', port: true, name: 'Port Haven', peak: 34, exp: 1.5, dockAngle: Math.PI / 2 });
    add({ x: 5200, z: 2600, r: 330, biome: 'volcanic', landmark: 'volcano', name: 'Mount Cinderhorn', peak: 240, exp: 1.9, crater: true });
    add({ x: -900, z: -6000, r: 300, biome: 'cold', landmark: 'frost', name: 'Frostspire', peak: 300, exp: 2.4 });
    add({ x: -5300, z: 700, r: 260, biome: 'temperate', landmark: 'grove', name: 'The Elder Grove', peak: 40, exp: 1.2 });
    add({ x: 2300, z: 5500, r: 220, biome: 'tropical', landmark: 'ruins', name: 'Sunken Temple Isle', peak: 22, exp: 0.9 });
    add({ x: -3800, z: -3300, r: 180, biome: 'rocky', landmark: 'arch', name: 'Archway Isle', peak: 60, exp: 1.4 });
    const ports = [[3300, 1100, 'Saltmarsh Harbor'], [-2900, 2400, 'Lanternfall'], [1300, -3300, 'Northwatch'],
      [-4600, -1100, 'Driftwood Landing'], [4600, -3900, 'Coralgate'], [-1700, 5000, 'Brightwater'],
      [5900, 5600, 'Windrest'], [-5700, -5500, 'Frostharbor']];
    for (const [x, z, name] of ports) {
      let px = x, pz = z;
      for (let t = 0; t < 40 && !fits(px, pz, 150); t++) { px = x + (rng() - 0.5) * 900; pz = z + (rng() - 0.5) * 900; }
      add({ x: px, z: pz, r: 120 + rng() * 60, port: true, name, peak: 20 + rng() * 25, exp: 1.4 });
    }
    // Random fill
    let tries = 0;
    while (this.islands.length < 110 && tries < 8000) {
      tries++;
      const r = 45 + Math.pow(rng(), 1.8) * 210;
      const lim = WORLD_HALF - 450 - r;
      const x = (rng() * 2 - 1) * lim, z = (rng() * 2 - 1) * lim;
      if (!fits(x, z, r)) continue;
      add({ x, z, r });
    }

    // Derived data: coastline, dock, treasure, rocks
    for (const I of this.islands) this.finishIsland(I, rng);

    // Open-sea reefs
    for (let i = 0, t = 0; i < 50 && t < 3000; t++) {
      const x = (rng() * 2 - 1) * (WORLD_HALF - 300), z = (rng() * 2 - 1) * (WORLD_HALF - 300);
      if (this.islands.some((I) => Math.hypot(I.x - x, I.z - z) < I.bound + (I.port ? 600 : 260))) continue;
      const reef = { id: 'reef' + i, isReef: true, x, z, bound: 110, rocks: [] };
      reef.bound2 = reef.bound * reef.bound;
      const n = 3 + Math.floor(rng() * 6);
      for (let k = 0; k < n; k++) {
        const a = rng() * TAU, d = rng() * 70;
        reef.rocks.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, r: 2.5 + rng() * 4, h: 4 + rng() * 16, type: 'stack' });
      }
      this.reefs.push(reef);
      i++;
    }

    // Grandfather's wreck near Port Haven. Placed with its own RNG *after*
    // everything else so the islands, reefs and treasure of existing saves
    // stay exactly where they were.
    this.wreck = this.placeWreck();

    this.all = [...this.islands, ...this.reefs, ...(this.wreck ? [this.wreck] : [])];
    for (const F of this.all) {
      const b = F.bound + 40;
      const c0x = Math.floor((F.x - b) / this.cell), c1x = Math.floor((F.x + b) / this.cell);
      const c0z = Math.floor((F.z - b) / this.cell), c1z = Math.floor((F.z + b) / this.cell);
      for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
        const k = this.key(cx, cz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(F);
      }
    }
    this.home = this.islands[0];
    this.ports = this.islands.filter((I) => I.port);
  }

  /** A rocky outcrop with grandfather's ship run aground beside it. */
  placeWreck() {
    const rng = mulberry32(this.seed * 31 + 0x57ec);
    const H = this.islands[0];
    const depth = (x, z) => Math.max(-40, ...this.islands.map((I) => islandHeight(I, x, z)));
    for (let t = 0; t < 400; t++) {
      // "just past the point": beside the harbour mouth, visible on the way out
      const side = rng() < 0.5 ? -1 : 1;
      const a = H.dockAngle + side * (0.75 + rng() * 0.7);
      const d = H.r + 260 + rng() * 160;
      const x = H.x + Math.cos(a) * d, z = H.z + Math.sin(a) * d;
      // the bow points at the rocks, roughly away from the harbour
      const hd = Math.atan2(Math.cos(a), Math.sin(a)) + (rng() - 0.5) * 0.8;
      const fx = Math.sin(hd), fz = Math.cos(hd);
      const P = (k, s = 0) => ({ x: x + fx * k + fz * s, z: z + fz * k - fx * s });
      const pts = [P(0), P(14), P(-12), P(-25), P(19, 8), P(19, -8)];
      if (pts.some((p) => depth(p.x, p.z) > -6)) continue;
      if (this.islands.some((I) => I !== H && Math.hypot(I.x - x, I.z - z) < I.bound + 120)) continue;
      if (this.reefs.some((R) => Math.hypot(R.x - x, R.z - z) < 200)) continue;
      // the rocks round her bow, then the hull and her shingle bank (ship space:
      // x across, z towards the bow; see ashore/wreck.js, which shares the layout)
      const rocks = [];
      for (const R of WRECK_STACKS) { const p = P(R.z, R.x); rocks.push({ x: p.x, z: p.z, r: R.r, h: R.h, type: 'stack' }); }
      for (const R of WRECK_SOLID) { const p = P(R.z, R.x); rocks.push({ x: p.x, z: p.z, r: R.r, h: 0, type: 'hidden' }); }
      const sp = P(WRECK_MOORING.z, WRECK_MOORING.x);
      const W = { id: 'wreck', isReef: true, wreck: true, name: "Grandfather's Wreck", x, z, heading: hd,
        bound: 55, rocks, searchPoint: { x: sp.x, z: sp.z } };
      W.bound2 = W.bound * W.bound;
      return W;
    }
    return null;
  }

  finishIsland(I, rng) {
    I.coast = [];
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * TAU;
      const re = I.r * edgeFactor(I, a);
      I.coast.push([I.x + Math.cos(a) * re, I.z + Math.sin(a) * re]);
    }
    I.discoverValue = I.landmark ? 100 : 15 + Math.round(I.r / 8);
    const marchOut = (a, depth, extra = 0) => {
      let d = I.r * edgeFactor(I, a);
      while (islandHeight(I, I.x + Math.cos(a) * d, I.z + Math.sin(a) * d) > depth && d < I.bound * 2) d += 2;
      return d + extra;
    };
    if (I.port) {
      const a = I.dockAngle ?? rng() * TAU;
      I.dockAngle = a;
      const dir = [Math.cos(a), Math.sin(a)];
      const perp = [-dir[1], dir[0]];
      const coastR = I.r * edgeFactor(I, a);
      const endR = Math.max(coastR + 30, marchOut(a, -4, 10));
      I.dock = {
        angle: a, coastR, endR,
        x: I.x + dir[0] * (endR - 6) + perp[0] * 6, z: I.z + dir[1] * (endR - 6) + perp[1] * 6,
        heading: headingOf(dir[0], dir[1]),
      };
    }
    // Treasure in the shallows, away from the dock
    let ta = rng() * TAU;
    if (I.port) ta = I.dockAngle + Math.PI * (0.6 + rng() * 0.8);
    const td = marchOut(ta, -2.6, 2);
    I.treasure = {
      x: I.x + Math.cos(ta) * td, z: I.z + Math.sin(ta) * td,
      value: I.landmark ? 400 : 60 + Math.round(I.r * 0.5 + rng() * 80),
    };
    I.treasureAngle = ta;
    // Sea stacks
    const avoid = (a) => (I.port && Math.abs(Math.atan2(Math.sin(a - I.dockAngle), Math.cos(a - I.dockAngle))) < 0.7) ||
      Math.abs(Math.atan2(Math.sin(a - ta), Math.cos(a - ta))) < 0.35;
    if (I.id !== 0 && (rng() < 0.45 || I.landmark === 'frost')) {
      const base = rng() * TAU;
      const n = I.landmark === 'frost' ? 14 : 3 + Math.floor(rng() * 8);
      for (let k = 0; k < n; k++) {
        const a = base + (rng() - 0.5) * (I.landmark === 'frost' ? 5 : 1.3);
        if (avoid(a)) continue;
        const d = I.r * edgeFactor(I, a) * (1.12 + rng() * 0.45) + 8;
        const r = 2.5 + rng() * 4.5;
        I.rocks.push({ x: I.x + Math.cos(a) * d, z: I.z + Math.sin(a) * d, r, h: 5 + rng() * 22, type: I.biome === 'cold' ? 'ice' : 'stack' });
      }
    }
    if (I.landmark === 'arch') {
      const a = I.treasureAngle + 0.9;
      const d = I.r * edgeFactor(I, a) + 30;
      I.archPos = { x: I.x + Math.cos(a) * d, z: I.z + Math.sin(a) * d, rot: -a };
      // Arch legs as collision rocks (arch spans ±18 units along its local x)
      const lx = Math.cos(-a), lz = -Math.sin(-a);
      for (const s of [-1, 1]) {
        I.rocks.push({ x: I.archPos.x + lx * 18 * s, z: I.archPos.z + lz * 18 * s, r: 6, h: 0, type: 'hidden' });
      }
    }
  }

  key(cx, cz) { return (cx + 1000) * 4096 + (cz + 1000); }

  near(x, z) {
    return this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || EMPTY;
  }

  heightAt(x, z) {
    let h = -40;
    for (const F of this.near(x, z)) {
      if (F.isReef) continue;
      const v = islandHeight(F, x, z);
      if (v > h) h = v;
    }
    return h;
  }

  // Returns the closest rock overlapping a circle, or null.
  rockHit(x, z, rad) {
    let best = null, bd = 0;
    for (const F of this.near(x, z)) {
      for (const R of F.rocks) {
        const d = Math.hypot(x - R.x, z - R.z) - R.r - rad;
        if (d < bd) { bd = d; best = R; }
      }
    }
    return best;
  }
}
const EMPTY = [];

// ---------------------------------------------------------------- rendering

const TERRAIN_DETAIL_GLSL = /* glsl */ `
float tdHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tdNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tdHash(i), tdHash(i + vec2(1.0, 0.0)), u.x), mix(tdHash(i + vec2(0.0, 1.0)), tdHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// One short stroke (or dot when len = 0) per jittered cell; anti-aliased coverage 0..1.
float tdStroke(vec2 p, float density, float len, float wid) {
  vec2 ci = floor(p);
  vec2 f = fract(p) - 0.5;
  float on = step(tdHash(ci), density);
  vec2 o = (vec2(tdHash(ci + 3.7), tdHash(ci + 9.1)) - 0.5) * 0.4;
  float a = tdHash(ci + 5.3) * 3.14159;
  vec2 dir = vec2(cos(a), sin(a));
  vec2 q = f - o;
  float t = clamp(dot(q, dir), -len, len);
  float d = length(q - dir * t);
  float fw = fwidth(d) + 1e-4;
  return on * (1.0 - smoothstep(wid - fw, wid + fw, d));
}
vec3 terrainDetail(vec3 wp, float m, float dist) {
  float near = 1.0 - smoothstep(30.0, 110.0, dist);
  float mid = 1.0 - smoothstep(120.0, 450.0, dist);
  vec2 p = wp.xz;
  float k = 1.0;
  if (m < 0.5) {            // sand: wind ripples + speckles
    float rip = sin(dot(p, vec2(0.8, 0.55)) * 1.7 + tdNoise(p * 0.15) * 6.0);
    k *= 1.0 + (step(0.8, rip) * 0.05 - step(rip, -0.88) * 0.045) * mid;
    k *= 1.0 - tdStroke(p * 2.2, 0.35, 0.0, 0.07) * 0.16 * near;
    k *= 1.0 + tdStroke(p * 1.7 + 11.0, 0.2, 0.0, 0.06) * 0.14 * near;
  } else if (m < 1.5) {     // grass: clumps + blade strokes
    float c = tdNoise(p * 0.09) * 0.65 + tdNoise(p * 0.31) * 0.35;
    float tone = c > 0.62 ? 1.08 : (c < 0.36 ? 0.9 : 1.0);
    k *= mix(1.0, tone, 0.3 + mid * 0.7);
    float blades = max(tdStroke(p * 1.6, 0.55, 0.22, 0.035), tdStroke(p * 1.6 + 17.3, 0.45, 0.18, 0.03));
    k *= 1.0 - blades * 0.24 * near;
    k *= 1.0 + tdStroke(p * 1.1 + 5.0, 0.3, 0.16, 0.03) * 0.15 * near;
  } else if (m < 2.5) {     // rock: strata, patches, cracks
    float n = tdNoise(p * 0.05 + wp.y * 0.02);
    float s = sin(wp.y * 2.0 + n * 8.0);
    k *= 1.0 - smoothstep(0.82, 0.95, s) * 0.18 * mid;
    k *= tdNoise(p * 0.2 + wp.y * 0.1) > 0.6 ? 1.07 : 1.0;
    k *= 1.0 - tdStroke(p * 0.7 + wp.y * 0.3, 0.35, 0.35, 0.025) * 0.3 * near;
  } else if (m < 3.5) {     // snow: soft drifts + sparkles
    k *= 1.0 - step(0.64, tdNoise(p * 0.12)) * 0.06 * mid;
    k += tdStroke(p * 3.0, 0.07, 0.0, 0.05) * near * 0.5;
  } else {                  // lava crust
    k *= tdNoise(p * 0.4 + uTime * 0.05) > 0.55 ? 0.35 : 1.1;
  }
  return vec3(k);
}
`;

const terrainMaterial = toonMaterial({ vertexColors: true, gradientMap: toonGradient() }, { rim: false, cacheKey: 'tidewake-terrain', onBeforeCompile: (shader) => {
  shader.uniforms.uTime = waveUniforms.uTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aMat;\nvarying float vMat;\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvMat = aMat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vMat;\nvarying vec3 vWPos;\n' + TERRAIN_DETAIL_GLSL)
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= terrainDetail(vWPos, floor(vMat + 0.5), length(cameraPosition - vWPos));')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vMat > 3.5) totalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * (0.55 + 0.25 * sin(uTime * 2.0 + vWPos.x * 0.2));');
} });

export const ringUniforms = { uLight: { value: new THREE.Color(1, 1, 1) } };

const ringVert = /* glsl */ `
${WAVE_GLSL}
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y = waveHeight(wp.xz) + position.y;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const shallowFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLight;
uniform float uTime;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float a = vUv.x * 6.2831853;
  float edge = 0.62 + 0.07 * sin(a * 37.0 + uTime * 0.8) + 0.05 * sin(a * 13.0 - uTime * 0.5);
  float band = step(vUv.y, edge);
  float inner = step(vUv.y, edge * 0.45 + 0.04 * sin(a * 29.0 + uTime));
  gl_FragColor = vec4(uColor * uLight, band * (0.42 + inner * 0.22));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const foamFrag = /* glsl */ `
uniform vec3 uLight;
uniform float uTime;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float a = vUv.x * 6.2831853;
  float edge = 0.45 + 0.18 * sin(a * 23.0 + uTime * 1.7) + 0.14 * sin(uTime * 1.3 + a * 7.0);
  float body = step(vUv.y, edge);
  float p = fract(uTime * 0.3 + sin(a * 5.0) * 0.1);
  float ring = step(abs(vUv.y - (0.3 + p * 0.7)), 0.05) * (1.0 - p);
  float alpha = max(body * 0.95, ring * 0.8);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(0.97, 0.99, 1.0) * min(uLight * 1.1, vec3(1.0)), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function ringMaterial(frag, extra = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...waveUniforms, ...ringUniforms, ...extra },
    vertexShader: ringVert, fragmentShader: frag, transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return m;
}
const shallowMat = ringMaterial(shallowFrag, { uColor: { value: new THREE.Color('#5fe0d2') } });
const foamMat = ringMaterial(foamFrag);

function ringGeometry(I, innerF, outerAdd, yOff) {
  const segs = 128;
  const pos = [], uv = [], idx = [];
  for (let k = 0; k <= segs; k++) {
    const a = (k / segs) * TAU;
    const re = I.r * edgeFactor(I, a);
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * re * innerF, yOff, s * re * innerF, c * (re + outerAdd), yOff, s * (re + outerAdd));
    uv.push(k / segs, 0, k / segs, 1);
    if (k < segs) {
      const i = k * 2;
      idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const beaconMat = new THREE.ShaderMaterial({
  uniforms: { uTime: waveUniforms.uTime },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.5 + 0.22 * sin(uTime * 3.0 + vUv.y * 14.0 + vUv.x * 12.566));
      // colours are sRGB: decode, so they match with or without the linear post pipeline
      gl_FragColor = vec4(sRGBTransferEOTF(vec4(1.0, 0.82, 0.3, 1.0)).rgb, a);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const beaconGeo = new THREE.CylinderGeometry(2.4, 1.0, 70, 14, 1, true).translate(0, 34, 0);
const glintMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
const glintGeo = new THREE.OctahedronGeometry(0.9, 0);

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,190,1)'); gr.addColorStop(0.25, 'rgba(255,220,140,0.6)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
// Soft beam: fades along its length and toward the cone's silhouette (no hard edges).
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uIntensity: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vL;
    void main() {
      vL = position.x / 70.0;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `uniform float uIntensity; varying vec3 vN; varying vec3 vV; varying float vL;
    void main() {
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float edge = pow(facing, 2.5);
      float l = clamp(vL, 0.0, 1.0);
      float along = pow(1.0 - l, 1.8) * smoothstep(0.0, 0.08, l);
      float a = edge * along * uIntensity * 0.4;
      gl_FragColor = vec4(sRGBTransferEOTF(vec4(1.0, 0.93, 0.72, 1.0)).rgb, a);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const beamGeo = new THREE.ConeGeometry(7, 70, 24, 6, true).translate(0, -35, 0).rotateZ(Math.PI / 2);

export class IslandStreamer {
  constructor(scene, world, quality) {
    this.scene = scene;
    this.world = world;
    this.built = new Map();
    this.range = quality === 'low' ? 2000 : 2800;
    this.quality = quality;
    this.lamps = [];
    this.smoke = [];
  }

  update(px, pz, budget = 1) {
    for (const [F, rec] of this.built) {
      if (Math.hypot(F.x - px, F.z - pz) - F.bound > this.range + 500) this.destroy(F, rec);
    }
    for (let n = 0; n < budget; n++) {
      let best = null, bd = Infinity;
      for (const F of this.world.all) {
        if (this.built.has(F)) continue;
        const d = Math.hypot(F.x - px, F.z - pz) - F.bound;
        if (d < this.range && d < bd) { bd = d; best = F; }
      }
      if (!best) break;
      this.build(best);
    }
  }

  buildAll(px, pz) { this.update(px, pz, 999); }

  destroy(F, rec) {
    this.scene.remove(rec.group);
    rec.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.userData.own && o.geometry) o.geometry.dispose();
    });
    this.lamps = this.lamps.filter((l) => l.owner !== F);
    this.smoke = this.smoke.filter((l) => l.owner !== F);
    this.built.delete(F);
  }

  build(F) {
    const group = new THREE.Group();
    group.position.set(F.x, 0, F.z);
    const rec = { group, beacon: null };
    const exclusions = [];
    if (!F.isReef) {
      group.add(this.buildTerrain(F));
      const shallow = new THREE.Mesh(ringGeometry(F, 0.97, 24 + F.r * 0.18, 0.12), shallowMat);
      shallow.renderOrder = 1; shallow.userData.own = true; shallow.frustumCulled = false;
      const foam = new THREE.Mesh(ringGeometry(F, 0.985, 4 + F.r * 0.02, 0.18), foamMat);
      foam.renderOrder = 2; foam.userData.own = true; foam.frustumCulled = false;
      group.add(shallow, foam);
      if (F.port) this.buildPort(F, group, exclusions);
      if (F.landmark) this.buildLandmark(F, group, exclusions);
      this.buildDecor(F, group, exclusions);
      // treasure beacon
      const beacon = new THREE.Group();
      const shaft = new THREE.Mesh(beaconGeo, beaconMat);
      shaft.frustumCulled = false;
      const glint = new THREE.Mesh(glintGeo, glintMat);
      glint.position.y = 2.5;
      beacon.add(shaft, glint);
      beacon.position.set(F.treasure.x - F.x, 0, F.treasure.z - F.z);
      beacon.visible = !F.treasureTaken;
      beacon.userData.glint = glint;
      group.add(beacon);
      rec.beacon = beacon;
    }
    if (F.wreck) {
      // broken in two on her reef: the same ship you can walk on (see ashore/wreck.js)
      const M = buildWreckModel({ sea: true });
      M.group.rotation.y = F.heading;
      for (const m of [M.terrain, M.ship, M.sternShip]) m.userData.own = true;
      for (const o of [M.outline, M.sternOutline, ...M.props]) if (o.material === thinOutline) o.userData.lod = 'outline';
      group.add(M.group);
    }
    this.buildRocks(F, group);
    this.scene.add(group);
    rec.lod = { outline: [], detail: [], state: '' };
    group.traverse((o) => { if (o.userData.lod) rec.lod[o.userData.lod].push(o); });
    this.built.set(F, rec);
  }

  buildTerrain(I) {
    const B = I.r * 1.3;
    const seg = clamp(Math.round((B * 2) / (I.r > 200 ? 5 : 4)), 40, 160);
    const N = seg + 1;
    const pos = new Float32Array(N * N * 3);
    const hs = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const lx = -B + (2 * B * i) / seg, lz = -B + (2 * B * j) / seg;
        const h = islandHeight(I, I.x + lx, I.z + lz);
        const k = j * N + i;
        hs[k] = h;
        pos[k * 3] = lx; pos[k * 3 + 1] = Math.max(h, -8); pos[k * 3 + 2] = lz;
      }
    }
    const idx = [];
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        if (hs[a] < -3 && hs[b] < -3 && hs[c] < -3 && hs[d] < -3) continue;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    const col = new Float32Array(N * N * 3);
    const P = BIOMES[I.biome];
    const cs = {}; for (const k of ['sand', 'grass', 'grass2', 'rock', 'wet', 'snow', 'lava']) if (P[k]) cs[k] = new THREE.Color(P[k]);
    const snowLine = I.biome === 'cold' ? Math.max(14, I.peak * 0.42) : Infinity;
    const tmp = new THREE.Color();
    const mat = new Float32Array(N * N); // 0 sand, 1 grass, 2 rock, 3 snow, 4 lava
    for (let k = 0; k < N * N; k++) {
      const h = hs[k];
      const x = pos[k * 3] + I.x, z = pos[k * 3 + 2] + I.z;
      const n = noise2(x * 0.05, z * 0.05, I.seed + 3);
      const ny = nrm.getY(k);
      let id = 0;
      if (h < 0.25) tmp.copy(cs.wet);
      else if (h < 1.9 + n * 0.7) tmp.copy(cs.sand);
      else {
        tmp.copy(n > 0.1 ? cs.grass2 : cs.grass); id = 1;
        if (ny < 0.74 || (I.biome === 'volcanic' && h > I.peak * 0.45) || (I.biome === 'rocky' && h > I.peak * 0.7)) { tmp.copy(cs.rock); id = 2; }
        if (h > snowLine + n * 6 && ny > 0.55) { tmp.copy(cs.snow); id = 3; }
        if (I.crater && h < I.peak * 0.78 && Math.hypot(x - I.x, z - I.z) < I.r * 0.15) { tmp.copy(cs.lava); id = 4; }
      }
      mat[k] = id;
      const v = 1 + noise2(x * 0.3, z * 0.3, 9) * 0.04;
      col[k * 3] = tmp.r * v; col[k * 3 + 1] = tmp.g * v; col[k * 3 + 2] = tmp.b * v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(mat, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, terrainMaterial);
    m.userData.own = true;
    return m;
  }

  placeOnGround(I, group, name, lx, lz, rotY = 0, scale = 1, outline = true) {
    const h = islandHeight(I, I.x + lx, I.z + lz);
    const o = propMesh(name, outline);
    o.position.set(lx, h - 0.1, lz);
    o.rotation.y = rotY;
    o.scale.setScalar(scale);
    group.add(o);
    return o;
  }

  buildPort(I, group, exclusions) {
    const D = I.dock;
    const a = D.angle;
    const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    // pier
    const start = D.coastR * 0.9, len = D.endR - start;
    const parts = [];
    const pierYaw = headingOf(dir.x, dir.y);
    for (let s = 0; s < len; s += 1.2) {
      parts.push(part(new THREE.BoxGeometry(4.2, 0.25, 1.05), s % 2.4 < 1.2 ? '#b98a56' : '#a87a48', { z: s + 0.6, y: 1.5 }));
    }
    for (let s = 0; s < len; s += 6) {
      for (const sx of [-2, 2]) parts.push(part(new THREE.CylinderGeometry(0.28, 0.28, 6, 6), '#6e4f33', { x: sx, z: s, y: -1.4 }));
    }
    parts.push(part(new THREE.BoxGeometry(5, 0.3, 4), '#a87a48', { z: len - 1.5, y: 1.55 }));
    const pier = new THREE.Mesh(merge(parts), propMaterial);
    pier.userData.own = true;
    pier.position.set(dir.x * start, 0, dir.y * start);
    pier.rotation.y = pierYaw;
    group.add(pier);
    const pierOutline = new THREE.Mesh(pier.geometry, thinOutline);
    pierOutline.position.copy(pier.position); pierOutline.rotation.copy(pier.rotation);
    group.add(pierOutline);
    // cargo on the pier
    const endX = dir.x * (start + len - 2), endZ = dir.y * (start + len - 2);
    const barrel = propMesh('barrel'); barrel.position.set(endX + dir.y * 1.4, 2.3, endZ - dir.x * 1.4); group.add(barrel);
    const crate = propMesh('crate'); crate.position.set(endX - dir.y * 1.2, 2.4, endZ + dir.x * 1.2); crate.rotation.y = 0.4; group.add(crate);
    exclusions.push([dir.x * D.coastR * 0.85, dir.y * D.coastR * 0.85, 30]);

    // lighthouse on the shore next to the pier
    for (const off of [0.22, -0.22, 0.4, -0.4]) {
      const la = a + off;
      const lr = I.r * edgeFactor(I, la) * 0.86;
      const lx = Math.cos(la) * lr, lz = Math.sin(la) * lr;
      if (islandHeight(I, I.x + lx, I.z + lz) < 1) continue;
      const lh = this.placeOnGround(I, group, 'lighthouse', lx, lz);
      exclusions.push([lx, lz, 8]);
      const lampY = lh.position.y + 12.05;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.position.set(lx, lampY, lz);
      glow.scale.setScalar(16);
      const beam = new THREE.Group();
      beam.position.set(lx, lampY, lz);
      const b1 = new THREE.Mesh(beamGeo, beamMat); const b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI;
      beam.add(b1, b2);
      group.add(glow, beam);
      this.lamps.push({ owner: I, glow, beam });
      break;
    }
    // huts
    let placed = 0;
    for (let t = 0; t < 30 && placed < 5; t++) {
      const ha = a + (t % 2 ? 1 : -1) * (0.3 + (t * 0.137) % 0.9);
      const hr = I.r * edgeFactor(I, ha) * (0.55 + ((t * 0.31) % 0.3));
      const hx = Math.cos(ha) * hr, hz = Math.sin(ha) * hr;
      const h = islandHeight(I, I.x + hx, I.z + hz);
      if (h < 1.5 || h > 20) continue;
      if (exclusions.some(([ex, ez, er]) => Math.hypot(ex - hx, ez - hz) < er + 3)) continue;
      const slope = Math.abs(islandHeight(I, I.x + hx + 2, I.z + hz) - h) + Math.abs(islandHeight(I, I.x + hx, I.z + hz + 2) - h);
      if (slope > 2.2) continue;
      this.placeOnGround(I, group, 'hut', hx, hz, headingOf(Math.cos(ha), Math.sin(ha)), 1);
      exclusions.push([hx, hz, 7]);
      placed++;
    }
  }

  buildLandmark(I, group, exclusions) {
    if (I.landmark === 'grove') {
      this.placeOnGround(I, group, 'bigTree', 0, 0, 0.3, 9);
      exclusions.push([0, 0, 45]);
    } else if (I.landmark === 'ruins') {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        const lx = Math.cos(a) * I.r * 0.32, lz = Math.sin(a) * I.r * 0.32;
        const o = this.placeOnGround(I, group, 'pillar', lx, lz, a, 1.6);
        o.scale.y = k % 3 === 1 ? 0.6 : 1.6;
        exclusions.push([lx, lz, 6]);
      }
      for (let k = 0; k < 5; k++) {
        const a = I.treasureAngle + (k - 2) * 0.25;
        const d = I.r * edgeFactor(I, a) * 1.03;
        const o = propMesh('pillar'); o.position.set(Math.cos(a) * d, -3, Math.sin(a) * d);
        o.rotation.z = 0.3 * (k - 2); o.scale.setScalar(1.4);
        group.add(o);
      }
    } else if (I.landmark === 'arch' && I.archPos) {
      const o = propMesh('arch');
      o.position.set(I.archPos.x - I.x, -3, I.archPos.z - I.z);
      o.rotation.y = I.archPos.rot;
      o.scale.setScalar(3);
      group.add(o);
    } else if (I.landmark === 'volcano') {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const mat = toonMaterial({ color: 0x8d8a8a, gradientMap: toonGradient() });
      const top = islandHeight(I, I.x + I.r * 0.2, I.z);
      for (let k = 0; k < 9; k++) {
        const m = new THREE.Mesh(geo, mat);
        m.userData.base = { y: top + 10 + k * 14, x: Math.sin(k * 1.7) * 8, z: Math.cos(k * 2.3) * 8, s: 10 + k * 3.5, k };
        group.add(m);
        this.smoke.push({ owner: I, mesh: m });
      }
    }
  }

  buildDecor(I, group, exclusions) {
    const P = BIOMES[I.biome];
    const rng = mulberry32(I.seed * 31 + 7);
    const count = Math.min(650, Math.floor((Math.PI * I.r * I.r / 240) * P.density));
    const total = P.trees.reduce((s, t) => s + t[1], 0);
    const buckets = {};
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const snowLine = I.biome === 'cold' ? Math.max(14, I.peak * 0.42) : Infinity;
    let placed = 0;
    for (let n = 0; n < count * 2.5 && placed < count; n++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * I.r * 1.15;
      const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
      const h = islandHeight(I, I.x + lx, I.z + lz);
      if (h < 2.2) continue;
      const hx = islandHeight(I, I.x + lx + 1.5, I.z + lz) - h;
      const hz = islandHeight(I, I.x + lx, I.z + lz + 1.5) - h;
      const steep = hx * hx + hz * hz;
      let roll = rng() * total, type = P.trees[0][0];
      for (const [t, w] of P.trees) { roll -= w; if (roll <= 0) { type = t; break; } }
      if (steep > 1.6 && type !== 'rock' && type !== 'darkRock' && type !== 'snowRock') continue;
      if (steep > 4) continue;
      if (h > snowLine) type = rng() < 0.6 ? 'snowRock' : 'snowPine';
      if (I.crater && rr < I.r * 0.3) continue;
      if (I.biome === 'volcanic' && h > I.peak * 0.5 && type !== 'darkRock') continue;
      if (exclusions.some(([ex, ez, er]) => Math.hypot(ex - lx, ez - lz) < er)) continue;
      const isRock = type.includes('ock');
      const s = isRock ? 0.6 + rng() * 1.6 : 0.75 + rng() * 0.6;
      e.set(isRock ? rng() * 0.5 : 0, rng() * TAU, 0);
      q.setFromEuler(e);
      v.set(lx, h - 0.15, lz);
      sc.set(s, s * (isRock ? 0.7 + rng() * 0.5 : 0.85 + rng() * 0.35), s);
      m.compose(v, q, sc);
      (buckets[type] ||= []).push(m.clone());
      placed++;
    }
    // Ground cover: grass tufts on meadows and pebbles on beaches (nearby detail, high quality only)
    if (this.quality !== 'low' && I.biome !== 'volcanic') {
      const tufts = Math.min(320, Math.floor(Math.PI * I.r * I.r / 110));
      const pebbles = Math.min(70, Math.floor(I.r * 0.45));
      let nt = 0, np = 0;
      for (let n = 0; n < (tufts + pebbles) * 3 && (nt < tufts || np < pebbles); n++) {
        const a = rng() * TAU, rr = Math.sqrt(rng()) * I.r * 1.1;
        const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
        const h = islandHeight(I, I.x + lx, I.z + lz);
        if (exclusions.some(([ex, ez, er]) => Math.hypot(ex - lx, ez - lz) < er * 0.6)) continue;
        let type = null;
        if (h > 0.5 && h < 1.7 && np < pebbles) { type = 'pebble'; np++; }
        else if (h > 2.3 && h < Math.min(snowLine - 2, I.peak * 0.8) && nt < tufts) {
          const hx = islandHeight(I, I.x + lx + 1, I.z + lz) - h, hz = islandHeight(I, I.x + lx, I.z + lz + 1) - h;
          if (hx * hx + hz * hz > 0.45) continue;
          type = 'grassTuft'; nt++;
        }
        if (!type) continue;
        const s = type === 'pebble' ? 0.6 + rng() * 1.2 : 0.8 + rng() * 0.9;
        e.set(0, rng() * TAU, 0); q.setFromEuler(e);
        v.set(lx, h - 0.05, lz); sc.set(s, s, s);
        m.compose(v, q, sc);
        (buckets[type] ||= []).push(m.clone());
      }
    }
    const grassCol = new THREE.Color(P.grass).multiplyScalar(1.05);
    const tint = new THREE.Color();
    for (const [type, mats] of Object.entries(buckets)) {
      const mesh = new THREE.InstancedMesh(PROPS[type], propMaterial, mats.length);
      mats.forEach((mm, i) => {
        mesh.setMatrixAt(i, mm);
        // subtle per-instance colour variation (grass tufts take the island's grass colour)
        const b = 0.9 + rng() * 0.18;
        if (type === 'grassTuft') tint.copy(grassCol).multiplyScalar(0.92 + rng() * 0.16);
        else tint.setRGB(b * (1 + (rng() - 0.5) * 0.08), b, b * (1 + (rng() - 0.5) * 0.08));
        mesh.setColorAt(i, tint);
      });
      mesh.computeBoundingSphere();
      if (type === 'grassTuft') { mesh.userData.lod = 'detail'; group.add(mesh); continue; }
      const small = type === 'flower' || type === 'bush' || type === 'berryBush' || type === 'pebble';
      if (type === 'flower' || type === 'pebble') mesh.userData.lod = 'detail';
      const ol = new THREE.InstancedMesh(PROPS[type], small ? thinOutline : propOutline, mats.length);
      ol.instanceMatrix = mesh.instanceMatrix;
      ol.boundingSphere = mesh.boundingSphere;
      ol.userData.lod = small ? 'detail' : 'outline';
      group.add(mesh, ol);
    }
  }

  buildRocks(F, group) {
    const sets = { stack: [], ice: [] };
    for (const R of F.rocks) if (sets[R.type]) sets[R.type].push(R);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [type, list] of Object.entries(sets)) {
      if (!list.length) continue;
      const geo = type === 'ice' ? PROPS.snowRock : PROPS.seaStack;
      const mesh = new THREE.InstancedMesh(geo, propMaterial, list.length);
      list.forEach((R, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (R.x * 13.7 + R.z) % TAU);
        v.set(R.x - F.x, -2, R.z - F.z);
        if (type === 'ice') s.set(R.r * 1.1, R.h * 0.35 + 2, R.r * 1.1);
        else s.set(R.r, R.h + 2, R.r);
        m.compose(v, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      const ol = new THREE.InstancedMesh(geo, thinOutline, list.length);
      ol.instanceMatrix = mesh.instanceMatrix;
      ol.boundingSphere = mesh.boundingSphere;
      group.add(mesh, ol);
    }
  }

  // Level of detail: outlines and small ground cover only on nearby islands,
  // where they can actually be seen. Cuts triangle count roughly in half.
  lod(cx, cz, zoom = 1) {
    for (const [F, rec] of this.built) {
      if (!rec.lod) continue;
      const d = (Math.hypot(F.x - cx, F.z - cz) - F.bound) / zoom;
      const state = d < 450 ? 'near' : d < 1000 ? 'mid' : 'far';
      if (state === rec.lod.state) continue;
      rec.lod.state = state;
      for (const o of rec.lod.outline) o.visible = state !== 'far';
      for (const o of rec.lod.detail) o.visible = state === 'near';
    }
  }

  animate(time, night) {
    beamMat.uniforms.uIntensity.value = smoothstep(0.2, 0.65, night);
    for (const L of this.lamps) {
      L.glow.material.opacity = 0.25 + night * 0.75;
      L.glow.scale.setScalar(10 + night * 14);
      L.beam.visible = night > 0.2;
      L.beam.rotation.y = time * 0.6;
    }
    for (const S of this.smoke) {
      const b = S.mesh.userData.base;
      const t = (time * 0.08 + b.k / 9) % 1;
      S.mesh.position.set(b.x + t * 30, b.y + t * 60, b.z + t * 10);
      S.mesh.scale.setScalar(b.s * (0.6 + t * 0.8));
    }
    for (const rec of this.built.values()) {
      if (rec.beacon && rec.beacon.visible) {
        const g = rec.beacon.userData.glint;
        g.rotation.y = time * 2;
        g.position.y = 2.5 + Math.sin(time * 2.5) * 0.5;
      }
    }
  }

  setTreasureVisible(I, vis) {
    const rec = this.built.get(I);
    if (rec && rec.beacon) rec.beacon.visible = vis;
  }
}
