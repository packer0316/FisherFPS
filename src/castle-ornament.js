
import * as T from 'three';

// Built once. Every relief, moulding and rib joins the existing static batches;
// there are no per-frame mesh transforms or extra shadow-casting lights.
export function decorateCastle({scene,add,box,cyl,tube,ring,solid,surfaces,coarse}) {
  const {plaster,stone,shadowStone,panel,bronze,gold,iron,wood,glazing,roseGlass,ceiling,frescoMat}=surfaces;
  const spring=13.5,rise=6.5;
  const roofY=x=>spring+rise*Math.sqrt(Math.max(0,1-(x/22)**2));
  function arch(w,h,leg) {
    const p=new T.Shape();p.moveTo(-w/2,0);p.lineTo(w/2,0);p.lineTo(w/2,leg);
    p.bezierCurveTo(w/2,leg+(h-leg)*.48,w*.18,h-.22,0,h);
    p.bezierCurveTo(-w*.18,h-.22,-w/2,leg+(h-leg)*.48,-w/2,leg);p.closePath();return p;
  }
  function wallFace(shape,side,z,y,depth,material,normalized=false) {
    const g=new T.ShapeGeometry(shape,24);
    if(normalized){
      g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position,uv=g.attributes.uv;
      for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x),(p.getY(i)-b.min.y)/(b.max.y-b.min.y));
    }
    add(g.rotateY(-side*Math.PI/2).translate(side*depth,y,z),material);
  }
  function wallCurve(points,side,z,y,depth,r,m,segments=30) {
    tube(points.map(([u,v])=>[side*depth,y+v,z+side*u]),r,m,segments);
  }
  function archBorder(w,h,leg,side,z,y,depth,r,m) {
    const pts=arch(w,h,leg).getPoints(18);wallCurve(pts.map(p=>[p.x,p.y]),side,z,y,depth,r,m,56);
  }
  function scroll(u,v,side,z,y,depth,size=.4) {
    const pts=[];
    for(let i=0;i<=24;i++){const a=i/24*Math.PI*2.1,r=size*(.12+.88*i/24);pts.push([u+Math.cos(a)*r,v+Math.sin(a)*r]);}
    wallCurve(pts,side,z,y,depth,.035,gold,22);
  }
  function reliefFlower(x,y,z,side,r=.4) {
    const pts=[];
    for(let i=0;i<=64;i++){const a=i*Math.PI/32,rr=r*(.75+.25*Math.cos(a*8));pts.push([side*x,y+Math.sin(a)*rr,z+Math.cos(a)*rr]);}
    tube(pts,.045,gold,64);cyl(side*(x-.05),y,z,.08,.08,bronze); // Small sculpted centre below the floral profile.
  }
  for(const side of [-1,1]) {
    box(side*22.7,8.5,0,1.4,17,58,plaster,true);
    box(side*21.88,1.25,0,.22,2.5,56,shadowStone);
    // Deep cornice profiles and a dentil course at the spring of the vault.
    for(const [y,d,h,m] of [[.12,.85,.24,stone],[.38,.58,.09,bronze],[2.42,.62,.14,gold],[2.62,.4,.10,stone],
      [8.13,.9,.16,stone],[8.34,.66,.12,gold],[8.52,.5,.1,stone],[14.30,.72,.18,gold],[14.53,.95,.23,stone]]) {
      box(side*(22-d/2),y,0,d,h,56,m);
    }
    for(let z=-27.6;z<28;z+=.64)box(side*21.54,14.13,z,.55,.31,.25,stone);
    for(let z=-24;z<=24;z+=8) {
      // Recessed silk-damask panels, outlined with real stone moulding.
      wallFace(arch(4.8,6.7,4.3),side,z,1.4,21.91,panel);
      archBorder(4.95,6.83,4.3,side,z,1.37,21.7,.13,shadowStone);
      archBorder(4.74,6.57,4.3,side,z,1.52,21.55,.065,gold);
      archBorder(4.48,6.3,4.2,side,z,1.64,21.57,.045,stone);
      // Wainscot below the niches; neighbouring panels alternate light and dark marble.
      for(const dz of [-3,3]){
        box(side*21.7,1.3,z+dz,.23,1.9,.8,wood);
        for(const dy of [.47,2.14])box(side*21.5,dy,z+dz,.12,.055,.67,gold);
        for(const oz of [-.34,.34])box(side*21.5,1.3,z+dz+oz,.12,1.65,.045,gold);
      }
      for(const dz of [-3.55,3.55]){
        // Fluted shafts: small geometric grooves survive grazing moonlight at close range.
        const g=new T.CylinderGeometry(.40,.48,7.05,64,1),p=g.attributes.position;
        for(let i=0;i<p.count;i++){
          const x=p.getX(i),zz=p.getZ(i),r=Math.hypot(x,zz);
          if(r<.01)continue;
          const fluting=1-.055*(.5+.5*Math.cos(Math.atan2(zz,x)*20));
          p.setX(i,x*fluting);p.setZ(i,zz*fluting);
        }
        g.computeVertexNormals();add(g.translate(side*21,4.15,z+dz),stone);
        for(const [y,r,h,m] of [[.18,.72,.36,shadowStone],[.41,.64,.1,gold],[.57,.54,.2,stone],
          [7.7,.55,.16,stone],[7.86,.62,.13,gold],[8.02,.72,.18,stone]])cyl(side*21,y,z+dz,r,h,m,r,24);
        for(const sign of [-1,1])scroll(sign*.34,0,side,z+dz,7.75,20.5,.23);
        for(let k=-2;k<=2;k++)wallCurve([[k*.13,0],[k*.25,.35],[k*.24,.54]],side,z+dz,7.4,20.58,.045,stone,10);
        solid(side*21,4,z+dz,1.05,8,1.05);
      }
      // Genuine lancet outline, twin inner lights and a quatrefoil in the crown.
      wallFace(arch(4.5,5.25,2.9),side,z,8.7,21.83,glazing,true);
      archBorder(4.85,5.5,3.0,side,z,8.57,21.61,.16,stone);
      archBorder(4.54,5.24,2.9,side,z,8.7,21.39,.075,gold);
      archBorder(4.24,4.98,2.85,side,z,8.82,21.36,.06,iron);
      for(const u of [-1.01,1.01]){
        const pts=arch(1.9,3.78,2.7).getPoints(14).map(p=>[p.x+u,p.y]);
        wallCurve(pts,side,z,8.88,21.32,.066,stone,44);
        for(const k of [-.42,.42])wallCurve([[u+k,.08],[u+k,2.65],[u,3.55]],side,z,8.88,21.31,.024,bronze,14);
      }
      wallCurve([[0,0],[0,3.7]],side,z,8.88,21.27,.10,stone,2);
      const q=[];
      for(let i=0;i<=64;i++){const a=i*Math.PI/32,r=.47+.13*Math.cos(a*4);q.push([Math.cos(a)*r,4.22+Math.sin(a)*r]);}
      wallCurve(q,side,z,8.87,21.28,.055,gold,48);
      box(side*21.43,8.67,z,.72,.16,5.05,stone);
      // Acanthus pediment at the top of each lower niche.
      for(const sign of [-1,1])scroll(sign*.6,0,side,z,7.75,21.1,.43);
      for(let j=-3;j<=3;j++)wallCurve([[0,0],[j*.13,.38],[j*.24,.64-Math.abs(j)*.04]],side,z,7.7,21.03,.035,stone,10);
      for(const dy of [1.35,1.5])box(side*20.7,dy,z,2.5,.14,2.55,dy>1.4?gold:shadowStone);
      box(side*20.7,.68,z,2.2,1.36,2.25,shadowStone,true);
      for(const oz of [-1.03,1.03])box(side*19.57,.75,z+oz,.12,.85,.07,gold);
    }
  }
  for(const z of [-28.6,28.6]) {
    const side=-Math.sign(z),face=z+side*.72;
    box(0,10,z,45,20,1.2,plaster,true);
    box(0,1.25,face,44,2.5,.16,shadowStone);
    for(const [y,h,d,m]of [[.18,.3,.6,stone],[2.55,.13,.45,gold],[8.3,.22,.65,stone],[8.48,.07,.7,gold],[13.55,.25,.8,stone]]) {
      if(z<0&&y>6)for(const x of [-13.65,13.65])box(x,y,face+side*d/2,16.7,h,d,m);
      else box(0,y,face+side*d/2,44,h,d,m);
    }
    for(const x of [-17,-10,10,17]){
      box(x,6.6,face,1.15,13.2,.8,stone);
      for(const y of [.4,8.0,12.8])box(x,y,face+side*.25,1.5,.25,1,gold);
    }
    // Large framed wall panels supply scale and an old-palace rhythm.
    for(const x of [-13.5,13.5,-20,20]){
      box(x,5.1,face+side*.14,4.7,4.5,.14,panel);
      for(const y of [2.89,7.31])box(x,y,face+side*.26,4.85,.10,.12,gold);
      for(const dx of [-2.4,2.4])box(x+dx,5.1,face+side*.26,.10,4.5,.12,gold);
      for(const dx of [-1.9,1.9])for(const y of [3.4,6.8])ring(x+dx,y,face+side*.31,.18,.025,gold);
    }
  }
  // The rose window is actual leaded stained glass surrounded by multiple carved orders.
  add(new T.CircleGeometry(4.55,96).translate(0,10.8,-27.91),roseGlass);
  for(const [r,t,m]of [[4.95,.22,stone],[4.73,.07,gold],[4.54,.12,shadowStone],[4.37,.065,gold],[2.75,.1,stone],[.85,.09,gold]])ring(0,10.8,-27.62,r,t,m);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    tube([[Math.cos(a)*.9,10.8+Math.sin(a)*.9,-27.49],[Math.cos(a)*4.4,10.8+Math.sin(a)*4.4,-27.49]],.066,stone,2);
    const petals=[];
    for(let j=0;j<=32;j++){
      const b=j*Math.PI/16,rr=.67+.11*Math.cos(b*4);
      petals.push([Math.cos(a)*3.4+Math.cos(b)*rr,10.8+Math.sin(a)*3.4+Math.sin(b)*rr,-27.43]);
    }tube(petals,.04,gold,32);
  }
  for(let i=0;i<48;i++){const a=i*Math.PI/24;add(new T.SphereGeometry(.075,7,5).translate(Math.cos(a)*4.76,10.8+Math.sin(a)*4.76,-27.41),gold);}
  // Carved double entrance doors behind the player.
  for(const x of [-1.55,1.55]){
    box(x,3.85,27.78,3.05,7.7,.28,wood);
    for(const y of [1.55,4.9,6.7]){
      box(x,y,27.57,2.45,y===4.9?2.6:1.35,.12,shadowStone);
      for(const dx of [-1.22,1.22])box(x+dx,y,27.45,.07,y===4.9?2.64:1.39,.09,gold);
      for(const dy of [-1,1])box(x,y+dy*(y===4.9?1.3:.68),27.45,2.5,.07,.09,gold);
    }
    ring(x*.25,3.3,27.30,.17,.035,bronze);
  }
  for(const x of [-3.35,3.35])box(x,4,27.5,.35,8,.5,stone);
  box(0,8.1,27.5,7.25,.4,.6,stone);
  // Curved ceiling substrate. Small cells sit below it, so their mouldings cast real shadows.
  const pv=[],uv=[],ix=[];
  for(let j=0;j<=1;j++)for(let i=0;i<=64;i++){
    const a=i*Math.PI/64;pv.push(22*Math.cos(a),spring+rise*Math.sin(a),(j-.5)*56);uv.push(i/8,j*12);
    if(j&&i){const b=65+i;ix.push(b,b-1,i-1,b,i-1,i);}
  }
  const vg=new T.BufferGeometry();vg.setAttribute('position',new T.Float32BufferAttribute(pv,3));vg.setAttribute('uv',new T.Float32BufferAttribute(uv,2));vg.setIndex(ix);vg.computeVertexNormals();add(vg,ceiling);
  function roofPoint(a,z,drop=.15) {return [22*Math.cos(a),spring+rise*Math.sin(a)-drop,z];}
  function roofCurve(points,r,material,drop=.15,segments=32) {tube(points.map(([a,z])=>roofPoint(a,z,drop)),r,material,segments);}
  for(let z=-28;z<=28;z+=8){
    const limit=Math.acos(8.5/22);
    for(const start of [0,Math.PI-limit]){
      const pts=Array.from({length:25},(_,i)=>roofPoint(start+i*limit/24,z,.22));
      tube(pts,.20,stone,32);tube(pts.map(([x,y,z])=>[x,y-.16,z]),.055,gold,32);
    }
  }
  for(let col=0;col<8;col++){
    if(col===3||col===4)continue; // The centre bay is reserved for the large oval frescos.
    const a0=col*Math.PI/8+.035,a1=(col+1)*Math.PI/8-.035;
    for(let row=0;row<7;row++){
      const z0=-28+row*8+.45,z1=z0+7.1;
      function frame(inset,drop,material,r) {
        const left=a0+inset,right=a1-inset,near=z0+inset*20,far=z1-inset*20;
        const pts=[];
        for(let i=0;i<9;i++)pts.push([left+(right-left)*i/8,near]);
        pts.push([right,far]);
        for(let i=1;i<=8;i++)pts.push([right-(right-left)*i/8,far]);
        pts.push([left,near]);roofCurve(pts,r,material,drop,38);
      }
      frame(0,.12,shadowStone,.16);frame(.012,.22,gold,.047);frame(.025,.17,stone,.065);
      const ac=(a0+a1)/2,zc=(z0+z1)/2;
      const flower=[];
      for(let i=0;i<=48;i++){
        const a=i*Math.PI/24,r=.46*(.75+.25*Math.cos(a*8));
        flower.push([ac+Math.cos(a)*r/19,zc+Math.sin(a)*r]);
      }roofCurve(flower,.038,gold,.24,48);
      // Curving leaf tips in the four corners of every coffer.
      for(const aa of [a0+.065,a1-.065])for(const zz of [z0+.75,z1-.75]){
        const sx=aa<ac?1:-1,sz=zz<zc?1:-1;
        roofCurve([[aa,zz],[aa+sx*.025,zz+sz*.2],[aa+sx*.012,zz+sz*.48],[aa+sx*.045,zz+sz*.7]],.03,bronze,.25,12);
      }
    }
  }
  // Three elliptical, surface-conforming fresco medallions; never a floating flat poster.
  for(const z of [-18,0,18]){
    const g=new T.CircleGeometry(1,96),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i)*7.6,zz=p.getY(i)*7.1;p.setXYZ(i,x,roofY(x)-.19,z+zz);}
    g.computeVertexNormals();add(g,frescoMat);
    for(const [rx,rz,r,drop,m]of [[7.85,7.35,.20,.22,stone],[7.65,7.15,.065,.35,gold],[8.1,7.58,.075,.2,bronze]]){
      const pts=Array.from({length:97},(_,i)=>{const a=i*Math.PI/48,x=Math.cos(a)*rx;return [x,roofY(x)-drop,z+Math.sin(a)*rz];});tube(pts,r,m,96);
    }
    for(let i=0;i<32;i++){
      const a=i*Math.PI/16,x=Math.cos(a)*7.9,zz=z+Math.sin(a)*7.4;
      add(new T.SphereGeometry(.085,7,5).translate(x,roofY(x)-.4,zz),gold);
    }
    // Raised acanthus flourishes around the oval at its four cardinal points.
    for(const sign of [-1,1])for(const flip of [-1,1]){
      const pts=Array.from({length:25},(_,i)=>{const a=i/24*Math.PI*1.7,r=.18+i/24*.75,x=sign*(7.55+Math.cos(a)*r);return [x,roofY(x)-.29,z+flip*(.9+Math.sin(a)*r)];});
      tube(pts,.06,gold,25);
    }
  }
}
