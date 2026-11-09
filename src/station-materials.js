import * as T from 'three';

// The source is a four-band roughness atlas, not one tall panorama. PMREM needs
// the first 2:1 band; it generates its own roughness levels from this sharp image.
export function stationEnvironment(atlas) {
  const image=atlas.image,canvas=document.createElement('canvas');
  canvas.width=image.width;canvas.height=image.height/4;
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.mapping=T.EquirectangularReflectionMapping;texture.name='station-panorama';atlas.dispose();return texture;
}

// Encode normal XY + roughness into one small linear-data texture. Normal Z is
// reconstructed in the shader, so close-up detail costs one sample, not two.
export function stationDetailMap(normal,rough,coarse) {
  const size=coarse?256:512,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(normal.image,0,0,size,size);
  const pixels=ctx.getImageData(0,0,size,size);ctx.drawImage(rough.image,0,0,size,size);const roughness=ctx.getImageData(0,0,size,size).data;
  for(let i=0;i<pixels.data.length;i+=4){pixels.data[i+2]=roughness[i+1];pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
  const texture=new T.CanvasTexture(canvas);texture.name='station-packed-detail';texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.anisotropy=coarse?4:8;return texture;
}

// Original painted atlases remain the colour layer. A shared packed map supplies
// metre-scale surface detail, with distance fade to avoid distant sparkle.
export function stationSurface(material,{map,scale=1,strength=.15,variation=.18,uv=false,coarse=false,window=null}={}) {
  const previous=material.onBeforeCompile,oldKey=material.customProgramCacheKey();
  material.onBeforeCompile=shader=>{
    previous.call(material,shader);
    Object.assign(shader.uniforms,{stationDetail:{value:map},stationWindow:{value:window}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStationPosition;\nvarying vec2 vStationDetailUv;')
      .replace('#include <project_vertex>','#include <project_vertex>\nvStationPosition=(modelMatrix*vec4(transformed,1.)).xyz;\nvStationDetailUv=uv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vStationPosition; varying vec2 vStationDetailUv;
      uniform sampler2D stationDetail; uniform sampler2D stationWindow;
      mat3 stationTangent(vec3 p,vec3 n,vec2 uv){
        vec3 a=cross(dFdy(p),n),b=cross(n,dFdx(p));vec2 u=dFdx(uv),v=dFdy(uv);
        vec3 t=a*u.x+b*v.x,bt=a*u.y+b*v.y;
        float f=inversesqrt(max(max(dot(t,t),dot(bt,bt)),1e-12));return mat3(t*f,bt*f,n);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      vec3 stationAxis=abs(inverseTransformDirection(normalize(vNormal),viewMatrix));
      vec2 stationUv=${uv?'vStationDetailUv':`stationAxis.y>.65?vStationPosition.xz:(stationAxis.x>stationAxis.z?vStationPosition.zy:vStationPosition.xy)`};
      stationUv*=${scale.toFixed(3)};
      float stationFade=1.-smoothstep(12.,42.,length(vViewPosition));
      vec3 stationSample=texture2D(stationDetail,stationUv).rgb;
      float stationGrain=stationSample.b;
      roughnessFactor=clamp(roughnessFactor+(stationGrain-.5)*${variation.toFixed(3)},.26,.94);
      diffuseColor.rgb*=1.+(stationGrain-.5)*.065*stationFade;`);
    if(!coarse)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec2 stationXY=stationSample.rg*2.-1.;
      vec3 stationN=vec3(stationXY,sqrt(max(.001,1.-dot(stationXY,stationXY))));
      stationN.xy*=${strength.toFixed(3)}*stationFade;
      normal=normalize(stationTangent(-vViewPosition,normal,stationUv)*stationN);`);
    if(window)shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      // Source trainMetal.frag: window reflection is anchored in the station,
      // so the light travels across a moving train rather than sticking to its UVs.
      vec3 stationWorldN=inverseTransformDirection(normal,viewMatrix);
      vec3 stationEye=normalize(cameraPosition-vStationPosition);
      vec3 stationRay=reflect(-stationEye,stationWorldN);
      vec2 stationReflectUv=vec2(vStationPosition.z*.018+.53+stationRay.z*.09,1.-clamp(stationRay.y*.5+.5,0.,1.));
      vec3 stationLight=texture2D(stationWindow,stationReflectUv).rgb*vec3(.83,.91,1.12);
      float stationUp=smoothstep(.15,.85,max(stationWorldN.y,0.));
      float stationFresnel=pow(1.-max(dot(stationWorldN,stationEye),0.),4.);
      totalEmissiveRadiance+=stationLight*(.4+.6*stationFresnel)*mix(.035,.32,stationUp);`);
  };
  material.customProgramCacheKey=()=>`station-detail-v1/${oldKey}/${scale}/${strength}/${variation}/${uv}/${coarse}/${!!window}`;
  material.dithering=true;
  return material;
}
