import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { stationLightBudget } from '../src/station-light-budget.js';

function settle(budget,at,seconds=2){for(let t=0;t<seconds;t+=1/60)budget.update(1/60,at);}
function fixture(coarse=false){
  const scene=new T.Scene(),budget=stationLightBudget(scene,coarse),at=new T.Vector3();
  const sources=Array.from({length:16},(_,i)=>budget.add(0xffddbb,4,12,scene,new T.Vector3(i*5,1,0)));
  return {scene,budget,at,sources};
}

test('station light budget stays fixed as the player crosses distant lamps',()=>{
  for(const coarse of [false,true]){
    const {scene,budget,at}=fixture(coarse),lights=scene.children.filter(o=>o.isPointLight);
    assert.equal(lights.length,coarse?2:4);
    for(const x of [0,30,60,120,0]){
      at.x=x;settle(budget,at);
      assert.deepEqual(scene.children.filter(o=>o.isPointLight),lights,'no shader light-count changes or replacement lights');
      assert.ok(budget.slots.every(s=>s.light.intensity>=0&&s.light.intensity<=4));
      const selected=budget.slots.map(s=>s.target).filter(Boolean);
      assert.equal(new Set(selected).size,selected.length);
      if(x===120)assert.ok(budget.slots.every(s=>s.light.intensity<.001));
      else assert.ok(budget.slots.some(s=>s.light.intensity>3.9));
    }
  }
});

test('hidden train lights fade out and moving cabin anchors follow their parent',()=>{
  const scene=new T.Scene(),train=new T.Group();scene.add(train);
  const budget=stationLightBudget(scene,false),source=budget.add(0xffcc88,5,10,train,new T.Vector3(0,2,1));
  const at=new T.Vector3();settle(budget,at);
  const slot=budget.slots.find(s=>s.source===source);assert.ok(slot.light.intensity>4.9);
  train.position.set(2,0,-3);budget.update(1/60,at);
  assert.deepEqual(slot.light.position.toArray(),[2,2,-2]);
  train.visible=false;settle(budget,at);
  assert.equal(source.active,false);assert.ok(budget.slots.every(s=>s.light.intensity<.001));
  train.visible=true;settle(budget,at);assert.ok(budget.slots.some(s=>s.source===source&&s.light.intensity>4.9));
});

test('light reassignment fades before moving the bright light to another fitting',()=>{
  const {budget,at}=fixture();settle(budget,at);at.x=55;
  for(let i=0;i<180;i++){
    const before=budget.slots.map(s=>({source:s.source,intensity:s.light.intensity,position:s.light.position.clone()}));
    budget.update(1/60,at);
    budget.slots.forEach((s,j)=>{
      if(s.source!==before[j].source)assert.equal(s.light.intensity,0);
      if(s.light.position.distanceTo(before[j].position)>1)assert.ok(before[j].intensity<.08,'a distant anchor is only moved while dark');
    });
  }
  assert.ok(budget.slots.some(s=>s.light.intensity>3.9));
});
