import * as T from 'three';

// Sculpture and relief are baked into the existing material/bay batches. Keep the
// centre aisle clear: the four monuments occupy the outer eight metres only.
export const castleMonuments = Object.freeze(
  [-1, 1].flatMap(side => [-20, 10].map(z => ({x: side * 17.2, z, side, height: z < 0 ? 9.2 : 8.4}))),
);
export const castleBraziers = Object.freeze([
  ...castleMonuments.map(p=>({x:p.x,y:1.78,z:p.z+3.15})),
  {x:-7.5,y:0,z:-24},{x:7.5,y:0,z:-24},
]);

export function addCastleGrandeur({add,box,cyl,tube,ring,solid,surfaces,coarse}) {
  const {stone,shadowStone,gold,bronze}=surfaces;
  const dummy=new T.Object3D();
  for(const {x,z,side,height} of castleMonuments) {
    for(const [y,w,h,d,m] of [[.18,8,.36,8,shadowStone],[.42,7.7,.12,7.7,gold],[.94,7.2,.92,7.2,shadowStone],[1.47,7.65,.14,7.65,gold],[1.66,7.8,.24,7.8,stone]])
      box(x,y,z,w,h,d,m);
    solid(x,.89,z,8,1.78,8);
    for(const dx of [-3.1,3.1])for(const dz of [-3.1,3.1]) {
      cyl(x+dx,.92,z+dz,.16,.85,bronze,.22,10);
    }
    // Beaded aureoles echo classical gilded frames without radiating spikes.
    const cy=height+1.2,cz=z-.8;
    for(const [r,t,m] of [[1.65,.11,gold],[1.9,.065,bronze],[2.08,.04,gold]])ring(x,cy,cz,r,t,m);
    for(let i=0;i<28;i++) {
      const a=i*Math.PI/14;
      add(new T.SphereGeometry(.065,8,6).translate(x+Math.cos(a)*1.9,cy+Math.sin(a)*1.9,cz+.08),gold);
    }
  }
  // Six wall-mounted winged memorials, with deep medallions and hanging swags.
  for(const side of [-1,1])for(const z of [-16,0,16]) {
    dummy.position.set(side*21.42,4.8,z);dummy.rotation.set(0,-side*Math.PI/2,0);dummy.updateMatrix();

    for(const [r,t,m] of [[1.42,.14,stone],[1.24,.065,gold],[1.62,.045,bronze]]) {
      const g=new T.TorusGeometry(r,t,8,48).translate(0,.52,.1).applyMatrix4(dummy.matrix);add(g,m);
    }
    for(const sign of [-1,1]) {
      const pts=Array.from({length:29},(_,i)=>{
        const t=i/28,point=new T.Vector3(sign*(.3+t*2.65),-1.3-Math.sin(t*Math.PI)*.65,.3);
        return point.applyMatrix4(dummy.matrix).toArray();
      });tube(pts,.085,gold,28);
    }
  }
  // Two monumental reliefs flank the rose window, high above the altar.
  for(const side of [-1,1]) {
    ring(side*12.9,11,-27.10,1.85,.13,gold);
    ring(side*12.9,11,-27.15,2.08,.11,stone);
  }
  for(const {x,y,z} of castleBraziers) {
    cyl(x,y+.10,z,.48,.2,shadowStone,.55,16);
    cyl(x,y+.64,z,.12,.94,gold,.25,12);
    cyl(x,y+1.10,z,.48,.22,bronze,.16,20);
    add(new T.TorusGeometry(.47,.065,6,24).rotateX(Math.PI/2).translate(x,y+1.24,z),gold);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      tube([[x+Math.cos(a)*.31,y+1,z+Math.sin(a)*.31],[x+Math.cos(a)*.55,y+1.45,z+Math.sin(a)*.55]],.035,gold,2);
    }
  }
}
