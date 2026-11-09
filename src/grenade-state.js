// Fictional game timing; the fuse begins at release, never while the input is held.
export const grenadeTiming = { pin: .72, release: .42, recovery: .72, charge: 1.15 };

export function makeGrenadeState(launch) {
  let phase = 'idle', time = 0, held = false, holdTime = 0, power = 0;
  return {
    get phase() { return phase; }, get time() { return time; },
    get power() { return phase === 'pin' || phase === 'held' ? Math.min(1, holdTime / grenadeTiming.charge) : power; },
    press(available) {
      if (phase !== 'idle' || !available) return false;
      phase = 'pin'; time = holdTime = power = 0; held = true;
      return true;
    },
    release() { held = false; },
    cancel() { phase = 'idle'; time = holdTime = power = 0; held = false; },
    update(dt) {
      // Consume phase boundaries precisely, including a click shorter than the pin animation.
      while (dt > 1e-8 && phase !== 'idle') {
        if (phase === 'held' && !held) { phase = 'throw'; time = 0; power = Math.min(1, holdTime / grenadeTiming.charge); }
        const limit = phase === 'pin' ? grenadeTiming.pin : phase === 'throw' ? grenadeTiming.release
          : phase === 'recover' ? grenadeTiming.recovery : Infinity;
        const step = Math.min(dt, limit - time);
        if (held && (phase === 'pin' || phase === 'held')) holdTime += step;
        time += step; dt -= step;
        if (time + 1e-8 < limit) break;
        time = 0;
        if (phase === 'pin') phase = 'held';
        else if (phase === 'throw') { phase = 'recover'; launch(power); }
        else { phase = 'idle'; held = false; }
      }
    },
  };
}
