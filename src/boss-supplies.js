import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { frameClip } from './hunt.js';
import { emit } from './events.js';

export const supplyRules = Object.freeze({
  dropChance: 0.08, capacity: 8, lifetime: 60, pickupRadius: 1.05,
  speedFactor: 1.35, speedDuration: 20,
});

export function rollSupply(random = Math.random) {
  const kind = Math.min(2, Math.floor(random() * 3));
  return kind === 0 ? { kind: 'heal', amount: random() < 0.5 ? 30 : 60 }
    : { kind: kind === 1 ? 'mg3' : 'speed' };
}

// This pool belongs to the prison scene. Geometry, textures and animation clips
// are shared; only bones, fade materials and mixers are independent per slot.
export async function loadBossSupplies(scene, world, onPickup, particles) {
  const [asset]=await Promise.all([
    new GLTFLoader().loadAsync('/supplies/airdrop.glb'),particles.loadSupply(),
  ]);
  // FishDefine.lua, 30 fps. Never bind or play the parachute "start" action.
  const clips = Object.fromEntries(Object.entries({
    wait: [80,140], warning: [150,190], dead: [200,260],
  }).map(([name, frames]) => [name, frameClip(asset.animations[0], name, frames, 0)]));
  const ringGeometry = new T.PlaneGeometry(1.65,1.65);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { age: { value: 0 }, fade: { value: 1 } },
    vertexShader: `varying vec2 at; void main(){at=uv*2.0-1.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 at;uniform float age;uniform float fade;
      void main(){
        float r=length(at),a=atan(at.y,at.x);
        float aa=max(.015,fwidth(r)),seg=cos(a*8.0+age*.7);
        float rim=(1.0-smoothstep(.015,.03+aa,abs(r-.78)))*(.55+.18*sin(age*2.8));
        float ticks=smoothstep(.64,.8,seg)*(1.0-smoothstep(.015,.025+aa,abs(r-.9)));
        float halo=exp(-r*r*5.0)*.19;
        gl_FragColor=vec4(1.0,.61,.18,(rim*.7+ticks*.38+halo)*fade);
      }`,
  });
  const beamGeometry=new T.CylinderGeometry(.24,.42,4.8,16,1,true);
  beamGeometry.translate(0,2.75,0);
  const beamMaterial=new T.ShaderMaterial({
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{age:{value:0},fade:{value:1}},
    vertexShader:`varying vec2 tex;varying float facing;
      void main(){tex=uv;vec4 p=modelViewMatrix*vec4(position,1.);
      facing=max(0.,dot(normalize(normalMatrix*normal),normalize(-p.xyz)));
      gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec2 tex;varying float facing;uniform float age,fade;
      void main(){float soft=smoothstep(0.,.08,tex.y)*pow(1.-tex.y,1.15);
      float flow=.8+.2*sin(tex.y*13.-age*2.2);
      float core=pow(facing,12.)*.82+pow(facing,.65)*.18;
      gl_FragColor=vec4(1.,.69,.25,soft*flow*core*fade);}`,
  });
  const moteGeometry=new T.BufferGeometry();
  moteGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(12*3),3));
  moteGeometry.setAttribute('seed',new T.Float32BufferAttribute(Array.from({length:12},(_,i)=>(i+.5)/12),1));
  const moteMaterial=new T.ShaderMaterial({
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{age:{value:0},fade:{value:1}},
    vertexShader:`attribute float seed;uniform float age;varying float alpha;
      void main(){float life=fract(seed+age*(.19+seed*.09)),a=seed*94.+age*.28;
      vec3 p=vec3(cos(a)*(.48+seed*.2),.18+life*2.7,sin(a)*(.48+seed*.2));
      vec4 v=modelViewMatrix*vec4(p,1.);alpha=sin(life*3.14159);
      gl_Position=projectionMatrix*v;gl_PointSize=clamp(75./max(.2,-v.z),1.,6.);}`,
    fragmentShader:`uniform float fade;varying float alpha;
      void main(){float r=length(gl_PointCoord-.5);
      gl_FragColor=vec4(1.,.78,.34,(1.-smoothstep(.05,.5,r))*alpha*fade);}`,
  });
  const pool = Array.from({ length: supplyRules.capacity }, (_, index) => {
    const root = new T.Group(), holder = new T.Group(), model = clone(asset.scene);
    root.name = 'BossSupply_' + index;
    root.visible = false;
    holder.add(model);root.add(holder);scene.add(root);
    const materials = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      m.metalness = .28;m.roughness = .54;m.envMapIntensity = .9;
      m.emissive.setHex(0x392306);m.emissiveIntensity = .18;
      m.transparent = true;
      o.material = m;o.castShadow = true;o.frustumCulled = false;
      materials.push(m);
    });
    const mixer = new T.AnimationMixer(model);
    const actions = Object.fromEntries(Object.entries(clips).map(([name,clip]) => [name,mixer.clipAction(clip)]));
    actions.dead.setLoop(T.LoopOnce,1);actions.dead.clampWhenFinished = true;
    actions.wait.play();mixer.update(0);root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model,true), center = box.getCenter(new T.Vector3());
    const size = 1.02 / Math.max(box.max.x-box.min.x,box.max.z-box.min.z);
    holder.scale.setScalar(size);
    holder.position.set(-center.x*size,-box.min.y*size,-center.z*size);
    const ring = new T.Mesh(ringGeometry,ringMaterial.clone());
    const beam=new T.Mesh(beamGeometry,beamMaterial.clone());
    const motes=new T.Points(moteGeometry,moteMaterial.clone());
    motes.frustumCulled=false;
    const anchor=new T.Object3D();
    // Original BodyEfk: scale 60 and -90° X. C3B conversion is centimetres
    // to metres; also follow the normalization of this particular crate.
    anchor.scale.setScalar(60*.01*size);anchor.rotation.x=-Math.PI/2;
    anchor.position.y=.07;
    root.add(ring,beam,motes,anchor);
    mixer.stopAllAction();
    return { index, root, holder, mixer, actions, materials, ring, beaconMaterials:[beam.material,motes.material], anchor, state: 'free', age: 0,
      openAge: 0, ground: 0, flight: 0, height: 0, yaw: 0, reward: null,
      source: new T.Vector3(), landing: new T.Vector3() };
  });
  // Every slot has its own uniforms. The template never enters the scene.
  ringMaterial.dispose();beamMaterial.dispose();moteMaterial.dispose();
  const candidate = new T.Vector3(), ray = new T.Ray(), hit = new T.Vector3();
  const origin = new T.Vector3(), direction = new T.Vector3();

  function findLanding(position) {
    for (let ring = 0; ring < 5; ring++) {
      const count = ring ? 12 : 1;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count;
        const x = position.x + Math.cos(angle)*ring*.7;
        const z = position.z + Math.sin(angle)*ring*.7;
        const y = world.terrainHeight(x,z,0);
        // Find a walkable landing spot, not the inside of furniture or a gate wall.
        if (!world.blocked(x,z,.48,y,1.84,.24)) return candidate.set(x,y,z);
      }
    }
    return null;
  }
  function release(slot) {
    particles.supplyFx(slot.index,null);
    slot.state = 'free';slot.root.visible = false;slot.reward = null;
    slot.mixer.stopAllAction();slot.ring.visible = false;
  }
  function drop(enemy) {
    if (enemy.boss || !world.bossArena || Math.random() >= supplyRules.dropChance) return false;
    const slot = pool.find(s => s.state === 'free');
    if (!slot) return false;
    const landing = findLanding(enemy.root.position);
    if (!landing) return false;
    slot.landing.copy(landing);slot.source.copy(enemy.root.position);
    slot.ground = landing.y;
    slot.height = Math.max(.65,enemy.root.position.y-landing.y+Math.min(1.2,enemy.height*.45));
    slot.flight = (1.5+Math.sqrt(1.5*1.5+2*9.81*slot.height))/9.81;
    slot.age = slot.openAge = 0;slot.state = 'fall';slot.reward = rollSupply();
    slot.yaw = Math.random()*Math.PI*2;
    slot.root.position.set(slot.source.x,slot.ground+slot.height,slot.source.z);
    slot.root.rotation.set(0,slot.yaw,0);slot.root.scale.setScalar(1);
    slot.root.visible = slot.ring.visible = true;
    slot.ring.scale.setScalar(1);slot.ring.material.uniforms.fade.value = 1;
    for (const m of slot.materials) m.opacity = 1;
    slot.mixer.stopAllAction();slot.actions.wait.reset().play();slot.mixer.update(0);
    slot.root.updateMatrixWorld(true);
    particles.supplyFx(slot.index,slot.anchor);
    emit('supply:drop',{position:slot.root.position.toArray()});
    return true;
  }
  function reachable(slot, player, feet) {
    if (Math.abs(feet-slot.ground) > .75) return false;
    const p=slot.root.position, distance=Math.hypot(player.x-p.x,player.z-p.z);
    if (distance > supplyRules.pickupRadius) return false;
    origin.set(player.x,feet+.45,player.z);direction.set(p.x,slot.ground+.45,p.z).sub(origin);
    const length = direction.length();
    if (length < .01) return true;
    ray.set(origin,direction.multiplyScalar(1/length));
    for (const collider of world.colliders)
      if (ray.intersectBox(collider,hit) && hit.distanceToSquared(origin) < length*length-.001) return false;
    return true;
  }
  function collect(slot) {
    slot.state = 'open';slot.openAge = 0;
    slot.actions.wait.stop();slot.actions.warning.stop();
    slot.actions.dead.reset().setEffectiveTimeScale(1.65).play();
    // Mark it consumed before notifying gameplay, so it cannot award twice.
    onPickup(slot.reward);
    emit('supply:pickup',{...slot.reward,position:slot.root.position.toArray()});
  }
  function update(dt, player, feet) {
    if (dt <= 0) return;
    for (const slot of pool) {
      if (slot.state === 'free') continue;
      slot.age += dt;slot.mixer.update(dt);
      const p=slot.root.position;
      if (slot.state === 'fall') {
        const t=Math.min(slot.age,slot.flight),blend=T.MathUtils.smoothstep(t/slot.flight,0,1);
        p.set(T.MathUtils.lerp(slot.source.x,slot.landing.x,blend),
          slot.ground+Math.max(0,slot.height+1.5*t-4.905*t*t),
          T.MathUtils.lerp(slot.source.z,slot.landing.z,blend));
        slot.root.rotation.y=slot.yaw+.45*t;
        if (slot.age >= slot.flight) { slot.state='ready';p.copy(slot.landing); }
      }
      if (slot.state === 'ready' || slot.state === 'warning') {
        const landed=slot.age-slot.flight;
        p.y=slot.ground+Math.max(0,Math.sin(landed*11))*.10*Math.exp(-landed*6);
        if (slot.age > supplyRules.lifetime-8 && slot.state === 'ready') {
          slot.state='warning';slot.actions.wait.stop();slot.actions.warning.reset().play();
        }
        if (reachable(slot,player,feet)) collect(slot);
        else if (slot.age >= supplyRules.lifetime) { release(slot);continue; }
      }
      let alpha = 1;
      if (slot.state === 'open') {
        slot.openAge += dt;
        alpha = 1-T.MathUtils.smoothstep(slot.openAge,.60,1.22);
        slot.ring.scale.setScalar(1+slot.openAge*1.3);
        if (slot.openAge >= 1.22) { release(slot);continue; }
      } else if (slot.age > supplyRules.lifetime-1.2) {
        alpha = (supplyRules.lifetime-slot.age)/1.2;
      }
      for (const material of slot.materials) material.opacity = alpha;
      slot.ring.position.y = slot.ground-p.y+.022;
      slot.ring.material.uniforms.age.value = slot.age;
      slot.ring.material.uniforms.fade.value = alpha;
      // The tall locator fades immediately on pickup; the original EFK and
      // ground ring finish the opening beat together with the crate.
      const beaconFade=alpha*(slot.state==='open'?Math.max(0,1-slot.openAge*3):1);
      for(const material of slot.beaconMaterials) {
        material.uniforms.age.value=slot.age;
        material.uniforms.fade.value=beaconFade;
      }
      particles.supplyFx(slot.index,slot.anchor,alpha);
    }
  }
  function clear() { for (const slot of pool) release(slot); }
  return { drop, update, clear, get pickups(){return pool.filter(s=>s.state==='ready'||s.state==='warning');} };
}

