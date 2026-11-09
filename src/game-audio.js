// Maps gameplay events to sound. Timings mirror the animation and reward systems so each
// clip's key transient (its manifest "sync" point) lands on the frame it belongs to.
import * as T from 'three';
import { gameEvents } from './events.js';
import { getAudio } from './audio.js';
import { clips } from './audio-manifest.js';
import { grenadeTiming } from './grenade-state.js';
import { knifeContactTime } from './knife.js';
import { bossCoinCadence } from './boss-payout.js';

// Reload keyframes as fractions of the reload (rifle-reload.js, weapon-rig.js, mg3-reload.js).
// `after` adds seconds for parts that happen off screen (a dropped magazine reaching the floor).
const reloadParts = {
  rifle: [
    { clip: 'weapons/ak_mag_out', at: 0.235 },
    { clip: 'weapons/mag_drop', at: 0.325, after: 0.42, volume: 0.45 },
    { clip: 'weapons/ak_mag_in', at: 0.715 },
    { clip: 'weapons/ak_bolt', at: 0.962, empty: true },
  ],
  pistol: [
    { clip: 'weapons/pistol_mag_out', at: 0.2 },
    { clip: 'weapons/pistol_mag_in', at: 0.655 },
    { clip: 'weapons/pistol_slide', at: 0.925, empty: true },
  ],
  mg3: [
    { clip: 'weapons/mg_latch', at: 0.075 },
    { clip: 'weapons/mg_cover_open', at: 0.18, volume: 0.8 },
    { clip: 'weapons/mg_belt_out', at: 0.27, partial: true, volume: 0.8 },
    { clip: 'weapons/mg_box_out', at: 0.33 },
    { clip: 'weapons/mg_box_drop', at: 0.42, after: 0.35, volume: 0.5 },
    { clip: 'weapons/mg_box_in', at: 0.565 },
    { clip: 'weapons/mg_belt_in', at: 0.672, volume: 0.85 },
    { clip: 'weapons/mg_cover_close', at: 0.791 },
    { clip: 'weapons/mg_bolt', at: 0.957 },
  ],
};
const shots = {
  // Player gunfire sits well under the rest of the mix (rifle ~-14 dB, pistol/MG3 ~-5 dB) so long sessions stay comfortable.
  rifle: { clip: 'weapons/ak_fire', n: 3, volume: 0.2, limit: 4, tail: 'weapons/ak_tail', tailAfter: 0.24, tailVolume: 0.12 },
  pistol: { clip: 'weapons/pistol_fire', n: 3, volume: 0.43, limit: 3 },
  mg3: { clip: 'weapons/mg_fire', n: 3, volume: 0.47, limit: 6, tail: 'weapons/mg_tail', tailAfter: 0.16, tailVolume: 0.28 },
};
const equipClips = { rifle: 'weapons/equip_rifle', pistol: 'weapons/equip_pistol', mg3: 'weapons/equip_mg',
  grenade: 'weapons/equip_grenade' };
const groanPitch = { walker: 1, stalker: 1.17, raider: 0.94, mummy: 0.8, necromancer: 0.9 };
const ambience = {
  desert: ['ambience/desert', 0.5], warden: ['ambience/prison', 0.5],
  bride: ['ambience/castle', 0.6], stationmaster: ['ambience/station', 0.42],
};
const bosses = new Set(['warden', 'bride', 'stationmaster']);
// Coin bounces: reward-coins.js jump() lands at 0.50, 0.80 and 0.90 s; small coins are staggered 0.03 s.
const coinBounces = [[0.5, 1], [0.8, 0.5], [0.9, 0.28]];

