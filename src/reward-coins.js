import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import vertexShader from './shaders/reward-coins/coin.vert?raw';
import originalFragment from './shaders/reward-coins/unlitCustom.frag?raw';
import shadowFragment from './shaders/reward-coins/shadow.frag?raw';
import { makeBossCoinPlan, bossCollectCadence } from './boss-payout.js';
import { makeCoinFloor, clearCoinFloor } from './reward-coin-clearance.js';

const path = 'effects/reward-coins/';
const unit = 0.05; // Metres per TMDC board unit, shared by the model and the trajectories.
const turn = 2 * Math.PI;
const flyTime = 0.6;
const lerp = T.MathUtils.lerp;
const random = T.MathUtils.randFloat;

function jump(t, high, low) {
  // DropItemMgr.GetRootJumpHeight uses three cubic bounces.
  if (t < 0.25) return high * (1 - (1 - t / 0.25) ** 3);
  if (t < 0.50) return high * (1 - ((t - 0.25) / 0.25) ** 3);
  if (t < 0.65) return low * (1 - (1 - (t - 0.50) / 0.15) ** 3);
  if (t < 0.80) return low * (1 - ((t - 0.65) / 0.15) ** 3);
  if (t < 0.85) return high * 0.15 * (1 - (1 - (t - 0.80) / 0.05) ** 3);
  if (t < 0.90) return high * 0.15 * (1 - ((t - 0.85) / 0.05) ** 3);
  return 0;
}

