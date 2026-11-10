export const REWARD_ROLL = 1.12;
export const rewardTickCount = tier => tier === 'bronze' ? 9 : tier === 'gold' ? 16 : 12;
export const rewardTickTime = (step, ticks) => REWARD_ROLL * (1 - Math.cbrt(1 - step / ticks));
const clamp = t => Math.max(0, Math.min(1, t));
const out = t => 1 - (1 - clamp(t)) ** 3;

// Time, displacement at 360 px, scale X/Y, rotation, opacity, optional drive-in easing.
// A rigid plate cocks in place, accelerates toward the viewer, hits a hard stop,
// then seats against its latch. Uniform scaling keeps the metal from stretching.
const arrival = [
  [0, 0, 4, .86, .86, 0, 0],
  [.025, 0, 4, .86, .86, 0, 1],
  [.055, 0, 4, .86, .86, 0, 1],
  [.12, 0, -1.5, 1.012, 1.012, -.12, 1, 'drive'],
  [.155, 0, -1.5, 1.012, 1.012, -.12, 1],
  [.235, 0, 0, .988, .988, 0, 1],
  [.30, 0, 0, 1, 1, 0, 1],
  [.354, 0, -.8, 1.006, 1.006, 0, 1, 'drive'],
  [.39, 0, -.8, 1.006, 1.006, 0, 1],
  [.49, 0, 0, 1, 1, 0, 1],
];
const pulse = (age, start, duration) => age < start || age >= start + duration ? 0 : 1 - out((age - start) / duration);

// Reuse a per-card sample object; no particles, timers or frame-rate-dependent springs.
export function sampleRewardTagMotion(entry, reduced, sample = {}) {
  const age = entry.age, power = entry.tier === 'gold' ? 1.18 : entry.tier === 'bronze' ? .78 : 1;
  let a = arrival.at(-1), b = a, t = 0;
  for (let i = 1; i < arrival.length; i++) {
    if (age < arrival[i][0]) {
      a = arrival[i - 1]; b = arrival[i];
      const progress = clamp((age - a[0]) / (b[0] - a[0]));
      t = b[7] === 'drive' ? progress ** 2 : out(progress);
      break;
    }
  }
  const lerp = i => a[i] + (b[i] - a[i]) * t;
  const contact = pulse(age, .12, .19), latch = pulse(age, .354, .13);
  const locked = pulse(age, REWARD_ROLL, .32);
  const tick = pulse(age, entry.tickAt, .045) * (age < REWARD_ROLL ? 1 : 0);
  const shake = locked * Math.sin((age - REWARD_ROLL) * 88);
  sample.x = reduced ? 0 : (lerp(1) + shake * 2.2) * power;
  sample.y = reduced ? 0 : (lerp(2) - locked * 1.5) * power;
  sample.sx = reduced ? 1 : 1 + (lerp(3) - 1 + locked * .012) * power;
  sample.sy = reduced ? 1 : 1 + (lerp(4) - 1 + locked * .012) * power;
  sample.rotate = reduced ? 0 : lerp(5) * power;
  sample.opacity = reduced ? out(age / .1) : lerp(6);
  sample.numberScale = reduced ? 1 : 1 + (.13 * locked + .025 * tick) * power;
  sample.numberY = reduced ? 0 : -1.6 * tick * power;
  sample.portraitScale = reduced ? 1 : 1 + (contact * .13 + locked * .07) * power;
  sample.flash = reduced ? 0 : Math.min(.65, (contact * .5 + latch * .3 + locked * .6) * power);
  sample.lock = reduced ? 0 : locked;
  sample.rail = entry.step / rewardTickCount(entry.tier);
  const sparkAge = age >= REWARD_ROLL ? age - REWARD_ROLL : age - .12;
  sample.spark = clamp(sparkAge / .25);
  sample.sparkOpacity = reduced || sparkAge < 0 || sparkAge > .25 ? 0 : (1 - sample.spark) ** 2 * power;
  // Short, decisive glints at the mechanical latch and the final total.
  const sweepAge = age >= REWARD_ROLL ? age - REWARD_ROLL : age - .30;
  sample.sheenX = -130 + clamp(sweepAge / .22) * 440;
  sample.sheen = reduced || sweepAge < 0 || sweepAge >= .22 ? 0 : Math.sin(sweepAge / .22 * Math.PI) * .62;
  return sample;
}
