// Independent schedules, stepped through every boundary even on a slow frame.
export const trainDurations = Object.freeze({ waiting: 8, approaching: 6, braking: .8, opening: 1.25, boarding: 9, closing: 1.5, departing: 5.5 });
const phases = Object.keys(trainDurations);
export function makeTrainSchedule(initialWait, onPhase = () => {}, onPassenger = () => {}, beforeClose = () => true) {
  let phase = 'waiting', time = 0, delay = initialWait, passenger = 0, cycle = 0;
  function next() {
    phase = phases[(phases.indexOf(phase) + 1) % phases.length]; time = 0;
    if (phase === 'boarding') passenger = 0;
    if (phase === 'waiting') { cycle++; delay = trainDurations.waiting; }
    onPhase(phase);
  }
  return {
    get phase() { return phase; }, get time() { return time; }, get cycle() { return cycle; },
    get progress() { return Math.min(1, time / (phase === 'waiting' ? delay : trainDurations[phase])); },
    get door() { return phase === 'opening' ? this.progress : phase === 'boarding' ? 1 : phase === 'closing' ? 1 - this.progress : 0; },
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      while (dt > 1e-8) {
        const duration = phase === 'waiting' ? delay : trainDurations[phase];
        const step = Math.min(dt, duration - time); time += step; dt -= step;
        if (phase === 'boarding') while (passenger < 4 && time >= .65 + passenger * 1.8) onPassenger(passenger++);
        if (time >= duration - 1e-8) {
          // Keep the doors fully open and the train stationary until the passenger
          // has actually reached the platform. A long frame cannot skip this guard.
          if(phase==='boarding'&&!beforeClose()){time=duration;break;}
          next();
        }
      }
    },
    request() { if (phase === 'waiting') delay = Math.min(delay, time + .6); },
    reset() { phase = 'waiting'; time = passenger = cycle = 0; delay = initialWait; onPhase(phase); },
  };
}
