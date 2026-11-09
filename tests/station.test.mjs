import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeTrainSchedule } from '../src/station-train-state.js';
import { makeStationCollision, stationGallery, stationStairSolids, stationMeshBarriers } from '../src/station-collision.js';
import { makeStationTransit, cabinLayout, cabinWorld } from '../src/station-transit.js';

function run(step){
  const phases=[],passengers=[];let schedule;
  schedule=makeTrainSchedule(2,p=>phases.push(p),i=>passengers.push({i,phase:schedule.phase,door:schedule.door}));
  let elapsed=0;while(elapsed<85){const dt=Math.min(step,85-elapsed);schedule.update(dt);elapsed+=dt;}
  return {phases,passengers,cycle:schedule.cycle,phase:schedule.phase,time:schedule.time};
}
test('train phases and passenger waves are identical at normal FPS and after a stalled frame',()=>{
  const normal=run(1/60),slow=run(9);
  assert.deepEqual(normal.phases,slow.phases);assert.deepEqual(normal.passengers,slow.passengers);
  assert.equal(normal.cycle,slow.cycle);assert.equal(normal.phase,slow.phase);assert.ok(Math.abs(normal.time-slow.time)<1e-6);
  assert.deepEqual(normal.phases.slice(0,7),['approaching','braking','opening','boarding','closing','departing','waiting']);
  assert.ok(normal.passengers.length>=8);for(const p of normal.passengers){assert.equal(p.phase,'boarding');assert.equal(p.door,1);}
});
test('opposite platforms have independent schedules; pause/reset never leaks passengers',()=>{
  let count=0;const a=makeTrainSchedule(2,()=>{},()=>count++),b=makeTrainSchedule(15);
  a.update(10.5);b.update(10.5);assert.equal(a.phase,'boarding');assert.equal(b.phase,'waiting');
  const before=count;for(const dt of [0,-3,NaN,Infinity])a.update(dt);assert.equal(count,before);
  a.reset();assert.equal(a.phase,'waiting');assert.equal(a.door,0);assert.equal(a.cycle,0);
  b.request();b.update(.61);assert.equal(b.phase,'approaching');assert.equal(b.door,0);
});
test('both tracks and outer platforms are walkable inside the station boundary',()=>{
  const world=makeStationCollision(()=>0,[]);
  for(const side of [-1,1])for(const [feet,height]of [[0,1.84],[0,1.23],[2,1.84],[6,1.84]]){
    assert.equal(world.blocked(side*8.8,2,.32,feet,height),false);
    for(const x of [9.1,11.6,14,16,20])assert.equal(world.blocked(side*x,2,.32,feet,height),false);
    assert.equal(world.blocked(side*22.1,2,.32,feet,height),true);
  }
});

function transitFixture(){
  const events=[],trains=[0,1].map(index=>({index,group:new T.Group(),collider:new T.Box3(),interiorSolids:[]}));
  const transit=makeStationTransit(trains,(phase,detail)=>events.push({phase,...detail}));
  for(const t of trains){t.group.position.set(t.index?11.6:-11.6,.2,0);
    t.collider.set(new T.Vector3(t.group.position.x-1.72,-.8,-24),new T.Vector3(t.group.position.x+1.72,3.45,25));
    t.schedule=makeTrainSchedule(0,()=>{},()=>{},()=>transit.beginDeparture(t));}
  const world=makeStationCollision(()=>0,trains.map(t=>t.collider),()=>false,transit);
  return {trains,transit,world,events};
}

