import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { armChain, articulateFingers } from './hand-pose.js';

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

// Fit the oval handle into a power grip. Each finger curls in one MCP plane,
// while the thumb opposes the index across the handle, below the guard.
function closeFingers(rig, knife) {
  const at = name => rig.getObjectByName(name).getWorldPosition(v());
  const center = at('Bone_R005').lerp(at('Bone_R017'), .5);
  const forward = center.clone().sub(at('Hand_R')).normalize();
  const across = at('Bone_R005').sub(at('Bone_R017'));
  across.addScaledVector(forward, -across.dot(forward)).normalize();
  const frame = rot().setFromRotationMatrix(new T.Matrix4().makeBasis(
    across, forward, across.clone().cross(forward)));
  const along = v(-.242508,.930263,-.275320).normalize();
  const pad = v(.953816,.176765,-.242878);
  const gripAcross = along.clone().cross(pad).normalize();
  const gripFrame = rot().setFromRotationMatrix(new T.Matrix4().makeBasis(
    gripAcross, along, gripAcross.clone().cross(along)));
  const knifeTurn = frame.clone().multiply(gripFrame.invert());
  knife.position.copy(center).sub(v(-.025071,.015957,.004997).applyQuaternion(knifeTurn));
  knife.quaternion.copy(knifeTurn);
  articulateFingers(rig, 'R', frame,
    [[-1.08,52.36,77.85,52.80],[12,63.43,77.92,49.99],
      [12,69.44,74.01,47.08],[12,79.63,68.58,42.98]],
    rot().set(.486878,.800725,.221274,.269864).normalize(), [54.19,47.28]);
  rig.updateMatrixWorld(true);
  knife.updateMatrixWorld(true);
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
  const thumbRest = bindFrame.clone().invert().multiply(finger(20).getWorldQuaternion(rot()));
  const thumbGuard = rot().setFromUnitVectors(v(0,1,0).applyQuaternion(thumbRest), v(.81,.57,-.13).normalize()).multiply(thumbRest);
  articulateFingers(rig, 'L', bindFrame,
    [[5,12,22,14],[2,16,25,16],[-2,20,28,18],[-6,24,32,20]],
    thumbGuard, [12,16]);
  const joints = [5,9,13,17,20].flatMap(i => [finger(i),finger(i+1),finger(i+2)]);
  const relaxed = joints.map(bone => bone.quaternion.clone());
  articulateFingers(rig, 'L', bindFrame,
    [[5,20,30,19],[2,24,34,22],[-2,28,38,25],[-6,32,42,27]],
    thumbGuard, [18,22]);
  const braced = joints.map(bone => bone.quaternion.clone());
  joints.forEach((bone,i) => bone.quaternion.copy(relaxed[i]));
  rig.updateMatrixWorld(true);
  const guardForward = v(0.26, 0.49, -0.83).normalize();
  const guardAcross = v(0.94, 0.20, 0.30);
  guardAcross.addScaledVector(guardForward, -guardAcross.dot(guardForward)).normalize();
  const guardFrame = rot().setFromRotationMatrix(new T.Matrix4().makeBasis(
    guardAcross, guardForward, v().crossVectors(guardAcross, guardForward)));
  return {
    orientation: guardFrame.multiply(bindFrame.invert()).multiply(rig.getObjectByName('IK_Hand_Cntrl_L').getWorldQuaternion(rot())),
    flex(amount) {
      for (let i = 0; i < joints.length; i++) joints[i].quaternion.slerpQuaternions(relaxed[i], braced[i], amount);
    },
  };
}

