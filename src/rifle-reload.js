import * as T from 'three';
import { reloadHand } from './reload-hand.js';
import { armChain, articulateFingers } from './hand-pose.js';

const v = (x, y, z) => new T.Vector3(x, y, z);
const ease = T.MathUtils.smoothstep;

// Settle the firing hand around the grip before reload poses capture their rest state.
export function fitRifleRightHand(rig) {
  const node = name => rig.getObjectByName(name), pos = name => node(name).getWorldPosition(v());
  const wrist = pos('Hand_R'), center = pos('Bone_R005').lerp(pos('Bone_R017'), .5);
  const along = center.clone().sub(wrist).normalize(), across = pos('Bone_R005').sub(pos('Bone_R017'));
  across.addScaledVector(along, -across.dot(along)).normalize();
  const home = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across, along, across.clone().cross(along)));
  const forward = v(-.05624,.11349,-.99195), pad = v(-.95610,.28006,.08625);
  const target = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(forward.clone().cross(pad), forward, pad));
  const turn = target.clone().multiply(home.invert());
  wrist.sub(center).applyQuaternion(turn).add(v(.050956,-.194540,-.216961));
  const orient = turn.clone().multiply(node('IK_Hand_Cntrl_R').getWorldQuaternion(new T.Quaternion()));
  armChain(rig, 'R', true)(pos('UpArm_R'), wrist, orient, undefined, 1, 1);
  rig.updateMatrixWorld(true);
  articulateFingers(rig, 'R', target,
    [[-3.74,-15,47.87,37.30],[12.61,26.02,66.88,59.63],
      [12.61,23.56,83.07,59.53],[12.61,46.21,75.76,54.68]],
    new T.Quaternion(-.58010,-.77228,-.15509,.20740).normalize(), [63.03,42.72]);
  rig.updateMatrixWorld(true);
}

