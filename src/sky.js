// Sky dome (gradient, golden-hour scattering, sun & moon, stars, distant cloud
// banks), a stylised wispy cloud layer, and all scene lighting. Everything is
// driven by the time of day plus the current weather.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, TAU } from './util.js';

const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < OCT; i++) { s += a * vnoise(p); p = r * p; a *= 0.5; }
  return s;
}
`;

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunCol;
uniform float uSunHDR; // >1 lets the disc feed the bloom pass (fx.js)
uniform vec3 uGold1;
uniform vec3 uGold2;
uniform vec3 uGold3;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uGolden;
uniform float uNight;
uniform float uOvercast;
uniform float uCover;
uniform float uTime;
uniform float uFlash;
varying vec3 vDir;
${NOISE}
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float yp = max(y, 0.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.5, yp));

  // Golden hour: warm scattering strongest in the sun's direction, fading
  // with height (orange → pink → purple), plus a pink anti-solar belt.
  vec3 sh = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-5, 0.0, 0.0));
  vec3 dh = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0));
  float azc = dot(sh, dh) * 0.5 + 0.5;
  vec3 ramp = mix(uGold1, uGold2, smoothstep(0.0, 0.22, yp));
  ramp = mix(ramp, uGold3, smoothstep(0.18, 0.6, yp));
  float side = pow(azc, 2.2);
  col = mix(col, ramp, uGolden * mix(0.25, 0.95, side) * exp(-yp * mix(2.2, 4.5, side)));
  float belt = smoothstep(0.0, 0.07, yp) * (1.0 - smoothstep(0.1, 0.3, yp)) * (1.0 - azc);
  col = mix(col, uGold2 * 0.75 + col * 0.35, uGolden * belt * 0.45);

  float vis = 1.0 - uOvercast * 0.97;
  // sun: antialiased disc, soft glow that widens near the horizon
  float sd = dot(d, uSunDir);
  float sa = sqrt(max(0.0, 2.0 * (1.0 - sd)));
  float wide = 0.05 + uGolden * 0.3;
  float sunGlow = exp(-sa * sa / 0.004) * 0.45 + exp(-sa * sa / wide) * (0.18 + uGolden * 0.35);
  col += uSunCol * sunGlow * vis * (1.0 - uNight);
  col = mix(col, (uSunCol * 1.35 + 0.18) * uSunHDR, (1.0 - smoothstep(0.050, 0.057, sa)) * vis);
  // moon with a crescent bite and a gentle falloff glow
  float md = dot(d, uMoonDir);
  float ma = sqrt(max(0.0, 2.0 * (1.0 - md)));
  vec3 off = normalize(uMoonDir + vec3(0.015, 0.008, 0.0));
  float oa = sqrt(max(0.0, 2.0 * (1.0 - dot(d, off))));
  float disc = 1.0 - smoothstep(0.031, 0.036, ma);
  float bite = 1.0 - smoothstep(0.031, 0.037, oa);
  float moonGlow = exp(-ma * ma / 0.0035) * 0.32 + exp(-ma * ma / 0.03) * 0.12;
  col += vec3(0.55, 0.62, 0.85) * moonGlow * uNight * vis;
  col = mix(col, vec3(0.96, 0.95, 0.84), disc * (1.0 - bite * 0.82) * uNight * vis);
  // stars
  vec3 sp = d * 170.0;
  vec3 cell = floor(sp);
  float h = hash13(cell);
  vec3 fp = fract(sp) - 0.5;
  float st = step(0.986, h) * (1.0 - smoothstep(0.05, 0.11, length(fp)));
  float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 200.0);
  col += vec3(st * tw) * uNight * vis * smoothstep(0.02, 0.2, y);

  // Distant cloud banks sitting on the horizon (the cloud layer fades out
  // before it reaches the horizon, these fill the gap)
  // long, low, flat-topped banks (broad noise, soft tops) so they never read as peaks
  vec2 ring = dh.xz * 1.7;
  float bn = fbm(ring + vec2(uTime * 0.002, 0.0)) + 0.12 * vnoise(ring * 9.0 + 7.0);
  float bankH = (0.006 + 0.04 * smoothstep(0.42, 0.75, bn)) * (0.4 + uCover * 0.8);
  float bank = (1.0 - smoothstep(bankH * 0.45, bankH, yp)) * step(0.0, y) * smoothstep(0.3, 0.6, uCover + 0.2);
  vec3 bankCol = mix(uCloudLit, uCloudShade, 0.35);
  bankCol += uCloudLit * pow(azc, 6.0) * uGolden * 0.35;
  col = mix(col, mix(bankCol, uHorizon, 0.55), bank * 0.75);

  col = y < 0.0 ? uHorizon : col;
  col += uFlash * vec3(0.6, 0.65, 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Wispy, wind-stretched cloud layer seen from below.
const cloudVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const cloudFrag = /* glsl */ `
uniform vec2 uOffset;
uniform vec2 uWindDir;
uniform float uCover;
uniform float uOvercast;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform float uFlash;
uniform float uTime;
varying vec3 vWorld;
${NOISE}
void main() {
  vec2 w = vWorld.xz + uOffset;
  // Wind-aligned frame, stretched along the wind for long flat wisps
  vec2 f = vec2(dot(w, uWindDir), dot(w, vec2(-uWindDir.y, uWindDir.x)));
  vec2 q = f * vec2(0.00085, 0.0027);
  vec2 warp = vec2(fbm(q * 1.6 + 3.1), fbm(q * 1.6 - 5.7));
  float n = fbm(q + warp * 0.7 + vec2(uTime * 0.003, 0.0));
  // feathery edge detail
  n += (vnoise(q * vec2(7.0, 11.0) + warp * 3.0) - 0.5) * 0.09;

  float thr = mix(0.66, 0.34, uCover);
  float soft = 0.05 + uOvercast * 0.1;
  float a = smoothstep(thr, thr + soft, n);
  float thick = clamp((n - thr) / 0.22, 0.0, 1.0);
  // overcast: a continuous deck with mottled thicker patches
  a = max(a, uOvercast * smoothstep(0.08, 0.32, n));

  // Toon-ish: bright edges, flat mid tone, darker thick undersides
  float band = smoothstep(0.3, 0.5, thick) * 0.6 + smoothstep(0.65, 0.85, thick) * 0.4;
  vec3 col = mix(uLit, uShade, band);
  col = mix(col, uShade * 0.92, uOvercast * smoothstep(0.35, 0.7, n) * 0.6);
  // silver lining on thin edges, brighter still when looking toward the sun
  vec3 v = normalize(vWorld - cameraPosition);
  float fwd = pow(max(dot(v, uSunDir), 0.0), 5.0) * (1.0 - uOvercast * 0.8);
  float thin = 1.0 - smoothstep(0.0, 0.18, thick);
  col = mix(col, uLit * 1.1, thin * 0.45);
  col += uLit * fwd * (0.35 + thin * 0.6);

  // aerial haze and a soft fade long before the plane's edge
  float dist = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, uHorizon, smoothstep(700.0, 3800.0, dist) * 0.85);
  a *= 1.0 - smoothstep(3000.0, 4300.0, dist);
  col += uFlash * vec3(0.55, 0.6, 0.75);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const C = (h) => new THREE.Color(h);
