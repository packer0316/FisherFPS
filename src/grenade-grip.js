import * as T from 'three';
import { wrapFinger } from './hand-pose.js';

const v = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
const q = () => new T.Quaternion();

// The grenade sits against the palm, not at the reload grip's feed socket.
// Work in a palm frame: X across the knuckles towards the index, Y towards the
// fingers, Z out of the palm. The grenade's long axis follows the knuckle row.
export function fitGrenadeGrip(rig) {
  const joint=n=>rig.getObjectByName('Bone_R'+String(n).padStart(3,'0'));
  const control=rig.getObjectByName('IK_Hand_Cntrl_R');
  const wrist=control.getWorldPosition(v()), handQ=control.getWorldQuaternion(q());
  const forward=joint(5).getWorldPosition(v()).lerp(joint(17).getWorldPosition(v()),.5).sub(wrist).normalize();
  const across=joint(5).getWorldPosition(v()).sub(joint(17).getWorldPosition(v()));
  across.addScaledVector(forward,-across.dot(forward)).normalize();
  const pad=across.clone().cross(forward);
  const frame=q().setFromRotationMatrix(new T.Matrix4().makeBasis(across,forward,pad)), inv=frame.clone().invert();
  const local=bone=>bone.getWorldPosition(v()).sub(wrist).applyQuaternion(inv);
  const world=point=>point.clone().applyQuaternion(frame).add(wrist);
  const center=v(0,.110,.051), radius=.047*.9, radii=v(radius*1.16,radius,radius);
  const nodes=[5,9,13,17,20].flatMap(n=>[joint(n),joint(n+1),joint(n+2)]);
  const home=nodes.map(b=>b.quaternion.clone());
  const reset=()=>{nodes.forEach((bone,i)=>bone.quaternion.copy(home[i]));rig.updateMatrixWorld(true);};
  const thumbBase=local(joint(20));
  const thumbLengths=[20,21,22].map(n=>local(joint(n)).distanceTo(local(joint(n).children[0])));
  function opposeThumb(target){
    const axis=target.clone().sub(thumbBase), distance=axis.length();axis.normalize();
    const bow=v(1,0,0).addScaledVector(axis,-axis.x).normalize();
    const [a,b,c]=thumbLengths;let low=0,high=1.35;
    for(let i=0;i<30;i++){
      const bend=(low+high)/2;
      const x=a+b*Math.cos(bend)+c*Math.cos(1.72*bend),y=b*Math.sin(bend)+c*Math.sin(1.72*bend);
      if(Math.hypot(x,y)>distance)low=bend;else high=bend;
    }
    const bend=(low+high)/2,start=Math.atan2(b*Math.sin(bend)+c*Math.sin(1.72*bend),a+b*Math.cos(bend)+c*Math.cos(1.72*bend));
    const cursor=thumbBase.clone();
    wrapFinger(rig,'R',20,[start,start-bend,start-1.72*bend].map((angle,i)=>world(cursor.addScaledVector(axis,thumbLengths[i]*Math.cos(angle)).addScaledVector(bow,thumbLengths[i]*Math.sin(angle)))));
  }
  const fitted=[];
  function surface(point){
    const d=point.clone().sub(center), scaled=d.clone().divide(radii);
    // First-order signed distance to the ellipsoid, in metres.
    return (scaled.length()-1)*radius;
  }
  for(let digit=0;digit<4;digit++){
    const first=5+digit*4, base=local(joint(first));
    const lengths=[0,1,2].map(i=>local(joint(first+i)).distanceTo(local(joint(first+i).children[0])));
    function chain(angles){
      const [spread,...flex]=angles, direction=v(-Math.sin(spread),Math.cos(spread),0);
      let total=0, point=base.clone();const points=[point.clone()];
      for(let n=0;n<3;n++){
        total+=flex[n];point=point.clone().addScaledVector(direction,lengths[n]*Math.cos(total)).addScaledVector(pad.clone().applyQuaternion(inv),lengths[n]*Math.sin(total));
        points.push(point);
      }
      return points;
    }
    function loss(angles){
      const points=chain(angles);let cost=0;
      for(let segment=0;segment<3;segment++){
        const thickness=[.010,.009,.008][segment];let nearest=1;
        for(let sample=1;sample<=8;sample++){
          const point=points[segment].clone().lerp(points[segment+1],sample/8);
          const gap=surface(point)-thickness;
          cost+=Math.max(0,-gap)**2*180;
          nearest=Math.min(nearest,gap);
        }
        cost+=Math.max(0,nearest)**2*(segment===2?40:16);
      }
      // Keep a flexed chain and moderate MCP splay; do not solve by straightening
      // a finger beside the prop or wrapping it back through the palm.
      cost+=.000025*((angles[1]-.90)**2+(angles[2]-.65)**2+(angles[3]-.45)**2);
      return cost;
    }
    // Flex each digit in its own knuckle plane. Letting four independent IK
    // chains converge onto the shell's centre made the middle/ring fingers cross.
    const lower=[0,.25,.18,.12], upper=[0,1.60,1.8,1.3];
    let angles=[0,.8,.65,.45],best=loss(angles);
    for(const step of [.18,.09,.045,.022,.011,.005])for(let pass=0;pass<12;pass++){
      let changed=false;
      for(let n=1;n<4;n++)for(const sign of [-1,1]){
        const next=angles.slice();next[n]=T.MathUtils.clamp(next[n]+sign*step,lower[n],upper[n]);
        const score=loss(next);if(score<best){angles=next;best=score;changed=true;}
      }
      if(!changed)break;
    }
    const points=chain(angles);
    wrapFinger(rig,'R',first,points.slice(1).map(world));
    fitted.push({angles:angles.map(T.MathUtils.radToDeg),points:points.map(p=>p.toArray())});
  }
  // Oppose the thumb from the radial side, with MCP and IP flexion in one arc.
  // Its metacarpal swings out first, allowing the thumb pad to face the shell.
  opposeThumb(center.clone().add(v(.023,-.018,.048)));
  const fingers=nodes.map(b=>b.quaternion.clone().normalize());
  const offset=world(center).sub(wrist).applyQuaternion(handQ.clone().invert());
  // Release and empty-hand poses share this palm frame and wrist anchor. Finger
  // extension must never move the wrist to a different weapon's grip socket.
  function freeHand(releasing){
    reset();
    for(let digit=0;digit<4;digit++){
      const first=5+digit*4, cursor=local(joint(first));
      const lengths=[0,1,2].map(i=>local(joint(first+i)).distanceTo(local(joint(first+i).children[0])));
      const spread=(releasing?[.13,.035,-.035,-.13]:[.045,.012,-.012,-.045])[digit];
      const flex=releasing?[.015+digit*.022,.085+digit*.018,.055+digit*.012]
        :[.22+digit*.035,.24+digit*.035,.14+digit*.018];
      let total=0;
      wrapFinger(rig,'R',first,flex.map((angle,i)=>{
        total+=angle;
        cursor.add(v(Math.sin(spread)*Math.cos(total),Math.cos(spread)*Math.cos(total),Math.sin(total)).multiplyScalar(lengths[i]));
        return world(cursor);
      }));
    }
    opposeThumb(releasing?v(.086,.135,.020):v(.065,.118,.037));
    return nodes.map(b=>b.quaternion.clone().normalize());
  }
  const released=freeHand(true), relaxed=freeHand(false);
  reset();
  return {fingers,offset,fitted,released,relaxed};
}
