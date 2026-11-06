
// Shared by both bosses. Amounts are apportioned exactly once, in integer coins.
export const bossCoinCadence=.03;
export const bossCollectCadence=.045;
export const bossCoinFlight=.6;

export function makeBossCoinPlan(origin,world,amount,count=50+Math.floor(Math.random()*101),random=Math.random) {
  count=Math.max(50,Math.min(150,Math.round(count)));
  const bigCount=Math.round(count/5),points=[];
  const phase=random()*Math.PI*2,golden=Math.PI*(3-Math.sqrt(5));
  const bounds=world.navigationBounds??{x:22,z:28};
  const randomOffset=random()*500;
  let weight=0;
  for(let i=0;i<count;i++) {
    // Distribute big coins throughout the shower, instead of one overlapping cluster.
    const big=Math.floor((i+1)*bigCount/count)>Math.floor(i*bigCount/count);
    const radius=big?.68:.37;
    let point;
    for(let j=0;j<16000;j++) {
      const n=i*31+j+randomOffset;
      const angle=phase+n*golden;
      const distance=2.1+Math.sqrt(random())*12;
      const x=origin.x+Math.cos(angle)*distance,z=origin.z+Math.sin(angle)*distance;
      if(Math.abs(x)>bounds.x-radius-.4||Math.abs(z)>bounds.z-radius-.4)continue;
      const y=world.terrainHeight(x,z,origin.y);
      if(world.blocked(x,z,radius,y+.04,.6,.2))continue;
      if(points.some(p=>(x-p.x)**2+(z-p.z)**2<(radius+p.radius)**2))continue;
      point={x,y,z,radius,big,index:i,delay:i*bossCoinCadence,high:4.6+random()*3.2};
      break;
    }
    // Broad bounded arena fallback; never collapse rejected locations onto the boss.
    if(!point) {
      for(let z=-bounds.z+1;z<bounds.z-1&&!point;z+=.8)for(let x=-bounds.x+1;x<bounds.x-1;x+=.8) {
        const y=world.terrainHeight(x,z,origin.y);
        if(world.blocked(x,z,radius,y+.04,.6,.2)||points.some(p=>(x-p.x)**2+(z-p.z)**2<(radius+p.radius)**2))continue;
        point={x,y,z,radius,big,index:i,delay:i*bossCoinCadence,high:5+random()*2.8};break;
      }
    }
    if(!point)throw new Error('BOSS payout has insufficient clear floor space');
    weight+=big?5:1;points.push(point);
  }
  let cumulative=0,paid=0;
  for(const p of points) {
    cumulative+=p.big?5:1;
    const subtotal=Math.floor(amount*cumulative/weight);
    p.value=subtotal-paid;paid=subtotal;
  }
  return {points,count,bigCount,amount,revealAt:(count-1)*bossCoinCadence+.95,
    collectDuration:(count-1)*bossCollectCadence+bossCoinFlight};
}

// Completion requires actual arrivals as well as the count-up reaching its end.
export function makeBossPayout(amount,count) {
  const received=new Set();
  let elapsed=0,credited=0,display=1,phase='scatter';
  const duration=(count-1)*bossCollectCadence+bossCoinFlight;
  return {
    reveal(){if(phase==='scatter')phase='collect';},
    receive(id,value) {
      if(phase!=='collect'||received.has(id))return 0;
      received.add(id);const gain=Math.max(0,Math.min(value,amount-credited));
      credited+=gain;return gain;
    },
    update(dt) {
      if(phase!=='collect')return;
      elapsed+=dt;
      // A steady initial roll followed by a gentle deceleration.
      const t=Math.min(1,elapsed/duration),ease=1-(1-t)**1.35;
      display=Math.min(amount,Math.max(1,Math.floor(1+(amount-1)*ease)));
      if(t===1&&received.size===count&&credited===amount){display=amount;phase='done';}
    },
    get phase(){return phase;},get display(){return display;},get credited(){return credited;},
    get collected(){return received.size;},amount,count,
  };
}