function batch(scene, name, geometry, material, capacity) {
  const mesh = new T.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.userData.uploadRange = { start: 0, count: 0 };
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function submit(mesh, count) {
  mesh.visible = count > 0;
  mesh.count = count;
  if (!count) return;
  // Three clears this list after each upload. Reuse the range descriptor as well.
  mesh.userData.uploadRange.count = count * 16;
  mesh.instanceMatrix.updateRanges[0] = mesh.userData.uploadRange;
  mesh.instanceMatrix.needsUpdate = true;
}

export async function loadRewardCoins(scene, world, camera, coarse) {
  const loader = new T.TextureLoader();
  const [asset, base, normal, add, multiply] = await Promise.all([
    new GLTFLoader().loadAsync(path + 'starcain_low.glb'),
    ...['starcain_.jpg', 'starcain_Normal_.jpg', 'Matcap_03_2.jpg', 'Matcap_coin_01_3.jpg'].map((name) => loader.loadAsync(path + name)),
  ]);
  for (const texture of [base, normal, add, multiply]) texture.flipY = false;
  const geometry = asset.scene.children[0].geometry;
  geometry.computeBoundingBox();
  const coinMinY=geometry.boundingBox.min.y,coinRadius=Math.hypot(
    Math.max(Math.abs(geometry.boundingBox.min.x),Math.abs(geometry.boundingBox.max.x)),
    Math.max(Math.abs(geometry.boundingBox.min.z),Math.abs(geometry.boundingBox.max.z)));
  const coinFloor=makeCoinFloor(world);
  const material = new T.RawShaderMaterial({
    vertexShader,
    fragmentShader: 'precision highp float;\nuniform mat4 viewMatrix;\n' +
      '#define CC_PMatrix viewMatrix\nuniform sampler2D CC_Texture0;\n' + originalFragment,
    uniforms: {
      CC_Texture0: { value: base }, u_normalMapTexture: { value: normal },
      u_matcapTexture: { value: add }, u_matcapTextureMul: { value: multiply },
      u_multColor: { value: new T.Vector3(1, 1, 1) }, u_color: { value: new T.Vector4(1, 1, 1, 1) },
      u_matcapScalar: { value: 1 }, u_matcapScalarMul: { value: 1.3 },
      normalMapStrength: { value: 1 },
    },
  });
  // 150 boss coins plus ordinary in-flight drops, also on mobile.
  const capacity = world.bossArena ? 256 : coarse ? 96 : 160;
  const coins = batch(scene, 'starcain_low', geometry, material, capacity);
  const opacity = new T.InstancedBufferAttribute(new Float32Array(capacity), 1)
    .setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('coinOpacity', opacity);
  const fadeMaterial = new T.RawShaderMaterial({
    vertexShader, uniforms: material.uniforms, defines: { COIN_FADE: 1 },
    transparent: true, depthWrite: false,
    fragmentShader: 'varying mediump float v_opacity;\n#define main shadeCoin\n' +
      material.fragmentShader + '\n#undef main\nvoid main(){ shadeCoin(); gl_FragColor.a *= v_opacity; }',
  });
  const fadingCoins = batch(scene, 'Coin camera fade', geometry, fadeMaterial, capacity);
  const shadows = batch(scene, 'Coin drop shadows', geometry, new T.RawShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: `precision highp float;
      uniform mat4 projectionMatrix, viewMatrix;
      attribute vec3 position;
      attribute mat4 instanceMatrix;
      void main() { gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: 'precision mediump float;\n' + shadowFragment,
    uniforms: { shadowColor: { value: new T.Vector3(0.12, 0.10, 0.08) },
      u_color: { value: new T.Vector4(1, 1, 1, 1) }, u_shadowAlpha: { value: 0.45 } },
  }), capacity);
  const pool = Array.from({ length: capacity }, () => ({
    age: 0, x: 0, y: 0, z: 0, floorY: 0, dx: 0, dy: 0, dz: 0, slopeX: 0, slopeZ: 0,
    size: 1, scatter: 0, flyAt: 0, high: 0, low: 0, angle: 0, alpha: 1,
    boss: false, index: 0, value: 0,
  }));
  const goal = new T.Vector3(), goalLocal = new T.Vector3(), launchLocal = new T.Vector3();
  const walletNdc = new T.Vector2(), pose = new T.Object3D(), projection = new T.Matrix4();
  let active = 0, walletHeight = 0;
  let bossShower=null;

  function setWalletTarget(iconRect, canvasRect) {
    walletHeight = iconRect.height / canvasRect.height;
    walletNdc.set(2 * (iconRect.left + iconRect.width / 2 - canvasRect.left) / canvasRect.width - 1,
      1 - 2 * (iconRect.top + iconRect.height / 2 - canvasRect.top) / canvasRect.height);
  }

  function spawn(origin, dx, dz, big, index, floorY) {
    if (active === capacity) return;
    const s = pool[active++];
    s.boss=false;s.value=0;
    s.x = origin.x; s.y = origin.y; s.z = origin.z;s.lastBottom=origin.y;
    s.floorY = floorY;
    // Stop the fan at cover. Query terrain at spawn time rather than raycasting every frame.
    for (let step = 1; step <= 4; step++) {
      const t = step / 4;
      if (world.blocked(s.x + dx * t, s.z + dz * t, 0.16, s.y, 0.55, 0.6)) {
        dx *= (step - 1) / 4; dz *= (step - 1) / 4;
        break;
      }
    }
    s.dx = dx; s.dz = dz;
    const endX = s.x + dx, endZ = s.z + dz;
    const ground = coinFloor(endX, endZ, Math.max(floorY,s.y));
    s.dy = ground - s.y;
    s.slopeX = T.MathUtils.clamp((world.terrainHeight(endX + 0.08, endZ, ground) - ground) / 0.08, -1, 1);
    s.slopeZ = T.MathUtils.clamp((world.terrainHeight(endX, endZ + 0.08, ground) - ground) / 0.08, -1, 1);
    s.size = big ? 2 : 1;
    s.alpha = 1;
    s.age = big ? 0 : -index * 0.03;
    s.scatter = big ? 0.8 : 0.9;
    s.flyAt = 2 * s.scatter + index * 0.05;
    s.high = (big ? 45 : random(20, 45)) * unit;
    s.low = (big ? 30 : random(8, 18)) * unit;
    s.angle = random(0, turn);
  }

  function burst(origin, largeKill, prize) {
    const smallCoins = prize?.smallCoins ?? (largeKill ? 7 : 3);
    const bigCoins = prize?.bigCoins ?? (largeKill ? 2 : 0);
    const floorY = prize?.floorY ?? origin.y;
    // Keep a full new boss payout visible even if several bursts overlap on a small pool.
    if (prize && !bossShower) {
      while (active + smallCoins + bigCoins > capacity) {
        let earliest = 0;
        for (let i = 1; i < active; i++) {
          if (pool[i].flyAt - pool[i].age < pool[earliest].flyAt - pool[earliest].age) earliest = i;
        }
        const retired = pool[earliest];
        pool[earliest] = pool[--active];
        pool[active] = retired;
      }
    }
    const range = (bigCoins ? 30 : 25) * unit;
    let fx = camera.position.x - origin.x, fz = camera.position.z - origin.z;
    const length = Math.hypot(fx, fz);
    if (length > 0) { fx /= length; fz /= length; }
    else { fx = 0; fz = 1; }
    let angle = 0;
    for (let i = 0; i < bigCoins && active < capacity; i++) {
      const distance = random(15, 30) * unit;
      angle += Math.PI * random(0.3, 0.9);
      spawn(origin, Math.cos(angle) * distance, Math.sin(angle) * distance, true, i, floorY);
    }
    for (let i = 0; i < smallCoins && active < capacity; i++) {
      const side = random(-range, range), forward = random(0, range);
      spawn(origin, fz * side + fx * forward, -fx * side + fz * forward, false, i, floorY);
    }
  }

  function burstBoss(origin,amount,count) {
    const plan=makeBossCoinPlan(origin,world,amount,count);
    // Keep concurrent normal kills visible, reserving space for the entire boss shower.
    while(active+plan.count>capacity) {
      let oldest=0;
      for(let i=1;i<active;i++)if(pool[i].age>pool[oldest].age)oldest=i;
      const retired=pool[oldest];pool[oldest]=pool[--active];pool[active]=retired;
    }
    bossShower={age:0,plan,collecting:false,revealPending:false,remaining:plan.count};
    for(const p of plan.points) {
      const s=pool[active++];
      Object.assign(s,{boss:true,index:p.index,value:p.value,x:origin.x,y:origin.y+.4,z:origin.z,
        dx:p.x-origin.x,dy:p.y-origin.y-.4,dz:p.z-origin.z,floorY:origin.y,
        slopeX:0,slopeZ:0,size:p.big?2:1,alpha:1,age:-p.delay,scatter:.9,
        flyAt:Infinity,high:p.high,low:p.high*.35,angle:random(0,turn),lastBottom:origin.y});
    }
    return plan;
  }
  function collectBoss() {
    if(!bossShower||bossShower.collecting)return;
    bossShower.collecting=true;
    for(let i=0;i<active;i++)if(pool[i].boss)pool[i].flyAt=pool[i].age+pool[i].index*bossCollectCadence;
  }
  function takeBossReveal() {
    if(!bossShower?.revealPending)return false;
    bossShower.revealPending=false;return true;
  }
  function update(dt, playPickup, creditBoss) {
    if (!active) return;
    if(bossShower&&!bossShower.collecting) {
      const before=bossShower.age;bossShower.age+=dt;
      if(before<bossShower.plan.revealAt&&bossShower.age>=bossShower.plan.revealAt)bossShower.revealPending=true;
    }
    const depth = 0.92;
    const halfHeight = depth * Math.tan(camera.fov * Math.PI / 360);
    goalLocal.set(walletNdc.x * halfHeight * camera.aspect, walletNdc.y * halfHeight, -depth);
    goal.copy(goalLocal).applyMatrix4(camera.matrixWorld);
    let drawn = 0, fading = 0, grounded = 0;
    for (let i = 0; i < active;) {
      const s = pool[i];
      s.age += dt;
      if (s.age >= s.flyAt + flyTime) {
        playPickup();
        if(s.boss) {
          creditBoss?.(s.index,s.value);
          if(bossShower&&--bossShower.remaining===0)bossShower=null;
        }
        pool[i] = pool[--active];
        pool[active] = s;
        continue;
      }
      i++;
      if (s.age < 0) continue;
      const scatter = Math.min(1, s.age / s.scatter);
      const flight = Math.max(0, (s.age - s.flyAt) / flyTime);
      const baseHeight = s.y + s.dy * scatter;
      const x = s.x + s.dx * scatter, z = s.z + s.dz * scatter;
      const y = baseHeight + 5 * unit * s.size + jump(s.age, s.high, s.low);
      let travel = flight;
      if (flight > 0) {
        // Reserve the final 0.2 s for the last metre, even for kills across the map.
        const distance = Math.hypot(x - goal.x, y - goal.y, z - goal.z);
        const tail = Math.min(1 / 3, 1.15 / Math.max(distance, 0.001));
        travel = flight < 2 / 3 ? flight * 1.5 * (1 - tail)
          : 1 - tail * ((1 - flight) * 3) ** 1.3;
      }
      pose.position.set(lerp(x, goal.x, travel), lerp(y, goal.y, travel), lerp(z, goal.z, travel));
      let size = 0.12 * unit * s.size;
      if(s.boss)size*=T.MathUtils.smoothstep(s.age,0,.12);
      if (flight > 0) {
        // Guide visible coins across the screen continuously even when the kill was far away.
        launchLocal.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        if (launchLocal.z < -camera.near) {
          const zDepth = lerp(-launchLocal.z, depth, travel);
          const progress = T.MathUtils.smoothstep(flight, 0, 1);
          pose.position.set(
            zDepth * lerp(launchLocal.x / -launchLocal.z, goalLocal.x / depth, progress),
            zDepth * lerp(launchLocal.y / -launchLocal.z, goalLocal.y / depth, progress),
            -zDepth).applyMatrix4(camera.matrixWorld);
        }
        const distance = pose.position.distanceTo(goal);
        const proximity = 1 - T.MathUtils.smoothstep(distance, 0.04, 1.45);
        const fade = proximity * T.MathUtils.smoothstep(flight, 0.58, 1);
        s.alpha = Math.min(s.alpha, 1 - fade);
        // Match the HUD icon's apparent diameter as the coin enters the wallet.
        const iconScale = 2 * halfHeight * walletHeight / 85.62;
        size = lerp(size, iconScale, T.MathUtils.smoothstep(flight, 0.18, 1));
      }
      // Camera-space guidance may cross below the floor when looking down.
      // Keep the entire scaled model above terrain, treads and elevated slabs.
      if(flight>0)pose.position.y+=Math.sin(Math.PI*travel)*Math.min(.9,Math.hypot(x-goal.x,z-goal.z)*.035);
      s.lastBottom=clearCoinFloor(pose.position,size,coinMinY,coinRadius,s.lastBottom,coinFloor);
      pose.scale.setScalar(size);
      pose.rotation.y = s.angle + s.age * turn;
      pose.updateMatrix();
      if (s.alpha < 0.999) {
        opacity.setX(fading, s.alpha);
        fadingCoins.setMatrixAt(fading++, pose.matrix);
      } else coins.setMatrixAt(drawn++, pose.matrix);
      if (flight > 0) continue;
      // Original oblique silhouette projected onto the local ground plane.
      const floor = lerp(s.floorY, s.y + s.dy, scatter);
      const gx = s.slopeX, gz = s.slopeZ;
      const skewY = -0.3 * gx - 0.8 * gz;
      projection.set(1, -0.3, 0, 0.3 * floor,
        gx, skewY, gz, floor * (1 - skewY) - gx * x - gz * z + 0.008,
        0, -0.8, 1, 0.8 * floor, 0, 0, 0, 1).multiply(pose.matrix);
      shadows.setMatrixAt(grounded++, projection);
    }
    submit(coins, drawn);
    submit(shadows, grounded);
    submit(fadingCoins, fading);
    if (fading) opacity.needsUpdate = true;
  }
  function clear() { active=0;bossShower=null; for(const mesh of [coins,shadows,fadingCoins])submit(mesh,0); }
  return { burst, burstBoss, collectBoss, takeBossReveal, update, setWalletTarget, clear };
}

