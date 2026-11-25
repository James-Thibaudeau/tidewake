// Stylised ocean: deep navy water with teal wave faces, bold lacy foam streaks, whitecaps,
// a little sky reflection and a low-sun glitter path. One centre-weighted grid follows the camera.
import * as THREE from 'three';
import { WAVE_GLSL, WAVE_LOD_GLSL, NOISE_GLSL, waveUniforms } from './waves.js';

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
uniform vec3 uCalm;
// Ashore, water inside the island (a moat) lies still: no swell within uCalm.z of uCalm.xy.
float calmK(vec2 p) { return uCalm.z > 0.0 ? smoothstep(uCalm.z, uCalm.z + 4.0, distance(p, uCalm.xy)) : 1.0; }
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = waveHeight(wp.xz) * calmK(wp.xz);
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
uniform vec3 uCrest;
uniform vec3 uSkyColor;
uniform vec3 uSunDir;
uniform vec3 uLightCol;
uniform vec3 uAmbient;
uniform vec4 uLantern;
uniform float uLanternR;
uniform float uRain;
uniform vec2 uWindDir;
uniform float uWindStr;
uniform vec3 uCalm;
varying vec3 vWorld;
varying float vH;
${WAVE_GLSL}
${WAVE_LOD_GLSL}
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
  float w = fwidth(field) * 1.6 + 0.004; // crisp, just anti-aliased
  return smoothstep(thr - w, thr + w, field);
}
void main() {
  vec2 p = vWorld.xz;
  float e = 0.5;
  float calm = uCalm.z > 0.0 ? smoothstep(uCalm.z, uCalm.z + 4.0, distance(p, uCalm.xy)) : 1.0;
  float dist = length(cameraPosition - vWorld);
  // Far water: waves too small for a pixel drop out, and the rest lose contrast with distance.
  setWaveLod(max(length(dFdx(p)), length(dFdy(p))), dist);
  // The waves are a few fixed sines, so on their own they tile into a grid. Away from the
  // boat, bend where the colouring samples them so the grid never lines up across the view...
  vec2 drift = vec2(uTime * 0.003, -uTime * 0.002);
  vec2 bend = (vec2(vnoise(p * 0.0065 + 31.0 + drift), vnoise(p * 0.0065 + 77.0 - drift)) - 0.5) * 45.0
            + (vec2(vnoise(p.yx * 0.0019 + 5.0 - drift), vnoise(p.yx * 0.0019 + 53.0 + drift)) - 0.5) * 90.0;
  vec2 pw = p + bend * smoothstep(50.0, 300.0, dist);
  // ...and let the sea run livelier in some stretches and flatter in others.
  float lively = vnoise(p * 0.0052 + 11.0 + drift * 2.0) * 0.6 + vnoise(p.yx * 0.0127 + 3.0 - drift * 2.0) * 0.4;
  float waveK = calm * mix(0.3, 1.35, smoothstep(0.25, 0.75, lively));
  float hL = waveHeightLod(pw - vec2(e, 0.0)) * waveK, hR = waveHeightLod(pw + vec2(e, 0.0)) * waveK;
  float hD = waveHeightLod(pw - vec2(0.0, e)) * waveK, hU = waveHeightLod(pw + vec2(0.0, e)) * waveK;
  vec3 n = normalize(vec3(hL - hR, 2.0 * e, hD - hU));
  float amp = max(uWaveScale * 1.25 + uSwellScale * 3.2, 0.05);
  float hn = (hL + hR + hD + hU) * 0.25 / amp;
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 sd = normalize(uSunDir);

  // ---- water body: deep navy troughs rising smoothly to blue, teal where a face catches the light
  float slope = length(n.xz);
  vec3 col = mix(uTrough, uDeep, smoothstep(-0.5, 0.05, hn));
  col = mix(col, uMid, smoothstep(0.0, 0.7, hn) * 0.7);
  // wave faces turned toward the viewer or the sun glow teal (light through the crest)
  vec2 nh = n.xz / max(slope, 1e-4);
  vec2 vh = normalize(v.xz + vec2(1e-5));
  vec2 sh = normalize(sd.xz + vec2(1e-5));
  float facing = max(dot(nh, vh), dot(nh, sh) * 0.8) * slope * 7.0;
  // slow-drifting large patches where the teal comes through more readily
  float big = vnoise(p * 0.0025 + vec2(uTime * 0.004, -uTime * 0.003)) * 0.6
            + vnoise(p * 0.0011 + vec2(17.0 - uTime * 0.002, 4.0)) * 0.4;
  float patchK = smoothstep(0.35, 0.65, big);
  float glow = smoothstep(0.04 - patchK * 0.1, 0.5, facing) * smoothstep(-0.35, 0.55, hn);
  glow = max(glow, patchK * smoothstep(-0.1, 0.8, hn) * 0.45);
  glow *= 1.0 - uLantern.w * 0.85; // no sunlight to shine through the crests at night (w = nightness)
  // far off, where single waves no longer read, broad soft patches carry the colour instead
  float farK = smoothstep(150.0, 700.0, dist) * (1.0 - uLantern.w * 0.85);
  glow = max(glow, farK * (0.1 + smoothstep(0.3, 0.7, big) * 0.3 + smoothstep(0.35, 0.8, lively) * 0.22));
  col = mix(col, uFace, glow * 0.9);
  col = mix(col, uCrest, smoothstep(0.55, 1.0, hn) * glow * 0.6);
  // back slopes fall off into shade
  float rel = dot(n, sd) - sd.y;
  col *= 1.0 + clamp(rel * 1.6, -0.16, 0.08);

  // ---- foam: lacy streaks in wind space (x = downwind, y = across), draped over the swell
  vec2 wd = normalize(uWindDir + vec2(1e-4, 0.0));
  vec2 wp = vec2(-wd.y, wd.x);
  vec2 ws = vec2(dot(p, wd), dot(p, wp));
  ws.x -= uTime * 0.8; // foam drifts slowly downwind
  float A = clamp(uWindStr * 0.55 + uWaveScale * 0.75 - 0.38, 0.05, 1.3); // how foamy the sea is
  float detail = 1.0 - smoothstep(260.0, 700.0, dist);
  float crestBias = smoothstep(-0.2, 0.9, hn);
  // the pattern slides a little with the surface slope, so streaks bend over each wave
  vec2 fp = ws + vec2(dot(n.xz, wd), dot(n.xz, wp)) * 5.0;

  vec2 fq = fp * vec2(0.08, 0.22);                        // stretched along the wind
  vec2 warp = vec2(vnoise(fq * 0.55 + 3.7), vnoise(fq * 0.55 + 9.2)) - 0.5;
  fq += warp * 2.6;
  // winding veins (ridged noise) that swell into patches where the body field is high
  // ragged edges and holes
  float rag = vnoise(fp * vec2(0.22, 0.55) + warp * 3.0 + 5.0) * 0.5 + vnoise(fp * vec2(0.6, 1.3) + 11.0) * 0.32
            + vnoise(fp * vec2(1.5, 2.6) + 2.0) * 0.18;
  // winding veins (ridged noise) that swell into lacy patches where the body field is high
  float veinN = fbmF(fq) + (rag - 0.5) * 0.05;
  // Where the noise is nearly flat a ridge would fill in as one big slab, so narrow it by
  // the noise's own gradient (taken in pattern space from screen derivatives).
  vec2 qx = dFdx(fq), qy = dFdy(fq);
  float det = qx.x * qy.y - qx.y * qy.x;
  float gx = dFdx(veinN), gy = dFdy(veinN);
  float grad = length(vec2(gx * qy.y - gy * qx.y, gy * qx.x - gx * qy.x)) / max(abs(det), 1e-9);
  float flatK = clamp(0.5 / max(grad, 0.05), 1.0, 5.0);
  float vein = 1.0 - clamp(abs(veinN - 0.5) * 5.0 * flatK, 0.0, 1.0);
  float body = vnoise(fq * 0.45 + 21.0) * 0.65 + vnoise(fq * 1.3 + 5.0) * 0.35;
  float trail = 0.0;
#ifndef LOW_Q
  // foam lingers downwind of crests that just passed
  trail = smoothstep(0.45, 0.95, waveHeight(p - wd * 3.5) / amp);
#endif
  // only a light link to the (fast-moving) wave crests, so foam doesn't race past
  float field = vein * 0.7 + body * 0.25 + (rag - 0.5) * 0.55 + crestBias * 0.07 + trail * 0.03;
  // whitecaps: the lace thickens on the highest crests, more in rough seas, rather than
  // breaking out as a separate slab of white
  float capN = vnoise(p * 0.12 + wd * uTime * 0.12) * 0.6 + vnoise(p * 0.42 - uTime * 0.06) * 0.4;
  float capThr = 1.24 - smoothstep(0.3, 1.4, uWaveScale) * 0.42 - clamp(uWindStr - 0.8, 0.0, 0.8) * 0.08; // fewer caps in fair weather, same in storms
  float cap = smoothstep(capThr - 0.3, capThr + 0.1, hn + (capN - 0.5) * 0.55) * (1.0 - smoothstep(400.0, 900.0, dist));
  float foam = cel(field + cap * 0.2, 0.94 - A * 0.085) * detail;

#ifndef LOW_Q
  // scattered flecks trailing off the streaks
  vec2 sc = fp * vec2(0.55, 0.9);
  vec2 si = floor(sc);
  vec2 sf = fract(sc) - 0.5 - (vec2(hash12(si + 4.0), hash12(si + 6.0)) - 0.5) * 0.5;
  float sl = length(sf * vec2(0.6, 1.0)) + (vnoise(sc * 6.0) - 0.5) * 0.06;
  float speck = (1.0 - cel(sl, 0.06 + hash12(si + 2.0) * 0.1))
              * step(0.97 - A * 0.08, hash12(si) * 0.45 + field * 0.6)
              * (1.0 - smoothstep(60.0, 190.0, dist));
  foam = max(foam, speck);
#endif
  // far away, unresolvable foam just lightens the water a touch
  float farFoam = (1.0 - detail) * A * 0.1;

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
  lit = mix(lit, uSkyColor * 0.9, clamp(F, 0.0, 1.0) * 0.24);
  // off-white, slightly sea-tinted foam that doesn't glare
  vec3 foamCol = vec3(0.9, 0.95, 0.97) * min(light, vec3(1.05));
  lit = mix(lit, foamCol, max(foam, farFoam) * 0.94);

  // ---- sun (or moon) glitter path, widening and warming as the sun drops
  float spec = dot(reflect(-v, n), sd);
  float low = 1.0 - smoothstep(0.12, 0.55, sd.y);
  float noFoam = 1.0 - foam;
  lit += uLightCol * smoothstep(0.985 - low * 0.05, 1.0, spec) * (0.08 + low * 0.6) * noFoam;
  vec2 gc = p * 1.4 + n.xz * 2.0;
  vec2 gi = floor(gc);
  float twinkle = step(0.8, hash12(gi + floor(uTime * 1.2 + hash12(gi) * 4.0)));
  float glit = step(mix(0.994, 0.94, low), spec + (hash12(gi + 9.0) - 0.5) * 0.02) * twinkle
             * (1.0 - step(0.22, length(fract(gc) - 0.5)));
  glit = max(glit * (1.0 - smoothstep(250.0, 1200.0, dist)), step(0.996, spec));
  lit += glit * uLightCol * (0.25 + low * 1.1) * noFoam;

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
      uTrough: { value: new THREE.Color('#0d2f5e') },
      uDeep: { value: new THREE.Color('#114b7a') },
      uMid: { value: new THREE.Color('#1b6492') },
      uFace: { value: new THREE.Color('#2a9a96') },
      uCrest: { value: new THREE.Color('#58bfae') },
      uSkyColor: { value: new THREE.Color('#bfe4ff') },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uWindStr: { value: 0.9 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uLightCol: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
      uLantern: { value: new THREE.Vector4(0, 0, 0, 0) },
      uLanternR: { value: 30 },
      uRain: { value: 0 },
      uCalm: { value: new THREE.Vector3(0, 0, 0) }, // (x, z, radius): still water inside; radius 0 = off
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