export function makeRifleReload(rig, mag, spare, bolt) {
  const left = reloadHand(rig, 'L', true), right = reloadHand(rig, 'R', true);
  const home = mag.position.clone(), seated = mag.quaternion.clone(), boltHome = bolt.position.clone();
  const mount = new T.Object3D(), freshMount = new T.Object3D();
  mount.position.copy(home);
  freshMount.position.copy(home);
  // Cup the front spine from the left. The thumb braces the near flat
  // while the four fingers curl around the edge onto the opposite flat.
  // Degrees: MCP spread, MCP flexion, PIP flexion, DIP flexion.
  const curls = [[12.03,25.78,70.16,52.05],[12.03,25.78,85.94,43.19],
    [12.03,26.97,85.94,43.03],[12.03,34.66,56.12,57.30]];
  // Angle the palm inward from the player's left so the cuff sits below-left
  // of the magazine and the elbow can follow the same approach.
  const knuckles = v(-.05290,-.22791,-.64906), along = v(.51161,.66324,-.54623), inward = v(.84296,-.26437,.46854);
  const thumb = new T.Quaternion(-.24519,-.41588,-.47763,.73402).normalize();
  const grasp = left.articulated(mount, knuckles, along, inward, curls, thumb, [14.90,5.73]);
  // Open the web of the hand ahead of the magazine before sliding onto the flats.
  // Moving around its front edge gives the fingers clearance before they close.
  const open = curls.map(([spread]) => [spread,16,24,14]);
  const around = left.articulated(mount, knuckles, along, inward, open, thumb, [0,0]);
  grasp.release = around.fingers;
  around.release = around.fingers;
  around.point.add(v(-.055,-.045,-.145));
  // Index and middle fingers hook the front of the handle. Ring and little
  // fingers stay softly folded outside the receiver; the thumb clears its top.
  const chargePoint = v(.156536,.094229,-.559905);
  const chargeForward = v(.026126,.151916,-.988048), chargePad = v(-.572772,-.807784,-.139345);
  const chargeThumb = new T.Quaternion(-.645063,-.734833,.074959,.195694).normalize();
  const charge = right.articulated(bolt, chargePoint, chargeForward, chargePad,
    [[12,26.11,48.38,39.48],[-10.5,23,57.92,44.02],
      [0,75,89.46,55.83],[0,75,89.46,55.83]], chargeThumb, [50.09,46.83]);
  const clear = right.articulated(bolt, chargePoint, chargeForward, chargePad,
    [[12,12,24,16],[-10.5,12,28,18],
      [0,65,75,50],[0,65,75,50]], chargeThumb, [40,30]);
  clear.point.add(v(.055,.018,.035));
  charge.release = clear.fingers;
  clear.release = clear.fingers;
  // Release in gun space at the rear stop. The hand must not follow the
  // spring-driven handle forward once the two fingertips have lifted away.
  const released = { ...charge, fingers: clear.fingers, part: null, followRoll: false,
    point: charge.point.clone().add(boltHome).add(v(0,0,.15)) };
  const withdrawn = { ...released, point: released.point.clone().add(v(.055,.018,.035)) };
  const catchMag = .16, unlocked = .235, extracted = .295, drop = .325;
  const pocket = .445, pickUp = .475, lift = .50, frontIn = .645, latched = .715;
  const support = .815, catchBolt = .881, boltBack = .921, letGo = .929;
  const unclasp = { ...grasp, fingers: around.fingers };
  const freshGrasp = { ...grasp, part: freshMount };
  const freshOpen = { ...unclasp, part: freshMount };
  const freshAround = { ...around, part: freshMount };
  // Open on the removed magazine, leave it behind, then close on a different
  // magazine below the screen before bringing it up to the front lug.
  const change = [[0,left.rest], [.103,around,v(-.10,-.035,.100)],
    [catchMag,grasp], [extracted,grasp], [drop,unclasp], [.36,unclasp],
    [pocket,freshOpen,v(-.055,-.035,.025)], [pickUp,freshOpen],
    [lift,freshGrasp], [latched,freshGrasp]];
  const leftKeys = [...change, [.735,freshOpen], [.77,freshAround], [support,left.rest,v(-.10,-.024,.098)]];
  const partialKeys = [...change, [.76,freshOpen], [.84,freshAround], [.955,left.rest,v(-.10,-.024,.098)]];
  const rightKeys = [[.79,right.rest], [.852,clear,v(.065,.020,.025)],
    [catchBolt,charge], [letGo,charge], [.942,released], [.963,withdrawn],
    [1,right.rest,v(.045,-.025,.025)]];
  const lug = v(0,-.055,-.555).sub(home), pivot = v(), xAxis = v(1,0,0), roll = new T.Quaternion();
  const gripWrist = grasp.point.clone().sub(grasp.offset.clone().applyQuaternion(grasp.orientation));
  const carriedWrist = v();
  // Reuse the two magazines. Let the spent one slip from the relaxed hand:
  // retain its release pose, with gravity and only a tiny residual angular drift.
  rig.updateMatrixWorld(true);
  const dropPivot = new T.Box3().setFromObject(mag).getCenter(v()).sub(home);
  const fallingCenter = v(), dropSpin = new T.Euler();
  function moveMount(part, travel, rock, fresh) {
    part.quaternion.setFromAxisAngle(xAxis,.24*rock);
    const sweep = Math.sin(Math.PI * travel);
    part.quaternion.premultiply(roll.setFromAxisAngle(T.Object3D.DEFAULT_UP,
      -.17*travel + (fresh ? -.11 : .06)*sweep));
    part.position.copy(home).add(lug).sub(pivot.copy(lug).applyQuaternion(part.quaternion));
    part.position.x -= .17*travel + (fresh ? .045 : .018)*sweep;
    part.position.y -= .37*travel;
    part.position.z += .20*travel;
    carriedWrist.copy(gripWrist).applyQuaternion(part.quaternion).add(part.position);
    part.quaternion.multiply(roll.setFromAxisAngle(xAxis, -1.25*ease(travel,.03,.90)));
    part.position.copy(carriedWrist).sub(pivot.copy(gripWrist).applyQuaternion(part.quaternion));
    if (fresh) {
      part.position.x -= .06*travel;
      part.position.y -= .20*travel;
      part.position.z += .30*travel;
    }
  }
  let active = false;
  return (phase, empty, cycle) => {
    const recoil = .115 * Math.sin(cycle * Math.PI);
    if (!active && phase === 0) {
      bolt.position.z = boltHome.z + recoil;
      return;
    }
    active = phase > 0;
    moveMount(mount, .30*ease(phase,unlocked-.012,extracted), ease(phase,catchMag,unlocked), false);
    moveMount(freshMount, 1-ease(phase,lift,frontIn), 1-ease(phase,frontIn,latched), true);
    spare.visible = phase >= pickUp && phase < latched;
    spare.position.copy(freshMount.position);
    spare.quaternion.copy(freshMount.quaternion).multiply(seated);
    mag.visible = phase < .60 || phase >= latched;
    if (phase >= latched || phase === 0) {
      mag.position.copy(home);
      mag.quaternion.copy(seated);
    } else if (phase < drop) {
      mag.position.copy(mount.position);
      mag.quaternion.copy(mount.quaternion).multiply(seated);
    } else {
      const elapsed = (phase-drop)*2.35*(empty ? 1 : .86);
      fallingCenter.copy(dropPivot).applyQuaternion(mount.quaternion).add(mount.position);
      fallingCenter.x -= .025*elapsed;
      fallingCenter.y -= .035*elapsed + .5*9.81*elapsed*elapsed;
      fallingCenter.z += .015*elapsed;
      mag.quaternion.copy(mount.quaternion).multiply(roll.setFromEuler(
        dropSpin.set(.14*elapsed,-.10*elapsed,.08*elapsed)));
      mag.position.copy(fallingCenter).sub(pivot.copy(dropPivot).applyQuaternion(mag.quaternion));
      mag.quaternion.multiply(seated);
    }
    const pull = empty ? ease(phase,catchBolt,boltBack) - ease(phase,.95,.971) : 0;
    bolt.position.z = boltHome.z + Math.max(recoil,.15*pull);
    left.update(phase, empty ? leftKeys : partialKeys);
    right.update(empty ? phase : 0, rightKeys);
  };
}