// HUD state advances only with active gameplay time. No CSS animation clock
// can consume a buff while a shop, pause menu or result screen is open.
export function makeSupplyEffects() {
  const badge=document.getElementById('speed-buff'),count=document.getElementById('speed-seconds');
  const heal=document.getElementById('heal-glow'),speed=document.getElementById('speed-glow');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let speedLeft=0,healLeft=0,age=0,lastSeconds=-1;
  function draw() {
    badge.hidden = speedLeft <= 0;
    const seconds=Math.ceil(speedLeft);
    if (seconds!==lastSeconds) { count.textContent=seconds;lastSeconds=seconds; }
    badge.style.setProperty('--remaining',String(speedLeft/supplyRules.speedDuration));
    heal.style.opacity=String(healLeft > 0 ? Math.sin(Math.PI*(1-healLeft/.9))*(reduced.matches ? .5 : .85) : 0);
    speed.style.opacity=String(speedLeft > 0 ? (reduced.matches ? .42 : .48+.10*Math.sin(age*2.4))*Math.min(1,speedLeft) : 0);
  }
  function clear() { speedLeft=healLeft=age=0;draw(); }
  clear();
  return {
    heal() { healLeft=.9;draw(); },
    boost() { speedLeft=supplyRules.speedDuration;age=0;draw(); },
    update(dt) {
      const before=speedLeft;
      speedLeft=Math.max(0,speedLeft-dt);healLeft=Math.max(0,healLeft-dt);age+=dt;
      if (before>0 || healLeft>0 || heal.style.opacity!=='0') draw();
      if (before>0 && speedLeft===0) emit('supply:speed-end');
    },
    clear,
    get speedFactor() { return speedLeft>0?supplyRules.speedFactor:1; },
    get remaining() { return speedLeft; },
  };
}
