import * as T from 'three';
import { cabinLayout } from './station-transit.js';
import { trainCabinMaterials } from './station-train-materials.js';
import { cabinBuilder, cabinSeatGeometry } from './station-train-geometry.js';

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

// Build once per arena, then share the finished geometry and textures between
// both trains. The original door openings, seat colliders and floor stay fixed.
export function createTrainInterior(options) {
  const coarse=options.detail.coarse,m=trainCabinMaterials(options),solids=[];
  const {add,box,bar,tube,panel,finish}=cabinBuilder(coarse);
  const ends=[cabinLayout.minZ-.05,cabinLayout.maxZ+.05],center=(ends[0]+ends[1])/2,length=ends[1]-ends[0];
  const doorCenters=cabinLayout.doors,gaps=doorCenters.map(z=>[z-.90,z+.90]);
  const roofY=x=>2.73-.48*(x/1.415)**2;
  function label(w,h,position,yaw,rect) {
    const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(rect[0]+uv.getX(i)*rect[2])/1024,1-(rect[1]+(1-uv.getY(i))*rect[3])/512);
    add(g.rotateY(yaw).translate(...position),m.label,false);
  }
  box(0,.075,center,2.95,.13,length,m.floor);
  // Flush welded seams, contrasting aisle borders and coving, rather than
  // raised transverse metal bars under the passenger's feet.
  for(let z=ends[0]+2.15;z<ends[1];z+=2.15)box(0,.142,z,2.83,.003,.007,m.dark);
  for(const side of [-1,1])box(side*.62,.143,center,.035,.004,length,m.sign);
  const roofPosition=[],roofUv=[],roofIndex=[];
  for(let i=0;i<=28;i++){
    const x=-1.415+i*2.83/28;
    for(const z of ends){roofPosition.push(x,roofY(x),z);roofUv.push(x,z);}
    if(i<28){const n=i*2;roofIndex.push(n,n+2,n+1,n+1,n+2,n+3);}
  }
  const roof=new T.BufferGeometry();roof.setAttribute('position',new T.Float32BufferAttribute(roofPosition,3));
  roof.setAttribute('uv',new T.Float32BufferAttribute(roofUv,2));roof.setIndex(roofIndex);roof.computeVertexNormals();add(roof,m.ceiling);
  const cushion=cabinSeatGeometry(coarse),shell=cabinSeatGeometry(coarse,true);
  for(const side of [-1,1]){
    let start=ends[0];
    for(const [a,b] of [...gaps,[ends[1],ends[1]]]){
      if(a>start){
        const z=(start+a)/2,d=a-start;
        box(side*1.455,1.20,z,.08,2.11,d,m.wall);
        box(side*1.396,.43,z,.05,.53,d,m.wood,.018);
        box(side*1.377,.195,z,.07,.11,d,m.steel,.018);
        box(side*1.388,.74,z,.045,.075,d,m.steel,.016);
        box(side*1.385,2.195,z,.065,.085,d,m.wood,.025);
        box(side*1.346,2.232,z,.04,.025,d,m.brass,.01);
        for(const edge of [start+.035,a-.035])box(side*1.409,1.46,edge,.012,1.36,.012,m.dark);
        // Slim access-panel seams and captive screws beside the window bays.
        for(const edge of [start+.16,a-.16]){
          box(side*1.41,1.51,edge,.008,1.12,.005,m.dark);
          for(const y of [.91,2.06])bar([side*1.407,y,edge],[side*1.399,y,edge],.009,m.steel);
        }
      }start=b;
    }
    for(const z of doorCenters){
      // Rolled stainless jambs, dark weather seals and recessed door motor cover.
      for(const dz of [-.90,.90]){
        box(side*1.42,1.20,z+dz,.11,2.11,.07,m.steel,.024);
        box(side*1.401,1.19,z+dz*.963,.03,2.03,.015,m.dark,.006);
      }
      box(side*1.405,2.225,z,.17,.18,1.89,m.wall,.045);
      box(side*1.313,2.140,z,.016,.012,1.61,m.dark);
      box(side*1.298,2.317,z,.014,.012,.24,m.glow);
      label(1.35,.15,[side*1.308,2.225,z],-side*Math.PI/2,[0,0,1024,132]);
      // Call panel and its inset push button, clear of the opening.
      const controlZ=z+1.015;
      panel(.13,.29,.025,.018,[side*1.385,1.19,controlZ],-side*Math.PI/2,m.steel);
      bar([side*1.368,1.22,controlZ],[side*1.343,1.22,controlZ],.032,m.sign);
      bar([side*1.339,1.22,controlZ],[side*1.333,1.22,controlZ],.019,m.dark);
    }
    for(const z of [-5.65,-.3,5.1]){
      // Individual shaped seats have rolled lips and a subtle lumbar bowl.
      for(let i=0;i<5;i++){
        const seatZ=z+(i-2)*.52;
        add(shell.clone().rotateY(side<0?Math.PI:0).translate(0,0,seatZ),m.wall);
        add(cushion.clone().rotateY(side<0?Math.PI:0).translate(0,0,seatZ),m.seat);
        // Dark piping catches a thin edge without a bright stripe down the back.
        for(const dz of [-.225,.225])tube([
          [side*.728,.648,seatZ+dz],[side*.88,.65,seatZ+dz],[side*1.15,.646,seatZ+dz],
          [side*1.238,.82,seatZ+dz],[side*1.27,1.11,seatZ+dz],[side*1.312,1.405,seatZ+dz],
        ],.006,m.seam);
      }
      box(side*1.14,.35,z,.41,.36,2.50,m.wood,.05);
      box(side*.915,.35,z,.024,.19,2.27,m.steel,.01);
      for(let n=0;n<28;n++)box(side*.9,.35,z-1.04+n*.077,.007,.075,.024,m.dark,.006);
      for(const dz of [-1.12,1.12])box(side*1.13,.205,z+dz,.36,.09,.17,m.dark,.025);
      // Nested rounded window reveal: powder-coated surround / rubber / glass /
      // fine stainless lip. The smoked pane stays opaque like the source shell.
      const yaw=-side*Math.PI/2;
      panel(2.47,.82,.13,.028,[side*1.396,1.82,z],yaw,m.dark);
      panel(2.42,.77,.11,.026,[side*1.369,1.82,z],yaw,m.steel,.044);
      panel(2.32,.67,.078,.018,[side*1.366,1.82,z],yaw,m.glass);
      panel(2.34,.69,.085,.013,[side*1.349,1.82,z],yaw,m.dark,.014);
      box(side*1.338,1.447,z,.105,.045,2.36,m.steel,.021);
      bar([side*1.34,1.52,z],[side*1.34,2.12,z],.012,m.steel);
      // Same conservative collision envelope as the previous benches.
      solids.push(new T.Box3(new T.Vector3(side*1.05-.39,0,z-1.39),new T.Vector3(side*1.05+.39,1.65,z+1.39)));
      for(const dz of [-1.35,1.35]){
        const end=z+dz;
        tube([[side*1.34,.58,end],[side*.84,.58,end],[side*.735,.62,end],[side*.717,.88,end],[side*.75,.975,end],
          [side*.85,.99,end],[side*1.22,.99,end],[side*1.34,1.03,end]],.024,m.steel);
        box(side*1.04,1.006,end,.32,.042,.066,m.wood,.021);
        for(const y of [.58,1.03])bar([side*1.355,y,end],[side*1.38,y,end],.042,m.steel);
      }
      // Curved luggage-rack ends and finer crossbars, with real tube sections.
      for(const x of [.91,1.09,1.27])bar([side*x,2.10,z-1.28],[side*x,2.10,z+1.28],.014,m.steel);
      for(let i=0;i<12;i++)bar([side*.91,2.10,z-1.21+i*.22],[side*1.38,2.10,z-1.21+i*.22],.009,m.steel);
      for(const dz of [-1.28,1.28])tube([[side*.91,2.10,z+dz],[side*.9,2.17,z+dz],
        [side*1.0,2.21,z+dz],[side*1.30,2.21,z+dz],[side*1.38,2.20,z+dz]],.02,m.steel);
      bar([side*.91,2.105,z-1.28],[side*.91,2.105,z+1.28],.025,m.brass);
    }
    bar([side*.60,2.445,ends[0]+.20],[side*.60,2.445,ends[1]-.20],.025,m.steel);
    for(const z of [-5.65,-.3,5.1]){
      bar([side*.60,2.445,z],[side*.60,roofY(.60)-.015,z],.022,m.steel);
      bar([side*.60,roofY(.60)-.025,z],[side*.60,roofY(.60)-.012,z],.054,m.steel);
    }
    for(let z=-6.3;z<6;z+=.83){
      box(side*.6,2.357,z,.028,.16,.043,m.dark,.012);
      bar([side*.6,2.29,z-.025],[side*.6,2.29,z+.025],.027,m.steel);
      // Moulded triangular straps, like commuter trains, with rounded corners.
      tube([[side*.60,2.278,z],[side*.51,2.15,z],[side*.512,2.11,z],
        [side*.60,2.096,z],[side*.688,2.11,z],[side*.69,2.15,z]],.017,m.wall,true);
    }
    // Continuous softened roof shoulders and indirect light channels.
    for(const x of [.98,1.20])bar([side*x,roofY(x)-.012,ends[0]],[side*x,roofY(x)-.012,ends[1]],.014,m.steel);
    for(const z of [-5.65,-.3,5.1]){
      box(side*.85,2.548,z,.115,.042,2.46,m.steel,.018);
      box(side*.85,2.522,z,.066,.015,2.34,m.glow,.007);
    }
  }
  cushion.dispose();shell.dispose();
  for(const z of ends){
    const inward=-Math.sign(z),yaw=z>0?Math.PI:0;
    box(0,1.20,z,2.9,2.11,.12,m.wall);
    panel(.99,2.1,.10,.05,[0,1.20,z+inward*.075],yaw,m.dark);
    panel(.93,2.04,.08,.055,[0,1.20,z+inward*.105],yaw,m.wood);
    panel(.67,.70,.12,.026,[0,1.62,z+inward*.143],yaw,m.steel);
    panel(.59,.62,.09,.016,[0,1.62,z+inward*.161],yaw,m.glass);
    panel(.75,.28,.035,.024,[0,.40,z+inward*.143],yaw,m.steel);
    for(let i=0;i<5;i++)box(0,.32+i*.037,z+inward*.16,.63,.009,.006,m.dark);
    tube([[.32,.96,z+inward*.145],[.32,.98,z+inward*.21],[.32,1.14,z+inward*.21],[.32,1.16,z+inward*.145]],.016,m.steel);
    for(const y of [.65,1.82])box(-.443,y,z+inward*.145,.026,.10,.035,m.steel,.01);
    for(const x of [-1.08,1.08]){
      panel(.38,.24,.025,.018,[x,1.74,z+inward*.073],yaw,m.steel);
      for(let i=0;i<5;i++)box(x,1.665+i*.036,z+inward*.088,.29,.009,.007,m.dark);
    }
    // End cap follows the existing roof instead of breaking through its shell.
    const p=[],uv=[];
    for(let i=0;i<24;i++){
      const a=-1.415+i*2.83/24,b=a+2.83/24;
      const points=[[a,2.22],[b,2.22],[a,roofY(a)],[a,roofY(a)],[b,2.22],[b,roofY(b)]];
      if(z>0)points.reverse();
      for(const [x,y]of points){p.push(x,y,z+inward*.065);uv.push(x,y);}
    }
    const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(p,3));
    cap.setAttribute('uv',new T.Float32BufferAttribute(uv,2));cap.computeVertexNormals();add(cap,m.ceiling);
    panel(.55,.14,.025,.02,[0,2.31,z+inward*.08],yaw,m.dark);
    panel(.25,.18,.012,.015,[-.93,1.26,z+inward*.075],yaw,m.steel);
    label(.23,.158,[-.93,1.26,z+inward*.087],yaw,[16,270,318,210]);
    label(.65,.20,[.97,2.06,z+inward*.064],yaw,[340,269,684,213]);
    label(.70,.088,[0,.70,z+inward*.139],yaw,[0,145,520,97]);
    // A simple recessed exit arrow remains readable at gameplay distance.
    box(0,2.31,z+inward*.097,.22,.018,.007,m.glow);
    for(const dy of [-1,1])bar([-.11,2.31,z+inward*.097],[-.065,2.31+dy*.042,z+inward*.097],.008,m.glow);
  }
  for(const z of [-5.65,-.3,5.1]){
    box(0,2.685,z,.43,.065,1.20,m.wall,.03);
    box(0,2.644,z,.34,.018,1.06,m.dark,.009);
    for(let i=0;i<14;i++)box(0,2.630,z-.46+i*.07,.31,.012,.018,m.steel,.006);
    for(const dz of [-1.38,1.38]){
      tube(Array.from({length:7},(_,i)=>{const x=-.42+i*.14;return [x,roofY(x)-.004,z+dz];}),.004,m.dark);
      for(const x of [-.33,.33])bar([x,roofY(x)-.003,z+dz],[x,roofY(x)-.012,z+dz],.012,m.steel);
    }
  }
  for(const z of doorCenters)for(const side of [-1,1]){
    const p=z+1.12;
    bar([side*.75,.15,p],[side*.75,2.55,p],.031,m.steel);
    for(const y of [.16,2.54])bar([side*.75,y-.018,p],[side*.75,y+.018,p],.065,m.steel);
    for(const y of [.26,1.96])bar([side*.75,y-.012,p],[side*.75,y+.012,p],.037,m.brass);
    solids.push(new T.Box3(new T.Vector3(side*.75-.045,0,z+1.075),new T.Vector3(side*.75+.045,2.7,z+1.165)));
  }
  // Footboard elevations and extents are retained for the transit controller.
  for(const z of doorCenters)for(const side of [-1,1]){
    box(side*1.72,.075,z,.5,.13,1.8,m.steel,.012);
    box(side*2.21,-.10,z,.5,.14,1.8,m.steel,.012);
    if(side<0)box(-2.8,-.211,z,.72,.07,1.8,m.steel,.012);
    for(let i=0;i<6;i++)box(side*(1.51+i*.07),.143,z,.012,.005,1.75,m.dark);
    box(side*1.50,.144,z,.038,.006,1.76,m.sign);
    box(side*2.43,-.026,z,.032,.008,1.76,m.sign);
  }
  const assets=finish();
  return function attachTrainInterior(group,zones,lightBudget) {
    for(const z of doorCenters)lightBudget.add(0xffe2bd,3.5,4.8,group,new T.Vector3(0,2.3,z));
    for(const {geometry,material} of assets){
      const mesh=new T.Mesh(geometry,material);mesh.name='train-cabin';mesh.receiveShadow=true;
      mesh.userData.impactKind='wall';group.add(mesh);zones.push(mesh);
    }
    return solids.map(b=>b.clone());
  };
}
