import * as T from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { installMachineGun } from './machine-gun.js';
import { installKnife, knifeContactTime } from './knife.js';
import { installWeapon } from './weapon-rig.js';
import { muzzleFlash } from './muzzle-flash.js';
import { getSmokeTexture } from './effects.js';

export const startingWeapon = 'rifle';
export const weapons = {
  pistol: {
    name: 'P12 戰術手槍',
    code: 'P12',
    family: '半自動手槍',
    mag: 12,
    delay: 0.36,
    damage: 25,
    cost: 1,
    price: 0,
    reload: 1.65,
  },
  knife: {
    name: 'KA-BAR 戰鬥刀',
    code: 'KA-BAR',
    family: '近戰武器',
    damage: 42,
    delay: 0.52,
    reach: 2.5,
    contactTime: knifeContactTime,
    cost: 0,
    price: 0,
  },
  rifle: {
    name: 'AK-47 突擊步槍',
    code: 'AK-47',
    family: '全自動步槍',
    mag: 30,
    delay: 0.115,
    damage: 19,
    cost: 2,
    price: 0,
    reload: 2.35,
    aimFov: 41,
  },
  mg3: {
    name: 'MG3 重機槍',
    code: 'MG3',
    family: '全自動重機槍',
    mag: 200,
    delay: 0.075,
    damage: 21,
    cost: 2,
    price: 450,
    reload: 4.8,
    aimFov: 49,
  },
};

