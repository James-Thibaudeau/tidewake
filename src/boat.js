// The player's sailboat: model (with visual upgrades), sailing physics,
// collisions, wake particles.
import * as THREE from 'three';
import { toon, toonGradient, scaledOutline, outlineMaterial } from './toon.js';
import { waveHeight } from './waves.js';
import { clamp, damp, smoothstep, wrapAngle, lerp, TAU } from './util.js';
import { WORLD_HALF } from './config.js';

const SAIL_U = 9, SAIL_V = 8;

// Efficiency by angle between bow and where the wind comes from (0 = into wind).
export function pointOfSail(a) {
  a = Math.abs(a);
  if (a < 0.6) return 0.05 + (a / 0.6) * 0.1;
  if (a < 1.0) return lerp(0.15, 0.78, (a - 0.6) / 0.4);
  if (a < 1.75) return lerp(0.78, 1.0, (a - 1.0) / 0.75);
  return lerp(1.0, 0.72, (a - 1.75) / (Math.PI - 1.75));
}

export function pointOfSailName(a) {
  a = Math.abs(a);
  if (a < 0.6) return 'In irons';
  if (a < 1.1) return 'Close hauled';
  if (a < 1.9) return 'Beam reach';
  if (a < 2.7) return 'Broad reach';
  return 'Running';
}

const HULL_STYLE = [
  { hull: '#8b5a2b', trim: '#e9dcc0', deck: '#c89b62' },
  { hull: '#7a4a22', trim: '#3f7fd0', deck: '#d0a46a' },
  { hull: '#b8432f', trim: '#f5efe0', deck: '#d8ae74' },
  { hull: '#3a2a22', trim: '#ffcf4a', deck: '#c99a5e' },
];
const SAIL_STYLE = [
  { base: '#e6d9bb', stripe: '#cdbb92', jib: false },
  { base: '#fbf8ef', stripe: '#fbf8ef', jib: true },
  { base: '#fbf8ef', stripe: '#2f6fd0', jib: true },
  { base: '#fff3d0', stripe: '#d4402e', jib: true },
];

