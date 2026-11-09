import * as T from 'three';
import { makeGrenadeModel } from './grenade-model.js';
import { makeBallistic, makeGrenadeSweep, grenadeStats } from './grenade-physics.js';

export function makeGrenadeProjectiles(scene,world,onBlast,onBounce) {
  const group=new T.Group(); group.name='grenade-projectiles'; scene.add(group);
  const sweep=makeGrenadeSweep(world), template=makeGrenadeModel();
  template.pin.visible=false;
  const flying=[], flashes=[];
  const ray=new T.Raycaster(); ray.firstHitOnly=true;
  const direction=new T.Vector3();
  function visible(from,to) {
    direction.subVectors(to,from); const distance=direction.length();
    if(distance<.12)return true;
    ray.set(from,direction.divideScalar(distance));ray.near=.06;ray.far=distance-.05;
    return ray.intersectObjects(world.zones,false).length===0;
  }
  function burst(position) {
    // Actual flash, debris and smoke are the EFK assets in combat-particles.
    // This light is the short illumination they cast onto the world geometry.
    const light=new T.PointLight(0xffbd78,110,18,2);light.position.copy(position).add(new T.Vector3(0,.8,0));group.add(light);
    flashes.push({light,age:0});onBlast(position);
  }
  function launch(origin,velocity) {
    const mesh=template.root.clone(true);mesh.scale.setScalar(1.45);group.add(mesh);
    const ball=makeBallistic(origin,velocity,sweep);mesh.position.copy(origin);
    flying.push({mesh,ball,bounces:0});
  }
  function update(dt) {
    if(dt<=0)return;
    for(let i=flying.length-1;i>=0;i--){
      const item=flying[i],detonate=item.ball.update(dt);
      item.mesh.position.copy(item.ball.position);
      if(!item.ball.resting){item.mesh.rotation.x+=dt*8;item.mesh.rotation.z+=dt*5;}
      if(item.ball.bounces!==item.bounces){item.bounces=item.ball.bounces;onBounce?.(item.ball.position,item.ball.velocity.length());}
      if(detonate){burst(item.ball.position.clone());group.remove(item.mesh);flying.splice(i,1);}
    }
    for(let i=flashes.length-1;i>=0;i--){
      const f=flashes[i];f.age+=dt;f.light.intensity=110*Math.exp(-f.age*14);
      if(f.age>.5){group.remove(f.light);flashes.splice(i,1);}
    }
  }
  function clear(){flying.length=flashes.length=0;group.clear();}
  function dispose(){clear();scene.remove(group);const materials=new Set(),geometries=new Set();
    template.root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  return {launch,update,clear,dispose,sweep,visible,get active(){return flying;},radius:grenadeStats.blastRadius};
}
