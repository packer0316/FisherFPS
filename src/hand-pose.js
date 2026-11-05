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
