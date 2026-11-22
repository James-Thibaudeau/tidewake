// Ocean waves. The same function runs on the CPU (boat physics) and the GPU
// (ocean + shore foam shaders), so the boat always sits exactly on the water.
import { WAVE_DEFS } from './config.js';
import { TAU } from './util.js';

export const WAVES = WAVE_DEFS.map(([L, a, ang], i) => {
  const k = TAU / L;
  return { k, a, dx: Math.cos(ang), dz: Math.sin(ang), omega: Math.sqrt(9.8 * k), phase: i * 1.7 };
});

// Shared uniform objects: every wave-aware material references these same objects.
export const waveUniforms = {
  uWavePhase: { value: new Float32Array(WAVES.length) },
  uWaveScale: { value: 0.3 },
  uTime: { value: 0 },
};

export function updateWaves(time, scale) {
  const ph = waveUniforms.uWavePhase.value;
  for (let i = 0; i < WAVES.length; i++) {
    ph[i] = (WAVES[i].phase - WAVES[i].omega * time) % TAU;
  }
  waveUniforms.uWaveScale.value = scale;
  waveUniforms.uTime.value = time % 3600;
}

export function waveHeight(x, z) {
  const ph = waveUniforms.uWavePhase.value;
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const s = (Math.sin((w.dx * x + w.dz * z) * w.k + ph[i]) + 1) * 0.5;
    h += w.a * (2 * s * s - 0.75);
  }
  return h * waveUniforms.uWaveScale.value;
}

const f = (v) => v.toFixed(6);
export const WAVE_GLSL = /* glsl */ `
uniform float uWavePhase[${WAVES.length}];
uniform float uWaveScale;
uniform float uTime;
float waveHeight(vec2 p) {
  float h = 0.0; float s;
${WAVES.map((w, i) => `  s = (sin(dot(p, vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)})) + uWavePhase[${i}]) + 1.0) * 0.5; h += ${f(w.a)} * (2.0 * s * s - 0.75);`).join('\n')}
  return h * uWaveScale;
}
`;

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;
