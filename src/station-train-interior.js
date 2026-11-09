import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cabinLayout } from './station-transit.js';
import { stationSurface } from './station-materials.js';

// The source was authored for an exterior camera: two textured triangles close
// the middle of the boarding carriage. Remove just that internal backdrop;
// keep both carriage end walls, its shell, UVs and the animated doors intact.
export function openTrainAisle(rig) {
  rig.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(rig.parent.matrixWorld).invert(),v=new T.Vector3();
  rig.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name==='door_light')return;
    const g=mesh.geometry,idx=g.index,keep=[];
    for(let i=0;i<(idx?.count??g.attributes.position.count);i+=3){
      let backdrop=true;
      for(let j=0;j<3;j++){
        const n=idx?idx.getX(i+j):i+j;v.fromBufferAttribute(g.attributes.position,n);
        if(mesh.isSkinnedMesh)mesh.applyBoneTransform(n,v);
        v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        if(v.z< -1.86||v.z> -1.77||Math.abs(v.x)>1.49||v.y>2.2)backdrop=false;
      }
      if(!backdrop)for(let j=0;j<3;j++)keep.push(idx?idx.getX(i+j):i+j);
    }
    mesh.geometry=g.clone();mesh.geometry.setIndex(keep);
  });
}

// A liner inside the original TRAIN_C_2 shell. Exterior geometry, textures and
// animated door leaves are untouched; openings align to the source door bones.
export function addTrainInterior(group,zones,{woodMap,woodNormal,woodRough,detail,leatherDetail,lightBudget}) {
  const solids=[],batches=new Map(),mat=(color,roughness=.65,metalness=0)=>new T.MeshStandardMaterial({
    color,roughness,metalness,emissive:color,emissiveIntensity:.3});
  const wall=mat(0x694d3c),wood=mat(0x3b2520),floor=mat(0x343637,.86),ceiling=mat(0xa0957d),
    fabric=mat(0x334f48,.88),brass=mat(0x958266,.35,.6),steel=mat(0x51575a,.4,.7),glass=mat(0x182d38,.17,.45),
    glow=new T.MeshBasicMaterial({color:0xe3c793,toneMapped:false});
  for(const m of [wall,wood]){m.map=woodMap;m.normalMap=woodNormal;m.roughnessMap=woodRough;m.normalScale.set(.20,.20);m.roughness=.85;m.emissiveIntensity=.15;}
  wall.color.set(0xaa8e75);wood.color.set(0x816656);
  fabric.roughness=.53;fabric.emissiveIntensity=.17;
  stationSurface(fabric,{...leatherDetail,scale:3.33,strength:.45,variation:.28});
  stationSurface(floor,{...detail,scale:4,strength:.18,variation:.16});
  stationSurface(brass,{...detail,scale:4,strength:.055,variation:.10});
  stationSurface(steel,{...detail,scale:3,strength:.07,variation:.14});
  function add(g,m){if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);}
  function box(x,y,z,w,h,d,m,round=false){const g=(round?new RoundedBoxGeometry(w,h,d,2,.035):new T.BoxGeometry(w,h,d)).translate(x,y,z);
    if(m.map){const {position:p,normal:n,uv}=g.attributes;for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/.9,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))/1.8);}
    add(g,m);
  }
  function bar(a,b,r,m){const d=b.clone().sub(a),pose=new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),
    new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize()),new T.Vector3(1,1,1));
    add(new T.CylinderGeometry(r,r,d.length(),8).applyMatrix4(pose),m);}
  const ends=[cabinLayout.minZ-.05,cabinLayout.maxZ+.05],center=(ends[0]+ends[1])/2,length=ends[1]-ends[0],
    doorCenters=cabinLayout.doors,gaps=doorCenters.map(z=>[z-.90,z+.90]);
  box(0,.075,center,2.95,.13,length,floor);
  // The liner follows the original rounded shell; a wide flat ceiling and tall
  // side walls used to protrude above the train's curved shoulders.
  const roofPosition=[],roofUv=[],roofIndex=[];
  for(let i=0;i<=20;i++){const x=-1.415+i*2.83/20,y=2.73-.48*Math.pow(x/1.415,2);
    for(const z of ends){roofPosition.push(x,y,z);roofUv.push(x,z);}
    if(i<20){const n=i*2;roofIndex.push(n,n+2,n+1,n+1,n+2,n+3);}}
  const roof=new T.BufferGeometry();roof.setAttribute('position',new T.Float32BufferAttribute(roofPosition,3));roof.setAttribute('uv',new T.Float32BufferAttribute(roofUv,2));roof.setIndex(roofIndex);roof.computeVertexNormals();ceiling.side=T.DoubleSide;add(roof,ceiling);
  for(let z=ends[0]+.3;z<ends[1];z+=.8)box(0,.145,z,2.9,.01,.018,steel);
  for(const side of [-1,1]){
    let start=ends[0];
    for(const [a,b] of [...gaps,[ends[1],ends[1]]]){
      if(a>start){const center=(start+a)/2,length=a-start;
        box(side*1.455,1.20,center,.08,2.11,length,wall);
        box(side*1.396,.5,center,.04,.65,length,wood);
        for(const y of [.83,2.22])box(side*1.39,y,center,.035,.035,length,brass);
      }start=b;
    }
    for(const z of doorCenters){
      for(const dz of [-.90,.90])box(side*1.42,1.20,z+dz,.10,2.11,.07,steel);
      box(side*1.42,2.22,z,.14,.08,1.87,brass);
    }
    for(const z of [-5.65,-.3,5.1]){
      box(side*1.05,.61,z,.70,.22,2.65,fabric,true);
      box(side*1.365,1.13,z,.12,.9,2.65,fabric,true);
      box(side*1.05,.34,z,.6,.42,2.45,wood);
      box(side*1.395,1.82,z,.025,.8,2.1,glass);
      for(const dz of [-1.08,0,1.08])box(side*1.37,1.82,z+dz,.035,.88,.035,brass);
      for(const y of [1.38,2.26])box(side*1.37,y,z,.035,.035,2.19,brass);
      solids.push(new T.Box3(new T.Vector3(side*1.05-.39,0,z-1.39),new T.Vector3(side*1.05+.39,1.65,z+1.39)));
      for(const dz of [-.9,0,.9])box(side*1.295,1.13,z+dz,.013,.73,.018,brass);
      for(const dz of [-1.35,1.35]){
        bar(new T.Vector3(side*.71,.62,z+dz),new T.Vector3(side*.71,1.04,z+dz),.025,brass);
        bar(new T.Vector3(side*.71,1.04,z+dz),new T.Vector3(side*1.34,1.04,z+dz),.026,brass);
      }
      // Open luggage shelves, rather than opaque boxes, keep the cabin readable.
      for(const x of [.85,1.07,1.29])bar(new T.Vector3(side*x,2.12,z-1.3),new T.Vector3(side*x,2.12,z+1.3),.022,brass);
      for(const dz of [-1.3,0,1.3])bar(new T.Vector3(side*.85,2.12,z+dz),new T.Vector3(side*1.4,2.12,z+dz),.022,brass);
    }
    bar(new T.Vector3(side*.6,2.45,ends[0]+.2),new T.Vector3(side*.6,2.45,ends[1]-.2),.025,brass);
    for(let z=-6;z<6;z+=2.5){
      bar(new T.Vector3(side*.6,2.45,z),new T.Vector3(side*.6,2.23,z),.014,wood);
      add(new T.TorusGeometry(.085,.018,8,14).translate(side*.6,2.15,z),brass);
    }
  }
  for(const z of ends){
    box(0,1.20,z,2.9,2.11,.12,wood);box(0,1.20,z-Math.sign(z)*.07,.88,2.11,.06,wall);
    for(const x of [-.48,.48])box(x,1.3,z-Math.sign(z)*.12,.035,2.35,.035,brass);
    // Close the curved end above the wall, hiding the source's exterior-only
    // dashboard backing without raising a flat wall through the rounded roof.
    const p=[],uv=[];
    for(let i=0;i<20;i++){
      const a=-1.415+i*2.83/20,b=a+2.83/20,ay=2.73-.48*Math.pow(a/1.415,2),by=2.73-.48*Math.pow(b/1.415,2);
      const points=[[a,2.22],[b,2.22],[a,ay],[a,ay],[b,2.22],[b,by]];
      if(z>0)points.reverse();
      for(const [x,y]of points){p.push(x,y,z-Math.sign(z)*.065);uv.push(x/.9,y/1.8);}
    }
    const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(p,3));cap.setAttribute('uv',new T.Float32BufferAttribute(uv,2));cap.computeVertexNormals();cap.setIndex(Array.from({length:p.length/3},(_,i)=>i));add(cap,wood);
  }
  for(const z of [-5.8,-.3,5.1]){box(0,2.65,z,.34,.08,1.3,steel);box(0,2.60,z,.24,.025,1.14,glow);}
  for(const z of doorCenters)for(const side of [-1,1]){
    bar(new T.Vector3(side*.75,.15,z+1.12),new T.Vector3(side*.75,2.55,z+1.12),.035,brass);
    solids.push(new T.Box3(new T.Vector3(side*.75-.045,0,z+1.075),new T.Vector3(side*.75+.045,2.7,z+1.165)));
  }
  // Both platform-facing doorways are usable; bridge the wider outer gap too.
  for(const z of doorCenters)for(const side of [-1,1]){
    box(side*1.72,.075,z,.5,.13,1.8,steel);box(side*2.21,-.10,z,.5,.14,1.8,steel);
    if(side<0)box(-2.8,-.211,z,.72,.07,1.8,steel);
  }
  // Warm, low energy cabin light; no additive sheet across the characters.
  for(const z of doorCenters)lightBudget.add(0xffd4a3,3.5,4.8,group,new T.Vector3(0,2.3,z));
  for(const [material,parts] of batches){const mesh=new T.Mesh(mergeGeometries(parts),material);parts.forEach(g=>g.dispose());
    mesh.name='train-cabin';mesh.receiveShadow=true;mesh.userData.impactKind='wall';group.add(mesh);zones.push(mesh);}
  return solids;
}