export async function makeViewmodel(worldScene, worldCamera, sun) {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(59, 1, 0.01, 4),
    carrier = new T.Group(),
    root = new T.Group();
  scene.add(carrier);
  carrier.add(root);
  const key = new T.DirectionalLight(0xffe5c5, 2.2),
    rim = new T.DirectionalLight(0xbdd8ed, 1.12);
  const fillDirection = new T.Vector3(-2, 4, 0.7).normalize();
  const cameraInverse = new T.Quaternion(), skyRotation = new T.Quaternion();
  key.position.copy(fillDirection);
  rim.position.set(2, 1, -2);
  scene.add(key, rim, new T.HemisphereLight(0xe2edfc, 0x916e4f, 1.12));
  const bodies = { pistol: new T.Group(), rifle: new T.Group(), knife: new T.Group(), mg3: new T.Group() };
  root.add(...Object.values(bodies));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [pistol, ak, knife, detailMap, knifeArms] = await Promise.all([
    ...['p226', 'ak47', 'kabar'].map((id) => loader.loadAsync('/viewmodel/' + id + '.glb')),
    new T.TextureLoader().loadAsync('/viewmodel/ak-finish.webp'),
    loader.loadAsync('/viewmodel/knife-arms.glb'),
  ]);
  detailMap.wrapS = detailMap.wrapT = T.RepeatWrapping;
  detailMap.anisotropy = 4;
  // The two long guns share the glove geometry and textures, but pose independent bones.
  const machineArms = clone(ak.scene.getObjectByName('FPRig'));
  const rigs = {
    knife: installKnife(bodies.knife, knifeArms, knife, detailMap, ak.scene.getObjectByName('FPArms').material),
    pistol: installWeapon(bodies.pistol, pistol, false),
    rifle: installWeapon(bodies.rifle, ak, true, detailMap),
  };
  const flash = muzzleFlash(scene),
    muzzle = new T.Vector3();
  const vapors = Array.from({ length: 5 }, () => {
    const sprite = new T.Sprite(
      new T.SpriteMaterial({
        map: getSmokeTexture(),
        color: 0xb8ae98,
        transparent: true,
        depthWrite: false,
      }),
    );
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, age: 1, drift: 0 };
  });
  const brass = new T.MeshStandardMaterial({ color: 0xd2a85e, metalness: 0.76, roughness: 0.35 });
  const casingGeo = new T.CylinderGeometry(0.005, 0.006, 0.026, 9);
  const casings = Array.from({ length: 7 }, () => {
    const mesh = new T.Mesh(casingGeo, brass);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, velocity: new T.Vector3() };
  });

  const holsterTime = 0.13, drawTime = 0.26;
  let current = startingWeapon, selected = current, lowered = 0,
    recoil = 0,
    recoilSpeed = 0,
    roll = 0,
    cycle = 1,
    time = 0,
    shellIndex = 0;
  const s = T.MathUtils.smoothstep,
    lerp = T.MathUtils.lerp;
  function equip(id) {
    if (id === 'mg3' && !rigs.mg3) rigs.mg3 = installMachineGun(bodies.mg3, machineArms);
    selected = id;
    flash.clear();
  }
  function isReady() {
    return selected === current && lowered === 0;
  }
  function changeInHolster() {
    bodies[current].visible = false;
    current = selected;
    bodies[current].visible = true;
    cycle = 1;
    recoil = recoilSpeed = 0;
    if (current === 'knife') rigs.knife.reset();
  }
  function updateDraw(dt) {
    if (selected !== current) {
      const remaining = (1 - lowered) * holsterTime;
      if (dt < remaining) {
        lowered += dt / holsterTime;
        dt = 0;
      } else {
        lowered = 1;
        changeInHolster();
        dt -= remaining;
      }
    }
    lowered = Math.max(0, lowered - dt / drawTime);
    const dip = s(lowered, 0, 1);
    carrier.position.set(0.025 * dip, -0.84 * dip, 0.036 * dip);
    carrier.rotation.set(-0.31 * dip, 0.045 * dip, -0.11 * dip);
  }
  for (const [id, body] of Object.entries(bodies)) body.visible = id === current;
  function shoot() {
    if (current === 'knife') {
      rigs.knife.swing();
      return;
    }
    const longGun = current === 'rifle' || current === 'mg3',
      body = bodies[current],
      rig = rigs[current];
    recoilSpeed += current === 'mg3' ? 48 : longGun ? 42 : 65;
    roll = (Math.random() - 0.5) * 0.042;
    cycle = 0;
    flash.fire(longGun);
    const vapor = vapors[shellIndex % vapors.length];
    vapor.age = 0;
    vapor.drift = (Math.random() - 0.5) * 0.09;
    body.localToWorld(vapor.sprite.position.copy(rig.tip));
    vapor.sprite.material.rotation = Math.random() * 6.28;
    const shell = casings[shellIndex++ % casings.length];
    shell.life = 0.43;
    shell.mesh.visible = true;
    body.localToWorld(shell.mesh.position.copy(rig.port));
    shell.velocity.set(0.58 + Math.random() * 0.27, 0.46 + Math.random() * 0.17, 0.06);
  }
  function muzzleOrigin(worldCamera, out) {
    if (current === 'knife') rigs.knife.tipOrigin(out);
    else bodies[current].localToWorld(out.copy(rigs[current].tip));
    out.project(camera);
    out.z = 0;
    out.unproject(worldCamera).sub(worldCamera.position).normalize();
    return out.multiplyScalar(0.72).add(worldCamera.position);
  }
  function render(
    renderer, dt, moving, phase, empty, ads, steerX, steerY,
    stride = 0, grounded = true, rounds = 0,
  ) {
    updateDraw(dt);
    const machineGun = current === 'mg3',
      longGun = current === 'rifle' || machineGun,
      rig = rigs[current];
    const stiffness = longGun ? 31 : 25,
      decay = Math.exp(-stiffness * dt),
      travel = recoilSpeed + stiffness * recoil;
    recoil = (recoil + travel * dt) * decay;
    recoilSpeed = (recoilSpeed - stiffness * travel * dt) * decay;
    cycle = Math.min(1, cycle + dt / (machineGun ? weapons.mg3.delay : 0.092));
    time += dt;
    const tilt = s(phase, 0, 0.21) * (1 - s(phase, 0.77, 1));
    // Keep the gun, skinned hands and effect sockets in the same scaled space.
    const aspect = worldCamera.aspect, wide = s(aspect, 0.52, 1.48);
    const gunScale = longGun ? lerp(1.13, 1.36, wide) : lerp(1.20, 1.39, wide);
    if (current !== 'knife') bodies[current].scale.setScalar(gunScale);
    if (current === selected) {
      camera.fov = longGun ? lerp(lerp(58, 53.5, wide), 59, ads) : current === 'knife' ? 59 : lerp(58, 54.5, wide);
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    scene.environment = worldScene.environment;
    scene.environmentIntensity = machineGun ? 0.84 : current === 'knife' ? 0.67 : 0.96;
    if (current !== 'pistol') {
      // Keep reflections anchored to the map as the weapon turns in the player's hands.
      worldCamera.getWorldQuaternion(cameraInverse).invert();
      skyRotation.setFromEuler(worldScene.environmentRotation).premultiply(cameraInverse);
      scene.environmentRotation.setFromQuaternion(skyRotation);
      key.position.subVectors(sun.position, sun.target.position).normalize()
        .applyQuaternion(cameraInverse).lerp(fillDirection, 0.27);
    } else {
      scene.environmentRotation.set(0, 0, 0);
      key.position.copy(fillDirection);
    }
    // Hold the outgoing bones in their last pose until the model is below the screen.
    if (current === selected && current === 'knife') {
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      rig.update(dt, grounded ? moving : 0, aspect, steerX, steerY, stride);
    } else if (current === selected) {
      if (!longGun) ads = 0;
      rig.pose(phase, empty, cycle, ads, rounds);
      const freedom = 1 - ads,
        narrow = Math.min(1, aspect / 1.4);
      root.position.set(
        lerp((machineGun ? 0.155 : longGun ? 0.142 : 0.137) * narrow, 0, ads) +
          freedom * Math.sin(time * 9) * 0.006 * moving -
          0.077 * tilt,
        lerp(machineGun ? -0.222 : longGun ? -0.202 : -0.160, -rig.sightY * gunScale, ads) -
          freedom * Math.abs(Math.cos(time * 9)) * 0.006 * moving +
          (machineGun ? 0.055 : longGun ? 0.084 : 0.062) * tilt +
          0.012 * (s(phase, 0.64, 0.67) - s(phase, 0.67, 0.75)),
        lerp(machineGun ? -0.545 : longGun ? lerp(-0.505, -0.472, wide) : -0.385, (machineGun ? -0.29 : -0.149) * gunScale, ads) +
          recoil * 0.026 - (machineGun ? 0.21 : longGun ? 0.14 : 0.09) * tilt,
      );
      root.rotation.set(
        freedom * (machineGun ? -0.005 : longGun ? 0.061 : 0.018) + recoil * lerp(0.089, machineGun ? 0.009 : 0.028, ads) + tilt * (machineGun ? 0.12 : 0.18) + steerY * freedom,
        freedom * (longGun ? 0.139 * narrow : 0.055) + steerX * freedom + tilt * (current === 'rifle' ? .18 : .34),
        tilt * (current === 'rifle' ? .10 : .25) +
          recoil * roll +
          (empty ? 0.1 * (s(phase, 0.73, 0.81) - s(phase, 0.89, 0.97)) : 0),
      );
    }
    carrier.updateMatrixWorld(true);
    if (current !== 'knife')
      flash.update(bodies[current].localToWorld(muzzle.copy(rig.tip)), dt, ads, gunScale);
    for (const v of vapors) {
      v.age += dt;
      v.sprite.visible = v.age < 0.35;
      if (!v.sprite.visible) continue;
      v.sprite.position.y += dt * 0.15;
      v.sprite.position.z -= dt * 0.21;
      v.sprite.position.x += dt * v.drift;
      v.sprite.scale.setScalar(0.045 + v.age * 0.32);
      v.sprite.material.opacity = 0.15 * (1 - v.age / 0.35);
    }
    for (const shell of casings) {
      if (!shell.mesh.visible) continue;
      shell.life -= dt;
      shell.mesh.visible = shell.life > 0;
      shell.velocity.y -= 2.9 * dt;
      shell.mesh.position.addScaledVector(shell.velocity, dt);
      shell.mesh.rotation.x += dt * 16;
      shell.mesh.rotation.z += dt * 21;
    }
    renderer.clearDepth();
    renderer.render(scene, camera);
  }
  function setWorld(scene, light) { worldScene=scene; sun=light; }
  return { render, equip, shoot, muzzleOrigin, isReady, setWorld, meleeImpact: rigs.knife.impact };
}
