
import * as T from 'three';

// XZ geometry is shared by the telegraph, traveling contact front and impact VFX.
export function containsBossHazard(zone,p) {
  const x=p.x-zone.x,z=p.z-zone.z;
  if(zone.shape==='line') {
    const along=x*zone.dx+z*zone.dz;
    return along>=-1e-6 && along<=zone.length+1e-6 && Math.abs(x*zone.dz-z*zone.dx)<=zone.width/2;
  }
  const r2=x*x+z*z;
  return r2<=zone.radius**2+1e-6 && r2>=(zone.inner??0)**2-1e-6;
}

// Quakes pass under furniture, but stop at the interior perimeter.
export function clipBossLane(origin,aim,bounds,extra=6,maxLength=38) {
  const x=aim.x-origin.x,z=aim.z-origin.z,d=Math.hypot(x,z);
  const dx=d>.001?x/d:0,dz=d>.001?z/d:1;
  let length=Math.min(maxLength,Math.max(7,d+extra));
  for(const [p,v,b] of [[origin.x,dx,bounds.x-.45],[origin.z,dz,bounds.z-.45]]) {
    if(Math.abs(v)>.0001)length=Math.min(length,Math.max(.1,((v>0?b:-b)-p)/v));
  }
  return {shape:'line',x:origin.x,z:origin.z,dx,dz,length};
}

export function makeBossHazards(scene,{count=6,theme='bride'}={}) {
  const geometry=new T.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  const pool=Array.from({length:count},()=>{
    const uniforms={progress:{value:0},inner:{value:0},round:{value:1},impact:{value:0},
      front:{value:-1},tail:{value:0},clock:{value:0},fade:{value:1},violet:{value:theme==='bride'?1:0}};
    const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,
      vertexShader:'varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 p;uniform float progress,inner,round,impact,front,tail,clock,fade,violet;
      void main(){
        float d=round>.5?length(p):max(abs(p.x),abs(p.y));
        if(d>1.||d<inner)discard;
        float aa=max(fwidth(d)*1.5,.003);
        float edge=smoothstep(.95-aa,.98+aa,d);
        if(inner>0.)edge=max(edge,1.-smoothstep(inner,inner+.025+aa,d));
        float along=round>.5?(d-inner)/max(.001,1.-inner):(.5-p.y*.5);
        float sweep=1.-smoothstep(.012,.045,abs(along-progress));
        float arrow=abs(fract((p.y+abs(p.x)*.42)*5.+clock*.5)-.5);
        float stripe=1.-smoothstep(.055,.07,arrow);
        float ticks=(1.-smoothstep(.04,.07,abs(fract(atan(p.y,p.x)*7.64)-.5)))*smoothstep(.78,.81,d);
        float ink=mix(stripe,ticks,round);
        vec3 red=mix(vec3(.98,.055,.018),vec3(.85,.035,.25),violet);
        vec3 hot=mix(vec3(1.,.58,.12),vec3(.76,.32,1.),violet);
        float alpha=.18+.05*sin(clock*9.)+edge*.54+ink*.12+sweep*.22;
        if(front>=0.){
          float band=step(tail,along)*step(along,front);
          alpha=(along<tail?.045:.18)+edge*.23+band*.38;
          red=mix(red,hot,band);
        }
        gl_FragColor=vec4(red,clamp(alpha,0.,.87)*fade);
      }`});
    const mesh=new T.Mesh(geometry,material);mesh.visible=false;mesh.renderOrder=5;scene.add(mesh);
    return {mesh,uniforms,contact:{},active:false,age:0,delay:1,fired:false,hit:false,nextStep:0};
  });
  function clear(){for(const z of pool){z.active=false;z.mesh.visible=false;}}
  function mark(i,spec,delay) {
    const z=pool[i];
    Object.assign(z,{shape:'circle',radius:1,inner:0,dx:0,dz:1,width:1,length:1,linger:.42,
      duration:0,steps:1,kind:'blast',power:1,age:0,delay:Math.max(.001,delay),fired:false,hit:false,nextStep:0,active:true},spec);
    z.steps=Math.max(1,Math.floor(z.steps));
    z.mesh.visible=true;z.uniforms.progress.value=z.uniforms.impact.value=0;
    z.uniforms.front.value=-1;z.uniforms.tail.value=0;z.uniforms.fade.value=1;
    z.uniforms.round.value=z.shape==='line'?0:1;z.uniforms.inner.value=z.inner/z.radius;
    if(z.shape==='line') {
      z.mesh.position.set(z.x+z.dx*z.length/2,.045,z.z+z.dz*z.length/2);
      z.mesh.rotation.y=Math.atan2(z.dx,z.dz);z.mesh.scale.set(z.width,1,z.length);
    }else{
      z.mesh.position.set(z.x,.045,z.z);z.mesh.rotation.y=0;z.mesh.scale.set(z.radius*2,1,z.radius*2);
    }
    return z;
  }
  function update(dt,onImpact) {
    for(const z of pool) {
      if(!z.active)continue;
      z.age+=Math.max(0,dt);z.uniforms.clock.value+=dt;
      z.uniforms.progress.value=Math.min(1,z.age/z.delay);
      // Every crossed segment is processed, even after a slow frame. A consumed
      // segment never hurts again; controllers also cap one hit per entire wave.
      while(z.active && z.nextStep<z.steps && z.age+1e-7>=z.delay+z.duration*z.nextStep/z.steps) {
        const step=z.nextStep++,a=step/z.steps,b=(step+1)/z.steps,c=z.contact;
        Object.assign(c,{shape:z.shape,x:z.x,z:z.z,dx:z.dx,dz:z.dz,width:z.width,
          length:z.length,radius:z.radius,inner:z.inner,step});
        if(z.shape==='line'){
          c.x+=z.dx*z.length*a;c.z+=z.dz*z.length*a;c.length=z.length/z.steps;
        }else{
          c.inner=T.MathUtils.lerp(z.inner,z.radius,a);
          c.radius=T.MathUtils.lerp(z.inner,z.radius,b);
        }
        z.fired=true;z.uniforms.impact.value=1;z.uniforms.tail.value=a;z.uniforms.front.value=b;
        onImpact(z,c);
      }
      const end=z.delay+z.duration;
      z.uniforms.fade.value=1-Math.max(0,Math.min(1,(z.age-end)/z.linger));
      if(z.age>end+z.linger){z.active=false;z.mesh.visible=false;}
    }
  }
  return {pool,mark,update,clear};
}
