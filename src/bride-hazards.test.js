
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {containsBrideHazard,makeBrideHazards} from './bride-hazards.js';

test('vow has a safe hollow, harmful ring and safe exterior',()=>{
 const ring={shape:'circle',x:7,z:-3,radius:11,inner:4.3};
 assert.equal(containsBrideHazard(ring,{x:7,z:-3}),false);
 assert.equal(containsBrideHazard(ring,{x:11.2,z:-3}),false);
 assert.equal(containsBrideHazard(ring,{x:11.4,z:-3}),true);
 assert.equal(containsBrideHazard(ring,{x:18.1,z:-3}),false);
 assert.equal(containsBrideHazard({...ring,radius:4.3,inner:0},{x:7,z:-3}),true);
});
test('procession lane follows its rotation and has bounded ends',()=>{
 const d=Math.SQRT1_2,z={shape:'line',x:2,z:4,dx:d,dz:d,width:2,length:10};
 assert.equal(containsBrideHazard(z,{x:2+d*5,z:4+d*5}),true);
 assert.equal(containsBrideHazard(z,{x:2+d*5+d*1.01,z:4+d*5-d*1.01}),false);
 assert.equal(containsBrideHazard(z,{x:2-d*.01,z:4-d*.01}),false);
 assert.equal(containsBrideHazard(z,{x:2+d*10.01,z:4+d*10.01}),false);
});
test('warning does no damage before contact and triggers exactly once, even across a long frame',()=>{
 const h=makeBrideHazards(new T.Scene());let hits=0;
 h.mark(0,{x:3,z:4,radius:3,inner:0,linger:.5},1.5);
 h.update(1.499,()=>hits++);assert.equal(hits,0);
 h.update(.2,()=>hits++);assert.equal(hits,1);
 h.update(.2,()=>hits++);assert.equal(hits,1);
 h.update(1,()=>hits++);assert.equal(hits,1);assert.equal(h.pool[0].mesh.visible,false);
 h.mark(0,{x:3,z:4,radius:3,inner:0,linger:.5},1.5);
 h.update(3,()=>hits++);assert.equal(hits,2);
 h.clear();assert.equal(h.pool.filter(x=>x.active).length,0);
});
test('reused telegraph slots clear all prior timing and circle holes',()=>{
 const scene=new T.Scene(),h=makeBrideHazards(scene),mesh=h.pool[0].mesh;
 h.mark(0,{x:0,z:0,radius:11,inner:4.3},2);
 h.update(2.1,()=>{});h.clear();
 h.mark(0,{x:2,z:6,radius:3},1);
 assert.equal(h.pool[0].inner,0);assert.equal(h.pool[0].fired,false);
 assert.equal(h.pool[0].uniforms.impact.value,0);
 assert.equal(h.pool[0].mesh,mesh);assert.equal(scene.children.length,6);
});
