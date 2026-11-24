// Visual effects layered over the plain renderer:
//   post    - pmndrs/postprocessing: depth-edge ink lines, HDR bloom, a
//             time-of-day colour grade + neutral tone mapping, then SMAA
//   shadows - three's cascaded shadow maps (CSM addon), folded into the
//             2-tone cel band so a cast shadow matches a self-shadowed side
//   rim     - the toon rim light in toon.js (three-custom-shader-material)
//
// Everything is optional. Low quality turns it all off; for A/B comparisons
// `?fx=0` disables every effect and `?fx=bloom,shadows` picks a subset
// (names: edges, bloom, grade, smaa, shadows, rim).
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, Effect, EffectAttribute, BlendFunction,
  BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode,
} from 'postprocessing';
import { CSM } from 'three/addons/csm/CSM.js';
import { rimUniforms, glowBoost } from './toon.js';
import { isTouch } from './config.js';
import { clamp, lerp } from './util.js';

const ALL = ['edges', 'bloom', 'grade', 'smaa', 'shadows', 'rim'];
const POST = ['edges', 'bloom', 'grade', 'smaa'];

/** Which effects to run for this quality setting (and ?fx= override). */
export function fxFlags(quality) {
  const q = new URLSearchParams(location.search).get('fx');
  let on;
  if (q === '0' || q === 'off') on = [];
  else if (q && q !== '1' && q !== 'on') on = q.split(',').map((s) => s.trim());
  else on = quality === 'low' ? [] : ALL;
  const f = Object.fromEntries(ALL.map((k) => [k, on.includes(k)]));
  f.post = POST.some((k) => f[k]);
  return f;
}

// ------------------------------------------------------------ ink edges
// Second difference of 1/depth: 1/z is linear across any flat surface in
// screen space, so it stays ~0 on planes at any angle and spikes at
// silhouettes and creases. Lines are drawn on the near side only.
const EDGE_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uStrength;
uniform float uThickness;
uniform float uThreshold;
uniform vec2 uFade;
float invZ(const in vec2 uv) { return -1.0 / getViewZ(readDepth(uv)); }
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float z = -getViewZ(depth);
  vec2 o = texelSize * uThickness;
  float w0 = 1.0 / z;
  float s = invZ(uv + vec2(o.x, 0.0)) + invZ(uv - vec2(o.x, 0.0))
          + invZ(uv + vec2(0.0, o.y)) + invZ(uv - vec2(0.0, o.y));
  float lap = (4.0 * w0 - s) / w0;
  float e = smoothstep(uThreshold, uThreshold * 2.5, lap);
  e *= 1.0 - smoothstep(uFade.x, uFade.y, z);
  // ink darkens what is under it rather than painting a flat colour
  vec3 ink = mix(inputColor.rgb, inputColor.rgb * uInk, 0.85);
  outputColor = vec4(mix(inputColor.rgb, ink, e * uStrength), inputColor.a);
}`;

class EdgeEffect extends Effect {
  constructor() {
    super('EdgeEffect', EDGE_FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uInk', new THREE.Uniform(new THREE.Color(0.16, 0.2, 0.32))],
        ['uStrength', new THREE.Uniform(1)],
        ['uThickness', new THREE.Uniform(1)],
        ['uThreshold', new THREE.Uniform(0.12)],
        ['uFade', new THREE.Uniform(new THREE.Vector2(120, 420))],
      ]),
    });
  }
}

// ------------------------------------------------------------ colour grade
const GRADE_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uSat;
uniform float uVignette;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * uTint;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSat), 0.0);
  vec2 d = uv - 0.5;
  c *= 1.0 - dot(d, d) * uVignette;
  outputColor = vec4(c, inputColor.a);
}`;

// ------------------------------------------------------------ guard
// One NaN/Inf pixel from any shader is invisible on a plain canvas, but the
// bloom blur spreads it into big black blocks across the screen. Scrub the
// scene buffer before anything reads it (its own pass: bloom samples the
// render pass output directly, not the effects merged ahead of it).
// NaN/Inf are tested on the raw bits (all-ones exponent): GPU compilers may
// fold isnan()/isinf() away under fast math.
const GUARD_FRAG = /* glsl */ `
bool badFloat(const in float x) { return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u; }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 c = inputColor;
  bool bad = badFloat(c.r) || badFloat(c.g) || badFloat(c.b) || badFloat(c.a);
  outputColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : min(c, vec4(64.0));
}`;

class GuardEffect extends Effect {
  // SRC, not the default NORMAL blend: mix(nan, x, 1.0) is still NaN
  constructor() { super('GuardEffect', GUARD_FRAG, { blendFunction: BlendFunction.SRC }); }
}

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      uniforms: new Map([
        ['uTint', new THREE.Uniform(new THREE.Color(1, 1, 1))],
        ['uSat', new THREE.Uniform(1.08)],
        ['uVignette', new THREE.Uniform(0.55)],
      ]),
    });
  }
}

