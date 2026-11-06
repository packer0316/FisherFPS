import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDamageFeedback } from './damage-feedback.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const setup = () => {
  const overlay = { style: { opacity: '0' } };
  return { overlay, feedback: makeDamageFeedback(overlay) };
};

test('impact spends 85 ms at different frame rates without replaying frozen time', () => {
  for (const fps of [30, 60, 144]) {
    const { overlay, feedback } = setup();
    feedback.hit();
    let simulated = 0;
    for (let i = 0; i < fps; i++) simulated += feedback.advance(1 / fps);
    close(simulated, 1 - 0.085);
    close(Number(overlay.style.opacity), 0);
    close(feedback.advance(1 / fps), 1 / fps);
  }
});

test('red edges hold through impact then fade independently of simulation time', () => {
  const { overlay, feedback } = setup();
  feedback.hit();
  close(feedback.advance(0.06), 0);
  close(Number(overlay.style.opacity), 1);
  close(feedback.advance(0.04), 0.015);
  assert.ok(Number(overlay.style.opacity) < 1);
  assert.ok(Number(overlay.style.opacity) > 0.8);
  feedback.advance(0.42);
  close(Number(overlay.style.opacity), 0);
});

test('a repeated hit refreshes feedback without stacking pauses; menus can clear it', () => {
  const { overlay, feedback } = setup();
  feedback.hit();
  feedback.advance(0.04);
  feedback.hit();
  close(feedback.advance(0.08), 0);
  close(feedback.advance(0.01), 0.005);
  feedback.clear();
  close(Number(overlay.style.opacity), 0);
  close(feedback.advance(0.016), 0.016);
});

test('a slow frame consumes the pause once, without extending it across later frames', () => {
  const { feedback } = setup();
  feedback.hit();
  close(feedback.advance(0.2), 0.115);
  close(feedback.advance(0.016), 0.016);
});
