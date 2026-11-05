import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { wrapFinger } from './hand-pose.js';

export const knifeContactTime = 0.238;
const v = (x, y, z) => new T.Vector3(x, y, z);
const rot = () => new T.Quaternion();

// Each key turns the shoulder (pitch, yaw, roll), then the elbow (pitch, yaw)
// and finally rolls the forearm about its own axis. The hand carries the blade.
const cutKeys = [
  [0,                   0,     0,     0,     0,     0,     0],
  [0.035,            0.04,  0.05, -0.02,  0.01,  0.01, -0.03],
  [0.108,            0.24,  0.26, -0.02,  0.03,  0.07, -0.12],
  [0.158,            0.31,  0.35,  0.00,  0.05,  0.11, -0.18],
  [0.183,            0.32,  0.34,  0.01,  0.06,  0.12, -0.14],
  [knifeContactTime, 0.24,  0.14,  0.07,  0.05,  0.14,  0.17],
  [0.288,           -0.04, -0.10,  0.08, -0.04, -0.11, -0.42],
  [0.326,           -0.07, -0.13,  0.10, -0.065,-0.14, -0.68],
  [0.364,           -0.06, -0.12,  0.08, -0.05, -0.13, -0.55],
  [0.437,           -0.03, -0.05,  0.03, -0.03, -0.06, -0.18],
  [0.490,               0,     0,     0,     0,     0,     0],
];

function bladeMaterial(knife, detailMap) {
  const material = knife.getObjectByName('Kabar').material;
  // The entire knife uses one atlas and one draw. In model space the guard is at
  // z = -0.065 and the pommel starts at +0.052. Only those fittings and the blade are steel.
  material.onBeforeCompile = shader => {
    shader.uniforms.grindMap = { value: detailMap };
    shader.vertexShader = 'varying vec3 knifePoint;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n knifePoint = position;');
    shader.fragmentShader = 'uniform sampler2D grindMap; varying vec3 knifePoint;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float blade = 1.0 - smoothstep(-0.083, -0.070, knifePoint.z);
        float steel = max(1.0 - smoothstep(-0.061, -0.056, knifePoint.z), smoothstep(0.050, 0.055, knifePoint.z));
        vec2 grain = texture2D(grindMap, vec2(knifePoint.z * 2.4 + knifePoint.y * 0.55, knifePoint.y * 7.8)).rg;
        float belly = 0.028 - 0.043 * pow(1.0 - smoothstep(-0.299,-0.231,knifePoint.z), 1.5);
        float grind = smoothstep(belly - 0.026, belly - 0.009, knifePoint.y);
        float thickness = abs(knifePoint.x - 0.00014);
        float bevel = grind * (1.0 - smoothstep(0.00045, 0.0019 + min(fwidth(thickness),0.0006), thickness));
        float atlas = dot(diffuseColor.rgb, vec3(0.24,0.64,0.12));
        vec3 satin = mix(vec3(0.052,0.061,0.072), vec3(0.13,0.15,0.17), grind);
        vec3 finish = mix(satin, vec3(0.60,0.63,0.65), bevel) * (0.78 + 0.19 * atlas + 0.12 * grain.g);
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.78,0.75,0.70), finish, blade);
        float relief = blade * 0.000037 * grain.r;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float satinRough = mix(0.43,0.32,grind) + 0.15 * (grain.r - 0.5);
        roughnessFactor = mix(0.82, mix(0.43, mix(satinRough,0.20,bevel), blade), steel);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(0.025, mix(0.68, mix(0.80,0.97,bevel), blade), steel);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
        vec3 tx = cross(dy, normal), ty = cross(normal, dx);
        float det = dot(dx, tx);
        normal = normalize(max(abs(det),1e-10) * normal - sign(det) * (dFdx(relief)*tx + dFdy(relief)*ty));`)
      .replace('#include <opaque_fragment>', `
        // A dark satin finish softens broad sky reflections. Exposed edge steel
        // retains the full moving highlight from the actual sun and HDR sky.
        float luminance = dot(totalSpecular, vec3(0.2126,0.7152,0.0722));
        float response = 0.75 / (1.0 + 1.35 * luminance);
        outgoingLight -= totalSpecular * blade * (1.0 - bevel) * (1.0 - response);
        #include <opaque_fragment>`);
  };
}

