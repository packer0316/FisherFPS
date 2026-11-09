import * as T from 'three';

// An original fictional prop, sized to the existing skinned glove's palm.
// No internal construction is modeled.
export function makeGrenadeModel(detailMap) {
  const root = new T.Group(); root.name = 'grenade-prop';
  const paint = new T.MeshStandardMaterial({ color: 0x596144, roughness: .69, metalness: .36 });
  if (detailMap) { paint.roughnessMap = detailMap; paint.bumpMap = detailMap; paint.bumpScale = .00045; }
  const steel = new T.MeshStandardMaterial({ color: 0x7f8584, roughness: .32, metalness: .88 });
  const dark = new T.MeshStandardMaterial({ color: 0x272d2b, roughness: .45, metalness: .72 });
  const add = (geometry, material, x=0, y=0, z=0, parent=root) => {
    const mesh = new T.Mesh(geometry, material); mesh.position.set(x,y,z); parent.add(mesh); return mesh;
  };
  const shell = add(new T.SphereGeometry(.047, 32, 24), paint); shell.scale.set(1,1.16,1);
  const seam = add(new T.TorusGeometry(.0468,.0009,6,48), dark); seam.rotation.x=Math.PI/2;
  add(new T.CylinderGeometry(.014,.022,.018,16), dark,0,.058);
  const lever = new T.Group(); lever.name='grenade-lever'; lever.rotation.y=Math.PI; root.add(lever);
  add(new T.BoxGeometry(.022,.006,.046),steel,0,.071,.012,lever);
  const side = add(new T.BoxGeometry(.022,.073,.005),steel,0,.036,.043,lever); side.rotation.x=-.18;
  add(new T.CylinderGeometry(.003,.003,.029,12),steel,0,.063,-.007).rotation.z=Math.PI/2;
  const pin = new T.Group(); pin.name='grenade-pin'; pin.position.set(-.025,.062,-.008); root.add(pin);
  const ring = add(new T.TorusGeometry(.013,.0016,8,32),steel,0,0,0,pin); ring.rotation.y=.35;
  // Short stencilled bands break up the silhouette without noisy fake grooves.
  const stripe = new T.MeshStandardMaterial({color:0xc4bb8a,roughness:.8,metalness:.1});
  const band=add(new T.CylinderGeometry(.0408,.044,.007,40,1,true,0,Math.PI*1.55),stripe,0,.027);
  band.rotation.y=.5;
  // A palm-sized prop lets the finger pads wrap its front. Keep the lever on
  // the palm side, rather than placing a broad plate in front of the thumb.
  root.traverse(node=>{node.position.multiplyScalar(.9);if(node.isMesh)node.geometry.scale(.9,.9,.9);});
  return { root, pin, lever };
}
