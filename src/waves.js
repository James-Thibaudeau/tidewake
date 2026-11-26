// Ocean waves. The same function runs on the CPU (boat physics) and the GPU
// (ocean + shore foam shaders), so the boat always sits exactly on the water.
// How big they are changes with place as well as weather: sea-zones.js says by how
// much at each point (half as big in home waters), to the CPU and the GPU alike.
import { WAVE_DEFS } from './config.js';
import { TAU } from './util.js';
import { SEA_ZONE_GLSL, ZONE_AT, waveFactors } from './sea-zones.js';

// Long, tall storm swells: only present when uSwellScale > 0 (rain/storms).
const SWELL_DEFS = [
  [150, 2.6, 0.9],
  [105, 1.7, 1.75],
  [72, 0.9, 0.2],
];

export const WAVES = [
  ...WAVE_DEFS.map(([L, a, ang]) => ({ L, a, ang, swell: false })),
  ...SWELL_DEFS.map(([L, a, ang]) => ({ L, a, ang, swell: true })),
].map(({ L, a, ang, swell }, i) => {
  const k = TAU / L;
  return { k, a, swell, dx: Math.cos(ang), dz: Math.sin(ang), omega: Math.sqrt(9.8 * k), phase: i * 1.7 };
});

// Shared uniform objects: every wave-aware material references these same objects.
export const waveUniforms = {
  uWavePhase: { value: new Float32Array(WAVES.length) },
  uWaveScale: { value: 0.3 },
  uSwellScale: { value: 0 },
  uTime: { value: 0 },
  uSeaOrigin: { value: new Float32Array(2) }, // where the drawn space's origin is in the world (setSeaOrigin)
  uSeaZone: { value: ZONE_AT },               // the sea zones' centres (sea-zones.js)
};

/**
 * The sea is drawn (and asked about) in the world's own space, except ashore, where a
 * level is built round its own island at (0, 0), and in the gallery. Say where that
 * space's origin is in the world and the waves there are the waves of that place.
 */
export function setSeaOrigin(x = 0, z = 0) {
  waveUniforms.uSeaOrigin.value[0] = x;
  waveUniforms.uSeaOrigin.value[1] = z;
}

export function updateWaves(time, scale, swell = 0) {
  waveUniforms.uSwellScale.value = swell;
  const ph = waveUniforms.uWavePhase.value;
  for (let i = 0; i < WAVES.length; i++) {
    ph[i] = (WAVES[i].phase - WAVES[i].omega * time) % TAU;
  }
  waveUniforms.uWaveScale.value = scale;
  waveUniforms.uTime.value = time % 3600;
}

const zoneK = [1, 1];
export function waveHeight(x, z) {
  const ph = waveUniforms.uWavePhase.value, o = waveUniforms.uSeaOrigin.value;
  let h = 0, hs = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const s = (Math.sin((w.dx * x + w.dz * z) * w.k + ph[i]) + 1) * 0.5;
    const v = w.a * (2 * s * s - 0.75);
    if (w.swell) hs += v; else h += v;
  }
  waveFactors(x + o[0], z + o[1], zoneK);
  return h * waveUniforms.uWaveScale.value * zoneK[0] + hs * waveUniforms.uSwellScale.value * zoneK[1];
}

const f = (v) => v.toFixed(6);
export const WAVE_GLSL = /* glsl */ `
uniform float uWavePhase[${WAVES.length}];
uniform float uWaveScale;
uniform float uSwellScale;
uniform float uTime;
${SEA_ZONE_GLSL}
// k is seaWaveK(p), what the sea zones make of the waves there: a shader that samples the
// waves more than once works it out once (a vertex, a pixel) and passes it in.
float waveHeightK(vec2 p, vec2 k) {
  float h = 0.0; float hs = 0.0; float s;
${WAVES.map((w, i) => `  s = (sin(dot(p, vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)})) + uWavePhase[${i}]) + 1.0) * 0.5; ${w.swell ? 'hs' : 'h'} += ${f(w.a)} * (2.0 * s * s - 0.75);`).join('\n')}
  return h * uWaveScale * k.x + hs * uSwellScale * k.y;
}
float waveHeight(vec2 p) { return waveHeightK(p, seaWaveK(p)); }
`;

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// Colouring-only version of waveHeight for the ocean's fragment shader (include after
// WAVE_GLSL): the height and its slope in one pass, so a pixel pays for each wave once.
// Each wave is weighted by gWaveK, set once per pixel by setWaveLod(): a wave fades out as
// a pixel grows to cover a good part of its length (so far water can't shimmer into
// stripes), and loses most of its contrast with distance, short waves first.
// The boat and the water's shape still use the full waveHeight. `k` is the sea zones'
// factor for the pixel, as for waveHeightK.
export const WAVE_LOD_GLSL = /* glsl */ `
float gWaveK[${WAVES.length}];
float waveLodK(float len, float px, float dist) {
  return (1.0 - smoothstep(0.22, 0.6, px / len)) * mix(1.0, 0.08, smoothstep(3.0, 12.0, dist / len));
}
void setWaveLod(float px, float dist) {
${WAVES.map((w, i) => `  gWaveK[${i}] = waveLodK(${f(TAU / w.k)}, px, dist);`).join('\n')}
}
float waveLod(vec2 p, vec2 k, out vec2 slope) {
  float h = 0.0; float hs = 0.0; vec2 g = vec2(0.0); vec2 gs = vec2(0.0); float th; float s; float a;
${WAVES.map((w, i) => `  th = dot(p, vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)})) + uWavePhase[${i}]; s = sin(th) * 0.5 + 0.5; a = ${f(w.a)} * gWaveK[${i}]; ${w.swell ? 'hs' : 'h'} += a * (2.0 * s * s - 0.75); ${w.swell ? 'gs' : 'g'} += vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)}) * (2.0 * a * s * cos(th));`).join('\n')}
  slope = g * (uWaveScale * k.x) + gs * (uSwellScale * k.y);
  return h * uWaveScale * k.x + hs * uSwellScale * k.y;
}
`;