test('both cabins can be entered and left through open doors; sides, closed doors and ceiling remain solid',()=>{
  const {trains,world}=transitFixture();
  for(const t of trains){const side=t.index?1:-1,door=cabinWorld(t,0,cabinLayout.doors[0]).z;
    assert.equal(world.blocked(side*10.4,door,.32,0,1.84),true);
    t.schedule.update(8.06);
    let feet=0;
    for(let distance=8.8;distance<=11.6;distance+=.04){
      assert.equal(world.blocked(side*distance,door,.32,feet,1.84),false,`${side} enter ${distance}`);
      feet=world.verticalLimits(side*distance,door,feet).floor;
    }
    assert.equal(feet,.34);
    for(let distance=11.6;distance>=8.8;distance-=.04){
      assert.equal(world.blocked(side*distance,door,.32,feet,1.84),false);
      feet=world.verticalLimits(side*distance,door,feet).floor;
    }
    assert.equal(feet,0);
    assert.equal(world.blocked(side*10.4,door+3,.32,0,1.84),true);
    assert.equal(world.blocked(side*10.4,door+.65,.32,.34,1.84),true,'door leaf cannot be clipped at the edge');
    assert.equal(world.blocked(side*11.6,cabinWorld(t,0,cabinLayout.minZ+.1).z,.32,.34,1.84),true,'end wall remains solid');
    for(let distance=15.5;distance>=11.6;distance-=.04){
      assert.equal(world.blocked(side*distance,door,.32,feet,1.84),false,'outer platform doorway');
      feet=world.verticalLimits(side*distance,door,feet).floor;
    }
    assert.equal(feet,.34);
    assert.equal(world.blocked(side*11.6,door,.32,1.4,1.84),true);
  }
});

test('departure waits for a continuous escorted path through a door, even after a long frame',()=>{
  for(const index of [0,1]){
    const {trains,transit,events}=transitFixture(),t=trains[index],start=cabinWorld(t,0,cabinLayout.minZ+.5);
    const player={x:start.x,z:start.z,yaw:0,pitch:0};let feet=start.y;
    transit.update(0,player,feet);t.schedule.update(30);
    assert.equal(transit.locked,true);assert.equal(t.schedule.phase,'boarding');assert.equal(t.schedule.door,1);
    const paused={...player};transit.update(0,player,feet);t.schedule.update(0);assert.deepEqual(player,paused);
    let old={...player},crossed=false;
    for(let i=0;i<900&&transit.locked;i++){
      const pose=transit.update(1/60,player,feet);feet=pose.feet;
      assert.ok(Math.hypot(player.x-old.x,player.z-old.z)<.12,'no teleport during escort');
      if(Math.abs(old.x)>=9.2&&Math.abs(player.x)<9.2){crossed=true;
        const exit=cabinWorld(t,0,cabinLayout.doors[0]);assert.ok(Math.abs(player.z-exit.z)<.01);}
      old={...player};t.schedule.update(1/60);
      if(transit.locked){assert.equal(t.schedule.phase,'boarding');assert.equal(t.schedule.door,1);}
    }
    assert.equal(transit.locked,false);assert.equal(crossed,true);assert.ok(Math.abs(player.x)<8.5);assert.equal(feet,0);
    assert.deepEqual(events.map(e=>e.phase),['start','complete']);
    t.schedule.update(1.6);assert.equal(t.schedule.phase,'departing');
    transit.cancel();assert.equal(transit.locked,false);
  }
});

test('source masonry collision covers a pier face and its diagonal corners',()=>{
  const source=new T.Group(),pier=new T.Mesh(new T.BoxGeometry(1,4,1));pier.name='Station';pier.position.set(2.8,2,-24);source.add(pier);
  const world=makeStationCollision(()=>0,[],stationMeshBarriers(source));
  assert.equal(world.blocked(2.8,-23.3,.32,0,1.84),true);
  assert.equal(world.blocked(2.8,-23.3,.32,0,1.23),true);
  assert.equal(world.blocked(2.05,-23.3,.32,0,1.84),true);
  assert.equal(world.blocked(1.6,-23.3,.32,0,1.84),false);
});

test('open-backed landing masonry blocks descent from behind and supports falling onto its cap',()=>{
  const source=new T.Group(),cap=new T.Mesh(new T.PlaneGeometry(9.2,.44).rotateX(-Math.PI/2));
  cap.name='Station';cap.position.set(0,5.69,-26.27);source.add(cap);
  const surfaceOnly=makeStationCollision(()=>0,[],stationMeshBarriers(source));
  assert.equal(surfaceOnly.blocked(4.2,-26.65,.32,4.98,1.84),false,'regression: a cap without rear faces was not solid');
  const solids=stationStairSolids(source),world=makeStationCollision(()=>0,solids,stationMeshBarriers(source));
  assert.ok(solids.length>0);
  for(const x of [-4.2,0,4.2])for(const height of [1.23,1.84]){
    assert.equal(world.blocked(x,-26.65,.32,4.98,height),true);
    assert.equal(world.blocked(x,-26.85,.32,4.98,height),false);
    assert.ok(Math.abs(world.verticalLimits(x,-26.27,6).floor-5.695)<.001);
  }
  assert.equal(world.blocked(0,-26.27,.32,0,1.84),false,'keep the ground-level arch passage open');
});

