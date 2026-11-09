import { bossEnraged } from './rtp.js';

import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { frameClip } from './hunt.js';
import { makeBrideHazards, containsBrideHazard } from './bride-hazards.js';
import { clipBossLane } from './boss-hazards.js';
import { makeBossImpactEffects } from './boss-impact-effects.js';
import { emit } from './events.js';
import { addCastleCharacterLight } from './castle-character-light.js';

export const brideFrames=Object.freeze({
  ingame:[20,150],walk:[200,320],out:[400,560],idle2:[600,800],idle1:[850,1000],
  small_reward:[1050,1080],middle_reward:[1150,1370],big_reward:[1400,1610],
});
const height=7.9,maxHp=3800;
export async function loadBride(scene,world,particles,groundImpact) {
  const loader=new T.TextureLoader();
  const names=['Eternal_Bride_Normalmap.jpg','Eternal_Bride_Metallic.jpg','Eternal_Bride_Roughness.jpg',
    'Eternal_Bride_emissionmsk.jpg','moon_Normal_OpenGL.jpg','moon_Metallic.jpg','moon_Roughness.jpg','fx/noise4.png'];
  const [asset,maps]=await Promise.all([
    new GLTFLoader().loadAsync('/monsters/bride.glb'),
    Promise.all(names.map(n=>loader.loadAsync('/castle/'+n))),
    particles.loadBride(),
  ]);
  for(const t of maps){t.flipY=false;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;}
  const dissolve={value:0},flash={value:0};
  function customize(material,depth=false) {
    material.onBeforeCompile=s=>{
      s.uniforms.brideNoise={value:maps[7]};s.uniforms.brideDissolve=dissolve;s.uniforms.brideFlash=flash;
      s.vertexShader='varying vec2 brideUV;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbrideUV=uv;');
      s.fragmentShader='varying vec2 brideUV;uniform sampler2D brideNoise;uniform float brideDissolve,brideFlash;\n'+s.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
        float field=(texture2D(brideNoise,fract(brideUV*3.)).g+texture2D(brideNoise,fract(brideUV*2.)).r)*.5;
        float lower=brideDissolve*1.1-.1;
        if(field<=lower)discard;
      `);
      if(!depth)s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float edge=brideDissolve>0.?1.-clamp((field-lower)/.1,0.,1.):0.;
        totalEmissiveRadiance+=vec3(.6627,0.,.9216)*edge*2.2+vec3(.2,.1,.24)*brideFlash;
      `);
    };
    material.customProgramCacheKey=()=>depth?'bride-dissolve-depth':'bride-dissolve-pbr';
  }
  const root=new T.Group(),holder=new T.Group(),model=asset.scene;root.name='鬼新娘';
  root.add(holder);holder.add(model);scene.add(root);
  const materials=new Map();
  model.traverse(o=>{
    if(!o.isMesh)return;
    const moon=/Moon/.test(o.name);
    if(!materials.has(moon)) {
      const m=o.material.clone();m.name=moon?'Haunted moon':'Eternal Bride';
      m.normalMap=maps[moon?4:0];m.normalScale.set(moon?.9:.75,moon?.9:.75);
      m.metalnessMap=maps[moon?5:1];m.metalness=moon?.62:.38;
      m.roughnessMap=maps[moon?6:2];m.roughness=moon?.72:.82;m.envMapIntensity=moon?1.1:.8;
      if(!moon){m.emissiveMap=maps[3];m.emissive.set(0x9b48e6);m.emissiveIntensity=.25;}
      customize(m);addCastleCharacterLight(m,moon?.24:.40);materials.set(moon,m);
    }
    o.material=materials.get(moon);o.castShadow=true;o.frustumCulled=false;
    const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});customize(depth,true);o.customDepthMaterial=depth;
  });
  const mixer=new T.AnimationMixer(model);
  const actions=Object.fromEntries(Object.entries(brideFrames).map(([name,range])=>{
    const a=mixer.clipAction(frameClip(asset.animations[0],name,range,0));
    if(!['walk','idle1'].includes(name)){a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;}
    return [name,a];
  }));
  actions.idle1.play();mixer.update(0);root.updateMatrixWorld(true);
  // Detached roses are intentionally stored below the stage in idle. Exclude those
  // animated props from normalization; keep them intact for the reward clips.
  const bounds=new T.Box3();
  model.traverse(o=>{if(o.isMesh&&!o.name.endsWith('part2'))bounds.union(new T.Box3().setFromObject(o,true));});
  const center=bounds.getCenter(new T.Vector3()),factor=height/(bounds.max.y-bounds.min.y);
  holder.scale.setScalar(factor);holder.position.set(-center.x*factor,.45-bounds.min.y*factor,-center.z*factor);
  const target={root,model,height:height+.45,hitRadius:height,bodyRadius:2.7,groundY:0,boss:true,
    chest:model.getObjectByName('Bip001_Spine1'),head:model.getObjectByName('Bip001_Head'),
    type:{id:'bride',name:'鬼新娘'},hp:maxHp,maxHp,alive:false,opacity:0};
  // FishEternalBrideEfkSetting: the original local rotation is -90° about X.
  // Bone-bound effects inherit the complete animated bone matrix, including cm conversion.
  const soulBone=model.getObjectByName('Soul')??model.getObjectByName('Bip001_L_Hand');
  const soul=new T.Object3D();soul.rotation.x=-Math.PI/2;soul.scale.setScalar(100);soulBone.add(soul);
  const body=new T.Object3D();body.scale.setScalar(factor*.7);root.add(body);
  // Non-bone Cocos effects live in the ground XY plane; convert to Three's XZ plane.
  body.rotation.x=-Math.PI/2;
  const burst=new T.Object3D();burst.rotation.x=-Math.PI/2;burst.scale.setScalar(factor*.7);scene.add(burst);
  const ghosts=Array.from({length:6},()=>{const anchor=new T.Object3D();anchor.rotation.x=-Math.PI/2;anchor.scale.setScalar(.15);scene.add(anchor);return {anchor,start:new T.Vector3(),age:2,life:1.5};});
  const soulPoint=new T.Vector3(),impact=new T.Vector3();
  const hazards=makeBrideHazards(scene),march=[];
  const impactFX=await makeBossImpactEffects(scene,particles,'bride');
  const previousPlayer=new T.Vector2(),velocity=new T.Vector2();
  let trackingPlayer=false;
  let hunt,camera,current='idle1',state='off',time=0,cycle=0,beat=0,hp=100,contactCooldown=0,wait=1.4;
  function play(name,blend=.18) {
    if(current===name&&actions[name].isRunning())return;
    const previous=actions[current];current=name;
    const next=actions[name].reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if(previous!==next)previous.crossFadeTo(next,blend,false);
  }
  function reset() {
    stop();trackingPlayer=false;velocity.set(0,0);contactCooldown=0;mixer.stopAllAction();current='idle1';state='intro';time=cycle=beat=0;hp=100;
    target.hp=maxHp;target.rage=0;target.hitCount=0;target.alive=false;target.opacity=0;root.visible=true;
    root.position.set(0,0,-12);root.rotation.set(0,0,0);
    dissolve.value=flash.value=0;play('ingame',0);mixer.update(0);
    particles.brideFx('intro',body);
  }
  function clearAttack() {hazards.clear();hunt?.clearCommands();march.length=0;}
  function beginDeath() {
    clearAttack();particles.stopBride();state='dying';time=0;
    play('big_reward');particles.brideFx('burst',body);
  }
  function startAttack(player) {
    clearAttack();time=beat=0;
    const pattern=cycle++%3;
    if(pattern===0) {
      state='summon';play('middle_reward');particles.brideFx('summon',body);particles.brideFx('soul',soul);
      markInvitations(player);
    } else if(pattern===1) {
      state='march';play('idle2');particles.brideFx('soul',soul,6.67);
      const candidates=hunt.enemies.filter(e=>e.alive&&!e.entry)
        .sort((a,b)=>a.root.position.distanceToSquared(camera.position)-b.root.position.distanceToSquared(camera.position))
        .slice(0,bossEnraged(target)?6:4);
      candidates.forEach((e,i)=>{
        const p=e.root.position,lane=clipBossLane(p,player,world.navigationBounds,5,30);
        const delay=1.4+Math.floor(i/2)*.5,speed=bossEnraged(target)?6.3:5.5;
        const end=new T.Vector3(p.x+lane.dx*lane.length,0,p.z+lane.dz*lane.length);
        hazards.mark(i,{...lane,width:2.2,linger:Math.min(4,lane.length/speed),kind:'march'},delay);
        hunt.command(e,p,delay+.05,0);
        march.push({enemy:e,end,hit:false,launched:false,delay,speed});launchGhost(i,p);
      });
      // With no procession left to command, send two visible spectral fissures.
      // Clearing the adds still removes their collision damage and the extra lanes.
      if(!candidates.length)for(let i=0;i<2;i++){
        const start={x:root.position.x+(i?3:-3),z:root.position.z};
        const lane=clipBossLane(start,{x:player.x+(i?1.4:-1.4),z:player.z},world.navigationBounds);
        hazards.mark(i,{...lane,width:2.3,duration:.85,steps:8,kind:'spectral'},1.7+i*.6);
      }
    } else {
      state='vow';play('big_reward');particles.brideFx('burst',body);
      // Lock the circle once, leaving both its hollow centre and its exterior safe.
      burst.position.set(T.MathUtils.clamp(player.x,-13,13),.06,T.MathUtils.clamp(player.z,-18,18));
      hazards.mark(0,{shape:'circle',x:burst.position.x,z:burst.position.z,radius:11,inner:4.3,linger:.35,duration:.85,steps:10,kind:'vow'},2.333);
    }
    emit('boss:attack',{species:'bride',attack:state,phase:bossEnraged(target)?2:1});
  }
  function markInvitations(player) {
    const enraged=bossEnraged(target),count=enraged?3:2;
    const lead=.45,px=player.x+velocity.x*lead,pz=player.z+velocity.y*lead;
    for(let i=0;i<count;i++) {
      const angle=beat*1.9+(i-1)*Math.PI+.4;
      const x=T.MathUtils.clamp(px+(i?Math.cos(angle)*6.4:0),-17,17);
      const z=T.MathUtils.clamp(pz+(i?Math.sin(angle)*6.4:0),-22,22);
      hazards.mark((beat%2)*3+i,{shape:'circle',x,z,radius:i?3.1:3.5,inner:0,
        linger:.35,duration:.28,steps:4,kind:'summon'},beat?1.35:1.6);
    }
  }
  function launchGhost(i,from) {
    const g=ghosts[i%ghosts.length];g.start.copy(from);g.start.y+=1.35;
    g.age=0;g.life=1.2+i*.1;g.anchor.position.copy(g.start);
    particles.brideFx('ghost',g.anchor,g.life);
  }
  function updateGhosts(dt) {
    soulBone.getWorldPosition(soulPoint);
    for(const g of ghosts){
      if(g.age>=g.life)continue;
      g.age=Math.min(g.life,g.age+dt);const t=g.age/g.life,u=t*t,c=1-u;
      // Same raised cubic trajectory as FishEternalBrideSoulCollect, in metres.
      g.anchor.position.copy(g.start).multiplyScalar(c*c*c)
        .addScaledVector(g.start,c*c*u*3).addScaledVector(soulPoint,c*u*u*3+u*u*u);
      g.anchor.position.y+=3.2*c*c*u*3+.64*c*u*u*3;
      if(g.age===g.life)particles.brideFx('hit',soul,1);
    }
  }
  function update(dt,player,onDamage,onWin) {
    if(state==='off'||state==='done')return;
    impactFX.update(dt);
    if(trackingPlayer&&dt>0){
      const a=1-Math.exp(-dt*8);
      velocity.x+=(T.MathUtils.clamp((player.x-previousPlayer.x)/dt,-7.9,7.9)-velocity.x)*a;
      velocity.y+=(T.MathUtils.clamp((player.z-previousPlayer.y)/dt,-7.9,7.9)-velocity.y)*a;
      velocity.clampLength(0,7.9);
    }
    previousPlayer.set(player.x,player.z);trackingPlayer=true;
    time+=dt;contactCooldown=Math.max(0,contactCooldown-dt);mixer.update(dt);root.updateMatrixWorld(true);
    flash.value=Math.max(0,flash.value-dt*3);updateGhosts(dt);
    if(state==='dying') {
      dissolve.value=T.MathUtils.clamp((time-2.333)/4,0,1);
      if(time>=7){state='done';root.visible=false;onWin();}
      return;
    }
    if(state==='intro'){
      if(time>=actions.ingame.getClip().duration){target.alive=true;target.opacity=1;state='roam';time=0;wait=1.4;play('idle1');}
      return;
    }
    function hurt() {
      if(!target.alive||hp<=0||contactCooldown>0)return false;
      contactCooldown=.8;hp=Math.max(0,hp-10);onDamage(hp);return true;
    }
    hazards.update(dt,(zone,contact)=>{
      if(!target.alive||zone.kind==='march')return;
      impactFX.burst(zone,contact);
      impact.set(contact.x,.09,contact.z);
      if(contact.shape==='line'){impact.x+=contact.dx*contact.length/2;impact.z+=contact.dz*contact.length/2;}
      // Ring impacts stay on the annulus, never flash at its safe centre.
      if(contact.inner>0){const a=Math.atan2(player.z-zone.z,player.x-zone.x);impact.x+=Math.cos(a)*contact.radius;impact.z+=Math.sin(a)*contact.radius;}
      groundImpact(impact,contact.step===0?.65:.24,'slam','magic',impact);
      if(!zone.hit && containsBrideHazard(contact,player) && hurt())zone.hit=true;
      if(state==='off')return;
      if(zone.kind==='summon' && contact.step===zone.steps-1) {
        impact.set(zone.x,0,zone.z);hunt.summon([impact],camera);
      }
    });
    if(state==='off')return;
    if(state==='summon') {
      // The original middle-reward cues land at 0 / 3.033 / 5.967 seconds.
      if(target.alive&&beat<2 && time>=(beat===0?1.833:4.767)){beat++;markInvitations(player);}
    }else if(state==='march'&&target.alive){
      for(let i=0;i<march.length;i++){
        const m=march[i],e=m.enemy;
        if(m.cancelled||!e.alive||e.entry){
          m.cancelled=true;hazards.pool[i].active=hazards.pool[i].mesh.visible=false;continue;
        }
        if(!m.launched&&time>=m.delay){
          m.launched=true;hunt.command(e,m.end,Math.min(4.5,m.end.distanceTo(e.root.position)/m.speed),m.speed);
          particles.brideFx('hit',soul,.45);
        }
        if(!m.launched||!e.command.active){
          if(m.launched)hazards.pool[i].active=hazards.pool[i].mesh.visible=false;
          continue;
        }
        if(!m.hit&&Math.hypot(e.root.position.x-player.x,e.root.position.z-player.z)<1.1&&hurt()){
          m.hit=true;if(state==='off')return;
        }
      }
    }else if(state==='vow'&&target.alive&&beat===0&&time>=3.7) {
      beat=1;hazards.mark(1,{shape:'circle',x:burst.position.x,z:burst.position.z,radius:4.3,inner:0,linger:.35,duration:.35,steps:5,kind:'vow-core'},1.7);
    }
    if(['summon','march','vow','prize'].includes(state)){
      if(actions[current].time>=actions[current].getClip().duration){
        clearAttack();
        if(!target.alive)return beginDeath();
        state='roam';time=0;wait=bossEnraged(target)?.85:1.6;play('idle1');
      }
      return;
    }
    if(!target.alive)return beginDeath();
    const p=root.position,dx=player.x-p.x,dz=player.z-p.z,d=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
    root.rotation.y+=Math.atan2(Math.sin(yaw-root.rotation.y),Math.cos(yaw-root.rotation.y))*(1-Math.exp(-dt*2.2));
    if(d>14){
      const speed=dt*1.4;
      const x=p.x+dx/d*speed,z=p.z+dz/d*speed;
      if(!world.blocked(x,z,3.1,.2,height)){p.x=x;p.z=z;play('walk');}
      else play('idle1');
    }else play('idle1');
    if(time>=wait)startAttack(player);
  }
  function stop() {state='off';target.alive=false;root.visible=false;clearAttack();impactFX.clear();particles.stopBride();for(const g of ghosts)g.age=g.life;}
  function defeat(){target.alive=false;hazards.clear();hunt?.clearCommands();if(state==='roam'||state==='prize')beginDeath();}
  function smallPrize() {
    if(state==='roam'){state='prize';play('small_reward');time=0;}
    particles.brideFx('hit',soul);
    const bigCoins=T.MathUtils.randInt(1,3),smallCoins=T.MathUtils.randInt(5,7);
    return {bigCoins,smallCoins,floorY:0};
  }
  return {target,reset,update,stop,defeat,smallPrize,hit(){flash.value=.35;},
    get hazards(){return hazards.pool;},
    heal(amount){if(hp<=0||state==='off'||!Number.isFinite(amount))return 0;const old=hp;hp=Math.min(100,hp+Math.max(0,amount));return hp-old;},
    bindHunt(value,cam){hunt=value;camera=cam;},
    get health(){return hp;},
    cue(){return state==='intro'?'冥婚之夜 · 鬼新娘降臨':state==='summon'?'亡者請柬：遠離咒圈':
      state==='march'?'送葬遊行：側移、射殺阻止衝鋒':state==='vow'?(beat?'誓約反噬：立即離開圓心':'怨月誓環：空心內與環外安全'):
      state==='dying'?'婚誓已破 · 怨靈消散':bossEnraged(target)?'怨念加劇':'';},
  };
}
