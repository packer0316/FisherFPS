// Index static support surfaces once; no scene raycasts or full collider scan
// per coin/frame. Elevated slabs remain separate from the floor beneath them.
export function makeCoinFloor(world){
  const buckets=new Map(),cell=4,moving=new Set((world.trains??[]).map(t=>t.collider));
  for(const box of world.colliders??[]){
    if(moving.has(box))continue;
    for(let x=Math.floor(box.min.x/cell);x<=Math.floor(box.max.x/cell);x++)
      for(let z=Math.floor(box.min.z/cell);z<=Math.floor(box.max.z/cell);z++){
        const key=x+','+z;let items=buckets.get(key);if(!items)buckets.set(key,items=[]);items.push(box);
      }
  }
  return (x,z,reference)=>{
    let floor=world.terrainHeight(x,z,reference);
    for(const b of buckets.get(Math.floor(x/cell)+','+Math.floor(z/cell))??[])
      if(x>=b.min.x&&x<=b.max.x&&z>=b.min.z&&z<=b.max.z&&b.max.y<=reference+.26)floor=Math.max(floor,b.max.y);
    return Math.max(floor,world.coinFloor?.(x,z,reference)??-Infinity);
  };
}

export function clearCoinFloor(position,size,minY,radius,previousBottom,sample){
  const bottom=position.y+minY*size,reference=Math.max(bottom,previousBottom),r=radius*size*1.083;
  // Cover the whole rotating disc, including its edge over a tread or platform.
  let floor=sample(position.x,position.z,reference);
  for(const [dx,dz] of footprint)floor=Math.max(floor,sample(position.x+dx*r,position.z+dz*r,reference));
  position.y=Math.max(position.y,floor-minY*size+.035);
  return position.y+minY*size;
}
const footprint=[[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[.707,-.707],[-.707,.707],[-.707,-.707]];
