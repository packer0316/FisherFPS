import * as T from 'three';

export const stationGallery=Object.freeze({halfWidth:18.2,floor:4.98,minZ:-32,maxZ:-26.5});
export const stationGround=Object.freeze({halfWidth:22.3,outerPlatform:14.534,outerFloor:.024});

// Sample the actual authored stair treads; the central source floor also runs
// underneath the staircase, so its flat triangles must not become walk-throughs.
export function stationStairSurface(model) {
  const triangles = [], a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), normal = new T.Vector3();
  model.updateMatrixWorld(true);
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh.name !== 'Station') return;
    const g = mesh.geometry, idx = g.index;
    const vertex = (i, v) => { v.fromBufferAttribute(g.attributes.position, idx ? idx.getX(i) : i);
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(idx ? idx.getX(i) : i, v); return v.applyMatrix4(mesh.matrixWorld); };
    for (let i = 0; i < (idx?.count ?? g.attributes.position.count); i += 3) {
      vertex(i, a); vertex(i + 1, b); vertex(i + 2, c);
      normal.subVectors(b, a).cross(new T.Vector3().subVectors(c, a)).normalize();
      if (normal.y < .5 || Math.max(a.y, b.y, c.y) > 5.1 || Math.min(a.y, b.y, c.y) < -.1) continue;
      const den = (b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
      if (Math.abs(den) < 1e-8) continue;
      triangles.push({ a:a.clone(), b:b.clone(), c:c.clone(), den,
        minX:Math.min(a.x,b.x,c.x), maxX:Math.max(a.x,b.x,c.x), minZ:Math.min(a.z,b.z,c.z), maxZ:Math.max(a.z,b.z,c.z) });
    }
  });
  return (x, z) => {
    if (Math.abs(x) < 2.85 || Math.abs(x) > 8.65 || z < -26.7 || z > -15) return 0;
    let y = 0;
    for (const t of triangles) {
      if (x<t.minX-.001 || x>t.maxX+.001 || z<t.minZ-.001 || z>t.maxZ+.001) continue;
      const u=((t.b.z-t.c.z)*(x-t.c.x)+(t.c.x-t.b.x)*(z-t.c.z))/t.den;
      const v=((t.c.z-t.a.z)*(x-t.c.x)+(t.a.x-t.c.x)*(z-t.c.z))/t.den;
      if(u>=-.001&&v>=-.001&&u+v<=1.001)y=Math.max(y,u*t.a.y+v*t.b.y+(1-u-v)*t.c.y);
    }
    return y;
  };
}

// The source balustrades have front/side faces but no rear faces. Surface-only
// collision lets a player approaching from the landing enter their solid caps.
// Bake the paired rectangular cap faces into volumes, including the sloped tops,
// so the same masonry blocks from either side and supports a landing from above.
export function stationStairSolids(model) {
  model.updateMatrixWorld(true);
  const solids=[],seen=new Set(),vertices=[new T.Vector3(),new T.Vector3(),new T.Vector3()],normal=new T.Vector3(),edge=new T.Vector3(),bounds=new T.Box3();
  model.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name!=='Station')return;
    const g=mesh.geometry,idx=g.index;
    for(let i=0;i<(idx?.count??g.attributes.position.count);i+=3){
      for(let j=0;j<3;j++){const n=idx?idx.getX(i+j):i+j,v=vertices[j];v.fromBufferAttribute(g.attributes.position,n);
        if(mesh.isSkinnedMesh)mesh.applyBoneTransform(n,v);v.applyMatrix4(mesh.matrixWorld);}
      normal.subVectors(vertices[1],vertices[0]).cross(edge.subVectors(vertices[2],vertices[0])).normalize();bounds.setFromPoints(vertices);
      const {min,max}=bounds;
      if(normal.y<.8||min.z< -26.6||max.z> -15.8||min.y<.5||max.y>6||min.x< -19||max.x>19)continue;
      const cap=min.y>5.2&&max.z< -25.8,sloping=max.y-min.y>1&&normal.y<.99;
      if(!cap&&!sloping)continue;
      const key=[min.x,max.x,min.z,max.z,min.y,max.y].map(n=>n.toFixed(2)).join(',');
      if(seen.has(key))continue;seen.add(key);
      const count=sloping?Math.ceil((max.z-min.z)/.12):1;
      for(let j=0;j<count;j++){
        const z0=T.MathUtils.lerp(min.z,max.z,j/count),z1=T.MathUtils.lerp(min.z,max.z,(j+1)/count);
        const height=(x,z)=>vertices[0].y-(normal.x*(x-vertices[0].x)+normal.z*(z-vertices[0].z))/normal.y;
        const top=Math.max(height(min.x,z0),height(max.x,z0),height(min.x,z1),height(max.x,z1));
        solids.push(new T.Box3(new T.Vector3(min.x,sloping?0:4.70,z0-.002),new T.Vector3(max.x,top+.005,z1+.002)));
      }
    }
  });
  return solids;
}

