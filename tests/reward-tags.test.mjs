import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRewardTagState, formatReward, REWARD_HOLD, REWARD_EXIT } from '../src/reward-tag-state.js';
import { parseRewardFont, drawRewardNumber } from '../src/reward-font.js';
import { REWARD_ROLL, rewardTickTime, sampleRewardTagMotion } from '../src/reward-tag-motion.js';

const reward = (amount = 12345) => ({ species: 'warden', name: '典獄長', amount, tier: 'gold' });

test('each tag holds for four seconds then completes its exit independently', () => {
  const queue = makeRewardTagState(), first = queue.push(reward());
  queue.update(2);
  const second = queue.push(reward(400));
  queue.update(1.99);
  assert.equal(queue.entries.length, 2);
  assert.ok(first.age < REWARD_HOLD);
  queue.update(.02);
  assert.ok(first.age > REWARD_HOLD);
  assert.ok(second.age < REWARD_HOLD);
  assert.equal(queue.entries.length, 2, 'exit animation keeps the old card alive');
  queue.update(REWARD_EXIT);
  assert.deepEqual(queue.entries, [second]);
  queue.update(2);
  assert.equal(queue.entries.length, 0);
});

test('new cards push older cards up, without resetting age or prematurely dropping bursts', () => {
  const queue = makeRewardTagState(), first = queue.push(reward());
  queue.update(1);
  for (let i = 0; i < 20; i++) queue.push(reward(i + 1));
  queue.update(.2);
  assert.equal(queue.entries.length, 21);
  assert.equal(first.age, 1.2);
  assert.equal(first.targetSlot, 20);
  assert.ok(first.slot > 18 && first.slot < 20);
  assert.equal(queue.entries.at(-1).slot, 0);
  queue.update(4.3);
  assert.equal(queue.entries.length, 0);
});

test('rolling scores finish exactly with thousands separators and pause safely', () => {
  const queue = makeRewardTagState(), tag = queue.push(reward(1234567));
  queue.update(.2);
  assert.ok(tag.value > 0 && tag.value < tag.amount);
  const value = tag.value, age = tag.age;
  for (const dt of [0, -1, NaN, Infinity]) queue.update(dt);
  assert.equal(tag.value, value); assert.equal(tag.age, age);
  queue.update(1.2);
  assert.equal(tag.value, 1234567);
  assert.equal(formatReward(tag.value), '1,234,567');
  assert.equal(formatReward(1000), '1,000');
  assert.equal(formatReward(0), '0');
  queue.clear(); assert.equal(queue.entries.length, 0);
  assert.equal(queue.push(reward()).slot, 0);
});

