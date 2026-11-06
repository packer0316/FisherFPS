
import * as T from 'three';

// All candles use one instanced flame draw and one instanced soft halo draw.
// No particle allocation, texture fetch, per-candle light or extra render target.
export function makeCandleFlames(scene,origins,clock,lights) {
  const g=new T.PlaneGeometry(1,1).translate(0,.5,0);
  const seeds=new Float32Array(origins.length);
  const mesh=new T.InstancedMesh(g,new T.ShaderMaterial({
    uniforms:{clock},transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`attribute float candleSeed;uniform float clock;varying vec2 flameUv;varying float seed;
      void main(){
        seed=candleSeed;flameUv=uv;
        float t=clock;
        float flicker=.90+.065*sin(t*8.1+seed)+.045*sin(t*13.7+seed*3.);
        vec4 centre=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        float width=length(instanceMatrix[0].xyz),height=length(instanceMatrix[1].xyz);
        // Billboard the flame while keeping its root attached to the wick.
        centre.xy+=vec2(position.x*width,position.y*height*flicker);
        gl_Position=projectionMatrix*centre;
      }`,
    fragmentShader:`uniform float clock;varying vec2 flameUv;varying float seed;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
      void main(){
        float y=flameUv.y;
        float t=clock*2.8+seed;
        float sway=sin(t*1.3+y*3.)*.10+sin(t*2.9+y*6.)*.055;
        float x=(flameUv.x-.5)-sway*y*y;
        float eddy=noise(vec2(x*11.+seed,y*5.-t*1.8));
        float turbulence=(eddy-.5)*.085*y;
        float width=(.016+.29*pow(sin(clamp(y,0.,1.)*3.14159),.8))*(1.-y*.74);
        float d=abs(x+turbulence)/max(.009,width);
        float aa=max(fwidth(d)*1.3,.085);
        float outer=1.-smoothstep(.72-aa,1.14+aa,d);
        float base=smoothstep(0.,.035,y),tip=1.-smoothstep(.89,1.,y);
        // Continuous volume density avoids the hard white stripe of a flat flame icon.
        float core=exp(-d*d*3.4)*(1.-smoothstep(.55,.99,y));
        float heat=.86+.14*noise(vec2(x*7.+seed,y*9.-t*2.4));
        vec3 color=mix(vec3(1.65,.32,.026),vec3(4.2,2.65,.86),core*heat);
        color*=mix(.52,1.,smoothstep(.02,.25,y));
        float blueBase=(1.-smoothstep(.04,.23,y))*(1.-smoothstep(.45,.95,d));
        color=mix(color,vec3(.12,.31,1.05),blueBase*.92);
        float hollow=exp(-pow(x/.085,2.))*(1.-smoothstep(.03,.27,y));
        float alpha=outer*base*tip*(.72+.22*core)*(1.-hollow*.72);
        if(alpha<.008)discard;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }),origins.length);
  const dummy=new T.Object3D();
  origins.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(.19,.235+(i%5)*.009,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);seeds[i]=i*2.39996;});
  g.setAttribute('candleSeed',new T.InstancedBufferAttribute(seeds,1));
  mesh.name='castle-candle-flames';mesh.frustumCulled=false;mesh.renderOrder=2;scene.add(mesh);
  const haloGeometry=g.clone(),haloMaterial=new T.ShaderMaterial({
    uniforms:{clock},transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`attribute float candleSeed;uniform float clock;varying vec2 p;varying float glow;
      void main(){p=uv*2.-1.;glow=.84+.08*sin(clock*7.+candleSeed)+.04*sin(clock*13.+candleSeed);
        vec4 c=modelViewMatrix*instanceMatrix*vec4(0.,.10,0.,1.);
        c.xy+=vec2(position.x,(position.y-.5))*vec2(.42,.46);
        gl_Position=projectionMatrix*c;}`,
    fragmentShader:`varying vec2 p;varying float glow;void main(){
      float a=exp(-dot(p,p)*5.)*.075*glow;
      gl_FragColor=vec4(.95,.29,.045,a);
    }`
  });
  const halo=new T.InstancedMesh(haloGeometry,haloMaterial,origins.length);
  origins.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.setScalar(1);dummy.updateMatrix();halo.setMatrixAt(i,dummy.matrix);});
  halo.name='castle-candle-glows';halo.frustumCulled=false;halo.renderOrder=1;scene.add(halo);
  const base=lights.map(l=>l.intensity);
  scene.onBeforeRender=()=>{
    for(let i=0;i<lights.length;i++){
      const t=clock.value,s=i*2.73;
      lights[i].intensity=base[i]*(.94+.045*Math.sin(t*3.7+s)+.025*Math.sin(t*8.3+s*2));
    }
  };
}