// Bake the unchanged source masonry around the stairs into small spatial buckets.
// It is not possible to cover the original piers / sloped balustrades accurately
// with the old few large boxes. Treads remain terrain, so steps do not snag feet.
export function stationMeshBarriers(model) {
  model.updateMatrixWorld(true);
  const buckets=new Map(),box=new T.Box3(),v=[new T.Vector3(),new T.Vector3(),new T.Vector3()],normal=new T.Vector3(),edge=new T.Vector3();
  model.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name!=='Station')return;
    const g=mesh.geometry,idx=g.index;
    for(let i=0;i<(idx?.count??g.attributes.position.count);i+=3){
      for(let j=0;j<3;j++){const n=idx?idx.getX(i+j):i+j;v[j].fromBufferAttribute(g.attributes.position,n);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(n,v[j]);v[j].applyMatrix4(mesh.matrixWorld);}
      normal.subVectors(v[1],v[0]).cross(edge.subVectors(v[2],v[0])).normalize();
      box.setFromPoints(v);
      if(Math.abs(normal.y)>.55||box.min.y>7||box.max.y<.1||box.max.x<-23||box.min.x>23)continue;
      if(box.max.y-box.min.y<.28&&box.max.y<5.1)continue;
      const triangle=new T.Triangle(...v.map(p=>p.clone()));
      for(let x=Math.floor(box.min.x/2);x<=Math.floor(box.max.x/2);x++)for(let z=Math.floor(box.min.z/2);z<=Math.floor(box.max.z/2);z++){
        const key=x+','+z;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(triangle);
      }
    }
  });
  return (x,z,r,feet,height,step)=>{
    box.min.set(x-r,feet+step+.004,z-r);box.max.set(x+r,feet+height-.004,z+r);
    for(let ix=Math.floor((x-r)/2);ix<=Math.floor((x+r)/2);ix++)for(let iz=Math.floor((z-r)/2);iz<=Math.floor((z+r)/2);iz++)
      for(const triangle of buckets.get(ix+','+iz)??[])if(box.intersectsTriangle(triangle))return true;
    return false;
  };
}

export function makeStationCollision(terrainHeight, colliders,meshBlocked=()=>false,transit=null) {
  const overlap=(b,x,z,r)=>x+r>b.min.x&&x-r<b.max.x&&z+r>b.min.z&&z-r<b.max.z;
  return {
    blocked(x,z,r=.32,feet=0,height=1.84,step=.24) {
      const cabin=transit?.region(x,z,r,height);
      if(Math.abs(x)>stationGround.halfWidth-r||z>28-r||z<stationGallery.minZ+r)return true;
      if(cabin&&(cabin.blocked||cabin.floor>feet+step+.002||feet>cabin.ceiling+.002))return true;
      if(terrainHeight(x,z)>feet+step+.002)return true;
      if(meshBlocked(x,z,r,feet,height,step))return true;
      return colliders.some(b=>!(cabin&&transit.isHull(b))&&overlap(b,x,z,r)&&b.max.y>feet+step+.002&&b.min.y<feet+height-.002);
    },
    verticalLimits(x,z,feet,height=1.84) {
      let floor=terrainHeight(x,z),ceiling=Infinity;
      const cabin=transit?.region(x,z,.31,height);
      if(cabin){floor=Math.max(floor,cabin.floor);ceiling=cabin.ceiling;}
      for(const b of colliders)if(overlap(b,x,z,.31)){
        if(cabin&&transit.isHull(b))continue;
        if(b.max.y<=feet+.242)floor=Math.max(floor,b.max.y);
        if(b.min.y>=feet+height-.002)ceiling=Math.min(ceiling,b.min.y-height);
      }
      return {floor,ceiling};
    },
  };
}
