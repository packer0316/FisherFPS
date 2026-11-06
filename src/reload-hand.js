import * as T from 'three';
import { armChain, wrapFinger, articulateFingers } from './hand-pose.js';

const v = (x, y, z) => new T.Vector3(x, y, z);
const q = () => new T.Quaternion();
const firstJoints = [5, 9, 13, 17, 20];

function palmFrame(forward, pad, side) {
  const along = forward.clone().normalize();
  const across = pad.clone().cross(along).normalize();
  if (side === 'R') across.negate();
  return q().setFromRotationMatrix(new T.Matrix4().makeBasis(across, along, across.clone().cross(along)));
}

// Bake finger curls and contact offsets once in gun space, before scaling the viewmodel.
// The contact lies between the gripping fingers, never at the wrist pivot.
export function reloadHand(rig, side, distributeTwist = false) {
  const node = name => rig.getObjectByName(name);
  const control = node('IK_Hand_Cntrl_' + side), upper = node('UpArm_' + side);
  const lower = node('Forearm_' + side);
  const joint = i => node('Bone_' + side + String(i).padStart(3, '0'));
  const pos = bone => bone.getWorldPosition(v());
  const bones = firstJoints.flatMap(i => [joint(i), joint(i + 1), joint(i + 2)]);
  const homeFingers = bones.map(bone => bone.quaternion.clone());
  const homeWrist = pos(control), homeQ = control.getWorldQuaternion(q());
  const homeUpper = upper.quaternion.clone(), homeLower = lower.quaternion.clone();
  const homeControl = control.quaternion.clone(), homePos = control.position.clone();
  const shoulder = pos(upper), shoulderHome = upper.position.clone();
  const forward = pos(joint(5)).lerp(pos(joint(17)), .5).sub(homeWrist).normalize();
  const across = pos(joint(5)).sub(pos(joint(17)));
  across.addScaledVector(forward, -across.dot(forward)).normalize();
  const pad = forward.clone().cross(across);
  if (side === 'R') pad.negate();
  const relative = palmFrame(forward, pad, side).invert().multiply(homeQ);
  const palmInv = homeQ.clone().invert();
  const solve = armChain(rig, side, distributeTwist);
  const twists = distributeTwist ? [3,2,1].map(i => {
    const bone = node('BoneTwist_0' + i + side);
    return { bone, home: bone.quaternion.clone() };
  }) : [];

  function saveShape(center) {
    const fingers = bones.map(b => b.quaternion.clone());
    bones.forEach((b, i) => b.quaternion.copy(homeFingers[i]));
    rig.updateMatrixWorld(true);
    return { fingers, offset: center.sub(homeWrist).applyQuaternion(palmInv) };
  }

  // Curl each finger in a single flexion plane. PIP and DIP joints share the
  // MCP hinge, so placing a pad cannot twist a phalanx around its length.
  function articulated(part, knuckles, along, inward, curls, thumb, thumbFlex) {
    const frame = palmFrame(forward, pad, side);
    articulateFingers(rig, side, frame, curls, thumb, thumbFlex);
    const center = pos(joint(5)).lerp(pos(joint(17)), .5);
    return place(saveShape(center), knuckles.clone().sub(part.position), along, inward, part, true);
  }

  function bake(kind, angles) {
    bones.forEach((b, i) => b.quaternion.copy(homeFingers[i]));
    rig.updateMatrixWorld(true);
    for (let digit = 0; digit < 4; digit++) {
      const first = firstJoints[digit];
      let cursor = pos(joint(first));
      const targets = angles.map((angle, i) => {
        const bone = joint(first + i);
        const len = pos(bone).distanceTo(pos(bone.children[0]));
        const bend = angle + digit * (kind === 'pinch' ? .16 : .045);
        const dir = forward.clone().multiplyScalar(Math.cos(bend))
          .addScaledVector(pad, Math.sin(bend)).addScaledVector(across, .06 - digit * .04);
        cursor = cursor.clone().addScaledVector(dir.normalize(), len);
        return cursor;
      });
      wrapFinger(rig, side, first, targets);
    }
    const indexTip = pos(joint(7).children[0]);
    const thumbBase = pos(joint(20));
    const target = kind === 'pinch'
      ? indexTip.clone().addScaledVector(forward, -.052).addScaledVector(across, .005).addScaledVector(pad, -.007)
      : thumbBase.clone();
    if (kind !== 'pinch') {
      const offsets = {
        loose: [.151,.077,.034], hook: [.149,.029,.050],
        handle: [.138,.024,.079], press: [.153,.055,.035],
      };
      const [f, a, n] = offsets[kind];
      target.addScaledVector(forward, f).addScaledVector(across, a).addScaledVector(pad, n);
    }
    // Bend along a single opposition arc. The pad rolls toward the index as the
    // thumb closes, and both knuckles share the bend rather than folding at one joint.
    const axis = target.clone().sub(thumbBase), distance = axis.length();
    axis.normalize();
    const bow = across.clone().addScaledVector(pad, -.26);
    bow.addScaledVector(axis, -bow.dot(axis)).normalize();
    const lengths = [20,21,22].map(i => pos(joint(i)).distanceTo(pos(joint(i).children[0])));
    const [l1,l2,l3] = lengths;
    let low = 0, high = 1.15;
    for (let i = 0; i < 14; i++) {
      const bend = (low + high) / 2, tipBend = 1.72 * bend;
      const x = l1 + l2*Math.cos(bend) + l3*Math.cos(tipBend);
      const y = l2*Math.sin(bend) + l3*Math.sin(tipBend);
      if (Math.hypot(x,y) > distance) low = bend;
      else high = bend;
    }
    const bend = (low + high) / 2;
    const start = Math.atan2(l2*Math.sin(bend) + l3*Math.sin(1.72*bend),
      l1 + l2*Math.cos(bend) + l3*Math.cos(1.72*bend));
    const cursor = thumbBase.clone();
    wrapFinger(rig, side, 20, [start, start-bend, start-1.72*bend].map((angle,i) =>
      cursor.addScaledVector(axis, lengths[i]*Math.cos(angle))
        .addScaledVector(bow, lengths[i]*Math.sin(angle)).clone()));
    let center;
    // The feed socket was calibrated on this side of the index pad. It stays fixed as the thumb flexes.
    if (kind === 'pinch') center = indexTip.addScaledVector(forward,-.03234612)
      .addScaledVector(across,.00571955).addScaledVector(pad,-.00458519);
    else if (kind === 'press') center = pos(joint(9)).lerp(pos(joint(13)), .5).addScaledVector(pad, .021);
    else center = pos(joint(6)).lerp(pos(joint(14)), .5).addScaledVector(pad, .020);
    return saveShape(center);
  }

  const hook = bake('hook', [.76, 1.76, 2.62]);
  const loose = bake('loose', [.26, .56, .93]);


  const rest = { fingers: homeFingers, offset: v(), point: homeWrist, orientation: homeQ };
  const place = (shape, point, along, inward, part = null, followRoll = false) => ({
    ...shape, point, part, followRoll, orientation: palmFrame(along, inward, side).multiply(relative),
  });
  const a = v(), b = v(), wrist = v(), shoulderAt = v(), palm = q(), offset = v();
  const fromQ = q(), toQ = q();
  function wristAt(pose, out, orientation) {
    orientation.copy(pose.orientation);
    if (pose.followRoll) orientation.premultiply(pose.part.quaternion);
    out.copy(pose.point);
    if (pose.part) out.applyQuaternion(pose.part.quaternion).add(pose.part.position);
    return out.sub(offset.copy(pose.offset).applyQuaternion(orientation));
  }

  let atRest = true;
  function update(p, keys) {
    if (p <= keys[0][0] || p >= keys[keys.length - 1][0]) {
      if (atRest) return;
      upper.position.copy(shoulderHome); upper.quaternion.copy(homeUpper); lower.quaternion.copy(homeLower);
      control.position.copy(homePos); control.quaternion.copy(homeControl);
      bones.forEach((bone, i) => bone.quaternion.copy(homeFingers[i]));
      for (const { bone, home } of twists) bone.quaternion.copy(home);
      atRest = true;
      return;
    }
    atRest = false;
    let i = 1;
    while (p > keys[i][0]) i++;
    const [start, from] = keys[i-1], [end, to, arc] = keys[i];
    const t = T.MathUtils.smoothstep(p, start, end);
    const activity = T.MathUtils.lerp(Number(from !== rest), Number(to !== rest), t);
    wrist.copy(wristAt(from, a, fromQ)).lerp(wristAt(to, b, toQ), t);
    const transfer = arc ? 4 * t * (1 - t) : 0;
    if (arc) wrist.addScaledVector(arc, transfer);
    palm.copy(fromQ).slerp(toQ, t);
    shoulderAt.copy(shoulder);
    // Retract the leading shoulder as the wrist comes back with the box. Leaving
    // it in its forward firing pose would fold the elbow against the upper arm.
    const near = T.MathUtils.smoothstep(wrist.z, -.52, -.14);
    const retract = distributeTwist ? 0 : activity * near;
    shoulderAt.x += (side === 'L' ? -.14 : .06) * retract;
    shoulderAt.z += (side === 'L' ? .45 : .16) * retract;
    shoulderAt.y += distributeTwist ? 0 : .22 * Math.max(0, wrist.y - shoulder.y) * activity - .065 * retract;
    solve(shoulderAt, wrist, palm, undefined, activity, .7 * activity);
    const release = to.release ?? from.release ?? loose.fingers;
    bones.forEach((bone, n) => {
      const thumb = n >= 12;
      const close = thumb ? t - .15 * transfer : t;
      bone.quaternion.copy(from.fingers[n]).slerp(to.fingers[n], close)
        .slerp(release[n], (thumb ? .94 : .78) * transfer);
    });
  }
  return { rest, hook, loose, bake, articulated, place, update };
}