export function makeGameAudio() {
  const audio = getAudio();
  const last = new Map();
  let level = 'desert', playing = false, bossAt = null, chain = 0, chainTime = -1, menuMode = null;
  const menus = new Set(['pause', 'shop', 'challenges', 'autoplay']);
  let groanLeft = 2.5, thunderLeft = 18, heartLeft = 0, health = 100, slamVariant = 0;
  const forward = new T.Vector3(), up = new T.Vector3();

  const variant = (base, n) => {
    let i = 1 + Math.floor(Math.random() * n);
    if (n > 1 && i === last.get(base)) i = 1 + (i % n);
    last.set(base, i);
    return base + '_' + i;
  };
  const throttle = (key, seconds) => {
    const now = audio.now(), at = last.get('t:' + key) ?? -1e9;
    if (now - at < seconds) return false;
    last.set('t:' + key, now);
    return true;
  };
  const sync = name => audio.clipSync(name);
  // Start `name` so its sync point happens `delay` game seconds from now.
  function cue(name, delay, opts = {}, key) {
    const start = delay - sync(name);
    if (start <= 0) return audio.play(name, { ...opts, offset: -start });
    audio.schedule(start, at => audio.play(name, { ...opts, at }), key);
  }
  const at = position => position && [position[0], position[1] + 0.2, position[2]];

  function coinBurst(position, small, big) {
    audio.play('reward/coin_spray_small', { position: at(position), volume: 0.5, ref: 3, pitchVar: 0.05 });
    const count = Math.min(5, small + big);
    for (const [time, gain] of coinBounces) {
      for (let i = 0; i < count; i++) {
        const name = variant('reward/coin', 3);
        cue(name, time + i * 0.03, { position: at(position), volume: 0.5 * gain, ref: 3, group: 'coinland', limit: 8,
          rate: 0.92 + Math.random() * 0.24 });
      }
    }
  }
  // Count-up ticks: reward tags roll with a cubic ease-out over 1.12 s (reward-tag-state.js),
  // so tick k sits where the displayed value passes k/ticks and the ticks thin out as it settles.
  function rollTicks(ticks = 12) {
    audio.cancel('roll');
    for (let k = 1; k <= ticks; k++) {
      const t = 1.12 * (1 - Math.cbrt(1 - k / ticks));
      audio.schedule(T.MathUtils.clamp(t, 0, 1.12), when =>
        audio.play('reward/roll_tick', { at: when, bus: 'ui', volume: 0.22 + 0.25 * (k / ticks), rate: 1 + 0.25 * k / ticks }), 'roll');
    }
  }
  const surface = kind => {
    if (kind === 'prop') return 'impacts/wood';
    if (kind === 'ground' && (level === 'desert' || level === 'warden')) return 'impacts/dirt';
    return 'impacts/stone';
  };
  const step = () => level === 'bride' ? 'player/step_marble' : level === 'desert' ? 'player/step_dirt' : 'player/step_stone';

  const on = (type, fn) => gameEvents.addEventListener(type, e => fn(e.detail ?? {}));
  on('weapon:fire', ({ weapon }) => {
    const s = shots[weapon];
    if (!s) return;
    audio.play(variant(s.clip, s.n), { volume: s.volume, pitchVar: 0.035, group: 'shot', limit: s.limit });
    if (s.tail) {
      audio.cancel('tail');
      audio.schedule(s.tailAfter, when => audio.play(s.tail, { at: when, volume: s.tailVolume, pitchVar: 0.03, group: 'tail', limit: 1 }), 'tail');
    }
  });
  on('weapon:dry', ({ weapon }) => {
    if (throttle('dry', 0.3)) audio.play(weapon === 'pistol' ? 'weapons/dry_pistol' : 'weapons/dry_rifle', { volume: 0.6 });
  });
  on('weapon:reload', ({ weapon, empty, duration }) => {
    audio.cancel('reload');
    const parts = reloadParts[weapon];
    if (!parts || !(duration > 0)) return;
    for (const p of parts) {
      if ((p.empty && !empty) || (p.partial && empty)) continue;
      cue(p.clip, p.at * duration + (p.after ?? 0), { volume: p.volume ?? 0.75, tag: 'reload' }, 'reload');
    }
  });
  on('weapon:equip', ({ weapon }) => {
    audio.cancel('reload'); audio.stopTag('reload'); audio.cancel('equip'); audio.cancel('grenade');
    // Holster 0.13 s, then the new weapon rises over 0.26 s: land the handling sound mid-raise.
    const name = weapon === 'knife' ? variant('weapons/equip_knife', 3) : equipClips[weapon];
    if (name) cue(name, 0.25, { volume: 0.55 }, 'equip');
  });
  on('weapon:swing', () => {
    // Whoosh peaks just before the blade reaches its contact frame.
    cue(variant('weapons/knife_swing', 3), knifeContactTime - 0.035, { volume: 0.6, pitchVar: 0.06 }, 'swing');
  });
  on('weapon:prime', () => {
    // The pin hook clears at ~0.40 s of the 0.72 s pull (grenade-viewmodel.js).
    cue('weapons/grenade_pin', grenadeTiming.pin * 0.55, { volume: 0.7 }, 'grenade');
  });
  on('grenade:windup', () => {
    cue('weapons/grenade_throw', grenadeTiming.release, { volume: 0.55, pitchVar: 0.05 }, 'grenade');
  });
  on('weapon:throw', () => audio.play('weapons/grenade_spoon', { volume: 0.5, offset: 0 }));
  on('grenade:bounce', ({ position, speed, impact = speed }) => {
    // Only real impacts sound: sliding and settling contacts have almost no normal speed.
    if (!(impact >= 0.6) || !throttle('bounce', 0.07)) return;
    const hard = impact >= 3;
    audio.play(variant(hard ? 'weapons/grenade_hit' : 'weapons/grenade_tick', 2), { position, ref: 2, pitchVar: 0.06,
      volume: T.MathUtils.clamp(impact / (hard ? 7 : 4), 0.15, hard ? 0.85 : 0.5), group: 'bounce', limit: 2 });
  });
  on('grenade:explode', ({ position }) => {
    audio.play(variant('weapons/explosion', 3), { position, volume: 1, ref: 7, rolloff: 0.7, pitchVar: 0.05, group: 'boom', limit: 3 });
  });
  on('world:impact', ({ kind, position, source }) => {
    if (source === 'knife') {
      audio.play(variant('weapons/knife_stone', 2), { position, volume: 0.6, ref: 2, pitchVar: 0.05 });
      return;
    }
    const base = surface(kind);
    audio.play(variant(base, 3), { position, volume: 0.5, ref: 1.6, pitchVar: 0.08, group: 'impact', limit: 5 });
    if (base === 'impacts/stone' && Math.random() < 0.1 && throttle('ricochet', 0.35))
      audio.play(variant('impacts/ricochet', 2), { position, volume: 0.35, ref: 2, pitchVar: 0.08 });
  });
  on('target:hit', ({ species, position, source }) => {
    if (source === 'knife') {
      audio.play(variant('weapons/knife_flesh', 3), { position, volume: 0.75, ref: 2, pitchVar: 0.05 });
    } else audio.play(variant('impacts/flesh', 3), { position, volume: 0.55, ref: 2, pitchVar: 0.07, group: 'flesh', limit: 4 });
    if (!bosses.has(species) && Math.random() < 0.3 && throttle('zhit', 0.45))
      audio.play('monsters/zombie_hit', { position, volume: 0.45, rate: groanPitch[species] ?? 1, pitchVar: 0.05, group: 'groan', limit: 3 });
  });
  on('target:kill', ({ species, position, reward, large }) => {
    if (!bosses.has(species))
      audio.play(variant('monsters/death', 3), { position: at(position), volume: 0.7, ref: 3,
        rate: groanPitch[species] ?? 1, pitchVar: 0.05, group: 'zdeath', limit: 3 });
    if (reward > 0 && !bosses.has(species)) {
      coinBurst(position, large ? 7 : 3, large ? 2 : 0);
      audio.play('reward/tag_silver', { bus: 'ui', volume: 0.45 });
      rollTicks();
    }
  });
  on('target:smallPrize', ({ position }) => {
    coinBurst(position, 5, 1);
    audio.play('reward/tag_bronze', { bus: 'ui', volume: 0.5 });
    rollTicks(9);
  });
  on('coin:collect', () => {
    // Successive arrivals climb in pitch, like a counter spinning up.
    const now = audio.now();
    chain = now - chainTime < 0.3 ? Math.min(chain + 1, 14) : 0;
    chainTime = now;
    audio.play(variant('reward/coin', 2), { bus: 'ui', volume: 0.32, rate: 1 + chain * 0.035, group: 'collect', limit: 4 });
  });
  on('wallet:refund', () => {
    if (throttle('refund', 0.12)) audio.play('reward/refund', { bus: 'ui', volume: 0.3, pitchVar: 0.05 });
  });
  on('boss:payout', ({ phase, coins }) => {
    if (phase === 'scatter') {
      // The first boss coin lands 0.5 s in; the shower ends when the last one settles.
      const end = ((coins ?? 50) - 1) * bossCoinCadence + 0.95;
      audio.schedule(0.45, when => audio.play('reward/coin_shower', { at: when, volume: 0.5, loop: true, tag: 'shower' }), 'shower');
      audio.schedule(end, () => audio.stopTag('shower', 0.6), 'shower');
    } else if (phase === 'collect') {
      audio.cancel('shower'); audio.stopTag('shower', 0.4);
      audio.play('reward/boom', { bus: 'ui', volume: 0.55 });
      audio.play('reward/tag_gold', { bus: 'ui', volume: 0.6 });
      rollTicks(16);
    } else if (phase === 'complete') audio.play('reward/purchase', { bus: 'ui', volume: 0.6 });
  });
  on('boss:impact', ({ kind, position, strength = 1, species }) => {
    if (kind === 'step') {
      audio.play('monsters/boss_step', { position, volume: Math.min(0.75, 0.35 * strength + 0.15), ref: 4, pitchVar: 0.05,
        group: 'bstep', limit: 2 });
      return;
    }
    // Lines detonate in ~3 m segments at ~27 m/s; thin them so every hit stays distinct.
    if (!throttle('slam', species === 'stationmaster' ? 0.12 : 0.085)) return;
    slamVariant = slamVariant % 3 + 1;
    audio.play('monsters/slam_' + slamVariant, { position, volume: T.MathUtils.clamp(0.4 + 0.35 * strength, 0.4, 0.95), ref: 5,
      rolloff: 0.8, pitchVar: 0.06, group: 'slam', limit: 4 });
  });
  on('boss:attack', ({ species, attack, phase }) => {
    const position = bossAt && [bossAt.x, bossAt.y + 2.5, bossAt.z];
    if (species === 'warden') {
      audio.play('monsters/roar_short', { position, volume: 0.8, ref: 6, rate: phase === 2 ? 0.9 : 1, pitchVar: 0.04 });
    } else if (species === 'bride') {
      const name = { summon: 'monsters/bride_summon', march: 'monsters/bride_march', vow: 'monsters/bride_vow' }[attack];
      if (name) audio.play(name, { position, volume: 0.75, ref: 6, pitchVar: 0.03 });
      if (attack === 'vow' && phase === 2) cue('monsters/bride_laugh', 1.1, { position, volume: 0.6, ref: 6 });
    }
  });
  on('boss:enter', ({ species }) => {
    const name = species === 'warden' ? 'monsters/roar_long' : species === 'bride' ? 'monsters/bride_intro' : null;
    if (name) audio.schedule(0.5, when => audio.play(name, { at: when, volume: 0.8,
      position: bossAt && [bossAt.x, bossAt.y + 2.5, bossAt.z], ref: 8 }));
  });
  on('boss:defeat', ({ species }) => {
    const name = species === 'warden' ? 'monsters/roar_death' : species === 'bride' ? 'monsters/bride_death' : null;
    if (name) audio.play(name, { volume: 0.85, position: bossAt && [bossAt.x, bossAt.y + 2.5, bossAt.z], ref: 8 });
  });
  on('player:hurt', ({ hp }) => {
    health = hp;
    audio.play(variant('player/hurt_hit', 3), { volume: 0.55, pitchVar: 0.05 });
    if (hp > 0) audio.play(variant('player/hurt', 5), { volume: 0.7, pitchVar: 0.04 });
  });
  on('player:death', () => {
    health = 0;
    audio.play('player/death', { bus: 'ui', volume: 0.8 });
    audio.play('reward/boom', { bus: 'ui', volume: 0.7, rate: 0.85 });
  });
  on('player:jump', () => audio.play('player/jump', { volume: 0.35, pitchVar: 0.08 }));
  on('player:land', ({ speed = 4 }) => {
    if (speed < 1.5) return;
    const heavy = speed > 6.5;
    audio.play(heavy ? 'player/land_heavy' : variant('player/land', 2),
      { volume: T.MathUtils.clamp(speed / 8, 0.25, 0.85), pitchVar: 0.06 });
  });
  on('player:step', ({ run, crouch }) => {
    audio.play(variant(step(), 5), { volume: run ? 0.4 : crouch ? 0.13 : 0.26, pitchVar: 0.07, rate: run ? 1.04 : 1,
      group: 'step', limit: 2 });
  });
  on('supply:drop', ({ position }) => audio.play('player/crate_drop', { position, volume: 0.8, ref: 3 }));
  on('supply:pickup', ({ kind }) => {
    const name = { heal: 'player/pickup_heal', mg3: 'player/pickup_mg3', speed: 'player/pickup_speed' }[kind];
    if (name) audio.play(name, { volume: 0.75 });
  });
  on('supply:speed-end', () => audio.play('player/speed_end', { volume: 0.55 }));
  on('shop:purchase', () => audio.play('reward/purchase', { bus: 'ui', volume: 0.7 }));
  on('wallet:resupply', () => audio.play('reward/resupply', { bus: 'ui', volume: 0.7 }));
  on('hunt:wave', () => audio.play('reward/wave', { volume: 0.5 }));

  document.addEventListener('pointerdown', e => {
    const button = e.target.closest?.('button');
    if (button && !button.disabled && button.id !== 'fire-btn' && button.id !== 'jump-btn' && button.id !== 'crouch-btn')
      audio.play('ui/click', { bus: 'ui', volume: 0.55, pitchVar: 0.04 });
  }, true);

  const muteButton = document.getElementById('mute-btn');
  function showMute() {
    if (!muteButton) return;
    muteButton.setAttribute('aria-pressed', String(audio.muted));
    muteButton.setAttribute('aria-label', audio.muted ? '開啟音效' : '關閉音效');
    muteButton.title = audio.muted ? '開啟音效' : '關閉音效';
    muteButton.dataset.muted = String(audio.muted);
  }
  muteButton?.addEventListener('click', () => { audio.setMuted(!audio.muted); showMute(); });
  showMute();

  // Every gameplay clip plus the desert bed loads up front; the loading screen waits for it.
  // Ambience goes last: the other clips are small, the beds are long.
  const names = [...Object.keys(clips).filter(n => !n.startsWith('ambience/')), 'ambience/desert'];
  let preloadedCount = 0;
  const preloaded = audio.preload(names, 6, () => { preloadedCount++; });

  return {
    /** Resolves once every gameplay clip has loaded or failed; never rejects. */
    preloaded,
    preloadProgress: () => preloadedCount / names.length,
    /** Loads a level's ambience bed (and the castle's thunder) before the player enters. */
    prepareLevel(id) {
      const [bed] = ambience[id] ?? ambience.desert;
      return audio.preload(id === 'bride' ? [bed, 'ambience/thunder'] : [bed]);
    },
    setMode(mode) {
      // Menus over the game (ESC pause, shop, boss select, autoplay) open with a metal clack;
      // dropping back into combat charges the gun.
      if (menus.has(mode) && mode !== menuMode) audio.play('ui/menu_open', { bus: 'ui', volume: 0.6, pitchVar: 0.03 });
      else if (mode === 'play' && menuMode && menuMode !== 'play') audio.play('ui/menu_close', { bus: 'ui', volume: 0.5 });
      menuMode = mode;
      const next = mode === 'play';
      if (next === playing) return;
      playing = next;
      audio.setWorldActive(next);
    },
    setLevel(id) {
      level = id;
      health = 100;
      groanLeft = 2;
      const [bed, volume] = ambience[id] ?? ambience.desert;
      audio.loop(bed, volume);
      if (id === 'bride') audio.load('ambience/thunder');
    },
    update(dt, { camera, enemies, boss, health: hp }) {
      audio.update(dt);
      camera.getWorldDirection(forward);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      audio.setListener(camera.position, forward, up);
      bossAt = boss?.root?.position ?? null;
      if (hp !== undefined) health = hp;
      if (dt <= 0) return;
      // Ambient groans from a random living monster near the player.
      groanLeft -= dt;
      if (groanLeft <= 0 && enemies?.length) {
        let near = 0;
        const candidates = [];
        for (const e of enemies) {
          if (!e.alive || e.boss) continue;
          const d = e.root.position.distanceTo(camera.position);
          if (d < 30) { candidates.push(e); if (d < 12) near++; }
        }
        groanLeft = (near > 3 ? 1.4 : 2.2) + Math.random() * 2.6;
        const e = candidates[Math.floor(Math.random() * candidates.length)];
        if (e) {
          const p = e.root.position;
          audio.play(variant('monsters/groan', 7), { position: [p.x, p.y + (e.height ?? 1.8) * 0.85, p.z], volume: 0.5,
            ref: 3, rate: groanPitch[e.type?.id] ?? 1, pitchVar: 0.06, group: 'groan', limit: 3 });
        }
      }
      if (level === 'bride') {
        thunderLeft -= dt;
        if (thunderLeft <= 0) {
          thunderLeft = 24 + Math.random() * 26;
          audio.play('ambience/thunder', { bus: 'ambience', volume: 0.35 + Math.random() * 0.3, rate: 0.9 + Math.random() * 0.15 });
        }
      }
      // Heartbeat below 30 HP in boss fights; it quickens as health drops.
      if (boss && health > 0 && health <= 30) {
        heartLeft -= dt;
        if (heartLeft <= 0) {
          heartLeft = 0.72 + (health / 30) * 0.24;
          audio.play('player/heartbeat', { volume: 0.55 + (30 - health) / 60 });
        }
      } else heartLeft = 0;
    },
  };
}