// ------------------------------------------------------------ cel shadows
// CSM multiplies the light colour by the shadow term, which on a toon
// material darkens an already-dark side a second time. Instead, hand the
// shadow to the toon BRDF, which treats it as "facing away from the light":
// cast shadows land in exactly the same band as self-shadowed faces.
function patchToonShadows() {
  const C = THREE.ShaderChunk;
  if (C.lights_toon_pars_fragment.includes('toonShadow')) return;
  // These are string patches against three's own chunks, so check every
  // match before applying any: after a three.js upgrade that moves the code,
  // shadows fall back to three's plain multiply instead of breaking shaders.
  // directional lights only (the spot-light line has the same start)
  const CALL = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap';
  const CLOSE = 'vDirectionalShadowCoord[ i ] ) : 1.0;';
  const FADE = 'directLight.color = mix( prevColor, directLight.color, shouldFadeLastCascade ? ratio : 1.0 );';
  const TOON = 'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
  const count = (str, sub) => str.split(sub).length - 1;
  const frag = C.lights_fragment_begin;
  const calls = count(frag, CALL);
  if (!calls || calls !== count(frag, CLOSE) || !frag.includes(FADE) || !C.lights_toon_pars_fragment.includes(TOON)) {
    console.warn('fx: three.js shadow chunks changed; cel shadows fall back to plain shadows. Update patchToonShadows() in fx.js.');
    return;
  }
  C.lights_pars_begin += /* glsl */ `
float toonShadow = 1.0;
float toonShadowMask(const in float s) {
#ifdef TOON
  toonShadow = s;
  return 1.0;
#else
  return s;
#endif
}`;
  C.lights_fragment_begin = frag
    .replaceAll(CALL, 'directLight.color *= toonShadowMask( ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap')
    .replaceAll(CLOSE, 'vDirectionalShadowCoord[ i ] ) : 1.0 );')
    .replace(FADE, FADE + '\n\t\t\t\t\ttoonShadow = mix( 1.0, toonShadow, shouldFadeLastCascade ? ratio : 1.0 );');
  C.lights_toon_pars_fragment = C.lights_toon_pars_fragment.replace(TOON, /* glsl */ `#ifdef USE_GRADIENTMAP
	float toonNL = min( dot( geometryNormal, directLight.direction ) * 0.5 + 0.5, toonShadow );
	vec3 irradiance = vec3( texture2D( gradientMap, vec2( toonNL, 0.0 ) ).r ) * directLight.color;
	#else
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color * mix( 0.7, 1.0, toonShadow );
	#endif
	toonShadow = 1.0;`);
}

// ------------------------------------------------------------ the system
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const WARM = new THREE.Color(1.04, 1.0, 0.94);
const COOL = new THREE.Color(0.9, 0.96, 1.1);
const STORM = new THREE.Color(0.94, 0.98, 1.02);

