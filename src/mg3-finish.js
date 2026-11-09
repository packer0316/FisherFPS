import * as T from 'three';
import { creaseGeometry } from './rifle-finish.js';

// Both the UVs and the wear distances are baked once in the moving assembly's own space.
export function finishGeometry(geometry) {
  const pos = geometry.attributes.position;
  const points = Array.from({ length: pos.count }, (_, i) => new T.Vector3().fromBufferAttribute(pos, i));
  const uv = geometry.attributes.uv, a = new T.Vector3(), b = new T.Vector3();
  for (let i = 0; i < points.length; i += 3) {
    const n = a.subVectors(points[i+1], points[i]).cross(b.subVectors(points[i+2], points[i]));
    const x = Math.abs(n.x), y = Math.abs(n.y), z = Math.abs(n.z);
    for (let j = i; j < i+3; j++) {
      const p = points[j];
      if (z >= x && z >= y) uv.setXY(j,p.x,p.y);
      else if (y >= x) uv.setXY(j,p.z,p.x);
      else uv.setXY(j,p.z,p.y);
    }
  }
  return creaseGeometry(geometry, points, 'mgEdge');
}

export function loadMachineFinishes() {
  const loader = new T.TextureLoader();
  function load(name, repeat) {
    const texture = loader.load('viewmodel/mg3-' + name + '.webp');
    if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 4;
    return texture; // Linear packed masks, including the stencil coverage.
  }
  return { detail: load('finish',true), stencil: load('box-ink'), head: load('headstamp') };
}

export function housingMaterial(kind, color, roughness, metalness, maps) {
  const m = new T.MeshStandardMaterial({ color, roughness, metalness });
  m.userData.mgFinish = true;
  m.customProgramCacheKey = () => 'mg3-surface-' + kind;
  m.onBeforeCompile = shader => {
    shader.uniforms.mgDetail = { value: maps.detail };
    if (kind === 'enamel') shader.uniforms.mgInk = { value: maps.stencil };
    const varyings = 'varying vec2 vMgUv; varying vec3 vMgEdge;';
    const boxVaryings = kind === 'enamel' ? 'varying vec3 vBin; varying vec3 vBinNormal;' : '';
    shader.vertexShader = 'attribute vec3 mgEdge;'+varyings+boxVaryings+'\n'+shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvMgUv=uv; vMgEdge=mgEdge;' +
        (kind === 'enamel' ? 'vBin=position; vBinNormal=normal;' : ''));
    // R = rolled grain, G = oil / uneven paint, B = soft scuffs. Keep tiny cuts out
    // of the lighting normal; a subpixel mark should average into the finish, not flash.
    const sample = `
      vec3 grit = texture2D(mgDetail, vMgUv*2.0).rgb;
      vec2 patina = texture2D(mgDetail, vMgUv*1.19+vec2(.41,.73)).gb;
      float footprint = max(length(dFdx(vMgUv)),length(dFdy(vMgUv)));
      float resolved = 1.-smoothstep(.003,.012,footprint);
      float scar = grit.b * resolved;
      float dist = min(vMgEdge.x,min(vMgEdge.y,vMgEdge.z));
      float pixel = max(fwidth(dist),.0001);
      float edgeWidth = .005;
      float edge = (1.-smoothstep(0.,edgeWidth+.5*pixel,dist))*min(1.,edgeWidth/pixel);
      float rub = edge*(.22+.53*patina.x+.25*scar);
      float mgRough, mgMetal;
    `;
    let finish;
    if (kind === 'enamel') {
      finish = `
        float chip = clamp(rub*.98+scar*(.13+.29*edge)+patina.y*.18,0.,1.);
        float primer = smoothstep(.10,.44,chip);
        float bare = smoothstep(.44,.78,chip);
        float fade = smoothstep(.30,.72,patina.x);
        vec3 enamel = diffuseColor.rgb*mix(.65,1.22,fade)*(.89+.22*grit.g);
        float seam = 1.-smoothstep(.003,.024,abs(vBin.y-.113));
        enamel *= 1.-.22*seam;
        enamel = mix(enamel,vec3(.151,.107,.069),primer*.77);
        diffuseColor.rgb = mix(enamel,vec3(.28,.30,.29),bare);
        vec2 st = vec2(vBin.x/.192+.5,(vBin.y-.004)/.132+.5);
        float ink = 0.;
        if(vBin.z>.13 && vBinNormal.z>.76 && all(greaterThan(st,vec2(0.))) && all(lessThan(st,vec2(1.))))
          ink = texture2D(mgInk,vec2(st.x,.5+.5*st.y)).r;
        st = vec2(vBin.x/.188+.5,(-.107-vBin.z)/.078+.5);
        if(vBin.y>.123 && vBinNormal.y>.85 && all(greaterThan(st,vec2(0.))) && all(lessThan(st,vec2(1.))))
          ink = texture2D(mgInk,vec2(st.x,.5*st.y)).r;
        ink *= (1.-primer)*(.83+.17*grit.r);
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.50,.47,.32),ink);
        mgRough = mix(roughness+.15*(grit.g-.5)+.1*(patina.x-.5),.38,bare)+ink*.07;
        mgMetal = mix(metalness,.91,bare)*(1.-ink);
      `;
    } else if (kind === 'polymer') {
      finish = `
        diffuseColor.rgb *= .76+.34*patina.x+.18*grit.r;
        diffuseColor.rgb += vec3(.022)*rub;
        mgRough = roughness+.16*(grit.r-.5)-.15*rub;
        mgMetal = metalness;
      `;
    } else {
      finish = `
        float wear = clamp(.53*rub+.22*scar+.075*patina.y,0.,1.);
        vec3 bluing = diffuseColor.rgb*(.71+.48*patina.x+.18*grit.r);
        diffuseColor.rgb = mix(bluing,vec3(.23,.25,.26),wear);
        mgRough = mix(roughness+.16*(grit.g-.5)+.10*(patina.x-.5),.36,wear);
        mgMetal = mix(metalness,.94,wear);
      `;
    }
    shader.fragmentShader = varyings+boxVaryings+'uniform sampler2D mgDetail;\n'+
      (kind === 'enamel' ? 'uniform sampler2D mgInk;\n' : '') + shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n'+sample+finish)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(mgRough,.20,.89);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mgMetal;');
  };
  return m;
}

