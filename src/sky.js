// Sky dome, sun & moon, stars, toon clouds and all scene lighting.
// Everything is driven by the time of day plus the current weather.
import * as THREE from 'three';
import { toonGradient } from './toon.js';
import { clamp, lerp, smoothstep, mulberry32, TAU } from './util.js';

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
uniform float uNight;
uniform float uCloud;
uniform float uTime;
uniform float uFlash;
varying vec3 vDir;
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.5, y));
  // toon banding near the horizon
  col = mix(col, mix(uHorizon, uTop, 0.12), step(0.035, y) * (1.0 - step(0.075, y)) * 0.5);
  col = y < 0.0 ? uHorizon : col;
  float vis = 1.0 - uCloud * 0.85;
  // sun: hard disc + toon halo ring
  float sd = dot(d, uSunDir);
  col = mix(col, mix(col, uSunCol, 0.35), step(0.992, sd) * vis);
  col = mix(col, uSunCol * 1.4 + 0.15, step(0.9986, sd) * vis);
  // moon with a crescent bite
  float md = dot(d, uMoonDir);
  vec3 off = normalize(uMoonDir + vec3(0.015, 0.008, 0.0));
  float moon = step(0.9994, md) * (1.0 - step(0.9994, dot(d, off)) * 0.85);
  col = mix(col, vec3(0.96, 0.95, 0.84), moon * uNight * vis);
  col += vec3(0.25, 0.3, 0.45) * step(0.996, md) * uNight * vis * 0.3;
  // stars
  vec3 sp = d * 170.0;
  vec3 cell = floor(sp);
  float h = hash13(cell);
  vec3 fp = fract(sp) - 0.5;
  float st = step(0.986, h) * (1.0 - smoothstep(0.05, 0.11, length(fp)));
  float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 200.0);
  col += vec3(st * tw) * uNight * vis * smoothstep(0.02, 0.2, y);
  col += uFlash * vec3(0.6, 0.65, 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const C = (h) => new THREE.Color(h);
const PAL = {
  dayTop: C('#2f86ea'), dayHor: C('#bfe4ff'),
  duskTop: C('#4b5fae'), duskHor: C('#ffa463'),
  nightTop: C('#060a20'), nightHor: C('#1a2550'),
  stormTop: C('#39424e'), stormHor: C('#79838f'),
  stormNightTop: C('#07090f'), stormNightHor: C('#1b2029'),
  fogHor: C('#d4dde3'),
  sunDay: C('#fff6e0'), sunDusk: C('#ffb070'), moon: C('#9fb4ff'),
};

export class Environment {
  constructor(scene, quality) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() }, uNight: { value: 0 }, uCloud: { value: 0 },
      uTime: { value: 0 }, uFlash: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
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
    this.buildClouds(quality === 'low' ? 26 : 40);
  }

  buildClouds(count) {
    const rng = mulberry32(77);
    this.clouds = [];
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const puffsPer = 7;
    this.cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), fog: false });
    this.cloudMesh = new THREE.InstancedMesh(geo, this.cloudMat, count * puffsPer);
    this.cloudMesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const c = {
        x: (rng() - 0.5) * 6000, z: (rng() - 0.5) * 6000, y: 260 + rng() * 260,
        s: 28 + rng() * 45, vis: 0, puffs: [],
      };
      const n = puffsPer;
      for (let p = 0; p < n; p++) {
        const a = (p / n) * TAU + rng();
        const r = p === 0 ? 0 : 0.6 + rng() * 0.9;
        c.puffs.push({
          x: Math.cos(a) * r * 1.6, y: (p === 0 ? 0.25 : rng() * 0.5 - 0.1), z: Math.sin(a) * r,
          s: p === 0 ? 1.25 : 0.55 + rng() * 0.55,
        });
      }
      this.clouds.push(c);
    }
    this.scene.add(this.cloudMesh);
    this.cloudOffset = new THREE.Vector2();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  update(dt, dayT, w, camera, wind, elapsed, lanternOn) {
    const ang = (dayT - 0.25) * TAU;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.38).normalize();
    this.moonDir.set(-Math.cos(ang), -Math.sin(ang), 0.3).normalize();
    const elev = this.sunDir.y;
    const day = smoothstep(-0.14, 0.22, elev);
    const dusk = (1 - smoothstep(0.0, 0.32, Math.abs(elev - 0.03))) * 0.9;
    const night = 1 - smoothstep(-0.2, 0.02, elev);
    this.night = night;

    const top = this.uniforms.uTop.value, hor = this.uniforms.uHorizon.value;
    top.copy(PAL.nightTop).lerp(PAL.dayTop, day).lerp(PAL.duskTop, dusk * 0.6);
    hor.copy(PAL.nightHor).lerp(PAL.dayHor, day).lerp(PAL.duskHor, dusk);
    // weather greys things out
    const grey = clamp(w.dark * 1.25, 0, 1);
    const sTop = PAL.stormNightTop.clone().lerp(PAL.stormTop, day);
    const sHor = PAL.stormNightHor.clone().lerp(PAL.stormHor, day);
    top.lerp(sTop, grey);
    hor.lerp(sHor, grey);
    // fog banks whiten the horizon
    const fogginess = clamp((0.6 - w.fog) * 1.6, 0, 1) * (1 - grey * 0.6);
    hor.lerp(PAL.fogHor.clone().multiplyScalar(lerp(0.12, 1, day)), fogginess * 0.8);
    top.lerp(hor, fogginess * 0.6);

    // lightning flash
    const flash = w.flash || 0;
    this.uniforms.uFlash.value = flash * 0.5;
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uMoonDir.value.copy(this.moonDir);
    this.uniforms.uSunCol.value.copy(PAL.sunDay).lerp(PAL.sunDusk, dusk);
    this.uniforms.uNight.value = night;
    this.uniforms.uCloud.value = clamp(w.cloud * 1.1 - 0.15, 0, 1);
    this.uniforms.uTime.value = elapsed;
    this.horizon.copy(hor);

    this.sky.position.copy(camera.position);

    const fog = this.scene.fog;
    fog.color.copy(hor).addScalar(flash * 0.25);
    fog.far = this.fogFarBase * w.fog;
    fog.near = Math.min(fog.far * 0.15, 280);

    // lights: sun by day, moon by night
    const useMoon = elev < -0.04;
    this.lightDir.copy(useMoon ? this.moonDir : this.sunDir);
    if (this.lightDir.y < 0.08) this.lightDir.y = 0.08;
    this.lightDir.normalize();
    this.sun.position.copy(camera.position).addScaledVector(this.lightDir, 400);
    this.sun.target.position.copy(camera.position);
    const sunI = useMoon ? 0.55 * smoothstep(-0.04, -0.25, elev) : 2.6 * smoothstep(-0.04, 0.12, elev);
    this.sun.intensity = sunI * (1 - w.dark * 0.7) + flash * 3;
    this.sun.color.copy(useMoon ? PAL.moon : this.uniforms.uSunCol.value);
    this.hemi.color.copy(top).lerp(new THREE.Color(1, 1, 1), 0.45);
    this.hemi.groundColor.set(0x2d5a6a).multiplyScalar(lerp(0.3, 1, day));
    this.hemi.intensity = lerp(0.65, 1.25, day) * (1 - w.dark * 0.35) + flash * 2;

    // ocean shading terms (linear)
    this.oceanLight.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.22);
    this.oceanAmbient.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.55);
    this.oceanAmbient.r = Math.max(this.oceanAmbient.r, 0.06);
    this.oceanAmbient.g = Math.max(this.oceanAmbient.g, 0.07);
    this.oceanAmbient.b = Math.max(this.oceanAmbient.b, 0.12);

    // clouds
    this.cloudOffset.x += wind.x * dt * 6;
    this.cloudOffset.y += wind.y * dt * 6;
    const tint = lerp(1, 0.55, grey);
    this.cloudMat.color.setScalar(tint);
    this.cloudMat.emissive.setRGB(0.1, 0.12, 0.2).multiplyScalar(night * 0.6 + 0.15 * (1 - night));
    const cover = w.cloud;
    const N = this.clouds.length;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const c = this.clouds[i];
      const target = clamp(cover * N * 1.05 - i, 0, 1);
      c.vis = lerp(c.vis, target, 1 - Math.exp(-dt * 0.5));
      let x = c.x + this.cloudOffset.x - camera.position.x;
      let z = c.z + this.cloudOffset.y - camera.position.z;
      x = ((x % 6000) + 9000) % 6000 - 3000;
      z = ((z % 6000) + 9000) % 6000 - 3000;
      // fade near the wrap edges
      const edge = 1 - smoothstep(2500, 3000, Math.max(Math.abs(x), Math.abs(z)));
      const s = c.s * c.vis * edge * (1 + grey * 0.4);
      for (const p of c.puffs) {
        this._v.set(camera.position.x + x + p.x * s, c.y - grey * 80 + p.y * s, camera.position.z + z + p.z * s);
        const ps = Math.max(0.0001, p.s * s);
        this._s.set(ps, ps * 0.75, ps);
        this._m.compose(this._v, this._q, this._s);
        this.cloudMesh.setMatrixAt(k++, this._m);
      }
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }
}
