import * as T from 'three';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// The circuit belongs to the arena, not the current enemy. Changing targets or
// dodging a telegraph must not drag the movement goal back across the player.
export function makeAutoPatrol(world,position,clockwise=1){
  const bounds=world.navigationBounds??{x:63,z:55},points=[];
  const rx=bounds.x*.69,rz=bounds.z*.73;
  const authored=!!world.autoPlayRoute;
  if(authored)for(const p of world.autoPlayRoute)points.push(new T.Vector3(p.x,p.y,p.z));
  for(let i=0;!authored&&i<12;i++){
    const angle=i*Math.PI/6;
    let point=null;
    for(const scale of [1,.9,1.08,.8,.7]){
      for(const offset of [0,.1,-.1,.2,-.2]){
        const x=Math.cos(angle+offset)*rx*scale,z=Math.sin(angle+offset)*rz*scale;
        const y=world.terrainHeight(x,z,position.y);
        if(!world.blocked(x,z,.65,y,1.84,.24)){point=new T.Vector3(x,y,z);break;}
      }
      if(point)break;
    }
    if(point)points.push(point);
  }
  // All shipped scenes have open circuit sectors. A tiny/custom scene may not.
  if(!points.length)points.push(position.clone());
  const step=clockwise<0?-1:1,wrap=i=>(i+points.length)%points.length;
  const routeDistance=(a,b)=>Math.hypot(distance(a,b),(a.y-b.y)*3);
  let cursor=points.reduce((best,p,i)=>routeDistance(p,position)<routeDistance(points[best],position)?i:best,0);
  if(routeDistance(points[cursor],position)<(authored?1.2:8))cursor=wrap(cursor+step);
  let closest=Infinity,withoutProgress=0;
  function advance(){cursor=wrap(cursor+step);closest=Infinity;withoutProgress=0;}
  return {
    direction:step,
    get goal(){return points[cursor];},
    update(dt,p,evading=false){
      let d=routeDistance(p,points[cursor]);
      if(d<(authored?1.2:3.1)){advance();d=routeDistance(p,points[cursor]);}
      if(d<closest-(authored ? .5 : 1.5)){closest=d;withoutProgress=0;}
      else if(!evading)withoutProgress+=dt;
      // Skip a persistently unreachable sector in the SAME circuit direction.
      if(withoutProgress>7&&!authored){advance();}
      return points[cursor];
    },
  };
}
