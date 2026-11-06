
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {makeAnimatedRaycast} from './animated-raycast.js';

function actor(geometry) {
  const root=new T.Group(),mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
  const b0=new T.Bone(),b1=new T.Bone();b0.add(b1);b1.position.y=1;
  mesh.add(b0);mesh.bind(new T.Skeleton([b0,b1]));root.add(mesh);
  return {root,mesh,b1,cast:makeAnimatedRaycast(root)};
}
function skin() {
  const geometry=new T.BoxGeometry(2,4,1,5,8,2),n=geometry.attributes.position.count;
  const indices=new Uint16Array(n*4),weights=new Float32Array(n*4);
  for(let i=0;i<n;i++){
    const t=T.MathUtils.clamp((geometry.attributes.position.getY(i)+1)/2,0,1);
    indices[i*4+1]=1;weights[i*4]=1-t;weights[i*4+1]=t;
  }
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  return geometry;
}
test('posed BVH matches native triangle hits through bone animation and world transforms',()=>{
  const a=actor(skin()),ray=new T.Raycaster();ray.firstHitOnly=true;
  for(let pose=0;pose<5;pose++){
    a.b1.rotation.z=pose*.23;a.root.position.set(1,.4,-2);a.root.scale.set(1.2,1.4,.9);a.root.rotation.y=.35;
    a.root.updateMatrixWorld(true);
    for(let x=-4;x<=5;x+=.25){
      ray.set(new T.Vector3(x,.7,8),new T.Vector3(0,0,-1));
      const original=[],fast=[];a.mesh.computeBoundingSphere();a.mesh.raycast(ray,original);original.sort((a,b)=>a.distance-b.distance);
      a.cast(ray,fast);fast.sort((a,b)=>a.distance-b.distance);
      assert.equal(!!fast.length,!!original.length);
      if(fast.length){assert.ok(fast[0].point.distanceTo(original[0].point)<1e-5);assert.equal(fast[0].object,a.mesh);}
    }
  }
});
test('shared geometry keeps independent animated poses and skins each vertex at most once per cast',()=>{
  const geometry=skin(),originalIndex=Array.from(geometry.index.array);
  const a=actor(geometry),b=actor(geometry),ray=new T.Raycaster(new T.Vector3(1,0,5),new T.Vector3(0,0,-1));
  ray.firstHitOnly=true;a.b1.rotation.z=.8;b.b1.rotation.z=-.5;
  a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
  const calls=new Map(),get=a.mesh.getVertexPosition;
  a.mesh.getVertexPosition=function(i,v){calls.set(i,(calls.get(i)??0)+1);return get.call(this,i,v);};
  a.cast(ray,[]);assert.ok([...calls.values()].every(n=>n===1));
  const first=[],second=[],again=[];a.cast(ray,first);b.cast(ray,second);a.cast(ray,again);
  assert.deepEqual(first.map(h=>h.point.toArray()),again.map(h=>h.point.toArray()));
  assert.deepEqual(Array.from(geometry.index.array),originalIndex);
});
