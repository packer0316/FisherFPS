import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {makeAutoPlayer,planAutoGrenade} from '../src/auto-play.js';
import {togglePriority,normalizePriority,preferredAutoWeapon,hazardClearance,hazardRisk} from '../src/auto-play-rules.js';
import {attachTargetNodes,targetNodePosition} from '../src/target-nodes.js';
import {makeGrenadeSweep,makeBallistic,throwVelocity} from '../src/grenade-physics.js';
import {makeGrenadeState} from '../src/grenade-state.js';
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function world(colliders=[]){return {colliders,navigationBounds:{x:35,z:35},terrainHeight:()=>0,verticalLimits:()=>({floor:0,ceiling:Infinity}),
  blocked:(x,z,r,y,h)=>Math.abs(x)>35-r||Math.abs(z)>35-r||colliders.some(b=>x>b.min.x-r&&x<b.max.x+r&&z>b.min.z-r&&z<b.max.z+r&&y<b.max.y&&y+h>b.min.y)};}
function enemy(id,x,z){
  const root=new T.Group(),model=new T.Group(),chest=new T.Bone(),head=new T.Bone();
  root.add(model);model.add(chest,head);chest.position.y=1.2;head.position.y=1.8;root.position.set(x,0,z);
  const actor={root,model,chest,head,height:2,alive:true,opacity:1,type:{id,name:id}};attachTargetNodes(actor);return actor;
}
function context(enemies,w=world()){
  return {world:w,position:v(),eye:v(0,1.84,0),velocity:v(),grounded:true,ready:true,hazards:[],pickups:[],health:100,
    economy:{owned:new Set(['rifle','grenade']),ammo:{rifle:30,mg3:200,grenade:5},weapon:'rifle',wallet:100000,bet:10},grenade:makeGrenadeState(()=>{}),
    hunt:{targets:enemies,nodeAimPoint:targetNodePosition,canAimFrom(origin,e,out,index=0){targetNodePosition(e,index,out);return !e.occluded;}}};
}
function move(pilot,c,dt){
  const out=pilot.update(dt,c),speed=out.run?7.9:5.25;
  c.velocity.set(out.x*speed,0,out.z*speed);c.position.addScaledVector(c.velocity,dt);c.eye.copy(c.position);c.eye.y+=1.84;return out;
}
test('priority toggles remove then append, and scene changes discard unknown species',()=>{
  let order=[];for(const id of ['a','b','c','b','b'])order=togglePriority(order,id);
  assert.deepEqual(order,['a','c','b']);assert.deepEqual(normalizePriority([...order,'a','bride'],[{id:'a'},{id:'b'}]),['a','b']);
  assert.deepEqual(normalizePriority([],[{id:'a'}]),[]);
});
test('aim nodes follow animated bones and actor transforms independently of camera visibility',()=>{
  const e=enemy('a',10,5),out=v();e.root.rotation.y=Math.PI/2;e.chest.position.x=.25;
  targetNodePosition(e,0,out);assert.ok(out.distanceTo(v(10,1.2,4.75))<1e-8);
  e.head.position.y=1.9;targetNodePosition(e,1,out);assert.equal(out.y,1.9);
  assert.equal(new Set(e.aimNodes).size,3);
});
test('offscreen high-priority actor outranks nearer actors; occlusion and deselection are respected',()=>{
  const a=enemy('first',0,15),b=enemy('second',0,-5),ignored=enemy('unselected',0,-2),c=context([ignored,b,a]),pilot=makeAutoPlayer(()=>.1);
  pilot.start({order:['first','second'],grenades:false},c);pilot.update(.2,c);assert.equal(pilot.target,a);
  a.occluded=true;pilot.update(.2,c);assert.equal(pilot.target,b);
  b.alive=false;pilot.update(.2,c);assert.equal(pilot.target,a);assert.equal(pilot.controls.fire,false);
});
test('owns and consumes MG3 ammunition before switching to rifle, never chooses an unowned MG3',()=>{
  const c=context([enemy('a',0,-10)]),pilot=makeAutoPlayer();pilot.start({order:['a'],grenades:false},c);
  assert.equal(preferredAutoWeapon(c.economy),'rifle');c.economy.owned.add('mg3');
  assert.equal(pilot.update(.1,c).weapon,'mg3');c.economy.weapon='mg3';c.economy.ammo.mg3=0;
  assert.equal(pilot.update(.1,c).weapon,'rifle');
});
test('travels continuously, escapes a warned circle before impact and avoids solid cover',()=>{
  const box=new T.Box3(v(2,0,-3),v(3,5,3)),c=context([enemy('a',0,-12)],world([box])),pilot=makeAutoPlayer(()=>.25);
  const warning={active:true,shape:'circle',x:0,z:0,radius:4,age:0,delay:1.3,duration:0};c.hazards.push(warning);
  pilot.start({order:['a'],grenades:false},c);let travelled=0;
  for(let i=0;i<360;i++){
    const before=c.position.clone();move(pilot,c,1/60);travelled+=before.distanceTo(c.position);
    assert.equal(c.world.blocked(c.position.x,c.position.z,.32,0,1.84),false,JSON.stringify({step:i,position:c.position}));
    if(i===77)assert.ok(hazardClearance(warning,c.position)>0,JSON.stringify(c.position));
    warning.age+=1/60;
  }
  assert.ok(travelled>29);
});
test('hollow rings retain a safe centre; rotated warning lanes have finite ends',()=>{
  const ring={active:true,shape:'circle',x:0,z:0,radius:11,inner:4.3,age:0,delay:2};
  assert.ok(hazardClearance(ring,v())>0);assert.ok(hazardClearance(ring,v(6,0,0))<0);
  const lane={active:true,shape:'line',x:0,z:0,dx:1,dz:0,width:3,length:10,age:0,delay:1};
  assert.ok(hazardRisk([lane],v(5,0,0))>0);assert.equal(hazardRisk([lane],v(-3,0,0)),0);
  assert.equal(hazardRisk([lane],v(5,0,0),2),0);
});
test('planned grenade lands near its target with inherited lateral velocity; a tall wall rejects the throw',()=>{
  const origin=v(0,1.84,0),target=v(0,.1,-17),velocity=v(3,0,0),sweep=makeGrenadeSweep(world());
  const plan=planAutoGrenade(origin,target,velocity,sweep);assert.ok(plan);
  const ball=makeBallistic(origin,throwVelocity(plan.direction,plan.power,velocity),sweep);ball.update(2.7);
  assert.ok(ball.position.distanceTo(target)<4.8);
  const wall=new T.Box3(v(-35,0,-7),v(35,30,-6));assert.equal(planAutoGrenade(origin,target,velocity,makeGrenadeSweep(world([wall]))),null);
});
test('single enemies do not spend grenades, but a suitable cluster primes and releases exactly once',()=>{
  const enemies=[enemy('a',0,-16)],c=context(enemies),pilot=makeAutoPlayer(()=>.2);let launches=0;
  c.grenade=makeGrenadeState(()=>{launches++;c.economy.ammo.grenade--;});pilot.start({order:['a']},c);
  for(let i=0;i<180;i++)pilot.update(1/60,c);assert.equal(pilot.throwing,false);
  enemies.push(enemy('a',1,-16),enemy('a',-1,-16));
  for(let i=0;i<360;i++){
    const out=pilot.update(1/60,c);if(out.weapon)c.economy.weapon=out.weapon;
    if(out.prime)c.grenade.press(c.economy.ammo.grenade);if(out.release)c.grenade.release();c.grenade.update(1/60);
  }
  assert.equal(launches,1);assert.equal(c.economy.ammo.grenade,4);assert.equal(c.economy.weapon,'rifle');
});
test('shot cap and insufficient balance stop movement and firing; restarting clears past progress',()=>{
  const c=context([enemy('a',0,-10)]),pilot=makeAutoPlayer();pilot.start({order:['a'],grenades:false,maxShots:2},c);
  pilot.recordShot();pilot.recordShot();pilot.update(.1,c);assert.equal(pilot.enabled,false);assert.equal(pilot.controls.x,0);assert.equal(pilot.controls.fire,false);
  pilot.start({order:['a'],grenades:false,maxShots:0},c);assert.equal(pilot.shots,0);c.economy.wallet=9;pilot.update(.1,c);assert.equal(pilot.enabled,false);
});
test('an automatic MG3 pickup during pin extraction cancels the throw without deadlocking',()=>{
  const c=context([enemy('a',0,-16),enemy('a',1,-16),enemy('a',-1,-16)]),pilot=makeAutoPlayer(()=>.2);
  pilot.start({order:['a']},c);
  for(let i=0;i<200;i++){
    const out=pilot.update(1/60,c);if(out.weapon)c.economy.weapon=out.weapon;
    if(out.prime){c.grenade.press(5);break;}
  }
  assert.equal(c.grenade.phase,'pin');c.economy.owned.add('mg3');c.economy.weapon='mg3';c.grenade.cancel();
  pilot.update(1/60,c);assert.equal(pilot.throwing,false);assert.equal(pilot.controls.fire,true);assert.equal(pilot.controls.weapon,null);
});
test('patrol spans the arena in one direction even as the preferred enemy jumps between sides',()=>{
  const a=enemy('a',0,-8),c=context([a]),pilot=makeAutoPlayer(()=>.2),trace=[];c.position.set(0,0,25);c.eye.copy(c.position);c.eye.y+=1.84;
  pilot.start({order:['a'],grenades:false,supplies:false},c);
  let reversed=0,previous=v(),winding=0;
  for(let i=0;i<60*60;i++){
    if(i%90===0)a.root.position.set(i%180===0?10:-10,0,i%180===0?-10:10);
    const before=c.position.clone();move(pilot,c,1/60);
    winding+=Math.atan2(before.x*c.position.z-before.z*c.position.x,before.x*c.position.x+before.z*c.position.z);
    if(i%6===0){
      const heading=c.velocity.clone().normalize();if(heading.dot(previous)<-.25)reversed++;
      previous.copy(heading);trace.push(c.position.clone());
    }
  }
  const extent=axis=>Math.max(...trace.map(p=>p[axis]))-Math.min(...trace.map(p=>p[axis]));
  assert.ok(extent('x')>42&&extent('z')>44,JSON.stringify({x:extent('x'),z:extent('z')}));
  assert.ok(winding>Math.PI*3,`expected sustained clockwise circuit, got ${winding}`);
  assert.ok(reversed<=3,`too many abrupt reversals: ${reversed}`);
});
test('circulates steadily in a ring safe centre, then escapes its subsequent core attack',()=>{
  const c=context([]),pilot=makeAutoPlayer(()=>.2),ring={active:true,shape:'circle',x:0,z:0,radius:11,inner:4.3,age:0,delay:2.333,duration:.45};
  c.hazards=[ring];pilot.start({order:['a'],grenades:false,supplies:false},c);
  let reversed=0,previous=v();
  for(let i=0;i<138;i++){
    move(pilot,c,1/60);ring.age+=1/60;
    assert.ok(hazardClearance(ring,c.position)>0);
    const heading=c.velocity.clone().normalize();if(heading.dot(previous)<-.25)reversed++;previous.copy(heading);
  }
  assert.ok(reversed<2,`safe-centre reversals: ${reversed}`);
  ring.active=false;
  const core={active:true,shape:'circle',x:0,z:0,radius:4.3,age:0,delay:1.7,duration:0};c.hazards.push(core);
  for(let i=0;i<96;i++){move(pilot,c,1/60);core.age+=1/60;}
  assert.ok(hazardClearance(core,c.position)>0);
});