export class Boat {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.sailLevel = 0;
    this.sailVis = 0;
    this.rudder = 0;
    this.push = new THREE.Vector2();
    this.heel = 0; this.roll = 0; this.pitch = 0; this.y = 0;
    this.sink = 0;
    this.maxHealth = 100;
    this.boomAngle = 0;
    this.relWind = 0;
    this.efficiency = 0;
    this.hitCooldown = 0;
    this.build();
    this.buildWake();
  }

  build() {
    const g = this.group;
    // Hull: extruded top-view outline, tapered toward the keel
    const s = new THREE.Shape();
    s.moveTo(-1.15, -3.2); s.lineTo(1.15, -3.2);
    s.quadraticCurveTo(1.75, 0.6, 0, 3.8);
    s.quadraticCurveTo(-1.75, 0.6, -1.15, -3.2);
    const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.18, bevelSegments: 2, curveSegments: 12 });
    hullGeo.rotateX(Math.PI / 2);
    hullGeo.translate(0, 0.75, 0);
    const p = hullGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = smoothstep(0.7, -0.6, y);
      p.setX(i, p.getX(i) * (1 - t * 0.4));
    }
    hullGeo.computeVertexNormals();
    this.hullMat = toon('#8b5a2b');
    const hull = new THREE.Mesh(hullGeo, this.hullMat);
    g.add(hull, scaledOutline(hull, 1.05));

    const rimGeo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 12 });
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.scale(1.07, 1, 1.04);
    rimGeo.translate(0, 0.98, 0);
    this.trimMat = toon('#e9dcc0');
    g.add(new THREE.Mesh(rimGeo, this.trimMat));

    const deckGeo = new THREE.ShapeGeometry(s, 12);
    deckGeo.rotateX(Math.PI / 2);
    deckGeo.rotateZ(Math.PI); // face up (shape is symmetric in x)
    deckGeo.scale(0.93, 1, 0.93);
    deckGeo.translate(0, 1.0, 0);
    this.deckMat = toon('#c89b62');
    g.add(new THREE.Mesh(deckGeo, this.deckMat));

    // Mast + boom + sail
    const woodMat = toon('#7a5432');
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7.4, 8), woodMat);
    mast.position.set(0, 4.4, 0.9);
    g.add(mast, scaledOutline(mast, 1.25));
    this.mastTop = new THREE.Vector3(0, 8.1, 0.9);

    this.boom = new THREE.Group();
    this.boom.position.set(0, 1.55, 0.9);
    g.add(this.boom);
    const boomBar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.7, 6), woodMat);
    boomBar.rotation.x = Math.PI / 2;
    boomBar.position.z = -1.85;
    this.boom.add(boomBar);

    this.sailGeo = new THREE.BufferGeometry();
    const n = (SAIL_U + 1) * (SAIL_V + 1);
    this.sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let j = 0; j < SAIL_V; j++) for (let i = 0; i < SAIL_U; i++) {
      const a = j * (SAIL_U + 1) + i, b = a + 1, c = a + SAIL_U + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    this.sailGeo.setIndex(idx);
    this.sailMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.sail = new THREE.Mesh(this.sailGeo, this.sailMat);
    this.sail.frustumCulled = false;
    this.boom.add(this.sail);

    // Jib (front sail) for upgraded rigs
    const jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.2, 0, 0, 5.6, -2.75, 0, 0.3, -2.3], 3));
    jg.setIndex([0, 1, 2]);
    jg.computeVertexNormals();
    this.jibMat = toon('#fbf8ef', { side: THREE.DoubleSide });
    this.jib = new THREE.Mesh(jg, this.jibMat);
    this.jibPivot = new THREE.Group();
    this.jibPivot.position.set(0, 1.0, 3.6);
    this.jibPivot.add(this.jib);
    g.add(this.jibPivot);

    // Flag at the masthead (points downwind)
    this.flagGeo = new THREE.PlaneGeometry(1.5, 0.75, 6, 1);
    this.flagGeo.rotateY(-Math.PI / 2);
    this.flagGeo.translate(0, 0, 0.75);
    this.flagBase = Float32Array.from(this.flagGeo.attributes.position.array);
    this.flagMat = toon('#d64a3a', { side: THREE.DoubleSide });
    this.flag = new THREE.Mesh(this.flagGeo, this.flagMat);
    this.flag.position.copy(this.mastTop).add(new THREE.Vector3(0, -0.4, 0));
    g.add(this.flag);

    // Lantern on a stern post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), woodMat);
    post.position.set(0.7, 1.7, -2.9);
    g.add(post);
    this.lanternMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    this.lantern = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), this.lanternMat);
    this.lantern.position.set(0.7, 2.7, -2.9);
    g.add(this.lantern);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 4), toon('#2b2b33'));
    cap.position.set(0.7, 3.1, -2.9); cap.rotation.y = Math.PI / 4;
    g.add(cap);
    this.light = new THREE.PointLight(0xffc070, 0, 40, 1.2);
    this.light.position.set(0.7, 3.0, -2.9);
    g.add(this.light);

    // Little sailor at the tiller
    const sailor = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 8), toon('#3f9a5a'));
    body.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toon('#f2c9a0'));
    head.position.y = 1.35;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.45, 8), toon('#2f5fb0'));
    hat.position.y = 1.72;
    const om = outlineMaterial(0.04);
    sailor.add(body, head, hat, new THREE.Mesh(body.geometry, om).translateY(0.6), new THREE.Mesh(head.geometry, om).translateY(1.35));
    sailor.position.set(-0.2, 0.8, -2.2);
    this.sailor = sailor;
    g.add(sailor);

    // Tiller
    this.tiller = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), woodMat);
    this.tiller.geometry.translate(0, 0, 0.7);
    this.tiller.position.set(0, 1.15, -3.3);
    g.add(this.tiller);
  }

  buildWake() {
    const N = 260;
    this.wakeN = N;
    this.wake = [];
    const geo = new THREE.BufferGeometry();
    this.wakePos = new Float32Array(N * 3);
    this.wakeAlpha = new Float32Array(N);
    this.wakeSize = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.wakeAlpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.wakeSize, 1));
    for (let i = 0; i < N; i++) this.wake.push({ x: 0, z: 0, age: 99, life: 1, size: 1, vx: 0, vz: 0 });
    this.wakeMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uLight: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; uniform vec3 uLight;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5 || vA < 0.01) discard;
          float a = step(d, 0.5) * vA; gl_FragColor = vec4(vec3(0.95,0.98,1.0) * uLight, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.wakePoints = new THREE.Points(geo, this.wakeMat);
    this.wakePoints.frustumCulled = false;
    this.wakePoints.renderOrder = 3;
    this.scene.add(this.wakePoints);
    this.wakeIdx = 0;
    this.wakeTimer = 0;
  }

  applyUpgrades(levels, values) {
    const hs = HULL_STYLE[levels.hull || 0];
    this.hullMat.color.set(hs.hull);
    this.trimMat.color.set(hs.trim);
    this.deckMat.color.set(hs.deck);
    const ss = SAIL_STYLE[levels.sail || 0];
    this.sailStyle = { base: new THREE.Color(ss.base), stripe: new THREE.Color(ss.stripe) };
    this.jibMat.color.set(ss.base);
    this.jibPivot.visible = ss.jib;
    this.flagMat.color.set((levels.sail || 0) >= 3 ? '#ffcf4a' : '#d64a3a');
    this.maxHealth = values.hull;
    this.lanternRange = values.lantern;
    this.lantern.scale.setScalar(1 + (levels.lantern || 0) * 0.25);
    this.writeSailColors();
  }

  writeSailColors() {
    const col = this.sailGeo.attributes.color;
    for (let j = 0; j <= SAIL_V; j++) for (let i = 0; i <= SAIL_U; i++) {
      const v = j / SAIL_V;
      const c = v > 0.55 && v < 0.72 ? this.sailStyle.stripe : this.sailStyle.base;
      col.setXYZ(j * (SAIL_U + 1) + i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  forward(out = new THREE.Vector2()) { return out.set(Math.sin(this.heading), Math.cos(this.heading)); }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.push.set(0, 0);
    this.sink = 0;
    this.sailLevel = 0;
    this.sailVis = 0;
    for (const w of this.wake) w.age = 99;
  }

  /**
   * ctl: {steer, sailTarget}; wind: {angle, strength}; up: upgrade values.
   * Returns an array of collision events: {damage, kind}.
   */
  simulate(dt, ctl, wind, world, up) {
    const events = [];
    this.hitCooldown -= dt;
    this.rudder = damp(this.rudder, ctl.steer, 6, dt);
    // where the wind comes FROM, relative to the bow (positive = from port/left)
    this.relWind = wrapAngle(wind.angle + Math.PI - this.heading);
    this.efficiency = pointOfSail(this.relWind);
    const sailF = [0, 0.55, 1][this.sailLevel];
    let target = sailF * this.efficiency * wind.strength * 15 * up.sail;
    if (this.sailLevel > 0) target = Math.max(target, 1.2 * sailF);
    const rate = target > this.speed ? 0.45 : 0.7;
    this.speed = damp(this.speed, target, rate, dt);
    const turnRate = (0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 8)) * 0.85 * up.rudder;
    this.heading -= this.rudder * turnRate * dt;
    this.speed *= 1 - Math.abs(this.rudder) * 0.12 * dt;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += (fx * this.speed + this.push.x) * dt;
    this.pos.z += (fz * this.speed + this.push.y) * dt;
    this.push.multiplyScalar(Math.exp(-2.5 * dt));

    // world edge: a strong current pushes you back
    const edge = WORLD_HALF - 250;
    const ax = Math.abs(this.pos.x), az = Math.abs(this.pos.z);
    this.atEdge = ax > edge || az > edge;
    if (ax > edge) this.push.x -= Math.sign(this.pos.x) * (ax - edge) * 0.3 * dt * 10;
    if (az > edge) this.push.y -= Math.sign(this.pos.z) * (az - edge) * 0.3 * dt * 10;
    this.pos.x = clamp(this.pos.x, -WORLD_HALF + 20, WORLD_HALF - 20);
    this.pos.z = clamp(this.pos.z, -WORLD_HALF + 20, WORLD_HALF - 20);

    // Terrain collision: probe bow, sides and stern
    const rx = -fz, rz = fx;
    const probes = [[3.6, 0], [1.2, 1.3], [1.2, -1.3], [-2.9, 0.9], [-2.9, -0.9]];
    for (const [f, r] of probes) {
      const px = this.pos.x + fx * f + rx * r, pz = this.pos.z + fz * f + rz * r;
      const h = world.heightAt(px, pz);
      if (h > -0.7) {
        const gx = world.heightAt(px + 1, pz) - world.heightAt(px - 1, pz);
        const gz = world.heightAt(px, pz + 1) - world.heightAt(px, pz - 1);
        const gl = Math.hypot(gx, gz) || 1;
        const nx = gx / gl, nz = gz / gl; // uphill direction
        const into = (fx * nx + fz * nz) * this.speed;
        const pen = Math.min(2, (h + 0.7) * 0.6 + 0.15);
        this.pos.x -= nx * pen; this.pos.z -= nz * pen;
        if (into > 0) {
          if (into > 3.5 && this.hitCooldown <= 0) {
            events.push({ damage: (into - 3.5) * 4.5 * (1 - up.keel * 0.4), kind: 'ground', speed: into });
            this.hitCooldown = 0.8;
            this.push.set(-nx * into * 0.6, -nz * into * 0.6);
            this.speed *= -0.25;
          } else {
            this.speed *= Math.exp(-6 * dt);
          }
        }
        break;
      }
    }
    // Rocks
    const rock = world.rockHit(this.pos.x + fx * 1.5, this.pos.z + fz * 1.5, 2.2);
    if (rock) {
      let nx = this.pos.x - rock.x, nz = this.pos.z - rock.z;
      const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d;
      const into = -(fx * nx + fz * nz) * this.speed;
      const pen = rock.r + 3.6 - d;
      if (pen > 0) { this.pos.x += nx * pen * 0.5; this.pos.z += nz * pen * 0.5; }
      if (into > 3 && this.hitCooldown <= 0) {
        events.push({ damage: (into - 3) * 5 * (1 - up.keel * 0.4), kind: 'rock', speed: into });
        this.hitCooldown = 0.8;
        this.push.set(nx * into * 0.7, nz * into * 0.7);
        this.speed *= -0.3;
      } else if (into > 0) this.speed *= Math.exp(-5 * dt);
    }
    return events;
  }

  animate(dt, t, wind, healthFrac, night, up) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const x = this.pos.x, z = this.pos.z;
    const hb = waveHeight(x + fx * 3, z + fz * 3), hs = waveHeight(x - fx * 3, z - fz * 3);
    const hp = waveHeight(x - rx * 1.4, z - rz * 1.4), hst = waveHeight(x + rx * 1.4, z + rz * 1.4);
    const hc = (hb + hs + hp + hst) * 0.25;
    const lowRide = (1 - healthFrac) * 0.35;
    this.y = damp(this.y, hc - lowRide - this.sink, 8, dt);
    this.pitch = damp(this.pitch, -Math.atan2(hb - hs, 6) * 0.8, 5, dt);
    const heelTarget = Math.sign(this.relWind) * [0, 0.5, 1][this.sailLevel] * this.efficiency * wind.strength * 0.16 * (1 - up.keel * 0.5)
      + this.rudder * Math.min(1, this.speed / 10) * 0.06;
    this.heel = damp(this.heel, heelTarget, 2, dt);
    this.roll = damp(this.roll, Math.atan2(hp - hst, 2.8) * 0.7 + this.heel, 5, dt);
    this.group.position.set(x, this.y, z);
    this.group.rotation.set(this.pitch + this.sink * 0.05, this.heading, this.roll + this.sink * 0.12);

    // Sail trim and billow
    const sailTarget = [0.06, 0.55, 1][this.sailLevel];
    this.sailVis = damp(this.sailVis, sailTarget, 3, dt);
    const a = Math.abs(this.relWind);
    const boomMag = clamp((a - 0.45) * 0.55, 0.12, 1.45);
    this.boomAngle = damp(this.boomAngle, Math.sign(this.relWind || 1) * boomMag, 2.5, dt);
    this.boom.rotation.y = this.boomAngle;
    this.jibPivot.rotation.y = this.boomAngle * 0.55;
    const billow = (0.25 + this.efficiency * 0.6) * wind.strength * (this.sailVis > 0.2 ? 1 : 0.2);
    const side = -Math.sign(this.relWind || 1);
    const pos = this.sailGeo.attributes.position;
    const H = 5.9 * this.sailVis;
    for (let j = 0; j <= SAIL_V; j++) for (let i = 0; i <= SAIL_U; i++) {
      const u = i / SAIL_U, v = j / SAIL_V;
      const hgt = H * (1 - 0.55 * u) * v + 0.08;
      const flap = Math.sin(t * 9 + u * 6 + v * 3) * 0.05 * (1 - this.efficiency);
      const bx = side * billow * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1)) * 0.9 + flap;
      pos.setXYZ(j * (SAIL_U + 1) + i, bx, hgt, -u * 3.6);
    }
    pos.needsUpdate = true;
    this.sailGeo.computeVertexNormals();

    // flag streams downwind
    this.flag.rotation.y = wrapAngle(wind.angle - this.heading);
    const fp = this.flagGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const bz = this.flagBase[i * 3 + 2];
      fp.setX(i, this.flagBase[i * 3] + Math.sin(t * 10 - bz * 3) * 0.12 * bz);
    }
    fp.needsUpdate = true;

    this.tiller.rotation.y = this.rudder * 0.5;
    this.sailor.rotation.y = this.rudder * 0.2;

    // Lantern
    this.light.intensity = night * 14 * (0.9 + Math.sin(t * 7) * 0.05);
    this.light.distance = this.lanternRange || 30;
    this.lanternMat.color.setRGB(1, 0.82 + night * 0.1, 0.48 + night * 0.1);

    this.updateWake(dt, fx, fz, rx, rz);
  }

  updateWake(dt, fx, fz, rx, rz) {
    const sp = Math.abs(this.speed);
    this.wakeTimer += dt * (sp * 1.6);
    while (this.wakeTimer > 1 && sp > 1) {
      this.wakeTimer -= 1;
      for (const s of [-1, 1]) {
        const w = this.wake[this.wakeIdx];
        this.wakeIdx = (this.wakeIdx + 1) % this.wakeN;
        w.x = this.pos.x - fx * 2.8 + rx * s * 1.1 + (Math.random() - 0.5) * 0.4;
        w.z = this.pos.z - fz * 2.8 + rz * s * 1.1 + (Math.random() - 0.5) * 0.4;
        w.vx = rx * s * 1.2; w.vz = rz * s * 1.2;
        w.age = 0; w.life = 1.6 + Math.random() * 1.0; w.size = 0.55 + Math.min(sp, 20) * 0.03;
      }
      // bow spray
      if (sp > 6 && Math.random() < 0.5) {
        const w = this.wake[this.wakeIdx];
        this.wakeIdx = (this.wakeIdx + 1) % this.wakeN;
        const s = Math.random() < 0.5 ? -1 : 1;
        w.x = this.pos.x + fx * 3.3 + rx * s * 0.8; w.z = this.pos.z + fz * 3.3 + rz * s * 0.8;
        w.vx = rx * s * 3; w.vz = rz * s * 3; w.age = 0; w.life = 1; w.size = 1.0;
      }
    }
    for (let i = 0; i < this.wakeN; i++) {
      const w = this.wake[i];
      w.age += dt;
      if (w.age > w.life) { this.wakeAlpha[i] = 0; continue; }
      w.x += w.vx * dt; w.z += w.vz * dt;
      w.vx *= 0.98; w.vz *= 0.98;
      const k = w.age / w.life;
      this.wakePos[i * 3] = w.x; this.wakePos[i * 3 + 1] = waveHeight(w.x, w.z) + 0.35; this.wakePos[i * 3 + 2] = w.z;
      this.wakeAlpha[i] = (1 - k) * 0.75;
      this.wakeSize[i] = w.size * (1 + k * 1.6);
    }
    const g = this.wakePoints.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}
