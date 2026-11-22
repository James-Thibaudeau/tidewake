// Boat wake: a turbulent trail behind the stern plus two diverging "Kelvin"
// arms from the bow, drawn as ribbons lying on the waves with wispy foam
// threads that stretch along the trail and thin out as they age.
import * as THREE from 'three';
import { waveHeight, NOISE_GLSL } from './waves.js';

const MAXP = 72;          // history points per strip
const STRIPS = 3;         // 0 = stern trail, 1/2 = port/starboard arms
const LIFE = [5.5, 3.2, 3.2];
const KELVIN = 0.34;      // tan(~19°): how fast the arms spread per unit travelled

const vert = /* glsl */ `
attribute float aAge;
attribute float aInt;
varying vec2 vUv;
varying float vAge;
varying float vInt;
void main() {
  vUv = uv; vAge = aAge; vInt = aInt;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.z += 0.4; // sit just above the water so crests don't slice it
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform vec3 uLight;
varying vec2 vUv;
varying float vAge;
varying float vInt;
${NOISE_GLSL}
void main() {
  if (vAge >= 0.999 || vInt < 0.01) discard;
  float across = vUv.y;
  // feathered edges across the ribbon
  float edge = smoothstep(0.0, 0.32, across) * smoothstep(1.0, 0.68, across);
  // wispy threads running along the trail (u is distance travelled, in metres)
  float s1 = vnoise(vec2(vUv.x * 0.07, across * 4.0 + 1.3));
  float s2 = vnoise(vec2(vUv.x * 0.22 + 7.0, across * 10.0 - 3.1));
  float s3 = vnoise(vec2(vUv.x * 0.6 + 2.0, across * 18.0));
  float wisps = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
  // gaps along the trail so it breaks into separate wisps instead of a solid line
  float gaps = smoothstep(0.28, 0.55, vnoise(vec2(vUv.x * 0.045, across * 1.5 + 4.0)));
  // young wake is a dense churn; old wake thins into a few threads, then nothing
  float thr = mix(0.36, 0.72, vAge);
  float f = wisps * (0.55 + edge * 0.6) * mix(1.0, 0.55 + 0.45 * gaps, smoothstep(0.05, 0.4, vAge));
  float a = smoothstep(thr, thr + 0.09, f) * edge;
  a *= (1.0 - vAge) * (1.0 - vAge * 0.4) * vInt * 0.72;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.86, 0.92, 0.95) * min(uLight, vec3(1.05)), a);
  #include <colorspace_fragment>
}`;

export class Wake {
  constructor(scene) {
    this.pts = [];   // newest first
    this.odo = 0;
    this.lastX = null; this.lastZ = null;
    const V = MAXP * 2;
    this.pos = new Float32Array(STRIPS * V * 3);
    this.uvs = new Float32Array(STRIPS * V * 2);
    this.ages = new Float32Array(STRIPS * V).fill(1);
    this.ints = new Float32Array(STRIPS * V);
    const idx = [];
    for (let s = 0; s < STRIPS; s++) {
      for (let i = 0; i < MAXP - 1; i++) {
        const a = s * V + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.ages, 1));
    g.setAttribute('aInt', new THREE.BufferAttribute(this.ints, 1));
    g.setIndex(idx);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uLight: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 1 } },
      vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.time = 0;
  }

  reset() { this.pts.length = 0; this.lastX = null; }

  // stern/bow: world xz; f: forward unit vector; speed in units/s
  update(dt, sx, sz, bx, bz, fx, fz, speed) {
    this.time += dt;
    const sp = Math.abs(speed);
    if (this.lastX !== null) this.odo += Math.hypot(sx - this.lastX, sz - this.lastZ);
    // spacing adapts so a fast boat still fits in the history
    const spacing = Math.max(1.4, (sp * LIFE[0]) / (MAXP - 4));
    const newest = this.pts[0];
    if (sp > 0.8 && (!newest || this.odo - newest.odo >= spacing)) {
      this.pts.unshift({ sx, sz, bx, bz, rx: -fz, rz: fx, born: this.time, speed: sp, odo: this.odo });
      if (this.pts.length > MAXP - 1) this.pts.length = MAXP - 1;
    }
    this.lastX = sx; this.lastZ = sz;
    while (this.pts.length && this.time - this.pts[this.pts.length - 1].born > LIFE[0]) this.pts.pop();

    // a live head point keeps the wake attached to the hull
    const head = { sx, sz, bx, bz, rx: -fz, rz: fx, born: this.time, speed: sp, odo: this.odo };
    const list = sp > 0.8 ? [head, ...this.pts] : this.pts;
    const V = MAXP * 2;
    for (let s = 0; s < STRIPS; s++) {
      for (let i = 0; i < MAXP; i++) {
        const vi = s * V + i * 2;
        const P = list[i] || list[list.length - 1];
        if (!P) { this.ages[vi] = this.ages[vi + 1] = 1; continue; }
        const age = this.time - P.born;
        const k = Math.min(1, age / LIFE[s]);
        let cx, cz, w;
        if (s === 0) {
          cx = P.sx; cz = P.sz;
          w = Math.min(7, 1.8 + age * 1.0);
        } else {
          const side = s === 1 ? 1 : -1;
          const d = 1.1 + age * P.speed * KELVIN;
          cx = P.bx + P.rx * d * side; cz = P.bz + P.rz * d * side;
          w = 0.7 + age * 0.4;
        }
        const strength = Math.min(1, Math.max(0, (P.speed - 1.0) / 7)) * (s === 0 ? 1 : 0.65);
        const dead = !list[i];
        for (let e = 0; e < 2; e++) {
          const o = (e === 0 ? -0.5 : 0.5) * w;
          const x = cx + P.rx * o, z = cz + P.rz * o;
          const j = vi + e;
          this.pos[j * 3] = x; this.pos[j * 3 + 1] = waveHeight(x, z) + 0.12; this.pos[j * 3 + 2] = z;
          this.uvs[j * 2] = P.odo; this.uvs[j * 2 + 1] = e;
          this.ages[j] = dead ? 1 : k;
          this.ints[j] = strength;
        }
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.attributes.aAge.needsUpdate = true;
    g.attributes.aInt.needsUpdate = true;
  }
}
