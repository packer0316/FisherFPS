
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLookInput,requestRawPointerLock,lookInputRules} from './look-input.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('fresh high-polling input and deliberate fast flicks retain exact sensitivity',()=>{
  const q=makeLookInput();
  for(let i=0;i<128;i++)q.add(4,-1,.002,100+i*.12,100+i*.12);
  const v=q.take(116,16);
  close(v.x,1.024);close(v.y,-.256);close(v.rawX,512);
  close(q.take(132,16).x,0);
  q.add(1700,0,.002,140,140);close(q.take(148,16).x,3.4);
});
test('a stalled frame cannot apply a large accumulated turn or replay overflow later',()=>{
  const q=makeLookInput();
  q.add(1500,900,.002,200,200);
  const v=q.take(201,180);
  close(Math.hypot(v.x,v.y),lookInputRules.maxRecoveryAngle);
  close(v.x/v.y,1500/900);
  close(q.take(217,16).x,0);
  // A coalesced event may arrive one frame later than the stalled presentation.
  q.add(1500,0,.002,218,218);close(q.take(225,16).x,.18);
  close(q.take(241,16).x,0);
  q.add(1500,0,.002,250,250);close(q.take(257,16).x,3);
});
test('discard stale queued events and pre-pause input without losing recent movement',()=>{
  const q=makeLookInput();
  assert.equal(q.add(900,0,.002,10,200),false);
  q.add(300,0,.002,120,120);q.add(2,3,.002,220,220);
  const v=q.take(225,16);close(v.x,.004);close(v.y,.006);
  q.add(30,30,.002,230,230);q.clear(235);
  assert.equal(q.add(500,0,.002,234,240),false);
  close(q.take(250,16).x,0);
});
test('reject invalid events and wrap fixed input buckets without retaining old deltas',()=>{
  const q=makeLookInput();
  for(const value of [NaN,Infinity,-Infinity])assert.equal(q.add(value,0,.002,1,1),false);
  for(let i=0;i<2000;i++){q.add(1,0,.002,i*8,i*8);close(q.take(i*8+1,8).x,.002);}
});
test('raw pointer lock falls back only for unsupported raw input',async()=>{
  const options=[];const canvas={async requestPointerLock(option){
    options.push(option);if(option)throw new DOMException('Raw input unavailable','NotSupportedError');
  }};
  await requestRawPointerLock(canvas);assert.deepEqual(options,[{unadjustedMovement:true},undefined]);
  let calls=0;
  await assert.rejects(requestRawPointerLock({async requestPointerLock(){calls++;throw new DOMException('Denied','NotAllowedError');}}));
  assert.equal(calls,1);
});
