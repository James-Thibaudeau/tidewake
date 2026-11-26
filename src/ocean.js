// Stylised ocean: deep navy water with teal wave faces, bold lacy foam streaks, whitecaps,
// a little sky reflection and a low-sun glitter path. One centre-weighted grid follows the camera.
// Three things larger than a wave give the eye something to read: paler water over the
// shallows round a shore (shoreMap), darker gust bands running downwind, and the shadows of
// the clouds. All three only colour the water; its shape, and how a boat rides it, is waves.js.
// Home waters (sea-zones.js) are the shallows at their strongest: clear turquoise water
// with the sand showing through (SHALLOWS_GLSL below, kept in a block of its own).
import * as THREE from 'three';
import { WAVE_GLSL, WAVE_LOD_GLSL, NOISE_GLSL, waveUniforms } from './waves.js';
import { clamp, smoothstep } from './util.js';

/**
 * A map of how near a shore every piece of the sea is, for the depth tint: one byte a
 * texel, 0 at a shore and 255 in open water. `shores` is a list of
 * { x, z, reach, shelf, dist(x, z) }: `dist` is the metres from a point to that shore
 * (0 or less on land), `shelf` how far out its shallows run, `reach` its own radius.
 * The map covers -half..half on x and z.
 */
export function shoreMap(shores, half, res = 1024) {
  const data = new Uint8Array(res * res).fill(255);
  const cell = (half * 2) / res;
  const at = (i) => (i + 0.5) * cell - half;
  const idx = (v) => clamp(Math.floor((v + half) / cell), 0, res - 1);
  for (const S of shores) {
    const R = S.reach + S.shelf;
    for (let j = idx(S.z - R); j <= idx(S.z + R); j++) {
      for (let i = idx(S.x - R); i <= idx(S.x + R); i++) {
        const v = Math.round(clamp(S.dist(at(i), at(j)) / S.shelf, 0, 1) * 255);
        if (v < data[j * res + i]) data[j * res + i] = v;
      }
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

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
${NOISE_GLSL}
varying vec3 vWorld;
varying float vH;
varying float vCloud;
varying vec3 vSea;
uniform vec3 uCalm;
uniform vec4 uCloud;
uniform vec2 uCloudDir;
// Ashore, water inside the island (a moat) lies still: no swell within uCalm.z of uCalm.xy.
float calmK(vec2 p) { return uCalm.z > 0.0 ? smoothstep(uCalm.z, uCalm.z + 4.0, distance(p, uCalm.xy)) : 1.0; }
// How thick the cloud between a point on the water and the sun is: the sky's own cloud
// pattern (sky.js: the same frame, drift and warp), with fewer octaves. Clouds are hundreds
// of metres across, so this is worked out at each corner of the grid, not at every pixel.
float cloudAt(vec2 p) {
  vec2 w = p + uCloud.xy;
  vec2 q = vec2(dot(w, uCloudDir), dot(w, vec2(-uCloudDir.y, uCloudDir.x))) * vec2(0.00085, 0.0027);
  mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
  vec2 a = q * 1.6 + 3.1, b = q * 1.6 - 5.7;
  q += vec2(vnoise(a) * 0.5 + vnoise(r * a) * 0.25, vnoise(b) * 0.5 + vnoise(r * b) * 0.25) * 0.9;
  vec2 q2 = r * q;
  return (vnoise(q) * 0.5 + vnoise(q2) * 0.25 + vnoise(r * q2) * 0.125) * 1.107;
}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vCloud = uCloud.w > 0.001 ? cloudAt(wp.xz) : 0.0;
  // what the sea zones say here (wave factor, swell factor, clear shallows), worked out at
  // each corner of the grid: the fades are hundreds of metres wide, so a pixel needn't ask
  vSea = vec3(seaWaveK(wp.xz), seaShallowK(wp.xz));
  float h = waveHeightK(wp.xz, vSea.xy) * calmK(wp.xz);
  wp.y += h;
  vWorld = wp.xyz;
  vH = h;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// ---- home waters: the clear shallows -------------------------------------------------
// A block of its own: one function, called once from the fragment shader's main(), after
// the water's body colour and before the foam, so foam and wave faces stay on top.
// `k` is how much of home waters is here (vSea.z, from sea-zones.js) and `off` the shore
// map's reading (0 at a shore, 1 in open water): the nearer a shore, the less water over
// the sand. There is no seabed: the pattern is drawn where the line of sight would meet
// one a little way down, so it slides under the surface like real depth, and it fades
// with distance and at a shallow angle, where water only shows the sky.
const lin = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const SHALLOWS_GLSL = /* glsl */ `
vec3 clearShallows(vec3 col, vec2 p, vec3 v, vec3 n, float hn, float off, float dist, float k) {
  if (k <= 0.001) return col;
  // the edge is a lumpy bank, not a ring: the fade is pushed in and out, most at its middle
  // (and the bank drops off quickly there, with a paler lip of sand just inside it)
  float e = k, lip = 0.0;
  if (k < 0.999) {
    vec2 pr = vec2(p.x * 0.8 + p.y * 0.6, p.y * 0.8 - p.x * 0.6); // turned, so the lumps don't line up
    float lump = vnoise(p * 0.0045 + 61.0) * 0.5 + vnoise(pr * 0.011 + 17.0) * 0.32 + vnoise(pr.yx * 0.037 + 5.0) * 0.18 - 0.5;
    float kk = k + lump * 3.2 * k * (1.0 - k);
    e = smoothstep(0.46, 0.54, kk);
    lip = e * (1.0 - smoothstep(0.54, 0.74, kk));
  }
  float day = 1.0 - uLantern.w * 0.8;
  // the water itself turns turquoise, paler up a wave's face
  vec3 water = mix(${lin('#178a9e')}, ${lin('#43c6bf')}, max(smoothstep(-0.5, 0.8, hn), lip * 0.8));
  col = mix(col, water, e * (0.62 + lip * 0.2) * mix(0.3, 1.0, day));
  // the bed shows where you look down into the water near you, by day, and less under rain
  float see = e * (1.0 - smoothstep(60.0, 240.0, dist)) * smoothstep(0.06, 0.32, v.y) * day * (1.0 - uRain * 0.6);
  if (see > 0.004) {
    float deep = smoothstep(0.0, 0.6, off);
    float depth = mix(1.6, 5.5, deep);
    // where this line of sight meets the bed; each wave bends it a little
    vec2 bp = p - v.xz / max(v.y, 0.3) * depth + n.xz * depth * 2.0;
    float aa = 0.03 + dist * 0.0012;
    // sand, with darker beds of weed
    float weed = vnoise(bp * 0.035 + 7.0) * 0.65 + vnoise(bp * 0.11 + 23.0) * 0.35;
    vec3 bed = mix(${lin('#9fe0c8')}, ${lin('#2a9a8c')}, smoothstep(0.58 - aa, 0.58 + aa, weed) * 0.75);
    // ripple bands in the sand
    float rip = sin((bp.x * 0.5 + bp.y * 0.85 + vnoise(bp * 0.09 + 3.0) * 9.0) * 1.4);
    bed *= 1.0 - smoothstep(0.35 - aa, 0.35 + aa, rip) * 0.11 * (1.0 - smoothstep(50.0, 150.0, dist));
    // slow caustic lines, where two drifting patterns agree; fainter without the sun on the water
    vec2 cq = bp * 0.28;
    float ca = vnoise(cq + vec2(uTime * 0.05, uTime * 0.03));
    float cb = vnoise(cq * 1.31 + 11.0 - vec2(uTime * 0.04, -uTime * 0.045));
    bed += ${lin('#e9fff2')} * (1.0 - smoothstep(0.015, 0.04 + aa * 0.5, abs(ca - cb))) * mix(0.1, 0.3, clamp(uCloud.w * 1.25, 0.0, 1.0));
    col = mix(col, bed, see * mix(0.7, 0.42, deep));
  }
  return col;
}
`;

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
uniform vec4 uBloom; // (x, z, radius, strength): a patch of glowing sea; strength 0 = off
uniform vec2 uWindDir;
uniform float uWindStr;
uniform vec3 uCalm;
uniform vec3 uShallow;
uniform sampler2D uShoreMap;
uniform float uShore;
uniform vec3 uBig;
uniform vec4 uShoal;
uniform vec4 uCloud;
varying vec3 vWorld;
varying float vH;
varying float vCloud;
varying vec3 vSea;
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
${SHALLOWS_GLSL}
void main() {
  vec2 p = vWorld.xz;
  // the weather's wave scale and swell as the sea zones leave them here (half in home waters)
  float seaWave = uWaveScale * vSea.x, seaSwell = uSwellScale * vSea.y;
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
  vec2 tilt;
  float hC = waveLod(pw, vSea.xy, tilt) * waveK;
  vec3 n = normalize(vec3(-tilt.x * waveK, 1.0, -tilt.y * waveK));
  float amp = max(seaWave * 1.25 + seaSwell * 3.2, 0.05);
  float hn = hC / amp;
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 sd = normalize(uSunDir);

  // ---- larger than a wave: the shallows, gusts and cloud shadows
  // 0 at a shore, 1 in open water: from the shore map at sea, or round the island you are on
  float off = uShoal.z > 0.0 ? clamp((distance(p, uShoal.xy) - uShoal.z) / uShoal.w, 0.0, 1.0)
                             : texture2D(uShoreMap, p * uShore + 0.5).r;
  // (a ragged edge: sandbars and channels, not a ring drawn with compasses)
  if (off < 0.999) off += (vnoise(p * 0.021 + 13.0) * 0.6 + vnoise(p * 0.057 + 29.0) * 0.4 - 0.5) * 0.2 * smoothstep(0.0, 0.1, off);
  float shoal = (1.0 - smoothstep(0.02, 0.24, off)) * uBig.x;
  float shelf = (1.0 - smoothstep(0.08, 1.0, off)) * uBig.x;
  // wind space: x = downwind, y = across
  vec2 wd = normalize(uWindDir + vec2(1e-4, 0.0));
  vec2 wp = vec2(-wd.y, wd.x);
  vec2 ws = vec2(dot(p, wd), dot(p, wp));
  // gusts: darker, ruffled bands running downwind, faster than the foam drifts
  vec2 gq = vec2(ws.x - uTime * 5.0, ws.y);
  float gustN = vnoise(gq * vec2(0.0042, 0.013) + 40.0) * 0.65 + vnoise(gq * vec2(0.011, 0.031) + 7.0) * 0.35;
  float gust = smoothstep(0.52, 0.66, gustN) * smoothstep(0.6, 1.15, uWindStr) * calm * uBig.y;
  // cloud shadows: only the thick of a cloud throws one, its thin edges let the sun through
  float cloudThr = mix(0.66, 0.34, uCloud.z);
  float shade = smoothstep(cloudThr + 0.05, cloudThr + 0.17, vCloud) * uCloud.w * uBig.z;

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
  // the wide shallows round an island are a paler blue, and a gust darkens the water it ruffles
  col = mix(col, uMid, shelf * 0.32);
  col *= 1.0 - gust * 0.28;
  glow *= (1.0 - gust * 0.7) * (1.0 - shade * 0.55);
  col = mix(col, uFace, glow * 0.9);
  col = mix(col, uCrest, smoothstep(0.55, 1.0, hn) * glow * 0.6);
  // back slopes fall off into shade
  float rel = dot(n, sd) - sd.y;
  col *= 1.0 + clamp(rel * 1.6, -0.16, 0.08);
  // close to a shore the sand shows through: turquoise, fading with the daylight
  col = mix(col, uShallow, shoal * 0.5 * (1.0 - uLantern.w * 0.7));
  // home waters: clear water over sand (SHALLOWS_GLSL)
  col = clearShallows(col, p, v, n, hn, off, dist, vSea.z * uBig.x);

  // ---- foam: lacy streaks in wind space (x = downwind, y = across), draped over the swell
  ws.x -= uTime * 0.8; // foam drifts slowly downwind
  float A = clamp(uWindStr * 0.55 + seaWave * 0.75 - 0.38 + gust * 0.2, 0.05, 1.3); // how foamy the sea is
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
  trail = smoothstep(0.45, 0.95, waveHeightK(p - wd * 3.5, vSea.xy) / amp);
#endif
  // only a light link to the (fast-moving) wave crests, so foam doesn't race past
  float field = vein * 0.7 + body * 0.25 + (rag - 0.5) * 0.55 + crestBias * 0.07 + trail * 0.03;
  // whitecaps: the lace thickens on the highest crests, more in rough seas, rather than
  // breaking out as a separate slab of white
  float capN = vnoise(p * 0.12 + wd * uTime * 0.12) * 0.6 + vnoise(p * 0.42 - uTime * 0.06) * 0.4;
  float capThr = 1.24 - smoothstep(0.3, 1.4, seaWave) * 0.42 - clamp(uWindStr - 0.8, 0.0, 0.8) * 0.08; // fewer caps in fair weather, same in storms
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
  vec3 light = uAmbient + uLightCol * (1.0 - shade * 0.75);
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
  float noFoam = (1.0 - foam) * (1.0 - shade);
  lit += uLightCol * smoothstep(0.985 - low * 0.05, 1.0, spec) * (0.08 + low * 0.6) * noFoam;
  vec2 gc = p * 1.4 + n.xz * 2.0;
  vec2 gi = floor(gc);
  float twinkle = step(0.8, hash12(gi + floor(uTime * 1.2 + hash12(gi) * 4.0)));
  float glit = step(mix(0.994, 0.94, low), spec + (hash12(gi + 9.0) - 0.5) * 0.02) * twinkle
             * (1.0 - step(0.22, length(fract(gc) - 0.5)));
  glit = max(glit * (1.0 - smoothstep(250.0, 1200.0, dist)), step(0.996, spec));
  lit += glit * uLightCol * (0.25 + low * 1.1) * noFoam;

  // ---- the glowing bloom (sea-events.js): blue light in drifting patches, brightest in the
  // foam and on the crests, with motes that wink on and off near the boat
  if (uBloom.w > 0.001) {
    float bd = distance(p, uBloom.xy) + (vnoise(p * 0.03) - 0.5) * 50.0;
    float bk = (1.0 - smoothstep(uBloom.z * 0.6, uBloom.z, bd)) * uBloom.w;
    float bn = vnoise(p * 0.045 + vec2(uTime * 0.02, -uTime * 0.015)) * 0.6 + vnoise(p * 0.19 - uTime * 0.04) * 0.4;
    vec2 bc = p * 0.9;
    vec2 bi = floor(bc);
    float mote = step(0.9, hash12(bi + floor(uTime * 0.8 + hash12(bi) * 5.0))) * (1.0 - step(0.2, length(fract(bc) - 0.5)))
               * (1.0 - smoothstep(40.0, 160.0, dist));
    lit += vec3(0.08, 0.5, 0.95) * bk * (cel(bn, 0.5) * 0.45 + smoothstep(0.2, 0.9, hn) * 0.35 + foam * 1.1 + mote * 1.4);
  }

  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export const SEA_FEATURES = ['shallows', 'gusts', 'shade'];
// A shore map of nothing but open water, until the world's own is set.
const OPEN_SEA = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
OPEN_SEA.needsUpdate = true;

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
      uBloom: { value: new THREE.Vector4(0, 0, 0, 0) }, // (x, z, radius, strength): the glowing bloom; strength 0 = off
      uShallow: { value: new THREE.Color('#2fb3ab') },
      uShoreMap: { value: OPEN_SEA },
      uShore: { value: 0 },                                // 1 / the map's width in metres
      uBig: { value: new THREE.Vector3(1, 1, 1) },         // how much of the shallows, the gusts and the cloud shadows to draw
      uShoal: { value: new THREE.Vector4(0, 0, 0, 1) },    // ashore: (x, z, radius, falloff) of the island's own shallows; radius 0 = use the map
      uCloud: { value: new THREE.Vector4(0, 0, 0.3, 0) },  // (drift x, drift z, sky cover, how dark a shadow is)
      uCloudDir: { value: new THREE.Vector2(1, 0) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader, fog: true,
      defines: quality === 'low' ? { LOW_Q: 1 } : {},
    });
    this.mesh = new THREE.Mesh(oceanGeometry(4200, segs), this.material);
    this.mesh.name = 'ocean';
    this.mesh.frustumCulled = false;
    // Drawn after everything else that is solid: its shader is the dearest thing on screen,
    // and this way it only runs for water you can see, not for the sea under an island or
    // behind the hull. (The sea's see-through layers, wake and shore foam, still come later.)
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  /** The world's shallows (a shoreMap texture covering -half..half). Without one, it is all open sea. */
  setShoreMap(texture, half) {
    this.uniforms.uShoreMap.value = texture;
    this.uniforms.uShore.value = 1 / (half * 2);
  }
  /**
   * Which of the large features to draw, for comparing with and without: nothing (or
   * null) = all three, '0' = none, 'gusts,shade' = just those. In the URL: ?sea=0.
   */
  setFeatures(spec) {
    const on = spec == null || spec === '' ? SEA_FEATURES : String(spec).split(',');
    this.uniforms.uBig.value.set(...SEA_FEATURES.map((f) => (on.includes(f) ? 1 : 0)));
  }
  /**
   * Ashore the sea is drawn in the level's own space, where the map doesn't fit: the
   * shallows are a ring round the island instead. `null` goes back to the map.
   */
  setShoal(shoal) {
    if (shoal) this.uniforms.uShoal.value.set(shoal.x, shoal.z, shoal.r, shoal.fade || 90);
    else this.uniforms.uShoal.value.set(0, 0, 0, 1);
  }
  /**
   * Called every frame with the sky (sky.js) and the weather's numbers: cloud shadows lie
   * where the sun would throw the clouds, and fade under an overcast sky, at night and as
   * the sun gets low.
   */
  setSky(env, weather) {
    const c = env.cloudUniforms, sun = env.sunDir, u = this.uniforms.uCloud.value;
    const reach = env.clouds.position.y / Math.max(sun.y, 0.25);
    u.set(c.uOffset.value.x + sun.x * reach, c.uOffset.value.y + sun.z * reach, weather.cloud,
      (1 - env.overcast) * (1 - env.night) * smoothstep(0.05, 0.3, sun.y) * 0.8);
    this.uniforms.uCloudDir.value.copy(c.uWindDir.value);
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
