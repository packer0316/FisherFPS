import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { makeHuntNavigation } from './hunt-navigation.js';
import { addCastleCharacterLight } from './castle-character-light.js';
import { makeAnimatedRaycast } from './animated-raycast.js';
import { warmRender } from './render-warmup.js';

const types = [
  {
    id: 'walker',
    name: '荒城行屍',
    height: 2.08,
    hp: 75,
    reward: 24,
    walk: [10, 55],
    jump_down: [85, 100],
    stand_up: [100, 115],
    dead: [185, 227],
    rest: 17,
  },
  {
    id: 'stalker',
    name: '夜行獵手',
    height: 1.92,
    hp: 60,
    reward: 22,
    walk: [90, 130],
    jump_down: [25, 40],
    stand_up: [40, 60],
    dead: [140, 182],
    rest: 100,
  },
  { id: 'mummy', name: '古墓守衛', height: 2.35, hp: 125, reward: 45, smallPrize: 9, walk: [10, 124], rest: 10 },
  {
    id: 'raider',
    name: '荒漠盜墓者',
    height: 2.12,
    hp: 95,
    reward: 34,
    smallPrize: 7,
    walk: [60, 150],
    jump_down: [315, 330],
    stand_up: [330, 345],
    dead: [210, 280],
    rest: 60,
  },
  {
    id: 'necromancer',
    name: '死靈法師',
    height: 2.24,
    hp: 110,
    reward: 39,
    smallPrize: 8,
    walk: [300, 360],
    idle: [170, 290],
  },
];

