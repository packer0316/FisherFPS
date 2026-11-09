import './style.css';
import './prison-ui.css';
import './boss-victory.css';
import './lobby.css';
import './auto-play.css';
import './reward-tags.css';
import * as T from 'three';
import { makeWorld, spawn } from './world.js';
import { makeViewmodel, startingWeapon, weapons } from './weapons.js';
import { makeEffects } from './effects.js';
import { loadCombatParticles } from './combat-particles.js';
import { loadHunt } from './hunt.js';
import { loadRewardCoins } from './reward-coins.js';
import { loadRewardTags } from './reward-tags.js';
import { makeBossPayout } from './boss-payout.js';
import { loadBossSupplies, makeSupplyEffects } from './boss-supplies.js';
import { $, gunIcon, makeRadar } from './ui.js';
import { emit } from './events.js';
import { makeLookInput, requestRawPointerLock } from './look-input.js';
import { makeDamageFeedback } from './damage-feedback.js';
import { makeGrenadeState } from './grenade-state.js';
import { grenadeStats, throwVelocity, blastDamage } from './grenade-physics.js';
import { makeGrenadeProjectiles } from './grenade-projectiles.js';
import { makeAutoPlayer } from './auto-play.js';
import { makeAutoPlayUI } from './auto-play-ui.js';

