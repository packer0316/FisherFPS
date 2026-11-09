import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {stationAutoAllows,stationAutoRecovery,stationAutoStep,stationAutoRoute} from '../src/station-autoplay.js';
import {makeAutoPatrol} from '../src/auto-play-patrol.js';

test('station autoplay covers platforms, tracks and both stairways, but excludes the map perimeter and gallery void',()=>{
  for(const side of [-1,1]){
    for(const x of [0,7,11.6,16,20])assert.equal(stationAutoAllows(side*x,10,0),true);
    for(const [z,y] of [[-16,0],[-20,2],[-24,4],[-26.6,4.98]])assert.equal(stationAutoAllows(side*5.8,z,y),true);
    assert.equal(stationAutoAllows(side*16,-29,4.98),true);
    assert.equal(stationAutoAllows(side*22,10,0),false);
    assert.equal(stationAutoAllows(side*16,-29,0),false);
  }
  assert.equal(stationAutoAllows(0,28,0),false);assert.equal(stationAutoAllows(0,-32,4.98),false);
  assert.equal(stationAutoAllows(0,-23,3),false);
});
test('returning from outside the AI envelope is allowed, movement farther out is rejected',()=>{
  const from={x:22,y:0,z:10},p=stationAutoRecovery(from.x,from.z,from.y);
  assert.ok(p.x<from.x);assert.equal(stationAutoStep(from,21.9,10,0),true);
  assert.equal(stationAutoStep(from,22.1,10,0),false);
  assert.equal(stationAutoStep({x:20,y:0,z:10},21.2,10,0),false);
});
test('authored station patrol includes the upper gallery and does not skip its waypoint from underneath',()=>{
  const route=stationAutoRoute((x,z)=>Math.max(0,(-z-16)*.47));
  assert.ok(route.some(p=>p.y===4.98));assert.ok(route.some(p=>p.x>0&&p.y>0&&p.y<4.7));
  assert.ok(route.some(p=>p.x<0&&p.y>0&&p.y<4.7));
  const world={autoPlayRoute:[{x:5.8,y:4.98,z:-28},{x:14,y:4.98,z:-29}]};
  const p=new T.Vector3(5.8,4.98,-26),patrol=makeAutoPatrol(world,p);
  assert.equal(patrol.goal.z,-28);p.set(5.8,0,-28);patrol.update(10,p);
  assert.equal(patrol.goal.z,-28);p.y=4.98;patrol.update(.1,p);assert.equal(patrol.goal.x,14);
});
