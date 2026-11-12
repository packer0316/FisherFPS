import * as T from 'three';

// TMDC_Zombie: trainStationLight.frag + GameSceneTrainStationLight.SetLinearValue.
// The source adds texture RGB in display space (SRC_ALPHA / ONE), with no HDR or
// second sRGB conversion. Keep Three's skinned vertex shader for the authored mesh.
export function makeStationLight(map, opacity, tint = new T.Color(1, 1, 1)) {
  const material = new T.MeshBasicMaterial({map, color:tint, opacity, transparent:true,
    blending:T.AdditiveBlending, depthWrite:false, depthTest:true, side:T.DoubleSide,
    toneMapped:false, forceSinglePass:true});
  material.onBeforeCompile = shader => {
    shader.fragmentShader = `
      uniform sampler2D map;
      uniform vec3 diffuse;
      uniform float opacity;
      varying vec2 vMapUv;
      void main() {
        vec4 texColor = texture2D(map, vMapUv);
        gl_FragColor = vec4(texColor.rgb * diffuse, texColor.a * opacity);
      }
    `;
  };
  material.customProgramCacheKey = () => 'station-source-additive-v1';
  return material;
}

// The source station shader uses baked, unlit artwork. Retain part of that baked
// light so physical roof shadows do not darken it a second time in the FPS scene.
export function preserveStationBake(material, strength) {
  material.emissiveMap = material.map;
  material.emissive.set(0xffffff);
  material.emissiveIntensity = strength;
}