// Aim each phalanx independently. Fingertips wrap back around the far side of
// the oval grip; their middle joints stay on the outside of the handle.
function closeFingers(rig, knife) {
  function curl(first, targets) {
    wrapFinger(rig, 'R', first, targets.map(target => knife.localToWorld(v(...target))));
  }
  for (const [i, z] of [-0.043, -0.018, 0.006, 0.031].entries())
    curl(5 + i * 4, [[0.008, -0.030, z], [-0.019, -0.017, z], [-0.020, 0.011, z + 0.002]]);
  curl(20, [[-0.034, 0.032, -0.009], [-0.031, 0.005, -0.038], [-0.010, -0.018, -0.044]]);
}

// Map the left glove's knuckle line and wrist direction to a palm-down guard.
function openGuard(rig) {
  const wrist = rig.getObjectByName('Hand_L').getWorldPosition(v());
  const finger = i => rig.getObjectByName('Bone_L' + String(i).padStart(3, '0'));
  const index = finger(5).getWorldPosition(v()), pinky = finger(17).getWorldPosition(v());
  const forward = index.clone().lerp(pinky, 0.5).sub(wrist).normalize();
  const across = index.sub(pinky);
  across.addScaledVector(forward, -across.dot(forward)).normalize();
  const back = across.clone().cross(forward).normalize();
  const bindFrame = rot().setFromRotationMatrix(new T.Matrix4().makeBasis(across, forward, back));
  const goal = v(), origin = v(), direction = v(), adjust = rot(), parent = rot();
  function bend(bone, target) {
    const child = bone.children[0];
    direction.copy(child.getWorldPosition(v())).sub(bone.getWorldPosition(origin)).normalize();
    adjust.setFromUnitVectors(direction, target.normalize()).multiply(bone.getWorldQuaternion(parent));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(parent)).invert().multiply(adjust);
    bone.updateMatrixWorld(true);
    return child;
  }
  for (let i = 0; i < 4; i++) {
    let joint = finger(5 + i * 4);
    for (const angle of [0.17, 0.57, 1.06]) {
      const curl = angle + i * 0.09;
      goal.copy(forward).multiplyScalar(Math.cos(curl)).addScaledVector(back, -Math.sin(curl));
      joint = bend(joint, goal.addScaledVector(across, 0.12 - i * 0.09));
    }
  }
  let thumb = finger(20);
  for (const [spread, curl] of [[1.4, 0.12], [1.1, 0.35], [0.8, 0.63]])
    thumb = bend(thumb, goal.copy(forward).addScaledVector(across, spread).addScaledVector(back, -curl));
  const guardForward = v(0.26, 0.49, -0.83).normalize();
  const guardAcross = v(0.94, 0.20, 0.30);
  guardAcross.addScaledVector(guardForward, -guardAcross.dot(guardForward)).normalize();
  const guardFrame = rot().setFromRotationMatrix(new T.Matrix4().makeBasis(
    guardAcross, guardForward, v().crossVectors(guardAcross, guardForward)));
  return guardFrame.multiply(bindFrame.invert()).multiply(rig.getObjectByName('IK_Hand_Cntrl_L').getWorldQuaternion(rot()));
}

