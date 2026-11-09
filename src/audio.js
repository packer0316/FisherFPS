// Web Audio playback for the game's clips: buses, positional voices, voice limits,
// a game-time scheduler (frozen while paused) and crossfaded ambience beds.
import { clips } from './audio-manifest.js';

const MUTE_KEY = 'dustline.audio.muted';

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
function writeMuted(value) {
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
}

let shared = null;
// One engine per page: the game, the station and the UI share buses and the mute switch.
export function getAudio() {
  return shared ??= makeAudio();
}

function makeAudio() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const ctx = Context ? new Context({ latencyHint: 'interactive' }) : null;
  const buffers = new Map(), loading = new Map();
  const groups = new Map();
  const timeline = [];
  let gameTime = 0, muted = readMuted();
  if (!ctx) {
    const noop = () => null;
    return { play: noop, schedule: noop, cancel: noop, update: noop, load: async () => {}, preload: async () => {},
      loop: noop, setWorldActive: noop, setMuted: noop, get muted() { return true; }, unlock: noop,
      setListener: noop, clipDuration: () => 0, clipSync: () => 0, now: () => 0, stopTag: noop };
  }
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 6;
  limiter.attack.value = 0.003; limiter.release.value = 0.18;
  master.connect(limiter).connect(ctx.destination);
  master.gain.value = muted ? 0 : 1;
  const bus = {};
  for (const [name, level] of [['world', 1], ['ambience', 0.55], ['ui', 0.8]]) {
    bus[name] = ctx.createGain();
    bus[name].gain.value = name === 'ui' ? level : 0;
    bus[name].connect(master);
    bus[name].level = level;
  }
  const listener = ctx.listener;
  function setParam(param, value, legacy) {
    if (param) param.setTargetAtTime(value, ctx.currentTime, 0.015);
    else legacy?.();
  }
  function setListener(position, forward, up) {
    setParam(listener.positionX, position.x, () => listener.setPosition(position.x, position.y, position.z));
    if (listener.positionX) { setParam(listener.positionY, position.y); setParam(listener.positionZ, position.z); }
    if (listener.forwardX) {
      setParam(listener.forwardX, forward.x); setParam(listener.forwardY, forward.y); setParam(listener.forwardZ, forward.z);
      setParam(listener.upX, up.x); setParam(listener.upY, up.y); setParam(listener.upZ, up.z);
    } else listener.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    listenerAt[0] = position.x; listenerAt[1] = position.y; listenerAt[2] = position.z;
  }
  const listenerAt = [0, 0, 0];

  // Manifest clips are named without extension; other callers pass a relative .mp3 path.
  const url = name => name.endsWith('.mp3') ? name : 'audio/' + name + '.mp3';
  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (!loading.has(name)) {
      loading.set(name, fetch(url(name)).then(r => {
        if (!r.ok) throw Error(r.status + ' ' + name);
        return r.arrayBuffer();
      }).then(data => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
        .then(buffer => { buffers.set(name, buffer); return buffer; })
        .catch(error => { console.warn('audio', error); loading.delete(name); return null; }));
    }
    return loading.get(name);
  }
  // onLoaded runs once per clip, failed ones included, so callers can show progress.
  async function preload(names, concurrency = 6, onLoaded) {
    const queue = [...names];
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (queue.length) { await load(queue.shift()); onLoaded?.(); }
    }));
  }
  function unlock() {
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, unlock, { capture: true, passive: true });

  // Voice groups cap concurrency: the oldest voice in a full group is faded out.
  function claim(group, limit) {
    if (!group) return;
    let list = groups.get(group);
    if (!list) groups.set(group, list = []);
    while (list.length >= limit) {
      const old = list.shift();
      try {
        old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.012);
        old.source.stop(ctx.currentTime + 0.06);
      } catch { /* already stopped */ }
    }
    return list;
  }
  /**
   * Play a clip now (or at an absolute AudioContext time `at`).
   * opts: volume, rate, pitchVar, position [x,y,z], bus, group, limit, offset, ref, rolloff, tag
   */
  function play(name, opts = {}) {
    const buffer = buffers.get(name);
    if (!buffer) { load(name); return null; }
    if (ctx.state !== 'running') return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = !!opts.loop;
    const variation = opts.pitchVar ?? 0;
    source.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * variation);
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    let tail = gain;
    if (opts.position) {
      const [x, y, z] = opts.position;
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = opts.ref ?? 2.5;
      panner.rolloffFactor = opts.rolloff ?? 1;
      panner.maxDistance = 200;
      if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
      else panner.setPosition(x, y, z);
      // Air absorption: distant reports lose their crack before they lose their weight.
      const distance = Math.hypot(x - listenerAt[0], y - listenerAt[1], z - listenerAt[2]);
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = Math.max(900, 20000 * Math.exp(-distance / 32));
      gain.connect(air).connect(panner);
      tail = panner;
    }
    tail.connect(bus[opts.bus ?? 'world']);
    source.connect(gain);
    const when = Math.max(ctx.currentTime, opts.at ?? 0);
    const offset = Math.max(0, opts.offset ?? 0);
    if (offset >= buffer.duration) return null;
    const voice = { source, gain, name, tag: opts.tag };
    const list = claim(opts.group, opts.limit ?? 8);
    list?.push(voice);
    if (opts.tag) tagged.add(voice);
    source.onended = () => {
      if (list) { const i = list.indexOf(voice); if (i >= 0) list.splice(i, 1); }
      tagged.delete(voice);
      gain.disconnect();
    };
    source.start(when, offset);
    api.onPlay?.(name, when - ctx.currentTime, opts);
    return voice;
  }
  const tagged = new Set();
  function stopTag(tag, fade = 0.05) {
    for (const voice of tagged) {
      if (voice.tag !== tag) continue;
      try {
        voice.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        voice.source.stop(ctx.currentTime + fade);
      } catch { /* already stopped */ }
      tagged.delete(voice);
    }
  }

  // Game-time scheduler. `delay` is in game seconds; pausing the game freezes the queue.
  function schedule(delay, fn, key) {
    const item = { at: gameTime + Math.max(0, delay), fn, key };
    timeline.push(item);
    return item;
  }
  function cancel(key) {
    for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].key === key) timeline.splice(i, 1);
  }
  const LOOKAHEAD = 0.05;
  function update(dt) {
    gameTime += dt;
    if (!timeline.length || dt <= 0) return;
    timeline.sort((a, b) => a.at - b.at);
    while (timeline.length && timeline[0].at <= gameTime + LOOKAHEAD) {
      const item = timeline.shift();
      // Sub-frame placement: start the voice exactly when its game time comes due.
      item.fn(ctx.currentTime + Math.max(0, item.at - gameTime));
    }
  }

  // Ambience beds: two overlapping voices with equal-power fades hide the loop point.
  let bed = null;
  function loop(name, volume = 1, crossfade = 3) {
    if (bed?.name === name) { bed.volume = volume; return; }
    const previous = bed;
    if (previous) { clearTimeout(previous.timer); for (const v of previous.voices) fadeVoice(v, 1.5); }
    if (!name) { bed = null; return; }
    const current = bed = { name, volume, voices: [], timer: 0 };
    load(name).then(buffer => {
      if (!buffer || bed !== current) return;
      const span = buffer.duration - crossfade - 0.1;
      const next = first => {
        if (bed !== current) return;
        if (ctx.state === 'running') {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          const t = ctx.currentTime;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(current.volume, t + (first ? 1.2 : crossfade));
          gain.gain.setValueAtTime(current.volume, t + span);
          gain.gain.linearRampToValueAtTime(0, t + span + crossfade);
          source.connect(gain).connect(bus.ambience);
          source.start(t, 0.05);
          source.stop(t + span + crossfade + 0.05);
          const voice = { source, gain };
          current.voices.push(voice);
          source.onended = () => { current.voices.splice(current.voices.indexOf(voice), 1); gain.disconnect(); };
          current.timer = setTimeout(() => next(false), span * 1000);
        } else current.timer = setTimeout(() => next(first), 400);
      };
      next(true);
    });
  }
  function fadeVoice(voice, seconds) {
    try {
      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
      voice.source.stop(ctx.currentTime + seconds);
    } catch { /* already stopped */ }
  }

  function setWorldActive(active) {
    for (const name of ['world', 'ambience']) {
      bus[name].gain.setTargetAtTime(active ? bus[name].level : 0, ctx.currentTime, active ? 0.05 : 0.03);
    }
  }
  function setMuted(value) {
    muted = value;
    writeMuted(value);
    master.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.03);
  }
  const api = {
    play, schedule, cancel, update, load, preload, loop, setWorldActive, setMuted, unlock, setListener, stopTag,
    onPlay: null, // optional (name, secondsFromNow, opts) observer for tests and debugging
    get muted() { return muted; },
    get state() { return ctx.state; },
    get time() { return gameTime; },
    get loaded() { return buffers.size; },
    clipDuration: name => clips[name]?.[0] ?? 0,
    clipSync: name => clips[name]?.[1] ?? 0,
    now: () => ctx.currentTime,
  };
  return api;
}
