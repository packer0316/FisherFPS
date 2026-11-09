import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { armChain } from './hand-pose.js';
import { reloadHand } from './reload-hand.js';
import { makeGrenadeModel } from './grenade-model.js';
import { grenadeTiming } from './grenade-state.js';
import { fitGrenadeGrip } from './grenade-grip.js';
import { grenadeFingerMotion } from './grenade-gesture.js';
import { grenadeSkinning } from './grenade-skinning.js';

const v = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
const smooth = T.MathUtils.smoothstep;

export function installGrenade(body, arms, gloveMaterial, detailMap) {
  const rig = clone(arms.scene.getObjectByName('FPRig'));
  rig.name='grenade-arms'; rig.scale.setScalar(.63); rig.position.set(0,.005,-.07);
  const gloves=rig.getObjectByName('FPArms');
  gloves.frustumCulled=false; gloves.material=gloveMaterial.clone(); gloves.material.color.set(0xc0c4c1);
  grenadeSkinning(gloves);
  const prop=makeGrenadeModel(detailMap); body.add(rig,prop.root); body.updateMatrixWorld(true);
  // The same complete, corrective-skinned gloves as the knife. Each finger has
  // MCP/PIP/DIP flexion; the opposed thumb follows its own arc, not a rigid fist.
  const hands={};
  for (const side of ['R','L']) {
    const poses=reloadHand(rig,side,true);
    const closed=side==='R'?fitGrenadeGrip(rig):poses.bake('pinch',[.48,1.12,1.72]);
    const open=side==='R'?{fingers:closed.released,offset:closed.offset}:poses.bake('loose',[.22,.46,.72]);
    const joints=[5,9,13,17,20].flatMap(n=>[n,n+1,n+2]).map(n=>rig.getObjectByName('Bone_'+side+String(n).padStart(3,'0')));
    if(side==='L'){
      // Only the index hooks the ring. The other three fingers stay softly
      // cupped instead of inheriting the reload pose's tightly clenched fist.
      for(let i=3;i<12;i++)closed.fingers[i].slerp(open.fingers[i],.55);
      // A ring hooks the distal index finger, unlike a magazine's feed socket.
      joints.forEach((bone,i)=>bone.quaternion.copy(closed.fingers[i]));rig.updateMatrixWorld(true);
      const index=rig.getObjectByName('Bone_L007'),control=rig.getObjectByName('IK_Hand_Cntrl_L');
      closed.offset.copy(index.getWorldPosition(v())).lerp(index.children[0].getWorldPosition(v()),.55)
        .sub(control.getWorldPosition(v())).applyQuaternion(control.getWorldQuaternion(new T.Quaternion()).invert());
    }
    hands[side]={poses,closed,open,joints,solve:armChain(rig,side,true)};
  }
  const wrist=v(), orientation=new T.Quaternion(), offset=v(), shoulder=v(), center=v(), along=v(), inward=v();
  const rollAxis=v(),rollNormal=v(),rollTarget=v(),rollCross=v(),palmTurn=new T.Quaternion();
  function place(side,point,forward,pad,opening,shoulderAt,elbowHint=null,turnDown=0) {
    const hand=hands[side], pose=hand.poses.place(hand.closed,point,forward,pad);
    orientation.copy(pose.orientation);
    offset.copy(hand.closed.offset).lerp(hand.open.offset,opening).applyQuaternion(orientation);
    wrist.copy(point).sub(offset); shoulder.copy(shoulderAt);
    if(turnDown>0){
      // Pronate around the palm's long axis after release. Keep the wrist anchor
      // and elbow arc intact; rotating the grip centre would orbit the wrist.
      rollAxis.copy(forward).normalize();
      rollNormal.copy(pad).normalize();
      rollTarget.set(0,-1,.22).addScaledVector(rollAxis,-rollTarget.dot(rollAxis)).normalize();
      const angle=Math.atan2(rollAxis.dot(rollCross.crossVectors(rollNormal,rollTarget)),rollNormal.dot(rollTarget));
      orientation.premultiply(palmTurn.setFromAxisAngle(rollAxis,angle*turnDown));
      offset.copy(hand.closed.offset).applyQuaternion(orientation);
    }
    hand.solve(shoulder,wrist,orientation,undefined,1,1,elbowHint);
    hand.joints.forEach((bone,i)=>bone.quaternion.copy(hand.closed.fingers[i]).slerp(hand.open.fingers[i],opening));
    // The prop follows the solved hand, including the IK reach limit.
    return wrist.add(offset);
  }
  let time=0;
  const pinHome=prop.pin.position.clone();
  // Shoulder and elbow lead the forward stroke while the wrist stays laid back.
  // Wrist flexion catches up at release, then carries on through the arm's arc.
  // Keys: seconds, grip xyz, wrist Euler xyz, shoulder xyz, elbow pole xyz.
  // The elbow pole is independent of wrist roll so a wrist snap cannot flip the
  // entire elbow. IK retains the imported upper/lower arm lengths.
  const throwKeys=[
    [0,    .16,-.145,-.65, -.13,-.78,-.51, .43,-.44,-.20, .53,-.48,-.33],
    [.12,  .27,-.005,-.55, -.24,-.65,-.86, .44,-.37,-.16, .63,-.28,-.31],
    [.27,  .32, .16,-.47,  -.28,-.48,-1.22,.44,-.27,-.14, .67,-.08,-.37],
    [.32,  .29, .20,-.54,  -.30,-.54,-1.12,.41,-.24,-.22, .61,.025,-.52],
    [.37,  .17, .16,-.73,  -.18,-.79,-.72, .34,-.26,-.32, .45,.015,-.69],
    [.42, -.015,.07,-.91,   .18,-1.04,-.18,.28,-.28,-.42, .29,-.08,-.80],
    [.48, -.20,-.10,-.92,   .78,-1.27,.35, .22,-.32,-.45, .13,-.25,-.78],
    [.57, -.26,-.30,-.77,   .90,-1.14,.52, .24,-.37,-.34, .08,-.38,-.63],
    [.72, -.08,-.47,-.57,   .34,-.91,.12, .35,-.44,-.23, .40,-.53,-.41],
    [.86,  .19,-.49,-.54,  -.10,-.72,-.47,.43,-.44,-.20, .53,-.53,-.33],
    [1.14, .19,-.17,-.66,  -.10,-.72,-.47,.43,-.44,-.20, .53,-.48,-.33],
  ];
  const motion=new T.CubicInterpolant(throwKeys.map(k=>k[0]),throwKeys.flatMap(k=>k.slice(1)),12);
  const elbowAt=v(),emptyTurn=new T.Quaternion().setFromEuler(new T.Euler(.08,-.78,-.40));
  function update(dt,moving,aspect,swayX,swayY,stride,state,available) {
    time+=dt;
    const phase=state?.phase??'idle', t=state?.time??0;
    const pin=phase==='pin'?smooth(t,0,.28):phase==='held'?1:0;
    const pull=phase==='pin'?smooth(t,.36,.53):phase==='held'?1:0;
    const throwTime=phase==='throw'?t:phase==='recover'?grenadeTiming.release+t:-1;
    const narrow=Math.min(1,aspect/1.15), size=T.MathUtils.lerp(1.10,1.18,narrow);
    body.scale.setScalar(narrow*size);
    body.position.set(0,-.16*(1-narrow)+(size-1)*narrow*.17,-.61*(1-narrow)+(size-1)*narrow*.64);
    const bob=Math.sin(stride)*moving*.006;
    // An oblique power grip keeps the palm's long axis close to the forearm.
    // Turning the palm square to the camera bent the wrist sideways, especially
    // during preparation. Bring the whole hand inward with only a small roll.
    center.set(.19-.03*pin,-.17+.025*pin,-.66+.01*pin);
    prop.root.rotation.set(-.10-.03*pin,-.72-.06*pin,-.47-.04*pin);
    const shoulderAt=v(.43,-.44,-.20);
    elbowAt.set(.53,-.48,-.33);
    if(throwTime>=0){
      const k=motion.evaluate(throwTime);center.fromArray(k);prop.root.rotation.set(k[3],k[4],k[5]);shoulderAt.fromArray(k,6);elbowAt.fromArray(k,9);
    }
    // Finish the same follow-through on the last throw, then lower the unloaded
    // hand. Do not play the pickup or return to the old imaginary-sphere grip.
    const emptyRest=available>0?0:phase==='recover'?smooth(t,.28,.70):phase==='idle'?1:0;
    center.lerp(v(.235,-.285,-.62),emptyRest);
    prop.root.quaternion.slerp(emptyTurn,emptyRest);
    shoulderAt.lerp(v(.43,-.44,-.20),emptyRest);
    elbowAt.lerp(v(.53,-.48,-.33),emptyRest);
    center.x*=Math.max(.75,narrow); center.x+=bob-swayX*.13;
    center.y+=.0025*Math.sin(time*1.8)+Math.cos(stride*2)*moving*.003-swayY*.06;
    const turn=prop.root.quaternion;
    // Keep the prop and all five contacts in the same palm frame as the forearm
    // rolls; do not rotate the shell independently inside an unchanged fist.
    along.set(-1,0,0).applyQuaternion(turn); inward.set(0,0,1).applyQuaternion(turn);
    shoulderAt.x+=(1-narrow)*.18;
    shoulderAt.z-=.13;
    elbowAt.x+=(1-narrow)*.18;
    const turnDown=phase==='recover'?smooth(t,.01,.12)*(1-smooth(t,.27,.50)):0;
    prop.root.position.copy(place('R',center,along,inward,0,shoulderAt,elbowAt,turnDown));
    hands.R.joints.forEach((bone,i)=>{
      const {extension,relax}=grenadeFingerMotion(phase,t,available,i);
      bone.quaternion.copy(hands.R.closed.fingers[i]).slerp(hands.R.closed.released[i],extension).slerp(hands.R.closed.relaxed[i],relax);
    });
    const retrieved=available>0&&phase==='recover'&&t>=.54;
    prop.root.visible=available>0&&(phase!=='recover'||retrieved);
    prop.lever.visible=true;
    // The left hand approaches the ring, then withdraws with it. The contact
    // is defined in prop space so the fingers cannot lag behind a moving prop.
    const contact=pinHome.clone().applyQuaternion(turn).add(prop.root.position);
    const leftRest=v(-.30,-.49,-.56), leftTarget=contact.clone().add(v(-.15*pull,-.045*pull,.025*pull));
    const reach=phase==='pin'?smooth(t,.02,.28)*(1-smooth(t,.53,.72)):0;
    const leftPoint=leftRest.clone().lerp(leftTarget,reach);
    place('L',leftPoint,v(.78,.45,-.43),v(.29,-.85,-.37),1-reach,
      v(-.38+.20*reach-(1-narrow)*.15,-.46+.06*reach,-.25-.15*reach),
      v(-.36+.13*reach,-.45,-.48));
    prop.pin.visible=phase==='idle'||phase==='pin'||retrieved;
    prop.pin.position.copy(pinHome);
    if(phase==='pin'&&pull>0){
      rig.updateMatrixWorld(true);
      const index=rig.getObjectByName('Bone_L007');
      const hook=index.getWorldPosition(v()).lerp(index.children[0].getWorldPosition(v()),.55);
      body.worldToLocal(hook);hook.sub(prop.root.position).applyQuaternion(turn.clone().invert());
      prop.pin.position.lerp(hook,smooth(t,.36,.40));
    }
  }
  return {update, origin(out){return prop.root.getWorldPosition(out);}};
}
