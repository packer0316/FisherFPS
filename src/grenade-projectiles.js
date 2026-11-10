import * as T from 'three';
import { makeGrenadeModel } from './grenade-model.js';
import { makeBallistic, makeGrenadeSweep, grenadeStats } from './grenade-physics.js';

export function makeGrenadeProjectiles(scene,world,onBlast,onBounce) {
  const group=new T.Group(); group.name='grenade-projectiles'; scene.add(group);
  const sweep=makeGrenadeSweep(world), template=makeGrenadeModel();
  template.pin.visible=false;
  const flying=[];
  // One flash light stays in the scene at zero intensity for the whole level. Adding a
  // light per blast changed the scene's light count, so the first explosion recompiled
  // every lit material (13 programs) in the middle of combat. A newer blast takes it over.
  const flash=new T.PointLight(0xffbd78,0,18,2);flash.name='grenade-flash';scene.add(flash);
  let flashAge=Infinity;
  const ray=new T.Raycaster(); ray.firstHitOnly=true;
  const direction=new T.Vector3();
  function visible(from,to) {
    direction.subVectors(to,from); const distance=direction.length();
    if(distance<.12)return true;
    ray.set(from,direction.divideScalar(distance));ray.near=.06;ray.far=distance-.05;
    return ray.intersectObjects(world.zones,false).length===0;
  }
  function burst(position,context) {
    // Actual flash, debris and smoke are the EFK assets in combat-particles.
    // This light is the short illumination they cast onto the world geometry.
    flash.position.copy(position);flash.position.y+=.8;flash.intensity=110;flashAge=0;
    onBlast(position,context);
  }
  function launch(origin,velocity,context) {
    const mesh=template.root.clone(true);mesh.scale.setScalar(1.45);group.add(mesh);
    const ball=makeBallistic(origin,velocity,sweep);mesh.position.copy(origin);
    flying.push({mesh,ball,bounces:0,context});
  }
  function update(dt) {
    if(dt<=0)return;
    for(let i=flying.length-1;i>=0;i--){
      const item=flying[i],detonate=item.ball.update(dt);
      item.mesh.position.copy(item.ball.position);
      if(!item.ball.resting){item.mesh.rotation.x+=dt*8;item.mesh.rotation.z+=dt*5;}
      if(item.ball.bounces!==item.bounces){item.bounces=item.ball.bounces;onBounce?.(item.ball.position,item.ball.velocity.length(),item.ball.takeImpact());}
      if(detonate){burst(item.ball.position.clone(),item.context);group.remove(item.mesh);flying.splice(i,1);}
    }
    if(flashAge<=.5){flashAge+=dt;flash.intensity=flashAge>.5?0:110*Math.exp(-flashAge*14);}
  }
  function clear(){flying.length=0;group.clear();flash.intensity=0;flashAge=Infinity;}
  function dispose(){clear();scene.remove(group,flash);flash.dispose();const materials=new Set(),geometries=new Set();
    template.root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  return {launch,update,clear,dispose,sweep,visible,get active(){return flying;},radius:grenadeStats.blastRadius};
}
