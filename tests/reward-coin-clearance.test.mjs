import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCoinFloor,clearCoinFloor} from '../src/reward-coin-clearance.js';

test('coin bottom and rotating edge clear flat floors and stair treads at every scale',()=>{
  for(const size of [.006,.012,.0008])for(const height of [-5,0,.1,3]){
    const p={x:0,y:height,z:0},floor=(x)=>x>.1?.18:0;
    clearCoinFloor(p,size,-43,44,0,floor);
    assert.ok(p.y-43*size>=.035-1e-10);
    if(size*44>.1)assert.ok(p.y-43*size>=.215-1e-10);
  }
});
test('gallery slab supports descending coins while coins below it keep the ground layer',()=>{
  const slab={min:{x:-18,y:4.7,z:-32},max:{x:18,y:4.98,z:-26.5}};
  const sample=makeCoinFloor({colliders:[slab],terrainHeight:()=>0});
  assert.equal(sample(0,-29,5),4.98);assert.equal(sample(0,-29,.5),0);
  const p={x:0,y:1,z:-29};clearCoinFloor(p,.012,-43,44,5,sample);
  assert.ok(p.y-.012*43>=5.015-1e-10);
});
test('moving train hulls are not cached as floors; the actual cabin floor is queried live',()=>{
  const hull={min:{x:10,y:-.8,z:-24},max:{x:13,y:3.45,z:24}};
  let cabin=.34;const sample=makeCoinFloor({colliders:[hull],trains:[{collider:hull}],terrainHeight:()=>0,coinFloor:()=>cabin});
  assert.equal(sample(11,0,4),.34);cabin=-Infinity;assert.equal(sample(11,0,4),0);
});
