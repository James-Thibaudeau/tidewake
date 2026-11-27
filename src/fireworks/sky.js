// Fireworks in the sky: every spark of every shell is one point of a single THREE.Points,
// moved by the graphics card. A shell's points (fireworks/shells.js) are written into a
// ring of them once, when it is lit; after that each frame only moves a clock on, so a
// grand finale costs one draw call and no work per spark.
//
// Sparks add their light to what is behind them, bright enough to bloom (glowBoost, as
// the ships' lanterns do). Smoke covers instead. One material does both: it is blended
// as colour that already carries its own cover, so a spark is colour with no cover and
// a puff of smoke is colour with some. By day the sparks take a little cover too, which
// turns them pale against the bright sky, and the smoke is what shows.
//
// A burst also colours the sea under it for a moment (seaFlash, read by ocean.js).
// The game's side is fireworks.js; the gallery's `fireworks` subject uses this as it is.
import * as THREE from 'three';
import { glowBoost } from '../toon.js';
import { seaFlash } from '../ocean.js';
import { STRIDE, RING } from './shells.js';

const vert = /* glsl */ `
attribute vec3 aVel;
attribute vec4 aTime; // thrown at, its place in a trail, burns for, a random number
attribute vec4 aPhys; // drag, gravity, size, what it is (0 spark, 1 smoke, 2 flash, 3 glitter)
attribute vec3 aColor;
uniform float uTime;
uniform vec3 uWind;   // how far the wind carries an ember in a second
uniform float uDay;
uniform float uBoost;
uniform float uViewH;
uniform vec3 uSmoke;  // the light smoke is seen by
varying vec4 vCol;
varying float vSoft;
// where a spark is t seconds after it was thrown (the same sum as fly() in shells.js)
vec3 fly(float t) {
  float d = aPhys.x, k = (1.0 - exp(-d * t)) / d;
  return position + aVel * k - vec3(0.0, aPhys.y / d * (t - k), 0.0);
}
void main() {
  float trail = aTime.y, life = aTime.z, what = aPhys.w;
  float lag = max(-trail, 0.0), shed = max(trail, 0.0);
  float lit = uTime - aTime.x - lag - shed; // how long this point has been alight
  if (life <= 0.0 || lit < 0.0 || lit > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float k = lit / life;
  vec3 p = fly(trail > 0.0 ? shed : lit);
  // an ember stays where it was shed and goes with the wind, sinking; a tail bends
  // downwind behind its spark; the spark itself, and smoke with it, is carried a little
  bool smoke = what > 0.5 && what < 1.5;
  p += uWind * (trail > 0.0 || smoke ? lit : lag + lit * 0.25);
  if (trail > 0.0) p.y += (smoke ? 0.8 : -1.5) * lit;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = aPhys.z, glow = 0.0;
  vSoft = 0.0;
  if (smoke) {
    float a = smoothstep(0.0, 0.1, k) * pow(1.0 - k, 1.5) * mix(0.07, 0.6, uDay);
    size *= 0.45 + 1.3 * sqrt(k);
    // by day it is the colour of its shell, as daytime fireworks are; at night grey, lit a little by the burst
    vec3 tint = mix(vec3(0.84), mix(aColor, vec3(1.0), 0.45), 0.7 * uDay);
    vCol = vec4((uSmoke * tint * 0.9 + aColor * 0.3 * (1.0 - uDay) * (1.0 - k) * (1.0 - k)) * a, a);
    vSoft = 1.0;
  } else {
    if (what < 0.5) { glow = (1.0 - k * k) * (0.78 + 0.22 * sin(uTime * 31.0 + aTime.w * 40.0)); size *= 1.0 - 0.4 * k; }
    else if (what < 2.5) { glow = (1.0 - k) * (1.0 - k) * 0.6; size *= 0.5 + 0.5 * k; vSoft = 0.6; }
    else glow = (1.0 - k) * step(0.4, fract(uTime * 9.0 + aTime.w * 7.0)) * 1.5;
    // by day: paler, a little bigger, and painted over the sky instead of added to it
    // (still a little over white where the picture has the range for it, or a pale spark is grey beside a cloud)
    vec3 col = mix(aColor, vec3(1.0), 0.3 * uDay) * mix(uBoost, max(1.0, uBoost * 0.75), uDay);
    glow = mix(glow, min(glow * 1.6, 1.0), uDay);
    vCol = vec4(col * glow, glow * uDay * (what < 2.5 && what > 1.5 ? 0.3 : 1.0));
    vSoft = max(vSoft, 0.85 * uDay);
    size *= 1.0 + 0.3 * uDay;
  }
  float px = size * uViewH * projectionMatrix[1][1] * 0.5 / max(-mv.z, 1.0);
  // too far to be a whole pixel: keep it one, dimmer
  if (px < 2.0) { vCol *= max(px, 0.4) / 2.0; px = 2.0; }
  gl_PointSize = min(px, 256.0);
}`;

const frag = /* glsl */ `
varying vec4 vCol;
varying float vSoft;
void main() {
  float s = 1.0 - length(gl_PointCoord - 0.5) * 2.0;
  if (s <= 0.0) discard;
  // a spark is a hot centre in a faint halo; smoke is soft all through
  float shape = mix(s * (0.25 + 1.5 * s * s), smoothstep(0.0, 0.75, s), vSoft);
  gl_FragColor = vec4(vCol.rgb * shape, vCol.a * min(shape, 1.0));
  #include <colorspace_fragment>
}`;

