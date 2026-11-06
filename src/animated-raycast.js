
import { SkinnedMeshBVH, computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Separate posed BVH per actor, shared immutable render geometry. Cache each
// skinned vertex once per shot instead of skinning it again for every triangle.
export function makeAnimatedRaycast(model) {
  const records=[];
  model.updateWorldMatrix(true,true);
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(!mesh.isSkinnedMesh){
      if(!mesh.geometry.boundsTree)computeBoundsTree.call(mesh.geometry,{indirect:true});
      records.push({mesh});return;
    }
    const count=mesh.geometry.attributes.position.count;
    const positions=new Float64Array(count*3),stamps=new Uint32Array(count);
    const record={mesh,generation:1,tree:null};
    const proxy={isMesh:true,geometry:mesh.geometry,getVertexPosition(index,out){
      const at=index*3;
      if(stamps[index]!==record.generation){
        mesh.getVertexPosition(index,out);positions[at]=out.x;positions[at+1]=out.y;positions[at+2]=out.z;
        stamps[index]=record.generation;
      }else out.set(positions[at],positions[at+1],positions[at+2]);
      return out;
    }};
    // Never reorder a geometry shared by other cloned skeletons.
    record.tree=new SkinnedMeshBVH(proxy,{indirect:true,setBoundingBox:false,targetLeafSize:12});
    record.advance=()=>{
      record.generation=(record.generation+1)>>>0;
      if(!record.generation){stamps.fill(0);record.generation=1;}
      record.tree.refit();
    };
    records.push(record);
  });
  return (raycaster,hits)=>{
    for(const r of records){
      if(r.tree){
        r.advance();r.tree.raycastObject3D(r.mesh,raycaster,hits);
      }else acceleratedRaycast.call(r.mesh,raycaster,hits);
    }
  };
}
