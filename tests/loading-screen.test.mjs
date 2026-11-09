import test from 'node:test';
import assert from 'node:assert/strict';
import { trackLoaderItems, makeLoadJob } from '../src/loading-screen.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeManager() {
  const calls = [];
  return { calls, itemStart(url) { calls.push(['start', url]); }, itemEnd(url) { calls.push(['end', url]); } };
}

test('items that were open before tracking began never count', () => {
  const manager = fakeManager();
  const items = trackLoaderItems(manager);
  manager.itemEnd('early.png');
  const progress = items.mark();
  assert.equal(progress(), 0, 'nothing started yet');
  manager.itemStart('walker.glb');
  manager.itemStart('sand.webp');
  manager.itemEnd('walker.glb');
  assert.equal(progress(), 0.5);
  manager.itemEnd('sand.webp');
  assert.equal(progress(), 1);
  assert.equal(manager.calls.length, 5, 'the manager still receives every call');
});

test('idle waits for a load that starts from another load\'s callback', async () => {
  const manager = fakeManager();
  const items = trackLoaderItems(manager);
  manager.itemStart('bride.glb');
  let idle = false;
  items.idle(20).then(() => { idle = true; });
  manager.itemEnd('bride.glb');
  setTimeout(() => manager.itemStart('bride-normal.jpg'), 2);
  await wait(50);
  assert.equal(idle, false, 'the texture started inside the settle window');
  manager.itemEnd('bride-normal.jpg');
  await wait(50);
  assert.equal(idle, true);
});

test('job progress is the weighted mean of its parts', async () => {
  const manager = fakeManager();
  const job = makeLoadJob(trackLoaderItems(manager));
  let clips = 0, resolveMusic;
  const scene = job.part('載入場景', 6, job.loaderProgress);
  job.part('載入音效', 2, () => clips);
  const music = job.part('載入背景音樂', 2).follow(new Promise((r) => { resolveMusic = r; }));
  manager.itemStart('a.glb');
  manager.itemStart('b.webp');
  manager.itemEnd('a.glb');
  clips = 0.5;
  assert.equal(job.progress(), (6 * 0.5 + 2 * 0.5) / 10);
  assert.equal(job.step(), '載入場景');
  scene.done();
  assert.equal(job.step(), '載入音效');
  resolveMusic();
  await music;
  clips = 1;
  assert.equal(job.progress(), 1);
  assert.equal(job.step(), '載入音效', 'a part reading 1 still waits for done()');
});

test('a failed load still completes its part, so the job cannot hang', async () => {
  const job = makeLoadJob(trackLoaderItems(fakeManager()));
  const failing = job.part('載入介面', 1).follow(Promise.reject(Error('404')));
  await failing.catch(() => {});
  assert.equal(job.progress(), 1);
});
