import * as T from 'three';
import { finishRifle } from './rifle-finish.js';
import { addReceiverHardware, addRifleSight } from './rifle-hardware.js';
import { wrapFinger } from './hand-pose.js';
import { fitRifleRightHand, makeRifleReload } from './rifle-reload.js';

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const q = () => new T.Quaternion();
const ease = T.MathUtils.smoothstep;

// P226 contact points in the imported model's frame. The strong-hand index
// curves onto the trigger, the other three fingers wrap around the front strap.
function fitPistolFingers(rig, side) {
  const contacts = side === 'R' ? [
    [[0.040,0.023,0.052],[0.026,0.014,0.021],[-0.011,0.010,0.005]],
    [[0.046,-0.018,0.050],[0.015,-0.022,0.042],[-0.018,-0.021,0.065]],
    [[0.049,-0.049,0.057],[0.020,-0.055,0.047],[-0.015,-0.053,0.071]],
    [[0.052,-0.081,0.069],[0.022,-0.085,0.061],[-0.006,-0.084,0.079]],
    [[-0.032,0.002,0.159],[-0.038,0.027,0.122],[-0.035,0.034,0.073]],
  ] : [
    [[-0.044,-0.031,0.028],[-0.010,-0.036,0.020],[0.025,-0.034,0.045]],
    [[-0.041,-0.060,0.039],[-0.007,-0.063,0.029],[0.028,-0.057,0.053]],
    [[-0.037,-0.085,0.048],[-0.005,-0.093,0.043],[0.025,-0.085,0.063]],
    [[-0.041,-0.102,0.071],[-0.019,-0.112,0.065],[0.008,-0.105,0.080]],
    [[-0.049,-0.003,0.103],[-0.043,0.010,0.056],[-0.037,0.014,0.009]],
  ];
  for (const [i, first] of [5, 9, 13, 17, 20].entries())
    wrapFinger(rig, side, first, contacts[i].map(p => v(...p)));
}

export function fitFingers(rig, side, contacts) {
  const find = (n) => rig.getObjectByName(n),
    tipNames = [7, 11, 15, 19, 22];
  rig.updateMatrixWorld(true);
  for (const [i, last] of tipNames.entries()) {
    const name = 'Bone_' + side + String(last).padStart(3, '0');
    const tip = find(name + '_end') || find(name.replace(side, side + '.') + '_end');
    if (!tip) continue;
    const goal = contacts[i];
    for (let pass = 0; pass < 14; pass++) {
      let joint = tip.parent;
      for (let k = 0; k < 3; k++, joint = joint.parent) {
        const origin = joint.getWorldPosition(v());
        const start = tip.getWorldPosition(v()).sub(origin).normalize(),
          end = goal.clone().sub(origin).normalize();
        const change = q().setFromUnitVectors(start, end);
        const capped = q().slerp(change, Math.min(1, 0.22 / Math.max(0.001, change.angleTo(q()))));
        const next = capped.multiply(joint.getWorldQuaternion(q()));
        joint.quaternion.copy(joint.parent.getWorldQuaternion(q()).invert().multiply(next));
        joint.updateMatrixWorld(true);
      }
    }
  }
}

