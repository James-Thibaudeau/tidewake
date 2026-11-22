// Stylised toon ocean: one big, centre-weighted grid that follows the camera.
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
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uSunDir;
uniform vec3 uLightCol;
uniform vec3 uAmbient;
uniform vec4 uLantern;
uniform float uLanternR;
uniform float uRain;
varying vec3 vWorld;
varying float vH;
${WAVE_GLSL}
${NOISE_GLSL}
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz;
  float e = 0.5;
  float hL = waveHeight(p - vec2(e, 0.0)), hR = waveHeight(p + vec2(e, 0.0));
  float hD = waveHeight(p - vec2(0.0, e)), hU = waveHeight(p + vec2(0.0, e));
  vec3 n = normalize(vec3(hL - hR, 2.0 * e, hD - hU));
  float amp = max(uWaveScale * 1.25, 0.05);
  float hn = (hL + hR + hD + hU) * 0.25 / amp;
  float dist = length(cameraPosition - vWorld);

  // two-tone body: crests get the lighter blue
  vec3 col = mix(uDeep, uMid, smoothstep(0.32, 0.40, hn));
  // slow-drifting large patches of deeper / brighter water (toon-stepped)
  float big = vnoise(p * 0.0025 + vec2(uTime * 0.004, -uTime * 0.003)) * 0.6
            + vnoise(p * 0.0011 + vec2(17.0 - uTime * 0.002, 4.0)) * 0.4;
  col *= mix(0.92, 1.06, smoothstep(0.47, 0.53, big));
  // toon slope shading relative to a flat sea
  vec3 sd = normalize(uSunDir);
  float rel = dot(n, sd) - sd.y;
  col *= rel > 0.035 ? 1.10 : (rel < -0.05 ? 0.86 : 1.0);

  // Swirly white contour lines, the signature cartoon-sea pattern
  vec2 q = p * 0.045;
  vec2 warp = vec2(vnoise(q * 0.7 + uTime * 0.05), vnoise(q * 0.7 + 5.2 - uTime * 0.04));
  float nn = vnoise(q + warp * 1.6 + vec2(uTime * 0.02, -uTime * 0.015));
  float fw = fwidth(nn);
  float line = 1.0 - smoothstep(fw * 0.5 + 0.003, fw * 1.5 + 0.008, abs(nn - 0.5));
  float mask = smoothstep(0.6, 0.72, vnoise(p * 0.006 + vec2(3.1, uTime * 0.01)));
  float foam = line * mask * (1.0 - smoothstep(150.0, 450.0, dist)) * 0.85;
  // crest caps in rough seas
  float cn = vnoise(p * 0.22 + uTime * 0.3);
  float crest = step(0.9, hn + (cn - 0.5) * 0.3) * step(0.45, vnoise(p * 0.9 - uTime * 0.2)) * smoothstep(0.5, 1.1, uWaveScale);
  foam = max(foam, crest);
  // rain dimples
  vec2 rc = p * 1.2;
  float rd = step(0.94, hash12(floor(rc) + floor(uTime * 6.0))) * (1.0 - step(0.18, length(fract(rc) - 0.5)))
    * uRain * (1.0 - smoothstep(20.0, 60.0, dist));
  foam = max(foam, rd * 0.6);

  float ripple = 0.0, sparkle = 0.0;
#ifndef LOW_Q
  // finer secondary swirl lines close to the camera
  vec2 q2 = p * 0.16;
  vec2 warp2 = vec2(vnoise(q2 * 0.6 + uTime * 0.12), vnoise(q2 * 0.6 + 9.1 - uTime * 0.1));
  float n2 = vnoise(q2 + warp2 * 1.3 + vec2(-uTime * 0.05, uTime * 0.04));
  float fw2 = fwidth(n2);
  float line2 = 1.0 - smoothstep(fw2 * 0.5 + 0.002, fw2 * 1.5 + 0.006, abs(n2 - 0.5));
  float mask2 = smoothstep(0.55, 0.7, vnoise(p * 0.03 + vec2(uTime * 0.02, 7.7)));
  foam = max(foam, line2 * mask2 * (1.0 - smoothstep(35.0, 120.0, dist)) * 0.5);

  // little wind-ripple chevrons drifting with the swell
  vec2 wd = vec2(0.94, 0.34);
  vec2 r = vec2(dot(p, wd), dot(p, vec2(-wd.y, wd.x))) * vec2(0.8, 0.65) + vec2(uTime * 0.45, 0.0);
  vec2 ci = floor(r);
  vec2 f = fract(r) - 0.5;
  f -= (vec2(hash12(ci + 3.1), hash12(ci + 7.7)) - 0.5) * 0.4;
  float chev = abs(f.x + abs(f.y) * 0.8);
  float cw = fwidth(chev) + 1e-4;
  ripple = (1.0 - smoothstep(0.03, 0.03 + cw * 1.5, chev)) * step(abs(f.y), 0.2)
         * step(0.86, hash12(ci + floor(uTime * 0.4 + hash12(ci) * 4.0)))
         * (1.0 - smoothstep(15.0, 55.0, dist));

  // twinkling toon sparkles on sunlit crests
  vec2 sc = p * 1.3 + vec2(uTime * 0.2, uTime * 0.1);
  vec2 si = floor(sc);
  float sl = length(fract(sc) - 0.5);
  float sfw = fwidth(sl) + 1e-4;
  sparkle = (1.0 - smoothstep(0.07, 0.07 + sfw * 1.5, sl))
          * step(0.95, hash12(si + floor(uTime * 3.0 + hash12(si) * 3.0)))
          * smoothstep(0.2, 0.45, hn) * step(0.0, rel + 0.02) * step(0.05, sd.y)
          * (1.0 - smoothstep(20.0, 110.0, dist)) * (1.0 - uRain);
#endif

  vec3 light = uAmbient + uLightCol;
  float ld = length(vWorld - uLantern.xyz);
  light += vec3(1.0, 0.72, 0.38) * uLantern.w * (step(ld, uLanternR * 0.45) * 0.35 + step(ld, uLanternR) * 0.35);
  vec3 lit = col * light;
  lit = mix(lit, vec3(0.92, 0.97, 1.0) * min(light, vec3(1.15)), foam);
  lit = mix(lit, mix(uMid, vec3(0.9, 0.96, 1.0), 0.35) * light, ripple * 0.4);
  lit += sparkle * (uLightCol * 0.9 + 0.05);

  // sharp toon sun glints
  vec3 v = normalize(cameraPosition - vWorld);
  float spec = dot(reflect(-v, n), sd);
  lit += step(0.993, spec) * step(0.02, sd.y) * uLightCol * 0.9;

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
      uDeep: { value: new THREE.Color('#1856c4') },
      uMid: { value: new THREE.Color('#3a86e8') },
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
  update(camera) {
    // Follow the camera, snapped so vertices don't swim.
    this.mesh.position.set(Math.round(camera.position.x / 8) * 8, 0, Math.round(camera.position.z / 8) * 8);
  }
}
