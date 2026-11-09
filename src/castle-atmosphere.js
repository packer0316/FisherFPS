import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { castleBraziers } from './castle-grandeur.js';

const noiseGLSL=`
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
`;
const planeVertex='varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

// All motion comes from the arena clock, so pause and level switching freeze it.
// Local additive glows avoid a full-resolution bloom/blur pass on mobile GPUs.
export function makeCastleAtmosphere(scene,clock,coarse,glass) {
  let seed=918273;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const mesh=(name,g,m)=>{const o=new T.Mesh(g,m);o.name=name;scene.add(o);return o;};
  const shader=(fragment,extra={})=>new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{clock},
    vertexShader:planeVertex,fragmentShader:fragment,...extra,
  });

  // Stained-glass caustics stretch across the aisle, anchored in world space.
  const pools=[];
  for(const side of [-1,1])for(const z of [-16,0,16]) {
    const g=new T.PlaneGeometry(10,8).rotateX(-Math.PI/2).rotateY(side*.38).translate(side*11,.018,z+3);
    pools.push(g);
  }
  mesh('castle-window-caustics',mergeGeometries(pools),shader(`
    varying vec2 p;uniform sampler2D glassMap;
    void main(){
      vec2 uv=vec2(p.x,p.y);vec3 stained=texture2D(glassMap,uv).rgb;
      float edge=smoothstep(0.,.14,p.x)*smoothstep(0.,.14,1.-p.x)*smoothstep(0.,.13,p.y)*smoothstep(0.,.13,1.-p.y);
      float lead=step(.025,abs(p.x-.5));
      vec3 color=stained*vec3(.48,.64,1.0)+pow(stained,vec3(2.))*vec3(.3,.14,.35);
      gl_FragColor=vec4(color,edge*lead*.30);
    }`,{uniforms:{glassMap:{value:glass}},blending:T.AdditiveBlending}));
  pools.forEach(g=>g.dispose());

  // Tapered, crossed ribbons suggest depth from both the nave and the side aisles.
  const shafts=[];
  for(const side of [-1,1])for(const z of [-16,0,16])for(let cross=0;cross<(coarse?1:2);cross++) {
    const source=new T.Vector3(side*21.1,11.7,z),end=new T.Vector3(side*7.5,.3,z+7);
    const spread=cross?new T.Vector3(side*.6,1.0,0):new T.Vector3(0,0,1.6);
    const vertices=[source.clone().sub(spread),source.clone().add(spread),end.clone().addScaledVector(spread,1.8),end.clone().addScaledVector(spread,-1.8)];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices.flatMap(v=>v.toArray()),3));
    g.setAttribute('uv',new T.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));g.setIndex([0,1,2,0,2,3]);shafts.push(g);
  }
  mesh('castle-moon-shafts',mergeGeometries(shafts),shader(`
    varying vec2 p;uniform float clock;${noiseGLSL}
    void main(){float veil=.72+.28*noise(vec2(p.x*6.,p.y*9.-clock*.035));
      float edge=pow(max(0.,sin(p.x*3.14159)),2.5)*pow(max(0.,sin(p.y*3.14159)),.65);
      gl_FragColor=vec4(.35,.49,.9,edge*veil*.075);
    }`,{blending:T.AdditiveBlending}));
  shafts.forEach(g=>g.dispose());

  const mist=shader(`varying vec2 p;uniform float clock;${noiseGLSL}
    void main(){vec2 uv=p*vec2(7.,10.)+vec2(clock*.018,-clock*.009);
      float n=noise(uv)*.6+noise(uv*2.7+4.)*.28+noise(uv*5.1)*.12;
      float edge=smoothstep(0.,.15,p.x)*smoothstep(0.,.15,1.-p.x)*smoothstep(0.,.15,p.y)*smoothstep(0.,.15,1.-p.y);
      float wisps=smoothstep(.4,.8,n);gl_FragColor=vec4(.35,.39,.55,wisps*edge*.15);
    }`);
  for(let i=0;i<(coarse?2:3);i++) {
    const g=new T.PlaneGeometry(41,53).rotateX(-Math.PI/2).translate(0,.16+i*.25,0);
    // Different UV offsets prevent stacked identical silhouettes.
    const uv=g.attributes.uv;for(let j=0;j<uv.count;j++)uv.setXY(j,i%2?1-uv.getX(j):uv.getX(j),i%2?1-uv.getY(j):uv.getY(j));
    mesh('castle-ground-mist-'+i,g,mist);
  }

  const motes=new T.BufferGeometry(),positions=new Float32Array((coarse?110:260)*3);
  for(let i=0;i<positions.length;i+=3){positions[i]=(rand()-.5)*40;positions[i+1]=rand()*16+.4;positions[i+2]=(rand()-.5)*52;}
  motes.setAttribute('position',new T.BufferAttribute(positions,3));
  const dust=new T.Points(motes,shader(`varying float a;varying float tint;
    void main(){float d=length(gl_PointCoord-.5);float glow=exp(-d*d*22.);
      gl_FragColor=vec4(mix(vec3(.48,.64,1.),vec3(1.,.66,.32),tint),glow*a);}`,
    {blending:T.AdditiveBlending,vertexShader:`uniform float clock;varying float a;varying float tint;
      void main(){vec3 p=position;p.x+=sin(clock*.27+p.y)*.65;p.z+=cos(clock*.19+p.x)*.5;p.y+=sin(clock*.4+p.z)*.3;
        vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(48./max(1.,-v.z),1.,4.);
        a=.18+.16*pow(.5+.5*sin(clock*1.3+p.x+p.y),3.);tint=step(.3,sin(p.z*3.));}` }));
  dust.name='castle-soul-motes';scene.add(dust);

  const petalCount=coarse?48:100,g=new T.PlaneGeometry(.14,.23),seeds=new Float32Array(petalCount);
  const petals=new T.InstancedMesh(g,shader(`varying vec2 p;varying float shade;
    void main(){vec2 q=p*2.-1.;float edge=1.-smoothstep(.72,1.,length(q*vec2(1.,.78))+.17*q.y);
      if(edge<.05)discard;vec3 color=mix(vec3(.17,.026,.10),vec3(.55,.13,.28),shade);
      gl_FragColor=vec4(color,edge*.9);}`,
    {vertexShader:`attribute float petalSeed;uniform float clock;varying vec2 p;varying float shade;
      void main(){p=uv;float s=petalSeed,t=clock*(.27+fract(s)*.14);
        vec3 centre=instanceMatrix[3].xyz;centre.y=.4+mod(centre.y-t*.6+100.,13.);
        centre.x+=sin(t+s)*1.2;centre.z+=cos(t*.7+s)*.8;
        float a=t*1.4+s,b=t*.8+s*2.;vec3 v=position;
        v.xy=mat2(cos(a),-sin(a),sin(a),cos(a))*v.xy;
        v.xz=mat2(cos(b),-sin(b),sin(b),cos(b))*v.xz;
        shade=.45+.55*abs(sin(b));gl_Position=projectionMatrix*modelViewMatrix*vec4(centre+v,1.);
      }`}),petalCount);
  const dummy=new T.Object3D();
  for(let i=0;i<petalCount;i++){dummy.position.set((rand()-.5)*37,rand()*13,(rand()-.5)*49);dummy.updateMatrix();petals.setMatrixAt(i,dummy.matrix);seeds[i]=rand()*20;}
  g.setAttribute('petalSeed',new T.InstancedBufferAttribute(seeds,1));
  petals.name='castle-falling-rose-petals';petals.frustumCulled=false;scene.add(petals);

  const fireGeometry=new T.PlaneGeometry(1.5,1.8).translate(0,.9,0);
  const fireSeeds=new Float32Array(castleBraziers.map((_,i)=>i*2.39996));
  fireGeometry.setAttribute('flameSeed',new T.InstancedBufferAttribute(fireSeeds,1));
  const fire=new T.InstancedMesh(fireGeometry,shader(`
    varying vec2 p;varying float seed;uniform float clock;${noiseGLSL}
    void main(){float y=p.y,t=clock*1.6+seed;
      float sway=sin(t*2.+y*7.)*.09*y;
      float x=p.x-.5-sway;
      float turbulence=(noise(vec2(x*7.+seed,y*4.-t*2.))-.5)*.17;
      float width=.28*pow(max(0.,sin(y*3.14159)),.7)*(1.-y*.6);
      float d=abs(x+turbulence*y)/max(.01,width);
      float density=(1.-smoothstep(.5,1.2,d))*smoothstep(0.,.06,y)*(1.-smoothstep(.8,1.,y));
      float core=exp(-d*d*4.)*(1.-y);
      vec3 color=mix(vec3(.26,.16,1.1),vec3(.55,1.6,2.1),core);
      gl_FragColor=vec4(color,density*.85);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,{vertexShader:`attribute float flameSeed;varying vec2 p;varying float seed;uniform float clock;
      void main(){p=uv;seed=flameSeed;vec4 v=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        v.xy+=position.xy*vec2(1.,.93+.07*sin(clock*4.+seed));gl_Position=projectionMatrix*v;}`}),castleBraziers.length);
  castleBraziers.forEach(({x,y,z},i)=>{dummy.position.set(x,y+1.25,z);dummy.updateMatrix();fire.setMatrixAt(i,dummy.matrix)});
  fire.name='castle-spirit-braziers';fire.frustumCulled=false;scene.add(fire);
  const glowGeometry=new T.PlaneGeometry(3.6,3.6);
  const glow=new T.InstancedMesh(glowGeometry,shader(`varying vec2 p;uniform float clock;
    void main(){vec2 q=p*2.-1.;float a=exp(-dot(q,q)*5.)*.10*(.94+.06*sin(clock*3.));
      gl_FragColor=vec4(.25,.42,1.,a);}`,
    {blending:T.AdditiveBlending,vertexShader:`varying vec2 p;void main(){p=uv;
      vec4 v=modelViewMatrix*instanceMatrix*vec4(0.,.55,0.,1.);v.xy+=position.xy;gl_Position=projectionMatrix*v;}`}),castleBraziers.length);
  glow.instanceMatrix.copy(fire.instanceMatrix);glow.name='castle-spirit-glows';glow.frustumCulled=false;scene.add(glow);

  mesh('castle-rose-aureole',new T.PlaneGeometry(13,13).translate(0,10.8,-27.34),shader(`
    varying vec2 p;uniform float clock;
    void main(){vec2 q=p*2.-1.;float r=length(q),a=atan(q.y,q.x);
      float corona=exp(-pow((r-.74)/.075,2.))*.19;
      float ray=pow(.5+.5*cos(a*24.),10.)*exp(-pow((r-.79)/.15,2.))*.14;
      float breath=.92+.08*sin(clock*.65);
      gl_FragColor=vec4(.48,.37,.9,(corona+ray)*breath);
    }`,{blending:T.AdditiveBlending}));
}