test('both gallery wings connect at landing height with separate walkable ground below',()=>{
  const deck=new T.Box3(new T.Vector3(-stationGallery.halfWidth,4.70,-32),new T.Vector3(stationGallery.halfWidth,4.98,-26.5));
  const world=makeStationCollision(()=>0,[deck]);
  for(const side of [-1,1])for(let x=5.8;x<17.8;x+=.1){
    assert.equal(world.blocked(side*x,-28,.32,4.98,1.84),false);
    assert.equal(world.verticalLimits(side*x,-28,4.98).floor,4.98);
    if(x>9.2)assert.equal(world.blocked(side*x,-28,.32,0,1.84),false);
  }
  assert.equal(world.blocked(22.1,-28,.32,4.98,1.84),true);
});

test('moving trains sweep across slow frames, knock to a platform, and unlock exactly once',()=>{
  for(const index of [0,1])for(const outer of [false,true]){
    const {trains,transit,events}=transitFixture(),train=trains[index],side=index?1:-1;
    train.schedule.update(1);
    const player={x:side*(outer?12.5:11),z:0,yaw:0,pitch:0};let feet=0;
    transit.update(0,player,feet);
    const before=train.collider.clone();before.min.z=-70;before.max.z=-21;train.collider.min.z=10;train.collider.max.z=59;
    assert.equal(transit.checkTrain(train,before),true,'swept hit, even with no endpoint overlap');
    assert.equal(transit.kind,'impact');assert.equal(transit.checkTrain(train,before),false);
    const paused={...player};transit.update(0,player,feet);assert.deepEqual(player,paused);
    let peak=0,starts=0,previous={...player};
    for(let i=0;i<120&&transit.locked;i++){
      const pose=transit.update(1/60,player,feet);feet=pose.feet;peak=Math.max(peak,feet);if(pose.impactStart)starts++;
      assert.ok(Math.hypot(player.x-previous.x,player.z-previous.z)<.35,'continuous impact path');previous={...player};
    }
    assert.equal(transit.locked,false);assert.equal(starts,1);assert.ok(peak>.8);assert.equal(feet,0);
    assert.ok(outer?Math.abs(player.x)>14.5:Math.abs(player.x)<9);
    assert.deepEqual(events.map(e=>e.phase),['impact','impact-complete']);
  }
});

test('train collision ignores platforms, the upper gallery and hidden cycle resets',()=>{
  const {trains,transit}=transitFixture(),train=trains[0],before=train.collider.clone();train.schedule.update(1);
  for(const [x,y]of [[-8,0],[-15.5,0],[-11.6,4.98]]){
    transit.update(0,{x,z:0,yaw:0,pitch:0},y);assert.equal(transit.checkTrain(train,before),false);
  }
  train.schedule.reset();transit.update(0,{x:-11.6,z:0,yaw:0,pitch:0},0);
  assert.equal(transit.checkTrain(train,before),false);assert.equal(transit.locked,false);
});
test('landing supports players above it and permits walking underneath; stair rises follow geometry',()=>{
  const deck=new T.Box3(new T.Vector3(-9,4.7,-32),new T.Vector3(9,4.98,-26.5));
  const terrain=(x,z)=>Math.abs(x)>3&&Math.abs(x)<8&&z<=-17&&z>=-26.5?(-17-z)*.524:0;
  const world=makeStationCollision(terrain,[deck]);
  assert.equal(world.verticalLimits(0,-28,0).floor,0);
  assert.equal(world.verticalLimits(0,-28,5).floor,4.98);
  assert.ok(Math.abs(world.verticalLimits(0,-28,0).ceiling-2.86)<1e-6);
  for(const side of [-1,1])for(let z=-17.1;z>=-26.1;z-=.1){
    const feet=terrain(side*5.8,z+.1);assert.equal(world.blocked(side*5.8,z,.32,feet,1.84),false);
  }
  assert.equal(world.blocked(5.8,-24,.32,0,1.84),true,'cannot enter the solid side of a staircase');
});
