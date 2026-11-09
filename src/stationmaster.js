import { bossEnraged } from './rtp.js';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { frameClip } from './hunt.js';
import { makeBossHazards, containsBossHazard } from './boss-hazards.js';
import { makeBossImpactEffects } from './boss-impact-effects.js';
import { emit } from './events.js';

// Source big_reward is the death/fall sequence; out is a jump-away exit.
// Only defeat may play the fall. The standing end of ingame avoids its face-first landing.
export const stationmasterFrames=Object.freeze({walk:[720,780],ingame:[220,290],death:[560,680],
  train_come:[300,415],command:[300,400],small_reward:[430,445],middle_reward:[460,550]});
const maxHp=4200,height=7.2;
export async function loadStationmaster(scene,world,particles,groundImpact){
  const loader=new T.TextureLoader();
  const [asset,normal,mask,impactFX]=await Promise.all([
    new GLTFLoader().loadAsync('/station/stationmaster.glb'),loader.loadAsync('/station/station-normal.png'),
    loader.loadAsync('/station/station-mask.jpg'),makeBossImpactEffects(scene,particles,'warden'),particles.loadStation(),
  ]);
  normal.flipY=mask.flipY=false;
  const root=new T.Group(),holder=new T.Group(),model=asset.scene;root.name='站長';root.add(holder);holder.add(model);scene.add(root);
  const mats=[];
  model.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();o.material.normalMap=normal;o.material.normalScale.set(.65,.65);
    o.material.metalnessMap=mask;o.material.metalness=.85;o.material.roughness=.58;o.material.envMapIntensity=.9;
    o.material.emissive.set(0x53728b);o.material.emissiveIntensity=0;o.castShadow=true;o.frustumCulled=false;mats.push(o.material);});
  const mixer=new T.AnimationMixer(model),actions=Object.fromEntries(Object.entries(stationmasterFrames).map(([name,range])=>{
    const a=mixer.clipAction(frameClip(asset.animations[0],name,range,0));if(name!=='walk'){a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;}return [name,a];}));
  actions.walk.play();mixer.update(0);root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(model.getObjectByName('Station_director_part0'),true),center=bounds.getCenter(new T.Vector3()),factor=height/(bounds.max.y-bounds.min.y);
  holder.scale.setScalar(factor);holder.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
  const target={root,model,height,hitRadius:height,bodyRadius:2.35,groundY:0,boss:true,
    chest:model.getObjectByName('Bip001_Spine1'),head:model.getObjectByName('Bip001_Head'),
    type:{id:'stationmaster',name:'站長'},hp:maxHp,maxHp,alive:false,opacity:1};
  const bodyFx=new T.Object3D();bodyFx.rotation.x=-Math.PI/2;bodyFx.scale.setScalar(.75);root.add(bodyFx);
  const bellFx=new T.Object3D();bellFx.scale.setScalar(100);(model.getObjectByName('Bell_01')??target.chest).add(bellFx);
  const hazards=makeBossHazards(scene,{count:4,theme:'station'}),point=new T.Vector3();
  let state='off',current='walk',time=0,cycle=0,cooldown=0,health=100,flash=0,playerFeet=0;
  function play(name){const prev=actions[current];current=name;const next=actions[name].reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();if(prev!==next)prev.crossFadeTo(next,.18,false);}
  function stop(){state='off';target.alive=false;root.visible=false;hazards.clear();impactFX.clear();particles.stopStation();}
  function reset(){stop();state='intro';time=cycle=cooldown=flash=0;health=100;target.hp=maxHp;target.rage=0;target.hitCount=0;target.opacity=1;root.visible=true;
    root.position.set(0,0,-9);root.rotation.set(0,0,0);mixer.stopAllAction();current='walk';play('ingame');mixer.update(0);
    for(const m of mats){m.transparent=false;m.opacity=1;}particles.stationFx('intro',bodyFx);}
  function mark(i,spec,delay){const z=hazards.mark(i,spec,delay);z.floorY=world.verticalLimits(spec.x,spec.z,playerFeet).floor;
    z.mesh.position.y=z.floorY+.045;return z;}
  function attack(player){
    time=0;const kind=cycle++%3;hazards.clear();
    if(kind===0){state='bell';play('train_come');world.requestTrain();world.sound('SD_train',.3);particles.stationFx('bell',bellFx);
      mark(0,{x:root.position.x,z:root.position.z,radius:14,inner:3.5,duration:1.2,steps:12,kind:'bell'},1.6);
    }else if(kind===1){state='slam';play('middle_reward');world.sound('SD_reward_M_1',.25);particles.stationFx('strike',bodyFx);
      mark(0,{x:player.x,z:player.z,radius:3.8,kind:'slam',linger:.5},1.35);
      if(bossEnraged(target))mark(1,{x:T.MathUtils.clamp(player.x+(player.x>0?-4:4),-7,7),z:player.z+3,radius:3,kind:'slam'},2.1);
    }else{state='express';play('command');world.sound('SD_train',.24);particles.stationFx('bell',bellFx);
      const safe=Math.floor(cycle/3)%3;for(let i=0;i<3;i++)if(i!==safe)mark(i,{shape:'line',x:(i-1)*5.5,z:-15,dx:0,dz:1,length:41,width:3.9,duration:1.3,steps:16,kind:'express'},1.6+i*.25);
    }
    emit('boss:attack',{species:'stationmaster',attack:state,phase:bossEnraged(target)?2:1});
  }
  function defeat(){if(state==='dying'||state==='done'||state==='off')return;target.alive=false;hazards.clear();particles.stopStation();state='dying';time=0;
    play('death');particles.stationFx('burst',bodyFx);world.sound('SD_reward_L_1',.3);}
  function update(dt,player,onDamage,onWin,feet=0){
    playerFeet=feet;
    if(state==='off'||state==='done')return;time+=dt;cooldown=Math.max(0,cooldown-dt);flash=Math.max(0,flash-dt*2);
    mixer.update(dt);root.updateMatrixWorld(true);impactFX.update(dt);for(const m of mats)m.emissiveIntensity=flash;
    if(state==='dying'){if(time>3.55)for(const m of mats){m.transparent=true;m.opacity=Math.max(0,(4.3-time)/.75);}if(time>=4.3){state='done';root.visible=false;onWin();}return;}
    if(state==='intro'){if(time-dt<.34&&time>=.34){world.sound('SD_in_1',.3);groundImpact(root.position,.9,'step');}
      if(time>=actions.ingame.getClip().duration){state='roam';time=0;target.alive=true;play('walk');}return;}
    const hurt=()=>{if(cooldown>0||health<=0||world.playerLocked)return;cooldown=.85;health=Math.max(0,health-10);onDamage(health);};
    hazards.update(dt,(zone,contact)=>{
      impactFX.burst(zone,contact);point.set(contact.x,zone.floorY+.06,contact.z);
      if(contact.shape==='line'){point.x+=contact.dx*contact.length/2;point.z+=contact.dz*contact.length/2;}
      if(contact.step%3===0)groundImpact(point,.8,'attack',zone.kind==='bell'?'pulse':'line',root.position);
      if(!zone.hit&&Math.abs(playerFeet-zone.floorY)<1.8&&containsBossHazard(contact,player)){zone.hit=true;hurt();}
    });
    if(state!=='roam'){if(time>=actions[current].getClip().duration+.4){state='roam';time=0;play('walk');}return;}
    const p=root.position,dx=player.x-p.x,dz=player.z-p.z,d=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
    root.rotation.y+=Math.atan2(Math.sin(yaw-root.rotation.y),Math.cos(yaw-root.rotation.y))*(1-Math.exp(-dt*2.4));
    if(d>10){const nx=T.MathUtils.clamp(p.x+dx/d*dt*1.7,-5.4,5.4),nz=T.MathUtils.clamp(p.z+dz/d*dt*1.7,-13,16);
      if(!world.blocked(nx,nz,2.35,0,height)){p.x=nx;p.z=nz;}actions.walk.setEffectiveTimeScale(.85);
    }else actions.walk.setEffectiveTimeScale(.12);
    if(d<2.65)hurt();if(time>(bossEnraged(target)?1.3:2.2))attack(player);
  }
  return {target,reset,stop,defeat,update,get hazards(){return hazards.pool;},get health(){return health;},
    heal(amount){if(health<=0||state==='off'||!Number.isFinite(amount))return 0;const old=health;health=Math.min(100,health+Math.max(0,amount));return health-old;},
    hit(){flash=.28;},smallPrize(){const bigCoins=T.MathUtils.randInt(1,3),smallCoins=T.MathUtils.randInt(5,7);return {bigCoins,smallCoins,floorY:0};},
    cue(){return state==='intro'?'末班鐘聲 · 站長登場':state==='bell'?'催命鐘聲：避開擴散音波':state==='slam'?'驗票重擊：離開紅圈':state==='express'?'亡命快線：移至空白通道':state==='dying'?'末班列車 · 討伐完成':'留意左右列車，阻止殭屍下車';},
  };
}
