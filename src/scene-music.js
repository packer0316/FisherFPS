// Scene background music: the lobby theme and one track per boss arena.
//
// One track plays at a time. Switching fades the old track out while the new
// one fades in, and each track loops with an equal-power crossfade, so
// recordings that stop mid-phrase never cut hard back to the top.
//
// Web Audio instead of <audio>: iOS Safari ignores HTMLMediaElement.volume, so
// a GainNode is the only fade that works everywhere. Browsers only let audio
// start after a user gesture, so nothing plays before the first input.
export const MUSIC_VOLUME = .5, FADE_IN = 1.2, FADE_OUT = 1.6, LOOP_FADE = 2;

const curve = (fn) => Float32Array.from({ length: 64 }, (_, i) => fn(i / 63 * Math.PI / 2));
const RISE = curve(Math.sin), FALL = curve(Math.cos);

/**
 * @param tracks  { name: url }
 * @param muted   returns true while the game's mute switch is on
 * @param keep    tracks whose decoded audio stays in memory after they stop
 *                (others are dropped; a long track decodes to tens of MB)
 */
export function makeSceneMusic(tracks, { muted = () => false, keep = [], env = globalThis } = {}) {
  const Context = env.AudioContext ?? env.webkitAudioContext;
  if (!Context) return { play() {}, prepare: () => Promise.resolve() };
  const downloads = new Map(), decoding = new Map(), buffers = new Map(), fading = new Set();
  let ctx = null, master = null, wanted = null, current = null, hidden = false;

  function download(name) {
    if (!downloads.has(name)) {
      const job = env.fetch(tracks[name]).then((r) => {
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.arrayBuffer();
      });
      job.catch(() => {});
      downloads.set(name, job);
    }
    return downloads.get(name);
  }
  for (const name of keep) download(name);
  function decode(name) {
    if (!decoding.has(name)) {
      decoding.set(name, download(name).then((data) => ctx.decodeAudioData(data))
        .then((buffer) => { buffers.set(name, buffer); return buffer; })
        .catch((error) => { console.warn('背景音樂載入失敗', tracks[name], error); return null; }));
    }
    return decoding.get(name);
  }

  const gestures = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
  function unlock() {
    if (!ctx) {
      ctx = new Context();
      master = ctx.createGain();
      master.gain.value = muted() ? 0 : MUSIC_VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'running') {
      for (const type of gestures) env.removeEventListener(type, unlock, true);
      return;
    }
    if (!hidden) ctx.resume().then(sync, () => {});
  }
  for (const type of gestures) env.addEventListener(type, unlock, true);
  // The mute button belongs to the sound-effects engine; re-read it after any click.
  env.addEventListener('click', () => {
    if (master) master.gain.setTargetAtTime(muted() ? 0 : MUSIC_VOLUME, ctx.currentTime, .03);
  });
  env.document?.addEventListener('visibilitychange', () => {
    hidden = env.document.visibilityState === 'hidden';
    if (!ctx) return;
    if (hidden) ctx.suspend();
    else ctx.resume().then(sync, () => {});
  });

  function ramp(param, value, seconds, linear) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (linear) param.linearRampToValueAtTime(value, now + seconds);
    // Exponential approach sounds smoother on the way out; four time constants
    // leave about 2% of the level when the voices stop.
    else param.setTargetAtTime(value, now, seconds / 4);
  }

  function startTrack(name, buffer) {
    const track = { name, level: ctx.createGain(), voices: new Set(), timer: 0, stopTimer: 0 };
    track.level.gain.value = 0;
    track.level.connect(master);
    const overlap = Math.min(LOOP_FADE, buffer.duration / 4);
    const pass = (when, first) => {
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = buffer;
      source.connect(gain).connect(track.level);
      const end = when + buffer.duration;
      if (!first) gain.gain.setValueCurveAtTime(RISE, when, overlap);
      gain.gain.setValueCurveAtTime(FALL, end - overlap, overlap);
      source.start(when);
      source.stop(end);
      track.voices.add(source);
      source.onended = () => { track.voices.delete(source); gain.disconnect(); };
      // Queue the next pass a second early so it starts sample-accurately.
      const next = end - overlap;
      track.timer = env.setTimeout(() => pass(next, false), Math.max(0, next - ctx.currentTime - 1) * 1000);
    };
    pass(ctx.currentTime + .02, true);
    fadeIn(track);
    return track;
  }
  function fadeIn(track) {
    env.clearTimeout(track.stopTimer);
    ramp(track.level.gain, 1, FADE_IN, true);
  }
  function fadeOut(track) {
    fading.add(track);
    ramp(track.level.gain, 0, FADE_OUT, false);
    track.stopTimer = env.setTimeout(() => {
      fading.delete(track);
      env.clearTimeout(track.timer);
      for (const source of track.voices) try { source.stop(); } catch { /* already stopped */ }
      track.level.disconnect();
      if (!keep.includes(track.name) && wanted !== track.name) {
        buffers.delete(track.name); decoding.delete(track.name); downloads.delete(track.name);
      }
    }, FADE_OUT * 1000);
  }

  function sync() {
    if (!ctx || ctx.state !== 'running' || current?.name === wanted) return;
    if (current) fadeOut(current);
    current = null;
    if (!wanted) return;
    // Coming back while the old track is still fading picks it up where it is.
    const revived = [...fading].find((track) => track.name === wanted);
    if (revived) {
      fading.delete(revived);
      fadeIn(revived);
      current = revived;
      return;
    }
    const buffer = buffers.get(wanted);
    if (buffer) current = startTrack(wanted, buffer);
    else decode(wanted).then((loaded) => { if (loaded) sync(); });
  }

  return {
    /** Switch to a track by name; null or an unknown name fades to silence. */
    play(name) {
      name = name && tracks[name] ? name : null;
      if (wanted === name) return;
      wanted = name;
      if (name) download(name);
      sync();
    },
    /**
     * Fetch a track ahead of time, and decode it too once audio is unlocked, so it starts
     * without a gap when played. Resolves when ready; never rejects.
     */
    prepare(name) {
      if (!tracks[name]) return Promise.resolve();
      return (ctx ? decode(name) : download(name)).then(() => {}, () => {});
    },
  };
}
