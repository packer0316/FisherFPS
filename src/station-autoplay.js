// AI-only playable envelope. Manual movement still uses the source station's
// collision, including the outer platforms, tracks and open train interiors.
const areas=[
  [-21.4,21.4,-25.8,27,-.1,2.2],
  [-8.25,-3.35,-27.4,-15,0,7.2],
  [3.35,8.25,-27.4,-15,0,7.2],
  [-17.65,17.65,-31.3,-26.05,4.65,7.2],
];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function stationAutoRecovery(x,z,y,r=.4){
  let best=null;
  for(const [x0,x1,z0,z1,y0,y1] of areas){
    const px=clamp(x,x0+r,x1-r),pz=clamp(z,z0+r,z1-r),py=clamp(y,y0,y1);
    const distance=Math.hypot(px-x,pz-z,(py-y)*2);
    if(!best||distance<best.distance)best={x:px,y:py,z:pz,distance};
  }
  return best;
}
export const stationAutoAllows=(x,z,y,r=.4)=>stationAutoRecovery(x,z,y,r).distance<1e-6;
export function stationAutoStep(from,x,z,y,r=.32){
  const next=stationAutoRecovery(x,z,y,r).distance;
  // A player can enable AI outside its circuit, or be knocked out by a train.
  // Permit returning to the envelope without trapping them behind its boundary.
  return next<1e-6||next<stationAutoRecovery(from.x,from.z,from.y,r).distance-1e-7;
}
export function stationAutoRoute(terrainHeight){
  const points=[[7,22],[7,8],[5.8,-13],[5.8,-16],[5.8,-20],[5.8,-24],
    [5.8,-28],[14,-29],[0,-29],[-14,-29],[-5.8,-28],[-5.8,-24],[-5.8,-20],[-5.8,-16],[-5.8,-13],[-7,8],[-7,22],[0,23]];
  return points.map(([x,z])=>({x,z,y:z<=-27?4.98:terrainHeight(x,z)}));
}
