
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {makeBossHazards,containsBossHazard,clipBossLane} from './boss-hazards.js';

test('a fissure reaches the far end later, with no whole-lane instant damage',()=>{
  const h=makeBossHazards(new T.Scene());
  const z=h.mark(0,{shape:'line',x:0,z:0,dx:0,dz:1,width:4,length:24,duration:1,steps:8},1.5);
  let hits=0;const segments=[];
  const hit=(wave,c)=>{segments.push(c.z);if(!wave.hit&&containsBossHazard(c,{x:0,z:21})){wave.hit=true;hits++;}};
  h.update(1.49,hit);assert.equal(segments.length,0);
  h.update(.02,hit);assert.equal(segments.length,1);assert.equal(hits,0);
  h.update(.5,hit);assert.equal(hits,0);
  h.update(.6,hit);assert.equal(hits,1);assert.equal(z.hit,true);
  assert.deepEqual(segments,[0,3,6,9,12,15,18,21]);
  h.update(5,hit);assert.equal(hits,1);
});
test('expanding ring never hits the safe centre and does not skip slices on a slow frame',()=>{
  const h=makeBossHazards(new T.Scene());let center=0,ring=0,contacts=0;
  h.mark(0,{x:3,z:6,radius:11,inner:4.3,duration:.85,steps:10},2);
  h.update(3,(_,c)=>{
    contacts++;if(containsBossHazard(c,{x:3,z:6}))center++;
    if(containsBossHazard(c,{x:10,z:6}))ring++;
  });
  assert.equal(contacts,10);assert.equal(center,0);assert.equal(ring,1);
});
test('both rotated sides and wall endpoints constrain a traveling lane',()=>{
  const lane=clipBossLane({x:4,z:0},{x:20,z:16},{x:22,z:28},6,38);
  assert.ok(lane.x+lane.dx*lane.length<=21.55+1e-6);
  const p={x:4+lane.dx*8,z:lane.dz*8};
  assert.equal(containsBossHazard({...lane,width:4},p),true);
  assert.equal(containsBossHazard({...lane,width:4},{x:p.x+lane.dz*2.1,z:p.z-lane.dx*2.1}),false);
});
test('cancelling inside an impact callback cancels remaining queued slices',()=>{
  const h=makeBossHazards(new T.Scene());let calls=0;
  h.mark(0,{x:0,z:0,radius:5,duration:.5,steps:6},1);
  h.update(3,()=>{calls++;h.clear();});
  assert.equal(calls,1);assert.ok(h.pool.every(z=>!z.active&&!z.mesh.visible));
  const z=h.mark(0,{x:1,z:1,radius:2},1);
  assert.equal(z.steps,1);assert.equal(z.duration,0);assert.equal(z.hit,false);
  assert.equal(z.uniforms.front.value,-1);
});
