// Layered, lazily sampled navigation shared by the whole crowd. Each grid cell
// can contain street, bridge and prop-top floors. Cached edges include a swept
// body/head test; a route can never connect the bridge to the street by accident.
export const navigationRules = Object.freeze({
  cell: .6, radius: .40, height: 2.35, step: .25, jumpUp: 1.32, drop: 3.25,
  gravity: 9.81, frameBudgetMs: 2, expansionsPerFrame: 80, searchLimit: 6000,
});
const {cell, radius, height, step, gravity}=navigationRules;
const skin=.015;
const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const probes=[[radius*.9,0],[-radius*.9,0],[0,radius*.9],[0,-radius*.9]];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const smooth=t=>t*t*(3-2*t);

export function makeHuntNavigation(world) {
  const bounds=world.navigationBounds??{x:63,z:55};
  const nx=Math.ceil(bounds.x*2/cell),nz=Math.ceil(bounds.z*2/cell);
  const cells=new Array(nx*nz),nodes=[],queue=[];
  // Prop tops must be queryable independently of terrainHeight, also in prison.
  const buckets=new Map(),bucketSize=4,empty=[];
  for(const box of world.colliders) {
    for(let z=Math.floor((box.min.z-radius-.2)/bucketSize);z<=Math.floor((box.max.z+radius+.2)/bucketSize);z++)
      for(let x=Math.floor((box.min.x-radius-.2)/bucketSize);x<=Math.floor((box.max.x+radius+.2)/bucketSize);x++) {
        const key=x+z*1024;
        if(!buckets.has(key))buckets.set(key,[]);
        buckets.get(key).push(box);
      }
  }
  const nearby=(x,z)=>buckets.get(Math.floor(x/bucketSize)+Math.floor(z/bucketSize)*1024)??empty;
  const contains=(b,x,z)=>x>=b.min.x-.001&&x<=b.max.x+.001&&z>=b.min.z-.001&&z<=b.max.z+.001;
  function floorAt(x,z,feet) {
    let y=world.terrainHeight(x,z,feet);
    for(const b of nearby(x,z))
      if(contains(b,x,z)&&b.max.y<=feet+.002)y=Math.max(y,b.max.y);
    return y;
  }
  function clear(x,y,z) {
    if(world.blocked(x,z,radius,y+skin,height,0))return false;
    // Terrain risers are rendered faces rather than Box3s. Test the footprint,
    // so a torso cannot enter the side of a raised terrace or a ramp.
    for(const [dx,dz] of probes)
      if(world.terrainHeight(x+dx,z+dz,y+skin)>y+step+.002)return false;
    return true;
  }
  function getCell(ix,iz) {
    if(ix<0||iz<0||ix>=nx||iz>=nz)return empty;
    const key=ix+iz*nx;
    if(cells[key])return cells[key];
    const x=-bounds.x+(ix+.5)*cell,z=-bounds.z+(iz+.5)*cell;
    const levels=[world.terrainHeight(x,z,-Infinity),world.terrainHeight(x,z,Infinity)];
    for(const b of nearby(x,z))
      if(contains(b,x,z)&&b.max.y<8)levels.push(b.max.y);
    levels.sort((a,b)=>a-b);
    const result=cells[key]=[];
    let previous=-Infinity;
    for(const y of levels) {
      if(y-previous<.025)continue;
      previous=y;
      if(!clear(x,y,z))continue;
      const node={id:nodes.length,x,y,z,ix,iz,edges:null};
      nodes.push(node);result.push(node);
    }
    return result;
  }
  function sweptClear(ax,ay,az,bx,by,bz) {
    // Exact segment vs expanded solid prevents corner cutting between samples.
    for(const b of nearby((ax+bx)*.5,(az+bz)*.5)) {
      let enter=0,exit=1;
      for(let axis=0;axis<3;axis++) {
        const p=axis===0?ax:axis===1?ay:az;
        const d=(axis===0?bx:axis===1?by:bz)-p;
        const low=axis===0?b.min.x-radius:axis===1?b.min.y-height-.013:b.min.z-radius;
        const high=axis===0?b.max.x+radius:axis===1?b.max.y-.017:b.max.z+radius;
        if(Math.abs(d)<1e-9) {if(p<=low||p>=high){enter=2;break;}continue;}
        const t0=(low-p)/d,t1=(high-p)/d;
        enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
        if(enter>=exit)break;
      }
      if(enter<exit-1e-7)return false;
    }
    return true;
  }
  function canWalk(a,b) {
    const d=distance(a,b),steps=Math.max(1,Math.ceil(d/.18));
    let y=a.y,px=a.x,pz=a.z;
    for(let i=1;i<=steps;i++) {
      const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      const floor=floorAt(x,z,y+step);
      if(floor-y>step+.002||y-floor>.3||!clear(x,floor,z)||!sweptClear(px,y,pz,x,floor,z))return false;
      y=floor;px=x;pz=z;
    }
    return Math.abs(y-b.y)<.22;
  }
  function jumpSpec(a,b) {
    const dy=b.y-a.y;
    if(dy>navigationRules.jumpUp||dy < -navigationRules.drop||distance(a,b)>1.85)return null;
    const peak=Math.max(.32,dy+.40),v=Math.sqrt(2*gravity*peak);
    const duration=(v+Math.sqrt(v*v-2*gravity*dy))/gravity;
    // First gain clearance at a high ledge, then move over its lip. This avoids
    // dragging the feet through a crate during an upward jump.
    const delay=dy>step?(v-Math.sqrt(Math.max(0,v*v-2*gravity*(dy+.08))))/gravity:0;
    return {v,duration,delay,end:duration-.06};
  }
  function jumpPoint(a,b,j,t,out) {
    const u=smooth(Math.max(0,Math.min(1,(t-j.delay)/(j.end-j.delay))));
    out.x=a.x+(b.x-a.x)*u;out.z=a.z+(b.z-a.z)*u;
    out.y=t>=j.duration?b.y:a.y+j.v*t-.5*gravity*t*t;
    return out;
  }
  const sample={x:0,y:0,z:0};
  function canJump(a,b) {
    const j=jumpSpec(a,b);
    if(!j)return false;
    const count=Math.max(16,Math.ceil(j.duration/.035));
    let px=a.x,py=a.y,pz=a.z;
    for(let i=1;i<=count;i++) {
      jumpPoint(a,b,j,j.duration*i/count,sample);
      if(!clear(sample.x,sample.y,sample.z)||!sweptClear(px,py,pz,sample.x,sample.y,sample.z))return false;
      px=sample.x;py=sample.y;pz=sample.z;
    }
    return true;
  }
  function edges(node) {
    if(node.edges)return node.edges;
    const result=node.edges=[];
    for(const reach of [1,2])for(const [dx,dz] of directions)
      for(const next of getCell(node.ix+dx*reach,node.iz+dz*reach)) {
        const dy=next.y-node.y;
        if(dy>navigationRules.jumpUp||dy < -navigationRules.drop)continue;
        const walk=canWalk(node,next);
        if(walk) { if(reach===1)result.push({node:next,jump:false,cost:distance(node,next)}); }
        else if(canJump(node,next))
          result.push({node:next,jump:true,cost:distance(node,next)+3+Math.abs(dy)*2});
      }
    return result;
  }
  function nearest(p) {
    const ix=Math.floor((p.x+bounds.x)/cell),iz=Math.floor((p.z+bounds.z)/cell);
    let best=null,score=Infinity;
    for(let z=iz-2;z<=iz+2;z++)for(let x=ix-2;x<=ix+2;x++)
      for(const n of getCell(x,z)) {
        if(Math.abs(p.y-n.y)>.4)continue;
        const cost=distance(p,n)+Math.abs(p.y-n.y)*2;
        if(cost>=score||!canWalk(p,n))continue;
        score=cost;best=n;
      }
    return best;
  }
  // One reusable search workspace, one active job, bounded work each frame.
  // A moving target queues a new search without discarding a usable old route.
  let capacity=nx*nz*3,stamp=0,job=null;
  let seen=new Uint32Array(capacity),closed=new Uint32Array(capacity);
  let costs=new Float64Array(capacity),parents=new Int32Array(capacity),jumped=new Uint8Array(capacity);
  const heap=[],priorities=[];
  function grow(id) {
    if(id<capacity)return;
    capacity*=2;
    const copy=a=>{const b=new a.constructor(capacity);b.set(a);return b;};
    seen=copy(seen);closed=copy(closed);costs=copy(costs);parents=copy(parents);jumped=copy(jumped);
  }
  function push(id,priority) {
    let i=heap.length;heap.push(id);priorities.push(priority);
    while(i>0) {
      const parent=(i-1)>>1;
      if(priorities[parent]<=priority)break;
      heap[i]=heap[parent];priorities[i]=priorities[parent];i=parent;
    }
    heap[i]=id;priorities[i]=priority;
  }
  function pop() {
    const result=heap[0],id=heap.pop(),priority=priorities.pop();
    if(heap.length) {
      let i=0;
      while(i*2+1<heap.length) {
        let child=i*2+1;
        if(child+1<heap.length&&priorities[child+1]<priorities[child])child++;
        if(priority<=priorities[child])break;
        heap[i]=heap[child];priorities[i]=priorities[child];i=child;
      }
      heap[i]=id;priorities[i]=priority;
    }
    return result;
  }
  const heuristic=(a,b)=>distance(a,b)+Math.abs(a.y-b.y)*1.5;
  function finish(end,complete) {
    const n=job.actor.nav;
    n.path.length=0;n.cursor=0;
    if(end) {
      for(let at=end.id;at!==-1;at=parents[at])n.path.push({node:nodes[at],jump:!!jumped[at]});
      n.path.reverse();
      const p=job.actor.root.position,current={x:p.x,y:p.y-skin,z:p.z};
      let closest=1.6;
      for(let i=0;i<n.path.length;i++) {
        const node=n.path[i].node,d=distance(current,node);
        if(d<closest&&Math.abs(current.y-node.y)<.22&&canWalk(current,node)) {
          n.cursor=i;closest=d;
        }
      }
    }
    n.routeGoal={...job.goal};n.queued=false;n.retry=complete ? .85 : 3;
    n.stuck=0;job=null;
  }
  function startJob(actor) {
    const n=actor.nav,p=actor.root.position;
    if(!actor.alive||actor.entry||!n.queued||n.travel) {n.queued=false;return false;}
    const source=nearest({x:p.x,y:p.y-skin,z:p.z}),target=nearest(n.goal);
    job={actor,goal:{...n.goal},source,target,best:source,expanded:0};
    if(!source||!target){finish(null,false);return false;}
    stamp++;heap.length=priorities.length=0;
    grow(source.id);seen[source.id]=stamp;costs[source.id]=0;parents[source.id]=-1;jumped[source.id]=0;
    push(source.id,heuristic(source,target));return true;
  }
  function update() {
    const deadline=performance.now()+navigationRules.frameBudgetMs;
    for(let work=0;work<navigationRules.expansionsPerFrame;work++) {
      if(performance.now()>=deadline)break;
      if(!job) {
        if(!queue.length)break;
        if(!startJob(queue.shift()))continue;
      }
      if(!job.actor.alive||job.actor.entry||job.actor.nav.travel||!job.actor.nav.queued) {
        job.actor.nav.queued=false;job=null;continue;
      }
      if(!heap.length||job.expanded>=navigationRules.searchLimit){finish(job.best,false);continue;}
      const id=pop();
      if(closed[id]===stamp)continue;
      closed[id]=stamp;job.expanded++;
      const node=nodes[id];
      if(heuristic(node,job.target)<heuristic(job.best,job.target))job.best=node;
      if(node===job.target){finish(node,true);continue;}
      for(const edge of edges(node)) {
        const next=edge.node;grow(next.id);
        const g=costs[id]+edge.cost;
        if(closed[next.id]===stamp||seen[next.id]===stamp&&g>=costs[next.id])continue;
        seen[next.id]=stamp;costs[next.id]=g;parents[next.id]=id;jumped[next.id]=edge.jump?1:0;
        push(next.id,g+heuristic(next,job.target));
      }
    }
  }
  function createState() {
    return {path:[],cursor:0,queued:false,retry:0,routeGoal:null,goal:{x:0,y:0,z:0},
      direct:false,directIn:0,stuck:0,travel:null,landing:0,landDuration:.24,chasing:false,playerTarget:{x:0,y:0,z:0}};
  }
  function reset(actor) {
    const n=actor.nav;
    if(job?.actor===actor)job=null;
    const index=queue.indexOf(actor);if(index!==-1)queue.splice(index,1);
    n.path.length=0;n.cursor=0;n.queued=false;n.retry=n.directIn=n.stuck=n.landing=0;
    n.chasing=false;n.playerTarget.x=n.playerTarget.y=n.playerTarget.z=0;
    n.travel=n.routeGoal=null;n.direct=false;
  }
  function request(actor,goal) {
    const n=actor.nav;Object.assign(n.goal,goal);
    if(!n.queued){n.queued=true;if(!queue.includes(actor))queue.push(actor);}
  }
  function turn(actor,x,z,dt) {
    const p=actor.root.position,yaw=Math.atan2(x-p.x,z-p.z)-actor.root.rotation.y;
    actor.root.rotation.y+=Math.atan2(Math.sin(yaw),Math.cos(yaw))*Math.min(1,dt*5);
  }
  const from={x:0,y:0,z:0},to={x:0,y:0,z:0};
  function walkStep(actor,x,z) {
    const p=actor.root.position;
    from.x=p.x;from.y=p.y-skin;from.z=p.z;
    to.x=x;to.y=floorAt(x,z,from.y+step);to.z=z;
    if(!canWalk(from,to))return false;
    p.x=x;p.y=actor.groundY=to.y+skin;p.z=z;
    return true;
  }
  function move(actor,goal,dt,pace,stopDistance,crowd=empty) {
    const n=actor.nav,p=actor.root.position;
    n.retry=Math.max(0,n.retry-dt);n.directIn-=dt;
    if(n.travel) {
      const j=n.travel;
      j.time=Math.min(j.spec.duration,j.time+dt);
      jumpPoint(j.start,j.end,j.spec,j.time,p);
      actor.groundY=floorAt(p.x,p.z,p.y+.002)+skin;p.y+=skin;
      turn(actor,j.end.x,j.end.z,dt);
      if(j.time>=j.spec.duration) {
        p.y=actor.groundY=j.end.y+skin;
        n.travel=null;
        n.landing=n.landDuration=actor.actions?.stand_up?.getClip().duration??.24;
        n.cursor++;n.directIn=0;
        return 'land';
      }
      return 'air';
    }
    if(n.landing>0){n.landing=Math.max(0,n.landing-dt);return 'land';}
    if(!goal){n.direct=false;return 'idle';}
    from.x=p.x;from.y=p.y-skin;from.z=p.z;
    const d=distance(from,goal);
    if(n.directIn<=0) {
      n.direct=d<12&&canWalk(from,goal);
      n.directIn=.3+(actor.phase%1)*.1;
    }
    if(n.direct) {
      n.path.length=0;n.cursor=0;n.queued=false;
    }
    if(d<=stopDistance&&Math.abs(from.y-goal.y)<.4&&n.direct) {
      turn(actor,goal.x,goal.z,dt);return 'idle';
    }
    if(!n.direct && n.retry<=0 && (!n.routeGoal||distance(goal,n.routeGoal)>1.4||
      Math.abs(goal.y-n.routeGoal.y)>.4||n.cursor>=n.path.length||n.stuck>.6))request(actor,goal);
    let target=goal,leg=null;
    if(!n.direct) {
      while(n.cursor<n.path.length) {
        leg=n.path[n.cursor];
        if(distance(from,leg.node)>.09||Math.abs(from.y-leg.node.y)>.22)break;
        n.cursor++;
      }
      leg=n.path[n.cursor];
      if(!leg)return 'idle';
      target=leg.node;
      if(leg.jump) {
        if(canJump(from,target)) {
          n.travel={start:{...from},end:{x:target.x,y:target.y,z:target.z},spec:jumpSpec(from,target),time:0};
          n.stuck=0;return 'air';
        }
        n.path.length=0;n.cursor=0;n.retry=0;return 'idle';
      }
    }
    const remaining=distance(from,target);
    if(remaining<.001)return 'idle';
    const desiredStop=Math.abs(from.y-goal.y)<.22?stopDistance:0;
    const amount=Math.min(dt*pace,n.direct?Math.max(0,remaining-desiredStop):remaining);
    let dx=(target.x-p.x)/remaining,dz=(target.z-p.z)/remaining,lateral=0;
    // Only sidestep neighbors on the same floor. Never push backwards or change
    // floors to resolve crowd overlap, and fall back to the validated path.
    for(const other of crowd) {
      if(other===actor||!other.alive||other.entry||Math.abs(other.root.position.y-p.y)>.7)continue;
      const ox=p.x-other.root.position.x,oz=p.z-other.root.position.z,dist=Math.hypot(ox,oz);
      if(dist>.01&&dist<1.15)lateral+=(ox*dz-oz*dx)*(1.15-dist)/dist;
    }
    lateral=Math.max(-.38,Math.min(.38,lateral));
    const norm=Math.hypot(1,lateral);
    let moved=walkStep(actor,p.x+(dx+dz*lateral)*amount/norm,p.z+(dz-dx*lateral)*amount/norm);
    if(!moved&&lateral)moved=walkStep(actor,p.x+dx*amount,p.z+dz*amount);
    if(moved) {n.stuck=0;turn(actor,p.x+dx,p.z+dz,dt);return 'walk';}
    n.stuck+=dt;n.direct=false;n.directIn=.3;
    if(n.stuck>.6&&!n.queued) {n.path.length=0;n.cursor=0;n.retry=0;request(actor,goal);}
    return 'idle';
  }
  return {createState,reset,update,move,floorAt,request,canWalk};
}
