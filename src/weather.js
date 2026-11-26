// Weather state machine (clear → rain → storm …), wind, rain, lightning and
// cartoon wind streaks. There is one weather for the whole world, but where the boat is
// weights what comes next (sea-zones.js, BANDS): no storm starts in home waters, and
// storms are commoner and longer in the open sea.
import * as THREE from 'three';
import { clamp, TAU, noise2 } from './util.js';
import { BANDS, pickByBand } from './sea-zones.js';

// cloud: sky cover (≥ ~0.9 reads as a full overcast deck); dark: how much the
// weather greys and dims the world on top of that.
export const WEATHER = {
  clear: { cloud: 0.3, rain: 0, wave: 0.35, wind: 0.85, fog: 1.0, dark: 0.0, storm: 0, swell: 0, label: 'Clear skies' },
  breezy: { cloud: 0.48, rain: 0, wave: 0.6, wind: 1.2, fog: 0.95, dark: 0.04, storm: 0, swell: 0.05, label: 'Fresh breeze' },
  cloudy: { cloud: 0.96, rain: 0, wave: 0.5, wind: 0.95, fog: 0.72, dark: 0.3, storm: 0, swell: 0.08, label: 'Overcast' },
  rain: { cloud: 1.0, rain: 0.55, wave: 0.75, wind: 1.05, fog: 0.55, dark: 0.46, storm: 0, swell: 0.35, label: 'Rain' },
  storm: { cloud: 1.0, rain: 1.0, wave: 1.7, wind: 1.45, fog: 0.38, dark: 0.72, storm: 1, swell: 1.0, label: 'Storm!' },
  fog: { cloud: 0.85, rain: 0, wave: 0.25, wind: 0.55, fog: 0.18, dark: 0.14, storm: 0, swell: 0, label: 'Fog' },
};
// What can follow each weather on the coastal sea; a band reweights the rain and storms.
const NEXT = {
  clear: ['breezy', 'cloudy', 'fog', 'clear', 'breezy'],
  breezy: ['clear', 'cloudy', 'rain', 'breezy'],
  cloudy: ['rain', 'clear', 'breezy', 'fog', 'rain'],
  rain: ['storm', 'cloudy', 'storm', 'breezy'],
  storm: ['rain', 'rain', 'cloudy'],
  fog: ['clear', 'cloudy', 'breezy'],
};

const streakVert = /* glsl */ `
attribute float aSeed;
attribute float aU;
attribute float aSide;
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uCenter;
varying float vA;
float h1(float n) { return fract(sin(n * 91.345) * 47453.21); }
void main() {
  float cycle = 10.0 + h1(aSeed) * 5.0; // ~10-14 units/s: a lazy drift, not a zip
  float t = uTime / cycle + h1(aSeed + 1.0);
  float ph = fract(t);
  float id = floor(t);
  vec2 perp = vec2(-uWind.y, uWind.x);
  float r1 = h1(aSeed * 13.1 + id * 7.3) * 2.0 - 1.0;
  float r2 = h1(aSeed * 5.7 + id * 3.1) * 2.0 - 1.0;
  vec2 base = uCenter.xz + perp * r1 * 70.0 + uWind * (r2 * 50.0 - 70.0);
  float len = 24.0;
  float along = ph * 140.0 - (1.0 - aU) * len;
  float wob = sin(along * 0.07 + aSeed * 6.0);
  // a little loop-the-loop in the middle of some streaks
  float loopK = step(0.5, h1(aSeed * 3.3 + id)) * smoothstep(55.0, 60.0, along) * (1.0 - smoothstep(72.0, 77.0, along));
  float la = (along - 55.0) / 22.0 * 6.2831853;
  vec2 p = base + uWind * along + perp * wob * 4.0;
  float y = uCenter.y + 4.0 + h1(aSeed * 2.3 + id) * 9.0 + sin(along * 0.05 + aSeed) * 1.5;
  p += (uWind * (sin(la) * 3.5 - along * 0.0) + perp * (1.0 - cos(la)) * 0.0) * loopK;
  y += (1.0 - cos(la)) * 3.0 * loopK;
  vec3 wp = vec3(p.x, y, p.y);
  vec3 tang = normalize(vec3(uWind.x, 0.05, uWind.y));
  vec3 toCam = normalize(cameraPosition - wp);
  vec3 side = normalize(cross(tang, toCam));
  wp += side * aSide * 0.16;
  vA = sin(ph * 3.14159) * sin(aU * 3.14159) * smoothstep(10.0, 28.0, length(cameraPosition - wp));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const streakFrag = /* glsl */ `
