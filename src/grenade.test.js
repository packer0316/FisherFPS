import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeGrenadeState, grenadeTiming } from './grenade-state.js';
import { grenadeFingerMotion } from './grenade-gesture.js';
import { makeBallistic, makeGrenadeSweep, throwVelocity, blastDamage, grenadeStats } from './grenade-physics.js';

test('a quick click completes pin extraction before one release; holding never repeats',()=>{
  const throws=[],state=makeGrenadeState(power=>throws.push(power));
  assert.equal(state.press(5),true);state.release();state.update(.5);assert.equal(throws.length,0);
  state.update(.7);assert.equal(throws.length,1);assert.equal(throws[0],0);
  state.update(3);assert.equal(state.phase,'idle');
  state.press(4);state.update(8);assert.equal(state.phase,'held');assert.equal(throws.length,1);
  assert.equal(state.press(4),false);state.release();state.update(2);
  assert.deepEqual(throws,[0,1]);
});
test('cancel on switch or pause cannot spend a grenade; zero supply cannot prime',()=>{
  let spent=0;const s=makeGrenadeState(()=>spent++);
  assert.equal(s.press(0),false);s.update(2);assert.equal(spent,0);
  for(const duration of [.2,.8]){s.press(5);s.update(duration);s.release();s.cancel();s.update(3);}
  assert.equal(spent,0);assert.equal(s.phase,'idle');
});
test('animation transitions agree at 30/60/144 fps, including the release boundary',()=>{
  for(const rate of [30,60,144]){
    let launches=0;const s=makeGrenadeState(()=>launches++);s.press(5);s.release();
    for(let n=0;n<Math.floor((grenadeTiming.pin+grenadeTiming.release)*rate);n++)s.update(1/rate);
    assert.equal(launches,0);s.update(1/rate);assert.equal(launches,1);
  }
});
test('last grenade follows through into a relaxed empty hand without regripping',()=>{
  for(const rate of [30,60,144]){
    let available=1;
    const state=makeGrenadeState(()=>available--);
    state.press(available);state.release();
    let sawFollowThrough=false,sawRelaxed=false;
    for(let frame=0;frame<rate*3;frame++){
      state.update(1/rate);
      for(let joint=0;joint<15;joint++){
        const pose=grenadeFingerMotion(state.phase,state.time,available,joint);
        assert.ok(pose.extension>=0&&pose.extension<=1&&pose.relax>=0&&pose.relax<=1);
        if(state.phase==='recover'&&state.time>.095&&state.time<.13){assert.equal(pose.extension,1);sawFollowThrough=true;}
        if(state.phase==='recover'&&state.time>.32){assert.equal(pose.relax,1);sawRelaxed=true;}
        if(!available&&state.phase==='idle')assert.equal(pose.relax,1);
      }
    }
    assert.ok(sawFollowThrough&&sawRelaxed);assert.equal(available,0);
  }
});
test('finger release is continuous across launch; pickup only closes a supplied hand',()=>{
  for(let joint=0;joint<15;joint++){
    const before=grenadeFingerMotion('throw',grenadeTiming.release-1e-7,1,joint);
    const after=grenadeFingerMotion('recover',0,0,joint);
    assert.ok(Math.abs(before.extension-after.extension)<.00001);
    assert.deepEqual(grenadeFingerMotion('throw',.2,1,joint),{extension:0,relax:0});
    assert.deepEqual(grenadeFingerMotion('recover',.56,4,joint),{extension:0,relax:0});
    assert.equal(grenadeFingerMotion('recover',.56,0,joint).relax,1);
  }
});
test('ballistic trajectory follows gravity and is independent of render rate',()=>{
  const p=new T.Vector3(0,12,0),v=throwVelocity(new T.Vector3(0,0,-1),.5);
  const results=[];
  for(const rate of [30,60,144]){
    const b=makeBallistic(p,v,()=>null);for(let i=0;i<rate;i++)b.update(1/rate);
    assert.ok(Math.abs(b.position.y-(p.y+v.y-.5*9.81))<1e-8);results.push(b.position);
  }
  assert.ok(results[0].distanceTo(results[2])<1e-8);
  assert.ok(throwVelocity(new T.Vector3(0,0,-1),1).length()>v.length());
  assert.ok(throwVelocity(new T.Vector3(0,0,-1),0,new T.Vector3(0,0,-5)).z<-10);
});
test('swept collisions catch thin walls, floor and ceiling; bounce loses energy',()=>{
  const box=new T.Box3(new T.Vector3(-5,0,-2.02),new T.Vector3(5,5,-2));
  const ceiling=new T.Box3(new T.Vector3(-5,3,-5),new T.Vector3(5,3.1,5));
  const sweep=makeGrenadeSweep({colliders:[box,ceiling],terrainHeight:()=>0});
  const wall=sweep(new T.Vector3(0,1,0),new T.Vector3(0,1,-4),.075);
  assert.equal(wall.normal.z,1);assert.ok(Math.abs(wall.position.z+1.925)<1e-8);
  assert.equal(sweep(new T.Vector3(0,1,0),new T.Vector3(0,4,0),.075).normal.y,-1);
  const b=makeBallistic(new T.Vector3(0,.2,0),new T.Vector3(0,-4,0),sweep);
  b.update(.04);assert.ok(b.velocity.y>0&&b.velocity.y<4);assert.ok(b.position.y>=.075);
  b.update(3);assert.ok(b.age>=grenadeStats.fuse);assert.ok(b.resting);
});
test('blast damage falls with range and has a hard outer boundary',()=>{
  assert.equal(blastDamage(0),155);assert.ok(blastDamage(2)>blastDamage(5));
  assert.ok(blastDamage(7)>blastDamage(9));assert.ok(blastDamage(10.9)>0);
  assert.equal(blastDamage(11),0);assert.equal(blastDamage(20),0);
});
