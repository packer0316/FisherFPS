import * as T from 'three';

export const cabinLayout=Object.freeze({floor:.34,ceiling:2.87,halfWidth:1.415,minZ:-7.09,maxZ:6.40,
  doors:[-3.3743,2.7876],doorHalfWidth:.86,platformEdge:9.2});
const smooth=t=>t*t*(3-2*t);
const sign=t=>t.index?-1:1;
export function cabinLocal(train,x,z){const d=sign(train);return {x:(x-train.group.position.x)*d,z:(z-train.group.position.z)*d};}
export function cabinWorld(train,x,z,y=cabinLayout.floor){const d=sign(train);return new T.Vector3(train.group.position.x+x*d,y,train.group.position.z+z*d);}

export function makeStationTransit(trains,onEvent=()=>{},findLanding=(train,p)=>new T.Vector3(
  Math.sign(train.group.position.x)*(Math.abs(p.x)>Math.abs(train.group.position.x)?15.5:8.1),0,T.MathUtils.clamp(p.z,-24,26))) {
  let player=null,feet=0,bodyHeight=1.84,escort=null,cooldown=0;
  function observe(p,y,height=1.84){if(p){player=p;feet=y;bodyHeight=height;}}
  const isDocked=t=>['opening','boarding','closing'].includes(t.schedule.phase);
  function region(x,z,r=.32,height=1.84){
    for(const train of trains){
      if(!isDocked(train))continue;
      const p=cabinLocal(train,x,z),c=cabinLayout;
      if(p.z<c.minZ+r||p.z>c.maxZ-r||p.x< -3.45||p.x>3.1)continue;
      const open=train.schedule.door>.94&&train.schedule.phase!=='closing'&&train.schedule.time<9&&escort?.train!==train;
      const door=c.doors.find(d=>Math.abs(p.z-d)<c.doorHalfWidth-r);
      if(Math.abs(p.x)>c.halfWidth-r){
        if(!open||door===undefined)continue;
        // Two low footboards bridge the gap, matching the actual cabin mesh.
        const floor=Math.abs(p.x)>2.46?(p.x<0?.024:0):Math.abs(p.x)>1.95?.17:c.floor;
        return {train,floor,ceiling:2.34-height,blocked:false};
      }
      const inside=train.interiorSolids?.some(b=>p.x+r>b.min.x&&p.x-r<b.max.x&&p.z+r>b.min.z&&p.z-r<b.max.z);
      return {train,floor:c.floor,ceiling:c.ceiling-height,blocked:!!inside||!open};
    }
    return null;
  }
  function beginDeparture(train){
    if(escort)return escort.train!==train;
    if(!player||feet<.15||feet>cabinLayout.ceiling)return true;
    const p=cabinLocal(train,player.x,player.z),c=cabinLayout;
    if(p.x< -3.45||p.x>3.1||p.z<c.minZ-.1||p.z>c.maxZ+.1)return true;
    const door=c.doors.reduce((a,b)=>Math.abs(b-p.z)<Math.abs(a-p.z)?b:a);
    if(Math.abs(p.x)>c.halfWidth&&Math.abs(p.z-door)>c.doorHalfWidth)return true;
    const exitSide=p.x<0?-1:1;
    const path=[new T.Vector3(player.x,feet,player.z)];
    if(Math.abs(p.x)<1.25){
      path.push(cabinWorld(train,0,p.z,Math.max(feet,c.floor)));
      path.push(cabinWorld(train,0,p.z));
      path.push(cabinWorld(train,0,door));
    }
    if(Math.abs(p.x)<1.6)path.push(cabinWorld(train,exitSide*1.6,door));
    if(Math.abs(p.x)<2.3)path.push(cabinWorld(train,exitSide*2.3,door,.17));
    path.push(cabinWorld(train,exitSide<0?-3.9:3.4,door,exitSide<0?.024:0));
    const segments=[];
    for(let i=1;i<path.length;i++){const distance=path[i].distanceTo(path[i-1]);if(distance>.015)segments.push({a:path[i-1],b:path[i],duration:Math.max(.16,distance/4.2)});}
    escort={kind:'evacuation',train,segments,segment:0,time:0,wait:.7,elapsed:0,total:.7+segments.reduce((n,s)=>n+s.duration,0)};
    onEvent('start',{side:train.index});return false;
  }
  function checkTrain(train,before){
    if(!player||escort||cooldown>0||train.schedule.phase==='waiting')return false;
    const b=train.collider,r=.32;
    if(feet>=b.max.y||feet+bodyHeight<=b.min.y||player.x+r<=b.min.x||player.x-r>=b.max.x)return false;
    if(player.z+r<Math.min(before.min.z,b.min.z)||player.z-r>Math.max(before.max.z,b.max.z))return false;
    const to=findLanding(train,player);if(!to)return false;
    escort={kind:'impact',train,from:new T.Vector3(player.x,feet,player.z),to,elapsed:0,total:.82};
    onEvent('impact',{side:train.index,from:escort.from.toArray(),to:to.toArray()});return true;
  }
  function update(dt,p,y,height=1.84){
    observe(p,y,height);cooldown=Math.max(0,cooldown-dt);if(!escort)return null;
    if(escort.kind==='impact'){
      const e=escort,impactStart=e.elapsed===0;e.elapsed=Math.min(e.total,e.elapsed+Math.max(0,dt));
      const t=e.elapsed/e.total,v=new T.Vector3().lerpVectors(e.from,e.to,1-Math.pow(1-t,3));
      v.y=t>=1?e.to.y:T.MathUtils.lerp(e.from.y,e.to.y,t)+Math.sin(Math.PI*t)*.85;
      player.x=v.x;player.z=v.z;feet=v.y;
      const result={feet,progress:t,impactStart};
      if(t>=1){escort=null;cooldown=.6;onEvent('impact-complete',{side:e.train.index});}
      return result;
    }
    const e=escort;let left=Math.max(0,dt);e.elapsed+=left;
    if(e.wait>0){const use=Math.min(left,e.wait);e.wait-=use;left-=use;}
    while(left>0&&e.segment<e.segments.length){
      const s=e.segments[e.segment],use=Math.min(left,s.duration-e.time);e.time+=use;left-=use;
      const v=new T.Vector3().lerpVectors(s.a,s.b,smooth(Math.min(1,e.time/s.duration)));
      player.x=v.x;player.z=v.z;feet=v.y;
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
      if(Math.hypot(dx,dz)>.02){const yaw=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(yaw-player.yaw),Math.cos(yaw-player.yaw));player.yaw+=delta*(1-Math.exp(-use*6));}
      player.pitch*=Math.exp(-use*4);
      if(e.time>=s.duration-1e-8){e.segment++;e.time=0;}
    }
    const result={feet,progress:Math.min(1,e.elapsed/e.total)};
    if(e.segment===e.segments.length){escort=null;onEvent('complete',{side:e.train.index});}
    return result;
  }
  return {region,beginDeparture,update,observe,checkTrain,get kind(){return escort?.kind;},get locked(){return !!escort;},get progress(){return escort?Math.min(1,escort.elapsed/escort.total):1;},
    cancel(){escort=null;player=null;feet=0;cooldown=0;},isHull(box){return trains.some(t=>t.collider===box);}};
}
