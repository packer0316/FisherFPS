import * as T from 'three';

// Fixed shader light count: distant fittings retain their baked/emissive art.
// Slot changes fade to zero first, avoiding moving light pools or recompilation.
export function stationLightBudget(scene,coarse) {
  const sources=[],slots=Array.from({length:coarse?2:4},()=>{
    const light=new T.PointLight(0xffffff,0,12,2);scene.add(light);return {light,source:null,target:null};
  });
  let selection=0;
  function add(color,intensity,distance,parent,position){
    const anchor=new T.Object3D();anchor.position.copy(position);parent.add(anchor);
    const source={anchor,color:new T.Color(color),intensity,distance,position:new T.Vector3(),score:0,active:true};
    sources.push(source);return source;
  }
  function update(dt,camera){
    const at=camera.position??camera;selection-=dt;
    for(const s of sources){s.active=true;for(let p=s.anchor;p;p=p.parent)if(!p.visible){s.active=false;break;}
      if(s.active)s.anchor.getWorldPosition(s.position);
    }
    if(selection<=0){selection=.16;
      for(const s of sources){const d=s.position.distanceTo(at),reach=Math.max(0,1-d/(s.distance+5));
        s.score=s.active?s.intensity*reach*reach/(2+d*d):0;
        if(slots.some(slot=>slot.target===s))s.score*=1.2;
      }
      const selected=sources.slice().sort((a,b)=>b.score-a.score).slice(0,slots.length).filter(s=>s.score>0);
      for(const slot of slots)if(!selected.includes(slot.target))slot.target=null;
      for(const source of selected)if(!slots.some(s=>s.target===source))slots.find(s=>!s.target).target=source;
    }
    for(const slot of slots){
      const changing=slot.source!==slot.target,source=slot.source;
      const target=!changing&&source?.active?source.intensity:0;
      slot.light.intensity=T.MathUtils.lerp(slot.light.intensity,target,1-Math.exp(-dt*12));
      if(source){slot.light.position.copy(source.position);slot.light.color.copy(source.color);slot.light.distance=source.distance;}
      if(changing&&slot.light.intensity<.08){slot.light.intensity=0;slot.source=slot.target;}
    }
  }
  return {add,update,slots};
}
