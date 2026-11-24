// Cel-shading helpers: a 2-band gradient for MeshToonMaterial, a cel rim
// light (three-custom-shader-material) and inverted-hull outline materials.
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';

let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([110, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

// HDR multiplier for lamp glow colours: above 1.0 they feed the bloom pass.
export const glowBoost = { value: 1 };

// Shared by every toon material; fx.js drives them each frame (strength 0 = off).
export const rimUniforms = {
  uRimColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uRimStrength: { value: 0 },
  uRimDir: { value: new THREE.Vector3(0, 1, 0) }, // toward the sun, in view space
};

// A hard-edged rim on the sun-facing side of silhouettes, tinted by the
// surface colour so it reads as light catching the edge, not a white halo.
// Up-facing surfaces are left out: at grazing angles a deck or a ledge would
// otherwise light up as a whole band rather than an edge. So are double-sided
// sheets (sails, flags): seen edge-on, the whole sheet would light up.
const RIM_FRAG = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec3 uRimDir;
vec3 csmRim = vec3(0.0);
void main() {
#if !defined(FLAT_SHADED) && !defined(DOUBLE_SIDED)
  if (uRimStrength > 0.0) {
    vec3 n = normalize(vNormal);
    float fres = 1.0 - clamp(dot(n, normalize(vViewPosition)), 0.0, 1.0);
    // sun-side edges, plus every silhouette when the sun is behind the subject
    float lit = max(smoothstep(0.0, 0.35, dot(n, uRimDir)), smoothstep(0.2, 0.8, -uRimDir.z) * 0.8);
    float up = inverseTransformDirection(n, viewMatrix).y;
    float rim = smoothstep(0.6, 0.66, fres) * lit * (1.0 - smoothstep(0.45, 0.8, up));
    vec3 tint = diffuse;
    #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
      tint *= vColor.rgb;
    #endif
    csmRim = uRimColor * mix(vec3(0.55), tint, 0.6) * (rim * uRimStrength);
  }
#endif
}`;

// The library has no emissive hook for toon materials, so add the rim to
// the emissive term ourselves (after lighting, before fog).
const RIM_PATCH = {
  csmRim: { '#include <emissivemap_fragment>': '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += csmRim;' },
};

/**
 * A MeshToonMaterial with the rim light patched in. `patch` keeps a
 * material's own onBeforeCompile/cache key working alongside it;
 * `rim: false` skips the rim (terrain: big gentle slopes read as all-rim).
 */
export function toonMaterial(params = {}, patch = {}) {
  const base = new THREE.MeshToonMaterial(params);
  if (patch.onBeforeCompile) base.onBeforeCompile = patch.onBeforeCompile;
  if (patch.cacheKey) base.customProgramCacheKey = () => patch.cacheKey;
  if (patch.rim === false) return base;
  return new CustomShaderMaterial({ baseMaterial: base, fragmentShader: RIM_FRAG, uniforms: rimUniforms, patchMap: RIM_PATCH });
}

export function toon(color, opts = {}) {
  return toonMaterial({ color, gradientMap: toonGradient(), ...opts });
}

// Pushes vertices out along their normals and renders back faces only.
// Works with InstancedMesh too (instancing chunk is kept).
export function outlineMaterial(width = 0.06, color = 0x1b2233) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: width };
    shader.vertexShader = 'uniform float uOutline;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = position + normalize(normal) * uOutline;'
    );
  };
  m.customProgramCacheKey = () => 'outline' + width;
  return m;
}

// Simple outline by scaling a clone of the mesh (good for convex shapes).
export function scaledOutline(mesh, scale = 1.06, color = 0x1b2233) {
  const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  o.position.copy(mesh.position);
  o.rotation.copy(mesh.rotation);
  o.scale.copy(mesh.scale).multiplyScalar(scale);
  return o;
}
