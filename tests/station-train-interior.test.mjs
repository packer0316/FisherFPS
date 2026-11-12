import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createTrainInterior } from '../src/station-train-interior.js';
import { cabinLayout } from '../src/station-transit.js';

function fixture(coarse=false){
  const attach=createTrainInterior({detail:{coarse},leatherDetail:{coarse}});
  const group=new T.Group(),zones=[],lights=[];
  const solids=attach(group,zones,{add(...args){lights.push(args)}});
  group.updateMatrixWorld(true);return {attach,group,zones,lights,solids};
}

for(const coarse of [false,true])test(`refined carriage leaves the aisle and both doorways open (${coarse?'mobile':'desktop'})`,()=>{
  const {group,solids}=fixture(coarse),ray=new T.Raycaster();
  for(const z of cabinLayout.doors)for(const offset of [-.45,0,.45])for(const y of [.46,1.3,1.9]){
    ray.set(new T.Vector3(-1.95,y,z+offset),new T.Vector3(1,0,0));ray.far=3.9;
    assert.equal(ray.intersectObject(group,true).length,0,'the decorative fitout must not cross a usable doorway');
  }
  ray.set(new T.Vector3(0,1.75,6),new T.Vector3(0,0,-1));ray.far=12.8;
  assert.equal(ray.intersectObject(group,true).length,0,'the eye-height centre aisle stays open');
  for(const z of [-6,-3.3743,-.3,2.7876,5.8]){
    ray.set(new T.Vector3(0,1,z),new T.Vector3(0,-1,0));ray.far=2;
    assert.ok(Math.abs(ray.intersectObject(group,true)[0].point.y-.14)<.006,'floor matches the existing .2m train offset + .14m liner');
  }
  assert.equal(solids.length,10);
  for(let z=-6.5;z<6;z+=.1)assert.ok(solids.every(b=>!(b.min.x<.32&&b.max.x>-.32&&z>b.min.z-.32&&z<b.max.z+.32)));
});

test('carriage materials and geometry are shared while colliders stay independent',()=>{
  const {attach,group,lights,solids}=fixture(),other=new T.Group(),zones=[];
  const otherSolids=attach(other,zones,{add(){}});
  assert.equal(lights.length,2,'uses existing light-budget anchors, not additional real lights');
  group.children.forEach((mesh,i)=>{
    assert.equal(mesh.geometry,other.children[i].geometry);
    assert.equal(mesh.material,other.children[i].material);
  });
  otherSolids[0].translate(new T.Vector3(100,0,0));assert.ok(solids[0].max.x<2);
  assert.equal(group.children.filter(o=>o.isLight).length,0);
});

test('close-up fitout stays inside its geometry and texture budget',()=>{
  for(const coarse of [false,true]){
    const {group}=fixture(coarse);let triangles=0;
    assert.ok(group.children.length<=13,'one merged mesh per material');
    for(const mesh of group.children){
      const g=mesh.geometry;triangles+=g.attributes.position.count/3;
      for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite));
      assert.ok(g.boundingBox.max.y<2.78,'trim remains under the source exterior roof');
    }
    assert.ok(triangles<(coarse?70000:130000),`unexpected geometry growth: ${triangles}`);
    const floor=group.children.find(o=>o.material.name==='cabin-rubber').material;
    assert.equal(floor.map.image.width,coarse?256:512);
    assert.equal(floor.map.generateMipmaps,true,'filter the flecks when moving away');
  }
});
