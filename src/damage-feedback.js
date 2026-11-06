const STOP_SECONDS = 0.085;
const FLASH_SECONDS = 0.52;

// Spend the impact pause in real time, without stopping rendering or input.
// Only the time AFTER the pause is returned to the simulation: no catch-up step.
export function makeDamageFeedback(overlay) {
  let stopLeft = 0, flashLeft = 0;
  return {
    hit() {
      stopLeft = STOP_SECONDS;
      flashLeft = FLASH_SECONDS;
      overlay.style.opacity = '1';
    },
    advance(seconds) {
      const elapsed = Math.max(0, seconds);
      const held = Math.min(stopLeft, elapsed);
      stopLeft -= held;
      if (flashLeft > 0) {
        flashLeft = Math.max(0, flashLeft - elapsed);
        const fade = Math.min(1, flashLeft / (FLASH_SECONDS - STOP_SECONDS));
        overlay.style.opacity = String(fade * fade);
      }
      return elapsed - held;
    },
    clear() {
      stopLeft = flashLeft = 0;
      overlay.style.opacity = '0';
    },
  };
}
