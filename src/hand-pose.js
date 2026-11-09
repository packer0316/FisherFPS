import * as T from 'three';

// Aim each phalanx toward a contact on the grip. Bone lengths and skin weights
// stay intact, including when the imported rig uses a transformed parent.
export function wrapFinger(rig, side, first, targets) {
  let bone = rig.getObjectByName('Bone_' + side + String(first).padStart(3, '0'));
  const origin = new T.Vector3(), direction = new T.Vector3(), desired = new T.Vector3();
  const turn = new T.Quaternion(), parent = new T.Quaternion();
  for (const target of targets) {
    const child = bone.children[0];
    bone.getWorldPosition(origin);
    child.getWorldPosition(direction).sub(origin).normalize();
    desired.subVectors(target, origin).normalize();
    turn.setFromUnitVectors(direction, desired).multiply(bone.getWorldQuaternion(parent));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(parent)).invert().multiply(turn);
    bone.updateMatrixWorld(true);
    bone = child;
  }
}

// Hinge PIP/DIP flexion in the MCP plane; mirrored hands curl in opposite
// directions. The thumb retains its own CMC opposition and MCP/IP hinges.
export function articulateFingers(rig, side, frame, curls, thumb, thumbFlex) {
  const joint = i => rig.getObjectByName('Bone_' + side + String(i).padStart(3, '0'));
  const sign = side === 'R' ? 1 : -1;
  const fingerFrame = new T.Quaternion(), bend = new T.Quaternion();
  const local = new T.Quaternion(), parent = new T.Quaternion();
  const x = new T.Vector3(1,0,0), z = new T.Vector3(0,0,1);
  // Both imported hands use the same phalanx roll even though their flexion mirrors.
  const base = new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0), -Math.PI / 2);
  const radians = T.MathUtils.degToRad;
  for (let digit = 0; digit < 4; digit++) {
    const [spread, ...angles] = curls[digit];
    fingerFrame.copy(frame).multiply(bend.setFromAxisAngle(z, radians(spread)));
    let curl = 0;
    for (let segment = 0; segment < 3; segment++) {
      curl += radians(angles[segment]);
      const bone = joint(5 + digit * 4 + segment);
      local.copy(fingerFrame).multiply(bend.setFromAxisAngle(x, sign * curl)).multiply(base);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(parent)).invert().multiply(local);
      bone.updateMatrixWorld(true);
    }
  }
  fingerFrame.copy(frame).multiply(thumb);
  for (let segment = 0; segment < 3; segment++) {
    const bone = joint(20 + segment);
    if (segment) fingerFrame.multiply(bend.setFromAxisAngle(z, -sign * radians(thumbFlex[segment-1])));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(parent)).invert().multiply(fingerFrame);
    bone.updateMatrixWorld(true);
  }
}

