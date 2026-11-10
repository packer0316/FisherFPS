import test from 'node:test';
import assert from 'node:assert/strict';
import { awarenessRules as R, notices, chasePace, farTime, givesUp, makeNoiseLog } from '../src/hunt-awareness.js';

test('hears a close player through cover, sees a farther one only with a clear line', () => {
  let looks = 0;
  const blocked = () => { looks++; return false; }, clear = () => { looks++; return true; };
  assert.equal(notices(R.hear - 1, 0, blocked), true, 'close by, behind cover');
  assert.equal(looks, 0, 'hearing needs no raycast');
  assert.equal(notices(R.hear - 1, R.hearHeight + 1, blocked), false, 'a floor apart is not heard');
  assert.equal(notices(R.sight - 1, 0, blocked), false);
  assert.equal(notices(R.sight - 1, 0, clear), true);
  looks = 0;
  assert.equal(notices(R.sight + 1, 0, clear), false, 'beyond sight even with a clear line');
  assert.equal(looks, 0, 'no raycast beyond sight range');
});

test('chasers jog to close a gap and walk at their own pace near the player', () => {
  assert.equal(chasePace(R.catchUp.from - 3), 1);
  assert.equal(chasePace(R.catchUp.to + 30), R.catchUp.boost);
  assert.ok(Math.abs(chasePace((R.catchUp.from + R.catchUp.to) / 2) - (1 + R.catchUp.boost) / 2) < 1e-9);
});

test('a chaser gives up only after staying far away for the whole patience window', () => {
  let far = 0;
  for (let t = 0; t < R.patience; t += .5) far = farTime(far, R.giveUp + 5, .5);
  assert.equal(givesUp(far), false);
  far = farTime(far, R.giveUp + 5, .5);
  assert.equal(givesUp(far), true);
  assert.equal(farTime(far, R.giveUp - 1, .5), 0, 'coming back within range resets the clock');
});

test('gunfire and blasts are heard once, while they are fresh', () => {
  const events = new EventTarget();
  let clock = 10;
  const log = makeNoiseLog(events, () => clock);
  const send = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  send('weapon:fire', { origin: [1, 2, 3] });
  send('grenade:explode', { position: [4, 0, 6] });
  const heard = [];
  let cursor = log.since(0, (n) => heard.push(n));
  assert.deepEqual(heard.map((n) => [n.x, n.z, n.radius]), [[1, 3, R.gunshot], [4, 6, R.blast]]);
  heard.length = 0;
  cursor = log.since(cursor, (n) => heard.push(n));
  assert.equal(heard.length, 0, 'each noise is delivered once per cursor');
  send('weapon:fire', { origin: [0, 0, 0] });
  clock += R.noiseAge + .1;
  log.since(cursor, (n) => heard.push(n));
  assert.equal(heard.length, 0, 'stale noise no longer alerts');
});
