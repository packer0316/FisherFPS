// How hunt zombies notice, follow and lose the player. Distances are metres on the ground plane.
export const awarenessRules = Object.freeze({
  hear: 15, hearHeight: 4, // noticed through cover or from behind
  sight: 55,               // noticed with a clear line between zombie and player
  gunshot: 40,             // a shot alerts zombies this close to the shooter
  blast: 28,               // a grenade alerts zombies this close to the explosion
  pack: 18,                // a zombie that notices wakes pack mates this close to it
  giveUp: 70, patience: 10, // a chaser this far away for `patience` seconds gives up
  catchUp: { from: 10, to: 25, boost: 1.5 }, // chase pace ramps up with distance
  scan: .4,               // seconds between sight checks of an unalerted zombie
  noiseAge: 1,            // seconds a shot or blast can still alert a zombie
});
const R = awarenessRules;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// canSee is only called when sight could matter, since it costs a raycast.
export function notices(distance, heightGap, canSee) {
  if (distance <= R.hear && heightGap <= R.hearHeight) return true;
  return distance <= R.sight && canSee();
}

// Far chasers jog to close the gap, then slow to their own pace near the player.
export function chasePace(distance) {
  const { from, to, boost } = R.catchUp;
  return 1 + (boost - 1) * clamp01((distance - from) / (to - from));
}

// Seconds spent beyond giveUp; the chase ends once it exceeds patience.
export function farTime(previous, distance, dt) {
  return distance > R.giveUp ? previous + dt : 0;
}
export const givesUp = (seconds) => seconds > R.patience;

// One shared record of gunfire and explosions. Each hunt keeps its own cursor,
// so levels that are not updating never hold listeners or stale alerts.
export function makeNoiseLog(events, now = () => performance.now() / 1000) {
  const entries = [];
  let serial = 0;
  const add = (position, radius) => {
    if (!position) return;
    entries.push({ serial: ++serial, time: now(), x: position[0], y: position[1], z: position[2], radius });
    if (entries.length > 24) entries.shift();
  };
  events.addEventListener('weapon:fire', (e) => add(e.detail?.origin, R.gunshot));
  events.addEventListener('grenade:explode', (e) => add(e.detail?.position, R.blast));
  return {
    get serial() { return serial; },
    // Calls visit(noise) for each fresh noise after cursor; returns the new cursor.
    since(cursor, visit) {
      const fresh = now() - R.noiseAge;
      for (const noise of entries) if (noise.serial > cursor && noise.time >= fresh) visit(noise);
      return serial;
    },
  };
}