test('rejects invalid awards without changing the supplied reward or economy', () => {
  const queue = makeRewardTagState(), input = Object.freeze(reward());
  queue.push(input);
  for (const amount of [0, -5, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(queue.push(reward(amount)), null);
  }
  queue.update(4.5);
  assert.equal(input.amount, 12345);
  assert.equal(queue.entries.length, 0);
});

test('the counter advances only on the existing audio beats, then locks the exact award', () => {
  for (const [tier, ticks] of [['bronze', 9], ['silver', 12], ['gold', 16]]) {
    for (const amount of [1, 149963, Number.MAX_SAFE_INTEGER]) {
      const queue = makeRewardTagState(), tag = queue.push({ ...reward(amount), tier });
      let previous = 0;
      for (let step = 1; step <= ticks; step++) {
        const beat = rewardTickTime(step, ticks);
        queue.update(beat - .00001 - tag.age);
        assert.equal(tag.step, step - 1, 'hold until the tick, do not continuously roll');
        assert.equal(tag.value, previous);
        queue.update(.00001);
        assert.equal(tag.step, step);
        assert.ok(tag.value >= previous && tag.value <= amount);
        if (step < ticks) assert.ok(tag.value < amount, 'reserve the final amount for the lock');
        previous = tag.value;
      }
      assert.equal(tag.value, amount);
      queue.update(.2);
      assert.equal(tag.value, amount, 'final amount remains fixed after the impact');
    }
  }
});

test('mechanical impacts hold briefly, settle, and honor reduced motion', () => {
  const entry = { ...reward(), age: .125, step: 4, tickAt: .1 };
  const hit = sampleRewardTagMotion(entry, false);
  const held = sampleRewardTagMotion({ ...entry, age: .145 }, false);
  for (const key of ['x', 'y', 'sx', 'sy', 'rotate']) assert.equal(hit[key], held[key]);
  const lock = sampleRewardTagMotion({ ...entry, age: REWARD_ROLL, step: 16 }, false);
  assert.ok(lock.numberScale > 1.1);
  assert.ok(lock.flash > 0 && lock.sparkOpacity > 0);
  const small = sampleRewardTagMotion({ ...entry, tier: 'bronze', age: REWARD_ROLL }, false);
  assert.ok(lock.numberScale > small.numberScale);
  for (const age of [.6, 1.6, 3.9]) {
    const settled = sampleRewardTagMotion({ ...entry, age }, false);
    assert.equal(settled.x, 0); assert.equal(settled.y, 0);
    assert.equal(settled.sx, 1); assert.equal(settled.sy, 1);
    assert.equal(settled.numberScale, 1); assert.equal(settled.flash, 0);
  }
  for (const age of [0, .12, .354, REWARD_ROLL, 3.9]) {
    const reduced = sampleRewardTagMotion({ ...entry, age }, true);
    for (const key of ['x', 'y', 'rotate', 'numberY', 'flash', 'lock', 'sparkOpacity', 'sheen']) assert.equal(reduced[key], 0);
    for (const key of ['sx', 'sy', 'numberScale', 'portraitScale']) assert.equal(reduced[key], 1);
  }
});

test('a frame hitch or a different refresh rate cannot miss the final score or leave an effect stuck', () => {
  for (const fps of [30, 60, 144]) {
    const queue = makeRewardTagState(), tag = queue.push(reward(250000));
    for (let frame = 0; frame < fps; frame++) queue.update(1 / fps);
    assert.equal(tag.step, 15);
    queue.update(.6);
    assert.equal(tag.value, 250000);
    const motion = sampleRewardTagMotion(tag, false);
    assert.equal(motion.numberScale, 1); assert.equal(motion.flash, 0);
    queue.update(3);
    assert.equal(queue.entries.length, 0);
  }
});

test('the actual FNT contains all twelve valid glyphs and uniform digit advances', () => {
  const text = readFileSync(new URL('../public/reward-tags/digits.fnt', import.meta.url), 'utf8');
  const font = parseRewardFont(text);
  assert.equal(font.glyphs.size, 12);
  for (const g of font.glyphs.values()) {
    assert.ok(g.x >= 0 && g.y >= 0 && g.width > 0 && g.height > 0);
    assert.ok(g.x + g.width <= font.scaleW && g.y + g.height <= font.scaleH);
    assert.ok(g.yoffset >= 0 && g.yoffset + g.height <= font.lineHeight);
  }
  assert.equal(new Set([...'0123456789'].map(c => font.glyphs.get(c).xadvance)).size, 1);
  assert.throws(() => parseRewardFont('common lineHeight=30'));
  // Large winnings and separators must fit inside the number field at high DPI.
  const draws = [], canvas = { getContext: () => ({ setTransform() {}, clearRect() {}, drawImage: (...args) => draws.push(args) }) };
  drawRewardNumber(canvas, '+1,234,567', font, {}, 260, 68, 2);
  assert.equal(draws.length, 10);
  for (const [, , , , , x, y, w, h] of draws) {
    assert.ok(x >= -.001 && y >= 0 && x + w <= 260.001 && y + h <= 68.001);
  }
});
