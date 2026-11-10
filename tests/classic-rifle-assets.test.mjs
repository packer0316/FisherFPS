import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classicRifles} from '../src/rifle-specs.js';
import {clips} from '../src/audio-manifest.js';

test('all new rifle assets provide animated assemblies, grip/sight markers and texture maps',()=>{
 for(const id of Object.keys(classicRifles)){
  const data=readFileSync(new URL(`../public/viewmodel/${id}.glb`,import.meta.url));
  assert.equal(data.readUInt32LE(0),0x46546c67,id);
  const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
  for(const name of ['ClassicBody','Magazine','ChargingHandle','Muzzle','EjectionPort','SupportGrip','RailContact']){
   const node=gltf.nodes.find(n=>n.name===name);assert.ok(node,`${id}: ${name}`);
   if(['ClassicBody','Magazine','ChargingHandle'].includes(name))assert.ok(node.children?.length,`${id}: empty ${name}`);
   if(name==='Magazine')assert.ok(Math.hypot(...(node.translation??[0,0,0]))>.15,`${id}: magazine grip pivot`);
  }
  assert.ok(gltf.images.length>0,`${id}: textured model`);
  assert.equal(gltf.nodes.some(n=>n.name==='FPArms'),false,`${id}: source arms excluded`);
  for(let i=1;i<=3;i++)assert.ok(clips[`weapons/${id}_fire_${i}`],`${id}: shot ${i}`);
 }
});
