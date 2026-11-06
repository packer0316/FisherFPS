import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHuntNavigation,navigationRules as rules} from '../src/hunt-navigation.js';

const box=(x0,x1,y0,y1,z0,z1)=>({min:{x:x0,y:y0,z:z0},max:{x:x1,y:y1,z:z1}});
function world(terrainHeight=()=>0,colliders=[]) {
  return {navigationBounds:{x:12,z:12},terrainHeight,colliders,
    blocked(x,z,r,feet,body,step=0){
      return Math.abs(x)>12-r||Math.abs(z)>12-r||terrainHeight(x,z,feet)>feet+step||
        colliders.some(b=>x>b.min.x-r&&x<b.max.x+r&&z>b.min.z-r&&z<b.max.z+r&&b.max.y>feet+.002&&b.min.y<feet+body-.002);
    }};
}
function actor(nav,x,y,z) {
  return {alive:true,entry:null,phase:.4,pace:1.2,height:2.35,groundY:y+.015,
    root:{position:{x,y:y+.015,z},rotation:{y:0}},nav:nav.createState()};
}
function travel(w,from,goal,seconds=30,hz=60) {
  const nav=makeHuntNavigation(w),e=actor(nav,...from),trace=[];
  let jumps=0,wasAir=false,maxStep=0;
  for(let i=0;i<seconds*hz;i++) {
    nav.update();const before={...e.root.position};
    const motion=nav.move(e,goal,1/hz,1.2,.6,[e]);
    if(motion==='air'&&!wasAir)jumps++;
    wasAir=motion==='air';
    const p=e.root.position;
    assert.equal(w.blocked(p.x,p.z,rules.radius,p.y,rules.height,0),false,'body intersects solid');
    maxStep=Math.max(maxStep,Math.hypot(p.x-before.x,p.z-before.z));
    trace.push({...p,motion});
  }
  return {nav,e,trace,jumps,maxStep};
}
const reached=(e,goal)=>Math.hypot(e.root.position.x-goal.x,e.root.position.z-goal.z)<.7&&Math.abs(e.root.position.y-goal.y)<.25;
test('goes around a tall wall instead of oscillating against it',()=>{
  const goal={x:4,y:0,z:0},r=travel(world(undefined,[box(-.5,.5,0,4,-3,3)]),[-4,0,0],goal);
  assert.ok(reached(r.e,goal),JSON.stringify({position:r.e.root.position,cursor:r.e.nav.cursor,path:r.e.nav.path.map(s=>[s.node.x,s.node.z,s.jump]),queued:r.e.nav.queued,stuck:r.e.nav.stuck}));
  assert.ok(r.trace.some(p=>Math.abs(p.z)>3.4));
});
test('jumps onto a raised terrace without walking inside its side',()=>{
  const goal={x:3,y:1.2,z:0},r=travel(world(x=>x>=0?1.2:0),[-3,0,0],goal);
  assert.ok(reached(r.e,goal));assert.ok(r.jumps>0);assert.ok(r.maxStep<.15);
});
test('uses actual crate top as a standing floor',()=>{
  const goal={x:0,y:1.26,z:0},r=travel(world(undefined,[box(-1.3,1.3,0,1.26,-1.3,1.3)]),[-4,0,0],goal);
  assert.ok(reached(r.e,goal));assert.ok(r.jumps>0);assert.ok(r.trace.slice(-60).every(p=>p.y>1.26));
});
test('walks up shallow stairs, retaining a continuous route',()=>{
  const terrain=x=>x<0?0:Math.min(10,Math.floor(x/.6)+1)*.17;
  const goal={x:7,y:1.7,z:0},r=travel(world(terrain),[-2,0,0],goal);
  assert.ok(reached(r.e,goal));assert.equal(r.jumps,0);
});
test('descending from a ledge follows an arc, not an instant height reset',()=>{
  const goal={x:3,y:0,z:0},r=travel(world(x=>x<0?1.2:0),[-3,1.2,0],goal);
  assert.ok(reached(r.e,goal));assert.ok(r.jumps>0);
  assert.ok(r.trace.some(p=>p.motion==='air'&&p.y>.1&&p.y<1.1));
});
test('rejects a jump when the overhead slab leaves no headroom',()=>{
  const w=world(x=>x>=0?1.2:0,[box(-12,12,2.6,3,-12,12)]);
  const r=travel(w,[-3,0,0],{x:3,y:1.2,z:0},12);
  assert.equal(r.jumps,0);assert.ok(r.e.root.position.x<0);
});
test('bridge street and upper deck are distinct layers',()=>{
  const terrain=(x,z,y=Infinity)=>Math.abs(x)<2&&Math.abs(z)<5&&y>=2.65?3:0;
  const w=world(terrain,[box(-2,2,2.57,3,-5,5)]),goal={x:0,y:0,z:-7};
  const r=travel(w,[0,0,7],goal,30);
  assert.ok(reached(r.e,goal));assert.equal(r.jumps,0);assert.ok(r.trace.every(p=>p.y<.03));
});
test('reset discards queued searches and airborne state for pooled respawns',()=>{
  const nav=makeHuntNavigation(world(x=>x>=0?1.2:0)),e=actor(nav,-2,0,0),goal={x:3,y:1.2,z:0};
  for(let i=0;i<250&&!e.nav.travel;i++){nav.update();nav.move(e,goal,1/60,1.2,.6,[e]);}
  assert.ok(e.nav.travel);
  e.nav.chasing=true;Object.assign(e.nav.playerTarget,goal);
  nav.reset(e);
  assert.equal(e.nav.queued,false);assert.equal(e.nav.travel,null);assert.equal(e.nav.path.length,0);
  assert.equal(e.nav.chasing,false);assert.deepEqual(e.nav.playerTarget,{x:0,y:0,z:0});
});
test('gravity motion stays stable at different update rates',()=>{
  for(const hz of [30,60,120]) {
    const goal={x:3,y:1.2,z:0},r=travel(world(x=>x>=0?1.2:0),[-3,0,0],goal,20,hz);
    assert.ok(reached(r.e,goal));assert.ok(r.jumps>0);
  }
});
test('a group shares the planner and goes around cover without crowd deadlock',()=>{
  const w=world(undefined,[box(-.5,.5,0,4,-3,3)]),nav=makeHuntNavigation(w);
  const crowd=Array.from({length:12},(_,i)=>actor(nav,-5-Math.floor(i/4)*1.3,0,-2+(i%4)*1.3));
  const goal={x:6,y:0,z:0};
  for(let i=0;i<60*60;i++) {
    nav.update();
    for(const e of crowd) {
      nav.move(e,goal,1/60,1.2,2.4,crowd);
      const p=e.root.position;
      assert.equal(w.blocked(p.x,p.z,.4,p.y,2.35,0),false);
    }
  }
  assert.ok(crowd.every(e=>Math.hypot(e.root.position.x-goal.x,e.root.position.z-goal.z)<2.5),
    JSON.stringify(crowd.map(e=>e.root.position)));
});
test('changing the target abandons a stale route instead of returning to its start',()=>{
  const w=world(undefined,[box(-.5,.5,0,4,-3,3)]),nav=makeHuntNavigation(w),e=actor(nav,-4,0,0);
  let goal={x:4,y:0,z:0};
  for(let i=0;i<90;i++){nav.update();nav.move(e,goal,1/60,1.2,.6,[e]);}
  goal={x:-6,y:0,z:-5};
  for(let i=0;i<900;i++){nav.update();nav.move(e,goal,1/60,1.2,.6,[e]);}
  assert.ok(reached(e,goal));assert.equal(e.nav.queued,false);
});
test('an isolated high target settles at a reachable point without spinning',()=>{
  const w=world(undefined,[box(-1,1,0,6,-1,1)]),goal={x:0,y:6,z:0};
  const r=travel(w,[-4,0,0],goal,30);
  assert.ok(r.e.root.position.y<.03);
  const last=r.trace.slice(-60);
  assert.ok(last.every(p=>Math.hypot(p.x-last[0].x,p.z-last[0].z)<.05));
});
