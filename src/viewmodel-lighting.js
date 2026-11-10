// A material-aware exposure floor for the first-person model only. Keep the map's
// reflection and key light; lift unreadable shadows without whitening lit metal.
const minimumFill = { value: .22 };
const treated = new WeakSet();

const fillFragment = /* glsl */`
  float viewmodelShape = .68 + .32 * max(0.0,
    dot(normal, normalize(vec3(-.35, .55, 1.0))));
  vec3 viewmodelFloor = diffuseColor.rgb * viewmodelMinimumFill * viewmodelShape;
  #ifdef USE_AOMAP
    viewmodelFloor *= mix(.45, 1.0, ambientOcclusion);
  #endif
  float viewmodelFloorLuma = dot(viewmodelFloor, vec3(.2126, .7152, .0722));
  float viewmodelLuma = dot(outgoingLight, vec3(.2126, .7152, .0722));
  // L + F*exp(-L/F) never falls below F and smoothly approaches L in the light.
  outgoingLight += viewmodelFloor * exp(-viewmodelLuma / max(viewmodelFloorLuma, .00001));
`;

export function addViewmodelMinimumLight(root) {
  root.traverse(node => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      // Preserve transparent sight glass and unlit dots; they have no shadow floor.
      if (!material?.isMeshStandardMaterial || material.transparent || material.transmission > 0 || treated.has(material)) continue;
      treated.add(material);
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this, shader, renderer);
        shader.uniforms.viewmodelMinimumFill = minimumFill;
        shader.fragmentShader = 'uniform float viewmodelMinimumFill;\n' + shader.fragmentShader
          .replace('#include <opaque_fragment>', fillFragment + '\n#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => key + '|viewmodel-minimum-light-v1';
      material.needsUpdate = true;
    }
  });
}