const PAL = {
  dayTop: C('#2f86ea'), dayHor: C('#c4e6ff'),
  goldTop: C('#7a78c4'), goldHor: C('#ffb36b'),
  nightTop: C('#060a20'), nightHor: C('#1a2550'),
  ocTop: C('#9aa4ae'), ocHor: C('#c6cbcf'),
  stormTop: C('#3b434d'), stormHor: C('#6f7882'),
  fogHor: C('#d4dde3'),
  gold1: C('#ffb347'), gold2: C('#ff7f8f'), gold3: C('#7b5cb3'),
  sunDay: C('#fff4dc'), sunGold: C('#ffa24a'), sunLow: C('#ff7a32'), moon: C('#9fb4ff'),
  // cloud tones
  litDay: C('#ffffff'), shadeDay: C('#b9c4d2'),
  litGold: C('#ffd59a'), shadeGold: C('#d88a9c'),
  litNight: C('#56627c'), shadeNight: C('#232a3a'),
  litOc: C('#d3d7db'), shadeOc: C('#959ca5'),
  litStorm: C('#6a727c'), shadeStorm: C('#383e47'),
  warm: C('#ffc493'), white: C('#ffffff'), ground: C('#2d5a6a'), groundWarm: C('#6a4a3a'),
};
const tmp = new THREE.Color(), tmp2 = new THREE.Color();

