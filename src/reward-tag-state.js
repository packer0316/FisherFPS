export const REWARD_HOLD = 4;
export const REWARD_EXIT = .42;
export const REWARD_ENTER = .3;
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
        age: 0, value: 0, slot: 0, targetSlot: 0 };
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
        e.slot += (e.targetSlot - e.slot) * (1 - Math.exp(-13 * dt));
        e.value = Math.round(e.amount * easeOut(e.age / 1.12));
      }
    },
    clear() { entries = []; },
  };
}
