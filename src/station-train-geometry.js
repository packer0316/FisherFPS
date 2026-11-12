import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function roundedPanel(w,h,r) {
  const s=new T.Shape(),x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}

export function cabinBuilder(coarse) {
  const batches=new Map();
  function add(geometry,material,projectUv=true) {
    // RoundedBox/Extrude are non-indexed; normalise all inputs once before
    // merging. Every opaque material becomes one draw for the whole carriage.
    let g=geometry;
    if(g.index){g=geometry.toNonIndexed();geometry.dispose();}
    const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;projectUv&&i<p.count;i++){
      const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
      uv.setXY(i,ay>ax&&ay>az?p.getX(i):ax>az?p.getZ(i):p.getX(i),ay>ax&&ay>az?p.getZ(i):p.getY(i));
      const scale=material.userData.cabinUvScale;if(scale)uv.setXY(i,uv.getX(i)*scale[0],uv.getY(i)*scale[1]);
    }
    if(!batches.has(material))batches.set(material,[]);batches.get(material).push(g);
  }
  function box(x,y,z,w,h,d,m,r=0) {
    // Sub-centimetre slots need a silhouette, not hundreds of bevel triangles.
    const g=r>=.012?new RoundedBoxGeometry(w,h,d,!coarse&&r>=.025?2:1,Math.min(r,w/2,h/2,d/2)):new T.BoxGeometry(w,h,d);
    add(g.translate(x,y,z),m);
  }
  function bar(a,b,r,m) {
    const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from);
    const pose=new T.Matrix4().compose(from.add(to).multiplyScalar(.5),
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize()),new T.Vector3(1,1,1));
    add(new T.CylinderGeometry(r,r,delta.length(),coarse?8:12).applyMatrix4(pose),m);
  }
  function tube(points,r,m,closed=false) {
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed,'centripetal');
    const fine=r<=.01;
    add(new T.TubeGeometry(curve,points.length*(fine?2:coarse?3:4),r,fine?5:coarse?6:10,closed),m);
  }
  function panel(w,h,r,d,position,rotation,m,border=0) {
    const shape=roundedPanel(w,h,r);
    if(border)shape.holes.push(roundedPanel(w-border*2,h-border*2,Math.max(.012,r-border)));
    const g=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:1,steps:1,
      bevelSize:.003,bevelThickness:.003,curveSegments:coarse?3:6});
    g.translate(0,0,-d/2).rotateY(rotation).translate(...position);add(g,m);
  }
  function finish() {
    return [...batches].map(([material,parts])=>{
      const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
      geometry.computeBoundingBox();geometry.computeBoundingSphere();return {geometry,material};
    });
  }
  return {add,box,bar,tube,panel,finish};
}

// One continuous seat profile: rolled front, shallow pan, lumbar transition and
// reclined back. Rounded extrusion caps also soften each individual seat edge.
export function cabinSeatGeometry(coarse,shell=false) {
  const s=new T.Shape();
  s.moveTo(.755,.535);
  s.bezierCurveTo(.674,.54,.665,.624,.715,.65);
  s.bezierCurveTo(.84,.687,1.04,.608,1.16,.65);
  s.bezierCurveTo(1.245,.68,1.235,.80,1.24,.90);
  s.bezierCurveTo(1.25,1.06,1.292,1.28,1.307,1.405);
  s.quadraticCurveTo(1.312,1.446,1.345,1.444);
  s.quadraticCurveTo(1.387,1.442,1.384,1.397);
  s.lineTo(1.32,.66);s.quadraticCurveTo(1.31,.557,1.20,.543);
  s.quadraticCurveTo(.99,.51,.755,.535);s.closePath();
  const width=shell?.512:.458;
  const g=new T.ExtrudeGeometry(s,{depth:width-.036,steps:1,bevelEnabled:true,bevelSegments:coarse?1:2,
    bevelSize:shell?.012:.018,bevelThickness:.018,curveSegments:coarse?4:7});
  g.translate(shell?.019:0,shell?-.027:0,-(width-.036)/2);
  // The centre of the cushion dips slightly; sides support the passenger.
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),bowl=Math.max(0,1-(z/(width/2))**2);
    if(x<1.2&&y>.60)p.setY(i,y-.014*bowl);
    else if(y>.82&&x<1.36)p.setX(i,x+.012*bowl);
  }
  // Welding before rebuilding normals avoids the planar strips produced by
  // computeVertexNormals on a non-indexed extrusion. UVs are projected later.
  g.deleteAttribute('normal');g.deleteAttribute('uv');
  const smooth=mergeVertices(g,1e-5);g.dispose();smooth.computeVertexNormals();
  smooth.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(smooth.attributes.position.count*2),2));
  return smooth;
}
