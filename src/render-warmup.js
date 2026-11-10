
import { Vector4 } from 'three';

// Shader compilation alone does not upload textures or warm driver draw state.
// Issue a 1-pixel scissored draw while the loading screen/menu owns input, then
// wait asynchronously for the GPU. Nothing is added to the gameplay frame loop.
export async function warmRender(renderer,scene,camera) {
  const viewport=renderer.getViewport(new Vector4()),scissor=renderer.getScissor(new Vector4());
  const scissorTest=renderer.getScissorTest(),saved=[];
  scene.traverse(o=>{
    if(o.isLight)return;
    saved.push([o,o.visible,o.frustumCulled,o.isInstancedMesh?o.count:null]);
    o.visible=true;
    if(o.isMesh||o.isSprite||o.isPoints)o.frustumCulled=false;
    if(o.isInstancedMesh&&o.count===0)o.count=1;
  });
  try {
    renderer.setViewport(0,0,1,1);renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);
    // The shadow map only renders on request; without it, each species' skinned depth
    // material compiled the first time that monster cast a shadow during combat.
    renderer.shadowMap.needsUpdate=true;
    renderer.render(scene,camera);
  }finally{
    for(const [o,visible,cull,count] of saved){o.visible=visible;o.frustumCulled=cull;if(count!==null)o.count=count;}
    renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    renderer.shadowMap.needsUpdate=true;
  }
  const gl=renderer.getContext(),fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
  if(!fence)return;
  gl.flush();
  await new Promise((resolve,reject)=>{
    function check(){
      const status=gl.clientWaitSync(fence,0,0);
      if(status===gl.WAIT_FAILED||gl.isContextLost()){
        gl.deleteSync(fence);reject(new Error('WebGL warm-up interrupted'));return;
      }
      if(status===gl.TIMEOUT_EXPIRED){setTimeout(check,8);return;}
      gl.deleteSync(fence);resolve();
    }
    check();
  });
}
