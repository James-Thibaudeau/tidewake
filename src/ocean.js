// Stylised ocean: petrol-blue water with crisp wind-blown foam streaks, whitecaps,
// sky reflection and a sun glitter path. One centre-weighted grid follows the camera.
import * as THREE from 'three';
import { WAVE_GLSL, NOISE_GLSL, waveUniforms } from './waves.js';

function oceanGeometry(size, segs) {
  const n = segs + 1;
  const pos = new Float32Array(n * n * 3);
  const map = (u) => Math.sign(u) * size * (0.07 * Math.abs(u) + 0.93 * Math.abs(u) ** 3);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const z = map((j / segs) * 2 - 1);
    for (let i = 0; i < n; i++) {
      pos[k++] = map((i / segs) * 2 - 1); pos[k++] = 0; pos[k++] = z;
    }
  }
  const idx = new Uint32Array(segs * segs * 6);
  k = 0;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const vertexShader = /* glsl */ `
${WAVE_GLSL}
varying vec3 vWorld;
varying float vH;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = waveHeight(wp.xz);
  wp.y += h;
  vWorld = wp.xyz;
  vH = h;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uTrough;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uFace;
uniform vec3 uSkyColor;
uniform vec3 uSunDir;
uniform vec3 uLightCol;
uniform vec3 uAmbient;
uniform vec4 uLantern;
uniform float uLanternR;
uniform float uRain;
uniform vec2 uWindDir;
uniform float uWindStr;
varying vec3 vWorld;
varying float vH;
${WAVE_GLSL}
${NOISE_GLSL}
#include <fog_pars_fragment>
#ifdef LOW_Q
  #define FOAM_OCT 2
#else
  #define FOAM_OCT 4
#endif
float fbmF(vec2 x) {
  float s = 0.0, a = 0.5, norm = 0.0;
  for (int i = 0; i < FOAM_OCT; i++) { s += a * vnoise(x); norm += a; x = x * 2.03 + 17.1; a *= 0.5; }
  return s / norm;
}
// Crisp, anti-aliased threshold of a scalar field (cel-style edge).
float cel(float field, float thr) {
  float w = fwidth(field) * 2.2 + 0.01; // slightly soft edges
  return smoothstep(thr - w, thr + w, field);
}
void main() {
  vec2 p = vWorld.xz;
  float e = 0.5;
  float hL = waveHeight(p - vec2(e, 0.0)), hR = waveHeight(p + vec2(e, 0.0));
  float hD = waveHeight(p - vec2(0.0, e)), hU = waveHeight(p + vec2(0.0, e));
  vec3 n = normalize(vec3(hL - hR, 2.0 * e, hD - hU));
  float amp = max(uWaveScale * 1.25, 0.05);
  float hn = (hL + hR + hD + hU) * 0.25 / amp;
  float dist = length(cameraPosition - vWorld);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 sd = normalize(uSunDir);

  // ---- water body: dark troughs, petrol blue, lighter crests (stepped)
  vec3 col = mix(uTrough, uDeep, smoothstep(-0.34, -0.26, hn));
  col = mix(col, uMid, smoothstep(0.28, 0.36, hn));
  // wave faces turned toward the viewer glow teal (subsurface feel)
  float slope = length(n.xz);
  vec2 vh = normalize(v.xz + vec2(1e-5));
  float facing = dot(n.xz / max(slope, 1e-4), vh) * slope * 7.0;
  col = mix(col, uFace, smoothstep(0.16, 0.26, facing) * smoothstep(-0.15, 0.4, hn) * 0.85);
  // slow-drifting large patches of deeper / brighter water
  float big = vnoise(p * 0.0025 + vec2(uTime * 0.004, -uTime * 0.003)) * 0.6
            + vnoise(p * 0.0011 + vec2(17.0 - uTime * 0.002, 4.0)) * 0.4;
  col *= mix(0.93, 1.05, smoothstep(0.47, 0.53, big));
  // toon slope shading relative to a flat sea
  float rel = dot(n, sd) - sd.y;
  col *= rel > 0.03 ? 1.08 : (rel < -0.05 ? 0.88 : 1.0);

  // ---- wind-blown foam, in wind space (x = downwind, y = across)
  vec2 wd = normalize(uWindDir + vec2(1e-4, 0.0));
  vec2 ws = vec2(dot(p, wd), dot(p, vec2(-wd.y, wd.x)));
  ws.x -= uTime * 0.8; // foam drifts slowly downwind
  float A = clamp(uWindStr * 0.55 + uWaveScale * 0.75 - 0.38, 0.05, 1.3); // how foamy the sea is
  float detail = 1.0 - smoothstep(200.0, 560.0, dist);
  float crestBias = smoothstep(-0.1, 0.95, hn);

  vec2 fq = ws * vec2(0.026, 0.12);                        // stretched along the wind
  vec2 warp = vec2(vnoise(fq * 0.6 + 3.7), vnoise(fq * 0.6 + 9.2)) - 0.5;
  float streak = fbmF(fq + warp * 1.5);
  // ragged, lacy edges and holes inside the patches
  float rag = vnoise(ws * vec2(0.16, 0.42) + warp * 3.0 + 5.0) * 0.6 + vnoise(ws * vec2(0.45, 1.1) + 11.0) * 0.4;
  float trail = 0.0;
#ifndef LOW_Q
  // foam lingers downwind of crests that just passed
  trail = smoothstep(0.55, 0.95, waveHeight(p - wd * 3.5) / amp);
#endif
  // only a light link to the (fast-moving) wave crests, so foam doesn't race past
  float field = streak + (rag - 0.5) * 0.5 + crestBias * 0.04 + trail * 0.02;
  float foam = cel(field, 0.97 - A * 0.15) * detail;

  // whitecaps: ragged patches on the highest crests, more in rough seas
  float capN = vnoise(p * 0.12 + wd * uTime * 0.12) * 0.6 + vnoise(p * 0.42 - uTime * 0.06) * 0.4;
  float capThr = 1.24 - smoothstep(0.3, 1.4, uWaveScale) * 0.42 - clamp(uWindStr - 0.8, 0.0, 0.8) * 0.08; // fewer caps in fair weather, same in storms
  float capBreak = cel(vnoise(ws * vec2(0.05, 0.12) + 7.0) + (rag - 0.5) * 0.35, 0.5);
  foam = max(foam, cel(hn + (capN - 0.5) * 0.55, capThr) * capBreak * (1.0 - smoothstep(400.0, 900.0, dist)));

#ifndef LOW_Q
  // thin lace tendrils threading through the streaks
  float rn = vnoise(ws * vec2(0.1, 0.32) + warp * 2.5);
  float ridge = 1.0 - abs(rn * 2.0 - 1.0);
  float tendril = cel(ridge, 0.955 - A * 0.04) * smoothstep(0.5, 0.66, streak + crestBias * 0.15)
                * (1.0 - smoothstep(70.0, 260.0, dist));
  // hair-thin lines shimmer as the surface heaves, so keep them for rough seas
  foam = max(foam, tendril * smoothstep(0.9, 1.3, uWaveScale));
  // scattered specks, denser on crests
  vec2 sc = ws * vec2(0.35, 0.8);
  vec2 si = floor(sc);
  vec2 sf = fract(sc) - 0.5 - (vec2(hash12(si + 4.0), hash12(si + 6.0)) - 0.5) * 0.5;
  float sl = length(sf * vec2(0.45, 1.0)) + (vnoise(sc * 6.0) - 0.5) * 0.06;
  float speck = (1.0 - cel(sl, 0.05 + hash12(si + 2.0) * 0.08))
              * step(0.95 - A * 0.08 - crestBias * 0.01, hash12(si))
              * (1.0 - smoothstep(50.0, 160.0, dist));
  foam = max(foam, speck * 0.6);
#endif
  // far away, unresolvable foam just lightens the water a touch
  float farFoam = (1.0 - detail) * A * 0.12;

  // rain dimples
  vec2 rc = p * 1.2;
  float rd = step(0.94, hash12(floor(rc) + floor(uTime * 6.0))) * (1.0 - step(0.18, length(fract(rc) - 0.5)))
    * uRain * (1.0 - smoothstep(20.0, 60.0, dist));
  foam = max(foam, rd * 0.6);

  // ---- lighting
  vec3 light = uAmbient + uLightCol;
  float ld = length(vWorld - uLantern.xyz);
  light += vec3(1.0, 0.72, 0.38) * uLantern.w * (step(ld, uLanternR * 0.45) * 0.35 + step(ld, uLanternR) * 0.35);
  vec3 lit = col * light;
  // sky reflection toward grazing angles: hazy grey-teal near the horizon
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  lit = mix(lit, uSkyColor * 0.9, clamp(F, 0.0, 1.0) * 0.38);
  // off-white, slightly sea-tinted foam that doesn't glare
  vec3 foamCol = vec3(0.84, 0.9, 0.93) * min(light, vec3(1.05));
  lit = mix(lit, foamCol, max(foam, farFoam) * 0.82);

  // ---- sun (or moon) glitter path, widening and warming as the sun drops
  float spec = dot(reflect(-v, n), sd);
  float low = 1.0 - smoothstep(0.12, 0.55, sd.y);
  float noFoam = 1.0 - foam;
  lit += uLightCol * smoothstep(0.985 - low * 0.05, 1.0, spec) * (0.25 + low * 0.55) * noFoam;
  vec2 gc = p * 1.4 + n.xz * 2.0;
  vec2 gi = floor(gc);
  float twinkle = step(0.8, hash12(gi + floor(uTime * 1.2 + hash12(gi) * 4.0)));
  float glit = step(mix(0.994, 0.94, low), spec + (hash12(gi + 9.0) - 0.5) * 0.02) * twinkle
             * (1.0 - step(0.22, length(fract(gc) - 0.5)));
  glit = max(glit * (1.0 - smoothstep(250.0, 1200.0, dist)), step(0.996, spec));
  lit += glit * uLightCol * (0.6 + low * 0.9) * noFoam;

  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Ocean {
  constructor(scene, quality) {
    const segs = quality === 'low' ? 140 : 220;
    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...waveUniforms,
      uTrough: { value: new THREE.Color('#134a63') },
      uDeep: { value: new THREE.Color('#1d5b78') },
      uMid: { value: new THREE.Color('#2a6f8c') },
      uFace: { value: new THREE.Color('#2f8e8c') },
      uSkyColor: { value: new THREE.Color('#bfe4ff') },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uWindStr: { value: 0.9 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uLightCol: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
      uLantern: { value: new THREE.Vector4(0, 0, 0, 0) },
      uLanternR: { value: 30 },
      uRain: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader, fog: true,
      defines: quality === 'low' ? { LOW_Q: 1 } : {},
    });
    this.mesh = new THREE.Mesh(oceanGeometry(4200, segs), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }
  // Called every frame with the weather wind (direction it blows toward, any length).
  setWind(x, z, strength) {
    const l = Math.hypot(x, z);
    if (l > 1e-6) this.uniforms.uWindDir.value.set(x / l, z / l);
    this.uniforms.uWindStr.value = strength;
  }
  update(camera) {
    // Follow the camera, snapped so vertices don't swim.
    this.mesh.position.set(Math.round(camera.position.x / 8) * 8, 0, Math.round(camera.position.z / 8) * 8);
  }
}
