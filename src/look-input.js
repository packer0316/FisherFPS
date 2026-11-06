
export const lookInputRules=Object.freeze({bucketMs:4,buckets:32,maxAgeMs:80,stallMs:80,maxRecoveryAngle:.18});

// A fixed time-bucket ring handles high-polling mice without per-event allocations.
// Fresh movement is 1:1; only a frame following a stall drops stale backlog and
// bounds its recovery turn. Overflow is discarded, never replayed after release.
export function makeLookInput() {
  const {bucketMs,buckets,maxAgeMs,stallMs,maxRecoveryAngle}=lookInputRules;
  const times=new Float64Array(buckets).fill(-Infinity);
  const xs=new Float64Array(buckets),ys=new Float64Array(buckets);
  const rawXs=new Float64Array(buckets),rawYs=new Float64Array(buckets);
  const output={x:0,y:0,rawX:0,rawY:0};
  let resetAt=-Infinity,recoveryUntil=-Infinity;
  function clear(now=-Infinity) {
    times.fill(-Infinity);xs.fill(0);ys.fill(0);rawXs.fill(0);rawYs.fill(0);resetAt=now;
    recoveryUntil=Number.isFinite(now)?now+32:-Infinity;
  }
  function add(dx,dy,sensitivity,time,now) {
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(sensitivity)||
      !Number.isFinite(time)||!Number.isFinite(now))return false;
    if(time<resetAt || now-time>maxAgeMs || (!dx&&!dy))return false;
    time=Math.min(time,now);
    const bucket=Math.floor(time/bucketMs),i=((bucket%buckets)+buckets)%buckets;
    if(times[i]!==bucket){times[i]=bucket;xs[i]=ys[i]=rawXs[i]=rawYs[i]=0;}
    xs[i]+=dx*sensitivity;ys[i]+=dy*sensitivity;rawXs[i]+=dx;rawYs[i]+=dy;
    return true;
  }
  function take(now,frameMs) {
    output.x=output.y=output.rawX=output.rawY=0;
    for(let i=0;i<buckets;i++){
      if(now-times[i]*bucketMs<=maxAgeMs){
        output.x+=xs[i];output.y+=ys[i];output.rawX+=rawXs[i];output.rawY+=rawYs[i];
      }
    }
    // Preserve resetAt so delayed events from a prior lock cannot re-enter.
    times.fill(-Infinity);
    if(frameMs>=stallMs)recoveryUntil=now+32;
    if(now<=recoveryUntil){
      const scale=Math.min(1,maxRecoveryAngle/Math.max(.00001,Math.hypot(output.x,output.y)));
      output.x*=scale;output.y*=scale;output.rawX*=scale;output.rawY*=scale;
    }
    return output;
  }
  return {add,take,clear};
}

export async function requestRawPointerLock(canvas) {
  try {await canvas.requestPointerLock({unadjustedMovement:true});}
  catch(error){
    if(error?.name!=='NotSupportedError')throw error;
    await canvas.requestPointerLock();
  }
}