function addCuffs(rig, body) {
  const cloth = document.createElement('canvas');
  cloth.width = 256;
  cloth.height = 64;
  const ctx = cloth.getContext('2d');
  ctx.fillStyle = '#3c3d37';
  ctx.fillRect(0, 0, 256, 64);
  for (let row = 0; row < 64; row += 2) {
    ctx.fillStyle = row % 4 ? '#484943' : '#333530';
    for (let u = (row / 2) % 4; u < 256; u += 4) ctx.fillRect(u, row, 2, 1);
  }
  ctx.fillStyle = '#66665a';
  for (let u = 0; u < 256; u += 8) {
    ctx.fillRect(u, 8, 4, 1);
    ctx.fillRect(u, 54, 4, 1);
  }
  const map = new T.CanvasTexture(cloth);
  map.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshStandardMaterial({ map, roughness: 0.94 });
  const profile = [[0.88,-0.024],[1,-0.020],[1,-0.017],[0.97,-0.014],[0.97,0.012],[1,0.016],[0.91,0.020]];
  const geo = new T.LatheGeometry(profile.map(([r, h]) => new T.Vector2(r, h)), 24);
  geo.rotateX(Math.PI / 2);
  for (const side of ['R', 'L']) {
    const node = name => rig.getObjectByName(name);
    const hand = node('Hand_' + side), wrist = hand.getWorldPosition(v());
    const forward = node('Bone_' + side + '009').getWorldPosition(v()).sub(wrist).normalize();
    const across = node('Bone_' + side + '005').getWorldPosition(v())
      .sub(node('Bone_' + side + '017').getWorldPosition(v()));
    across.addScaledVector(forward, -across.dot(forward)).normalize();
    const normal = forward.clone().cross(across);
    const cuff = new T.Mesh(geo, material);
    cuff.position.copy(wrist).addScaledVector(across, -0.006).addScaledVector(normal, side === 'R' ? -0.006 : 0.006);
    cuff.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(across, normal, forward));
    cuff.scale.set(side === 'R' ? 0.043 : 0.038, side === 'R' ? 0.043 : 0.034, 1);
    body.add(cuff);
    hand.attach(cuff);
  }
}

