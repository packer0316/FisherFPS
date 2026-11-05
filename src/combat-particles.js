import { Vector3 } from 'three';

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
        (path) => path.endsWith('/zombie_vfx_01.png') ? '/effects/axe-hit/zombie_vfx_01.png' : path);
    });
  }
  const world = makeContext(renderer.getContext(), 512, 1024);
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
  const origin = new Vector3();
  let cooldown = 0, bloodVisible = false, pickupVisible = false, clearPickup = false;
  function playBlood(position, normal) {
    let slot = impacts[0];
    for (const other of impacts) {
      if (!other.handle) { slot = other; break; }
      if (other.age > slot.age) slot = other;
    }
    slot.handle?.stop();
    origin.copy(position).addScaledVector(normal, 0.04);
    slot.handle = world.play(blood, origin.x, origin.y, origin.z);
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
  function advance(context, pool, dt, lifetime) {
    let visible = false;
    for (const slot of pool) {
      if (!slot.handle) continue;
      slot.age += dt;
      if (!slot.handle.exists || slot.age >= lifetime) {
        slot.handle.stop();
        slot.handle = null;
      } else visible = true;
    }
    context.update(dt * 60);
    return visible;
  }
  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (bloodVisible) bloodVisible = advance(world, impacts, dt, 1);
    if (pickupVisible) {
      pickupVisible = advance(hud, pickups, dt, 1.5);
      clearPickup = true;
    }
  }
  function render(camera) {
    if (bloodVisible) {
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
  return { playBlood, playCoinPickup, update, render };
}