// Work in the rig's own frame so camera sway and aiming transform the whole pose together.
export function supportArm(rig, rifle) {
  const find = (n) => rig.getObjectByName(n);
  const upper = find('UpArm_L'),
    lower = find('Forearm_L'),
    control = find('IK_Hand_Cntrl_L');
  const shoulder = upper.getWorldPosition(v()),
    elbow = lower.getWorldPosition(v()),
    home = control.getWorldPosition(v());
  const upperDir = elbow.clone().sub(shoulder),
    lowerDir = home.clone().sub(elbow),
    a = upperDir.length(),
    b = lowerDir.length();
  upperDir.normalize();
  lowerDir.normalize();
  const bindUpper = upper.getWorldQuaternion(q()),
    bindLower = lower.getWorldQuaternion(q()),
    bindHand = control.getWorldQuaternion(q());
  const upperParent = upper.parent.getWorldQuaternion(q()).invert(),
    controlParent = control.parent.matrixWorld.clone().invert();
  const controlRotation = control.parent.getWorldQuaternion(q()).invert();
  const palmRoll = q(), neutral = q(), palm = q();
  // Bring the lead shoulder forward so the elbow can bend down under a long handguard.
  if (rifle) {
    shoulder.add(v(0.19, -0.27, 0.115));
    upper.position.copy(shoulder).applyMatrix4(upper.parent.matrixWorld.clone().invert());
  } else {
    // Rotate the support palm onto the side of the primary hand, locating it
    // by the index knuckle rather than stretching fingertips from below the gun.
    palmRoll.setFromAxisAngle(v(0, 0, 1), -1.12);
    const wristToKnuckle = find('Bone_L005').getWorldPosition(v()).sub(home).applyQuaternion(palmRoll);
    home.set(-0.055, -0.034, 0.074).sub(wristToKnuckle);
  }
  const fingers = [];
  for (let i = 5; i <= 22; i++) {
    const finger =
      find('Bone_L' + String(i).padStart(3, '0')) || find('Bone_L.' + String(i).padStart(3, '0'));
    if (finger) fingers.push({ finger, bind: finger.quaternion.clone(), index: i });
  }
  const wrist = v(),
    direction = v(),
    pole = v(),
    targetElbow = v(),
    axis = v(),
    twist = q(),
    orient = q(),
    upQ = q(),
    delta = q(),
    rot = new T.Euler();
  let idleSolved = false;
  // Fit each fingertip to the opposite side of the handguard once, then blend that grip
  // open as the support hand leaves it. The upper arm and wrist keep their actual lengths.
  function fitGrip() {
    if (rifle) fitFingers(rig, 'L', [
      v(-0.005, 0.04, -0.881),
      v(0.027, 0.039, -0.846),
      v(0.03, 0.029, -0.817),
      v(0.031, 0.01, -0.792),
      v(-0.025, 0.042, -0.911),
    ]);
    else fitPistolFingers(rig, 'L');
    for (const f of fingers) f.grip = f.finger.quaternion.clone();
  }
  return {
    home,
    fitGrip,
    pose(target, turn, reach, opening) {
      const settled = reach === 0 && opening === 0;
      if (idleSolved && settled) return;
      idleSolved = settled;
      direction.copy(target).sub(shoulder);
      const distance = T.MathUtils.clamp(
        direction.length(),
        Math.abs(a - b) + 0.001,
        a + b - 0.001,
      );
      direction.normalize();
      wrist.copy(shoulder).addScaledVector(direction, distance);
      // Keep the elbow outside and below the gun as the hand travels toward the magazine.
      pole.copy(elbow).sub(shoulder);
      pole.x += rifle ? 0.10 + 0.03 * reach : -0.14;
      pole.y -= 0.48 + 0.14 * reach;
      pole.z += 0.12 * reach;
      pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const projection = (a * a - b * b + distance * distance) / (2 * distance);
      targetElbow
        .copy(shoulder)
        .addScaledVector(direction, projection)
        .addScaledVector(pole, Math.sqrt(Math.max(0, a * a - projection * projection)));
      delta.setFromUnitVectors(upperDir, axis.subVectors(targetElbow, shoulder).normalize());
      upQ.copy(delta).multiply(bindUpper);
      upper.quaternion.copy(upperParent).multiply(upQ);
      orient
        .setFromUnitVectors(lowerDir, axis.subVectors(wrist, targetElbow).normalize())
        .multiply(bindLower);
      lower.quaternion.copy(upQ).invert().multiply(orient);
      control.position.copy(wrist).applyMatrix4(controlParent);
      twist.setFromEuler(
        rot.set(
          -turn * 0.37,
          (rifle ? 0.65 * (1 - reach) : 0) + turn * 0.15,
          (rifle ? -0.3 * (1 - reach) : 0) - turn * 0.75,
        ),
      );
      control.quaternion.copy(controlRotation).multiply(twist);
      if (!rifle) control.quaternion.multiply(palm.copy(palmRoll).slerp(neutral, reach));
      control.quaternion.multiply(bindHand);
      for (const f of fingers) {
        const { finger, bind, index } = f;
        finger.quaternion.copy(f.grip ?? bind).slerp(bind, reach);
        if (index % 4 !== 0) finger.rotateZ(opening * (index >= 20 ? 0.1 : 0.21));
      }
    },
  };
}


