import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeSceneMusic, MUSIC_VOLUME, FADE_OUT, LOOP_FADE } from '../src/scene-music.js';

const tracks = { lobby: 'lobby.mp3', warden: 'prison.mp3', bride: 'castle.mp3' };
const settle = () => new Promise((r) => setImmediate(r));

function fakeEnv({ duration = 60 } = {}) {
  const listeners = new Map(), sources = [], contexts = [], fetched = [], gains = [];
  const param = (value) => ({
    value, target: value,
    cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.target = v; }, setTargetAtTime(v) { this.target = v; },
    setValueCurveAtTime() {},
  });
  class FakeContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    decodeAudioData(data) { return Promise.resolve({ duration, url: data.url }); }
    createGain() { const node = { gain: param(1), connect(next) { return next; }, disconnect() {} }; gains.push(node); return node; }
    createBufferSource() {
      const source = { startedAt: null, stopped: false, connect(node) { return node; },
        start(when) { this.startedAt = when; },
        // stop(when) only schedules the end of a pass; stop() silences it now.
        stop(when) { if (when === undefined) this.stopped = true; else this.stopAt = when; } };
      sources.push(source);
      return source;
    }
  }
  const env = {
    AudioContext: FakeContext,
    fetch: (url) => { fetched.push(url); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve({ url }) }); },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    // Loop passes keep rescheduling themselves; unref so tests without mock timers can exit.
    setTimeout: (...args) => { const timer = setTimeout(...args); timer?.unref?.(); return timer; },
    clearTimeout: (id) => clearTimeout(id),
  };
  const gesture = async () => { listeners.get('pointerdown')?.(); await settle(); await settle(); };
  const playing = () => sources.filter((s) => !s.stopped).map((s) => s.buffer.url);
  return { env, sources, contexts, fetched, gains, listeners, gesture, playing };
}

test('nothing plays before a user gesture; the lobby track starts after one', async () => {
  const { env, contexts, gesture, playing } = fakeEnv();
  const music = makeSceneMusic(tracks, { env, keep: ['lobby'] });
  music.play('lobby');
  assert.equal(contexts.length, 0, 'no AudioContext before a gesture');
  await gesture();
  assert.deepEqual(playing(), ['lobby.mp3']);
});

test('entering a boss arena fades the lobby out and the boss track in', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { env, gesture, playing } = fakeEnv();
    const music = makeSceneMusic(tracks, { env, keep: ['lobby'] });
    music.play('lobby');
    await gesture();
    music.play('warden');
    await settle(); await settle();
    assert.deepEqual(playing().sort(), ['lobby.mp3', 'prison.mp3'], 'both audible during the crossfade');
    mock.timers.tick(FADE_OUT * 1000);
    assert.deepEqual(playing(), ['prison.mp3']);
  } finally {
    mock.timers.reset();
  }
});

test('the desert hunt (null) and unknown names fade to silence', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { env, gesture, playing } = fakeEnv();
    const music = makeSceneMusic(tracks, { env });
    music.play('lobby');
    await gesture();
    music.play(null);
    mock.timers.tick(FADE_OUT * 1000);
    assert.deepEqual(playing(), []);
    music.play('desert');
    await settle(); await settle();
    assert.deepEqual(playing(), []);
  } finally {
    mock.timers.reset();
  }
});

test('returning mid-fade keeps the same voice instead of restarting the track', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { env, sources, gesture } = fakeEnv();
    const music = makeSceneMusic(tracks, { env, keep: ['lobby'] });
    music.play('lobby');
    await gesture();
    music.play(null);
    mock.timers.tick(FADE_OUT * 500);
    music.play('lobby');
    mock.timers.tick(FADE_OUT * 1000);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].stopped, false);
  } finally {
    mock.timers.reset();
  }
});

test('each loop pass starts LOOP_FADE seconds before the previous one ends', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { env, sources, gesture } = fakeEnv({ duration: 30 });
    const music = makeSceneMusic(tracks, { env });
    music.play('bride');
    await gesture();
    assert.equal(sources.length, 1);
    mock.timers.tick(30 * 1000);
    assert.equal(sources.length, 2);
    assert.ok(Math.abs(sources[1].startedAt - (sources[0].startedAt + 30 - LOOP_FADE)) < 1e-9);
  } finally {
    mock.timers.reset();
  }
});

test('boss tracks are dropped from memory after they stop; kept tracks are not', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { env, fetched, gesture } = fakeEnv();
    const music = makeSceneMusic(tracks, { env, keep: ['lobby'] });
    music.play('warden');
    await gesture();
    music.play('lobby');
    await settle(); await settle();
    mock.timers.tick(FADE_OUT * 1000);
    music.play('warden');
    await settle(); await settle();
    assert.equal(fetched.filter((u) => u === 'prison.mp3').length, 2, 'boss track fetched again');
    assert.equal(fetched.filter((u) => u === 'lobby.mp3').length, 1, 'lobby fetched once');
  } finally {
    mock.timers.reset();
  }
});

test('the music follows the game mute switch after a click', async () => {
  let muted = false;
  const { env, gains, listeners, gesture } = fakeEnv();
  const music = makeSceneMusic(tracks, { env, muted: () => muted });
  music.play('lobby');
  await gesture();
  const master = gains[0]; // created with the context, before any track
  assert.equal(master.gain.value, MUSIC_VOLUME);
  muted = true;
  listeners.get('click')();
  assert.equal(master.gain.target, 0);
  muted = false;
  listeners.get('click')();
  assert.equal(master.gain.target, MUSIC_VOLUME);
});

test('a first click that leaves the lobby never starts the music', async () => {
  const { env, sources, gesture } = fakeEnv();
  const music = makeSceneMusic(tracks, { env });
  music.play('lobby');
  const pending = gesture();
  music.play(null);
  await pending;
  assert.equal(sources.length, 0);
});

test('prepare downloads before audio unlocks and decodes after, so play starts at once', async () => {
  const { env, contexts, fetched, gesture, playing } = fakeEnv();
  const music = makeSceneMusic(tracks, { env });
  await music.prepare('warden');
  assert.deepEqual(fetched, ['prison.mp3']);
  assert.equal(contexts.length, 0, 'preparing never creates an AudioContext');
  await gesture();
  await music.prepare('bride');
  music.play('bride');
  assert.deepEqual(playing(), ['castle.mp3'], 'the decoded track starts in the same call');
  assert.deepEqual(fetched, ['prison.mp3', 'castle.mp3'], 'each track is fetched once');
  await music.prepare('missing');
});

test('without Web Audio the game keeps running silently', async () => {
  const music = makeSceneMusic(tracks, { env: { fetch() { throw Error('unused'); } } });
  assert.doesNotThrow(() => music.play('lobby'));
  await music.prepare('lobby');
  assert.ok(MUSIC_VOLUME > 0 && MUSIC_VOLUME <= 1);
});