export function installKnife(body, arms, asset, detailMap, gloveMaterial) {
  // This dedicated rig has complete, symmetric gloves and baked wrist-volume
  // correctives. It reuses the gun's textures without its baked contact dents.
  const rig = clone(arms.scene.getObjectByName('FPRig'));
  const gloves = rig.getObjectByName('FPArms');
  gloves.frustumCulled = false;
  gloves.material = gloveMaterial.clone();
  gloves.material.color.set(0xc0c4c1);
  rig.scale.setScalar(0.63);
  rig.position.set(0, 0.005, -0.07);
  const knife = asset.scene;
  bladeMaterial(knife, detailMap);
  const tip = knife.getObjectByName('BladeTip');
  body.add(rig, knife);
  const palm = rig.getObjectByName('Hand_R'), control = palm.parent;
  body.updateMatrixWorld(true);
  closeFingers(rig, knife);
  const gripToHand = knife.quaternion.clone().invert().multiply(control.getWorldQuaternion(rot()));
  palm.attach(knife);

  const leftGuard = openGuard(rig);
  const placeRight = armChain(rig, 'R', true), placeLeft = armChain(rig, 'L', true);
  // Knuckles face the player. The blade leaves the index side of the fist to the left.
  const guardZ = v(0.82, -0.35, 0.46).normalize();
  const guardX = v(0.62, -0.78, 0).cross(guardZ).normalize();
  const guard = rot().setFromRotationMatrix(new T.Matrix4().makeBasis(guardX, v().crossVectors(guardZ, guardX), guardZ));
  guard.multiply(rot().setFromAxisAngle(v(0, 0, 1), -1.93));
  // Keep the sharpened +Y bevel outward with the newly fitted hand.
  guard.multiply(rot().setFromAxisAngle(v(0, 0, 1), Math.PI));
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
    // Roll the shoulder forward as the fist crosses the body to lift the blade.
    const lift = T.MathUtils.smoothstep(t[1], 0.13, 0.35);
    const reach = T.MathUtils.smoothstep(poseTime, 0.015, 0.15) * (1 - T.MathUtils.smoothstep(poseTime, 0.36, 0.49));
    const weightShift = -(0.16 * Math.sin(t[1]) + 0.035 * lift) * narrow;
    const forward = 0.055 * reach + 0.080 * lift;
    body.scale.setScalar(scale * size);
    body.position.set(0, -0.155 * (1 - scale) + scale * (size - 1) * 0.17,
      -0.60 * (1 - scale) + scale * (size - 1) * 0.64);
    wrist.set(0.298 * narrow + weightShift - 0.19 * spread + 0.008 * bob * motion - swayX * 0.15,
      -0.247 + 0.054 * lift + 0.003 * Math.sin(time * 1.9) + 0.006 * strideLift * motion, -0.60 - forward);
    wrist.x += (1 - scale) * 0.040;
    shoulder.set(0.335 * narrow + weightShift - 0.19 * spread, -0.34 + 0.054 * lift, -0.30 - forward);
    // Keep the shoulder outside a portrait frame while the blade winds up.
    shoulder.x += (1 - scale) * (0.200 + 0.10 * lift);
    shoulder.y -= (1 - scale) * (0.12 + 0.035 * lift);
    delta.setFromEuler(euler.set(swayY * 0.55, swayX * 0.65, 0.018 * bob * motion));
    orient.copy(delta).multiply(guard).multiply(gripToHand);
    stroke.upper.setFromEuler(euler.set(t[0], t[1] * narrow, t[2]));
    stroke.lower.setFromEuler(euler.set(t[3], t[4] * narrow, 0));
    stroke.roll = t[5];
    placeRight(shoulder, wrist, orient, stroke, 1, 1);
    const retract = T.MathUtils.smoothstep(Math.abs(t[1]) + 0.3 * Math.abs(t[5]), 0, 0.70);
    shoulder.set(-0.42 * narrow + 0.28 * spread, -0.35, -0.245);
    shoulder.x -= (1 - scale) * 0.222;
    shoulder.y -= (1 - scale) * 0.12;
    wrist.set((-0.406 - 0.048 * retract) * narrow + 0.28 * spread - 0.006 * bob * motion,
      -0.250 - 0.038 * retract + 0.004 * strideLift * motion,
      -0.57 + 0.045 * retract);
    wrist.x -= (1 - scale) * 0.062;
    orient.setFromEuler(euler.set(-0.075 * retract, 0.07 * retract, 0)).multiply(leftGuard.orientation);
    leftGuard.flex(Math.min(1, retract * 1.8));
    placeLeft(shoulder, wrist, orient, undefined, 1, 1);
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
