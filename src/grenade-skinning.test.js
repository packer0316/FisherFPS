import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { grenadeSkinning } from './grenade-skinning.js';

function fixture() {
  const bones=[new T.Bone(),new T.Bone()];
  const root=new T.Group();root.add(...bones);root.updateMatrixWorld(true);
  const mesh=new T.SkinnedMesh(new T.BufferGeometry(),new T.MeshStandardMaterial());
  mesh.skeleton=new T.Skeleton(bones);
  grenadeSkinning(mesh);
  const shader={uniforms:{},vertexShader:''};mesh.material.onBeforeCompile(shader);
  const update=()=>{root.updateMatrixWorld(true);mesh.skeleton.update();mesh.onBeforeRender();};
  return {bones,root,mesh,uniforms:shader.uniforms,update};
}

// Decode the GPU palette as a rigid transform, to compare it with three.js's
// independently calculated matrix path (including a scaled viewmodel parent).
function applyPalette(data,index,point,scale) {
  const real=new T.Quaternion().fromArray(data,index*8).normalize();
  const dual=new T.Quaternion().fromArray(data,index*8+4).multiply(real.clone().conjugate());
  return point.clone().multiplyScalar(scale).applyQuaternion(real)
    .add(new T.Vector3(dual.x,dual.y,dual.z).multiplyScalar(2));
}

test('grenade palette preserves rigid transforms and responsive parent scale',()=>{
  const f=fixture();
  for(const size of [.38,.63,1.18]){
    f.root.scale.setScalar(size);f.root.position.set(.3,-.2,-.7);
    f.bones[0].position.set(-.14,.21,-.33);
    f.bones[0].rotation.set(.8,-1.2,.6);
    f.update();
    const data=f.uniforms.grenadeBones.value.image.data;
    const point=new T.Vector3(.04,.12,.02);
    const expected=point.clone().applyMatrix4(f.bones[0].matrixWorld);
    const actual=applyPalette(data,0,point,f.uniforms.grenadeRigScale.value);
    assert.ok(actual.distanceTo(expected)<1e-6);
  }
});

test('opposing forearm rotations retain radius instead of collapsing the wrist',()=>{
  const f=fixture();f.bones[0].rotation.y=Math.PI/2;f.bones[1].rotation.y=-Math.PI/2;f.update();
  const data=f.uniforms.grenadeBones.value.image.data;
  const a=new T.Quaternion().fromArray(data,0),b=new T.Quaternion().fromArray(data,8);
  const rotation=new T.Quaternion(a.x+b.x,a.y+b.y,a.z+b.z,a.w+b.w).normalize();
  const radius=new T.Vector3(.04,0,0);
  const blended=radius.clone().applyQuaternion(rotation);
  const linear=radius.clone().applyMatrix4(f.bones[0].matrixWorld)
    .lerp(radius.clone().applyMatrix4(f.bones[1].matrixWorld),.5);
  assert.ok(Math.abs(blended.length()-.04)<1e-7);
  assert.ok(linear.length()<1e-7);
});

test('animation reuses the palette and material disposal releases its texture',()=>{
  const f=fixture(),texture=f.uniforms.grenadeBones.value,data=texture.image.data;
  f.update();const first=Array.from(data);
  f.bones[0].rotation.x=.7;f.update();
  assert.equal(texture.image.data,data);assert.notDeepEqual(Array.from(data),first);
  let disposed=false;texture.addEventListener('dispose',()=>{disposed=true;});
  f.mesh.material.dispose();assert.equal(disposed,true);
});
