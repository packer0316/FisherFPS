import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The two inset side windows belong to the original Ceiling mesh. Coordinates
// are measured after its bind pose and the station's +24 m scene translation.
const windowX=18.12,windowZ=-12.673,baseY=7.98,width=5.5,height=2.86;
const slope=.65,drift=.38;
const apertureGLSL=`
  float stationAperture(vec2 uv,float travel){
    float x=uv.x*2.-1.,top=.27+.73*sqrt(max(0.,1.-x*x));
    float e=.07+travel*.006+max(fwidth(uv.x),fwidth(uv.y));
    float outline=smoothstep(0.,e,uv.x)*smoothstep(0.,e,1.-uv.x)*smoothstep(0.,e,uv.y)*(1.-smoothstep(top-e,top,uv.y));
    vec2 grid=abs(fract(uv*vec2(14.,4.)+.5)-.5);
    float blur=min(.32,.08+travel*.014);
    float bars=smoothstep(.01,blur,grid.x)*smoothstep(.01,blur,grid.y);
    return outline*mix(.72,1.,bars);
  }`;

// A projected aperture in the existing material pass, not a floating decal.
// The same world-space rays light the floor, railings and passing train roofs.
export function receiveStationWindowLight(material){
  if(!material.isMeshStandardMaterial||material.userData.stationWindowLight)return;
  material.userData.stationWindowLight=true;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=shader=>{
    previous.call(material,shader);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStationWindowWorld;')
      .replace('#include <project_vertex>','#include <project_vertex>\nvStationWindowWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vStationWindowWorld;${apertureGLSL}
      float stationWindowProjection(vec3 p,vec3 n,float side){
        float travel=${windowX}-p.x*side;
        vec2 uv=vec2((p.z-travel*${drift}-(${windowZ}))/${width}+.5,(p.y+travel*${slope}-${baseY})/${height});
        if(travel<0.||travel>24.||any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 0.;
        float facing=max(0.,dot(n,normalize(vec3(side,${slope},-${drift}))));
        return stationAperture(uv,travel)*facing*step(0.,travel)*(1.-smoothstep(15.,24.,travel));
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      vec3 windowNormal=inverseTransformDirection(normal,viewMatrix);
      float windowPool=stationWindowProjection(vStationWindowWorld,windowNormal,-1.)+stationWindowProjection(vStationWindowWorld,windowNormal,1.);
      // Illuminate the underlying material instead of replacing it with a bright
      // emissive window image. Rough stone keeps its own colour and grain.
      reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(.48,.67,.86)*windowPool;`);
  };
  material.customProgramCacheKey=()=>`station-window-projector-v2/${key}`;
}

export function makeStationWindowLight(scene,station,clock,coarse){
  const group=new T.Group();group.name='station-window-light';scene.add(group);
  function mesh(name,g,m){const o=new T.Mesh(g,m);o.name=name;o.raycast=()=>{};group.add(o);return o;}
  const shader=(fragment,extra={})=>new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,
    side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,toneMapped:false,uniforms:{clock},
    vertexShader:'varying vec2 p;varying float distanceToEye;void main(){p=uv;vec4 v=modelViewMatrix*vec4(position,1.);distanceToEye=length(v.xyz);gl_Position=projectionMatrix*v;}',
    fragmentShader:fragment,...extra});

  // Reuse the exact curved glass triangles and original atlas so the glow stays
  // behind the original arch frame instead of covering it with a white ellipse.
  const source=station.getObjectByName('Ceiling'),g=source.geometry,pos=[],uv=[],v=new T.Vector3();
  for(let i=0;i<g.index.count;i+=3){const points=[];
    for(let j=0;j<3;j++){const n=g.index.getX(i+j);v.fromBufferAttribute(g.attributes.position,n);source.applyBoneTransform(n,v);v.applyMatrix4(source.matrixWorld);points.push({n,p:v.clone()});}
    if(!points.every(({p})=>Math.abs(p.x)>16&&Math.abs(p.x)<18.4&&p.y>7.8&&p.y<11.3&&Math.abs(p.z-windowZ)<3.4))continue;
    for(const {n,p}of points){pos.push(p.x-Math.sign(p.x)*.012,p.y,p.z);uv.push(g.attributes.uv.getX(n),g.attributes.uv.getY(n));}
  }
  const glass=new T.BufferGeometry();glass.setAttribute('position',new T.Float32BufferAttribute(pos,3));glass.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  mesh('station-window-glass-glow',glass,shader(`varying vec2 p;uniform sampler2D atlas;
    void main(){vec3 c=texture2D(atlas,p).rgb;float pane=smoothstep(.18,.6,c.b)*smoothstep(.015,.12,c.b-c.r);
      gl_FragColor=vec4(.54,.76,1.,pane*.10);}`,{uniforms:{atlas:{value:source.material.map}}}));

  const ribbons=[],dust=[];let seed=27391;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(const side of [-1,1]){
    const start=new T.Vector3(side*(windowX-.12),baseY+height*.48,windowZ),direction=new T.Vector3(-side,-slope,drift),end=start.clone().addScaledVector(direction,(start.y-.12)/slope);
    for(let cross=0;cross<(coarse?1:2);cross++){
      const spread=cross?new T.Vector3(-side*.18,.78,0):new T.Vector3(0,0,width*.48);
      const vertices=[start.clone().sub(spread),start.clone().add(spread),end.clone().addScaledVector(spread,1.14),end.clone().addScaledVector(spread,-1.14)];
      const ribbon=new T.BufferGeometry();ribbon.setAttribute('position',new T.Float32BufferAttribute(vertices.flatMap(p=>p.toArray()),3));
      ribbon.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));ribbon.setIndex([0,1,2,0,2,3]);ribbons.push(ribbon);
    }
    for(let i=0;i<(coarse?24:64);i++){
      const t=.05+random()*.9,p=start.clone().lerp(end,t);p.z+=(random()-.5)*width*.8;p.y+=(random()-.5)*.8;
      dust.push(p.x,p.y,p.z);
    }
  }
  mesh('station-window-shafts',mergeGeometries(ribbons),shader(`varying vec2 p;varying float distanceToEye;uniform float clock;
    void main(){float edge=pow(max(0.,sin(p.x*3.14159265)),1.7);
      float lengthFade=smoothstep(0.,.04,p.y)*(1.-smoothstep(.45,1.,p.y));
      float streak=.74+.26*pow(.5+.5*sin(p.x*88.+sin(p.y*8.+clock*.08)*.3),3.);
      float veil=.92+.08*sin(p.y*13.-clock*.22+p.x*5.);
      gl_FragColor=vec4(.48,.69,1.,edge*lengthFade*streak*veil*.20*smoothstep(.25,1.5,distanceToEye));
    }`));ribbons.forEach(g=>g.dispose());
  const dustGeometry=new T.BufferGeometry();dustGeometry.setAttribute('position',new T.Float32BufferAttribute(dust,3));
  const motes=new T.Points(dustGeometry,shader(`varying float a;void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.63,.78,1.,exp(-r*r*28.)*a);}`,{
    vertexShader:`uniform float clock;varying float a;void main(){vec3 p=position;p.z+=sin(clock*.17+p.x)*.12;p.y+=sin(clock*.24+p.z)*.15;
      vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(32./max(1.,-v.z),1.,2.3);
      a=(.14+.09*sin(clock*.5+p.x))*smoothstep(.5,2.,length(v.xyz));}`}));
  motes.name='station-window-dust';motes.raycast=()=>{};group.add(motes);
  return group;
}
