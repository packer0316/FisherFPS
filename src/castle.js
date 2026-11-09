
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCastleSurfaces, castleNightEnvironment } from './castle-surfaces.js';
import { decorateCastle } from './castle-ornament.js';
import { makeCandleFlames } from './candle-flames.js';
import { addCastleGrandeur, castleMonuments } from './castle-grandeur.js';
import { makeCastleAtmosphere } from './castle-atmosphere.js';
import { addCastleSettees } from './castle-furniture.js';
import { loadCastleCherubs } from './castle-cherubs.js';

// La Veuve: a ruined wedding gallery, 44 × 56 m, with a 20 m coffered barrel vault.
// Static ornament is batched by material and bay. Statues share GPU buffers.
export async function makeCastle(scene, coarse, environment) {
  const halfX=22, halfZ=28, breeze={value:0}, colliders=[], zones=[], batches=new Map();
  scene.background=new T.Color(0x05090e);
  scene.fog=new T.FogExp2(0x111624,.012);
  scene.environment=castleNightEnvironment();scene.environmentIntensity=.95;
  scene.environmentRotation.set(0,1.1,0);
  scene.add(new T.HemisphereLight(0x9cb9db,0x423043,.8));
  const sun=new T.DirectionalLight(0xabcaff,1.5);
  sun.position.set(-18,13,-20);sun.target.position.set(4,0,8);
  sun.castShadow=true;sun.shadow.mapSize.setScalar(coarse?1024:2048);
  Object.assign(sun.shadow.camera,{left:-33,right:33,top:38,bottom:-38,near:1,far:85});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.035;sun.shadow.bias=-.00025;
  scene.add(sun,sun.target);
  const rim=new T.DirectionalLight(0x9faedb,.8);rim.position.set(16,12,22);scene.add(rim);
  const ceilingBounce=new T.DirectionalLight(0xb29269,.65);
  ceilingBounce.position.set(0,3,6);ceilingBounce.target.position.set(0,18,0);scene.add(ceilingBounce,ceilingBounce.target);
  const texLoader=new T.TextureLoader();
  function tex(url,color=true) {
    const t=texLoader.load(url);t.wrapS=t.wrapT=T.RepeatWrapping;
    t.anisotropy=coarse?2:4;if(color)t.colorSpace=T.SRGBColorSpace;return t;
  }
  const patina=tex('/prison/weathering.webp',false);
  const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.78,...extra});
  const surfaces=makeCastleSurfaces(tex,patina,breeze);
  const {plaster,stone,shadowStone,panel,bronze,gold,iron,wood,velvet,glazing,roseGlass,ceiling}=surfaces;
  const flesh=mat(0x412c38,{roughness:.32,metalness:.06});
  flesh.onBeforeCompile=s=>{
    s.uniforms.clock=breeze;s.uniforms.patina={value:patina};
    s.vertexShader='varying vec3 growthP;uniform float clock;\n'+s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      growthP=position;transformed+=normal*sin(clock*1.15+position.z*.7)*.007;`);
    s.fragmentShader='varying vec3 growthP;uniform sampler2D patina;\n'+s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float tissue=texture2D(patina,growthP.xz*.8+growthP.y*.2).g;
      float vein=1.-smoothstep(.06,.18,abs(sin(growthP.x*4.+growthP.y*3.+tissue*5.)));
      diffuseColor.rgb=mix(vec3(.14,.065,.091),vec3(.037,.009,.02),vein)*(.6+tissue*.7);
    `);
  };
  flesh.customProgramCacheKey=()=> 'castle-living-decay';
  const wax=mat(0xe0c3a1,{roughness:.54});
  wax.onBeforeCompile=s=>{
    s.uniforms.candleClock=breeze;
    s.vertexShader='attribute float wickGlow;varying float warmWax;\n'+s.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\nwarmWax=wickGlow;');
    s.fragmentShader='varying float warmWax;uniform float candleClock;\n'+s.fragmentShader
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        totalEmissiveRadiance+=vec3(.44,.18,.046)*warmWax*(.94+.06*sin(candleClock*7.));
      `);
  };
  wax.customProgramCacheKey=()=> 'candle-wax-transmitted-light';
  const floorNormal=tex('/surfaces/plaster-nor_gl.webp',false);floorNormal.repeat.set(26,34);
  const floor=new T.MeshPhysicalMaterial({color:0xffffff,roughness:.31,metalness:.07,envMapIntensity:1.2,clearcoat:.36,clearcoatRoughness:.22,normalMap:floorNormal,normalScale:new T.Vector2(.065,.065)});
  floor.onBeforeCompile=s=>{
    s.uniforms.patina={value:patina};
    s.vertexShader='varying vec3 castleP;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncastleP=position;');
    s.fragmentShader='varying vec3 castleP;uniform sampler2D patina;\n'+s.fragmentShader
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec2 p=castleP.xz;
        vec2 tile=p/1.65;
        vec2 edge=min(fract(tile),1.-fract(tile));
        float seam=1.-smoothstep(.005,.009+max(fwidth(tile.x),fwidth(tile.y)),min(edge.x,edge.y));
        float check=mod(floor(tile.x)+floor(tile.y),2.);
        vec4 dirt=texture2D(patina,p*.09);
        vec4 detail=texture2D(patina,p*.14);
        float flow=p.x*.38+p.y*.57+dirt.g*1.2+detail.g*.17;
        float vein=(1.-smoothstep(.035,.13+fwidth(flow)*2.,abs(sin(flow*2.))))*.16;
        vec3 marble=mix(vec3(.025,.029,.038),vec3(.43,.43,.39),check);
        marble*=.77+.28*dirt.g;
        marble=mix(marble,vec3(.12,.105,.107),vein);
        float outer=step(19.8,abs(p.x));
        diffuseColor.rgb=mix(marble,vec3(.045,.039,.048),outer);
        diffuseColor.rgb*=1.-.46*seam;
      // Soft window pools supply spatial lighting without another shadow map.
      float pool=exp(-pow((p.x+6.+sin(p.y*.16)*2.)/10.,2.))*pow(max(0.,cos((p.y+4.)*.39)),6.);
      diffuseColor.rgb+=vec3(.07,.09,.17)*pool;
      float rot=max(smoothstep(17.,21.5,abs(p.x)),smoothstep(21.,27.5,abs(p.y)))*smoothstep(.28,.67,dirt.r);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.035,.018,.024),rot*.82);
      `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=clamp(.19+.34*dirt.r+.2*seam,.19,.76);`);
  };
  floor.customProgramCacheKey=()=> 'castle-marble-v1';
  function add(g,m,kind='wall') {
    g.computeBoundingBox();const c=g.boundingBox.getCenter(new T.Vector3());
    const key=m.uuid+':'+Math.floor(c.z/10)+':'+(Math.abs(c.x)>15?Math.sign(c.x):0);
    if(!batches.has(key))batches.set(key,{mat:m,geos:[],kind});
    batches.get(key).geos.push(g);
  }
  function solid(x,y,z,w,h,d) {colliders.push(new T.Box3(new T.Vector3(x-w/2,y-h/2,z-d/2),new T.Vector3(x+w/2,y+h/2,z+d/2)));}
  function box(x,y,z,w,h,d,m,block=false) {
    add(new T.BoxGeometry(w,h,d).translate(x,y,z),m);
    if(block)solid(x,y,z,w,h,d);
  }
  function cyl(x,y,z,r,h,m,r2=r,segments=14) {
    add(new T.CylinderGeometry(r,r2,h,segments).translate(x,y,z),m);
  }
  function tube(points,r,m,segments=24) {
    add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),segments,r,6,false),m);
  }
  function ring(x,y,z,r,thickness,m,yaw=0,arc=Math.PI*2) {
    add(new T.TorusGeometry(r,thickness,6,Math.ceil(48*arc/Math.PI/2),arc).rotateY(yaw).translate(x,y,z),m);
  }
  box(0,-.22,0,44,.44,56,floor);
  decorateCastle({scene,add,box,cyl,tube,ring,solid,surfaces,coarse});
  addCastleGrandeur({add,box,cyl,tube,ring,solid,surfaces,coarse});
  // Ragged pleated drapery frames the altar without closing the combat floor.
  for(const side of [-1,1]) {
    const g=new T.PlaneGeometry(5,11.7,32,20),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin(x*7)*.19);if(y<-5)p.setY(i,y+Math.pow(Math.sin(x*4.3),2)*.9);}
    g.computeVertexNormals();g.translate(side*7.8,7.3,-27.32);add(g,velvet);
    box(side*7.8,13.3,-27.3,5.4,.18,.25,gold);
  }
  box(0,.23,-24,12,.46,5,stone,true);
  box(0,.73,-24.8,5.8,.6,1.5,wood,true);
  box(0,1.1,-24.8,6.3,.16,1.8,stone);
  addCastleSettees({add,box,cyl,tube,solid,surfaces});
  // Candles share two flame draws and three local lights, with no extra shadow passes.
  const candleOrigins=[],candleLights=[];
  const wick=mat(0x17110c);
  function candle(x,y,z,h=.4) {
    function addWax(g) {
      const p=g.attributes.position,heat=new Float32Array(p.count);
      for(let i=0;i<p.count;i++)heat[i]=Math.exp(-Math.max(0,y+h-p.getY(i))*12);
      g.setAttribute('wickGlow',new T.BufferAttribute(heat,1));add(g,wax);
    }
    addWax(new T.CylinderGeometry(.075,.085,h,16,4).translate(x,y+h/2,z));
    // Rounded wax rivulets catch the transmitted light just below the wick.
    for(let i=0;i<3;i++) {
      const angle=i*2.39996+x+z,drop=.025+(i%3)*.018;
      addWax(new T.SphereGeometry(.018,6,6).scale(1,drop/.018,1)
        .translate(x+Math.cos(angle)*.073,y+h-drop,z+Math.sin(angle)*.073));
    }
    cyl(x,y+h+.018,z,.009,.05,wick,.012,5);
    candleOrigins.push({x,y:y+h+.01,z});
    cyl(x,y-.035,z,.16,.055,bronze);
  }
  for(const z of [-11,12]) {
    const y=8.5;
    tube([[0,19.8,z],[0,y,z]],.065,iron,2);
    for(const r of [1.6,2.75]) {
      add(new T.TorusGeometry(r,.10,6,40).rotateX(Math.PI/2).translate(0,y,z),bronze);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,x=Math.cos(a)*r,dz=Math.sin(a)*r;
        tube([[0,y+1.6,z],[x*.6,y+.1,z+dz*.6],[x,y,z+dz]],.045,gold,12);
        candle(x,y+.1,z+dz,.45+(i%3)*.15);
      }
    }
    const light=new T.PointLight(0xffba78,110,29,1.8);light.position.set(0,8,z);scene.add(light);candleLights.push(light);
  }
  for(const side of [-1,1])for(let z=-24;z<=24;z+=8)for(let j=0;j<3;j++)candle(side*(19.6+j*.2),.05,z+1.4,.28+j*.22);
  for(let j=0;j<9;j++)candle((j-4)*.62,1.18,-24.7,.32+(j%3)*.22);
  const altarGlow=new T.PointLight(0xb884ff,75,30,1.65);altarGlow.position.set(0,6,-22);scene.add(altarGlow);candleLights.push(altarGlow);
  // Broad grazing lights reveal sculpted feather ridges and fluted columns.
  // Only the moon casts a shadow map; these two theatrical fills are inexpensive.
  for(const side of [-1,1]) {
    const light=new T.SpotLight(side<0?0x88baff:0xffc48b,170,57,.72,.85,1.35);
    light.position.set(side*10,13,23);light.target.position.set(side*18,5,-16);
    scene.add(light,light.target);
  }
  makeCandleFlames(scene,candleOrigins,breeze,candleLights);
  // Sinewy growth crawls from the bases of the statues and across the rear wall.
  let seed=273119;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(const side of [-1,1])for(const z of [-24,-8,8,24]) {
    for(let j=0;j<7;j++) {
      const len=1.2+rand()*2.8,dx=-side*(.4+rand()*1.5),oz=(rand()-.5)*3;
      tube([[side*21,.08,z],[side*20.3,.15,z+oz*.3],[side*20+dx,.1,z+oz],[side*20+dx*1.5,.05,z+oz+len*.3]],.035+rand()*.055,flesh,14);
    }
    for(let j=0;j<9;j++)add(new T.SphereGeometry(.08+rand()*.16,8,6).scale(1,.65,1).translate(side*(20+rand()),.13,z+(rand()-.5)*2),flesh);
    for(let j=0;j<4;j++) {
      const r=.18+rand()*.25,x=side*(19.2+rand()*.8),dz=z+(rand()-.5)*2;
      add(new T.SphereGeometry(r,12,8).scale(1,.8+rand()*.8,.8).translate(x,r*.65,dz),flesh);
      tube([[x,r*.9,dz],[x-side*.3,.12,dz+.5],[x-side*.75,.035,dz+.9]],.025,flesh,12);
    }
  }
  // Desiccated floral wreath around the altar.
  for(let i=0;i<55;i++){
    const a=rand()*Math.PI*2,x=Math.cos(a)*(2.1+rand()),y=1.2,z=-24.7+Math.sin(a)*.6;
    add(new T.SphereGeometry(.1+rand()*.06,7,5).scale(1,.5,1).translate(x,y,z),i%3?velvet:plaster);
  }
  for(const {mat:m,geos,kind} of batches.values()) {
    const merged=mergeGeometries(geos);geos.forEach(g=>g.dispose());
    const mesh=new T.Mesh(merged,m);mesh.castShadow=m!==ceiling;mesh.receiveShadow=true;mesh.userData.impactKind=kind;
    scene.add(mesh);zones.push(mesh);
  }
  const statues=await Promise.all(['marble_bust_01','gothic_statue'].map(id=>new GLTFLoader().loadAsync('/castle/statues/'+id+'/'+id+'.gltf')));
  statues.forEach((asset,index)=>{
    const base=asset.scene; base.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(base),center=bounds.getCenter(new T.Vector3()),height=index?3.65:2.2;
    const factor=height/(bounds.max.y-bounds.min.y);
    const placements=[];
    for(const side of [-1,1])for(let bay=0;bay<7;bay++)if(index===0&&bay%2===0)
      placements.push({x:side*20.7,y:1.55,z:-24+bay*8,yaw:-side*Math.PI/2,scale:1,depth:1});
    if(index===1)for(const p of castleMonuments)
      placements.push({x:p.x,y:1.78,z:p.z,yaw:-p.side*.18,scale:p.height/height,depth:1});
    base.traverse(o=>{
      if(!o.isMesh)return;
      const m=o.material.clone();m.color.set(0xe6dfd2);m.roughness=.55;m.metalness=.04;m.envMapIntensity=1.1;
      m.roughnessMap=null;m.metalnessMap=null;
      // Refinish the scan as aged white plaster, preserving sculpted normals and AO.
      m.onBeforeCompile=s=>{
        s.uniforms.sculptWear={value:patina};
        s.vertexShader='varying vec3 sculptP;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsculptP=position;');
        s.fragmentShader='varying vec3 sculptP;uniform sampler2D sculptWear;\n'+s.fragmentShader;
        s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          float luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb=vec3(.73,.70,.64)*(.65+.35*sqrt(clamp(luminance,0.,1.)));
          float h=${height.toFixed(2)};
          float tear=exp(-pow((abs(sculptP.x)-.14)/.031,2.))*smoothstep(h*.53,h*.67,sculptP.y)*
            (1.-smoothstep(h*.78,h*.84,sculptP.y))*smoothstep(.09,.22,sculptP.z);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.026,.014,.021),tear*.94);
          float wear=texture2D(sculptWear,sculptP.xy*.8+sculptP.z*.21).g;
          float vein=1.-smoothstep(.025,.09,abs(sin(sculptP.y*3.+sculptP.x*2.+wear*3.)));
          diffuseColor.rgb*=.88+wear*.18;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.18,.15,.21),vein*.16);
        `);
        s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=clamp(.42+wear*.3,.42,.78);`);
      };
      m.customProgramCacheKey=()=> 'aged-white-plaster-statue-'+index;
      if(m.map)m.map.anisotropy=coarse?2:4;
      const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
      geometry.translate(-center.x,-bounds.min.y,-center.z).scale(factor,factor,factor);
      const mesh=new T.InstancedMesh(geometry,m,placements.length),dummy=new T.Object3D();
      placements.forEach(({x,y,z,yaw,scale,depth},i)=>{
        dummy.position.set(x,y,z);dummy.rotation.y=yaw;dummy.scale.set(scale,scale,scale*depth);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.name=index?'castle-guardian-statues':'castle-memorial-reliefs';
      mesh.castShadow=mesh.receiveShadow=true;mesh.userData.impactKind='wall';scene.add(mesh);
      // Collider pedestals block the actors; the actual statues still stop bullets.
      zones.push(mesh);
    });
  });
  await loadCastleCherubs(scene,zones,coarse);
  makeCastleAtmosphere(scene,breeze,coarse,glazing.map);
  const overlap=(b,x,z,r)=>x+r>b.min.x&&x-r<b.max.x&&z+r>b.min.z&&z-r<b.max.z;
  function blocked(x,z,r=.32,feet=0,height=1.84,step=.24) {
    return Math.abs(x)>halfX-r||Math.abs(z)>halfZ-r||colliders.some(b=>overlap(b,x,z,r)&&b.max.y>feet+step&&b.min.y<feet+height-.002);
  }
  function verticalLimits(x,z,feet,height) {
    let floor=0,ceiling=20-height;
    for(const b of colliders)if(overlap(b,x,z,.32)){
      if(b.max.y<=feet+.002)floor=Math.max(floor,b.max.y);
      if(b.min.y>=feet+height-.002)ceiling=Math.min(ceiling,b.min.y-height);
    }
    return {floor,ceiling};
  }
  scene.updateMatrixWorld(true);
  return {bossArena:true,castle:true,population:12,basePopulation:6,dropCeilingY:19,navigationBounds:{x:halfX,z:halfZ},
    sun,colliders,zones,blocked,verticalLimits,terrainHeight:()=>0,district:()=> '永夜古堡 · 冥婚大廳',breeze,centerShadow:()=>{}};
}
