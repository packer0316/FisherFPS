import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { armChain } from './hand-pose.js';
import { reloadHand } from './reload-hand.js';
import { makeGrenadeModel } from './grenade-model.js';
import { grenadeTiming } from './grenade-state.js';
import { fitGrenadeGrip } from './grenade-grip.js';
import { grenadeFingerMotion } from './grenade-gesture.js';

const v = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
const smooth = T.MathUtils.smoothstep;

export function installGrenade(body, arms, gloveMaterial, detailMap) {
  const rig = clone(arms.scene.getObjectByName('FPRig'));
  rig.name='grenade-arms'; rig.scale.setScalar(.63); rig.position.set(0,.005,-.07);
  const gloves=rig.getObjectByName('FPArms');
  gloves.frustumCulled=false; gloves.material=gloveMaterial.clone(); gloves.material.color.set(0xc0c4c1);
  const prop=makeGrenadeModel(detailMap); body.add(rig,prop.root); body.updateMatrixWorld(true);
  // The same complete, corrective-skinned gloves as the knife. Each finger has
  // MCP/PIP/DIP flexion; the opposed thumb follows its own arc, not a rigid fist.
  const hands={};
  for (const side of ['R','L']) {
    const poses=reloadHand(rig,side,true);
    const closed=side==='R'?fitGrenadeGrip(rig):poses.bake('pinch',[.82,1.58,2.12]);
    const open=side==='R'?{fingers:closed.released,offset:closed.offset}:poses.bake('loose',[.14,.32,.50]);
    const joints=[5,9,13,17,20].flatMap(n=>[n,n+1,n+2]).map(n=>rig.getObjectByName('Bone_'+side+String(n).padStart(3,'0')));
    if(side==='L'){
      // A ring hooks the distal index finger, unlike a magazine's feed socket.
      joints.forEach((bone,i)=>bone.quaternion.copy(closed.fingers[i]));rig.updateMatrixWorld(true);
      const index=rig.getObjectByName('Bone_L007'),control=rig.getObjectByName('IK_Hand_Cntrl_L');
      closed.offset.copy(index.getWorldPosition(v())).lerp(index.children[0].getWorldPosition(v()),.55)
        .sub(control.getWorldPosition(v())).applyQuaternion(control.getWorldQuaternion(new T.Quaternion()).invert());
    }
    hands[side]={poses,closed,open,joints,solve:armChain(rig,side,true)};
  }
  const wrist=v(), orientation=new T.Quaternion(), offset=v(), shoulder=v(), center=v(), along=v(), inward=v();
  function place(side,point,forward,pad,opening,shoulderAt,elbowHint=null) {
    const hand=hands[side], pose=hand.poses.place(hand.closed,point,forward,pad);
    orientation.copy(pose.orientation);
    offset.copy(hand.closed.offset).lerp(hand.open.offset,opening).applyQuaternion(orientation);
    wrist.copy(point).sub(offset); shoulder.copy(shoulderAt);
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
    [0,    .125,-.135,-.66, -.15,.15,.17,   .37,-.36,-.22, .56,-.34,-.40],
    [.10,  .25, .03, -.51,  -.42,-.22,-.25,.40,-.31,-.18, .62,-.14,-.33],
    [.22,  .34, .17, -.37,  -.72,-.38,-.52,.42,-.25,-.16, .65,.035,-.43],
    [.30,  .27, .185,-.53,  -.62,-.36,-.36,.39,-.25,-.23, .56,.06,-.57],
    [.36,  .16, .145,-.70,  -.26,-.48,-.14,.36,-.26,-.29, .45,-.03,-.68],
    [.42,  .035,.075,-.82,   .22,-.80,.08, .32,-.28,-.33, .38,-.07,-.69],
    [.49, -.09,-.04, -.84,   .67,-1.05,.28,.29,-.29,-.34, .29,-.18,-.66],
    [.57, -.15,-.19, -.75,   .82,-.92,.45, .30,-.32,-.31, .24,-.28,-.58],
    [.70, -.025,-.36,-.54,   .42,-.48,.12, .35,-.36,-.25, .46,-.43,-.38],
    [.85,  .19,-.46,-.42,   -.15,.15,-.28, .37,-.36,-.22, .56,-.46,-.32],
    [1.14, .19,-.17,-.66,   -.15,.15,-.28, .37,-.36,-.22, .56,-.34,-.40],
  ];
  const motion=new T.CubicInterpolant(throwKeys.map(k=>k[0]),throwKeys.flatMap(k=>k.slice(1)),12);
  const elbowAt=v(),emptyTurn=new T.Quaternion().setFromEuler(new T.Euler(.12,-.42,-.55));
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
    center.set(.19-.065*pin,-.17+.035*pin,-.66);
    prop.root.rotation.set(-.15,.15,-.28+.45*pin);
    const shoulderAt=v(.37,-.36,-.22);
    elbowAt.set(.56,-.34,-.40);
    if(throwTime>=0){
      const k=motion.evaluate(throwTime);center.fromArray(k);prop.root.rotation.set(k[3],k[4],k[5]);shoulderAt.fromArray(k,6);elbowAt.fromArray(k,9);
    }
    // Finish the same follow-through on the last throw, then lower the unloaded
    // hand. Do not play the pickup or return to the old imaginary-sphere grip.
    const emptyRest=available>0?0:phase==='recover'?smooth(t,.28,.70):phase==='idle'?1:0;
    center.lerp(v(.235,-.285,-.62),emptyRest);
    prop.root.quaternion.slerp(emptyTurn,emptyRest);
    shoulderAt.lerp(v(.37,-.36,-.22),emptyRest);
    elbowAt.lerp(v(.56,-.39,-.38),emptyRest);
    center.x*=Math.max(.75,narrow); center.x+=bob-swayX*.13;
    center.y+=.0025*Math.sin(time*1.8)+Math.cos(stride*2)*moving*.003-swayY*.06;
    const turn=prop.root.quaternion;
    // Palm behind the shell; four fingers wrap its left side while the thumb
    // opposes from above/right. The player sees the pads enclosing the object.
    along.set(-1,0,0).applyQuaternion(turn); inward.set(0,0,1).applyQuaternion(turn);
    shoulderAt.x+=(1-narrow)*.18;
    shoulderAt.z-=.13;
    elbowAt.x+=(1-narrow)*.18;
    prop.root.position.copy(place('R',center,along,inward,0,shoulderAt,elbowAt));
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
    const leftRest=v(-.34,-.45,-.48), leftTarget=contact.clone().add(v(-.13*pull,.025*pull,.015*pull));
    const reach=phase==='pin'?smooth(t,.02,.28)*(1-smooth(t,.55,.72)):0;
    const leftPoint=leftRest.clone().lerp(leftTarget,reach);
    place('L',leftPoint,v(.92,.1,-.16),v(.1,-.7,-.7),1-reach,v(-.38+.20*reach-(1-narrow)*.15,-.38+.06*reach,-.23-.17*reach));
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