// Each cartridge includes several alloys, but the entire moving belt uses one instanced draw.
export function beltMaterial(maps) {
  const m = new T.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1 });
  m.customProgramCacheKey = () => 'mg3-linked-ammunition';
  m.onBeforeCompile = shader => {
    shader.uniforms.mgHead = { value: maps.head };
    shader.uniforms.mgDetail = { value: maps.detail };
    const varyings = 'varying vec3 vAlloy; varying vec2 vHeadUv; varying vec2 vCaseUv; varying vec3 vBeltAxis; varying vec3 vBeltUp;';
    shader.vertexShader = 'attribute vec3 mgAlloy; attribute vec3 mgSpan; attribute float mgBridge;'+varyings+'\n'+shader.vertexShader.replace(
      '#include <begin_vertex>', `#include <begin_vertex>
        transformed+=mgBridge*(mgSpan+vec3(.034,0.,0.));
        vAlloy=mgAlloy; vHeadUv=position.xy/.0294+.5; vCaseUv=uv;
        vBeltAxis=normalize(mat3(modelViewMatrix)*instanceMatrix[2].xyz);
        vBeltUp=normalize(modelViewMatrix[1].xyz);`);
    shader.fragmentShader = varyings+'uniform sampler2D mgHead; uniform sampler2D mgDetail;\n'+shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 grain=texture2D(mgDetail,vCaseUv*vec2(.38,.7)).rgb;
        float mgRough=vAlloy.x+.08*(grain.g-.5);
        diffuseColor.rgb*=.91+.17*grain.g;
        if(vAlloy.z>.5){
          vec3 head=texture2D(mgHead,vHeadUv).rgb;
          diffuseColor.rgb*=.90+.16*head.g-.25*head.b;
          mgRough+=.02*(head.r-.5)+.11*head.b;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mgRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=vAlloy.y;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          // The feed box shades the lower half of the reflection. A broad strip of key
          // light runs down the exposed cases; both contributions use the reflected view ray.
          vec3 ray = reflect(-geometryViewDir,normal);
          float opening = smoothstep(-.48,.26,dot(ray,vBeltUp));
          reflectedLight.indirectSpecular *= mix(.32,1.,opening);
          vec3 keyDir = directionalLights[0].direction;
          vec3 side = cross(vBeltAxis,keyDir);
          float span = length(side);
          float offset = dot(ray,side)/max(span,.001);
          float blur = .10+.43*material.roughness+min(fwidth(offset),.25);
          float strip = (1.-smoothstep(.06,.16+blur,abs(offset))) * smoothstep(.03,.70,dot(ray,keyDir));
          float polish = (1.-material.roughness)*smoothstep(.05,.4,span);
          reflectedLight.indirectSpecular += material.specularColorBlended * directionalLights[0].color
            * strip * polish * (.5+.9*opening);
        #endif`);
  };
  return m;
}