const _size = new THREE.Vector2();

export class FireworkSky {
  /** `low`: Low quality: a smaller ring, and `detail` asks shells.js for fewer sparks (RING there). */
  constructor(scene, { low = false } = {}) {
    this.scene = scene;
    this.low = low;
    const R = low ? RING.low : RING.high;
    this.detail = R.detail;
    this.cap = R.points;
    this.clock = 0;
    this.next = 0;      // where in the ring the next point goes
    this.until = 0;     // the clock time at which the last point lit goes out
    this.lights = [];   // bursts lighting the sea: { x, z, y, t, c, power }
    this.buffer = new THREE.InterleavedBuffer(new Float32Array(this.cap * STRIDE), STRIDE);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.BufferGeometry();
    for (const [name, size, at] of [['position', 3, 0], ['aVel', 3, 3], ['aTime', 4, 6], ['aPhys', 4, 10], ['aColor', 3, 14]]) {
      g.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buffer, size, at));
    }
    this.uniforms = {
      uTime: { value: 0 }, uWind: { value: new THREE.Vector3() }, uDay: { value: 0 }, uBoost: { value: 1 },
      uViewH: { value: 800 }, uSmoke: { value: new THREE.Color(1, 1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, fog: false,
      // colour that carries its own cover: none for a spark (it only adds), some for smoke
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.name = 'fireworks';
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.visible = false;
    // a point's size on screen goes by the height of whatever is being drawn into
    this.points.onBeforeRender = (renderer) => {
      const target = renderer.getRenderTarget();
      this.uniforms.uViewH.value = target ? target.height : renderer.getDrawingBufferSize(_size).y;
    };
    scene.add(this.points);
  }

  /** Is anything still alight (or about to be)? */
  get busy() { return this.clock < this.until; }

  /**
   * Light a shell or a rocket (`made`, from shells.js) with its own origin at `at`,
   * `wait` seconds from now. Its points go into the ring over the oldest ones.
   */
  add(made, at, wait = 0) {
    const src = made.data, dst = this.buffer.array, t0 = this.clock + wait;
    const n = Math.min(made.count, this.cap);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const s = i * STRIDE, d = ((this.next + i) % this.cap) * STRIDE;
      for (let k = 0; k < STRIDE; k++) dst[d + k] = src[s + k];
      dst[d] += at.x; dst[d + 1] += at.y; dst[d + 2] += at.z;
      dst[d + 6] += t0;
      last = Math.max(last, src[s + 6] + Math.abs(src[s + 7]) + src[s + 8]);
    }
    // send only what changed (in two pieces where it wraps round the end of the ring)
    const end = this.next + n;
    this.buffer.addUpdateRange(this.next * STRIDE, (Math.min(end, this.cap) - this.next) * STRIDE);
    if (end > this.cap) this.buffer.addUpdateRange(0, (end - this.cap) * STRIDE);
    this.buffer.needsUpdate = true;
    this.next = end % this.cap;
    this.until = Math.max(this.until, t0 + last);
  }

  /** A burst at `at` throws `color` on the sea under it, `wait` seconds from now. */
  light(at, color, wait = 0) {
    this.lights.push({ x: at.x, z: at.z, y: at.y, t: this.clock + wait, c: color });
    this.until = Math.max(this.until, this.clock + wait + 1.4);
  }

  /**
   * Each frame. `night` 0-1; `wind` { x, z }: how far the wind carries smoke in a second,
   * in metres; `light`: the colour of the day (a THREE.Color), which the smoke is seen by.
   */
  update(dt, { night = 1, wind = null, light = null } = {}) {
    // (the graphics card counts in single precision: start the clock again whenever the sky is empty)
    if (!this.busy && this.clock > 600) { this.clear(); this.clock = 0; this.until = 0; }
    this.clock += dt;
    const u = this.uniforms;
    u.uTime.value = this.clock;
    u.uDay.value = 1 - night;
    u.uBoost.value = glowBoost.value;
    if (wind) u.uWind.value.set(wind.x, 0, wind.z);
    if (light) u.uSmoke.value.copy(light);
    this.points.visible = this.busy;
    // the sea takes the colour of the strongest burst over it: up at once, gone in about a second
    let best = null, strength = 0;
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const L = this.lights[i], a = this.clock - L.t;
      if (a > 1.4) { this.lights.splice(i, 1); continue; }
      if (a < 0) continue;
      const s = Math.min(1, a / 0.05) * Math.exp(-a * 3.2);
      if (s > strength) { strength = s; best = L; }
    }
    const b = seaFlash.uBurst.value;
    if (best) {
      // weaker by day, when there is light on the water already
      b.set(best.x, best.z, 50 + best.y * 1.1, strength * (0.35 + 1.65 * night));
      seaFlash.uBurstCol.value.setRGB(best.c[0], best.c[1], best.c[2]);
      this.flashing = true;
    } else if (this.flashing) { b.w = 0; this.flashing = false; }
  }

  /** Put everything out. */
  clear() {
    this.buffer.array.fill(0);
    this.buffer.clearUpdateRanges();
    this.buffer.needsUpdate = true;
    this.next = 0;
    this.until = this.clock;
    this.lights.length = 0;
    this.points.visible = false;
    if (this.flashing) { seaFlash.uBurst.value.w = 0; this.flashing = false; }
  }

  dispose() {
    this.clear();
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
