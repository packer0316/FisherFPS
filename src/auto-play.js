import * as T from 'three';
import { makeHuntNavigation } from './hunt-navigation.js';
import { makeBallistic, makeGrenadeSweep, throwVelocity } from './grenade-physics.js';
import { hazardRisk, preferredAutoWeapon } from './auto-play-rules.js';
import { makeAutoPatrol } from './auto-play-patrol.js';

const v=()=>new T.Vector3();
const flatDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Candidate trajectories use the same gravity, swept collision and bounce code
// as a real grenade. Reject a wall-intercepted throw instead of spending a charge.
export function planAutoGrenade(origin,target,movement,sweep,fixedPower) {
  const delta=target.clone().sub(origin),range=Math.hypot(delta.x,delta.z);
  if(range<8||range>29)return null;
  const candidates=[],ground=makeGrenadeSweep({colliders:[],terrainHeight:()=>target.y-.1});
  for(const power of fixedPower===undefined?[0,.25,.5,.75,1]:[fixedPower]){
    for(let pitch=-.25;pitch<=1.1;pitch+=.09){
      const travel=range/(10+9*power),direction=delta.clone().addScaledVector(movement,-.65*travel);
      direction.y=0;direction.normalize().multiplyScalar(Math.cos(pitch));direction.y=Math.sin(pitch);
      // Cheap first pass includes gravity, fuse time and ground bounces. Solving
      // only the first ground contact systematically overshoots clustered mobs.
      const ball=makeBallistic(origin,throwVelocity(direction,power,movement),ground);ball.update(2.7);
      candidates.push({power,pitch,direction,error:ball.position.distanceTo(target)});
    }
  }
  candidates.sort((a,b)=>a.error-b.error);
  let best=null;
  for(const candidate of candidates.slice(0,8)){
    const direction=candidate.direction;
    const ball=makeBallistic(origin,throwVelocity(direction,candidate.power,movement),sweep);
    ball.update(2.7);
    const miss=ball.position.distanceTo(target);
    if(miss<4.8&&(!best||miss<best.miss))best={...candidate,direction,miss,landing:ball.position.clone()};
  }
  return best;
}

