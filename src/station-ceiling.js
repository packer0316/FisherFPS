import * as T from 'three';

// Only replace the high roof faces. The source Ceiling mesh also contains the
// side arched windows: keep those vertices, UVs, bones and original materials.
export function refineStationCeiling(model,{add,rail,materials,masonry}) {
  const mesh=model.getObjectByName('Ceiling'),g=mesh.geometry,idx=g.index;
  const v=new T.Vector3(),keep=[];
  for(let i=0;i<idx.count;i+=3){let roof=true;
    for(let j=0;j<3;j++){const n=idx.getX(i+j);v.fromBufferAttribute(g.attributes.position,n);
      mesh.applyBoneTransform(n,v);v.applyMatrix4(mesh.matrixWorld);
      if(v.y<12.7||Math.abs(v.x)>15.9)roof=false;
    }
    if(!roof)for(let j=0;j<3;j++)keep.push(idx.getX(i+j));
  }
  mesh.geometry=g.clone();mesh.geometry.setIndex(keep);
  // The section follows the original roof's silhouette, rather than changing the hall.
  const half=[[0,20.62],[1.8,20.56],[3.58,20.42],[5.29,20.02],[6.94,19.52],
    [8.08,19],[9.52,18.21],[10.74,17.38],[12.63,16.35],[13.78,15.03],[14.96,13.85],[15.68,12.71]];
  const profile=half.slice(1).reverse().map(([x,y])=>new T.Vector3(-x,y,0)).concat(half.map(([x,y])=>new T.Vector3(x,y,0)));
  const curve=new T.CatmullRomCurve3(profile,false,'centripetal'),points=curve.getPoints(96),pos=[],uv=[],indices=[];
  let length=0;
  for(let i=0;i<points.length;i++){if(i)length+=points[i].distanceTo(points[i-1]);const p=points[i];
    for(const z of [-35.3,34.8]){pos.push(p.x,p.y,z);uv.push(length/4,z/4);}}
  for(let i=0;i<points.length-1;i++){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  const roof=new T.BufferGeometry();roof.setAttribute('position',new T.Float32BufferAttribute(pos,3));roof.setAttribute('uv',new T.Float32BufferAttribute(uv,2));roof.setIndex(indices);roof.computeVertexNormals();
  const plaster=masonry.clone();plaster.color.set(0x8d7164);plaster.normalScale.set(.09,.09);plaster.side=T.DoubleSide;plaster.roughness=.8;
  add(roof,plaster);
  for(const z of [-33.7,-25.9,-18,-10,-2,6,14,22,30.5]){
    const ribs=profile.map(p=>new T.Vector3(p.x,p.y-.09,z));
    add(new T.TubeGeometry(new T.CatmullRomCurve3(ribs),72,.1,8,false),materials.metal);
    for(const dz of [-.13,.13])add(new T.TubeGeometry(new T.CatmullRomCurve3(ribs.map(p=>p.clone().add(new T.Vector3(0,0,dz)))),72,.022,6,false),materials.brass);
  }
  for(const x of [-8,0,8]){
    const p=points.reduce((a,b)=>Math.abs(b.x-x)<Math.abs(a.x-x)?b:a);
    rail(new T.Vector3(p.x,p.y-.07,-35.2),new T.Vector3(p.x,p.y-.07,34.7),.045,materials.metal);
  }
}
