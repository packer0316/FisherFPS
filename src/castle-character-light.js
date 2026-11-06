
import { Color } from 'three';

// A soft view-facing character fill keeps silhouettes readable in the dark hall.
// It is applied only to cloned castle materials, preserving other maps' lighting.
export function addCastleCharacterLight(material, strength=.3) {
  const compile=material.onBeforeCompile;
  const previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.uniforms.actorFill={value:new Color(.82,.9,1).multiplyScalar(strength)};
    shader.fragmentShader='uniform vec3 actorFill;\n'+shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float softKey=.44+.56*max(0.,dot(normal,normalize(vec3(-.35,.48,.86))));
      float actorRim=pow(1.-max(0.,dot(normal,normalize(vViewPosition))),3.);
      totalEmissiveRadiance+=diffuseColor.rgb*actorFill*softKey+diffuseColor.rgb*actorRim*.055;
      `);
  };
  material.customProgramCacheKey=()=>previousKey+'-castle-character-fill-'+strength;
}