// Keep the sleeve and cuff connected to each wrist. The elbow bends in the
// plane of the palm instead of folding the wrist to push the point forward.
function armChain(rig, side) {
  const upper = rig.getObjectByName('UpArm_' + side), lower = rig.getObjectByName('Forearm_' + side);
  const control = rig.getObjectByName('IK_Hand_Cntrl_' + side);
  const hand = control.getWorldPosition(v()), elbowBind = lower.getWorldPosition(v());
  const upperDir = elbowBind.clone().sub(upper.getWorldPosition(v())), lowerDir = hand.clone().sub(elbowBind);
  const a = upperDir.length(), b = lowerDir.length();
  upperDir.normalize();
  lowerDir.normalize();
  const upperBind = upper.getWorldQuaternion(rot()), lowerBind = lower.getWorldQuaternion(rot());
  const bindHand = control.getWorldQuaternion(rot());
  const handForward = rig.getObjectByName('Bone_' + side + '009').getWorldPosition(v()).sub(hand)
    .normalize().applyQuaternion(bindHand.clone().invert());
  const shoulderFrame = upper.parent.matrixWorld.clone().invert(), ctrlFrame = control.parent.matrixWorld.clone().invert();
  const shoulderParent = upper.parent.getWorldQuaternion(rot()).invert(), ctrlParent = control.parent.getWorldQuaternion(rot()).invert();
  const dir = v(), pole = v(), elbow = v(), axis = v(), upperQ = rot(), lowerQ = rot();
  const twist = rot(), forearmTurn = rot();
  return function place(shoulder, wrist, orientation, stroke) {
    dir.subVectors(wrist, shoulder);
    const distance = T.MathUtils.clamp(dir.length(), Math.abs(a - b) + 0.001, a + b - 0.001);
    dir.normalize();
    wrist.copy(shoulder).addScaledVector(dir, distance);
    pole.copy(handForward).applyQuaternion(orientation).multiplyScalar(-b).add(wrist).sub(shoulder);
    pole.x += side === 'R' ? 0.032 : -0.032;
    pole.y -= 0.026;
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    elbow.copy(shoulder).addScaledVector(dir, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    upper.position.copy(shoulder).applyMatrix4(shoulderFrame);
    upperQ.setFromUnitVectors(upperDir, axis.subVectors(elbow, shoulder).normalize()).multiply(upperBind);
    lowerQ.setFromUnitVectors(lowerDir, axis.subVectors(wrist, elbow).normalize()).multiply(lowerBind);
    if (stroke) {
      // Rotate the solved guard about the actual joints. The fist, blade and
      // sleeve inherit the same forearm roll even at the tip of a fast cut.
      twist.setFromAxisAngle(axis, stroke.roll);
      forearmTurn.copy(stroke.upper).multiply(stroke.lower).multiply(twist);
      wrist.sub(elbow).applyQuaternion(forearmTurn);
      elbow.sub(shoulder).applyQuaternion(stroke.upper).add(shoulder);
      wrist.add(elbow);
      upperQ.premultiply(stroke.upper);
      lowerQ.premultiply(forearmTurn);
      orientation.premultiply(forearmTurn);
    }
    upper.quaternion.copy(shoulderParent).multiply(upperQ);
    lower.quaternion.copy(upperQ).invert().multiply(lowerQ);
    control.position.copy(wrist).applyMatrix4(ctrlFrame);
    control.quaternion.copy(ctrlParent).multiply(orientation);
  };
}

export function installKnife(body, pistol, asset, detailMap) {
  const rig = clone(pistol.scene);
  rig.getObjectByName('Gun_p226').visible = false;
  const gloves = rig.getObjectByName('FPArms');
  gloves.frustumCulled = false;
  gloves.material = gloves.material.clone();
  gloves.material.color.set(0xc0c4c1);
  rig.scale.setScalar(0.63);
  rig.position.set(0, 0.005, -0.07);
  const knife = asset.scene;
  bladeMaterial(knife, detailMap);
  const tip = knife.getObjectByName('BladeTip');
  body.add(rig, knife);
  const palm = rig.getObjectByName('Hand_R'), control = palm.parent;
  // A diagonal grip runs from just below the index knuckle to the heel of the palm.
  const z = v(0.26, -0.78, 0.57).normalize(), x = v(0, 0, 1).cross(z).normalize();
  const gripBasis = new T.Matrix4().makeBasis(x, v().crossVectors(z, x), z);
  knife.position.set(0.031, 0.005, 0.047);
  knife.quaternion.setFromRotationMatrix(gripBasis);
  body.updateMatrixWorld(true);
  closeFingers(rig, knife);
  const gripToHand = knife.quaternion.clone().invert().multiply(control.getWorldQuaternion(rot()));
  palm.attach(knife);
  // The KA-BAR's sharpened bevel is on +Y. Roll it outward around the grip's
  // longitudinal axis after binding so the fingers retain their fitted pose.
  knife.rotateZ(Math.PI);

  const leftGuard = openGuard(rig);
  addCuffs(rig, body);
  const placeRight = armChain(rig, 'R'), placeLeft = armChain(rig, 'L');
  // Knuckles face the player. The blade leaves the index side of the fist to the left.
  const guardZ = v(0.82, -0.35, 0.46).normalize();
  const guardX = v(0.62, -0.78, 0).cross(guardZ).normalize();
  const guard = rot().setFromRotationMatrix(new T.Matrix4().makeBasis(guardX, v().crossVectors(guardZ, guardX), guardZ));
  guard.multiply(rot().setFromAxisAngle(v(0, 0, 1), -1.93));
  const shoulder = v(), wrist = v();
  const delta = rot(), orient = rot(), euler = new T.Euler(0, 0, 0, 'YXZ');
  const cut = new T.CubicInterpolant(cutKeys.map(k => k[0]), cutKeys.flatMap(k => k.slice(1)), 6);
  const stroke = { upper: rot(), lower: rot(), roll: 0 };
  let elapsed = 1, time = 0, motion = 0;
  let contacted = false;
  function update(dt, moving, aspect, swayX, swayY, stride) {
    elapsed += dt;
    time += dt;
    // A confirmed hit briefly checks the blade's momentum after contact.
    const through = Math.max(0, elapsed - knifeContactTime);
    const poseTime = contacted ? elapsed - 0.026 * (1 - Math.exp(-through / 0.041)) : elapsed;
    const t = cut.evaluate(poseTime);
    motion = T.MathUtils.damp(motion, moving, 10, dt);
    const bob = Math.sin(stride), strideLift = Math.cos(stride * 2);
    // Keep a two-hand composition in portrait. Scale about the wrists at their
    // usual depth, so the arms enter from the lower corners on a narrow screen.
    const scale = Math.min(1, aspect / 1.22);
    const narrow = Math.min(1, aspect / (1.6 * scale));
    const size = T.MathUtils.lerp(1.31, 1.48, scale);
    const spread = (1 - 1 / size) * narrow;
    const rise = (1 - scale) * 0.16 * T.MathUtils.smoothstep(t[0], 0, 0.24);
    // Roll the shoulder forward as the fist crosses the body to lift the blade.
    const lift = T.MathUtils.smoothstep(t[1], 0.13, 0.35);
    const reach = T.MathUtils.smoothstep(poseTime, 0.015, 0.15) * (1 - T.MathUtils.smoothstep(poseTime, 0.36, 0.49));
    const weightShift = -(0.16 * Math.sin(t[1]) + 0.035 * lift) * narrow;
    const forward = 0.055 * reach + 0.080 * lift;
    body.scale.setScalar(scale * size);
    body.position.set(0, -0.155 * (1 - scale) + rise + scale * (size - 1) * 0.17,
      -0.60 * (1 - scale) + scale * (size - 1) * 0.64);
    wrist.set(0.298 * narrow + weightShift - 0.19 * spread + 0.008 * bob * motion - swayX * 0.15,
      -0.247 + 0.054 * lift + 0.003 * Math.sin(time * 1.9) + 0.006 * strideLift * motion, -0.60 - forward);
    wrist.x += (1 - scale) * 0.040;
    shoulder.set(0.335 * narrow + weightShift - 0.19 * spread, -0.34 + 0.054 * lift, -0.30 - forward);
    shoulder.x += (1 - scale) * 0.200;
    shoulder.y -= (1 - scale) * 0.12;
    delta.setFromEuler(euler.set(swayY * 0.55, swayX * 0.65, 0.018 * bob * motion));
    orient.copy(delta).multiply(guard).multiply(gripToHand);
    stroke.upper.setFromEuler(euler.set(t[0], t[1] * narrow, t[2]));
    stroke.lower.setFromEuler(euler.set(t[3], t[4] * narrow, 0));
    stroke.roll = t[5];
    placeRight(shoulder, wrist, orient, stroke);
    const retract = T.MathUtils.smoothstep(Math.abs(t[1]) + 0.3 * Math.abs(t[5]), 0, 0.70);
    shoulder.set(-0.42 * narrow + 0.28 * spread, -0.35 - rise / body.scale.y, -0.245);
    shoulder.x -= (1 - scale) * 0.222;
    shoulder.y -= (1 - scale) * 0.12;
    wrist.set((-0.406 - 0.048 * retract) * narrow + 0.28 * spread - 0.006 * bob * motion,
      -0.250 - 0.038 * retract + 0.004 * strideLift * motion - rise / body.scale.y,
      -0.57 + 0.045 * retract);
    wrist.x -= (1 - scale) * 0.062;
    orient.setFromEuler(euler.set(-0.075 * retract, 0.07 * retract, 0)).multiply(leftGuard);
    placeLeft(shoulder, wrist, orient);
  }
  return {
    reset() {
      motion = 0;
      elapsed = 1;
      contacted = false;
    },
    swing() {
      elapsed = 0;
      contacted = false;
    },
    impact() { contacted = true; },
    update,
    tipOrigin(out) { return tip.getWorldPosition(out); },
  };
}