export function installWeapon(body, asset, rifle, detailMap) {
  const space = asset.scene;
  space.updateMatrixWorld(true);
  const nodes = (n) => space.getObjectByName(n);
  if (!rifle) {
    const arms = nodes('FPRig');
    arms.scale.multiplyScalar(0.79);
    arms.position.copy(arms.parent.worldToLocal(v(-0.010, -0.024, -0.038)));
    space.updateMatrixWorld(true);
    fitPistolFingers(space, 'R');
  }
  const arm = supportArm(space, rifle),
    mag = nodes('Magazine'),
    bolt = nodes('ChargingHandle');
  if (rifle) fitRifleRightHand(space);
  const finger = nodes('Bone_R006'),
    triggerBind = finger?.quaternion.clone();
  const supportGrip = arm.home.clone();
  if (rifle) supportGrip.add(v(0.012, -0.01, 0.105));
  arm.pose(supportGrip, 0, 0, 0);
  space.updateMatrixWorld(true);
  arm.fitGrip();
  const magGrip = nodes(rifle ? 'MagazineGrip' : 'MagazineGripSocket').getWorldPosition(v());
  const tip = nodes(rifle ? 'MuzzleDeviceTip' : 'MuzzleSocket').getWorldPosition(v()),
    port = nodes('EjectionPort').getWorldPosition(v());
  const opticMount = rifle ? nodes('OpticRailContact').getWorldPosition(v()) : v();
  if (rifle) {
    addReceiverHardware(space);
    finishRifle(space, detailMap);
  }
  space.attach(mag);
  space.attach(bolt);
  const magHome = mag.position.clone(),
    magRotation = mag.quaternion.clone(),
    boltHome = bolt.position.clone();
  const spare = nodes('SpareMagazine') || mag.clone();
  space.attach(spare);
  spare.scale.copy(mag.scale);
  spare.visible = false;
  const reloadRifle = rifle ? makeRifleReload(space, mag, spare, bolt) : null;
  const pocket = v(-0.17, -0.48, 0.15),
    wrist = v(),
    destination = v(),
    charging = boltHome.clone().add(v(0.035, -0.075, 0.065));
  const grabOffset = magGrip.sub(magHome).add(v(-0.065, -0.022, 0.06));
  const rotation = q(),
    xAxis = v(1, 0, 0);
  space.traverse((n) => {
    if (n.isSkinnedMesh) n.frustumCulled = false;
    if (!n.isMesh) return;
    const m = n.material;
    m.aoMapIntensity = 0.62;
  });
  body.add(space);
  const unit = rifle ? 0.53 : 0.63;
  space.scale.setScalar(unit);
  space.position.set(0, rifle ? 0.04 : 0.005, rifle ? 0.145 : -0.07);
  for (const point of [tip, port, opticMount]) point.multiplyScalar(unit).add(space.position);
  const sightY = opticMount.y + 0.0345;
  const dot = rifle ? addRifleSight(body, sightY, opticMount.z + 0.023, detailMap) : null;
  function reloadPistol(p, empty, cycle) {
    const take = ease(p, 0.025, 0.17),
      remove = ease(p, 0.18, 0.39),
      insert = ease(p, 0.46, 0.69);
    mag.visible = p < 0.41 || p >= 0.7;
    spare.visible = p >= 0.41 && p < 0.7;
    const offset = p < 0.41 ? remove : p < 0.7 ? 1 - insert : 0;
    const rock = ease(p, 0.13, 0.22) - ease(p, 0.25, 0.36);
    const seatTap = ease(p, 0.63, 0.67) - ease(p, 0.67, 0.73);
    const held = p >= 0.41 && p < 0.7 ? spare : mag;
    held.position.copy(magHome).addScaledVector(pocket, offset);
    // The spent magazine clears the latch toward the hip; the fresh one hooks in nose-first.
    held.position.x += (p < 0.41 ? 0.07 : -0.1) * offset;
    held.position.z += 0.065 * rock - 0.045 * offset * (p >= 0.41 ? 1 : 0);
    held.position.y += 0.016 * seatTap;
    rotation.setFromAxisAngle(xAxis, 0.08 * offset);
    held.quaternion.copy(rotation).multiply(magRotation);
    const release = ease(p, 0.7, 0.81),
      rack = empty ? ease(p, 0.71, 0.83) * (1 - ease(p, 0.93, 1)) : 0;
    const pull = ease(p, 0.83, 0.89) - ease(p, 0.9, 0.94);
    bolt.position.copy(boltHome);
    bolt.position.z += 0.052 * Math.max(Math.sin(cycle * Math.PI), empty && p > 0 ? 1 - ease(p, 0.85, 0.92) : 0);
    const grip = take * (1 - release);
    destination.copy(grabOffset).applyQuaternion(rotation).add(held.position);
    wrist.copy(supportGrip);
    wrist.lerp(destination, grip);
    destination.copy(charging);
    destination.z += pull * 0.115;
    wrist.lerp(destination, rack);
    const opening =
      ease(p, 0.03, 0.1) - ease(p, 0.11, 0.19) + ease(p, 0.67, 0.75) - ease(p, 0.8, 0.9);
    arm.pose(wrist, grip + 1.4 * rack, Math.max(grip, rack), opening - 0.14 * grip);
  }
  function pose(p, empty, cycle, ads) {
    if (finger) {
      finger.quaternion.copy(triggerBind);
      // Flex the index PIP only during the shot; keep the fitted resting grip.
      if (rifle) finger.rotateZ(cycle > 0 ? -.06 * Math.sin(cycle * Math.PI) : 0);
      else finger.rotateZ(-0.12 * (1 - ease(cycle, 0.1, 0.8)));
    }
    if (rifle) reloadRifle(p, empty, cycle);
    else reloadPistol(p, empty, cycle);
    if (dot) {
      dot.visible = ads > 0.03;
      dot.material.opacity = ease(ads, 0.03, 0.78);
    }
  }
  return { tip, port, sightY, pose };
}