// Keep the sleeve and cuff connected to each wrist. The elbow bends in the
// plane of the palm instead of folding the wrist to push the point forward.
export function armChain(rig, side, distributeTwist = false) {
  const v = () => new T.Vector3(), rot = () => new T.Quaternion();
  const upper = rig.getObjectByName('UpArm_' + side), lower = rig.getObjectByName('Forearm_' + side);
  const control = rig.getObjectByName('IK_Hand_Cntrl_' + side);
  const hand = control.getWorldPosition(v()), elbowBind = lower.getWorldPosition(v());
  const upperDir = elbowBind.clone().sub(upper.getWorldPosition(v())), lowerDir = hand.clone().sub(elbowBind);
  const a = upperDir.length(), b = lowerDir.length();
  upperDir.normalize();
  lowerDir.normalize();
  const upperBind = upper.getWorldQuaternion(rot()), lowerBind = lower.getWorldQuaternion(rot());
  const bindHand = control.getWorldQuaternion(rot());
  const invLower = lowerBind.clone().invert(), invHand = bindHand.clone().invert();
  const handForward = rig.getObjectByName('Bone_' + side + '009').getWorldPosition(v()).sub(hand)
    .normalize().applyQuaternion(bindHand.clone().invert());
  const shoulderFrame = upper.parent.matrixWorld.clone().invert(), ctrlFrame = control.parent.matrixWorld.clone().invert();
  const shoulderParent = upper.parent.getWorldQuaternion(rot()).invert(), ctrlParent = control.parent.getWorldQuaternion(rot()).invert();
  const dir = v(), pole = v(), elbow = v(), axis = v(), upperQ = rot(), lowerQ = rot();
  const twist = rot(), forearmTurn = rot();
  const twists = distributeTwist ? [3,2,1].map(i => {
    const bone = rig.getObjectByName('BoneTwist_0' + i + side);
    return { bone, home: bone.quaternion.clone() };
  }) : [];
  const twistAxis = v().set(0,1,0);
  return function place(shoulder, wrist, orientation, stroke, activity = 1, followPalm = 0, elbowHint = null) {
    let palmRoll = 0;
    dir.subVectors(wrist, shoulder);
    const distance = T.MathUtils.clamp(dir.length(), Math.abs(a - b) + 0.001, a + b - 0.001);
    dir.normalize();
    wrist.copy(shoulder).addScaledVector(dir, distance);
    if(elbowHint) pole.copy(elbowHint).sub(shoulder);
    else pole.copy(handForward).applyQuaternion(orientation).multiplyScalar(-b).add(wrist).sub(shoulder);
    pole.x += side === 'R' ? 0.032 : -0.032;
    pole.y -= 0.026;
    if (activity < 1) pole.lerp(axis.subVectors(elbowBind, shoulder), 1 - activity);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    elbow.copy(shoulder).addScaledVector(dir, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    upper.position.copy(shoulder).applyMatrix4(shoulderFrame);
    upperQ.setFromUnitVectors(upperDir, axis.subVectors(elbow, shoulder).normalize()).multiply(upperBind);
    lowerQ.setFromUnitVectors(lowerDir, axis.subVectors(wrist, elbow).normalize()).multiply(lowerBind);
    if (followPalm) {
      // Carry palm roll into the sleeve about the forearm axis without moving its endpoints.
      forearmTurn.copy(lowerQ).multiply(invLower).invert();
      twist.copy(orientation).multiply(invHand).multiply(forearmTurn);
      const axial = twist.x * axis.x + twist.y * axis.y + twist.z * axis.z;
      const roll = 2 * Math.atan2(axial * (twist.w < 0 ? -1 : 1), Math.abs(twist.w));
      palmRoll = roll;
      if (distributeTwist) {
        // Pronation accumulates from elbow to wrist through the three twist bones.
        twist.setFromAxisAngle(twistAxis, roll / twists.length);
        for (const { bone, home } of twists) bone.quaternion.copy(home).multiply(twist);
      } else {
        lowerQ.premultiply(twist.setFromAxisAngle(axis, roll * followPalm));
      }
    }
    if (stroke) {
      // Rotate the solved guard about the actual joints. The fist, blade and
      // sleeve inherit the same forearm roll even at the tip of a fast cut.
      twist.setFromAxisAngle(axis, stroke.roll);
      forearmTurn.copy(stroke.upper).multiply(stroke.lower).multiply(twist);
      wrist.sub(elbow).applyQuaternion(forearmTurn);
      elbow.sub(shoulder).applyQuaternion(stroke.upper).add(shoulder);
      wrist.add(elbow);
      upperQ.premultiply(stroke.upper);
      if (distributeTwist) {
        lowerQ.premultiply(twist.copy(stroke.upper).multiply(stroke.lower));
        twist.setFromAxisAngle(twistAxis, (palmRoll + stroke.roll) / twists.length);
        for (const { bone, home } of twists) bone.quaternion.copy(home).multiply(twist);
      } else lowerQ.premultiply(forearmTurn);
      orientation.premultiply(forearmTurn);
    }
    upper.quaternion.copy(shoulderParent).multiply(upperQ);
    lower.quaternion.copy(upperQ).invert().multiply(lowerQ);
    control.position.copy(wrist).applyMatrix4(ctrlFrame);
    control.quaternion.copy(ctrlParent).multiply(orientation);
  };
}
