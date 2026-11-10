import * as T from 'three';


import { fitClassicSupport, fitClassicFiring } from './classic-rifle-hands.js';
import { reloadHand } from './reload-hand.js';
import { classicHandPoses } from './classic-rifle-hand-data.js';
import { addRifleSight } from './rifle-hardware.js';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),ease=T.MathUtils.smoothstep;

function materialFinish(gun){
  const materials=new Map();
  gun.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const finish=old=>{
      if(materials.has(old.uuid))return materials.get(old.uuid);
      const mat=old.clone();mat.envMapIntensity=.9;mat.normalScale?.setScalar(.85);mat.aoMapIntensity=.65;
      for(const map of [mat.map,mat.normalMap,mat.roughnessMap,mat.metalnessMap])if(map)map.anisotropy=8;
      materials.set(old.uuid,mat);return mat;
    };
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(finish):finish(mesh.material);
  });
}
export function installClassicRifle(body,hands,asset,id,detailMap){
  const space=hands,find=name=>space.getObjectByName(name);
  find('Gun_ak47').removeFromParent();space.add(asset.scene);
  const gun=asset.scene,marker=name=>gun.getObjectByName(name).getWorldPosition(v());
  space.updateMatrixWorld(true);
  materialFinish(gun);
  fitClassicFiring(space,id);
  fitClassicSupport(space,id);
  // Blender can suffix an assembly when an imported mesh owned its original name;
  // GLTFLoader strips the period. Select the assembly, never one of its meshes.
  const assembly=name=>{
    let found;const pattern=new RegExp('^'+name+'(?:[.]?[0-9]+)?$');
    gun.traverse(node=>{if(!found&&!node.isMesh&&pattern.test(node.name))found=node});
    if(!found)throw new Error(id+' is missing '+name+' assembly');
    return found;
  };
  const mag=assembly('Magazine'),bolt=assembly('ChargingHandle');
  // Move pivots into the hand rig's frame, so the magazine and carrying hand share a transform.
  space.attach(mag);space.attach(bolt);
  const spare=mag.clone(true);spare.name='ClassicFreshMagazine';space.add(spare);spare.visible=false;
  const left=reloadHand(space,'L',true),grip=classicHandPoses[id].magazine;
  const along=v(...grip.along),inward=v(...grip.pad),thumb=new T.Quaternion(...grip.thumb);
  const grasp=part=>left.articulated(part,v(...grip.center),along,inward,grip.fingers,thumb,grip.thumbFlex);
  const open=part=>left.articulated(part,v(...grip.center),along,inward,
    grip.fingers.map(([spread])=>[spread,14,25,16]),thumb,[8,6]);
  const held=grasp(mag),fresh=grasp(spare),around=open(mag),freshAround=open(spare);
  held.release=around.fingers;fresh.release=around.fingers;
  around.point.add(v(-.065,-.025,-.065));freshAround.point.add(v(-.065,-.025,-.065));
  const clear={...around,part:null,followRoll:false,point:around.point.clone().add(mag.position).add(v(-.04,-.09,.04))};
  const pocket={...clear,point:clear.point.clone().add(v(.03,-.10,.08)),
    orientation:new T.Quaternion().setFromAxisAngle(v(0,1,0),-.28)
      .multiply(new T.Quaternion().setFromAxisAngle(v(1,0,0),-.48)).multiply(clear.orientation)};
  const seated=id==='vss'?.72:id==='scarl'?.70:.68;
  const keys=[[0,left.rest],[.12,around,v(-.04,-.07,0)],[.18,held],[.28,held],
    [.35,clear],[.43,pocket],[.47,freshAround],[.53,fresh],[seated,fresh],
    [seated+.055,clear],[.90,left.rest,v(-.04,-.07,0)],[1,left.rest]];
  const partial=keys;
  // The VSS handle is on the right; keep the supporting arm below the sight.
  const right=id==='vss'?reloadHand(space,'R',true):null;
  const rightHook=right?.place(right.hook,v(.025,.012,.005),v(0,.12,-1),v(-1,0,0),bolt,true);
  const rightClear=right?.place(right.loose,bolt.position.clone().add(v(.15,-.025,.06)),v(0,.12,-1),v(-1,0,0));
  const rightKeys=right?[[0,right.rest],[.78,right.rest],[.85,rightClear],[.89,rightHook],[.92,rightHook],[.96,rightClear],[1,right.rest]]:null;
  const vssLeft=right?[...keys.filter(([t])=>t<=seated+.06),[.82,left.rest],[1,left.rest]]:null;
  const magHome=mag.position.clone(),boltHome=bolt.position.clone(),axis=v(1,0,0);
  const index=find('Bone_R006'),indexHome=index.quaternion.clone();
  const tip=marker('Muzzle'),port=marker('EjectionPort'),rail=marker('RailContact');
  // Seat the clamp on the actual authored rail surface, including its bevels.
  const topRay=new T.Raycaster(v(rail.x,2,rail.z),v(0,-1,0));
  const railHit=topRay.intersectObject(gun.getObjectByName('ClassicBody'),true)[0];
  if(railHit)rail.y=railHit.point.y;
  space.traverse(n=>{if(n.isSkinnedMesh){n.frustumCulled=false;n.material=n.material.clone();n.material.aoMapIntensity=.62}});
  const unit=.53;body.add(space);space.scale.setScalar(unit);space.position.set(0,.04,.145);
  for(const point of [tip,port,rail])point.multiplyScalar(unit).add(space.position);
  const sightY=rail.y+.0345,dot=addRifleSight(body,sightY,rail.z,detailMap);
  const sight=body.getObjectByName('TubeSight');sight.name='ClassicSight';
  // Use the same eye relief with each weapon's authored rail location.
  const adsZ=-.17-(rail.z+.0445);
  function pose(p,empty,cycle,ads){
    const pull=ease(p,.18,.28),insert=ease(p,.53,seated);
    mag.visible=p<.43||p>=seated;mag.position.copy(magHome);mag.quaternion.identity();
    if(p>=.18&&p<seated){mag.position.y-=.16*pull;mag.position.z+=.035*pull;if(p>.30){const fall=(p-.30)*2.5;mag.position.y-=2.2*fall*fall;mag.rotation.x=.5*fall}}
    spare.visible=p>=.46&&p<seated;spare.position.copy(magHome).add(v(-.10,-.22,.10).multiplyScalar(1-insert));spare.quaternion.setFromAxisAngle(axis,-.32*(1-insert));
    bolt.position.copy(boltHome);bolt.position.z+=.065*Math.sin(cycle*Math.PI)+(empty?.07*ease(p,.83,.89)*(1-ease(p,.91,.94)):0);
    left.update(p,empty?(vssLeft??keys):partial);
    right?.update(empty?p:0,rightKeys);
    if(!right||!empty||p<.78||p>=1){index.quaternion.copy(indexHome);index.rotateZ(-.07*Math.sin(cycle*Math.PI))}
    dot.visible=ads>.03;dot.material.opacity=ease(ads,.03,.78);
  }
  // Restore the fitted ready hand after baking reload finger shapes.
  left.update(.999,keys);left.update(1,keys);
  return {tip,port,sightY,adsZ,pose};
}
