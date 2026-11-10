import * as T from 'three';
import { armChain, articulateFingers } from './hand-pose.js';
import { classicHandPoses } from './classic-rifle-hand-data.js';
import { supportArm } from './weapon-rig.js';

const v = a => new T.Vector3(...a);

// Move the entire palm first; flexion is then solved in each digit's MCP plane.
// This preserves the palm arch and thumb web instead of pulling individual tips.
export function fitClassicHand(rig, side, pose) {
  const node = name => rig.getObjectByName(name);
  const pos = name => node(name).getWorldPosition(new T.Vector3());
  const wrist = pos('Hand_' + side);
  const center = pos('Bone_' + side + '005').lerp(pos('Bone_' + side + '017'), .5);
  const along = center.clone().sub(wrist).normalize();
  const across = pos('Bone_' + side + '005').sub(pos('Bone_' + side + '017'));
  across.addScaledVector(along, -across.dot(along)).normalize();
  const home = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across, along, across.clone().cross(along)));
  const forward = v(pose.along).normalize(), pad = v(pose.pad).normalize();
  const lateral = pad.clone().cross(forward).normalize();
  if (side === 'R') lateral.negate();
  const target = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(lateral, forward, lateral.clone().cross(forward)));
  const turn = target.clone().multiply(home.invert());
  wrist.sub(center).applyQuaternion(turn).add(v(pose.center));
  const orient = turn.clone().multiply(node('IK_Hand_Cntrl_' + side).getWorldQuaternion(new T.Quaternion()));
  const shoulder = pose.shoulder ? v(pose.shoulder) : pos('UpArm_' + side);
  armChain(rig, side, true)(shoulder, wrist, orient, undefined, 1, 1, pose.elbow ? v(pose.elbow) : null);
  rig.updateMatrixWorld(true);
  articulateFingers(rig, side, target, pose.fingers, new T.Quaternion(...pose.thumb).normalize(), pose.thumbFlex);
  rig.updateMatrixWorld(true);
}

export function fitClassicSupport(rig, id) {
  // Start from the approved AK-47 palm and finger pose. The new rifles open
  // the elbow slightly to match the supplied M4 first-person reference.
  const support = supportArm(rig, true);
  support.pose(support.home.clone().add(new T.Vector3(.012,-.01,.105)),0,0,0);
  rig.updateMatrixWorld(true);
  support.fitGrip();
  const pos = name => rig.getObjectByName(name).getWorldPosition(new T.Vector3());
  const knuckles = pos('Bone_L005').lerp(pos('Bone_L017'),.5);
  const contact = {
    m4a1: [-.02857,-.088,-.83],
    scarl: [-.02857,-.069,-.805],
    vss: [-.02857,-.099,-.82],
  }[id];
  const wrist = pos('Hand_L').add(v(contact).sub(knuckles));
  const orientation = rig.getObjectByName('IK_Hand_Cntrl_L').getWorldQuaternion(new T.Quaternion());
  const shoulder=pos('UpArm_L');shoulder.x-=.067;
  armChain(rig,'L',true)(shoulder,wrist,orientation,undefined,1,.7,new T.Vector3(-.32,-.36,-.28));
  rig.updateMatrixWorld(true);
}

export function fitClassicFiring(rig, id) {
  fitClassicHand(rig, 'R', { ...classicHandPoses[id].firing,
    shoulder: [.35,-.35,.17] });
}
