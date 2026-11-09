import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { stationGallery, stationGround, stationStairSurface, stationStairSolids, stationMeshBarriers, makeStationCollision } from './station-collision.js';
import { stationAutoAllows, stationAutoRecovery, stationAutoStep, stationAutoRoute } from './station-autoplay.js';
import { refineStationCeiling } from './station-ceiling.js';
import { addTrainInterior, openTrainAisle } from './station-train-interior.js';
import { makeStationTransit } from './station-transit.js';
import { makeTrainSchedule } from './station-train-state.js';
import { makeStationLight, stationDoorIntensity, preserveStationBake } from './station-lighting.js';
import { stationEnvironment, stationDetailMap, stationSurface } from './station-materials.js';
import { stationLightBudget } from './station-light-budget.js';
import { makeStationWindowLight, receiveStationWindowLight } from './station-window-light.js';
import { emit } from './events.js';

export async function makeStation(scene, coarse, environment) {
  const loader = new GLTFLoader(), textures = new T.TextureLoader();
  const [building, gate, flag, body, normalHead, goldHead, env, wet, doorLight, headLight, warmHeadLight, plaster, plasterNormal, paving, pavingNormal,
    plasterRough,pavingRough,woodMap,woodNormal,woodRough,trainWindow,leatherNormal,leatherRough] = await Promise.all([
    ...['station-scene','station-door','station-flag','train-body','train-head','train-gold'].map(n=>loader.loadAsync('/station/'+n+'.glb')),
    ...['environment.png','wet-noise.png','door-light.jpg','head-light.jpg','head-light-warm.jpg'].map(n=>textures.loadAsync('/station/'+n)),
    textures.loadAsync('/surfaces/plaster-diff.webp'),textures.loadAsync('/surfaces/plaster-nor_gl.webp'),
    textures.loadAsync('/surfaces/paving-diff.webp'),textures.loadAsync('/surfaces/paving-nor_gl.webp'),
    ...['plaster-rough','paving-rough','wood-diff','wood-nor_gl','wood-rough'].map(n=>textures.loadAsync('/surfaces/'+n+'.webp')),
    textures.loadAsync('/station/train-window.jpg'),
    textures.loadAsync('/station/leather-normal.jpg'),textures.loadAsync('/station/leather-rough.jpg'),
  ]);
  scene.background = new T.Color(0x121b2a); scene.fog = new T.FogExp2(0x18263a,.008);
  scene.environment=stationEnvironment(env);scene.environmentIntensity=.72;
  const lightBudget=stationLightBudget(scene,coarse);
  const hemi=new T.HemisphereLight(0xc6dff4,0x8e7963,2.5);
  const sun=new T.DirectionalLight(0xc6e0ff,1.65);sun.position.set(-10,28,5);sun.castShadow=true;
  sun.shadow.mapSize.setScalar(coarse?1024:2048);sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;
  Object.assign(sun.shadow.camera,{left:-24,right:24,top:36,bottom:-36,near:1,far:90});sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun,sun.target,hemi);
  const warm=new T.DirectionalLight(0xffb36d,.9);warm.position.set(12,8,12);scene.add(warm);
  RectAreaLightUniformsLib.init();
  // Broad light from the pendants and arched windows lifts the concourse without
  // hard point-light hotspots or additional shadow maps.
  for(const z of [-8,16]){const light=new T.RectAreaLight(0xffe2bc,2.6,11,4);light.position.set(0,7,z);light.lookAt(0,0,z);scene.add(light);}
  const stairFill=new T.RectAreaLight(0xbddcff,3.2,13,5);stairFill.position.set(0,12,-24);stairFill.lookAt(0,2,-19);scene.add(stairFill);
  const zones=[],colliders=[],batches=new Map(),breeze={value:0};
  const materials={metal:new T.MeshStandardMaterial({color:0x34424a,metalness:.75,roughness:.36}),
    brass:new T.MeshStandardMaterial({color:0xb29a64,metalness:.65,roughness:.34}),
    stone:new T.MeshStandardMaterial({color:0x777773,roughness:.7}),
    wood:new T.MeshStandardMaterial({color:0x4d3023,roughness:.55}),
    dark:new T.MeshStandardMaterial({color:0x0a1017,roughness:.9}),
    glow:new T.MeshStandardMaterial({color:0xffdf9f,emissive:0xffbb55,emissiveIntensity:1.4,roughness:.3}),
    cool:new T.MeshStandardMaterial({color:0xb8e7ff,emissive:0x83caff,emissiveIntensity:1.1,roughness:.35})};
  plaster.colorSpace=paving.colorSpace=woodMap.colorSpace=T.SRGBColorSpace;
  for(const t of [plaster,plasterNormal,plasterRough,paving,pavingNormal,pavingRough,woodMap,woodNormal,woodRough]){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=coarse?4:8;}
  trainWindow.colorSpace=T.SRGBColorSpace;
  const detail={map:stationDetailMap(plasterNormal,plasterRough,coarse),coarse},leatherDetail={map:stationDetailMap(leatherNormal,leatherRough,coarse),coarse};
  leatherNormal.dispose();leatherRough.dispose();
  const masonry=new T.MeshStandardMaterial({color:0x8e8273,map:plaster,normalMap:plasterNormal,normalScale:new T.Vector2(.35,.35),roughness:.83});
  masonry.roughnessMap=plasterRough;
  const pavingMat=new T.MeshStandardMaterial({color:0x72767a,map:paving,normalMap:pavingNormal,roughnessMap:pavingRough,normalScale:new T.Vector2(.25,.25),roughness:.78});
  materials.wood.map=woodMap;materials.wood.normalMap=woodNormal;materials.wood.normalScale.set(.22,.22);materials.wood.roughnessMap=woodRough;materials.wood.roughness=.8;materials.wood.color.set(0x917363);
  stationSurface(materials.metal,{...detail,strength:.07,scale:3,variation:.14});
  stationSurface(materials.brass,{...detail,strength:.035,scale:4,variation:.09});
  function add(g,mat){if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);}
  function box(x,y,z,w,h,d,mat,solid=false){
    const g=new T.BoxGeometry(w,h,d).translate(x,y,z);
    if(mat.map){const {position:p,normal:n,uv}=g.attributes;
      for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/4,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))/4);
    }
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);
    if(solid)colliders.push(new T.Box3(new T.Vector3(x-w/2,y-h/2,z-d/2),new T.Vector3(x+w/2,y+h/2,z+d/2)));
  }
  function cylinder(x,y,z,r,h,mat){
    const g=new T.CylinderGeometry(r,r,h,10).translate(x,y,z);
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);
  }
  function rail(a,b,r,mat){
    const delta=b.clone().sub(a),pose=new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize()),new T.Vector3(1,1,1));
    const g=new T.CylinderGeometry(r,r,delta.length(),10).applyMatrix4(pose);
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);
  }
  const station=building.scene;station.position.z=24;scene.add(station);station.updateMatrixWorld(true);
  doorLight.flipY=headLight.flipY=warmHeadLight.flipY=false;
  wet.wrapS=wet.wrapT=T.RepeatWrapping;wet.repeat.set(3,8);
  station.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();o.material.map.anisotropy=coarse?4:8;
    o.material.side=T.DoubleSide;o.material.roughness=o.name==='floor'?.6:.65;o.material.metalness=o.name==='floor'?.08:.08;
    if(o.name==='floor'){o.material.roughnessMap=wet;
      o.material.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.48);');};
      o.material.customProgramCacheKey=()=> 'station-floor-soft-reflection';
    }
    preserveStationBake(o.material,o.name==='Ceiling'?.62:o.name==='floor'?.36:.48);
    if(o.name==='floor'||o.name==='Station')stationSurface(o.material,{...detail,strength:o.name==='floor'?.18:.14,scale:o.name==='floor'?1.4:.9,variation:.20});
    o.receiveShadow=true;o.castShadow=o.name!=='floor';o.frustumCulled=false;o.userData.impactKind=o.name==='floor'?'ground':'wall';zones.push(o);
  });
  const stairHeight=stationStairSurface(station);
  const terrainHeight=(x,z)=>Math.max(stairHeight(x,z),Math.abs(x)>=stationGround.outerPlatform?stationGround.outerFloor:0);
  const meshBlocked=stationMeshBarriers(station);
  colliders.push(...stationStairSolids(station));
  refineStationCeiling(station,{add,rail,materials,masonry});
  const sharedAtlas=station.getObjectByName('Station').material.map;
  function shareAtlas(material){const old=material.map;material.map=sharedAtlas;if(old!==sharedAtlas)old?.dispose();}
  gate.scene.position.z=24;scene.add(gate.scene);gate.scene.traverse(o=>{if(o.isMesh){o.material=o.material.clone();shareAtlas(o.material);preserveStationBake(o.material,.48);o.userData.impactKind='wall';zones.push(o);}});
  colliders.push(new T.Box3(new T.Vector3(-2.8,0,-26.2),new T.Vector3(2.8,4.7,-25.65)));
  const flags=flag.scene;flags.scale.setScalar(100);flags.position.z=24;scene.add(flags);
  flags.traverse(o=>{if(o.isMesh){o.material=o.material.clone();shareAtlas(o.material);preserveStationBake(o.material,.4);o.material.side=T.DoubleSide;}});
  const flagMixer=new T.AnimationMixer(flags);flagMixer.clipAction(flag.animations[0]).play();
  // Finish both original gallery wings using the same floor as the landing.
  box(0,4.84,-29.25,stationGallery.halfWidth*2,.28,5.5,pavingMat,true);
  for(const side of [-1,1])box(side*stationGallery.halfWidth,5.55,-29.25,.14,1.14,5.5,masonry,true);
  for(const z of [-35.5,35]){
    box(0,7.5,z,18.6,15,.45,masonry);
    for(const side of [-1,1])box(side*18.65,7.5,z,8.7,15,.45,masonry);
    box(0,15,z,46,16,.45,masonry);
  }
  // The original art was framed from one camera; finish the reverse-facing hall for FPS play.
  box(0,-.005,30,18.6,.06,12,pavingMat);
  box(0,2.3,34.7,3.2,4.6,.12,materials.dark);
  for(const x of [-1.65,1.65])box(x,2.5,34.58,.12,5,.16,materials.brass);
  box(0,4.95,34.58,3.4,.12,.16,materials.brass);
  for(const x of [-6,-4,4,6]){
    box(x,3.2,34.65,1.6,2.4,.16,materials.dark);
    for(const dx of [-.8,.8])box(x+dx,3.2,34.49,.06,2.5,.06,materials.brass);
    for(let dx=-.6;dx<=.6;dx+=.2)box(x+dx,3.3,34.45,.025,2.1,.03,materials.metal);
    box(x,2,34.32,1.8,.15,.65,materials.wood);
  }
  for(const x of [-8.8,-2.7,2.7,8.8]){
    box(x,3,34.48,.55,6,.5,masonry);
    box(x,.22,34.35,.8,.44,.72,masonry);box(x,5.8,34.3,.85,.26,.8,masonry);
    for(const dx of [-.21,.21])box(x+dx,3.2,34.19,.04,4.6,.04,materials.brass);
  }
  for(const y of [.7,5.9,9.2]){box(0,y,34.48,18.6,.18,.6,masonry);box(0,y-.13,34.13,18.6,.045,.06,materials.brass);}
  // Fanlight, mouldings and warm ticket-window lamps continue the source station's arches.
  const fan=new T.Mesh(new T.CircleGeometry(1.65,32,0,Math.PI),materials.dark);
  fan.position.set(0,4.9,34.45);fan.rotation.y=Math.PI;scene.add(fan);
  const arch=new T.Mesh(new T.TorusGeometry(1.72,.065,8,40,Math.PI),materials.brass);arch.position.set(0,4.9,34.36);scene.add(arch);
  for(let i=0;i<=6;i++){const a=i*Math.PI/6;rail(new T.Vector3(0,4.9,34.33),new T.Vector3(Math.cos(a)*1.62,4.9+Math.sin(a)*1.62,34.33),.018,materials.brass);}
  for(const x of [-5,5]){
    box(x,4.75,34.18,2.7,.16,.36,materials.metal);box(x,4.64,34.09,2.4,.05,.28,materials.glow);
    lightBudget.add(0xffca8f,55,15,scene,new T.Vector3(x,5.8,30.7));
  }
  // Preserve the original stairs and upper landing; all additions follow its surface.
  box(0,5.6,-31.8,stationGallery.halfWidth*2,.09,.09,materials.brass);
  colliders.push(new T.Box3(new T.Vector3(-stationGallery.halfWidth,4.98,-31.87),new T.Vector3(stationGallery.halfWidth,5.65,-31.73)));
  for(let x=-18;x<=18;x+=.6)cylinder(x,5.3,-31.8,.025,.65,materials.brass);
  for(const side of [-1,1]) {
    for(let z=-25.9;z<-16;z+=.18){const y=terrainHeight(side*5.8,z),next=terrainHeight(side*5.8,z+.18);
      if(y>.08&&y-next>.075)box(side*5.8,y+.009,z,4.6,.025,.055,materials.brass);
    }
    for(let z=-25.8;z<-16.8;z+=.85)for(const x of [3.05,8.45]){
      const y=terrainHeight(side*5.8,z);if(y<.1)continue;cylinder(side*x,y+.55,z,.035,1.1,materials.brass);
    }
    for(const x of [3.05,8.45]){
      rail(new T.Vector3(side*x,1.1,-17),new T.Vector3(side*x,6.1,-26.5),.045,materials.brass);
      // Full-length solid guard follows the actual handle, including its end joints.
      // Posts alone leave gaps and used to end below the visible handrail.
      for(let i=0;i<48;i++){
        const near=-17-i*9.5/48,far=-17-(i+1)*9.5/48,top=1.1+(i+1)*5/48;
        colliders.push(new T.Box3(new T.Vector3(side*x-.1,0,far-.025),new T.Vector3(side*x+.1,top+.07,near+.025)));
      }
    }
    // Two rails per line, sleepers, fasteners and a dark ballast strip.
    box(side*12,-.08,0,5.08,.12,140,materials.dark);
    for(const dx of [-.75,.75])box(side*11.6+dx,.08,0,.12,.16,140,materials.metal,true);
    for(let z=-65;z<70;z+=.65)box(side*11.6,-.015,z,2.65,.09,.16,materials.wood);
    for(let z=-24;z<28;z+=.6)box(side*9.0,.018,z,.22,.025,.38,materials.stone);
    for(const z of [-12,14]){
      // Slatted station benches: clear leg room, curved arm rests and a reclined back.
      const x=side*7.3;
      for(let s=0;s<5;s++)box(x,.52,z+(s-2)*.12,2.5,.075,.085,materials.wood);
      for(let s=0;s<4;s++)box(x,.8+s*.13,z+side*.37,2.5,.085,.07,materials.wood);
      for(const dx of [-.96,.96]){box(x+dx,.28,z,.1,.55,.57,materials.metal);box(x+dx,.75,z,.075,.4,.07,materials.metal);box(x+dx,.95,z,.08,.07,.6,materials.brass);}
      colliders.push(new T.Box3(new T.Vector3(x-1.3,0,z-.42),new T.Vector3(x+1.3,1.3,z+.42)));
    }
    for(const z of [-21,-6,10,25]){
      cylinder(side*8.6,2.45,z,.06,4.9,materials.metal);box(side*8.6,4.85,z,.55,.15,.55,materials.brass);
      box(side*8.6,4.55,z,.30,.48,.30,materials.glow);
      for(const dx of [-.2,.2])for(const dz of [-.2,.2])box(side*8.6+dx,4.55,z+dz,.035,.6,.035,materials.metal);
      box(side*8.6,4.23,z,.48,.07,.48,materials.metal);
      box(side*8.6,4.98,z,.32,.12,.32,materials.metal);
      lightBudget.add(side<0?0xffc995:0xa3d7ff,18,12,scene,new T.Vector3(side*8.6,4.4,z));
    }
    // Rail tunnels continue beyond the visible hall so arrival/departure never pops at the platform.
    for(const z of [-34,34]){
      box(side*11.6,6,z,5.5,2,1.5,masonry);
      for(const dx of [-2.75,2.75])box(side*11.6+dx,2.6,z,.55,5.2,1.5,masonry);
      box(side*11.6,3,z+Math.sign(z)*14,5.3,7,.2,materials.dark);
      for(const dx of [-2.7,2.7])box(side*11.6+dx,3,z+Math.sign(z)*7,.25,7,14,materials.dark);
    }
  }
  // Platform-level overhead beams, pendant lights and an elevated balustrade.
  for(const z of [-20,-8,4,16,27]){
    box(0,10.3,z,18.8,.18,.22,materials.metal);
    for(const x of [-6,0,6]){
      for(const dx of [-.65,.65])cylinder(x+dx,8.7,z,.02,3.1,materials.metal);
      box(x,7.15,z,1.8,.15,.5,materials.metal);box(x,7.055,z,1.55,.04,.32,materials.glow);
    }
  }
  for(const x of [-8.9,-2.6,0,2.6,8.9])cylinder(x,5.55,-25.95,.045,1.15,materials.brass);
  box(0,6.13,-25.95,5.2,.09,.09,materials.brass);
  colliders.push(new T.Box3(new T.Vector3(-2.65,4.98,-26.02),new T.Vector3(2.65,6.18,-25.88)));
  for(const [mat,parts] of batches){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=new T.Mesh(g,mat);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.impactKind='wall';scene.add(mesh);zones.push(mesh);}

  function sign(text,x,y,z,width,height,color='#e1c995'){
    const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
    const m=new T.Group(),faceMaterial=new T.MeshStandardMaterial({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.35,roughness:.65});
    m.add(new T.Mesh(new T.BoxGeometry(width+.08,height+.08,.08),materials.metal));
    for(const side of [-1,1]){const face=new T.Mesh(new T.PlaneGeometry(width,height),faceMaterial);face.position.z=side*.05;face.rotation.y=side<0?Math.PI:0;m.add(face);}
    m.position.set(x,y,z);scene.add(m);
    const draw=(label)=>{ctx.fillStyle='#111b20';ctx.fillRect(0,0,1024,256);ctx.strokeStyle=color;ctx.lineWidth=6;ctx.strokeRect(12,12,1000,232);ctx.fillStyle=color;ctx.font='bold 64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,512,128,940);map.needsUpdate=true;};draw(text);return {mesh:m,draw};
  }
  sign('CENTRAL TERMINAL · 中央車站',0,9.9,-25.6,10,1.8);
  sign('TICKETS · 售票大廳',0,8,34.05,8,1.5).mesh.rotation.y=Math.PI;
  const boards=[sign('01 月台 · 列車即將進站',-6.3,5.9,8.8,5,1.25),sign('02 月台 · 等候列車',6.3,5.9,8.8,5,1.25,'#a3d9ef')];
  // A real clock face, with separate hands, above the concourse.
  const clockFace=new T.Mesh(new T.CircleGeometry(1.15,48),new T.MeshStandardMaterial({color:0xead5a3,emissive:0x3e3322,side:T.DoubleSide}));clockFace.position.set(0,12.5,-25.4);scene.add(clockFace);
  const clockParts=[];
  for(let i=0;i<12;i++)clockParts.push(new T.BoxGeometry(.045,i%3===0?.18:.09,.015).rotateZ(-i*Math.PI/6).translate(Math.sin(i*Math.PI/6)*.96,Math.cos(i*Math.PI/6)*.96,0));
  for(const [angle,length]of [[-.9,.55],[1.4,.85]])clockParts.push(new T.BoxGeometry(.055,length,.025).translate(0,length/2,0).rotateZ(angle));
  const clockMarks=new T.Mesh(mergeGeometries(clockParts),materials.metal);clockParts.forEach(g=>g.dispose());clockMarks.position.copy(clockFace.position);clockMarks.position.z+=.015;scene.add(clockMarks);

  const audio=new Set();let audioAllowed=false;
  function sound(name,volume=.2){if(!audioAllowed)return;const a=new Audio('/station/audio/'+name+'.mp3');a.volume=volume;audio.add(a);a.onended=()=>audio.delete(a);a.play().catch(()=>audio.delete(a));}
  let hunt,camera;
  const steamPool=Array.from({length:48},()=>({age:5,life:2,position:new T.Vector3(),velocity:new T.Vector3()}));let steamCursor=0;
  const steamGeo=new T.BufferGeometry(),steamPosition=new T.Float32BufferAttribute(new Float32Array(48*3),3),steamData=new T.Float32BufferAttribute(new Float32Array(48*2),2);
  steamGeo.setAttribute('position',steamPosition);steamGeo.setAttribute('steam',steamData);
  const steam=new T.Points(steamGeo,new T.ShaderMaterial({transparent:true,depthWrite:false,
    vertexShader:'attribute vec2 steam;varying float fade;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(steam.x*280./max(1.,-p.z),1.,130.);fade=steam.y;}',
    fragmentShader:'varying float fade;void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-r*r*4.)*(1.-smoothstep(.65,1.,r));gl_FragColor=vec4(.62,.71,.76,a*fade);}'
  }));steam.frustumCulled=false;steam.visible=false;scene.add(steam);
  function vent(train){for(let i=0;i<16;i++){const s=steamPool[steamCursor++%steamPool.length];s.age=0;s.life=1.8+Math.random();
    s.position.set(train.position.x-Math.sign(train.position.x)*1.35,.12,train.position.z+(i%3)*8-12);
    s.velocity.set(-Math.sign(train.position.x)*(.25+Math.random()*.4),.35+Math.random()*.5,(Math.random()-.5)*.5);}}
  function updateSteam(dt){let live=0;for(let i=0;i<steamPool.length;i++){const s=steamPool[i];s.age+=dt;const t=Math.min(1,s.age/s.life);
    s.position.addScaledVector(s.velocity,dt);steamPosition.setXYZ(i,s.position.x,s.position.y,s.position.z);
    steamData.setXY(i,.4+t*1.4,Math.sin(t*Math.PI)*.22);if(t<1)live++;}
    steam.visible=live>0;steamPosition.needsUpdate=steamData.needsUpdate=true;}
  const trains=[-1,1].map((side,index)=>{
    const group=new T.Group(),rig=clone(body.scene),head=clone((index?goldHead:normalHead).scene);group.add(rig,head);group.position.set(side*11.6,.20,0);group.rotation.y=index?Math.PI:0;scene.add(group);
    const doors=[],doorLights=[];
    for(const [model,asset]of [[rig,body],[head,index?goldHead:normalHead]]){
      const mixer=new T.AnimationMixer(model);const action=mixer.clipAction(asset.animations[0]);action.play();mixer.setTime(1/30);
      const closed=new Map();model.traverse(o=>{if(o.isBone&&/door\d+$/.test(o.name))closed.set(o.name,o.position.clone());});
      mixer.setTime(96/30);action.paused=true;
      model.traverse(o=>{if(closed.has(o.name))doors.push({bone:o,closed:closed.get(o.name),open:o.position.clone()});
        if(!o.isMesh)return;o.frustumCulled=false;
        if(o.name==='door_light'){
          o.material=makeStationLight(doorLight,.32,new T.Color(0,0,0));o.visible=false;doorLights.push(o);return;
        }
        if(o.name==='Cylinder'){
          o.material=makeStationLight(index?headLight:warmHeadLight,.24,index?new T.Color(91/255,143/255,143/255):new T.Color(231/255,231/255,231/255));return;
        }
        o.material=o.material.clone();o.castShadow=true;o.receiveShadow=true;o.userData.impactKind='wall';zones.push(o);
        o.material.map.anisotropy=coarse?4:8;o.material.metalness=.23;o.material.roughness=.39;o.material.envMapIntensity=.75;preserveStationBake(o.material,.3);
        stationSurface(o.material,{...detail,uv:true,scale:40,strength:.085,variation:.12,window:trainWindow});
      });model.position.z=20;
    }
    group.updateMatrixWorld(true);openTrainAisle(rig);
    rig.traverse(o=>{if(o.isSkinnedMesh&&o.name!=='door_light'){o.computeBoundingSphere();o.boundingSphere.radius*=1.06;o.frustumCulled=true;}});
    head.traverse(o=>{if(o.isSkinnedMesh&&o.name!=='Cylinder'){o.computeBoundingSphere();o.boundingSphere.radius*=1.06;o.frustumCulled=true;}});
    const interiorSolids=addTrainInterior(group,zones,{woodMap,woodNormal,woodRough,detail,leatherDetail,lightBudget});
    const collider=new T.Box3();colliders.push(collider);
    const headlamp=lightBudget.add(0xaddbff,15,18,group,new T.Vector3(0,1.4,24));
    const statuses={waiting:'等候列車',approaching:'列車進站 · 請勿越線',braking:'列車停靠',opening:'車門開啟',boarding:'車門開啟 · 殭屍下車',closing:'車門關閉 · 即將發車',departing:'列車離站'};
    const schedule=makeTrainSchedule(index?15:2,phase=>{
      boards[index].draw(`0${index+1} 月台 · ${statuses[phase]}`);
      emit('station:train',{side:index,phase});
      if(phase==='approaching')sound('Station_train_in',.22);
      if(phase==='braking'||phase==='closing')vent(group);
      if(phase==='departing')sound('Station_train_out',.18);
    },passenger=>{
      if(!hunt||!camera)return;
      // Openings are the midpoint between the original sliding door bones.
      const pair=passenger%2===0?[0,1]:[2,3],p=new T.Vector3();
      for(const i of pair)p.add(doors[i].bone.getWorldPosition(new T.Vector3()));p.multiplyScalar(.5);
      const from=new T.Vector3(side*10.2,.34,p.z),to=new T.Vector3(side*7.5,0,p.z);
      const enemy=hunt.disembark(from,to,camera);if(enemy)emit('station:passenger',{side:index,species:enemy.type.id,position:from.toArray()});
    },()=>transit.beginDeparture(trains[index]));
    return {group,doors,doorLights,collider,headlamp,schedule,side,index,interiorSolids};
  });
  const transit=makeStationTransit(trains,(phase,detail)=>{
    emit('station:evacuation',{phase,...detail});
    if(phase==='start')boards[detail.side].draw(`0${detail.side+1} 月台 · 即將發車，請離開車廂`);
    if(phase==='impact')sound('SD_train',.24);
  },findPlatformLanding);
  function positionTrain(train){
    const {schedule:s,group,doors,collider,index}=train,p=s.progress,direction=index?-1:1;
    const offset=s.phase==='waiting'?-150:s.phase==='approaching'?-85*Math.pow(1-p,3):s.phase==='departing'?90*p*p:0;
    group.position.z=offset*direction;group.visible=s.phase!=='waiting';
    const open=s.door* s.door*(3-2*s.door);for(const d of doors)d.bone.position.lerpVectors(d.closed,d.open,open);
    const light=stationDoorIntensity(s);for(const mesh of train.doorLights){mesh.visible=light>0;mesh.material.color.setScalar(light);}
    train.headlamp.intensity=group.visible?15:0;group.updateMatrixWorld(true);
    collider.set(new T.Vector3(group.position.x-1.72,-.8,group.position.z+(index?-25:-24)),new T.Vector3(group.position.x+1.72,3.45,group.position.z+(index?24:25)));
  }
  for(const train of trains)positionTrain(train);
  const collision=makeStationCollision(terrainHeight,colliders,meshBlocked,transit);
  function findPlatformLanding(train,p){
    const side=Math.sign(train.group.position.x),outward=Math.abs(p.x)>Math.abs(train.group.position.x);
    const lanes=outward?[15.5,16.5,8.1,7.4]:[8.1,7.4,15.5,16.5];
    // Try nearby empty platform locations; avoid benches, piers and the stairs.
    for(const dz of [0,1.3,-1.3,2.6,-2.6,4,-4,6,-6,10,-10])for(const lane of lanes){
      const x=side*lane,z=T.MathUtils.clamp(p.z+dz,-24.5,26.5),y=terrainHeight(x,z);
      if(y>.1||collision.blocked(x,z,.42,y,1.84,0))continue;
      return new T.Vector3(x,y,z);
    }
    return new T.Vector3(side*8.1,0,2.7);
  }
  scene.updateMatrixWorld(true);
  makeStationWindowLight(scene,station,breeze,coarse);
  // Apply aperture lighting only to exterior receivers; closed carriage walls
  // keep their interiors shaded. Reuses the existing material draw passes.
  const windowReceivers=new Set([pavingMat,masonry,...Object.values(materials)]);
  for(const o of zones)if(o.name!=='train-cabin'&&o.material?.isMeshStandardMaterial)windowReceivers.add(o.material);
  for(const m of windowReceivers)receiveStationWindowLight(m);
  for(const side of [-1,1])lightBudget.add(0xbbddff,16,13,scene,new T.Vector3(side*10.5,4.5,-9.8));
  lightBudget.update(.2,new T.Vector3(0,1.62,23));
  return {station:true,bossArena:true,population:20,basePopulation:0,trainSpawns:true,navigationBounds:{x:stationGround.halfWidth,z:32},dropCeilingY:14,
    autoPlayAllows:stationAutoAllows,autoPlayRecovery:stationAutoRecovery,autoPlayStep:stationAutoStep,autoPlayRoute:stationAutoRoute(terrainHeight),
    spawn:{x:0,z:23,yaw:0,pitch:.03},sun,colliders,zones,terrainHeight,...collision,breeze,trains,boards,
    coinFloor:(x,z)=>transit.region(x,z,0,.05)?.floor??-Infinity,
    district:()=> '中央車站 · 雙月台',centerShadow(){},
    updateVisuals:(dt,camera)=>lightBudget.update(dt,camera),
    bindHunt(h,c){hunt=h;camera=c;},
    updateGates(dt,p,y,height){
      if(!Number.isFinite(dt)||dt<=0)return;
      transit.observe(p,y,height);flagMixer.update(dt);
      // Sweep short pieces even across phase boundaries; exclude the hidden reset
      // from the far tunnel back to the next arrival through the player's lane.
      let left=dt;const before=new T.Box3();
      while(left>1e-8){const step=Math.min(left,1/30);left-=step;
        for(const train of trains){const phase=train.schedule.phase;before.copy(train.collider);
          train.schedule.update(step);positionTrain(train);
          if([phase,train.schedule.phase].some(s=>s==='approaching'||s==='departing'))transit.checkTrain(train,before);
        }
      }
      updateSteam(dt);
    },
    resetGates(){transit.cancel();for(const train of trains){train.schedule.reset();positionTrain(train);}for(const s of steamPool)s.age=s.life;updateSteam(0);},
    updatePlayer:(dt,p,y,height)=>transit.update(dt,p,y,height),cancelTransit:()=>transit.cancel(),
    get playerLocked(){return transit.locked;},get transitKind(){return transit.kind;},get evacuationProgress(){return transit.progress;},
    requestTrain(){for(const train of trains)train.schedule.request();},
    sound,
    setActive(active){audioAllowed=active;if(!active){for(const a of audio)a.pause();audio.clear();}},
  };
}
