// Cel-shading helpers: a 2-band gradient for MeshToonMaterial and
// inverted-hull outline materials.
import * as THREE from 'three';

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

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
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
