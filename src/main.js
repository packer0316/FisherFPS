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
import { makeRefundNotice } from './refund-notice.js';
import { makeBossPayout } from './boss-payout.js';
import { loadBossSupplies, makeSupplyEffects } from './boss-supplies.js';
import { $, gunIcon, makeRadar } from './ui.js';
import { emit } from './events.js';
import { makeGameAudio } from './game-audio.js';
import { makeLookInput, requestRawPointerLock } from './look-input.js';
import { makeDamageFeedback } from './damage-feedback.js';
import { makeGrenadeState } from './grenade-state.js';
import { grenadeStats, throwVelocity, blastDamage } from './grenade-physics.js';
import { makeGrenadeProjectiles } from './grenade-projectiles.js';
import { makeAutoPlayer } from './auto-play.js';
import { makeAutoPlayUI } from './auto-play-ui.js';
import { makeSceneMusic } from './scene-music.js';
import { releaseScene } from './level-release.js';
import { getAudio } from './audio.js';
import { version } from '../package.json';
import { trackLoaderItems, makeLoadingScreen, preloadInterface } from './loading-screen.js';
import { STARTING_WALLET,DEFAULT_BET,MIN_BET,MAX_BET,validBet,stepBet,captureRule,captureChance,formatChance,makePrizeRandom,resolveCaptureHit,makeRtpLedger } from './rtp.js';

// Counting three.js loader items from the first load lets the loading screen wait for
// textures that modules start without awaiting.
const loading = makeLoadingScreen(trackLoaderItems(T.DefaultLoadingManager));
const arenaTitles = { warden: '前往 C 區監獄中庭', bride: '前往永夜古堡', stationmaster: '前往中央車站' };
// package.json is the only place the version lives; bump it there.
$('app-version').textContent = 'v' + version;