async function boot() {
  const canvas = $('world'),
    coarse = matchMedia('(pointer:coarse)').matches;
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.35 : 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.99;
  renderer.autoClear = false;
  let scene = new T.Scene();
  const camera = new T.PerspectiveCamera(65, 1, 0.14, 220);
  camera.rotation.order = 'YXZ';
  const player = { x: spawn.x, z: spawn.z, yaw: -0.122, pitch: 0.053 };
  const lookInput=makeLookInput();
  let world = makeWorld(scene, renderer, coarse);
  let [hunt, particles, view, rewardCoins, rewardTags] = await Promise.all([
    loadHunt(scene, world),
    loadCombatParticles(renderer, $('wallet-pickup')),
    makeViewmodel(scene, camera, world.sun),
    loadRewardCoins(scene, world, camera, coarse),
    loadRewardTags($('hud')),
  ]);
  let fx = makeEffects(scene, particles.playBlood),
    radar = makeRadar(world, player);
  const desert={scene,world,hunt,rewardCoins,fx,radar};
  const levels=new Map(), loadingLevels=new Map();
  let fieldReturn, bossReturn='home', loadingChallenge=false, challengeId='warden';
  let warden=null, supplies=null;
  let bossVictory=null;
  const supplyEffects=makeSupplyEffects();
  const damageFeedback=makeDamageFeedback($('damage-overlay'));
  const economy = {
    wallet: 100000,
    bet: 10,
    kills: 0,
    wave: 1,
    owned: new Set([startingWeapon, 'pistol', 'knife', 'grenade']),
    weapon: startingWeapon,
    ammo: { grenade: grenadeStats.supply, ...Object.fromEntries(Object.entries(weapons).filter(([, w]) => w.mag).map(([id, w]) => [id, w.mag])) },
  };
  const grenade = makeGrenadeState(throwGrenade);
  const pilot=makeAutoPlayer(),pilotPosition=new T.Vector3();
  let autoReturn='pause';
  const autoUI=makeAutoPlayUI({onStart:startAutoPlay,onClose:closeAutoPlay});
  let grenades = makeGrenadeProjectiles(scene,world,explodeGrenade,grenadeBounce);
  const playerVelocity = new T.Vector3(), previousPlayer = new T.Vector3();
  const keys = new Set(),
    stick = { x: 0, y: 0 },
    aim = new T.Vector3(),
    muzzle = new T.Vector3(),
    screen = new T.Vector3();
  let mode = 'home',
    atHome = true,
    shopReturn = 'home',
    lock = null,
    clock = 0,
    shotTime = 0,
    reloadLeft = 0,
    swayX = 0,
    swayY = 0;
  let uiLeft = 0,
    flashLeft = 0,
    rewardLeft = 0,
    toastLeft = 0,
    moving = 0,
    walkPhase = 0,
    last = performance.now(),
    slow = 0,
    readyToScale = 3;
  let meleeContact = 0,
    reloadDuration = 0;
  let scoped = false,
    aimTravel = 0,
    aimFov = camera.fov,
    ads = 0,
    reloadEmpty = false,
    rightDrag = 0;
  function setScope(on) {
    scoped = on;
    $('scope-btn').setAttribute('aria-pressed', String(on));
  }
  function toggleScope() {
    if (mode === 'play' && weapon().aimFov && reloadLeft <= 0) setScope(!scoped);
  }
  function updateScope(dt) {
    const target = scoped && view.isReady() ? 1 : 0;
    // Keep the outgoing sight's field of view while lowering it to switch weapons.
    if (target) aimFov = weapon().aimFov;
    aimTravel += Math.sign(target - aimTravel) * Math.min(Math.abs(target - aimTravel), dt / 0.245);
    const next = T.MathUtils.smoothstep(aimTravel, 0, 1);
    if (next === ads) return;
    ads = next;
    camera.fov = T.MathUtils.lerp(65, aimFov, ads);
    camera.updateProjectionMatrix();
    $('reticle').style.opacity = String(1 - T.MathUtils.smoothstep(ads, 0.04, 0.62));
  }
  let triggerHeld = false,
    triggerTap = false;
  const gravity = 9.81, standingHeight = 1.84, crouchedHeight = 1.23;
  let feet = world.terrainHeight(player.x, player.z),
    verticalSpeed = 0,
    grounded = true,
    bodyHeight = standingHeight,
    tuckInAir = false,
    touchCrouch = false,
    jumpQueued = false,
    airbornePace = 5.25,
    stepOffset = 0,
    landingTime = 0,
    landingDip = 0;
  let kickPitch = 0,
    kickYaw = 0;
  let tremor = 0, tremorTime = 0, tremorSide = 1, tremorDecay = 8;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function wardenImpact(at, strength, kind, attack, origin) {
    fx.groundBurst(at, strength, attack, origin);
    if (!reducedMotion.matches) {
      const dx = player.x - at.x, dz = player.z - at.z;
      const distance = Math.hypot(dx, dz);
      const step = kind === 'step';
      const force = step ? 0.21 * strength / (1 + 0.15 * distance)
        : strength * (0.3 + 0.7 / (1 + 0.12 * distance));
      if (force > tremor * 0.8) {
        const side = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
        tremorSide = Math.abs(side) > 0.1 ? Math.sign(side) : -tremorSide;
        tremor = Math.min(1.5,Math.max(tremor,force));
        tremorTime = 0;
        tremorDecay = step ? 11 : attack === 'circle' || attack === 'pulse' ? 5.8 : 7.5;
        cameraPose(); // Apply the initial jolt on the same frame as the hit and debris.
      }
    }
    emit('boss:impact', { species: warden?.target.type.id ?? 'warden', kind, attack, position: at.toArray(), strength });
  }
  const shotDirection = new T.Vector3();
  const mag = () => economy.ammo[economy.weapon],
    weapon = () => weapons[economy.weapon];
  function alignWallet() {
    rewardCoins.setWalletTarget($('wallet-anchor').getBoundingClientRect(), canvas.getBoundingClientRect());
    rewardTags.align($('wallet-anchor').closest('.vitals').getBoundingClientRect(), innerWidth,
      document.querySelector('header').getBoundingClientRect().bottom + 6);
  }
  function resize() {
    lookInput.clear(performance.now());
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    alignWallet();
  }
  // Font loading and responsive HUD layouts can also move the icon without a viewport resize.
  const walletObserver = new ResizeObserver(alignWallet);
  walletObserver.observe($('wallet-anchor').closest('.vitals'));
  addEventListener('resize', resize);
  resize();
  function cameraPose() {
    camera.position.set(
      player.x,
      feet + bodyHeight - (standingHeight - spawn.y) + stepOffset
        - landingDip * Math.sin(Math.PI * landingTime / 0.20)
        + (grounded ? Math.sin(walkPhase) * 0.025 * moving : 0),
      player.z,
    );
    camera.rotation.set(player.pitch + kickPitch, player.yaw + kickYaw, 0, 'YXZ');
    if (tremor > 0.003 && !reducedMotion.matches) {
      const t = tremorTime;
      const force = tremor * (1 - 0.44 * ads);
      camera.position.y += force * (0.092 * Math.cos(33 * t) + 0.027 * Math.cos(56 * t));
      camera.rotation.x += force * (0.016 * Math.cos(31 * t) - 0.006 * Math.sin(53 * t));
      camera.rotation.z += force * tremorSide * (0.013 * Math.cos(26 * t) + 0.005 * Math.sin(43 * t));
      camera.rotation.y += force * tremorSide * 0.006 * Math.sin(29 * t);
    }
    camera.updateMatrixWorld(true);
  }
  function notice(text) {
    $('toast').textContent = text;
    $('toast').style.display = 'block';
    toastLeft = 2.6;
  }
  function sync() {
    $('wallet').textContent = economy.wallet.toLocaleString('en-US');
    $('lobby-wallet').textContent=economy.wallet.toLocaleString('en-US');
    $('lobby-weapon').textContent=weapon().name;
    $('bet-amount').value = String(economy.bet);
    $('bet-minus').disabled = economy.bet <= 1;
    $('bet-plus').disabled = economy.bet >= 1000;
    $('kills').textContent = String(economy.kills).padStart(2, '0');
    $('wave').textContent = String(economy.wave).padStart(2, '0');
    const knife = economy.weapon === 'knife', throwable = economy.weapon === 'grenade', manual = knife || throwable;
    $('ammo').textContent = knife ? '近戰' : String(mag()).padStart(2, '0');
    $('capacity').parentElement.hidden = manual;
    $('capacity').textContent = weapon().mag ?? '';
    $('reload-btn').hidden = manual;
    $('fire-btn').setAttribute('aria-label',throwable?'按住拔銷蓄力，放開投擲':'射擊');
    $('weapon-name').textContent = weapon().name;
    $('cost').textContent = throwable ? '配發 5 顆 · 不扣金幣' : knife ? '近戰距離 2.5 公尺' : economy.bet + ' 幣 / 發';
    $('scope-btn').hidden = !weapon().aimFov;
    const weaponIcon = $('weapon-icon');
    if (weaponIcon.dataset.weapon !== economy.weapon) {
      weaponIcon.innerHTML = gunIcon(economy.weapon);
      weaponIcon.dataset.weapon = economy.weapon;
    }
    $('shop-balance').textContent = economy.wallet.toLocaleString('en-US');
  }
  function stopInput() {
    lookInput.clear(performance.now());
    keys.clear();
    jumpQueued = touchCrouch = false;
    $('crouch-btn').setAttribute('aria-pressed', 'false');
    triggerHeld = triggerTap = false;
    grenade.cancel();
    stick.x = stick.y = 0;
    $('stick').firstElementChild.style.transform = '';
    moving = 0;
  }
  function setMode(next) {
    if(next!=='play')stopAutoPlay(false);
    mode = next;
    if (next !== 'play' && next !== 'result') damageFeedback.clear();
    if (next !== 'play') setScope(false);
    stopInput();
    lock = null;
    $('app').classList.toggle('playing', next === 'play');
    atHome=next==='home'||(next==='shop'&&shopReturn==='home')||(next==='challenges'&&bossReturn==='home');
    $('app').classList.toggle('at-home',atHome);
    $('app').classList.toggle('paused',next==='pause');
    $('lobby').hidden=next!=='home';
    $('pause-home').hidden=next!=='pause';
    $('pause-autoplay').hidden=next!=='pause';
    $('pause-boss').hidden=next!=='pause';
    document.querySelector('header .mode').lastChild.textContent=atHome?' 遊戲大廳':world.castle?' 冥婚古堡':warden?' 監獄討伐':' 殭屍獵場';
    alignWallet();
    $('brief').hidden = next !== 'ready' && next !== 'pause';
    $('shop').hidden = next !== 'shop';
    $('boss-menu').hidden = next !== 'challenges';
    refreshVictoryOverlay();
    $('session-status').textContent = {
      home:'遊戲大廳', ready: '待命中',
      pause: '已暫停',
      play: '獵殺進行中',
      shop: '軍械整備中',
      challenges: '挑戰選擇', result: '挑戰結束',
      autoplay:'自動遊玩設定',
    }[next];
    $('deploy').querySelector('strong').textContent = next === 'pause' ? '返回' : '進入獵場';
    $('brief').querySelector('h1').innerHTML =
      next === 'pause' ? '行動暫停<span>.</span>' : '沙境獵場<span>.</span>';
    if (next !== 'play' && document.pointerLockElement === canvas) document.exitPointerLock();
  }
  function autoContext(){
    return {world,hunt,economy,grenade,position:pilotPosition.set(player.x,feet,player.z),eye:camera.position,
      velocity:playerVelocity,grounded,ready:view.isReady(),hazards:warden?.hazards??[],pickups:supplies?.pickups??[],health:warden?.health??100};
  }
  function stopAutoPlay(notify=true){
    if(!pilot.enabled)return;
    pilot.stop();stopInput();lock=null;$('autoplay-live').hidden=true;
    if(notify)notice('已停止自動遊玩，切換為手動操作');
  }
  function openAutoPlay(){
    if(loadingChallenge||bossVictory||!['home','ready','pause','play'].includes(mode))return;
    autoReturn=mode;setMode('autoplay');
    autoUI.open(hunt.roster,world.castle?'bride':warden?'warden':'desert',world.castle?'永夜古堡 · 冥婚大廳':warden?'C 區監獄中庭':'沙境獵場',economy.bet);
  }
  function closeAutoPlay(){
    autoUI.close();
    if(autoReturn==='play')deploy();else setMode(autoReturn);
  }
  function startAutoPlay(config){
    if(economy.wallet<economy.bet){notice('賞金不足，請回大廳調整 BET');return;}
    autoUI.close();setMode('play');cameraPose();
    pilot.start(config,autoContext());dragFallback=true;
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    $('autoplay-live').hidden=false;sync();
    emit('hunt:resume',{wave:economy.wave,autoplay:true});
  }
  $('autoplay-btn').onclick=openAutoPlay;
  $('pause-autoplay').onclick=openAutoPlay;
  $('autoplay-stop').onclick=()=>stopAutoPlay();
  let dragFallback = false;
  async function deploy() {
    if (mode === 'play' || loadingChallenge) return;
    setMode('play');
    emit('hunt:resume', { wave: economy.wave });
    if (!coarse) {
      try {
        if (!canvas.requestPointerLock) throw Error('unsupported');
        await requestRawPointerLock(canvas);
        dragFallback = false;
      } catch {
        dragFallback = true;
        notice('按住滑鼠右鍵拖曳轉向，左鍵射擊');
      }
    }
  }
  function pause() {
    if (mode === 'play') {
      setMode('pause');
      $('deploy').focus();
      emit('hunt:pause');
    }
  }
  function openChallenges() {
    if (!['home','ready','pause','play'].includes(mode)) return;
    bossReturn=mode;
    $('leave-prison').hidden=!warden;
    for(const id of ['warden','bride'])$('start-'+id).textContent=warden&&challengeId===id?'重新挑戰　→':'進入挑戰　→';
    setMode('challenges');
    $('challenge-'+challengeId).focus();
  }
  function closeChallenges() {
    if(loadingChallenge)return;
    if(bossReturn==='play') deploy();
    else setMode(bossReturn);
  }
  async function prepareChallenge(id) {
    if(levels.has(id))return levels.get(id);
    const castle=id==='bride';
    const [mapModule,bossModule]=await Promise.all(castle
      ? [import('./castle.js'),import('./bride.js')]
      : [import('./prison.js'),import('./warden.js')]);
    const room=new T.Scene();
    const arena=await (castle?mapModule.makeCastle:mapModule.makePrison)(room,coarse,desert.scene.environment);
    const [boss,coins,drops]=await Promise.all([
      (castle?bossModule.loadBride:bossModule.loadWarden)(room,arena,particles,wardenImpact),loadRewardCoins(room,arena,camera,coarse),
      loadBossSupplies(room,arena,grantSupply,particles),
    ]);
    const crowd=await loadHunt(room,arena,boss.target);
    boss.bindHunt?.(crowd,camera);
    const level={scene:room,world:arena,hunt:crowd,rewardCoins:coins,warden:boss,supplies:drops,
      fx:makeEffects(room,particles.playBlood,arena.rubble),radar:makeRadar(arena,player)};
    levels.set(id,level);return level;
  }
  function activateLevel(level,pose) {
    stopAutoPlay(false);
    rewardTags.clear();
    grenades.dispose();
    bossVictory=null;
    $('app').classList.remove('settling');
    $('boss-result').classList.remove('victory');
    $('victory-art').hidden=$('victory-score').hidden=true;
    $('victory-home').hidden=true;
    $('retry-warden').disabled=$('result-leave').disabled=false;
    supplies?.clear();supplyEffects.clear();
    ({scene,world,hunt,rewardCoins,fx,radar}=level);warden=level.warden??null;
    grenades=makeGrenadeProjectiles(scene,world,explodeGrenade,grenadeBounce);
    supplies=level.supplies??null;supplies?.clear();
    Object.assign(player,pose.player);feet=pose.feet;
    grounded=true;verticalSpeed=stepOffset=landingTime=landingDip=0;
    tremor=tremorTime=0;
    bodyHeight=standingHeight;tuckInAir=false;
    kickPitch=kickYaw=swayX=swayY=shotTime=reloadLeft=meleeContact=0;
    setScope(false);ads=aimTravel=0;camera.fov=65;camera.updateProjectionMatrix();
    $('reticle').style.opacity='1';$('enemyhud').style.display='none';
    flashLeft=rewardLeft=toastLeft=0;lock=null;stopInput();
    view.setWorld(scene,world.sun);particles.clearWorld();
    $('boss-health').hidden=$('player-health').hidden=!warden;
    damageFeedback.clear();
    $('app').classList.toggle('prison',!!warden);
    $('app').classList.toggle('castle',!!world.castle);
    $('boss-name').textContent=warden?.target.type.name??'';
    $('boss-health').setAttribute('aria-label',(warden?.target.type.name??'BOSS')+'血量');
    $('radar-panel').querySelector('.location b').textContent=world.castle?'LA VEUVE':warden?'BLOCK C':'SECTOR 01';
    $('brief').querySelector('.operation').lastChild.textContent=world.castle?' LA VEUVE':warden?' BLOCK C':' DUST BAZAAR';
    $('brief').querySelector('p').textContent=world.castle?'留意詛咒預警：離開紅紫色範圍，穿過空隙。鬼新娘會召喚亡者並驅使衝鋒。':warden?'典獄長會預判跑位。紅線出現後變向，留意重擊後的第二道紅線。':'瞄準獵物開火，擊倒領賞。擊中牆面會退還該發費用。';
    document.querySelector('header .mode').lastChild.textContent=world.castle?' 冥婚古堡':warden?' 監獄討伐':' 殭屍獵場';
    shadowLeft=0;renderer.shadowMap.needsUpdate=true;cameraPose();alignWallet();
  }
  async function enterChallenge(id=challengeId) {
    if(loadingChallenge)return;
    loadingChallenge=true;
    for(const key of ['warden','bride'])$('challenge-'+key).disabled=true;
    $('start-'+id).textContent=id==='bride'?'載入古堡中…':'載入監獄中…';
    try {
      if(!loadingLevels.has(id))loadingLevels.set(id,prepareChallenge(id).catch(error=>{loadingLevels.delete(id);throw error;}));
      const level=await loadingLevels.get(id);
      if(!warden)fieldReturn={player:{...player},feet,kills:economy.kills,wave:economy.wave,mode:bossReturn};
      settleBossOnLeave();warden?.stop();fx.clear();rewardCoins.clear();challengeId=id;
      activateLevel(level,{player:{x:0,z:id==='bride'?20:16.5,yaw:0,pitch:id==='bride' ? .04 : .12},feet:0});
      economy.kills=0;economy.wave=1;fx.clear();rewardCoins.clear();
      hunt.populate(camera);warden.reset();sync();ui();
      await hunt.warmup(renderer,camera);
      await view.warmup(renderer);
      loadingChallenge=false;
      await deploy();
    }catch(error){
      console.error(error);$('start-'+id).textContent='載入失敗，點此重試';
    }finally{loadingChallenge=false;for(const key of ['warden','bride'])$('challenge-'+key).disabled=false;}
  }
  function goHome(){
    if(loadingChallenge)return;
    rewardTags.clear();
    settleBossOnLeave();
    warden?.stop();fx.clear();rewardCoins.clear();supplies?.clear();supplyEffects.clear();particles.clearWorld();
    if(warden) {
      const saved=fieldReturn;fieldReturn=null;
      activateLevel(desert,saved);economy.kills=saved.kills;economy.wave=saved.wave;
    }
    bossVictory=null;
    $('boss-result').classList.remove('victory');$('victory-home').hidden=true;
    sync();setMode('home');ui();$('mode-normal').focus();
  }
  function leavePrison(){goHome();}
  function playerHit(hp){
    if(bossVictory)return;
    $('health-value').textContent=hp;
    damageFeedback.hit();
    if(hp===0)finishChallenge(false);
  }
  function finishChallenge(won){
    if(mode==='result')return;
    if(won){startBossShower();return;}
    supplies?.clear();supplyEffects.clear();
    warden.stop();
    $('result-title').textContent='挑戰失敗';
    $('result-detail').textContent='生命已耗盡。再次挑戰將恢復 100 生命。';
    setMode('result');ui();$('retry-warden').focus();
  }
  function startBossShower() {
    if(bossVictory?.phase!=='death')return;
    stopAutoPlay(false);
    const target=warden.target,origin=target.root.position.clone();origin.y=target.groundY;
    const portrait=$('victory-portrait'),prisonBoss=bossVictory.species==='warden';
    portrait.src=prisonBoss?'/prison/warden-victory.webp':'/castle/bride-victory.png';
    portrait.alt=bossVictory.name;portrait.width=prisonBoss?282:600;portrait.height=prisonBoss?401:760;
    warden.stop();hunt.clearCommands?.();
    const plan=rewardCoins.burstBoss(origin,bossVictory.amount);
    bossVictory.payout=makeBossPayout(plan.amount,plan.count);
    bossVictory.phase='scatter';
    emit('boss:payout',{phase:'scatter',species:target.type.id,amount:plan.amount,coins:plan.count});
  }
  function revealBossPrize() {
    if(bossVictory?.phase!=='scatter')return;
    const p=bossVictory.payout;p.reveal();rewardCoins.collectBoss();
    bossVictory.phase='collect';
    rewardTags.push({species:bossVictory.species,name:bossVictory.name,amount:p.amount,tier:'gold'});
    $('boss-result').classList.add('victory');
    $('victory-art').hidden=$('victory-score').hidden=false;
    $('result-title').textContent=bossVictory.name+'已擊倒';
    $('result-detail').textContent='金幣正在飛入賞金餘額…';
    $('victory-amount').textContent='1';
    $('victory-progress').style.width='0%';
    $('victory-home').hidden=true;
    $('retry-warden').disabled=$('result-leave').disabled=true;
    refreshVictoryOverlay();
    emit('boss:payout',{phase:'collect',species:warden.target.type.id,amount:p.amount});
  }
  function creditBossCoin(index,value) {
    if(!bossVictory?.payout)return;
    const gain=bossVictory.payout.receive(index,value);
    if(!gain)return;
    economy.wallet+=gain;sync();
    emit('wallet:bossCoin',{amount:gain,total:bossVictory.payout.credited});
  }
  function updateBossPrize(dt) {
    const p=bossVictory?.payout;
    if(!p)return;
    if(bossVictory.phase==='done') {
      bossVictory.showLeft-=dt;
      if(bossVictory.showLeft<=0){
        bossVictory.phase='complete';$('victory-home').hidden=false;refreshVictoryOverlay();
      }
      return;
    }
    if(bossVictory.phase!=='collect')return;
    p.update(dt);
    $('victory-amount').textContent=p.display.toLocaleString('en-US');
    $('victory-progress').style.width=(p.collected/p.count*100)+'%';
    if(p.phase==='done') {
      $('result-detail').textContent='賞金 '+p.amount.toLocaleString('en-US')+' 已全數入帳';
      $('retry-warden').disabled=$('result-leave').disabled=false;
      bossVictory.phase='done';bossVictory.showLeft=3;
      refreshVictoryOverlay();
      emit('boss:payout',{phase:'complete',species:warden.target.type.id,amount:p.amount});
    }
  }
  function refreshVictoryOverlay() {
    const show=!!bossVictory&&['collect','done','complete'].includes(bossVictory.phase)&&mode==='play';
    $('boss-result').hidden=mode!=='result'&&!show;
    $('boss-result').querySelector('section').setAttribute('aria-modal',String(mode==='result'));
    $('app').classList.toggle('settling',show);
  }
  function settleBossOnLeave() {
    if(!bossVictory||bossVictory.flushed)return;
    // An explicit restart/level change must never discard an already-earned boss prize.
    const remaining=bossVictory.amount-(bossVictory.payout?.credited??0);
    if(remaining>0){economy.wallet+=remaining;sync();emit('wallet:bossCoin',{amount:remaining,total:bossVictory.amount});}
    bossVictory.flushed=true;
  }
  $('pause-boss').onclick=openChallenges;$('close-boss').onclick=closeChallenges;
  for(const id of ['warden','bride'])$('challenge-'+id).onclick=()=>enterChallenge(id);
  $('retry-warden').onclick=()=>enterChallenge();
  $('leave-prison').onclick=$('result-leave').onclick=leavePrison;
  $('victory-home').onclick=$('pause-home').onclick=goHome;
  $('mode-normal').onclick=()=>{if(mode==='home')deploy();};
  $('mode-boss').onclick=openChallenges;
  $('boss-menu').onclick=e=>{if(e.target===$('boss-menu'))closeChallenges();};
  function equip(id) {
    if (!economy.owned.has(id)) {
      notice('可在軍械商店購買' + weapons[id].name);
      return;
    }
    if (economy.weapon === id) return;
    grenade.cancel();
    // Once half of the reload has played, switching away commits the new magazine.
    // Earlier switches cancel it and keep this weapon's remaining ammunition.
    if (reloadLeft > 0 && reloadLeft <= reloadDuration * 0.5 + 1e-6) {
      economy.ammo[economy.weapon] = weapon().mag;
      emit('weapon:ready', { weapon: economy.weapon });
    }
    toastLeft = 0;
    triggerHeld = triggerTap = false;
    setScope(false);
    meleeContact = 0;
    lock = null;
    economy.weapon = id;
    reloadLeft = 0;
    reloadEmpty = false;
    view.equip(id);
    sync();
    emit('weapon:equip', { weapon: id });
  }
  function grantSupply(reward) {
    if (mode !== 'play' || !warden || warden.health <= 0) return;
    if (reward.kind === 'heal') {
      const gained=warden.heal(reward.amount);
      $('health-value').textContent=warden.health;
      supplyEffects.heal();
      notice(gained ? '補給：生命 +' + gained : '補給：生命已滿');
    } else if (reward.kind === 'mg3') {
      economy.owned.add('mg3');
      economy.ammo.mg3=weapons.mg3.mag;
      triggerHeld=triggerTap=false;
      equip('mg3');
      reloadLeft=0;reloadEmpty=false;sync();
      notice('取得 MG3 重機槍 · 200 發');
    } else {
      supplyEffects.boost();
      notice('移動速度 +35% · 持續 20 秒');
    }
  }
  function stock() {
    $('shop-balance').textContent = economy.wallet.toLocaleString('en-US');
    $('stock').innerHTML = Object.entries(weapons)
      .map(([id, w]) => {
        const owned = economy.owned.has(id),
          equipped = economy.weapon === id,
          disabled = equipped || (!owned && economy.wallet < w.price);
        const label = equipped
          ? '裝備中'
          : owned
            ? '裝備'
            : economy.wallet < w.price
              ? '賞金不足'
              : '購買　' + w.price;
        return (
          '<article class="stock">' +
          gunIcon(id) +
          '<div><h3>' +
          w.name +
          '</h3><small>' +
          w.family +
          (id === startingWeapon ? ' · 初始配發' : '') +
          (id === 'grenade' ? ' · 剩餘 ' + economy.ammo.grenade + ' / 5 顆' : id === 'knife' ? ' · 配發' : ' · ' + w.mag + (id === 'mg3' ? ' 發彈箱' : ' 發彈匣')) +
          '</small><span class="spec">' +
          w.damage +
          ' 傷害　/　' +
          (id === 'grenade' ? '範圍爆炸 · 不扣金幣' : id === 'knife' ? '近戰 2.5 公尺' : economy.bet + ' 幣每發') +
          '</span></div><button data-buy="' +
          id +
          '" ' +
          (disabled ? 'disabled' : '') +
          '>' +
          label +
          '</button></article>'
        );
      })
      .join('');
    $('grant').hidden = economy.wallet >= 2;
  }
  function openShop() {
    if (mode === 'challenges' || mode === 'result') return;
    if (mode === 'shop') return closeShop();
    shopReturn = mode;
    setMode('shop');
    stock();
    emit('shop:open');
  }
  function closeShop() {
    if (shopReturn === 'play') deploy();
    else setMode(shopReturn);
  }
  $('shop-btn').onclick = openShop;
  function setBet(value) {
    if (mode !== 'home') return;
    const amount = Number(value);
    if (String(value).trim() && Number.isInteger(amount) && amount >= 1 && amount <= 1000) {
      economy.bet = amount;
    } else notice('BET 請輸入 1–1,000 的整數');
    sync();
  }
  $('bet-minus').onclick = () => setBet(economy.bet - 1);
  $('bet-plus').onclick = () => setBet(economy.bet + 1);
  $('bet-amount').onchange = (e) => setBet(e.target.value);
  $('bet-amount').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') e.currentTarget.blur();
  });
  $('close-shop').onclick = closeShop;
  $('deploy').onclick = deploy;
  $('shop').addEventListener('click', (e) => {
    if (e.target === $('shop')) closeShop();
  });
  $('stock').addEventListener('click', (e) => {
    const id = e.target.closest('button')?.dataset.buy;
    if (!weapons[id]) return;
    if (!economy.owned.has(id)) {
      if (economy.wallet < weapons[id].price) return;
      economy.wallet -= weapons[id].price;
      economy.owned.add(id);
      emit('shop:purchase', { weapon: id, price: weapons[id].price });
    }
    equip(id);
    stock();
  });
  $('grant').onclick = () => {
    if (economy.wallet < 2) {
      economy.wallet += 100;
      sync();
      stock();
      emit('wallet:resupply', { amount: 100 });
    }
  };
  $('full-btn').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notice('此瀏覽器無法切換全螢幕');
    }
  };
  function reload() {
    if (mode !== 'play' || !weapon().mag || reloadLeft > 0 || !view.isReady()) return;
    setScope(false);
    reloadEmpty = mag() === 0;
    reloadDuration = weapon().reload * (reloadEmpty ? 1 : 0.86);
    reloadLeft = reloadDuration;
    emit('weapon:reload', { weapon: economy.weapon });
  }
  function jump() {
    if (mode === 'play' && grounded) jumpQueued = true;
  }
  function pressTrigger() {
    if (mode !== 'play') return;
    if (economy.weapon === 'grenade') {
      if (!view.isReady()) return;
      if (!mag()) { notice('手榴彈已用完'); return; }
      if (grenade.press(mag())) emit('weapon:prime',{weapon:'grenade'});
      return;
    }
    triggerHeld = true;
    triggerTap = true;
  }
  function releaseTrigger() {
    triggerHeld = false;
    grenade.release();
  }
  $('scope-btn').onclick = toggleScope;
  $('jump-btn').onpointerdown = jump;
  $('crouch-btn').onpointerdown = () => {
    if (mode !== 'play') return;
    touchCrouch = !touchCrouch;
    $('crouch-btn').setAttribute('aria-pressed', String(touchCrouch));
  };
  $('fire-btn').addEventListener('pointerdown', (e) => {
    stopAutoPlay(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    pressTrigger();
  });
  $('fire-btn').addEventListener('lostpointercapture', releaseTrigger);
  $('fire-btn').addEventListener('pointercancel',()=>{grenade.cancel();triggerHeld=triggerTap=false;});
  document.addEventListener('mousedown', (e) => {
    if(mode==='play'&&(e.target===canvas||document.pointerLockElement===canvas))stopAutoPlay(false);
    if (
      e.button === 2 &&
      mode === 'play' &&
      (e.target === canvas || document.pointerLockElement === canvas)
    ) {
      rightDrag = 0;
      if (!dragFallback) toggleScope();
    }
    if (
      e.button === 0 &&
      (document.pointerLockElement === canvas || (!coarse && e.target === canvas))
    )
      pressTrigger();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) releaseTrigger();
    if (e.button === 2 && dragFallback && e.target === canvas && rightDrag < 5) toggleScope();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  $('reload-btn').onclick = reload;
  $('pause-btn').onclick = pause;
  canvas.addEventListener('click', () => {
    if (mode === 'ready' || mode === 'pause') deploy();
  });
  document.addEventListener('pointerlockchange', () => {
    lookInput.clear(performance.now());
    if (!document.pointerLockElement && mode === 'play' && !pilot.enabled && !coarse && !dragFallback) pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    last = performance.now();
  });
  window.addEventListener('blur', pause);
  addEventListener('keydown', (e) => {
    if(e.code==='KeyM'&&!e.repeat){e.preventDefault();if(mode==='autoplay')closeAutoPlay();else openAutoPlay();return;}
    if(mode==='autoplay'){
      if(e.code==='Escape'){e.preventDefault();closeAutoPlay();}return;
    }
    if(e.target instanceof HTMLInputElement)return;
    if(mode==='play'&&/^(Key[WASDR]|Digit[1-5]|Space|ControlLeft|ControlRight|ShiftLeft|ShiftRight)$/.test(e.code))stopAutoPlay(false);
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyB',
        'KeyR',
        'Digit1',
        'Digit2',
        'Digit3',
        'Digit4',
        'Digit5',
        'Escape',
        'Space',
        'ControlLeft',
        'ControlRight',
      ].includes(e.code)
    )
      e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'KeyB') return openShop();
      if (e.code === 'Escape') {
        if (mode === 'challenges') closeChallenges();
        else if (mode === 'shop') closeShop();
        else if(mode==='pause')deploy();
        else pause();
        return;
      }
      if(e.code==='Enter'&&mode==='play'&&bossVictory?.phase==='complete'){e.preventDefault();goHome();return;}
      if (e.code === 'Enter' && (mode==='ready'||mode==='pause') && document.activeElement?.tagName !== 'BUTTON')
        deploy();
      if (mode === 'play') {
        if (e.code === 'Space') jump();
        if (e.code === 'KeyR') reload();
        if (e.code === 'Digit1') equip('rifle');
        if (e.code === 'Digit2') equip('pistol');
        if (e.code === 'Digit3') equip('knife');
        if (e.code === 'Digit4') equip('grenade');
        if (e.code === 'Digit5') equip('mg3');
      }
    }
    if (mode === 'play') keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  function look(dx, dy, sens, eventTime) {
    if(Math.abs(dx)+Math.abs(dy)>0)stopAutoPlay(false);
    const now=performance.now();
    // Modern DOM timestamps use the performance time origin; handle older hosts.
    const time=eventTime>1e12?eventTime-performance.timeOrigin:eventTime??now;
    lookInput.add(dx,dy,sens*T.MathUtils.lerp(1,.59,ads),time,now);
  }
  function applyLook(now,frameMs) {
    const input=lookInput.take(now,frameMs),dx=input.rawX,dy=input.rawY;
    player.yaw -= input.x;
    player.pitch = T.MathUtils.clamp(player.pitch - input.y, -1.24, 1.24);
    swayX = T.MathUtils.clamp(swayX + dx * 0.0006, -0.055, 0.055);
    swayY = T.MathUtils.clamp(swayY + dy * 0.0004, -0.035, 0.035);
  }
  document.addEventListener('mousemove', (e) => {
    if (dragFallback && e.buttons & 2) rightDrag += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (
      mode === 'play' &&
      (document.pointerLockElement === canvas || (dragFallback && e.buttons & 2))
    )
      look(e.movementX, e.movementY, 0.002, e.timeStamp);
  });
  function touchPad(id, handler, release) {
    const el = $(id);
    let pointer = null,
      lastX,
      lastY;
    el.addEventListener('pointerdown', (e) => {
      if (pointer !== null || mode !== 'play') return;
      stopAutoPlay(false);
      pointer = e.pointerId;
      el.setPointerCapture(pointer);
      lastX = e.clientX;
      lastY = e.clientY;
      handler(e, 0, 0);
    });
    el.addEventListener('pointermove', (e) => {
      if (pointer !== e.pointerId || mode !== 'play') return;
      handler(e, e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const end = (e) => {
      if (pointer === e.pointerId) {
        pointer = null;
        release();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }
  touchPad(
    'look-pad',
    (e, dx, dy) => look(dx, dy, 0.0042, e.timeStamp),
    () => {},
  );
  touchPad(
    'stick',
    (e) => {
      const b = $('stick').getBoundingClientRect(),
        x = (e.clientX - b.left - b.width / 2) / (b.width * 0.38),
        y = (e.clientY - b.top - b.height / 2) / (b.height * 0.38);
      const l = Math.max(1, Math.hypot(x, y));
      stick.x = x / l;
      stick.y = y / l;
      $('stick').firstElementChild.style.transform =
        'translate(' + stick.x * b.width * 0.27 + 'px,' + stick.y * b.width * 0.27 + 'px)';
    },
    () => {
      stick.x = stick.y = 0;
      $('stick').firstElementChild.style.transform = '';
    },
  );
  function passable(x,z,stepHeight) {
    if(world.blocked(x,z,.32,feet,bodyHeight,stepHeight))return false;
    const boss=warden?.target;
    if(!boss?.alive)return true;
    const p=boss.root.position;
    const range=(x-p.x)**2+(z-p.z)**2;
    return range>=(boss.bodyRadius??2.1)**2 || range>=(player.x-p.x)**2+(player.z-p.z)**2;
  }
  function movement(dt) {
    const control=pilot.enabled?pilot.controls:null;
    const crouch = control?.crouch || touchCrouch || keys.has('ControlLeft') || keys.has('ControlRight');
    const previousHeight = bodyHeight;
    const { ceiling: standLimit } = world.verticalLimits(player.x, player.z, feet, bodyHeight);
    const low = crouch || feet + standingHeight > standLimit + bodyHeight + 0.002;
    const desiredHeight = low ? crouchedHeight : standingHeight;
    bodyHeight += T.MathUtils.clamp(desiredHeight - bodyHeight, -dt * 4.5, dt * 3.8);
    const running =
      control?.run || keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(stick.x, stick.y) > 0.93;
    const pace = low ? 2.65 : running ? 7.9 : 5.25;
    if (grounded) airbornePace = jumpQueued && bodyHeight > 1.70 ? (running ? 7.9 : 5.25) : pace;
    if (jumpQueued && grounded) {
      // A single takeoff impulse; after leaving the floor gravity controls the entire arc.
      verticalSpeed = crouch ? 5.25 : 4.0;
      tuckInAir = !crouch && previousHeight >= standingHeight - 0.002;
      grounded = false;
    }
    jumpQueued = false;
    let x = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + stick.x,
      z = Number(keys.has('KeyS')) - Number(keys.has('KeyW')) + stick.y;
    if(control){const c=Math.cos(player.yaw),s=Math.sin(player.yaw);x=control.x*c-control.z*s;z=control.x*s+control.z*c;}
    const length = Math.hypot(x, z);
    moving = Math.min(1, length);
    x /= Math.max(1, length);
    z /= Math.max(1, length);
    const c = Math.cos(player.yaw),
      s = Math.sin(player.yaw),
      step = dt * (grounded ? pace : airbornePace) * supplyEffects.speedFactor;
    const nx = player.x + (x * c + z * s) * step,
      nz = player.z + (-x * s + z * c) * step;
    const stepHeight = grounded ? 0.24 : 0.002;
    if (nx !== player.x && passable(nx, player.z, stepHeight)) player.x = nx;
    if (nz !== player.z && passable(player.x, nz, stepHeight)) player.z = nz;
    walkPhase += step * moving * 1.85;
    const { floor, ceiling } = world.verticalLimits(player.x, player.z, feet, bodyHeight);
    stepOffset *= Math.exp(-16 * dt);
    landingTime = Math.max(0, landingTime - dt);
    if (grounded && Math.abs(floor - feet) <= 0.241) {
      // Keep the hull on the stairs and ease only the camera over an individual riser.
      if (Math.abs(floor - feet) > 0.045) stepOffset = T.MathUtils.clamp(stepOffset + feet - floor, -0.19, 0.19);
      feet = floor;
      return;
    }
    // On a standing takeoff, pulling the knees up raises the soles while the eyes
    // stay on the ballistic arc. Extending again gives exactly that clearance back.
    const tuckTravel = !grounded && tuckInAir ? previousHeight - bodyHeight : 0;
    const next = feet + tuckTravel + verticalSpeed * dt - 0.5 * gravity * dt * dt;
    verticalSpeed -= gravity * dt;
    grounded = next <= floor && (verticalSpeed <= 0 || tuckTravel < 0);
    if (grounded) {
      feet = floor;
      tuckInAir = false;
      landingDip = Math.min(0.085, Math.max(0, -verticalSpeed - 2) * 0.018);
      landingTime = 0.20;
      verticalSpeed = 0;
    } else if (next >= ceiling && verticalSpeed > 0) {
      feet = ceiling;
      verticalSpeed = 0;
    } else feet = next;
  }
  let shotOverrun = 0;
  function throwGrenade(power) {
    if(mode!=='play'||economy.weapon!=='grenade'||economy.ammo.grenade<=0)return;
    camera.getWorldDirection(shotDirection);
    // A swept path from the eye prevents throwing through an adjacent wall.
    const desired=view.grenadeOrigin(camera,new T.Vector3());
    const contact=grenades.sweep(camera.position,desired,grenadeStats.radius);
    const origin=contact?contact.position.clone().addScaledVector(contact.normal,.002):desired;
    if(pilot.enabled){const direction=pilot.launchDirection(origin,playerVelocity,power);if(direction)shotDirection.copy(direction);}
    const velocity=throwVelocity(shotDirection,power,playerVelocity);
    if(contact&&velocity.dot(contact.normal)<0)velocity.reflect(contact.normal).multiplyScalar(.4);
    grenades.launch(origin,velocity);economy.ammo.grenade--;
    emit('weapon:throw',{weapon:'grenade',origin:origin.toArray(),velocity:velocity.toArray(),power,remaining:economy.ammo.grenade,cost:0});
    sync();
  }
  function grenadeBounce(position,speed) {
    emit('grenade:bounce',{position:position.toArray(),speed});
  }
  function explodeGrenade(position) {
    particles.playGrenade(position);
    let hits=0;
    for(const enemy of hunt.targets){
      if(!enemy.alive)continue;
      const target=enemy.root.position.clone();target.y+=enemy.height*.45;
      const distance=Math.max(0,position.distanceTo(target)-(enemy.boss?1.3:.35));
      const damage=blastDamage(distance);
      if(!damage||!grenades.visible(position,target))continue;
      particles.playBlood(target,target.clone().sub(position).normalize(),enemy);
      damageEnemy(enemy,target,damage);hits++;
    }
    if(!reducedMotion.matches){
      const distance=position.distanceTo(camera.position);
      const force=1.9*Math.pow(Math.max(0,1-distance/30),1.25);
      if(force>tremor*.8){
        const side=(player.x-position.x)*Math.cos(player.yaw)-(player.z-position.z)*Math.sin(player.yaw);
        tremorSide=Math.abs(side)>.1?Math.sign(side):-tremorSide;
        tremor=Math.max(tremor,force);tremorTime=0;tremorDecay=5.2;
        cameraPose(); // The initial jolt coincides with the visible detonation.
      }
    }
    emit('grenade:explode',{position:position.toArray(),radius:grenadeStats.blastRadius,hits});
    sync();
  }
  function fire() {
    if (mode!=='play'||!view.isReady()) return;
    if (economy.weapon === 'grenade') return;
    if (economy.weapon === 'knife') {
      if (shotTime > 0) return;
      shotTime = weapon().delay;
      meleeContact = weapon().contactTime;
      view.shoot();
      emit('weapon:swing', { weapon: 'knife' });
      return;
    }
    if (reloadLeft > 0 || shotTime > 0 || mag() <= 0) return;
    if (economy.wallet < economy.bet) {
      notice('賞金不足，可回大廳調低 BET 或按 B 開啟商店整備');
      return;
    }
    camera.getWorldDirection(shotDirection);
    if(pilot.enabled)shotDirection.subVectors(pilot.aim,camera.position).normalize();
    const hit = hunt.traceShot(camera.position, shotDirection);
    if(pilot.enabled&&hit.enemy!==pilot.target)return;
    const cost = economy.bet;
    economy.ammo[economy.weapon]--;
    economy.wallet -= cost;
    pilot.recordShot();
    shotTime = weapon().delay - (economy.weapon === 'mg3' ? shotOverrun : 0);
    view.muzzleOrigin(camera, muzzle);
    view.shoot();
    const kick = economy.weapon === 'mg3' ? 0.017 : economy.weapon === 'rifle' ? 0.013 : 0.023;
    kickPitch = Math.min(0.055, kickPitch + kick);
    kickYaw = T.MathUtils.clamp(kickYaw + (Math.random() - 0.5) * 0.012, -0.02, 0.02);
    fx.shot(muzzle, hit, economy.weapon);
    emit('weapon:fire', {
      weapon: economy.weapon,
      origin: muzzle.toArray(),
      target: hit.position.toArray(),
      cost,
    });
    if (hit.enemy) damageEnemy(hit.enemy, hit.position);
    else if (hit.kind !== 'air') {
      emit('world:impact', { kind: hit.kind, position: hit.position.toArray() });
      if (hit.kind === 'wall') {
        economy.wallet += cost;
        $('reward').textContent = '牆面退款 +' + cost;
        rewardLeft = 0.7;
        emit('wallet:refund', { amount: cost, weapon: economy.weapon });
      }
    }
    sync();
    if (economy.wallet < economy.bet) notice('賞金不足，可回大廳調低 BET 或按 B 開啟商店整備');
  }
  const prizeOrigin = new T.Vector3();
  function damageEnemy(e, position, damage = weapon().damage) {
    if (!e.alive) return;
    flashLeft = 0.13;
    e.hp -= damage;
    prizeOrigin.set(e.root.position.x, e.groundY, e.root.position.z);
    if(e.boss)warden.hit();
    else e.root.rotation.z = (Math.random() > 0.5 ? 1 : -1) * 0.11;
    emit('target:hit', {
      species: e.type.id,
      position: position.toArray(),
      damage,
    });
    if (e.hp <= 0) {
      if(e.boss) {
        bossVictory={phase:'death',amount:e.type.reward,name:e.type.name,species:e.type.id,payout:null};
        warden.defeat();
        $('reward').textContent='BOSS 擊倒';rewardLeft=1.1;
      } else {
        hunt.kill(e);if(warden)supplies.drop(e);
        economy.wallet+=e.type.reward;
        rewardCoins.burst(prizeOrigin,Boolean(e.type.smallPrize));
        rewardTags.push({species:e.type.id,name:e.type.name,amount:e.type.reward,tier:'silver'});
      }
      economy.kills++;
      lock = null;
      emit('target:kill', {
        species: e.type.id,
        position: e.root.position.toArray(),
        reward: e.type.reward,
      });
      if (!warden && economy.kills % hunt.enemies.length === 0) {
        economy.wave++;
        notice('獵殺進入第 ' + economy.wave + ' 波');
        emit('hunt:wave', { wave: economy.wave });
      }
    } else if ((e.boss || e.type.smallPrize) && Math.random() < (e.type.smallPrizeChance ?? 0.20)) {
      const prize = e.boss ? warden.smallPrize(position) : undefined;
      const amount = prize?.amount ?? e.type.smallPrize;
      economy.wallet += amount;
      if (e.boss) prizeOrigin.copy(position);
      rewardCoins.burst(prizeOrigin, false, prize);
      rewardTags.push({species:e.type.id,name:e.type.name,amount,tier:'bronze'});
      emit('target:smallPrize', { species: e.type.id, amount, position: prizeOrigin.toArray() });
    }
  }
  const knifeRay = new T.Vector3();
  function meleeHit() {
    camera.getWorldDirection(shotDirection);
    const center = hunt.traceShot(camera.position, shotDirection, weapon().reach);
    if (center.kind !== 'air') return center;
    for (const angle of [-0.105, 0.105]) {
      knifeRay.copy(shotDirection).applyAxisAngle(T.Object3D.DEFAULT_UP, angle);
      const edge = hunt.traceShot(camera.position, knifeRay, weapon().reach);
      if (edge.enemy) return edge;
    }
    return center;
  }
  function aimAndFire(dt) {
    // Carry the fraction of a frame past a shot deadline during sustained belt fire.
    shotOverrun = shotTime > 0 ? Math.max(0, dt - shotTime) : 0;
    shotTime -= dt;
    if (economy.weapon === 'grenade') {
      grenade.update(dt); lock=null; triggerHeld=triggerTap=false;
      return;
    }
    if (reloadLeft > 0) {
      reloadLeft -= dt;
      if (reloadLeft <= 0) {
        reloadLeft = 0;
        economy.ammo[economy.weapon] = weapon().mag;
        sync();
        emit('weapon:ready', { weapon: economy.weapon });
      }
    }
    if(pilot.enabled){
      lock=pilot.target;
      if(pilot.controls.fire&&pilot.refreshAim(autoContext())){
        // Re-sample moving bones after the actor animation and player movement.
        const delta=aim.subVectors(pilot.aim,camera.position).normalize();
        camera.getWorldDirection(shotDirection);
        if(delta.dot(shotDirection)>Math.cos(.065))fire();
      }
      return;
    }
    if (triggerTap || (triggerHeld && economy.weapon !== 'pistol')) fire();
    triggerTap = triggerTap && triggerHeld && !view.isReady();
    if (meleeContact > 0) {
      meleeContact -= dt;
      if (meleeContact <= 0 && economy.weapon === 'knife') {
        const hit = meleeHit();
        if (hit.kind !== 'air') view.meleeImpact();
        if (hit.enemy) {
          particles.playBlood(hit.position, hit.normal, hit.enemy);
          damageEnemy(hit.enemy, hit.position);
          sync();
        } else if (hit.kind !== 'air')
          emit('world:impact', { kind: hit.kind, position: hit.position.toArray() });
      }
    }
  }
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const ticks = Array.from({ length: 13 }, () => {
    const b = document.createElement('b');
    $('bearings').appendChild(b);
    return b;
  });
  function ui() {
    $('autoplay-live').hidden=!pilot.enabled;
    $('autoplay-status').textContent=pilot.status+' · '+pilot.shots+' 發';
    radar(hunt.targets);
    if(warden){
      const value=Math.ceil(100*Math.max(0,warden.target.hp)/warden.target.maxHp);
      $('boss-percent').textContent=value+'%';$('boss-fill').style.width=value+'%';
      $('boss-cue').textContent=warden.cue();$('health-value').textContent=warden.health;
    }
    $('location').textContent = world.district(player.x, player.z, feet);
    let bearing = T.MathUtils.euclideanModulo(-T.MathUtils.radToDeg(player.yaw), 360),
      center = Math.round(bearing / 15);
    const width = $('bearings').clientWidth;
    ticks.forEach((tick, i) => {
      const d = (center + i - 6) * 15,
        deg = T.MathUtils.euclideanModulo(d, 360);
      tick.textContent = deg % 45 === 0 ? labels[deg / 45] : deg;
      tick.classList.toggle('cardinal', deg % 90 === 0);
      tick.style.left = width / 2 + ((d - bearing) * width) / 126 + 'px';
    });
    $('aim-status').textContent =
      economy.weapon === 'grenade'
        ? !mag() ? '手榴彈已用完' : grenade.phase === 'pin' ? '拔插銷中'
          : grenade.phase === 'held' ? '蓄力 '+Math.round(grenade.power*100)+'% · 放開投擲'
          : grenade.phase === 'throw' || grenade.phase === 'recover' ? '投擲中' : '點按投擲 · 按住蓄力'
        : economy.weapon === 'knife'
        ? '近戰'
        : reloadLeft
          ? '換彈中'
          : lock
            ? '目標已鎖定'
            : pilot.enabled
              ? '自動搜尋中'
              : '手動射擊';
    $('app').classList.toggle('locked', !!lock);
    $('enemyhud').style.display = 'none';
    if (mode === 'play' && lock?.alive && !lock.boss && hunt.inSight(camera, lock, aim)) {
      screen.copy(lock.root.position);
      screen.y += lock.height + 0.19;
      screen.project(camera);
      const el = $('enemyhud');
      el.style.display = 'block';
      el.style.left = (screen.x * 0.5 + 0.5) * innerWidth + 'px';
      el.style.top = (-screen.y * 0.5 + 0.5) * innerHeight + 'px';
      $('enemy-name').textContent = lock.type.name;
      $('enemy-health').style.width = (100 * lock.hp) / lock.maxHp + '%';
    }
  }
  cameraPose();
  hunt.populate(camera);
  sync();
  setMode('home');
  ui();
  await hunt.warmup(renderer,camera);
  await view.warmup(renderer);
  $('loading').hidden = true;
  let shadowLeft = 0;
  function frame(now) {
    const real = Math.max(0, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    const elapsed = damageFeedback.advance(real),
      dt = Math.min(0.06, elapsed),
      uiDt = Math.min(0.06, real);
    clock += dt;
    updateScope(dt);
    const playing = mode === 'play', simulating = playing && dt > 0;
    rewardTags.update(playing ? real : 0);
    if (playing) {
      // Consume look input on EVERY rendered frame, including the impact pause.
      applyLook(performance.now(),real*1000);
    }
    if (simulating) {
      if(pilot.enabled){
        const control=pilot.update(dt,autoContext());
        if(!pilot.enabled){stopInput();notice(pilot.status);}
        else{
          if(control.weapon)equip(control.weapon);
          if(control.prime)pressTrigger();if(control.release)releaseTrigger();
          if(control.jump)jumpQueued=true;
          if(pilot.target||pilot.throwing){
            const p=pilot.aim,dx=p.x-camera.position.x,dz=p.z-camera.position.z;
            const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(p.y-camera.position.y,Math.hypot(dx,dz));
            const turn=Math.atan2(Math.sin(yaw-player.yaw),Math.cos(yaw-player.yaw));
            player.yaw+=T.MathUtils.clamp(turn*(1-Math.exp(-10*dt)),-dt*4.5,dt*4.5);
            player.pitch=T.MathUtils.clamp(player.pitch+(pitch-player.pitch)*(1-Math.exp(-10*dt)),-1.24,1.24);
          }
        }
      }
      previousPlayer.set(player.x,feet,player.z);
      supplyEffects.update(dt);
      const movementTime = Math.min(0.12, elapsed);
      const steps = Math.ceil(movementTime * 120);
      for (let i = 0; i < steps; i++) movement(movementTime / steps);
      playerVelocity.set(player.x,feet,player.z).sub(previousPlayer).divideScalar(movementTime);
      kickPitch *= Math.exp(-dt * 12);
      kickYaw *= Math.exp(-dt * 14);
      tremor *= Math.exp(-dt * tremorDecay);
      tremorTime += dt;
    }
    if (playing) cameraPose();
    if (simulating || mode === 'ready') {
      world.breeze.value += dt;
      if(playing && warden)world.updateGates?.(dt);
      hunt.update(dt, clock, playing, camera, economy.wave, feet);
    }
    if (simulating) {
      aimAndFire(dt);
      grenades.update(dt);
      // Covers the last shot and an empty gun drawn after its previous reload was interrupted.
      if (mag() === 0 && reloadLeft === 0 && !(pilot.enabled&&economy.weapon==='mg3')) reload();
      // The boss reward is a separate presentation; normal play and supplies continue.
      if(mode==='play')supplies?.update(dt,player,feet);
    }
    if(warden&&mode==='play'&&simulating)warden.update(dt,player,playerHit,()=>finishChallenge(true));
    fx.update(simulating ? dt : 0);
    if (simulating) {
      rewardCoins.update(dt, particles.playCoinPickup, creditBossCoin);
      particles.update(dt);
      // Update before revealing so the first visible score frame is exactly 1.
      updateBossPrize(dt);
      if(rewardCoins.takeBossReveal())revealBossPrize();
    }
    uiLeft -= uiDt;
    if (uiLeft <= 0) {
      ui();
      uiLeft = 0.095;
    }
    flashLeft -= uiDt;
    rewardLeft -= uiDt;
    toastLeft -= uiDt;
    $('hitmark').style.opacity = String(Math.max(0, flashLeft * 8));
    $('reward').style.opacity = String(Math.max(0, Math.min(1, rewardLeft * 2)));
    if (toastLeft <= 0) $('toast').style.display = 'none';
    swayX *= Math.exp(-dt * 10);
    swayY *= Math.exp(-dt * 10);
    shadowLeft -= dt;
    if (shadowLeft <= 0 && (playing || mode === 'ready')) {
      world.centerShadow(player.x, player.z);
      renderer.shadowMap.needsUpdate = true;
      shadowLeft = coarse ? 0.09 : 0.055;
    }
    // The lobby uses static scene artwork; do not render the full 3D world behind menus.
    if(atHome)return;
    renderer.clear();
    renderer.render(scene, camera);
    particles.render(camera);
    view.render(
      renderer,
      playing || mode === 'ready' ? dt : 0,
      moving,
      reloadLeft > 0 ? 1 - reloadLeft / reloadDuration : 0,
      reloadEmpty,
      ads,
      swayX+(reducedMotion.matches?0:tremor*tremorSide*.065*Math.cos(26*tremorTime)),
      swayY+(reducedMotion.matches?0:tremor*.05*Math.cos(33*tremorTime)),
      walkPhase,
      grounded,
      mag(),
      grenade,
    );
    if (playing) {
      slow = real > 0.032 ? slow + uiDt : Math.max(0, slow - uiDt * 0.7);
      readyToScale -= uiDt;
      if (slow > 1.5 && readyToScale <= 0 && renderer.getPixelRatio() > 0.8) {
        renderer.setPixelRatio(Math.max(0.8, renderer.getPixelRatio() * 0.85));
        // setPixelRatio already resizes the backing buffer. The CSS size, camera
        // aspect and HUD have not changed; a second setSize needlessly reallocates it.
        lookInput.clear(performance.now());
        slow = 0;
        readyToScale = 4;
      }
    }
  }
  renderer.setAnimationLoop(frame);
}
boot().catch((error) => {
  console.error(error);
  $('load-msg').textContent = '無法載入獵場，請確認 WebGL 與硬體加速已開啟後重新整理。';
});
