import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { frameClip } from './hunt.js';
import { makeBossHazards, containsBossHazard, clipBossLane } from './boss-hazards.js';
import { makeBossImpactEffects } from './boss-impact-effects.js';
import officerFragment from './shaders/prison/prisonOfficer.frag?raw';

const frames = {
  ingame: [10, 190],
  walk: [340, 390],
  idle: [400, 570],
  small_reward: [580, 625],
  middle_reward: [690, 800],
  big_reward_in: [855, 895],
  big_reward_out: [905, 1045],
  out: [1070, 1250],
};
const height = 9.6,
  maxHp = 3200,
  damage = 10;

function officerMaterial(base, atlas) {
  base.colorSpace = T.NoColorSpace;
  atlas.flipY = false;
  atlas.generateMipmaps = false;
  atlas.minFilter = T.LinearFilter;
  const v3 = (x, y, z) => new T.Vector3(x, y, z),
    v4 = (x, y, z, w) => new T.Vector4(x, y, z, w);
  const params = {
    CC_Texture0: base,
    ShaderAtlas: atlas,
    u_color: v4(1, 1, 1, 1),
    u_multColor: v3(1, 1, 1),
    u_bleachRate: 0,
    Normalmap_intemsity: 1,
    Light_pos: 1,
    Light_contrast: 1.6,
    Metallic_Intensity: 2,
    Back_light: v3(0.62, 0.67, 0.73),
    Surface_Light: v3(0.91, 0.94, 0.99),
    MatCap_add_Color: v3(0.545098, 0.521569, 0.462745),
    MatCap_add2_Color: v3(0.494118, 0.521569, 0.572549),
    MatCap_add_R_size_GB_intensity: v4(0, 0.4, 2.5, 0),
    MatCap_add2_R_size_GB_intensity: v4(-0.7, 0.5, 3.5, 0),
    bleachPow: 2.7,
    u_lanternShade: v4(0.3, 0.15, 0.3, 1),
  };
  return new T.ShaderMaterial({
    uniforms: Object.fromEntries(Object.entries(params).map(([k, value]) => [k, { value }])),
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      attribute vec4 tangent;
      varying vec2 TextureCoordOut;
      varying vec3 v_worldNormal,v_worldTangent,v_worldBinormal,v_lanternLight,v_lanternDir;
      void main() {
        #include <skinbase_vertex>
        mat4 skin = bindMatrixInverse * (skinWeight.x*boneMatX+skinWeight.y*boneMatY+
          skinWeight.z*boneMatZ+skinWeight.w*boneMatW) * bindMatrix;
        vec3 n = normalize(mat3(modelMatrix*skin)*normal);
        vec3 t = normalize(mat3(modelMatrix*skin)*tangent.xyz);
        v_worldNormal=n; v_worldTangent=t; v_worldBinormal=normalize(cross(n,t))*tangent.w;
        vec3 wp=(modelMatrix*skin*vec4(position,1.0)).xyz;
        v_lanternDir=vec3(-12.,6.,-2.)-wp;
        v_lanternLight=vec3(.19,.071,.024)/(1.+dot(v_lanternDir,v_lanternDir)*.005);
        TextureCoordOut=uv;
        gl_Position=projectionMatrix*modelViewMatrix*skin*vec4(position,1.0);
      }`,
    fragmentShader:
      'uniform sampler2D CC_Texture0;\n#define CC_PMatrix viewMatrix\n' + officerFragment,
  });
}

export async function loadWarden(scene, world, particles, groundImpact) {
  const [asset, atlas] = await Promise.all([
    new GLTFLoader().loadAsync('/monsters/warden.glb'),
    new T.TextureLoader().loadAsync('/prison/warden-atlas.png'),
    particles.loadWarden(),
  ]);
  const model = asset.scene,
    root = new T.Group(),
    holder = new T.Group();
  root.name = '典獄長';
  root.add(holder);
  holder.add(model);
  scene.add(root);
  let mat;
  model.traverse((o) => {
    if (!o.isMesh) return;
    mat ??= officerMaterial(o.material.map, atlas);
    o.material = mat;
    o.castShadow = true;
    o.frustumCulled = false;
  });
  const mixer = new T.AnimationMixer(model);
  const actions = Object.fromEntries(
    Object.entries(frames).map(([name, range]) => {
      const act = mixer.clipAction(frameClip(asset.animations[0], name, range, 0));
      if (!['walk', 'idle'].includes(name)) {
        act.setLoop(T.LoopOnce, 1);
        act.clampWhenFinished = true;
      }
      return [name, act];
    }),
  );
  actions.idle.play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model, true),
    c = bounds.getCenter(new T.Vector3());
  const factor = height / (bounds.max.y - bounds.min.y);
  holder.scale.set(factor * 1.13, factor, factor * 1.06);
  holder.position.set(-c.x * holder.scale.x, -bounds.min.y * factor, -c.z * holder.scale.z);
  // FishPrisonOfficerEfkSetting attaches all three body effects to Root at scale 100,
  // zero offset/rotation. The GLB already contains the centimetre conversion and bone axes.
  const effectMount = new T.Object3D();
  effectMount.scale.setScalar(100);
  model.getObjectByName('Root').add(effectMount);
  const target = {
    root,
    model,
    height,
    hitRadius: height * 0.99,
    chest: model.getObjectByName('Bip001_Spine1'),
    head: model.getObjectByName('Bip001_Head'),
    type: { id: 'warden', name: '典獄長', reward: 400, smallPrizeChance: 0.06 },
    maxHp,
    hp: maxHp,
    alive: false,
    opacity: 1,
    groundY: 0,
    boss: true,
  };
  const impactFX=await makeBossImpactEffects(scene,particles,'warden');
  const hazards = makeBossHazards(scene,{count:4,theme:'warden'});
  let zone, zoneIndex=0, damageCooldown=0;
  const contactPoint=new T.Vector3(),contactOrigin=new T.Vector3();
  const footsteps = ['Bip001_L_Toe0', 'Bip001_R_Toe0'].map((name) => ({
    bone: model.getObjectByName(name),
    position: new T.Vector3(),
    raised: false,
  }));
  function updateFootfalls() {
    for (const foot of footsteps) {
      if (!foot.bone) continue;
      foot.bone.getWorldPosition(foot.position);
      if (foot.position.y > 0.26) foot.raised = true;
      if (foot.raised && foot.position.y < 0.14) {
        foot.raised = false;
        groundImpact(foot.position, 0.67, 'step');
      }
    }
  }
  let state = 'off',
    time = 0,
    cycle = 0,
    hp = 100,
    current = 'idle',
    circle = false,
    nextAttack = 0,
    followUp = false,
    warningStart = 0,
    contactTime = 0;
  const previousPlayer = new T.Vector2(),
    velocity = new T.Vector2(),
    observed = new T.Vector2(),
    aim = new T.Vector3();
  let trackingPlayer = false;
  function play(name, blend = 0.13) {
    if (current === name && actions[name].isRunning()) return;
    const previous = actions[current];
    current = name;
    const next = actions[name].reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (previous !== next) previous.crossFadeTo(next, blend, false);
  }
  function reset() {
    mixer.stopAllAction();
    current = 'idle';
    state = 'intro';
    time = cycle = 0;
    trackingPlayer = followUp = false;
    zoneIndex=damageCooldown=0;
    velocity.set(0, 0);
    hp = 100;
    for (const foot of footsteps) foot.raised = false;
    target.hp = maxHp;
    target.alive = false;
    target.opacity = 0;
    root.position.set(0, 0.018, -4.6);
    root.rotation.set(0, 0, 0);
    root.visible = true;
    mat.uniforms.u_bleachRate.value = 0;
    hazards.clear();
    impactFX.clear();
    play('ingame', 0);
    mixer.update(0);
    particles.wardenFx('aura', effectMount);
    particles.wardenFx('intro', effectMount);
  }
  function warn(player, contact) {
    warningStart = actions[current].time;
    contactTime = contact;
    const enraged = target.hp <= maxHp / 2;
    const lead = (contactTime - warningStart) * (enraged ? 0.97 : 0.9);
    const steps = Math.ceil(velocity.length() * lead / 0.65);
    aim.set(player.x, 0, player.z);
    // Lock once per warning. Stop the projected path at walls and obstacles.
    for (let i = 1; i <= steps; i++) {
      const x = player.x + velocity.x * lead * i / steps;
      const z = player.z + velocity.y * lead * i / steps;
      if (world.blocked(x, z)) break;
      aim.set(x, 0, z);
    }
    const spec=circle?{shape:'circle',x:aim.x,z:aim.z,radius:enraged?5.1:4.5,inner:0,
      duration:.52,steps:6,kind:'quake'}:clipBossLane(root.position,aim,world.navigationBounds);
    if(!circle)Object.assign(spec,{width:enraged?4.3:3.8,duration:Math.min(1.15,spec.length/27),
      steps:Math.max(3,Math.ceil(spec.length/3.2)),kind:'fracture'});
    zone=hazards.mark(zoneIndex++%hazards.pool.length,spec,contactTime-warningStart);
    state = 'warning';
    time = 0;
  }
  function startAttack(player) {
    const pattern = cycle++ % 3;
    circle = pattern === 2;
    followUp = !circle && (pattern === 1 || target.hp <= maxHp / 2);
    play(circle ? 'big_reward_in' : 'middle_reward');
    warn(player, circle ? actions.big_reward_in.getClip().duration : 1.5);
    if (!circle) particles.wardenFx('strike', effectMount);
  }
  function update(dt, player, onDamage, onWin) {
    if (state === 'off' || state === 'done') return;
    if (trackingPlayer && dt > 0) {
      observed.set(player.x - previousPlayer.x, player.z - previousPlayer.y);
      observed.multiplyScalar(1 / dt).clampLength(0, 7.9);
      velocity.lerp(observed, 1 - Math.exp(-10 * dt));
    }
    previousPlayer.set(player.x, player.z);
    trackingPlayer = true;
    impactFX.update(dt);
    time += dt;
    mixer.update(dt);
    if (state === 'intro' || (state === 'roam' && current === 'walk')) updateFootfalls();
    mat.uniforms.u_bleachRate.value = Math.max(0, mat.uniforms.u_bleachRate.value - dt * 2.8);
    damageCooldown=Math.max(0,damageCooldown-dt);
    if (state === 'dying') {
      if (time > 3.55) {
        state = 'done';
        root.visible = false;
        onWin();
      }
      return;
    }
    if (state === 'intro') {
      if (time >= 6) {
        state = 'roam';
        nextAttack = 1.2;
        time = 0;
        target.alive = true;
        target.opacity = 1;
        play('walk');
      }
      return;
    }
    hazards.update(dt,(wave,contact)=>{
      if(!target.alive)return;
      contactOrigin.set(contact.x,.08,contact.z);
      contactPoint.copy(contactOrigin);
      if(contact.shape==='line'){contactPoint.x+=contact.dx*contact.length/2;contactPoint.z+=contact.dz*contact.length/2;}
      groundImpact(contactPoint,contact.step===0?.9:.48,'slam',
        contact.shape==='line'?'fracture':contact.step===0?'circle':'pulse',contactOrigin);
      impactFX.burst(wave,contact);
      if(!wave.hit && damageCooldown<=0 && containsBossHazard(contact,player)){
        wave.hit=true;damageCooldown=.72;hp=Math.max(0,hp-damage);onDamage(hp);
      }
    });
    if(state==='off')return;
    const action = actions[current];
    const finished = action.time >= action.getClip().duration;
    if (state === 'prize') {
      if (finished) {
        state = 'roam';
        if (time >= nextAttack) startAttack(player);
      }
      return;
    }
    if (state === 'warning') {
      const turn = Math.atan2(aim.x-root.position.x,aim.z-root.position.z) - root.rotation.y;
      root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-9 * dt));
      if (action.time >= contactTime) {
        state = 'impact';
        time = 0;
        zone.uniforms.impact.value = 1;
        if (circle) {
          play('big_reward_out', 0.07);
          particles.wardenFx('ring', holder, contactPoint.set(zone.x,.12,zone.z));
        }

      }
      return;
    }
    if (state === 'impact') {
      // HitMoreAttack lands twice in the same middle_reward clip, at 1.5 and 2.3 seconds.
      if (followUp && target.alive && time >= 0.1) {
        followUp = false;
        warn(player, 2.3);
        return;
      }
      if (!finished) return;
      if (!target.alive) return startExit();
      state = 'roam';
      time = 0;
      nextAttack = target.hp <= maxHp / 2 ? 0.55 : 1.15;
      return;
    }
    const p = root.position,
      vx = player.x - p.x,
      vz = player.z - p.z,
      d = Math.hypot(vx, vz);
    const yaw = Math.atan2(vx, vz);
    root.rotation.y +=
      Math.atan2(Math.sin(yaw - root.rotation.y), Math.cos(yaw - root.rotation.y)) *
      Math.min(1, dt * 3.8);
    if (d > 8.35) {
      const step = Math.min(d - 8.35, (target.hp <= maxHp / 2 ? 3.2 : 2.7) * dt);
      const nx = p.x + (step * vx) / d,
        nz = p.z + (step * vz) / d;
      if (!world.blocked(nx, p.z, 2.05, 0, height)) p.x = nx;
      if (!world.blocked(p.x, nz, 2.05, 0, height)) p.z = nz;
      play('walk');
    } else play('idle');
    if (time >= nextAttack) startAttack(player);
  }
  function hit() {
    mat.uniforms.u_bleachRate.value = 0.36;
  }
  function heal(amount) {
    if (hp <= 0 || state === 'off' || !Number.isFinite(amount)) return 0;
    const before=hp;
    hp=Math.min(100,hp+Math.max(0,amount));
    return hp-before;
  }
  function smallPrize(position) {
    particles.wardenFx('prize', holder, position);
    // Award every win immediately. Only a free body animation may present the reward.
    if (state === 'roam') {
      state = 'prize';
      play('small_reward');
    }
    const bigCoins = T.MathUtils.randInt(1, 3);
    const smallCoins = T.MathUtils.randInt(5, 7);
    return { bigCoins, smallCoins, amount: bigCoins * 5 + smallCoins, floorY: target.groundY };
  }
  function startExit() {
    state = 'dying';
    time = 0;
    hazards.clear();
    impactFX.clear();
    particles.stopWarden();
    play('out');
    actions.out.setEffectiveTimeScale(2.5);
  }
  function defeat() {
    target.alive = false;
    if (state !== 'warning' && state !== 'impact') startExit();
  }
  function stop() {
    state = 'off';
    target.alive = false;
    root.visible = false;
    hazards.clear();
    impactFX.clear();
    particles.stopWarden();
  }
  function cue() {
    return state === 'intro'
      ? '典獄長進場'
      : state === 'warning'
        ? circle
          ? '崩地震擊：離開紅圈'
          : warningStart > 0 ? '二連裂地：再次側移' : '裂地爆破：向側邊閃避'
        : state === 'dying'
          ? '典獄長已倒下'
          : '';
  }
  return {
    target,
    get hazards(){return hazards.pool;},
    update,
    reset,
    hit,
    heal,
    smallPrize,
    defeat,
    stop,
    cue,
    get health() {
      return hp;
    },
  };
}