async function boot() {
  const job = loading.begin('正在載入獵場');
  const canvas = $('world'),
    coarse = matchMedia('(pointer:coarse)').matches;
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  // Cap the drawing buffer by pixel count, not only by ratio: with 4x MSAA each pixel costs
  // ~36 bytes, so a 2560x1440 window at ratio 1.7 needed ~390 MB of framebuffer. The budget
  // keeps 1440p native on desktop and ~1.6 MP on touch devices.
  const pixelBudget = coarse ? 1.6e6 : 3.7e6;
  const ratioCap = () => Math.min(devicePixelRatio, coarse ? 1.35 : 1.7,
    Math.max(0.75, Math.sqrt(pixelBudget / (innerWidth * innerHeight))));
  renderer.setPixelRatio(ratioCap());
  // When the GPU runs out of memory the browser drops the WebGL context. Say so instead of
  // leaving a frozen frame; three.js and Effekseer state cannot be rebuilt in place.
  canvas.addEventListener('webglcontextlost', () => {
    renderer.setAnimationLoop(null);
    loading.fail('顯示記憶體不足，畫面已中斷，請重新整理頁面');
  });
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
  // Sound, music and the menus' images load alongside the scene. Nothing below this await
  // (input handlers included) exists until all of it, and every texture, has finished.
  const sound=makeGameAudio();
  sound.setLevel('desert');
  const music=makeSceneMusic({lobby:'mp3/ld9ga-2uzra.mp3',warden:'mp3/boss-prison.mp3',bride:'mp3/boss-castle.mp3',stationmaster:'mp3/boss-station.mp3'},
    // No track stays decoded while another plays (the lobby theme alone is ~23 MB of PCM).
    {muted:()=>getAudio().muted});
  const menus=preloadInterface();
  const sceneLoad=job.part('載入場景、模型與貼圖',6,job.loaderProgress);
  const soundLoad=job.part('載入音效',2,sound.preloadProgress);
  const musicLoad=job.part('載入背景音樂',1);
  const menuLoad=job.part('載入介面圖片與字型',1,menus.progress);
  const warmLoad=job.part('準備畫面',1);
  const core = Promise.all([
    loadHunt(scene, world),
    loadCombatParticles(renderer, $('wallet-pickup')),
    makeViewmodel(scene, camera, world.sun),
    loadRewardCoins(scene, world, camera, coarse),
    loadRewardTags($('hud')),
  ]);
  await Promise.all([core,soundLoad.follow(sound.preloaded),musicLoad.follow(music.prepare('lobby')),menuLoad.follow(menus.ready)]);
  await job.loaderIdle();
  sceneLoad.done();
  let [hunt, particles, view, rewardCoins, rewardTags] = await core;
  const refunds=makeRefundNotice($('hud'));
  let fx = makeEffects(scene, particles.playBlood),
    radar = makeRadar(world, player);
  const desert={scene,world,hunt,rewardCoins,fx,radar};
  const levels=new Map(), loadingLevels=new Map();
  let fieldReturn, bossReturn='home', loadingChallenge=false, challengeId='warden';
  const challengeIds=['warden','bride','stationmaster'];
  let warden=null, supplies=null;
  let bossVictory=null;
  const supplyEffects=makeSupplyEffects();
  const damageFeedback=makeDamageFeedback($('damage-overlay'));
  const economy = {
    wallet: STARTING_WALLET,
    bet: DEFAULT_BET,
    rtp: makeRtpLedger(),
    kills: 0,
    wave: 1,
    owned: new Set([startingWeapon, 'pistol', 'knife', 'grenade']),
    weapon: startingWeapon,
    ammo: { grenade: grenadeStats.supply, ...Object.fromEntries(Object.entries(weapons).filter(([, w]) => w.mag).map(([id, w]) => [id, w.mag])) },
  };
  const grenade = makeGrenadeState(throwGrenade);
  // Every match starts with a full supply: 一般模式 entered from the lobby, and every BOSS
  // challenge including retries. Resuming from pause, the shop or a weapon switch keeps the count.
  const restockGrenades = () => { economy.ammo.grenade = grenadeStats.supply; };
  const prizeRandom=makePrizeRandom();
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
    if (mode === 'play' && !world.playerLocked && weapon().aimFov && reloadLeft <= 0) setScope(!scoped);
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
  let transitLocked = false;
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
    refunds.align({left:$('wallet').parentElement.getBoundingClientRect().left,top:$('wallet').closest('.vitals').getBoundingClientRect().top});
    rewardTags.align($('wallet-anchor').closest('.vitals').getBoundingClientRect(), innerWidth,
      document.querySelector('header').getBoundingClientRect().bottom + 6);
  }
  function resize() {
    lookInput.clear(performance.now());
    // A larger window lowers the cap; the frame-time governor may already sit below it.
    if (renderer.getPixelRatio() > ratioCap()) renderer.setPixelRatio(ratioCap());
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
    $('lobby-weapon-class').textContent=weapon().family;
    $('bet-amount').value = String(economy.bet);
    $('bet-minus').disabled = economy.bet <= MIN_BET;
    $('bet-plus').disabled = economy.bet >= MAX_BET;
    $('kills').textContent = String(economy.kills).padStart(2, '0');
    $('wave').textContent = String(economy.wave).padStart(2, '0');
    const knife = economy.weapon === 'knife', throwable = economy.weapon === 'grenade', manual = knife || throwable;
    $('ammo').textContent = knife ? '近戰' : String(mag()).padStart(2, '0');
    $('capacity').parentElement.hidden = manual;
    $('capacity').textContent = weapon().mag ?? '';
    $('reload-btn').hidden = manual;
    $('fire-btn').setAttribute('aria-label',throwable?'按住拔銷蓄力，放開投擲':'射擊');
    $('weapon-name').textContent = weapon().name;
    $('cost').textContent = throwable ? '免費 5 顆 · 範圍機率擊倒' : knife ? '近戰清除 · 無賞金' : economy.bet.toLocaleString('en-US') + ' 幣 / 命中';
    $('scope-btn').hidden = !weapon().aimFov;
    const weaponIcon = $('weapon-icon');
    if (weaponIcon.dataset.weapon !== economy.weapon) {
      weaponIcon.innerHTML = gunIcon(economy.weapon);
      $('lobby-weapon-icon').innerHTML = gunIcon(economy.weapon);
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
    world.setActive?.(next==='play');
    sound.setMode(next);
    if (next !== 'play' && next !== 'result') damageFeedback.clear();
    if (next !== 'play') setScope(false);
    stopInput();
    lock = null;
    $('app').classList.toggle('playing', next === 'play');
    atHome=next==='home'||(next==='shop'&&shopReturn==='home')||(next==='challenges'&&bossReturn==='home');
    $('app').classList.toggle('at-home',atHome);
    // Menus opened from the lobby keep its music. Boss arenas play their own track
    // (keyed by challenge id); the desert hunt has ambience only.
    music.play(atHome||(next==='autoplay'&&autoReturn==='home')?'lobby':warden?challengeId:null);
    $('app').classList.toggle('paused',next==='pause');
    $('lobby').hidden=next!=='home';
    $('pause-home').hidden=next!=='pause';
    $('pause-autoplay').hidden=next!=='pause';
    $('pause-boss').hidden=next!=='pause';
    document.querySelector('header .mode').lastChild.textContent=atHome?' 遊戲大廳':world.station?' 中央車站':world.castle?' 冥婚古堡':warden?' 監獄討伐':' 殭屍獵場';
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
    $('brief').querySelector('h1').innerHTML = (next === 'pause' ? '行動暫停'
      : world.station ? '中央車站' : world.castle ? '永夜古堡' : warden ? '監獄中庭' : '沙境獵場') + '<span>.</span>';
    if (next === 'home') $('lock-hint').hidden = true;
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
    if(world.playerLocked||loadingChallenge||bossVictory||!['home','ready','pause','play'].includes(mode))return;
    autoReturn=mode;setMode('autoplay');
    autoUI.open(hunt.roster,warden?challengeId:'desert',world.station?'中央車站 · 雙月台':world.castle?'永夜古堡 · 冥婚大廳':warden?'C 區監獄中庭':'沙境獵場',economy.bet);
  }
  function closeAutoPlay(){
    autoUI.close();
    if(autoReturn==='play')deploy();else setMode(autoReturn);
  }
  function startAutoPlay(config){
    if(world.playerLocked)return;
    if(economy.wallet<economy.bet){notice('賞金不足，請回大廳調整 BET');return;}
    autoUI.close();setMode('play');cameraPose();
    pilot.start(config,autoContext());
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    $('autoplay-live').hidden=false;sync();
    emit('hunt:resume',{wave:economy.wave,autoplay:true});
  }
  $('autoplay-btn').onclick=openAutoPlay;
  $('pause-autoplay').onclick=openAutoPlay;
  $('autoplay-stop').onclick=()=>{stopAutoPlay();lockPointer();};
  // Desktop aiming needs pointer lock (crosshair, hidden cursor). Browsers refuse a lock
  // request without a fresh user gesture (Escape never counts) and briefly after the lock was
  // left, so a refusal means "wait for a click", never a free cursor in combat. Drag-to-look is
  // only for hosts that cannot lock at all: no API, or repeated refusals despite a real click.
  let dragFallback = false, lockRefusals = 0, unlockedAt = -1e9, gestureAt = -1e9;
  // Presses and keys grant activation; Escape never does. A lock needs one made after the last unlock.
  for (const type of ['pointerdown', 'keydown'])
    addEventListener(type, (e) => { if (e.key !== 'Escape') gestureAt = performance.now(); }, true);
  const hasGesture = () => gestureAt > unlockedAt && (!navigator.userActivation || navigator.userActivation.isActive);
  const wantsLock = () => !coarse && !dragFallback && !pilot.enabled;
  function useDragLook() {
    dragFallback = true;
    $('lock-hint').hidden = true;
    notice('此頁面無法鎖定滑鼠：按住右鍵拖曳轉向，左鍵射擊');
  }
  function awaitClick(starting = false) {
    if (mode === 'play') pause();
    else if (mode !== 'pause') { setMode(starting ? 'ready' : 'pause'); $('deploy').focus(); }
    $('lock-hint').hidden = false;
  }
  async function lockPointer() {
    if (mode !== 'play' || !wantsLock() || document.pointerLockElement === canvas) return;
    if (!canvas.requestPointerLock) return useDragLook();
    if (!hasGesture()) return awaitClick();
    // Browsers also refuse during a short cooldown after an unlock; only later refusals count.
    const fresh = gestureAt - unlockedAt > 1000;
    try {
      await requestRawPointerLock(canvas);
      lockRefusals = 0;
      $('lock-hint').hidden = true;
    } catch {
      if (mode !== 'play') return;
      if (fresh && ++lockRefusals >= 2) useDragLook();
      else awaitClick();
    }
  }
  async function deploy(starting = false) {
    if (mode === 'play' || loadingChallenge) return;
    // Escape, or a click that expired during loading, cannot lock: wait at the brief instead.
    if (!coarse && !dragFallback && canvas.requestPointerLock && !hasGesture()) return awaitClick(starting);
    setMode('play');
    emit('hunt:resume', { wave: economy.wave });
    await lockPointer();
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
    for(const id of challengeIds)$('start-'+id).textContent=warden&&challengeId===id?'重新挑戰　→':'進入挑戰　→';
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
    const castle=id==='bride',station=id==='stationmaster';
    const [mapModule,bossModule]=await Promise.all(station
      ? [import('./station.js'),import('./stationmaster.js')]:castle
      ? [import('./castle.js'),import('./bride.js')]
      : [import('./prison.js'),import('./warden.js')]);
    const room=new T.Scene();
    const arena=await (station?mapModule.makeStation:castle?mapModule.makeCastle:mapModule.makePrison)(room,coarse,desert.scene.environment);
    const [boss,coins,drops]=await Promise.all([
      (station?bossModule.loadStationmaster:castle?bossModule.loadBride:bossModule.loadWarden)(room,arena,particles,wardenImpact),loadRewardCoins(room,arena,camera,coarse),
      loadBossSupplies(room,arena,grantSupply,particles),
    ]);
    const crowd=await loadHunt(room,arena,boss.target);
    boss.bindHunt?.(crowd,camera);
    arena.bindHunt?.(crowd,camera);
    const level={scene:room,world:arena,hunt:crowd,rewardCoins:coins,warden:boss,supplies:drops,
      fx:makeEffects(room,particles.playBlood,arena.rubble),radar:makeRadar(arena,player)};
    levels.set(id,level);return level;
  }
  // Keep only the boss arena being played. Every visited arena used to stay resident
  // (scene, textures, shadow map, crowd), so touring all three bosses exhausted memory.
  // Re-entering a released arena loads it again behind the loading screen.
  function releaseOtherLevels(id){
    for(const [other,level] of levels){
      if(other===id)continue;
      level.warden?.stop?.();level.world.setActive?.(false);level.world.cancelTransit?.();
      levels.delete(other);loadingLevels.delete(other);
      releaseScene(level.scene,[desert.scene,scene]);
    }
  }
  function activateLevel(level,pose) {
    stopAutoPlay(false);
    world.cancelTransit?.();transitLocked=false;$('train-warning').hidden=true;
    world.setActive?.(false);
    rewardTags.clear();refunds.clear();
    grenades.dispose();
    bossVictory=null;
    $('app').classList.remove('settling');
    $('boss-result').classList.remove('victory');
    $('victory-art').hidden=$('victory-score').hidden=true;
    $('victory-home').hidden=true;
    $('retry-warden').disabled=$('result-leave').disabled=false;
    supplies?.clear();supplyEffects.clear();
    ({scene,world,hunt,rewardCoins,fx,radar}=level);warden=level.warden??null;
    sound.setLevel(warden?challengeId:'desert');
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
    $('app').classList.toggle('station',!!world.station);
    $('boss-name').textContent=warden?.target.type.name??'';
    $('boss-health').setAttribute('aria-label',(warden?.target.type.name??'BOSS')+'賞金與怒氣');
    $('radar-panel').querySelector('.location b').textContent=world.station?'TERMINAL':world.castle?'LA VEUVE':warden?'BLOCK C':'SECTOR 01';
    $('brief').querySelector('.operation').lastChild.textContent=world.station?' LAST DEPARTURE':world.castle?' LA VEUVE':warden?' BLOCK C':' DUST BAZAAR';
    $('brief').querySelector('p').textContent=world.station?'軌道與兩側月台都可行走，留意行進中的列車，碰撞會將你撞回月台。開門時可從兩側進出車廂，發車前會引導車內玩家下車。善用樓梯與二樓平台躲避站長招式。':world.castle?'留意詛咒預警：離開紅紫色範圍，穿過空隙。鬼新娘會召喚亡者並驅使衝鋒。':warden?'典獄長會預判跑位。紅線出現後變向，留意重擊後的第二道紅線。':'瞄準獵物開火，擊倒領賞。沒有命中怪物會全額退款。';
    document.querySelector('header .mode').lastChild.textContent=world.station?' 中央車站':world.castle?' 冥婚古堡':warden?' 監獄討伐':' 殭屍獵場';
    shadowLeft=0;renderer.shadowMap.needsUpdate=true;cameraPose();alignWallet();
  }
  async function enterChallenge(id=challengeId) {
    if(loadingChallenge)return;
    loadingChallenge=true;
    for(const key of challengeIds)$('challenge-'+key).disabled=true;
    $('start-'+id).textContent=id==='stationmaster'?'載入車站中…':id==='bride'?'載入古堡中…':'載入監獄中…';
    // First visit: a full loading screen until the arena, its sounds and its music are ready.
    const job=levels.has(id)?null:loading.begin(arenaTitles[id]);
    const sceneLoad=job?.part('載入場景、模型與貼圖',6,job.loaderProgress);
    const audioLoad=job?.part('載入音效與背景音樂',1);
    const warmLoad=job?.part('準備畫面',1);
    try {
      if(!loadingLevels.has(id))loadingLevels.set(id,prepareChallenge(id).catch(error=>{loadingLevels.delete(id);throw error;}));
      const audioReady=Promise.all([sound.prepareLevel(id),music.prepare(id)]);
      audioLoad?.follow(audioReady);
      const [level]=await Promise.all([loadingLevels.get(id),audioReady]);
      if(job){await job.loaderIdle();sceneLoad.done();}
      if(!warden)fieldReturn={player:{...player},feet,kills:economy.kills,wave:economy.wave,mode:bossReturn};
      settleBossOnLeave();warden?.stop();fx.clear();rewardCoins.clear();challengeId=id;
      activateLevel(level,{player:level.world.spawn??{x:0,z:id==='bride'?20:16.5,yaw:0,pitch:id==='bride' ? .04 : .12},feet:0});
      releaseOtherLevels(id);
      economy.kills=0;economy.wave=1;restockGrenades();fx.clear();rewardCoins.clear();
      hunt.populate(camera);warden.reset();sync();ui();
      emit('boss:enter',{species:id});
      await hunt.warmup(renderer,camera);
      await view.warmup(renderer);
      warmLoad?.done();job?.finish();
      loadingChallenge=false;
      await deploy(true);
    }catch(error){
      console.error(error);job?.cancel();$('start-'+id).textContent='載入失敗，點此重試';
    }finally{loadingChallenge=false;for(const key of challengeIds)$('challenge-'+key).disabled=false;}
  }
  function goHome(){
    if(loadingChallenge)return;
    rewardTags.clear();refunds.clear();
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
    emit('player:hurt',{hp});
    if(hp===0){emit('player:death');finishChallenge(false);}
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
    const portrait=$('victory-portrait'),prisonBoss=bossVictory.species==='warden',stationBoss=bossVictory.species==='stationmaster';
    portrait.src=stationBoss?'autoplay/stationmaster.webp':prisonBoss?'prison/warden-victory.webp':'castle/bride-victory.png';
    portrait.alt=bossVictory.name;portrait.width=stationBoss?256:prisonBoss?282:600;portrait.height=stationBoss?256:prisonBoss?401:760;
    warden.stop();hunt.clearCommands?.();
    if(bossVictory.amount===0){
      bossVictory.phase='complete';$('boss-result').classList.add('victory');
      $('victory-art').hidden=$('victory-score').hidden=false;
      $('result-title').textContent=bossVictory.name+'已清除';$('result-detail').textContent='戰鬥刀清除不發賞金';
      $('victory-amount').textContent='0';$('victory-progress').style.width='100%';$('victory-home').hidden=false;
      $('retry-warden').disabled=$('result-leave').disabled=false;refreshVictoryOverlay();return;
    }
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
  for(const id of challengeIds)$('challenge-'+id).onclick=()=>enterChallenge(id);
  $('retry-warden').onclick=()=>enterChallenge();
  $('leave-prison').onclick=$('result-leave').onclick=leavePrison;
  $('victory-home').onclick=$('pause-home').onclick=goHome;
  $('mode-normal').onclick=()=>{if(mode==='home'){restockGrenades();sync();deploy();}};
  $('mode-boss').onclick=openChallenges;
  $('boss-menu').onclick=e=>{if(e.target===$('boss-menu'))closeChallenges();};
  function equip(id) {
    if(mode==='play'&&world.playerLocked)return;
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
          (id === 'grenade' ? '範圍機率擊倒 · 免費賞金' : id === 'knife' ? w.damage+' 近戰傷害 · 清怪不發幣' : economy.bet.toLocaleString('en-US')+' 幣 / 命中 · 打空退款') +
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
    if(world.playerLocked)return;
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
  $('lobby-armory').onclick = openShop;
  function setBet(value) {
    if (mode !== 'home') return;
    const amount = Number(value);
    if (String(value).trim() && validBet(amount)) {
      economy.bet = amount;
    } else notice('BET 請輸入 1–1,000,000 的整數');
    sync();
  }
  $('bet-minus').onclick = () => setBet(stepBet(economy.bet,-1));
  $('bet-plus').onclick = () => setBet(stepBet(economy.bet,1));
  $('bet-amount').onchange = (e) => setBet(e.target.value);
  $('bet-amount').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') e.currentTarget.blur();
  });
  $('close-shop').onclick = closeShop;
  $('deploy').onclick = () => deploy();
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
    if (mode !== 'play' || world.playerLocked || !weapon().mag || reloadLeft > 0 || !view.isReady()) return;
    setScope(false);
    reloadEmpty = mag() === 0;
    reloadDuration = weapon().reload * (reloadEmpty ? 1 : 0.86);
    reloadLeft = reloadDuration;
    emit('weapon:reload', { weapon: economy.weapon, empty: reloadEmpty, duration: reloadDuration });
  }
  function jump() {
    if (mode === 'play' && !world.playerLocked && grounded) jumpQueued = true;
  }
  function pressTrigger() {
    if (mode !== 'play' || world.playerLocked) return;
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
    if (mode !== 'play' || world.playerLocked) return;
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
    if (mode === 'play' && e.target === canvas && wantsLock() && document.pointerLockElement !== canvas) {
      lockPointer(); // This click takes the mouse back; it does not fire.
      return;
    }
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
    if (!document.pointerLockElement) unlockedAt = performance.now();
    if (!document.pointerLockElement && mode === 'play' && !pilot.enabled && !coarse && !dragFallback) pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    last = performance.now();
  });
  window.addEventListener('blur', pause);
  addEventListener('keydown', (e) => {
    if(loading.active)return;
    if(mode==='play'&&world.playerLocked&&e.code!=='Escape'){e.preventDefault();return;}
    if(e.code==='KeyM'&&!e.repeat){e.preventDefault();if(mode==='autoplay')closeAutoPlay();else openAutoPlay();return;}
    if(mode==='autoplay'){
      if(e.code==='Escape'){e.preventDefault();closeAutoPlay();}return;
    }
    if(e.target instanceof HTMLInputElement)return;
    if(mode==='play'&&/^(Key[WASDR]|Digit[1-5]|Space|ControlLeft|ControlRight|ShiftLeft|ShiftRight)$/.test(e.code)){stopAutoPlay(false);lockPointer();}
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
    if(world.playerLocked)return;
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
      if (pointer !== null || mode !== 'play' || world.playerLocked) return;
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
    if(pilot.enabled&&world.autoPlayStep&&!world.autoPlayStep({x:player.x,z:player.z,y:feet},x,z,world.verticalLimits(x,z,feet,bodyHeight).floor,.32))return false;
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
      emit('player:jump');
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
      emit('player:land', { speed: -verticalSpeed });
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
    grenades.launch(origin,velocity,{bet:economy.bet});economy.ammo.grenade--;
    emit('weapon:throw',{weapon:'grenade',origin:origin.toArray(),velocity:velocity.toArray(),power,remaining:economy.ammo.grenade,cost:0});
    sync();
  }
  function grenadeBounce(position,speed,impact=speed) {
    emit('grenade:bounce',{position:position.toArray(),speed,impact});
  }
  function explodeGrenade(position,context={bet:economy.bet}) {
    particles.playGrenade(position);
    let hits=0;
    for(const enemy of hunt.targets){
      if(!enemy.alive)continue;
      const target=enemy.root.position.clone();target.y+=enemy.height*.45;
      const distance=Math.max(0,position.distanceTo(target)-(enemy.boss?1.3:.35));
      const damage=blastDamage(distance);
      if(!damage||!grenades.visible(position,target))continue;
      particles.playBlood(target,target.clone().sub(position).normalize(),enemy);
      damageEnemy(enemy,target,damage,{source:'grenade',bet:context.bet,strength:damage/grenadeStats.damage});hits++;
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
      emit('weapon:dry', { weapon: economy.weapon });
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
    if (hit.enemy?.alive) damageEnemy(hit.enemy, hit.position,weapon().damage,{source:'shot',bet:cost});
    else {
      if(hit.kind!=='air')emit('world:impact', { kind: hit.kind, position: hit.position.toArray() });
      economy.wallet += cost;economy.rtp.refund(cost);
      refunds.push(cost);
      emit('wallet:refund', { amount: cost, weapon: economy.weapon,reason:hit.kind });
    }
    sync();
    if (economy.wallet < economy.bet) notice('賞金不足，可回大廳調低 BET 或按 B 開啟商店整備');
  }
  const prizeOrigin = new T.Vector3();
  function damageEnemy(e, position, damage = weapon().damage, context={source:'knife',bet:economy.bet}) {
    const result=resolveCaptureHit(e,{...context,damage},prizeRandom);
    if(!result)return;
    economy.rtp.record(result);
    emit('rtp:round',{species:e.type.id,...result});
    flashLeft = 0.13;
    prizeOrigin.set(e.root.position.x, e.groundY, e.root.position.z);
    if(e.boss)warden.hit();
    else e.root.rotation.z = (Math.random() > 0.5 ? 1 : -1) * 0.11;
    emit('target:hit', {
      species: e.type.id,
      position: position.toArray(),
      damage:context.source==='knife'?damage:0,source:result.source,killed:result.killed,
    });
    if (result.killed) {
      if(e.boss) {
        bossVictory={phase:'death',amount:result.amount,name:e.type.name,species:e.type.id,payout:null};
        emit('boss:defeat',{species:e.type.id});
        warden.defeat();
        $('reward').textContent='BOSS 擊倒';rewardLeft=1.1;
      } else {
        hunt.kill(e);if(warden)supplies.drop(e);
        economy.wallet+=result.amount;
        if(result.amount>0){rewardCoins.burst(prizeOrigin,captureRule(e.type.id).tier==='medium');
          rewardTags.push({species:e.type.id,name:e.type.name,amount:result.amount,tier:'silver'});}
      }
      economy.kills++;
      lock = null;
      emit('target:kill', {
        species: e.type.id,
        position: e.root.position.toArray(),
        reward: result.amount,source:result.source,large:captureRule(e.type.id).tier==='medium',
      });
      if (!warden && economy.kills % hunt.enemies.length === 0) {
        economy.wave++;
        notice('獵殺進入第 ' + economy.wave + ' 波');
        emit('hunt:wave', { wave: economy.wave });
      }
    } else if (result.kind==='bonus') {
      const prize = e.boss ? warden.smallPrize(position) : {bigCoins:1,smallCoins:5};
      const amount = result.amount;
      economy.wallet += amount;
      if (e.boss) prizeOrigin.copy(position);
      rewardCoins.burst(prizeOrigin, false, prize);
      rewardTags.push({species:e.type.id,name:e.type.name,amount,tier:'bronze'});
      emit('target:smallPrize', { species: e.type.id, amount, position: prizeOrigin.toArray(),source:result.source });
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
          emit('world:impact', { kind: hit.kind, position: hit.position.toArray(), source: 'knife' });
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
      const rule=captureRule(warden.target.type.id),value=Math.min(100,Math.floor(100*(warden.target.rage??0)/rule.enrageHits));
      const knife=economy.weapon==='knife';
      $('boss-percent').textContent=knife?'近戰':formatChance(captureChance(rule.id,economy.weapon==='grenade'?'grenade':'shot'));
      $('boss-percent').title=knife?'近戰清除，無賞金':economy.weapon==='grenade'?'爆心擊倒率，隨距離降低':'每次付費命中的擊倒率';
      $('boss-fill').style.width=value+'%';$('boss-rage').textContent='怒氣 '+value+'%';
      $('boss-prize').textContent=knife?'近戰清除 · 無賞金':'賞金 '+(economy.bet*rule.multiplier).toLocaleString('en-US');
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
      const knife=economy.weapon==='knife',rule=captureRule(lock.type.id),source=economy.weapon==='grenade'?'grenade':'shot';
      $('enemy-name').textContent = lock.type.name;
      $('enemy-prize').textContent=knife?'近戰清除 · 無賞金':(economy.bet*rule.multiplier).toLocaleString('en-US')+' 幣 · '+(source==='grenade'?'爆心':'每發')+'擊倒 '+formatChance(captureChance(rule.id,source));
      $('enemy-health').parentElement.hidden=!knife;
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
  warmLoad.done();
  job.finish();
  let shadowLeft = 0, footfall = 0, grenadePhase = 'idle';
  const collectCoin = () => { particles.playCoinPickup(); emit('coin:collect'); };
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
    const forced=simulating?world.updatePlayer?.(dt,player,feet,bodyHeight):null;
    const controlsLocked=!!world.playerLocked||!!forced;
    if(controlsLocked!==transitLocked){
      if(controlsLocked){stopAutoPlay(false);setScope(false);damageFeedback.clear();}
      stopInput();transitLocked=controlsLocked;
    }
    if(forced){feet=forced.feet;verticalSpeed=stepOffset=landingTime=landingDip=0;grounded=true;moving=0;}
    if(forced?.impactStart){tremor=Math.max(tremor,1.45);tremorTime=0;tremorDecay=4.8;tremorSide=player.x>0?1:-1;}
    rewardTags.update(playing ? real : 0);
    refunds.update(playing ? real : 0);
    if (playing&&!controlsLocked) {
      // Consume look input on EVERY rendered frame, including the impact pause.
      applyLook(performance.now(),real*1000);
    }
    if (simulating) {
      if(pilot.enabled&&!controlsLocked){
        const control=pilot.update(dt,autoContext());
        if(!pilot.enabled){stopInput();notice(pilot.status);if(wantsLock()&&document.pointerLockElement!==canvas)awaitClick();}
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
      if(!controlsLocked)for (let i = 0; i < steps; i++) movement(movementTime / steps);
      // One footfall per half bob cycle (walk ~0.32 s, run ~0.21 s, crouch ~0.64 s apart).
      const stride = Math.floor(walkPhase / Math.PI);
      if (stride !== footfall) {
        footfall = stride;
        if (grounded && moving > 0.1 && !controlsLocked) emit('player:step', { run: !pilot.enabled && (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(stick.x, stick.y) > 0.93) || !!pilot.controls?.run, crouch: bodyHeight < 1.5 });
      }
      playerVelocity.set(player.x,feet,player.z).sub(previousPlayer).divideScalar(movementTime);
      kickPitch *= Math.exp(-dt * 12);
      kickYaw *= Math.exp(-dt * 14);
      tremor *= Math.exp(-dt * tremorDecay);
      tremorTime += dt;
    }
    if (playing) cameraPose();
    if (simulating || mode === 'ready') {
      world.breeze.value += dt;
      if(playing && warden)world.updateGates?.(dt,player,feet,bodyHeight);
      hunt.update(dt, clock, playing, camera, economy.wave, feet);
    }
    if (simulating) {
      if(!controlsLocked&&!world.playerLocked)aimAndFire(dt);
      grenades.update(dt);
      // Covers the last shot and an empty gun drawn after its previous reload was interrupted.
      if (mag() === 0 && reloadLeft === 0 && !(pilot.enabled&&economy.weapon==='mg3')) reload();
      // The boss reward is a separate presentation; normal play and supplies continue.
      if(mode==='play')supplies?.update(dt,player,feet);
    }
    if(warden&&mode==='play'&&simulating)warden.update(dt,player,playerHit,()=>finishChallenge(true),feet);
    if(forced&&!world.playerLocked){stopInput();transitLocked=false;}
    $('train-warning').hidden=!(playing&&world.playerLocked);
    if(world.playerLocked){
      const warning=$('train-warning'),impact=world.transitKind==='impact',kind=impact?'impact':'evacuation';
      if(warning.dataset.kind!==kind){
        warning.dataset.kind=kind;
        warning.querySelector('small').textContent=impact?'軌道危險':'月台安全警告';
        warning.querySelector('strong').textContent=impact?'遭列車撞擊！正在回到月台':'列車即將啟動，請離開車廂';
        warning.querySelector('span').textContent=impact?'站穩後恢復操控，留意進站列車':'正在引導你返回月台，抵達後恢復操控';
      }
      warning.querySelector('i').style.width=(world.evacuationProgress*100).toFixed(1)+'%';
    }
    if (grenade.phase !== grenadePhase) {
      if (grenade.phase === 'throw') emit('grenade:windup');
      grenadePhase = grenade.phase;
    }
    sound.update(simulating ? dt : 0, { camera, enemies: hunt.targets, boss: warden?.target, health: warden ? warden.health : undefined });
    fx.update(simulating ? dt : 0);
    if (simulating) {
      rewardCoins.update(dt, collectCoin, creditBossCoin);
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
    world.updateVisuals?.(uiDt,camera);
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
  loading.fail('無法載入獵場，請確認 WebGL 與硬體加速已開啟後重新整理。');
});
