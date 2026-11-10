import { REWARD_ROLL, rewardTickCount, rewardTickTime } from './reward-tag-motion.js';

export const REWARD_HOLD = 4;
export const REWARD_EXIT = .42;
export const REWARD_ENTER = .49;
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const formatReward = value => numberFormat.format(value);
export const easeOut = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

// Presentation only: this queue never credits the wallet or changes combat state.
export function makeRewardTagState() {
  let entries = [], serial = 0;
  return {
    get entries() { return entries; },
    push({ species, name, amount, tier = 'silver' }) {
      if (!Number.isSafeInteger(amount) || amount <= 0) return null;
      const entry = { id: ++serial, species, name, amount,
        tier: ['bronze', 'silver', 'gold'].includes(tier) ? tier : 'silver',
        age: 0, value: 0, step: 0, tickAt: -1, slot: 0, targetSlot: 0 };
      entries.push(entry);
      return entry;
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      for (const entry of entries) entry.age += dt;
      entries = entries.filter(e => e.age < REWARD_HOLD + REWARD_EXIT - 1e-8);
      let slot = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        e.targetSlot = slot++;
        e.slot += (e.targetSlot - e.slot) * (1 - Math.exp(-22 * dt));
        // Detents use the existing audio's exact 9/12/16 tick times. The final
        // tick always shows the actual award; this never changes wallet credit.
        const ticks = rewardTickCount(e.tier);
        e.step = e.age >= REWARD_ROLL - 1e-10 ? ticks : Math.min(ticks - 1, Math.floor(easeOut(e.age / REWARD_ROLL) * ticks + 1e-8));
        e.tickAt = e.step ? rewardTickTime(e.step, ticks) : -1;
        e.value = e.step === ticks ? e.amount : Math.min(e.amount - 1, Math.floor(e.amount * (e.step / ticks)));
      }
    },
    clear() { entries = []; },
  };
}
