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
          const sharedZombieTexture=!url.startsWith('/effects/grenade/dragon/')&&['zombie_vfx_01.png','vfx_noise_009.png'].includes(name);
          return sharedZombieTexture ? '/effects/axe-hit/' + name : path;
        });
    });
  }
  const world = makeContext(renderer.getContext(), 2048, 4096);
  // A small transparent HUD surface keeps the actual EFK above the opaque wallet panel.
  const gl = walletCanvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
  const hud = makeContext(gl, 128, 256);
  const [blood, pickup] = await Promise.all([load(world, bloodUrl, 0.62), load(hud, pickupUrl, 1)]);
  const [grenadeBlast, grenadeSmoke, grenadeDust] = await Promise.all([
    load(world,'/effects/grenade/dragon/EffekseerMechaJaeger/Explosion.efk',1),
    load(world,'/effects/grenade/dragon/Effekseer_dt3/Boss_TRex/Bs05_Smoke.efk',1),
    load(world,'/effects/grenade/dragon/EffekseerMechaJaeger/shock_smoke.efk',1),
  ]);
  renderer.resetState();
  hud.setProjectionOrthographic(17, 17, 0.1, 150);
  hud.setCameraLookAt(0, 0, 60, 0, 0, 0, 0, 1, 0);
  gl.clearColor(0, 0, 0, 0);

  // One native arena per render surface and fixed tracking slots for live handles.
  const slots = (count) => Array.from({ length: count }, () => ({ handle: null, age: 0 }));
  const impacts = slots(3), pickups = slots(5);
  const grenadeSlots=slots(3);
  let grenadeVisible=false;
  function clearGrenade(slot){
    for(const name of ['handle','smoke','dust','dustCross']){slot[name]?.stop();slot[name]=null;}
    slot.position=null;
  }
  function playGrenade(position) {
    const slot=grenadeSlots.find(s=>!s.position)??grenadeSlots.reduce((a,b)=>a.age>b.age?a:b);
    clearGrenade(slot);
    slot.position=position.clone();slot.age=0;slot.smoked=false;slot.emissionStopped=false;
    slot.handle=world.play(grenadeBlast,position.x,position.y,position.z);
    slot.handle?.setScale(2.0,2.0,2.0);slot.handle?.setSpeed(1.15);
    // DragonTycoon3's fire plume is +Y up. shock_smoke is an upright XY fan,
    // so cross two fans around WORLD Y to fill the XZ ground directions.
    // Never pitch the plume down or make its emission axis follow the camera.
    slot.handle?.setRotation(0,0,0);
    for(const [name,yaw]of [['dust',Math.PI*.25],['dustCross',Math.PI*.75]]){
      slot[name]=world.play(grenadeDust,position.x,position.y+.05,position.z);
      slot[name]?.setScale(.48,.34,.48);slot[name]?.setRotation(0,yaw,0);slot[name]?.setSpeed(1.35);
      slot[name]?.setAllColor(210,195,175,220);
    }
    grenadeVisible=true;
  }
  function updateGrenades(dt) {
    grenadeVisible=false;
    for(const slot of grenadeSlots){
      if(!slot.position)continue;
      slot.age+=dt;
      if(!slot.smoked&&slot.age>=.22){
        slot.smoked=true;const p=slot.position;
        slot.smoke=world.play(grenadeSmoke,p.x,p.y+.35,p.z);
        slot.smoke?.setScale(.36,.48,.36);slot.smoke?.setRotation(0,0,0);slot.smoke?.setSpeed(.85);
        slot.smoke?.setAllColor(195,185,170,230);
      }
      if(!slot.emissionStopped&&slot.age>=1.05){slot.smoke?.stopRoot();slot.emissionStopped=true;}
      if(slot.age>3.0)slot.smoke?.setAllColor(195,185,170,Math.round(230*Math.max(0,(4.2-slot.age)/1.2)));
      if(slot.age>4.2)clearGrenade(slot);
      else grenadeVisible=true;
    }
  }
  function stopGrenades(){
    for(const slot of grenadeSlots)clearGrenade(slot);
    grenadeVisible=false;
  }
  const officerSlots = slots(6);
  // Fixed handles for the eight pooled supply crates; share the existing arena.
  const supplySlots = slots(8);
  let supplyAsset, loadingSupply, supplyVisible=false;
  function loadSupply() {
    loadingSupply ??= load(world,'/supplies/fx/special_vfx.efk',1)
      .then(effect=>{supplyAsset=effect;renderer.resetState();})
      .catch(error=>{loadingSupply=null;throw error;});
    return loadingSupply;
  }
  function supplyFx(index,anchor,alpha=1) {
    const slot=supplySlots[index];
    if (!anchor) {
      slot.handle?.stop();slot.handle=slot.anchor=null;
      return;
    }
    slot.anchor=anchor;slot.alpha=alpha;
    if (!slot.handle?.exists) slot.handle=world.play(supplyAsset,0,0,0);
    if (!slot.handle) return;
    anchor.updateWorldMatrix(true,false);
    slot.handle.setMatrix(anchor.matrixWorld.elements);
    slot.handle.setAllColor(255,255,255,Math.round(alpha*255));
    supplyVisible=true;
  }
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
  const brideSlots=slots(20);
  const brideSpecs={
    intro:['Z_037_Ingame',4.34],
    summon:['Z_037_Middle_reward_0',7.34],
    soul:['Z_037_Middle_reward',7.34],
    burst:['Z_037_Big_reward',7],
    out:['Z_037_out',5.34],
    ghost:['Z_018_Ghost',1.8],
    hit:['Z_18_Sphere_Hit',1],
  };
  let brideAssets,loadingBride,brideVisible=false;
  function loadBride() {
    loadingBride??=Promise.all(Object.entries(brideSpecs).map(async([key,[file]])=>
      [key,await load(world,'/castle/fx/'+file+'.efk',1)]))
      .then(entries=>{brideAssets=Object.fromEntries(entries);renderer.resetState();})
      .catch(error=>{loadingBride=null;throw error;});
    return loadingBride;
  }
  function brideFx(name,anchor,life=brideSpecs[name][1]) {
    if(!brideAssets)return;
    const slot=brideSlots.find(s=>!s.handle)??brideSlots.reduce((a,b)=>a.age>b.age?a:b);
    slot.handle?.stop();
    anchor.updateWorldMatrix(true,false);
    slot.handle=world.play(brideAssets[name],0,0,0);
    slot.handle?.setMatrix(anchor.matrixWorld.elements);
    slot.anchor=anchor;slot.age=0;slot.life=life;
    if(slot.handle)brideVisible=true;
  }
  function stopBride() {
    for(const s of brideSlots){s.handle?.stop();s.handle=null;s.anchor=null;}
    brideVisible=false;
  }
  const stationSlots=slots(8),stationSpecs={intro:['Z_021_ingame',5],strike:['Z_021_middle_reward',3],
    burst:['Z_021_big_reward',4.5],out:['Z_021_out',4],bell:['Z_021_train_come',4]};
  let stationAssets,loadingStation,stationVisible=false;
  function loadStation(){
    loadingStation??=Promise.all(Object.entries(stationSpecs).map(async([key,[file]])=>
      [key,await load(world,'/station/fx/'+file+'.efk',1)]))
      .then(entries=>{stationAssets=Object.fromEntries(entries);renderer.resetState();})
      .catch(error=>{loadingStation=null;throw error;});return loadingStation;
  }
  function stationFx(name,anchor){
    if(!stationAssets)return;const slot=stationSlots.find(s=>!s.handle)??stationSlots.reduce((a,b)=>a.age>b.age?a:b);
    slot.handle?.stop();anchor.updateWorldMatrix(true,false);slot.handle=world.play(stationAssets[name],0,0,0);
    slot.handle?.setMatrix(anchor.matrixWorld.elements);slot.anchor=anchor;slot.age=0;slot.life=stationSpecs[name][1];
    if(slot.handle)stationVisible=true;
  }
  function stopStation(){for(const s of stationSlots){s.handle?.stop();s.handle=null;s.anchor=null;}stationVisible=false;}
  // CC0 Effekseer materials, loaded once for boss arenas. Fixed handles prevent
  // a multi-segment fissure from growing the native particle arena unboundedly.
  const bossSlots=slots(6);
  let bossAssets,loadingBoss,bossVisible=false;
  function loadBossImpacts(){
    loadingBoss??=Promise.all(['ef_fire02','ef_parts_hit01'].map(file=>
      load(world,'/effects/boss-impacts/'+file+'.efk',1)))
      .then(effects=>{bossAssets=effects;renderer.resetState();})
      .catch(error=>{loadingBoss=null;throw error;});
    return loadingBoss;
  }
  function bossImpact(theme,point,scale=1){
    if(!bossAssets)return;
    // These source effects spawn children over time. Reserve room for blood,
    // supplies and the original boss aura instead of starving the native arena.
    const limit=theme==='bride'?4:1;
    let active=0;
    for(const entry of bossSlots)if(entry.handle)active++;
    if(active>=limit || world.getRestInstancesCount()<320)return;
    const slot=bossSlots.find(s=>!s.handle);
    if(!slot)return;
    slot.handle=world.play(bossAssets[theme==='bride'?1:0],point.x,point.y,point.z);
    slot.handle?.setScale(scale,scale,scale);
    slot.handle?.setRotation(0,Math.random()*Math.PI*2,0);
    if(theme==='bride')slot.handle?.setAllColor(155,65,255,255);
    slot.age=0;slot.life=theme==='bride'?.75:1.05;
    if(slot.handle)bossVisible=true;
  }
  function stopBossImpacts(){
    for(const slot of bossSlots){slot.handle?.stop();slot.handle=null;}
    bossVisible=false;
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
    // Refresh live anchors and looping EFK without allocating new tracking objects.
    supplyVisible=false;
    for(let i=0;i<supplySlots.length;i++) {
      const slot=supplySlots[i];
      if(slot.anchor)supplyFx(i,slot.anchor,slot.alpha);
    }
    if (bloodVisible || officerVisible || supplyVisible || brideVisible || bossVisible || grenadeVisible || stationVisible) {
      updateGrenades(dt);
      if (officerVisible) syncWardenEffects();
      if(brideVisible)for(const slot of brideSlots)if(slot.handle&&slot.anchor) {
        slot.anchor.updateWorldMatrix(true,false);slot.handle.setMatrix(slot.anchor.matrixWorld.elements);
      }
      brideVisible=advance(brideSlots,dt,1);
      if(stationVisible)for(const slot of stationSlots)if(slot.handle&&slot.anchor){
        slot.anchor.updateWorldMatrix(true,false);slot.handle.setMatrix(slot.anchor.matrixWorld.elements);
      }
      stationVisible=advance(stationSlots,dt,1);
      bossVisible=advance(bossSlots,dt,1);
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
    if (bloodVisible || officerVisible || supplyVisible || brideVisible || bossVisible || grenadeVisible || stationVisible) {
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
    stopBride();
    stopStation();
    stopBossImpacts();
    stopGrenades();
    for(let i=0;i<supplySlots.length;i++)supplyFx(i,null);
    supplyVisible=false;
    for(const pool of [impacts,pickups])for(const s of pool){s.handle?.stop();s.handle=null;}
    bloodVisible=pickupVisible=false;clearPickup=true;cooldown=0;
    world.update(1);hud.update(1);
  }
  return { playBlood, playGrenade, playCoinPickup, update, render, loadWarden, wardenFx, stopWarden, clearWorld, loadSupply, supplyFx,
    loadBride,brideFx,stopBride,loadStation,stationFx,stopStation,loadBossImpacts,bossImpact,stopBossImpacts };
}