export class FX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.flags = fxFlags(quality);
    const f = this.flags;
    this.frame = 0;
    this.camState = '';
    this.setupMats = new WeakSet();
    this.enabled = true; // master switch for A/B: tidewake.fx.setEnabled(false)

    rimUniforms.uRimStrength.value = 0;
    glowBoost.value = f.bloom ? 2.4 : 1;

    if (f.post) this.buildComposer(scene, camera);
    if (f.shadows) this.buildShadows(scene, camera);
  }

  buildComposer(scene, camera) {
    const f = this.flags;
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    if (f.bloom) composer.addPass(new EffectPass(camera, new GuardEffect()));
    const effects = [];
    if (f.edges) {
      this.edges = new EdgeEffect();
      this.edges.uniforms.get('uThickness').value = Math.max(1, this.renderer.getPixelRatio() * 0.75);
      effects.push(this.edges);
    }
    if (f.bloom) {
      this.bloom = new BloomEffect({
        blendFunction: BlendFunction.ADD, mipmapBlur: true,
        luminanceThreshold: 1.0, luminanceSmoothing: 0.3, intensity: 1.3, radius: 0.75,
      });
      effects.push(this.bloom);
    }
    if (f.grade) {
      this.grade = new GradeEffect();
      this.toneMap = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
      effects.push(this.grade, this.toneMap);
    }
    if (effects.length) composer.addPass(new EffectPass(camera, ...effects));
    // SMAA is a convolution effect, so it gets a pass of its own
    if (f.smaa) composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: isTouch ? SMAAPreset.MEDIUM : SMAAPreset.HIGH })));
    this.composer = composer;
  }

  buildShadows(scene, camera) {
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.rig = new THREE.Group();
    this.rig.name = 'fx-shadow-rig';
    this.csm = new CSM({
      camera, parent: this.rig,
      cascades: isTouch ? 2 : 3,
      maxFar: isTouch ? 140 : 220,
      mode: 'practical',
      shadowMapSize: isTouch ? 1024 : 2048,
      lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
      lightIntensity: 2,
      lightNear: 1, lightFar: 1400, lightMargin: 300,
      shadowBias: -0.0003,
    });
    this.csm.fade = true;
    for (const L of this.csm.lights) L.shadow.normalBias = 0.04;
    patchToonShadows();
    scene.add(this.rig);
  }

  /** Make a toon material receive CSM shadows, keeping its own shader patches. */
  setupMaterial(m) {
    if (this.setupMats.has(m)) return;
    this.setupMats.add(m);
    const prev = m.onBeforeCompile;
    this.csm.setupMaterial(m);
    const hook = m.onBeforeCompile;
    m.onBeforeCompile = function (shader, renderer) {
      prev.call(this, shader, renderer);
      hook.call(this, shader, renderer);
    };
    m.needsUpdate = true;
  }

  /** Flag new toon meshes as shadow casters/receivers (islands stream in, outfits rebuild). */
  scan(scene) {
    scene.traverse((o) => {
      if (!o.isMesh || o.userData.fxShadow) return;
      const m = o.material;
      if (!m || Array.isArray(m) || !m.isMeshToonMaterial) return;
      o.userData.fxShadow = true;
      o.castShadow = !m.transparent;
      o.receiveShadow = true;
      this.setupMaterial(m);
    });
  }

  setSize(w, h) { this.composer?.setSize(w, h); }

  /** Flip every effect off/on at runtime (for side-by-side comparisons). */
  setEnabled(on) {
    this.enabled = on;
    glowBoost.value = on && this.flags.bloom ? 2.4 : 1;
    if (!on) rimUniforms.uRimStrength.value = 0;
    if (this.csm) {
      this.rig.visible = on;
      this.renderer.shadowMap.enabled = on;
    }
  }

  /** Per frame: follow the sky's sun/moon, the active view and the weather. */
  update(game, view) {
    const env = game.env, cam = view.camera;
    const f = this.flags;
    const shadowView = view.scene === game.scene || view.scene === game.ashore?.scene;
    if (!this.enabled) {
      if (this.csm) env.sun.visible = true;
      env.uniforms.uSunHDR.value = 1;
      this.frame++;
      return;
    }

    if (this.csm) {
      if (shadowView && this.rig.parent !== view.scene) view.scene.add(this.rig);
      env.sun.visible = false; // the cascade lights are the sun now
      _v.copy(env.lightDir).negate();
      this.csm.lightDirection.copy(_v);
      for (const L of this.csm.lights) {
        L.color.copy(env.sun.color);
        L.intensity = env.sun.intensity;
      }
      const state = `${cam.fov.toFixed(2)}|${cam.aspect.toFixed(3)}`;
      if (state !== this.camState) { this.camState = state; this.csm.updateFrustums(); }
      if (shadowView) {
        if (this.frame % 20 === 0) this.scan(view.scene);
        this.csm.update();
      }
    }

    if (f.bloom) env.uniforms.uSunHDR.value = 1.7;

    if (f.rim) {
      const day = 1 - env.night;
      rimUniforms.uRimStrength.value = 2.0 * lerp(0.35, 1, day) * (1 - env.overcast * 0.75);
      rimUniforms.uRimColor.value.copy(env.sun.color).lerp(_c.set(1, 1, 1), 0.25);
      rimUniforms.uRimDir.value.copy(env.lightDir).transformDirection(cam.matrixWorldInverse);
    }

    if (this.grade) {
      const u = this.grade.uniforms;
      const storm = clamp(game.weather?.p?.storm ?? 0, 0, 1);
      u.get('uTint').value.setRGB(1, 1, 1)
        .lerp(WARM, env.golden * 0.9)
        .lerp(COOL, env.night * 0.8)
        .lerp(STORM, storm * 0.6);
      u.get('uSat').value = lerp(1.06, 0.88, Math.max(env.overcast * 0.6, storm)) - env.golden * 0.04 - env.night * 0.08;
    }

    if (this.edges) {
      const fog = view.scene.fog;
      const far = fog ? Math.min(fog.far * 0.45, 520) : 420;
      this.edges.uniforms.get('uFade').value.set(far * 0.3, far);
    }

    if (this.composer) {
      if (this.renderPass.mainScene !== view.scene) this.composer.setMainScene(view.scene);
      if (this.renderPass.mainCamera !== cam) this.composer.setMainCamera(cam);
    }
    this.frame++;
  }

  render(view, dt) {
    if (this.composer && this.enabled) this.composer.render(dt);
    else this.renderer.render(view.scene, view.camera);
  }
}