uniform float uAlpha;
varying float vA;
void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, vA * uAlpha); }`;

export class Weather {
  constructor(scene, quality) {
    this.scene = scene;
    this.type = 'clear';
    this.target = WEATHER.clear;
    this.p = { ...WEATHER.clear, flash: 0 };
    this.timer = 150;
    this.calmTimer = 0;
    this.windAngle = 2.4;
    this.windDrift = 0;
    this.windStrength = 0.85;
    this.wind = new THREE.Vector2();
    this.time = 0;
    this.lightningTimer = 6;
    this.onThunder = null;
    this.buildRain(quality === 'low' ? 900 : 2200);
    this.buildStreaks(quality === 'low' ? 10 : 18);
    this.buildBolt();
  }

  get label() { return WEATHER[this.type].label; }

  set(type, instant = false) {
    this.type = type;
    this.target = WEATHER[type];
    if (instant) Object.assign(this.p, this.target);
  }

  buildRain(n) {
    this.rainN = n;
    const pos = new Float32Array(n * 6);
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * 160;
      this.drops[i * 3 + 1] = Math.random() * 90;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfe0f5, transparent: true, opacity: 0.55, fog: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  buildStreaks(n) {
    const segs = 28;
    const seed = [], u = [], side = [], pos = [], idx = [];
    for (let s = 0; s < n; s++) {
      for (let k = 0; k <= segs; k++) {
        for (const sd of [-1, 1]) { seed.push(s + 1); u.push(k / segs); side.push(sd); pos.push(0, 0, 0); }
        if (k < segs) {
          const b = (s * (segs + 1) + k) * 2;
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    this.streakUniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0) }, uCenter: { value: new THREE.Vector3() }, uAlpha: { value: 0.6 } };
    this.streaks = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.streakUniforms, vertexShader: streakVert, fragmentShader: streakFrag,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 4;
    this.scene.add(this.streaks);
  }

  buildBolt() {
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff, fog: false, transparent: true });
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    this.scene.add(this.bolt);
  }

  strike(cam) {
    const a = Math.random() * TAU, d = 350 + Math.random() * 700;
    const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
    const pts = [];
    let px = x, pz = z;
    for (let y = 420; y > -2; y -= 30 + Math.random() * 25) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += (Math.random() - 0.5) * 40; pz += (Math.random() - 0.5) * 40;
    }
    pts.push(new THREE.Vector3(px, -2, pz));
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 2.2, 4, false);
    this.bolt.visible = true;
    this.boltLife = 0.25;
    this.p.flash = 1;
    if (this.onThunder) this.onThunder(d);
  }

  /** `band` is where the boat is: 'home', 'coastal' or 'open' (sea-zones.js, bandAt). */
  update(dt, camera, boatPos, band = 'coastal') {
    this.time += dt;
    this.calmTimer -= dt;
    // state transitions
    this.timer -= dt;
    // a storm blows itself out soon after you sail into home waters
    if (band === 'home' && this.type === 'storm') this.timer = Math.min(this.timer, 40);
    if (this.timer <= 0) {
      let next = pickByBand(NEXT[this.type], band, Math.random());
      // (the first minutes of a new voyage stay fair wherever you sail them)
      if (this.calmTimer > 0 && (next === 'storm' || next === 'rain')) next = 'breezy';
      this.set(next);
      const [lo, hi] = next === 'storm' ? BANDS[band].stormFor : [100, 260];
      this.timer = lo + Math.random() * (hi - lo);
      this.windDrift = (Math.random() - 0.5) * 1.6;
    }
    // smooth params
    const k = 1 - Math.exp(-dt / 18);
    for (const key of ['cloud', 'rain', 'wave', 'swell', 'wind', 'fog', 'dark', 'storm']) {
      this.p[key] += (this.target[key] - this.p[key]) * k;
    }
    // wind direction wanders
    const turn = this.windDrift * 0.02 + noise2(this.time * 0.01, 3.3, 5) * 0.03;
    this.windDrift *= Math.exp(-dt * 0.03);
    this.windAngle += turn * dt;
    const gust = 0.88 + 0.12 * noise2(this.time * 0.15, 7.7, 9) + 0.1 * this.p.storm * Math.sin(this.time * 1.7);
    this.windStrength = this.p.wind * gust;
    this.wind.set(Math.sin(this.windAngle), Math.cos(this.windAngle)).multiplyScalar(this.windStrength);

    // lightning
    this.p.flash = Math.max(0, this.p.flash - dt * 4);
    if (this.boltLife > 0) { this.boltLife -= dt; if (this.boltLife <= 0) this.bolt.visible = false; }
    if (this.p.storm > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.strike(camera.position);
        this.lightningTimer = 4 + Math.random() * 10;
      }
    }

    // rain particles around the camera
    const r = this.p.rain;
    const n = Math.floor(this.rainN * clamp(r, 0, 1));
    this.rain.visible = n > 10;
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position.array;
      const d = this.drops;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const wx = this.wind.x * 6, wz = this.wind.y * 6;
      const fall = 55 * dt;
      for (let i = 0; i < n; i++) {
        let x = d[i * 3], y = d[i * 3 + 1], z = d[i * 3 + 2];
        y -= fall; x += wx * dt; z += wz * dt;
        if (y < -10) { y += 100; }
        // keep within a box around the camera
        let rx = x - cx; rx = ((rx + 80) % 160 + 160) % 160 - 80;
        let rz = z - cz; rz = ((rz + 80) % 160 + 160) % 160 - 80;
        x = cx + rx; z = cz + rz;
        d[i * 3] = x; d[i * 3 + 1] = y; d[i * 3 + 2] = z;
        const wy = y + cy - 50;
        pos[i * 6] = x; pos[i * 6 + 1] = wy; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x - wx * 0.05; pos[i * 6 + 4] = wy + 2.2; pos[i * 6 + 5] = z - wz * 0.05;
      }
      this.rain.geometry.setDrawRange(0, n * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.35 + r * 0.3;
    }

    // wind streaks follow the boat
    this.streakUniforms.uTime.value = this.time;
    this.streakUniforms.uWind.value.set(Math.sin(this.windAngle), Math.cos(this.windAngle));
    this.streakUniforms.uCenter.value.copy(boatPos);
    this.streakUniforms.uAlpha.value = clamp((this.windStrength - 0.5) * 0.6, 0.1, 0.45) * (1 - r * 0.6);
  }
}
