import { Matrix4, Vector3 } from 'three';

const bloodUrl = '/effects/axe-hit/Bullet_Axe_Hit.efk';
const pickupUrl = '/effects/reward-coins/pickup/Coin_UP_Get_Flash.efk';

export async function loadCombatParticles(renderer, walletCanvas) {
  const runtime = window.effekseer;
  await new Promise((resolve, reject) =>
    runtime.initRuntime('/vendor/effekseer/effekseer.wasm', resolve, reject),
  );
  function makeContext(gl, instances, quads) {
    const context = runtime.createContext();
    context.init(gl, { instanceMaxCount: instances, squareMaxCount: quads });
    context.setRestorationOfStatesFlag(false);
    return context;
  }
  function load(context, url, scale) {
    return new Promise((resolve, reject) => {
      const effect = context.loadEffect(url, scale, () => resolve(effect),
        (message, path) => reject(new Error(`${message} (${path})`)),
        (path) => {
          const name = path.slice(path.lastIndexOf('/') + 1);
          return ['zombie_vfx_01.png', 'vfx_noise_009.png'].includes(name) ? '/effects/axe-hit/' + name : path;
        });
    });
  }
  const world = makeContext(renderer.getContext(), 768, 1400);
  // A small transparent HUD surface keeps the actual EFK above the opaque wallet panel.
  const gl = walletCanvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
  const hud = makeContext(gl, 128, 256);
  const [blood, pickup] = await Promise.all([load(world, bloodUrl, 0.62), load(hud, pickupUrl, 1)]);
  renderer.resetState();
  hud.setProjectionOrthographic(17, 17, 0.1, 150);
  hud.setCameraLookAt(0, 0, 60, 0, 0, 0, 0, 1, 0);
  gl.clearColor(0, 0, 0, 0);

  // One native arena per render surface and fixed tracking slots for live handles.
  const slots = (count) => Array.from({ length: count }, () => ({ handle: null, age: 0 }));
  const impacts = slots(3), pickups = slots(5);
  const officerSlots = slots(6);
  const effectMatrix = new Matrix4();
  const officerEffects = {
    aura:   { file: 'Z_039_Permanent_effects', scale: 1, life: Infinity, slot: 0 },
    intro:  { file: 'Z_039_ingame', scale: 1, life: 10, slot: 1 },
    strike: { file: 'Z_039_middle_reward', scale: 1, life: 3.1, slot: 2 },
    ring:   { file: 'Z_039_Big_rewward_Hit', scale: 1, life: 1.65, slot: 2 },
    prize:  { file: 'Coin_UP', scale: .44, life: 2 },
  };
  let nextPrizeSlot = 0;
  let officerAssets, loadingOfficer, officerVisible = false;
  function loadWarden() {
    loadingOfficer ??= Promise.all(Object.entries(officerEffects).map(async ([key, {file, scale}]) =>
      [key, await load(world, '/prison/fx/' + file + '.efk', scale)]))
      .then(entries=>{officerAssets=Object.fromEntries(entries);renderer.resetState();})
      .catch(error=>{loadingOfficer=null;throw error;});
    return loadingOfficer;
  }
  function wardenFx(name, anchor, impactPoint) {
    const spec = officerEffects[name];
    if (name === 'strike' || name === 'prize') {
      const entrance = officerSlots[officerEffects.intro.slot];
      entrance.handle?.stop();
      entrance.handle = entrance.anchor = null;
    }
    const index = spec.slot ?? 3 + (nextPrizeSlot++ % 3);
    const slot = officerSlots[index];
    slot.handle?.stop();
    // A local EFK follows the rig. A hit takes a snapshot of the boss's facing/scale
    // at the locked world position, independent of later turns and steps.
    anchor.updateWorldMatrix(true, false);
    effectMatrix.copy(anchor.matrixWorld);
    if (impactPoint) effectMatrix.setPosition(impactPoint);
    const m = effectMatrix.elements;
    slot.handle = world.play(officerAssets[name], m[12], m[13], m[14]);
    slot.handle?.setMatrix(m);
    slot.anchor = impactPoint ? null : anchor;
    slot.age = 0;
    slot.life = spec.life;
    if(slot.handle)officerVisible=true;
  }
  function syncWardenEffects() {
    for (const slot of officerSlots) {
      if (!slot.anchor || !slot.handle) continue;
      if (slot === officerSlots[0] && !slot.handle.exists) {
        wardenFx('aura', slot.anchor);
      } else {
        slot.anchor.updateWorldMatrix(true, false);
        slot.handle.setMatrix(slot.anchor.matrixWorld.elements);
      }
    }
  }
  function stopWarden(){
    for(const s of officerSlots){s.handle?.stop();s.handle=null;s.anchor=null;}
    officerVisible=false;
  }
  const origin = new Vector3();
  let cooldown = 0, bloodVisible = false, pickupVisible = false, clearPickup = false;
  function playBlood(position, normal, target) {
    let slot = impacts[0];
    for (const other of impacts) {
      if (!other.handle) { slot = other; break; }
      if (other.age > slot.age) slot = other;
    }
    slot.handle?.stop();
    origin.copy(position).addScaledVector(normal, 0.04);
    slot.handle = world.play(blood, origin.x, origin.y, origin.z);
    if (slot.handle && target?.boss) {
      target.model.updateWorldMatrix(true, false);
      effectMatrix.copy(target.model.matrixWorld).setPosition(origin);
      slot.handle.setMatrix(effectMatrix.elements);
    }
    slot.age = 0;
    if (slot.handle) bloodVisible = true;
  }
  function playCoinPickup() {
    if (cooldown > 0) return;
    for (const slot of pickups) {
      if (slot.handle) continue;
      const handle = hud.play(pickup, 0, 0, 0);
      if (handle) {
        const size = 0.8 + Math.random() * 0.4;
        handle.setScale(size, size, size);
        handle.setRotation(0, 0, Math.random() * Math.PI * 2);
        slot.handle = handle;
        slot.age = 0;
        cooldown = 0.2;
        pickupVisible = true;
      }
      return;
    }
  }
  function advance(pool, dt, lifetime) {
    let visible = false;
    for (const slot of pool) {
      if (!slot.handle) continue;
      slot.age += dt;
      if (!slot.handle.exists || slot.age >= (slot.life ?? lifetime)) {
        slot.handle.stop();
        slot.handle = null;
      } else visible = true;
    }
    return visible;
  }
  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (bloodVisible || officerVisible) {
      if (officerVisible) syncWardenEffects();
      bloodVisible=advance(impacts,dt,1);officerVisible=advance(officerSlots,dt,1);
      world.update(dt*60);
    }
    if (pickupVisible) {
      pickupVisible = advance(pickups, dt, 1.5);
      hud.update(dt*60);
      clearPickup = true;
    }
  }
  function render(camera) {
    if (bloodVisible || officerVisible) {
      world.setProjectionMatrix(camera.projectionMatrix.elements);
      world.setCameraMatrix(camera.matrixWorldInverse.elements);
      world.draw();
      renderer.resetState();
    }
    if (clearPickup || pickupVisible) {
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (pickupVisible) hud.draw();
      clearPickup = false;
    }
  }
  function clearWorld(){
    stopWarden();
    for(const pool of [impacts,pickups])for(const s of pool){s.handle?.stop();s.handle=null;}
    bloodVisible=pickupVisible=false;clearPickup=true;cooldown=0;
    world.update(1);hud.update(1);
  }
  return { playBlood, playCoinPickup, update, render, loadWarden, wardenFx, stopWarden, clearWorld };
}