export function makeAutoPlayer(random=Math.random) {
  let active=false,config={order:[],grenades:true,supplies:true,maxShots:0};
  let world,navigation,sweep,actor,target=null,node=0,scanIn=0,moveIn=0,nodeIn=0,routeIn=0,grenadeIn=2;
  let time=0,stuck=0,shots=0,plan=null,primed=false,released=false,last=v(),goal=v();
  let patrol,detour=null,detourTime=0,trailIn=0;
  const trail=[];
  const aim=v(),probe=v(),direction=v(),momentum=v(),output={x:0,z:0,run:false,jump:false,crouch:false,weapon:null,fire:false,prime:false,release:false};
  let status='待命',trajectoryIn=0;
  function bind(value){
    world=value;navigation=makeHuntNavigation(world);sweep=makeGrenadeSweep(world);
    actor={root:new T.Group(),nav:navigation.createState(),alive:true,phase:0};
  }
  function stop(){active=false;target=plan=null;output.x=output.z=0;output.fire=output.prime=output.release=false;status='已停止';}
  function start(settings,context){
    stop();config={...config,...settings,order:[...settings.order]};if(!config.order.length)return false;
    if(world!==context.world)bind(context.world);else navigation.reset(actor);
    last.copy(context.position);momentum.set(0,0,0);shots=time=stuck=scanIn=moveIn=nodeIn=routeIn=0;grenadeIn=2;
    patrol=makeAutoPatrol(world,context.position,random()<.5?1:-1);detour=null;detourTime=trailIn=0;trail.length=0;
    primed=released=false;trajectoryIn=0;active=true;status='搜尋目標';return true;
  }
  function chooseTarget(c){
    let best=Infinity,fallback=null,fallbackScore=Infinity;target=null;
    for(const enemy of c.hunt.targets){
      const rank=config.order.indexOf(enemy.type.id);if(rank<0||!enemy.alive||enemy.opacity<.22)continue;
      const distance=flatDistance(c.position,enemy.root.position);
      const score=rank*1000+distance;
      if(score<fallbackScore){fallback=enemy;fallbackScore=score;}
      if(score>=best)continue;
      for(let n=0;n<enemy.aimNodes.length;n++){
        const index=(node+n)%enemy.aimNodes.length;
        if(c.hunt.canAimFrom(c.eye,enemy,probe,index)){target=enemy;node=index;best=score;break;}
      }
    }
    target??=fallback;
  }
  function chooseGoal(c){
    const p=c.position;
    goal.copy(patrol.goal);
    if(detour&&(!(c.pickups??[]).includes(detour)||time>detourTime||hazardRisk(c.hazards,detour.root.position)>.1))detour=null;
    if(config.supplies&&!detour){
      let best=Infinity;
      for(const slot of c.pickups??[]){
        const at=slot.root.position,d=flatDistance(at,p),urgent=slot.reward.kind==='heal'&&c.health<45;
        const forward=(at.x-p.x)*(goal.x-p.x)+(at.z-p.z)*(goal.z-p.z);
        if(d>(urgent?12:7)||(!urgent&&forward<0)||hazardRisk(c.hazards,at)>.1)continue;
        const score=d+(urgent?-8:slot.reward.kind==='mg3'&&preferredAutoWeapon(c.economy)!=='mg3'?-4:0);
        if(score<best){best=score;detour=slot;detourTime=time+4;}
      }
    }
    if(detour){goal.copy(detour.root.position);goal.y=detour.ground;}
  }
  function steer(c){
    const p=c.position,hazards=c.hazards??[];
    actor.root.position.copy(p);actor.root.position.y+=.015;
    const previousGoal=goal.clone();chooseGoal(c);
    const changed=flatDistance(previousGoal,goal)>2;
    if(changed)navigation.reset(actor);
    if(changed||routeIn<=0){
      routeIn=2;
      if(!navigation.canWalk(p,goal)&&(!actor.nav.path.length||stuck>.6||changed))navigation.request(actor,goal);
    }
    let destination=goal;
    const nav=actor.nav;
    while(nav.cursor<nav.path.length&&flatDistance(p,nav.path[nav.cursor].node)<.65)nav.cursor++;
    const leg=nav.path[nav.cursor];
    if(leg&&!navigation.canWalk(p,goal)){
      destination=leg.node;output.jump=leg.jump&&flatDistance(p,leg.node)<1.15&&c.grounded;output.crouch=output.jump;
      // Look through short A* edges to the next visible bend. Chasing every
      // 60 cm grid node causes the rapid left/right corrections seen in play.
      if(!leg.jump)for(let i=nav.cursor+1;i<nav.path.length;i++){
        const next=nav.path[i];if(next.jump||flatDistance(p,next.node)>8||!navigation.canWalk(p,next.node))break;
        destination=next.node;nav.cursor=i;
      }
    }
    const escaping=hazardRisk(hazards,p)>0;
    const safeRing=!escaping&&hazards.find(h=>h.active&&h.shape==='circle'&&h.inner>0&&
      h.age<h.delay+(h.duration??0)+.1&&Math.hypot(p.x-h.x,p.z-h.z)<h.inner-.65);
    const stride=safeRing ? .4 : 1,pace=(escaping?7.9:5.25)*stride;
    if(safeRing){
      // Every full-speed prediction exits a small hollow and looks dangerous;
      // endlessly choosing the opposite heading then produces a visible shimmy.
      // Circulate slowly inside the safe area until the next core warning.
      const angle=Math.atan2(p.z-safeRing.z,p.x-safeRing.x)+patrol.direction*.9,radius=Math.max(.4,safeRing.inner-1.3);
      direction.set(safeRing.x+Math.cos(angle)*radius-p.x,0,safeRing.z+Math.sin(angle)*radius-p.z).normalize();
    }else{direction.subVectors(destination,p);direction.y=0;direction.normalize();}
    let best=-Infinity,bx=0,bz=0;
    for(let i=0;i<24;i++){
      const angle=Math.PI*2*i/24+(stuck>.6?.18:0),dx=Math.cos(angle),dz=Math.sin(angle);
      const continuity=dx*momentum.x+dz*momentum.z;
      let score=(dx*direction.x+dz*direction.z)*5+continuity*2.2;
      if(!escaping&&stuck<.6)score-=Math.max(0,-continuity)*5;
      let y=p.y,clear=0,danger=0,avoid=0;
      for(let step=1;step<=12;step++){
        const ahead=step/12,x=p.x+dx*pace*ahead,z=p.z+dz*pace*ahead;
        const limits=world.verticalLimits(x,z,y,1.84),floor=limits.floor;
        if(world.blocked(x,z,.4,y,1.84,.24)||floor<y-.6||floor>y+.25){score-=28*(1-ahead);break;}
        y=floor;probe.set(x,y,z);clear=ahead;
        danger+=hazardRisk(hazards,probe,ahead);
        for(const enemy of c.hunt.targets){
          if(!enemy.alive)continue;
          const safe=enemy.boss?(enemy.bodyRadius??2.1)+3:2.7,d=flatDistance(probe,enemy.root.position);
          if(d<safe)avoid=Math.max(avoid,(safe-d)*(enemy.boss?8:4));
        }
      }
      if(clear<.25)continue;
      // Compare the average danger and closest enemy approach, not a sum that
      // accidentally rewards short, wall-blocked rays for sampling fewer mobs.
      score+=clear*2-danger/(clear*12)*36-avoid;
      // Discourage returning to the same few metres, while allowing an urgent
      // escape to override this soft preference through the hazard score.
      for(let n=0;n<trail.length-2;n++){
        const old=trail[n],d=Math.hypot(p.x+dx*pace*.7-old.x,p.z+dz*pace*.7-old.z);
        if(d<2.5)score-=(2.5-d)*1.5;
      }
      if(stuck>.6)score-=Math.max(0,dx*momentum.x+dz*momentum.z)*5;
      if(score>best){best=score;bx=dx;bz=dz;}
    }
    output.x=bx*stride;output.z=bz*stride;output.run=escaping||(!safeRing&&stuck>.6);
    momentum.set(bx,0,bz);
    if(output.run)status='閃避預警';else status=target?'繞場游擊 · '+target.type.name:'繞場搜尋';
  }
  function considerGrenade(c){
    if(!config.grenades||c.economy.ammo.grenade<=0||grenadeIn>0||hazardRisk(c.hazards,c.position)>0)return;
    grenadeIn=1.7;
    const selected=c.hunt.targets.filter(e=>e.alive&&e.opacity>=.22&&config.order.includes(e.type.id));
    let cluster=null,best=0;
    for(const enemy of selected){
      const p=enemy.root.position,d=flatDistance(p,c.position);if(d<9||d>26)continue;
      const nearby=selected.filter(e=>flatDistance(e.root.position,p)<5.5);
      const score=nearby.length+(enemy.boss?1:0);if(score<3||score<=best)continue;
      if(!c.hunt.canAimFrom(c.eye,enemy,probe,0))continue;
      cluster=p.clone();cluster.y+=.1;best=score;
    }
    if(!cluster)return;
    const trajectory=planAutoGrenade(c.eye,cluster,c.velocity,sweep);
    if(trajectory){plan={target:cluster,trajectory};primed=released=false;grenadeIn=7;trajectoryIn=0;}
  }
  function update(dt,c){
    Object.assign(output,{weapon:null,fire:false,prime:false,release:false,jump:false,crouch:false});
    if(!active)return output;
    if(c.economy.wallet<c.economy.bet||(config.maxShots>0&&shots>=config.maxShots)){stop();status=c.economy.wallet<c.economy.bet?'賞金不足，已停止':'已達射擊上限';return output;}
    time+=dt;scanIn-=dt;moveIn-=dt;nodeIn-=dt;routeIn-=dt;grenadeIn-=dt;
    patrol.update(dt,c.position,hazardRisk(c.hazards,c.position)>0);
    trailIn-=dt;if(trailIn<=0){trailIn=1;trail.push(c.position.clone());if(trail.length>12)trail.shift();}
    stuck=flatDistance(last,c.position)<dt*.5&&Math.hypot(output.x,output.z)>.2?stuck+dt:0;last.copy(c.position);
    if(nodeIn<=0){node=Math.floor(random()*3);nodeIn=.8+random()*.8;scanIn=0;}
    if(scanIn<=0){scanIn=.18;chooseTarget(c);}
    navigation.update();
    if(moveIn<=0){moveIn=.10;steer(c);}
    // A collected MG3 can equip itself during the pin animation. Abandon the
    // cancelled throw so it cannot leave the pilot waiting for a release forever.
    if(plan&&primed&&c.economy.weapon!=='grenade'){plan=null;primed=released=false;}
    if(plan){
      status='投擲手榴彈';
      trajectoryIn-=dt;
      if(trajectoryIn<=0&&!released){
        trajectoryIn=.15;
        const next=planAutoGrenade(c.eye,plan.target,c.velocity,sweep,plan.trajectory.power);
        if(next)plan.trajectory=next;
      }
      aim.copy(c.eye).addScaledVector(plan.trajectory.direction,30);
      if(c.economy.weapon!=='grenade'){output.weapon='grenade';return output;}
      if(!primed&&c.ready&&c.grenade.phase==='idle'){output.prime=true;primed=true;}
      if(primed&&!released&&(c.grenade.phase==='pin'||c.grenade.phase==='held')&&c.grenade.power>=plan.trajectory.power){output.release=true;released=true;}
      if(released&&c.grenade.phase==='idle'){plan=null;primed=released=false;output.weapon=preferredAutoWeapon(c.economy);}
      return output;
    }
    if(target)c.hunt.nodeAimPoint(target,node,aim);
    const preferred=preferredAutoWeapon(c.economy);
    if(c.economy.weapon!==preferred){output.weapon=preferred;return output;}
    considerGrenade(c);if(plan){output.weapon='grenade';return output;}
    if(target&&c.hunt.canAimFrom(c.eye,target,aim,node)){
      output.fire=true;status=output.run?'閃避 · '+target.type.name:'鎖定 '+target.type.name;
    }else if(target)c.hunt.nodeAimPoint(target,node,aim);
    return output;
  }
  return {start,stop,update,get enabled(){return active;},get target(){return target;},get aim(){return aim;},get status(){return status;},get shots(){return shots;},get controls(){return output;},get throwing(){return !!plan;},
    refreshAim(c){return !!target?.alive&&c.hunt.canAimFrom(c.eye,target,aim,node);},
    recordShot(){if(active)shots++;},
    launchDirection(origin,movement,power){
      if(!plan)return null;
      const refined=planAutoGrenade(origin,plan.target,movement,sweep,power);
      return refined?.direction??plan.trajectory.direction;
    },
  };
}
