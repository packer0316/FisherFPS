export function togglePriority(order,id) {
  return order.includes(id)?order.filter(value=>value!==id):[...order,id];
}
export function normalizePriority(order,roster) {
  const valid=new Set(roster.map(t=>t.id));
  return [...new Set(Array.isArray(order)?order:[])].filter(id=>valid.has(id));
}
export function preferredAutoWeapon(economy) {
  return economy.owned.has('mg3')&&economy.ammo.mg3>0?'mg3':'rifle';
}

// Positive clearance is safe. Inflate danger by the player's body width, while
// keeping the Bride's hollow ring centre usable as an escape route.
export function hazardClearance(zone,p,margin=.65) {
  const x=p.x-zone.x,z=p.z-zone.z;
  if(zone.shape==='line') {
    const along=x*zone.dx+z*zone.dz,side=Math.abs(x*zone.dz-z*zone.dx);
    return Math.max(-along-margin,along-zone.length-margin,side-zone.width/2-margin);
  }
  const radius=Math.hypot(x,z);
  return Math.max(radius-zone.radius-margin,(zone.inner??0)>0?zone.inner-margin-radius:-Infinity);
}
export function hazardRisk(zones,p,ahead=0) {
  let risk=0;
  for(const zone of zones??[]) {
    if(!zone.active||zone.age+ahead>zone.delay+(zone.duration??0)+.1)continue;
    const clearance=hazardClearance(zone,p);
    const urgency=1+2/(.45+Math.max(0,zone.delay-zone.age-ahead));
    risk+=clearance<0?(1+Math.min(5,-clearance))*urgency:Math.max(0,1-clearance)*.5;
  }
  return risk;
}