// FishDefine.lua uses 30 fps. The FBX import adds one Blender frame to the GLB timeline.
// Sample the interval boundaries too: a sparse bone track can straddle a whole named action.
export function frameClip(source, name, [first, last], offset) {
  const start = (first + offset) / 30,
    end = (last + offset) / 30;
  const tracks = source.tracks.map((track) => {
    const sample = track.createInterpolant();
    const times = [0],
      values = Array.from(sample.evaluate(start));
    const stride = track.getValueSize();
    for (let k = 0; k < track.times.length; k++) {
      const t = track.times[k];
      if (t <= start + 1e-6 || t >= end - 1e-6) continue;
      times.push(t - start);
      for (let j = 0; j < stride; j++) values.push(track.values[k * stride + j]);
    }
    if (last > first) {
      times.push(end - start);
      values.push(...sample.evaluate(end));
    }
    return new track.constructor(track.name, times, values, track.getInterpolation());
  });
  return new T.AnimationClip(name, last > first ? end - start : 1, tracks).optimize();
}
let speciesLibrary;
function loadSpecies() {
  const loader = new GLTFLoader();
  return Promise.all(types.map(async (type) => {
    const asset = await loader.loadAsync('/monsters/' + type.id + '.glb');
    const take = asset.animations.reduce((a, b) => (a.tracks.length > b.tracks.length ? a : b));
    const clip = (name, range) =>
      frameClip(take, name, range, asset.asset.extras?.frameOffset ?? 1);
    const library = {
      walk: clip('walk', type.walk),
      idle: clip('idle', type.idle ?? [type.rest, type.rest]),
    };
    for (const name of ['dead', 'jump_down', 'stand_up']) {
      if (type[name]) library[name] = clip(name, type[name]);
    }
    return { scene: asset.scene, clips: library };
  }));
}
export async function loadHunt(scene, world, boss = null) {
  speciesLibrary ??= loadSpecies().catch(error => { speciesLibrary = null; throw error; });
  const library = await speciesLibrary;
  const assets = library.map(species => species.scene);
  if(world.castle) {
    for(let i=0;i<assets.length;i++) {
      assets[i]=clone(assets[i]);
      const variants=new Map();
      assets[i].traverse(o=>{
        if(!o.isMesh)return;
        if(!variants.has(o.material)) {
          const m=o.material.clone();addCastleCharacterLight(m,.34);variants.set(o.material,m);
        }
        o.material=variants.get(o.material);
      });
    }
  }
  if (world.prison) {
    // Share geometry, clips and original skins between levels. Only the two uniforms differ.
    await Promise.all(['inmate-man.jpg', 'inmate-woman.jpg'].map(async (name, i) => {
      const texture = await new T.TextureLoader().loadAsync('/prison/' + name);
      texture.flipY = false;
      texture.colorSpace = T.SRGBColorSpace;
      assets[i] = clone(assets[i]);
      const variants = new Map();
      assets[i].traverse(o => {
        if (!o.isMesh) return;
        if (!variants.has(o.material)) {
          const uniform = o.material.clone();
          uniform.map = texture;
          variants.set(o.material, uniform);
        }
        o.material = variants.get(o.material);
      });
    }));
  }
  for (const mesh of world.zones) {
    if(!mesh.geometry.boundsTree)computeBoundsTree.call(mesh.geometry, { targetLeafSize: 16 });
    if(!mesh.isInstancedMesh)mesh.raycast = acceleratedRaycast;
  }
  const enemies = [], targets = boss ? [boss] : enemies,
    ray = new T.Raycaster(),
    blockHits = [];
  ray.firstHitOnly = true;
  const navigation=makeHuntNavigation(world);
  if(boss)boss.hitTest=makeAnimatedRaycast(boss.model);
  const pos = new T.Vector3(),
    projected = new T.Vector3(),
    eyeDir = new T.Vector3(),
    delta = new T.Vector3();
  const box = new T.Box3(),
    point = new T.Vector3(),
    scale = new T.Vector3();
  const spawns = [
    [-0.6, 3.8],
    [-4.5, -3.6],
    [4.6, -3.2],
    [1.0, -18],
    [-22, 0.3],
    [23, -16.5],
    [-41, -23],
    [42, -19],
    [2, -30.5],
    [39, -26],
    [-40, 15],
    [39, 21],
    [5, 24],
    [-28, 25],
  ];
  // Keep a stable, grounded whole-body pose across FBX files authored at different scales.
  function create(typeIndex, spot, index, pack) {
    const type = types[typeIndex],
      asset = assets[typeIndex];
    const model = clone(asset),
      root = new T.Group(),
      holder = new T.Group();
    root.add(holder);
    holder.add(model);
    const mixer = new T.AnimationMixer(model),
      bones = [];
    model.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false;
      }
      if (n.isBone) bones.push(n);
    });
    const actions = Object.fromEntries(
      Object.entries(library[typeIndex].clips).map(([key, clip]) => [key, mixer.clipAction(clip)]),
    );
    for (const name of ['dead', 'jump_down', 'stand_up']) {
      if (!actions[name]) continue;
      actions[name].setLoop(T.LoopOnce, 1);
      actions[name].clampWhenFinished = true;
    }
    actions.idle.play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    box.setFromObject(model, true);
    box.getSize(scale);
    const factor = type.height / Math.max(0.01, scale.y);
    box.getCenter(point);
    holder.scale.setScalar(factor);
    holder.position.set(-point.x * factor, -box.min.y * factor, -point.z * factor);
    actions.idle.time = Math.random() * actions.idle.getClip().duration;
    root.position.copy(spot);
    scene.add(root);
    const chest = bones.find((n) => /spine2|spine1|chest/i.test(n.name));
    const head = bones.find((n) => /head$/i.test(n.name));
    return {
      root,
      nav: navigation.createState(),
      command: {active:false,time:0,speed:1,goal:new T.Vector3()},
      model,
      hitTest:makeAnimatedRaycast(model),
      mixer,
      actions,
      holder,
      groundOffset: holder.position.y,
      state: 'idle',
      pack,
      finished: false,
      entry: null,
      entryTime: 0,
      unseen: 0,
      groundY: spot.y,
      visibleToPlayer: false,
      scanIn: (index % 9) * 0.027,
      animDebt: 0,
      restDistance: 2.4 + (index % 4) * 0.25,
      phase: Math.random() * Math.PI * 2,
      fadeBindings: null,
      opacity: 1,
      chest,
      head,
      aimBone: chest,
      type,
      hp: type.hp,
      maxHp: type.hp,
      alive: true,
      death: 0,
      pace: 0.99 + (index % 5) * 0.075,
      home: spot.clone(),
      anchor: spot.clone(),
      height: type.height,
    };
  }
  const packs = [];
  const clusterSlots = [0, 3, 4, 7, 10];
  const population = 24, localRadius = 21;
  const candidate = new T.Vector3(), nearbyFallback = new T.Vector3(), sightPoint = new T.Vector3();
  let refillIn = 0;
  function fits(x, z, y, height, player, skip) {
    if (Math.hypot(x - player.x, z - player.z) < 6 ||
        world.blocked(x, z, 0.54, y, height)) return false;
    for (const e of enemies) {
      if (e === skip || e.finished) continue;
      const p = e.root.position;
      if (Math.abs(e.groundY - y) < height && Math.hypot(x - p.x, z - p.z) < 1.7) return false;
    }
    return true;
  }
  function homeSpot(anchorX, anchorZ, height, player, skip) {
    for (let ring = 0; ring < 10; ring++) {
      const samples = Math.max(1, ring * 5);
      for (let k = 0; k < samples; k++) {
        const angle = k * 2 * Math.PI / samples;
        const x = anchorX + Math.cos(angle) * ring * 1.3, z = anchorZ + Math.sin(angle) * ring * 1.3;
        const y = world.terrainHeight(x, z) + 0.015;
        if (fits(x, z, y, height, player, skip)) return candidate.set(x, y, z);
      }
    }
    return null;
  }
  function localSpot(camera, height, skip) {
    const player = camera.position;
    const forward = Math.atan2(-camera.matrixWorld.elements[8], -camera.matrixWorld.elements[10]);
    const jitter = (Math.random() - 0.5) * 0.42;
    let fallback = false;
    for (let i = 0; i < 32; i++) {
      // Try lanes ahead first, then open ground to the sides and behind a player facing a wall.
      const offset = i < 16 ? (i % 2 ? -1 : 1) * (i % 8) * 0.13 : i * 2.39996;
      const a = forward + jitter + offset;
      const r = (i < 16 ? 8 : 6.5) + Math.random() * 9;
      const x = player.x + Math.sin(a) * r, z = player.z + Math.cos(a) * r;
      const y = world.terrainHeight(x, z, player.y - 0.4) + 0.015;
      if (!fits(x, z, y, height, player, skip)) continue;
      sightPoint.set(x, y + height * 0.62, z);
      if (!openLine(camera, sightPoint)) continue;
      if (onScreen(camera, sightPoint)) return candidate.set(x, y, z);
      if (!fallback) { nearbyFallback.set(x, y, z); fallback = true; }
    }
    return fallback ? nearbyFallback : null;
  }
  function populate(camera) {
    if (world.bossArena) {
      world.resetGates?.();
      for(let i=0;i<(world.population??8);i++){
        const a = i * Math.PI / (world.castle?3:4) + .31,
          x = Math.cos(a) * (world.castle?15:13), z = Math.sin(a) * (world.castle?11:13)-(world.castle?8:0);
        const type = types[i % types.length];
        const spot = homeSpot(x, z, type.height, camera.position, enemies[i]) ?? candidate.set(x, .015, z);
        if (!enemies[i]) {
          const pack={dx:0,dz:0,timer:2+i*.4,resting:true};
          packs.push(pack);
          const e=create(i%types.length,spot,i,pack);
          enemies.push(e);targets.push(e);
        }
        beginEntry(enemies[i],spot,camera,1,i<2);
        if(i>=(world.basePopulation??8)) {
          const e=enemies[i];e.alive=false;e.finished=true;e.root.visible=false;e.entry=null;
        }
      }
      return;
    }
    const counts = spawns.map(() => 1);
    for (let i = 0; i < population - counts.length; i++) counts[clusterSlots[i % clusterSlots.length]]++;
    for (let i = 0; i < spawns.length; i++) {
      const [x, z] = spawns[i], count = counts[i];
      const pack = { dx: 0, dz: 0, timer: 0.5 + Math.random() * 2, resting: true };
      packs.push(pack);
      const angle = Math.random() * Math.PI * 2;
      for (let j = 0; j < count; j++) {
        const a = angle + (j * Math.PI * 2) / count, r = count === 1 ? 0 : 1.3 + count * 0.2;
        const typeIndex = (i + j) % types.length, height = types[typeIndex].height;
        const home = homeSpot(x + Math.cos(a) * r, z + Math.sin(a) * r, height, camera.position);
        if (!home) throw new Error('No open ground for the initial hunt formation');
        const e = create(typeIndex, home, enemies.length, pack);
        if (i === 0) {
          const close = localSpot(camera, height, e) ?? home;
          if (j === 0) {
            e.root.position.copy(close);
            e.home.copy(close);
            e.groundY = close.y;
          } else beginEntry(e, close, camera, 1, true);
        }
        enemies.push(e);
      }
    }
  }

  function maintainPopulation(dt, camera, wave) {
    refillIn -= dt;
    if (refillIn > 0) return;
    if (world.bossArena) {
      refillIn=.48;
      if(world.castle && enemies.filter(e=>!e.finished).length>=world.basePopulation)return;
      const e=enemies.find(actor=>actor.finished);
      if(!e)return;
      const spot=localSpot(camera,e.height,e) ?? homeSpot(e.anchor.x,e.anchor.z,e.height,camera.position,e);
      if(spot)beginEntry(e,spot,camera,1);
      return;
    }
    let vacant = null, donor = null, farthest = 25, nearby = 0, inFront = 0;
    for (const e of enemies) {
      if (e.finished) { vacant ??= e; continue; }
      if (!e.alive) continue;
      const p = e.root.position, distance = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
      if (distance <= localRadius) {
        if (nearby >= 6 || (nearby >= 4 && inFront > 0)) continue;
        sightPoint.set(p.x, e.groundY + e.height * 0.62, p.z);
        if (openLine(camera, sightPoint)) {
          nearby++;
          if (onScreen(camera, sightPoint)) inFront++;
        }
      } else if (distance > farthest && !e.entry && !e.nav.chasing && e.unseen > 2 && e.hp === e.maxHp) {
        donor = e;
        farthest = distance;
      }
    }
    const needLocal = nearby < 4 || (inFront === 0 && nearby < 6);
    const e = vacant ?? (needLocal ? donor : null);
    refillIn = vacant ? 0.17 : 0.65;
    if (!e) return;
    // Only relocate a healthy, unseen actor. Recheck with the camera's current orientation.
    if (!vacant && inSight(camera, e, sightPoint)) return;
    let spot = needLocal ? localSpot(camera, e.height, e) : null;
    if (vacant && !spot) spot = homeSpot(e.anchor.x, e.anchor.z, e.height, camera.position, e)
      ?? localSpot(camera, e.height, e);
    if (spot) beginEntry(e, spot, camera, wave);
  }

  function setState(e, state) {
    if (e.state === state) return;
    const previous = e.actions[e.state],
      next = e.actions[state];
    e.state = state;
    next.reset();
    if (state === 'walk') next.time = (e.phase / (Math.PI * 2)) * next.getClip().duration;
    next.play();
    previous.crossFadeTo(next, state === 'dead' ? 0.08 : 0.18, false);
  }
  function prepareFade(e) {
    if (!e.fadeBindings) {
      const copies = new Map();
      e.fadeBindings = [];
      e.model.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const solid = mesh.material;
        if (!copies.has(solid)) {
          const fade = solid.clone();
          // Three.js does not copy custom shader hooks when cloning a material.
          // Preserve the castle fill throughout spawn/death fades, without a brightness pop.
          fade.onBeforeCompile = solid.onBeforeCompile;
          fade.customProgramCacheKey = solid.customProgramCacheKey;
          fade.transparent = true;
          fade.depthWrite = false;
          copies.set(solid, fade);
        }
        e.fadeBindings.push({ mesh, solid, fade: copies.get(solid) });
      });
    }
  }
  function setOpacity(e, alpha) {
    if (alpha === e.opacity) return;
    prepareFade(e);
    for (const { mesh, solid, fade } of e.fadeBindings) {
      fade.opacity = solid.opacity * alpha;
      mesh.material = alpha === 1 ? solid : fade;
      mesh.castShadow = alpha === 1;
    }
    e.opacity = alpha;
  }

  const overhead = new T.Raycaster(), roofHits = [];
  overhead.firstHitOnly = true;
  const dropProbes = [[0, 0], [-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55]];
  const fallGravity = 9.81;
  function clearOverhead(spot, clearance) {
    if (world.blocked(spot.x, spot.z, 0.54, spot.y, clearance)) return false;
    overhead.ray.direction.set(0, 1, 0);
    overhead.far = clearance;
    const count = world.prison ? dropProbes.length : 1;
    for (let i = 0; i < count; i++) {
      const [dx, dz] = dropProbes[i];
      overhead.ray.origin.set(spot.x + dx, spot.y + 0.15, spot.z + dz);
      roofHits.length = 0;
      overhead.intersectObjects(world.zones, false, roofHits);
      if (roofHits.length) return false;
    }
    return true;
  }
  function beginEntry(e, spot, camera, wave, initial = false) {
    navigation.reset(e);
    e.command.active=false;
    e.mixer.stopAllAction();
    e.root.position.copy(spot);
    e.home.copy(spot);
    e.groundY = spot.y;
    e.root.scale.setScalar(1);
    e.root.rotation.set(0, Math.atan2(camera.position.x - spot.x, camera.position.z - spot.z), 0);
    e.holder.position.y = e.groundOffset;
    e.hp = e.maxHp = e.type.hp + Math.min(60, (wave - 1) * 8);
    e.alive = true;
    e.finished = false;
    e.visibleToPlayer = false;
    e.aimBone = e.chest;
    e.entryTime = e.death = e.animDebt = e.scanIn = e.unseen = 0;
    const drop = world.prison
      ? world.dropCeilingY - spot.y - e.height - (0.3 + Math.random() * 0.8)
      : 3.1 + Math.random() * 1.8;
    const falling = !world.castle && e.actions.jump_down && (initial || Math.random() < 0.75)
      && drop > 0 && clearOverhead(spot, world.prison ? drop + e.height : 24);
    const gate = !falling && world.prison ? world.openGate(camera.position) : null;
    e.entry = falling ? 'fall' : gate ? 'gate' : 'fade';
    if(gate){
      e.gate=gate;
      e.root.position.set(gate.x+gate.side*1.45,.015,gate.z);
      e.home.set(gate.x-gate.side*3.5,.015,gate.z);
      e.root.rotation.y=-gate.side*Math.PI/2;
      e.groundY=.015;
    }
    e.root.visible = !initial;
    e.state = falling ? 'jump_down' : gate ? 'walk' : e.type.idle ? 'idle' : 'walk';
    const action = e.actions[e.state];
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (falling) {
      e.dropHeight = drop;
      e.dropTime = Math.sqrt(2 * drop / fallGravity);
      e.root.position.y += drop;
      action.paused = true; // Sample the pose against the actual fall, including contact.
    } else action.time = (e.phase / (2 * Math.PI)) * action.getClip().duration;
    setOpacity(e, falling || gate ? 1 : 0);
    e.mixer.update(0);
    e.root.updateMatrixWorld(true);
  }

  function updateEntry(e, dt) {
    e.entryTime += dt;
    if(e.entry==='gate'){
      const t=T.MathUtils.clamp((e.entryTime-.48)/1.85,0,1);
      e.root.position.x=e.gate.x+e.gate.side*(1.45-4.95*t);
      e.mixer.update(dt);
      if(t>=1)e.entry=null;
      return;
    }
    if (e.entry === 'fade') {
      setOpacity(e, T.MathUtils.smoothstep(e.entryTime, 0, 0.8));
      e.mixer.update(dt);
      if (e.entryTime >= 0.8) e.entry = null;
      return;
    }
    if (e.entry === 'fall') {
      const end = Math.min(e.dropTime, e.entryTime);
      e.root.position.y = e.groundY + Math.max(0, e.dropHeight - 0.5 * fallGravity * end ** 2);
      const action = e.actions.jump_down;
      const duration = action.getClip().duration;
      // On a long drop ease through the airborne pose, then play the landing frames at source speed.
      if (world.prison && e.dropTime > duration) {
        const approach = e.dropTime - duration * 0.7;
        action.time = end < approach ? 0.3 * duration * (end / approach) : duration - (e.dropTime - end);
      } else action.time = Math.max(0, duration - e.dropTime + end);
      e.mixer.update(0);
      if (e.entryTime < e.dropTime) return;
      e.root.position.y = e.groundY;
      e.entry = 'land';
      e.state = 'stand_up';
      action.stop();
      e.actions.stand_up.reset().setEffectiveTimeScale(1).play();
      dt = e.entryTime - e.dropTime;
      e.entryTime = dt;
    }
    e.mixer.update(dt);
    if (e.entryTime >= e.actions.stand_up.getClip().duration) e.entry = null;
  }
  function kill(e) {
    if (!e.alive) return;
    e.command.active=false;
    e.alive = false;
    e.death = 0;
    e.deathFloor = e.groundY;
    e.deathDrop = Math.max(0, e.root.position.y - e.groundY);
    // A kill changes the pose, but the body keeps the momentum of its descent.
    const hopping=e.nav.travel;
    e.deathDownSpeed = hopping ? Math.max(0,fallGravity*hopping.time-hopping.spec.v)
      : world.prison && e.entry === 'fall' ? fallGravity * e.entryTime : 0;
    e.deathFallTime = hopping || world.prison && e.entry === 'fall'
      ? (Math.sqrt(e.deathDownSpeed ** 2 + 2 * fallGravity * e.deathDrop) - e.deathDownSpeed) / fallGravity
      : 0;
    e.deathOpacity = e.opacity;
    navigation.reset(e);
    e.entry = null;
    e.animDebt = 0;
    e.root.rotation.z = 0;
    if (e.actions.dead) setState(e, 'dead');
    else {
      setState(e, 'walk');
      e.actions.walk.timeScale = 2;
    }
  }
  function updateDeath(e, dt) {
    e.death += dt;
    e.mixer.update(dt);
    const duration = Math.max(e.actions.dead?.getClip().duration ?? 0.4, e.deathFallTime);
    if (e.deathFallTime > 0) {
      const t = e.death;
      e.root.position.y = e.deathFloor + Math.max(0, e.deathDrop - e.deathDownSpeed * t - 0.5 * fallGravity * t * t);
    } else if (e.deathDrop > 0) {
      const fallTime = T.MathUtils.clamp(e.deathDrop / 9, 0.15, 0.35);
      e.root.position.y = e.deathFloor + e.deathDrop * (1 - Math.min(1, e.death / fallTime) ** 2);
    }
    if (!e.actions.dead) {
      // FishKilledShow.Normal: lift, enlarge, return to the floor, then fade out.
      const lift =
        T.MathUtils.clamp(e.death / 0.2, 0, 1) - T.MathUtils.clamp((e.death - 0.4) / 0.2, 0, 1);
      const fallingY=e.deathFallTime>0||e.deathDrop>0?e.root.position.y:e.deathFloor;
      e.root.position.y = fallingY + 0.13 * lift;
      e.root.scale.setScalar(1 + 0.1 * T.MathUtils.clamp((e.death - 0.2) / 0.2, 0, 1));
    }
    if (e.death >= duration) setOpacity(e, e.deathOpacity * Math.max(0, 1 - (e.death - duration) / 0.3));
    if (e.death >= duration + 0.3) {
      e.finished = true;
      e.root.visible = false;
    }
  }
  const frustum = new T.Frustum(),
    projection = new T.Matrix4(),
    sphere = new T.Sphere();
  const wanderGoal={x:0,y:0,z:0};
  function update(dt, time, live, camera, wave = 1, playerFeet = camera.position.y - 1.73) {
    if(live)navigation.update();
    frustum.setFromProjectionMatrix(
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    if (live)
      for (const pack of packs) {
        pack.timer -= dt;
        if (pack.timer <= 0) {
          pack.resting = !pack.resting;
          pack.timer = pack.resting ? 1.4 + Math.random() * 2.2 : 4 + Math.random() * 4;
          if (!pack.resting) {
            const a = Math.random() * Math.PI * 2,
              r = 1 + Math.random() * 2.8;
            pack.dx = Math.sin(a) * r;
            pack.dz = Math.cos(a) * r;
          }
        }
      }
    for (const e of enemies) {
      if (e.finished) continue;
      const p = e.root.position,
        distance = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
      sphere.center.copy(p);
      sphere.center.y += e.height * 0.5;
      sphere.radius = e.height;
      const inFrame = frustum.intersectsSphere(sphere);
      e.root.visible = inFrame || distance < 13;
      if (!e.alive) {
        updateDeath(e, dt);
        continue;
      }
      e.root.rotation.z *= Math.exp(-dt * 13);
      if (e.entry) {
        if (live) updateEntry(e, dt);
        else e.root.visible = false;
        continue;
      }
      let motion = 'idle';
      if (live) {
        e.scanIn -= dt;
        if (!inFrame) e.visibleToPlayer = false;
        else if (e.scanIn <= 0) {
          e.visibleToPlayer = inSight(camera, e, pos);
          e.scanIn = 0.2 + (e.phase % 1) * 0.1;
        }
        e.unseen = e.visibleToPlayer ? 0 : e.unseen + dt;
        // Once alerted, keep following the live player position through cover.
        // Visibility still gates initial detection and the player's auto-fire.
        if(e.visibleToPlayer)e.nav.chasing=true;
        if(e.nav.chasing) {
          e.nav.playerTarget.x=camera.position.x;e.nav.playerTarget.z=camera.position.z;
          e.nav.playerTarget.y=navigation.floorAt(camera.position.x,camera.position.z,playerFeet+.05);
        }
        let goal=null;
        if(e.nav.chasing)goal=e.nav.playerTarget;
        else if(!e.pack.resting) {
          wanderGoal.x=e.home.x+e.pack.dx;wanderGoal.z=e.home.z+e.pack.dz;
          wanderGoal.y=navigation.floorAt(wanderGoal.x,wanderGoal.z,e.home.y);
          goal=wanderGoal;
        }
        const order=e.command;
        if(order.active) {
          order.time-=dt;
          if(order.time<=0)order.active=false;
          else goal=order.goal;
        }
        motion=navigation.move(e,goal,dt,order.active?order.speed:e.pace*(e.nav.chasing?1:.55),
          order.active ? .18 : e.nav.chasing?e.restDistance:.15,enemies);
      }
      if(motion==='air'&&e.actions.jump_down) {
        setState(e,'jump_down');
        const action=e.actions.jump_down,jump=e.nav.travel;
        action.paused=true;
        action.time=action.getClip().duration*(jump?Math.min(.92,jump.time/jump.spec.duration):0);
      } else if(motion==='land'&&e.actions.stand_up) {
        setState(e,'stand_up');
        e.actions.stand_up.setEffectiveTimeScale(1);
      } else setState(e,motion==='walk'?'walk':'idle');
      e.actions.walk.timeScale = e.command.active ? 1.6 : e.nav.chasing ? 0.92 : 0.67;
      // The four original species have no authored idle in FishDefine.
      const breath =
        e.state === 'idle' && !e.type.idle ? Math.sin(time * 2.1 + e.phase) * 0.009 : 0;
      // Species without authored jump poses keep their own rig; a small
      // landing compression supplies weight without inventing bone clips.
      e.holder.position.y = e.groundOffset + breath -
        (motion==='land'&&!e.actions.stand_up ? Math.sin(Math.PI*e.nav.landing/e.nav.landDuration)*.055 : 0);
      e.animDebt += dt;
      if (e.animDebt >= (inFrame && distance < 30 ? 1 / 60 : inFrame ? 1 / 24 : 1 / 8)) {
        e.mixer.update(e.animDebt);
        e.animDebt = 0;
      }
    }
    if (live) maintainPopulation(dt, camera, wave);
  }
  function aimPoint(e, out, bone = e.aimBone) {
    if (bone) {
      bone.getWorldPosition(out);
      if (
        out.y > e.root.position.y + 0.45 &&
        out.y < e.root.position.y + e.height + 0.3 &&
        Math.hypot(out.x - e.root.position.x, out.z - e.root.position.z) < (e.boss ? e.height*.65 : 1.2)
      )
        return out;
    }
    return out.copy(e.root.position).addScaledVector(T.Object3D.DEFAULT_UP, e.height * 0.62);
  }
  function openLine(camera, out) {
    delta.subVectors(out, camera.position);
    const dist = delta.length();
    if (dist > 62 || dist < 0.09) return false;
    ray.set(camera.position, delta.multiplyScalar(1 / dist));
    ray.far = dist - 0.035;
    blockHits.length = 0;
    for (const b of world.colliders) {
      if (
        ray.ray.intersectBox(b, point) &&
        point.distanceToSquared(camera.position) < ray.far * ray.far
      )
        return false;
    }
    // Test the rendered stone arches, roof edges and cover, including gaps in the arcade.
    ray.intersectObjects(world.zones, false, blockHits);
    return blockHits.length === 0;
  }
  function onScreen(camera, target) {
    projected.copy(target).project(camera);
    return projected.z > -1 && projected.z < 1 &&
      Math.abs(projected.x) < 0.98 && Math.abs(projected.y) < 0.96;
  }
  function inSight(camera, e, out) {
    if (!e.alive || e.opacity < 0.22) return false;
    // A head above low cover may be shootable while the chest is hidden.
    aimPoint(e, out, e.chest);
    if (onScreen(camera, out) && openLine(camera, out)) {
      e.aimBone = e.chest;
      return true;
    }
    if (!e.head) return false;
    aimPoint(e, out, e.head);
    if (onScreen(camera, out) && openLine(camera, out)) {
      e.aimBone = e.head;
      return true;
    }
    return false;
  }
  function select(camera, current) {
    let selected = null,
      best = Infinity;
    camera.getWorldDirection(eyeDir);
    for (const e of targets) {
      if (!e.alive) continue;
      aimPoint(e, pos);
      delta.subVectors(pos, camera.position);
      const distance = delta.length();
      const score =
        1 -
        delta.dot(eyeDir) / Math.max(0.001, distance) +
        distance * 0.00055 -
        (e === current ? 0.065 : 0);
      if (score >= best || !inSight(camera, e, pos)) continue;
      best = score;
      selected = e;
    }
    return selected;
  }
  const shotRay = new T.Raycaster();
  shotRay.firstHitOnly = true;
  const hits = [];
  function traceShot(origin, direction, range = 220) {
    shotRay.set(origin, direction);
    shotRay.near = 0.008;
    shotRay.far = range;
    hits.length = 0;
    shotRay.intersectObjects(world.zones, false, hits);
    const surface = hits[0];
    let distance = surface?.distance ?? shotRay.far;
    let nearest = surface,
      enemy = null;
    for (const e of targets) {
      if (!e.alive || e.opacity < 0.22) continue;
      point.copy(e.root.position);
      point.y += e.height * 0.5;
      const radius=e.hitRadius ?? 3;
      if (shotRay.ray.distanceSqToPoint(point) > radius*radius || origin.distanceTo(point) > distance + radius)
        continue;
      hits.length = 0;
      e.root.updateMatrixWorld(true);
      // Exact posed triangles, without rescanning/skinning every triangle for
      // each bullet. The BVH and vertex cache are prepared during level loading.
      e.hitTest(shotRay,hits);
      for (const hit of hits) {
        if (hit.distance >= distance) continue;
        nearest = hit;
        distance = hit.distance;
        enemy = e;
      }
    }
    if (!nearest) return { kind: 'air', position: shotRay.ray.at(distance, new T.Vector3()) };
    const normal = nearest.face.normal.clone().transformDirection(nearest.object.matrixWorld);
    if (normal.dot(direction) > 0) normal.negate();
    return {
      kind: enemy ? 'monster' : nearest.object.userData.impactKind,
      enemy,
      position: nearest.point,
      normal,
    };
  }
  function summon(spots,camera) {
    const spawned=[];
    for(const spot of spots) {
      const e=enemies.find(actor=>actor.finished);
      if(!e)break;
      const p=homeSpot(spot.x,spot.z,e.height,camera.position,e);
      if(!p)continue;
      beginEntry(e,p,camera,1);e.nav.chasing=true;
      spawned.push(e);
    }
    return spawned;
  }
  function command(e,goal,duration,speed) {
    if(!e.alive||e.entry)return false;
    navigation.reset(e);e.nav.chasing=true;
    Object.assign(e.command,{active:true,time:duration,speed});
    e.command.goal.set(goal.x,navigation.floorAt(goal.x,goal.z,e.groundY),goal.z);
    return true;
  }
  function clearCommands(){for(const e of enemies)e.command.active=false;}
  let warmed=false;
  async function warmup(renderer,camera) {
    if(warmed)return;
    const variants=new T.Group();
    for(const e of enemies){
      prepareFade(e);
      for(const {mesh,solid,fade} of e.fadeBindings)for(const material of [solid,fade]){
        const proxy=mesh.clone(false);proxy.material=material;variants.add(proxy);
      }
    }
    // compileAsync includes invisible pools. Supply both opaque/fading monster
    // variants so a respawn, first kill or first explosion cannot compile mid-fight.
    await renderer.compileAsync(scene,camera);
    await renderer.compileAsync(variants,camera,scene);
    await warmRender(renderer,scene,camera);
    warmed=true;
  }
  return { enemies, targets, populate, update, kill, aimPoint, inSight, select, traceShot, summon, command, clearCommands,warmup };
}
