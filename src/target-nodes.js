import * as T from 'three';

// Real scene nodes travel with the skinned actor; targeting never reads pixels,
// projected screen rectangles, or an enemy's camera-frustum visibility flag.
export function attachTargetNodes(actor) {
  if(actor.aimNodes)return actor.aimNodes;
  const bones=[];actor.model.traverse(n=>{if(n.isBone)bones.push(n);});
  const hips=bones.find(n=>/pelvis|hips/i.test(n.name));
  actor.aimNodes=[['chest',actor.chest,.62],['head',actor.head,.84],['hips',hips,.44]].map(([name,bone,height])=>{
    const node=new T.Object3D();node.name='auto-aim-'+name;
    (bone??actor.root).add(node);if(!bone)node.position.y=actor.height*height;
    node.userData.height=height;return node;
  });
  return actor.aimNodes;
}

export function targetNodePosition(actor,index,out) {
  const node=actor.aimNodes[index%actor.aimNodes.length];
  actor.root.updateWorldMatrix(true,true);node.getWorldPosition(out);
  const p=actor.root.position;
  if(out.y<p.y+.25||out.y>p.y+actor.height+.4||Math.hypot(out.x-p.x,out.z-p.z)>actor.height*.65)
    out.copy(p).addScaledVector(T.Object3D.DEFAULT_UP,actor.height*node.userData.height);
  return out;
}
