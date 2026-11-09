import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Real DAVID/3DWP sculpture scan, CC BY-SA 4.0. Full attribution and adaptation
// details travel with the local GLB assets in public/castle/statues/cherub/.
export async function loadCastleCherubs(scene,zones,coarse) {
  const asset=await new GLTFLoader().loadAsync('/castle/statues/cherub/cherub'+(coarse?'-mobile':'')+'.glb');
  asset.scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(asset.scene),centre=bounds.getCenter(new T.Vector3());
  const height=bounds.max.y-bounds.min.y,placements=[];
  for(const side of [-1,1])for(const z of [-16,0,16])
    placements.push({x:side*21.18,y:4.0,z,yaw:-side*Math.PI/2,size:2.7,depth:.35});
  for(const side of [-1,1])placements.push({x:side*12.9,y:9.15,z:-27.0,yaw:0,size:3.55,depth:.35});
  asset.scene.traverse(o=>{
    if(!o.isMesh)return;
    const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
    // A three-quarter portrait keeps the bird, face and both carved wings legible.
    geometry.translate(-centre.x,-bounds.min.y,-centre.z).scale(1/height,1/height,1/height).rotateY(-Math.PI/2+.45);
    const material=o.material.clone();material.color.set(0xd8d0bf);
    material.roughness=.64;material.metalness=.015;material.envMapIntensity=.9;
    material.normalScale.set(.8,.8);if(material.normalMap)material.normalMap.anisotropy=coarse?2:4;
    const mesh=new T.InstancedMesh(geometry,material,placements.length),dummy=new T.Object3D();
    placements.forEach(({x,y,z,yaw,size,depth},i)=>{
      dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(size,size,size*depth);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.name='castle-scanned-cherub-reliefs';mesh.castShadow=mesh.receiveShadow=true;
    mesh.userData.impactKind='wall';scene.add(mesh);zones.push(mesh);
  });
}