export class Environment {
  constructor(scene, quality) {
    this.scene = scene;
    const oct = quality === 'low' ? 3 : 5;
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() }, uSunHDR: { value: 1 },
      uGold1: { value: PAL.gold1.clone() }, uGold2: { value: PAL.gold2.clone() }, uGold3: { value: PAL.gold3.clone() },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
      uGolden: { value: 0 }, uNight: { value: 0 }, uOvercast: { value: 0 }, uCover: { value: 0 },
      uTime: { value: 0 }, uFlash: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
        defines: { OCT: Math.min(oct, 4) },
        side: THREE.BackSide, depthWrite: false, fog: false,
      })
    );
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfe4ff, 0x3b6e5a, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(0xbfe4ff, 300, 2400);
    this.fogFarBase = quality === 'low' ? 1700 : 2500;

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.oceanLight = new THREE.Color();
    this.oceanAmbient = new THREE.Color();
    this.horizon = new THREE.Color();
    this.night = 0;
    this.golden = 0;
    this.overcast = 0;

    // Cloud layer
    this.cloudUniforms = {
      uOffset: { value: new THREE.Vector2() }, uWindDir: { value: new THREE.Vector2(1, 0) },
      uCover: { value: 0.3 }, uOvercast: { value: 0 },
      uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() },
      uHorizon: this.uniforms.uHorizon, uSunDir: this.uniforms.uSunDir,
      uFlash: this.uniforms.uFlash, uTime: this.uniforms.uTime,
    };
    const cg = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    cg.rotateX(Math.PI / 2); // face down, we look at it from below
    this.clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms, vertexShader: cloudVert, fragmentShader: cloudFrag,
      defines: { OCT: oct }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 5;
    scene.add(this.clouds);
    this.cloudHeight = 400;
    // Streaks are stretched along a fixed prevailing direction: rotating the
    // noise frame with the wind would swing distant clouds across the sky.
    this.windDir = new THREE.Vector2(0.94, 0.34).normalize();
  }

  update(dt, dayT, w, camera, wind, elapsed) {
    const ang = (dayT - 0.25) * TAU;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.38).normalize();
    this.moonDir.set(-Math.cos(ang), -Math.sin(ang), 0.3).normalize();
    const elev = this.sunDir.y;
    const day = smoothstep(-0.14, 0.22, elev);
    const night = 1 - smoothstep(-0.2, 0.02, elev);
    // golden hour window: strongest just above the horizon, lingering to ~0.3
    const golden = smoothstep(-0.1, 0.0, elev) * (1 - smoothstep(0.1, 0.32, elev));
    const overcast = smoothstep(0.55, 0.93, w.cloud);
    const storm = clamp(w.storm, 0, 1);
    const goldenEff = golden * (1 - overcast * 0.85);
    this.night = night;
    this.golden = goldenEff;
    this.overcast = overcast;
    const flash = w.flash || 0;

    // --- sky colours
    const top = this.uniforms.uTop.value, hor = this.uniforms.uHorizon.value;
    top.copy(PAL.nightTop).lerp(PAL.dayTop, day).lerp(PAL.goldTop, golden * 0.55);
    hor.copy(PAL.nightHor).lerp(PAL.dayHor, day).lerp(PAL.goldHor, golden * 0.85);
    // overcast: a muted white-grey dome (darker toward storms and night)
    const dim = lerp(0.1, 1, day);
    tmp.copy(PAL.ocTop).lerp(PAL.stormTop, storm).multiplyScalar(dim);
    tmp2.copy(PAL.ocHor).lerp(PAL.stormHor, storm).multiplyScalar(dim);
    // keep a little sunset warmth bleeding through thin overcast
    tmp2.lerp(PAL.goldHor, golden * 0.25 * (1 - storm));
    const grey = clamp(Math.max(overcast * 0.95, w.dark * 1.2), 0, 1);
    top.lerp(tmp, grey);
    hor.lerp(tmp2, grey);
    // fog banks whiten the horizon
    const fogginess = clamp((0.6 - w.fog) * 1.6, 0, 1) * (1 - storm * 0.6);
    hor.lerp(tmp.copy(PAL.fogHor).multiplyScalar(lerp(0.12, 1, day)), fogginess * 0.8);
    top.lerp(hor, fogginess * 0.6);
    this.horizon.copy(hor);

    // --- sun colour: warm gold near the horizon, deep orange right at it
    const sunCol = this.uniforms.uSunCol.value;
    sunCol.copy(PAL.sunDay).lerp(PAL.sunGold, golden).lerp(PAL.sunLow, golden * (1 - smoothstep(0.0, 0.12, elev)) * 0.7);

    const u = this.uniforms;
    u.uFlash.value = flash * 0.5;
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    u.uNight.value = night;
    u.uGolden.value = goldenEff;
    u.uOvercast.value = overcast;
    u.uCover.value = w.cloud;
    u.uTime.value = elapsed;

    // --- cloud tones
    const lit = this.cloudUniforms.uLit.value, shade = this.cloudUniforms.uShade.value;
    lit.copy(PAL.litNight).lerp(PAL.litDay, day).lerp(PAL.litGold, golden * 0.85);
    shade.copy(PAL.shadeNight).lerp(PAL.shadeDay, day).lerp(PAL.shadeGold, golden * 0.8);
    tmp.copy(PAL.litOc).lerp(PAL.litStorm, storm).multiplyScalar(dim);
    tmp2.copy(PAL.shadeOc).lerp(PAL.shadeStorm, storm).multiplyScalar(dim);
    tmp.lerp(PAL.litGold, golden * 0.3 * (1 - storm));
    const ocMix = clamp(Math.max(overcast * 0.9, w.dark), 0, 1);
    lit.lerp(tmp, ocMix);
    shade.lerp(tmp2, ocMix);
    u.uCloudLit.value.copy(lit);
    u.uCloudShade.value.copy(shade);

    this.sky.position.copy(camera.position);

    // --- cloud layer follows the camera and drifts with the wind
    const cu = this.cloudUniforms;
    cu.uOffset.value.x -= wind.x * dt * 9;
    cu.uOffset.value.y -= wind.y * dt * 9;
    // keep offsets small for shader precision (wrap on a large period)
    cu.uOffset.value.x %= 50000; cu.uOffset.value.y %= 50000;
    cu.uWindDir.value.copy(this.windDir);
    cu.uCover.value = w.cloud;
    cu.uOvercast.value = overcast;
    this.clouds.position.set(camera.position.x, this.cloudHeight - storm * 90 - overcast * 40, camera.position.z);

    // --- fog: horizon colour, nudged warm toward the sunset glow
    const fog = this.scene.fog;
    fog.color.copy(hor).lerp(PAL.gold1, goldenEff * 0.18).addScalar(flash * 0.25);
    fog.far = this.fogFarBase * w.fog;
    fog.near = Math.min(fog.far * 0.15, 280);

    // --- lights: sun by day, moon by night
    const useMoon = elev < -0.04;
    this.lightDir.copy(useMoon ? this.moonDir : this.sunDir);
    if (this.lightDir.y < 0.08) this.lightDir.y = 0.08;
    this.lightDir.normalize();
    this.sun.position.copy(camera.position).addScaledVector(this.lightDir, 400);
    this.sun.target.position.copy(camera.position);
    // Overcast blocks most direct light (~20%), storms more (~10%)
    const block = lerp(1, 0.2, overcast) * lerp(1, 0.55, storm) * (1 - w.dark * 0.25);
    const sunI = useMoon
      ? 0.55 * smoothstep(-0.04, -0.25, elev)
      : lerp(2.6, 2.3, golden) * smoothstep(-0.03, 0.07, elev);
    this.sun.intensity = sunI * block + flash * 3;
    this.sun.color.copy(useMoon ? PAL.moon : sunCol);

    // Hemisphere/ambient: flatter and relatively brighter under overcast so
    // the toon shading reads as diffuse grey light; warm during golden hour.
    const hemi = this.hemi;
    hemi.color.copy(top).lerp(PAL.white, 0.45).lerp(PAL.warm, goldenEff * 0.45);
    hemi.color.lerp(tmp.copy(PAL.ocHor), overcast * 0.6);
    hemi.groundColor.copy(PAL.ground).lerp(PAL.groundWarm, goldenEff * 0.5).multiplyScalar(lerp(0.3, 1, day));
    hemi.groundColor.lerp(tmp.copy(PAL.ocTop).multiplyScalar(0.55 * dim), overcast * 0.5);
    const hemiDay = lerp(1.25, 1.6, overcast) * (1 - storm * 0.4) * (1 - w.dark * 0.2);
    hemi.intensity = lerp(0.65, hemiDay, day) + flash * 2;

    // ocean shading terms (linear)
    this.oceanLight.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.22);
    this.oceanAmbient.copy(hemi.color).multiplyScalar(hemi.intensity * 0.55);
    this.oceanAmbient.r = Math.max(this.oceanAmbient.r, 0.06);
    this.oceanAmbient.g = Math.max(this.oceanAmbient.g, 0.07);
    this.oceanAmbient.b = Math.max(this.oceanAmbient.b, 0.12);
  }
}
