
import * as T from 'three';

// Geometric waves use the exact contact slice from boss-hazards. Expensive native
// bursts accent that front; fixed GPU/CPU pools own all short-lived ground FX.
export async function makeBossImpactEffects(scene,particles,theme) {
  const coarse=matchMedia('(pointer: coarse)').matches,violet=theme==='bride';
  const [noise,ring,fire]=await Promise.all([
    new T.TextureLoader().loadAsync('/effects/boss-impacts/Textures/tx_noise03_256.png'),
    new T.TextureLoader().loadAsync('/effects/boss-impacts/Textures/tx_shockring01_256.png'),
    new T.TextureLoader().loadAsync('/effects/boss-impacts/Textures/tx_fire_flipbook01_1024.png'),
    particles.loadBossImpacts(),
  ]);
  noise.wrapS=noise.wrapT=T.RepeatWrapping;
  const geometry=new T.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  const stains=Array.from({length:coarse?16:24},()=>{
    const uniforms={noise:{value:noise},ring:{value:ring},age:{value:0},round:{value:1},
      inner:{value:0},seed:{value:0},tint:{value:new T.Color(violet?0xa84aff:0xff7b26)}};
    const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
      blending:T.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-4,
      vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 uv0;uniform sampler2D noise,ring;uniform float age,round,inner,seed;uniform vec3 tint;
      void main(){
        vec2 p=uv0*2.-1.;float r=length(p);
        float edge=round>.5?r:max(abs(p.x),abs(p.y));
        if(edge>1.||(round>.5&&r<inner))discard;
        float n=texture2D(noise,p*1.3+vec2(seed,age*.2)).r;
        float n2=texture2D(noise,p*3.-vec2(age*.13,seed)).g;
        float life=pow(max(0.,1.-age),1.5);
        float rim=round>.5?pow(texture2D(ring,uv0).r,.65):smoothstep(.72,.97,abs(p.x));
        float seams=1.-smoothstep(.06,.16,abs(n-.5));
        float jagged=smoothstep(.22,.62,n*n2+.18);
        float heat=(seams*.35+jagged*.65+rim*.8)*life;
        float edgeFade=1.-smoothstep(.95,1.,edge);
        if(round>.5&&inner>0.)edgeFade*=smoothstep(inner,inner+.025,r);
        gl_FragColor=vec4(tint*(1.2+heat*.8),heat*.68*edgeFade);
      }`});
    const mesh=new T.Mesh(geometry,material);mesh.visible=false;mesh.renderOrder=6;scene.add(mesh);
    return {mesh,uniforms,age:0,life:.7};
  });
  let next=0;
  // One instanced draw for all animated fire / spectral plumes. The 4x4 source
  // flipbook is dissolved by low-frequency noise instead of a hard sprite edge.
  const plumeCount=coarse?12:24,plumeGeometry=new T.InstancedBufferGeometry();
  plumeGeometry.copy(new T.PlaneGeometry(1,1));
  const centers=new T.InstancedBufferAttribute(new Float32Array(plumeCount*3),3).setUsage(T.DynamicDrawUsage);
  const states=new T.InstancedBufferAttribute(new Float32Array(plumeCount*4),4).setUsage(T.DynamicDrawUsage);
  plumeGeometry.setAttribute('center',centers);plumeGeometry.setAttribute('state',states);
  plumeGeometry.instanceCount=plumeCount;
  const plumeMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{fire:{value:fire},noise:{value:noise},violet:{value:violet?1:0}},
    vertexShader:`attribute vec3 center;attribute vec4 state;varying vec2 uv0;varying vec4 data;
      void main(){uv0=uv;data=state;
        vec4 p=modelViewMatrix*vec4(center,1.);
        p.xy+=position.xy*state.yz;
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`varying vec2 uv0;varying vec4 data;uniform sampler2D fire,noise;uniform float violet;
      float frame(float n){
        vec2 cell=vec2(mod(n,4.),3.-floor(n/4.));
        return texture2D(fire,(cell+clamp(uv0,.004,.996))*.25).a;
      }
      void main(){
        if(data.x>=1.)discard;
        float f=min(15.,data.x*15.),a=mix(frame(floor(f)),frame(min(15.,floor(f)+1.)),fract(f));
        float n=texture2D(noise,uv0*2.+vec2(data.w,data.x*.45)).r;
        a*=smoothstep(data.x*.45,data.x*.45+.24,n);
        float heat=clamp(a*.8+(1.-uv0.y)*.35,0.,1.);
        vec3 edge=mix(vec3(1.,.16,.018),vec3(.34,.035,1.),violet);
        vec3 core=mix(vec3(1.,.86,.25),vec3(.52,.68,1.),violet);
        gl_FragColor=vec4(mix(edge,core,pow(heat,2.))*1.7,a*pow(1.-data.x,.8)*.85);
      }`});
  const plumes=new T.Mesh(plumeGeometry,plumeMaterial);plumes.name='Instanced boss fire flipbooks';
  plumes.frustumCulled=false;plumes.visible=false;scene.add(plumes);
  const plumePool=Array.from({length:plumeCount},()=>({age:2,life:.8,size:3,seed:Math.random()*9}));
  let plumeIndex=0;
  const capacity=coarse?72:128;
  const chips=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),new T.MeshStandardMaterial({
    color:violet?0x777287:0x8b8174,emissive:violet?0x160b21:0x160d06,roughness:.84,metalness:.08,flatShading:true,
  }),capacity);
  chips.name='Pooled boss impact fragments';chips.count=0;chips.visible=false;chips.frustumCulled=false;
  chips.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(chips);
  const stones=Array.from({length:capacity},()=>({age:9,life:1,position:new T.Vector3(),velocity:new T.Vector3(),rotation:new T.Euler(),size:0}));
  const lights=Array.from({length:2},()=>{
    const light=new T.PointLight(violet?0x995cff:0xff9a42,0,13,2);scene.add(light);
    return {light,age:2,life:.2,peak:0};
  });
  const point=new T.Vector3(),pose=new T.Object3D();
  let stoneIndex=0,lightIndex=0;
  function burst(wave,c) {
    const round=c.shape!=='line',slot=stains[next++%stains.length];
    slot.age=0;slot.life=round?.55:.85;
    slot.uniforms.age.value=0;slot.uniforms.round.value=round?1:0;
    slot.uniforms.inner.value=round?c.inner/c.radius:0;slot.uniforms.seed.value=Math.random()*8;
    slot.mesh.visible=true;
    if(round){
      slot.mesh.position.set(c.x,.065,c.z);slot.mesh.rotation.y=0;slot.mesh.scale.set(c.radius*2,1,c.radius*2);
    }else{
      slot.mesh.position.set(c.x+c.dx*c.length/2,.065,c.z+c.dz*c.length/2);
      slot.mesh.rotation.y=Math.atan2(c.dx,c.dz);slot.mesh.scale.set(c.width,1,c.length);
    }
    // No point flash in a hollow annulus: put bursts on its advancing edge.
    const nativeCount=round?(coarse?1:2):1;
    for(let i=0;i<nativeCount;i++){
      if(round&&c.inner>0){
        const a=c.step*2.4+i*Math.PI,r=(c.inner+c.radius)/2;
        point.set(c.x+Math.cos(a)*r,.12,c.z+Math.sin(a)*r);
      }else point.copy(slot.mesh.position).setY(.12);
      particles.bossImpact(theme,point,round?(c.inner>0?.48:.7):.72);
      const index=plumeIndex++%plumeCount,p=plumePool[index];
      p.age=0;p.life=violet?.64:.8;
      p.size=round?(c.inner>0?1.85:3.5):3.7;
      centers.setXYZ(index,point.x,p.size*.36,point.z);
      states.setXYZW(index,0,p.size,p.size*1.25,p.seed);
      plumes.visible=true;centers.needsUpdate=states.needsUpdate=true;
    }
    const lamp=lights[lightIndex++%lights.length];lamp.age=0;lamp.peak=violet?23:38;
    lamp.light.position.copy(point).y=1.4;lamp.light.intensity=lamp.peak;
    const count=coarse?6:11;
    for(let i=0;i<count;i++){
      const s=stones[stoneIndex++%capacity],a=(i+Math.random())*Math.PI*2/count;
      if(round){
        const r=T.MathUtils.lerp(c.inner,c.radius,Math.random());
        s.position.set(c.x+Math.cos(a)*r,.12,c.z+Math.sin(a)*r);
      }else{
        const along=Math.random()*c.length,side=(Math.random()-.5)*c.width;
        s.position.set(c.x+c.dx*along+c.dz*side,.12,c.z+c.dz*along-c.dx*side);
      }
      const speed=1.2+Math.random()*2.8;
      s.velocity.set(Math.cos(a)*speed,2.5+Math.random()*4.5,Math.sin(a)*speed);
      s.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
      s.size=.035+Math.random()*.11;s.age=0;s.life=1.05+Math.random()*.5;
    }
  }
  function update(dt){
    let livePlumes=0;
    for(let i=0;i<plumeCount;i++){
      const p=plumePool[i];p.age+=dt;
      const t=Math.min(1,p.age/p.life);
      states.setXYZW(i,t,p.size*(1+t*.2),p.size*(1.1+t*.3),p.seed);
      if(t<1)livePlumes++;
    }
    states.needsUpdate=true;plumes.visible=livePlumes>0;
    for(const s of stains){
      if(!s.mesh.visible)continue;
      s.age+=dt;s.uniforms.age.value=Math.min(1,s.age/s.life);
      if(s.age>=s.life)s.mesh.visible=false;
    }
    for(const s of lights){
      s.age+=dt;s.light.intensity=s.peak*Math.max(0,1-s.age/s.life)**2;
    }
    let count=0;
    for(const s of stones){
      if(s.age>=s.life)continue;
      s.age+=dt;s.velocity.y-=9.81*dt;s.position.addScaledVector(s.velocity,dt);
      if(s.position.y<s.size){s.position.y=s.size;s.velocity.y=Math.abs(s.velocity.y)*.23;s.velocity.x*=.75;s.velocity.z*=.75;}
      s.rotation.x+=dt*4.5;s.rotation.z+=dt*3;
      pose.position.copy(s.position);pose.rotation.copy(s.rotation);
      pose.scale.set(1.3,.7,1).multiplyScalar(s.size*Math.min(1,(s.life-s.age)/.3));
      pose.updateMatrix();chips.setMatrixAt(count++,pose.matrix);
    }
    chips.count=count;chips.visible=count>0;if(count)chips.instanceMatrix.needsUpdate=true;
  }
  function clear(){
    for(let i=0;i<plumeCount;i++){plumePool[i].age=2;states.setX(i,1);}
    plumes.visible=false;states.needsUpdate=true;
    for(const s of stains)s.mesh.visible=false;
    for(const s of stones)s.age=s.life;
    for(const s of lights){s.age=s.life;s.light.intensity=0;}
    chips.count=0;chips.visible=false;particles.stopBossImpacts();
  }
  return {burst,update,clear};
}
