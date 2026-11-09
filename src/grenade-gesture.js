import { MathUtils } from 'three';
import { grenadeTiming } from './grenade-state.js';

const smooth=MathUtils.smoothstep;

// Seconds relative to the actual projectile release, not a render-frame timer.
// Thumb disengages first; proximal joints extend before the distal pads finish
// their follow-through. Recovery blends into a genuinely unloaded hand.
export function grenadeFingerMotion(phase,time,available,joint) {
  const throwing=phase==='throw'||phase==='recover';
  if(!throwing)return {extension:0,relax:available>0?0:1};
  const afterRelease=phase==='throw'?time-grenadeTiming.release:time;
  const digit=Math.floor(joint/3),segment=joint%3;
  const delay=(digit===4?-.026:[.012,.006,0,-.006][digit])+segment*.012;
  let extension=smooth(afterRelease,-.058+delay,.050+delay);
  let relax=smooth(afterRelease,.13,.31);
  // A remaining grenade is grasped only while the hand is lowered for pickup.
  // The last throw must never run the regrip portion of the animation.
  const regrip=available>0?smooth(afterRelease,.38,.54):0;
  extension*=1-regrip;relax*=1-regrip;
  return {extension,relax};
}
