
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBossCoinPlan,makeBossPayout } from './boss-payout.js';

const world={
  navigationBounds:{x:22,z:28},terrainHeight:()=>0,
  blocked(x,z,r){return Math.abs(x)+r>=22||Math.abs(z)+r>=28||
    (x+r>3&&x-r<6&&z+r>-9&&z-r<3);},
};
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
test('50–150 coins fit around central, wall and corner kills without overlapping cover or each other',()=>{
  for(const count of [50,99,150])for(const [x,z] of [[0,-4],[0,-12],[19,24],[-20,-24]]) {
    const plan=makeBossCoinPlan({x,y:0,z},world,12520,count,seeded(count));
    assert.equal(plan.points.length,count);
    assert.equal(plan.points.filter(p=>p.big).length,Math.round(count/5));
    assert.equal(plan.points.reduce((s,p)=>s+p.value,0),12520);
    for(let i=0;i<count;i++){
      const p=plan.points[i];assert.equal(world.blocked(p.x,p.z,p.radius),false);
      assert.ok(p.high>=4.6);
      for(let j=0;j<i;j++){const q=plan.points[j];assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=p.radius+q.radius);}
    }
    assert.ok(plan.revealAt>plan.points.at(-1).delay+.9);
  }
});
test('boss prize is not credited during scatter, duplicate arrivals cannot pay twice',()=>{
  const plan=makeBossCoinPlan({x:0,y:0,z:0},world,520,150,seeded(3)),payout=makeBossPayout(520,150);
  assert.equal(payout.receive(0,20),0);assert.equal(payout.credited,0);
  payout.update(30);assert.equal(payout.display,1);
  payout.reveal();assert.equal(payout.display,1);
  let wallet=0;
  for(const c of plan.points){wallet+=payout.receive(c.index,c.value);assert.equal(payout.receive(c.index,c.value),0);}
  assert.equal(wallet,520);assert.equal(payout.phase,'collect');
  payout.update(20);assert.equal(payout.phase,'done');assert.equal(payout.display,520);
  assert.equal(payout.receive(200,520),0);
});
test('count-up is monotone and completion waits for the final actual arrival',()=>{
  const p=makeBossPayout(12520,50);p.reveal();
  let previous=1;
  for(let i=0;i<90;i++){p.update(.06);assert.ok(p.display>=previous&&p.display<=12520);previous=p.display;}
  assert.equal(p.phase,'collect');assert.equal(p.display.toLocaleString('en-US'),'12,520');
  for(let i=0;i<49;i++)p.receive(i,250);
  p.update(.1);assert.equal(p.phase,'collect');
  p.receive(49,270);p.update(.1);assert.equal(p.phase,'done');assert.equal(p.credited,12520);
});
