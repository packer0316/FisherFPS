import * as T from 'three';

// The grenade's large forearm turns expose linear-skinning volume loss at the
// wrist and thumb web. Blend rigid bone transforms with dual quaternions instead.
// This rig has a common uniform scale; it has no bone stretching or shear.
// Only this viewmodel material uses the palette (two texels per existing bone).
export function grenadeSkinning(mesh) {
  const count=mesh.skeleton.bones.length, data=new Float32Array(count*8);
  const texture=new T.DataTexture(data,count*2,1,T.RGBAFormat,T.FloatType);
  texture.magFilter=texture.minFilter=T.NearestFilter;
  texture.generateMipmaps=false;
  const matrix=new T.Matrix4(), position=new T.Vector3(), rotation=new T.Quaternion(), scale=new T.Vector3();
  const uniforms={grenadeBones:{value:texture},grenadeRigScale:{value:1}};
  const previous=mesh.onBeforeRender;
  mesh.onBeforeRender=function(...args) {
    previous.apply(this,args);
    // WebGLObjects updates the skeleton before invoking the mesh render hook.
    const matrices=mesh.skeleton.boneMatrices;
    for(let i=0;i<count;i++){
      matrix.fromArray(matrices,i*16).decompose(position,rotation,scale);
      const {x,y,z,w}=rotation,tx=position.x,ty=position.y,tz=position.z,j=i*8;
      data[j]=x;data[j+1]=y;data[j+2]=z;data[j+3]=w;
      data[j+4]=.5*(tx*w+ty*z-tz*y);
      data[j+5]=.5*(-tx*z+ty*w+tz*x);
      data[j+6]=.5*(tx*y-ty*x+tz*w);
      data[j+7]=-.5*(tx*x+ty*y+tz*z);
      if(!i)uniforms.grenadeRigScale.value=scale.x;
    }
    texture.needsUpdate=true;
  };
  mesh.material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader
      .replace('#include <skinning_pars_vertex>',`
        uniform mat4 bindMatrix;
        uniform mat4 bindMatrixInverse;
        uniform highp sampler2D grenadeBones;
        uniform float grenadeRigScale;
        vec3 grenadeRotate(vec4 q,vec3 p){return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
        vec3 grenadeNormal(vec4 q,vec3 n){
          return mat3(bindMatrixInverse)*grenadeRotate(q,mat3(bindMatrix)*n);
        }`)
      .replace('#include <skinbase_vertex>',`
        vec4 gr0=texelFetch(grenadeBones,ivec2(int(skinIndex.x)*2,0),0);
        vec4 gr1=texelFetch(grenadeBones,ivec2(int(skinIndex.y)*2,0),0);
        vec4 gr2=texelFetch(grenadeBones,ivec2(int(skinIndex.z)*2,0),0);
        vec4 gr3=texelFetch(grenadeBones,ivec2(int(skinIndex.w)*2,0),0);
        vec4 gw=skinWeight*vec4(1.0,dot(gr0,gr1)<0.0?-1.0:1.0,dot(gr0,gr2)<0.0?-1.0:1.0,dot(gr0,gr3)<0.0?-1.0:1.0);
        vec4 gReal=gr0*gw.x+gr1*gw.y+gr2*gw.z+gr3*gw.w;
        vec4 gDual=texelFetch(grenadeBones,ivec2(int(skinIndex.x)*2+1,0),0)*gw.x
          +texelFetch(grenadeBones,ivec2(int(skinIndex.y)*2+1,0),0)*gw.y
          +texelFetch(grenadeBones,ivec2(int(skinIndex.z)*2+1,0),0)*gw.z
          +texelFetch(grenadeBones,ivec2(int(skinIndex.w)*2+1,0),0)*gw.w;
        float gLength=max(length(gReal),0.00001);
        gReal/=gLength;gDual/=gLength;
        vec3 gTranslation=2.0*(gReal.w*gDual.xyz-gDual.w*gReal.xyz+cross(gReal.xyz,gDual.xyz));`)
      .replace('#include <skinnormal_vertex>',`
        objectNormal=grenadeNormal(gReal,objectNormal);
        #ifdef USE_TANGENT
          objectTangent=grenadeNormal(gReal,objectTangent);
        #endif`)
      .replace('#include <skinning_vertex>',`
        vec3 gPoint=(bindMatrix*vec4(transformed,1.0)).xyz*grenadeRigScale;
        transformed=(bindMatrixInverse*vec4(grenadeRotate(gReal,gPoint)+gTranslation,1.0)).xyz;`);
  };
  mesh.material.customProgramCacheKey=()=>'grenade-volume-skinning-v1';
  mesh.material.addEventListener('dispose',()=>texture.dispose());
}
