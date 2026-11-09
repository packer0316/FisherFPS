
import * as T from 'three';

// Metre-based UVs are derived from authored geometry normals, never camera-space
// normals. Turning the camera cannot change the projection or make the wall swim.
function projected(material,scale,patina,clock,marble=false,metal=false) {
  material.onBeforeCompile=s=>{
    s.uniforms.castleWear={value:patina};s.uniforms.candleClock=clock;
    s.vertexShader='varying vec3 surfaceP;\n'+s.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vec3 planeN=abs(normal);
      vec2 metres=planeN.y>.65?position.xz:planeN.x>planeN.z?position.zy:position.xy;
      vec2 tileUv=metres*${scale.toFixed(4)};
      #ifdef USE_MAP
        vMapUv=tileUv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv=tileUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv=tileUv;
      #endif
    `).replace('#include <begin_vertex>','#include <begin_vertex>\nsurfaceP=position;');
    s.fragmentShader='varying vec3 surfaceP;uniform sampler2D castleWear;uniform float candleClock;\n'+s.fragmentShader
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec2 surfaceUv=vec2(surfaceP.x+surfaceP.z,surfaceP.y);
        vec4 worn=texture2D(castleWear,surfaceUv*vec2(.27,.22));
        vec4 broad=texture2D(castleWear,surfaceUv*vec2(.071,.046)+.31);
        float damp=smoothstep(.46,.78,broad.b)*(1.-smoothstep(.2,5.,surfaceP.y));
        diffuseColor.rgb*=.84+.23*worn.g;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.023,.031,.029),damp*.65);
        ${marble?`vec3 p=surfaceP*.62;
          float flow=p.x*.7+p.z*.85+p.y*.35+worn.g*3.+broad.g*2.;
          float v=abs(sin(flow*2.1));
          float vein=1.-smoothstep(.025,.075+fwidth(flow)*2.,v);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.13,.115),vein*.35);`:''}
        ${metal?`float oxide=smoothstep(.43,.7,worn.r*broad.g*1.6);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.046,.069,.058),oxide*.62);`:''}
      `)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+(.5-worn.g)*.25-damp*.18,.20,.96);
      `).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        // Low-cost flickering candle bounce along the niches, without extra lights.
        float bay=mod(surfaceP.z-1.4+4.,8.)-4.;
        float bounce=exp(-abs(abs(surfaceP.x)-20.6)*1.25)*exp(-bay*bay*.48)*exp(-abs(surfaceP.y-1.5)*.65);
        float phase=floor((surfaceP.z+4.)/8.)*2.39996+sign(surfaceP.x)*1.7;
        float flutter=.94+.045*sin(candleClock*3.7+phase)+.025*sin(candleClock*8.3+phase*2.);
        totalEmissiveRadiance+=diffuseColor.rgb*vec3(.32,.115,.032)*bounce*flutter;
      `);
  };
  material.customProgramCacheKey=()=> 'castle-surface-v2-'+scale+'-'+marble+'-'+metal;
  return material;
}
function canvasTexture(w,h,paint) {
  const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;
  return t;
}
function damask() {
  return canvasTexture(512,1024,(c,w,h)=>{
    c.fillStyle='#182723';c.fillRect(0,0,w,h);
    const seedNoise=(i)=>{const v=Math.sin(i*12.9898+3.21)*43758.5453;return v-Math.floor(v);};
    for(let i=0;i<9000;i++){c.fillStyle=i%2?'#8f795908':'#070e0b18';c.fillRect(seedNoise(i)*w,seedNoise(i+999)*h,1.8,2.5);}
    // Mirrored curved leaves and flower crowns, not a repeating geometric grid.
    for(const [cx,cy] of [[256,256],[0,768],[512,768]]) {
      c.save();c.translate(cx,cy);c.strokeStyle='#756749';c.fillStyle='#4e5137';c.lineWidth=3;
      for(const side of [-1,1]) {
        c.save();c.scale(side,1);
        c.beginPath();c.moveTo(0,220);c.bezierCurveTo(15,60,160,80,120,-50);c.bezierCurveTo(115,-100,42,-91,65,-32);c.stroke();
        for(let i=0;i<5;i++){
          c.save();c.translate(22+i*18,145-i*30);c.rotate(-.25+i*.08);
          c.beginPath();c.moveTo(0,0);c.bezierCurveTo(8,-30,70,-22,85,-54);c.bezierCurveTo(72,4,26,22,0,0);c.fill();c.stroke();
          c.beginPath();c.moveTo(7,-2);c.quadraticCurveTo(40,-7,75,-43);c.stroke();c.restore();
        }
        c.beginPath();c.moveTo(0,-35);c.bezierCurveTo(18,-120,115,-134,67,-207);
        c.bezierCurveTo(55,-230,13,-180,0,-245);c.stroke();
        c.restore();
      }
      c.beginPath();c.ellipse(0,-75,18,40,0,0,Math.PI*2);c.stroke();
      c.beginPath();c.moveTo(0,-240);c.lineTo(14,-215);c.lineTo(0,-190);c.lineTo(-14,-215);c.closePath();c.fill();c.stroke();
      c.restore();
    }
  });
}
export function makeCastleSurfaces(tex,patina,breeze) {
  const normal=tex('/surfaces/plaster-nor_gl.webp',false),rough=tex('/surfaces/plaster-rough.webp',false);
  const plaster=projected(new T.MeshStandardMaterial({color:0xb9af96,map:tex('/surfaces/plaster-diff.webp'),normalMap:normal,normalScale:new T.Vector2(.65,.65),roughnessMap:rough,roughness:.92}),.52,patina,breeze);
  const stone=projected(new T.MeshPhysicalMaterial({color:0xc1b8a4,normalMap:normal,normalScale:new T.Vector2(.22,.22),roughness:.43,metalness:.04,clearcoat:.22,clearcoatRoughness:.34}),.65,patina,breeze,true);
  const shadowStone=projected(new T.MeshPhysicalMaterial({color:0x222633,normalMap:normal,normalScale:new T.Vector2(.16,.16),roughness:.31,metalness:.12,clearcoat:.3,clearcoatRoughness:.28}),.65,patina,breeze,true);
  const panel=projected(new T.MeshStandardMaterial({map:damask(),normalMap:normal,normalScale:new T.Vector2(.22,.22),roughness:.68}),.66,patina,breeze);
  const bronze=projected(new T.MeshStandardMaterial({color:0x807052,metalness:.78,roughness:.43}),.8,patina,breeze,false,true);
  const gold=projected(new T.MeshStandardMaterial({color:0xd4ad69,metalness:.82,roughness:.30,envMapIntensity:1.35,normalMap:normal,normalScale:new T.Vector2(.10,.10)}),.8,patina,breeze,false,true);
  const iron=new T.MeshStandardMaterial({color:0x15191d,metalness:.68,roughness:.57});
  const wood=projected(new T.MeshStandardMaterial({color:0x624738,map:tex('/surfaces/wood-diff.webp'),normalMap:tex('/surfaces/wood-nor_gl.webp',false),normalScale:new T.Vector2(.3,.3),roughnessMap:tex('/surfaces/wood-rough.webp',false),roughness:.62}),.68,patina,breeze);
  const velvet=new T.MeshPhysicalMaterial({color:0x300e1b,roughness:.91,side:T.DoubleSide,sheen:1,sheenColor:0x75404e,sheenRoughness:.8,normalMap:normal,normalScale:new T.Vector2(.035,.035)});
  const glass=tex('/castle/mourner-glass-v2.png');glass.wrapS=glass.wrapT=T.ClampToEdgeWrapping;
  const glazing=new T.MeshStandardMaterial({map:glass,emissiveMap:glass,emissive:0xb4c9ff,emissiveIntensity:1.25,
    roughness:.23,metalness:.07,envMapIntensity:.65,normalMap:normal,normalScale:new T.Vector2(.04,.04)});
  glazing.onBeforeCompile=s=>{
    s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec3 glassTint=mix(vec3(.42,.65,1.25),vec3(1.1,.35,.58),smoothstep(-.4,.65,sin(vMapUv.y*10.+vMapUv.x*5.)));
      totalEmissiveRadiance*=glassTint;`);
  };
  glazing.customProgramCacheKey=()=> 'castle-jewel-glass';
  const roseGlass=new T.MeshBasicMaterial({map:glass,color:0xd3c4ee});
  roseGlass.onBeforeCompile=s=>{
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`
      vec2 p=vMapUv*2.-1.;float r=length(p);
      float petal=(atan(p.y,p.x)+3.14159265)*12./6.2831853;
      vec2 sampleUv=vec2(.025+fract(petal)*.21,.08+r*.83);
      if(mod(floor(petal),2.)>.5)sampleUv.x=1.-sampleUv.x;
      if(r<.19)sampleUv=vec2(.43,.64)+p*vec2(.85,.567);
      diffuseColor*=texture2D(map,sampleUv);
      diffuseColor.rgb*=mix(vec3(.6,.8,1.35),vec3(1.35,.48,.72),.5+.5*sin(floor(petal)*2.4+r*5.));
    `);
  };
  roseGlass.customProgramCacheKey=()=> 'mourner-rose-glass-v2';
  const ceiling=projected(new T.MeshStandardMaterial({color:0x465258,map:plaster.map,normalMap:normal,normalScale:new T.Vector2(.4,.4),roughness:.86,side:T.DoubleSide}),.45,patina,breeze);
  const fresco=tex('/castle/ceiling-fresco-v2.png');fresco.wrapS=fresco.wrapT=T.ClampToEdgeWrapping;
  const frescoMat=new T.MeshStandardMaterial({map:fresco,color:0xc2ae91,roughness:1,emissiveMap:fresco,emissive:0xffffff,emissiveIntensity:.16,side:T.DoubleSide});
  return {plaster,stone,shadowStone,panel,bronze,gold,iron,wood,velvet,glazing,roseGlass,ceiling,frescoMat};
}
export function castleNightEnvironment() {
  const t=canvasTexture(512,256,(c,w,h)=>{
    const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#19212a');g.addColorStop(.5,'#10171e');g.addColorStop(1,'#060a0b');c.fillStyle=g;c.fillRect(0,0,w,h);
    for(const [x,width,color] of [[43,14,'#7892aa'],[177,11,'#819bb8'],[330,8,'#93734b'],[426,13,'#657e94']]){
      const g=c.createLinearGradient(x-14,0,x+width+14,0);g.addColorStop(0,'#0000');g.addColorStop(.4,color);g.addColorStop(.6,color);g.addColorStop(1,'#0000');c.fillStyle=g;c.fillRect(x-14,69,width+28,58);
    }
    const r=c.createRadialGradient(282,146,2,282,146,29);r.addColorStop(0,'#e6b577');r.addColorStop(1,'#0000');c.fillStyle=r;c.fillRect(250,114,64,64);
  });t.mapping=T.EquirectangularReflectionMapping;return t;
}
