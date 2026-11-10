import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tau=Math.PI*2;

function canvasTexture(canvas){
  const map=new T.CanvasTexture(canvas);
  map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return map;
}

// All lettering shares one small atlas and one draw, including the side dial.
// The marks describe this fictional game optic, not a calibrated ballistic sight.
export function addOpticMarkings(scope){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const c=canvas.getContext('2d');c.fillStyle='#d0d2c9';c.textAlign='center';c.textBaseline='middle';
  c.font='600 84px sans-serif';c.fillText('DUSTLINE',512,84);
  c.font='42px monospace';c.fillText('T24   /   REFLEX OPTIC',512,172);
  function circleTicks(cx,cy,radius,count){
    c.save();c.translate(cx,cy);c.lineWidth=3;c.strokeStyle='#c1c5bd';
    for(let i=0;i<count;i++){
      const a=i*tau/count,len=i%5===0?28:13;
      c.beginPath();c.moveTo(Math.sin(a)*(radius-len),-Math.cos(a)*(radius-len));
      c.lineTo(Math.sin(a)*radius,-Math.cos(a)*radius);c.stroke();
    }
    c.restore();
  }
  circleTicks(256,768,220,60);
  c.font='34px monospace';
  for(let i=0;i<12;i++){
    const a=i*tau/12;c.fillText(String(i),256+Math.sin(a)*162,768-Math.cos(a)*162);
  }
  c.font='bold 49px sans-serif';c.fillText('T24',256,750);
  c.font='25px monospace';c.fillText('INTENSITY',256,799);
  // Four muted witness marks keep the ocular ring quiet in ADS. Tiny circular
  // lettering and dense ticks alias at gameplay size; put readable labels on
  // the side dial and housing instead.
  c.save();c.translate(768,768);c.strokeStyle='rgba(147,158,154,.40)';c.lineWidth=4;
  for(let i=0;i<4;i++){
    const a=i*tau/4;c.beginPath();c.moveTo(Math.sin(a)*247,Math.cos(a)*247);
    c.lineTo(Math.sin(a)*239,Math.cos(a)*239);c.stroke();
  }
  c.restore();
  const map=canvasTexture(canvas),parts=[];
  function add(g,region,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    const uv=g.attributes.uv,[u,v,w,h]=region;
    for(let i=0;i<uv.count;i++)uv.setXY(i,u+uv.getX(i)*w,v+uv.getY(i)*h);
    g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);parts.push(g);
  }
  // A wrap follows the left side of the tube instead of floating on a flat card.
  const vertices=[],uvs=[],indices=[];
  for(let i=0;i<=20;i++){
    const t=i/20,a=Math.PI-.67-.40*t;
    for(const [u,z]of [[0,-.025],[1,.010]]){
      vertices.push(.02327*Math.cos(a),.02327*Math.sin(a),z);uvs.push(u,t);
    }
    if(i){const k=i*2;indices.push(k-2,k-1,k,k-1,k+1,k);}
  }
  const wrap=new T.BufferGeometry();wrap.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  wrap.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));wrap.setIndex(indices);wrap.computeVertexNormals();
  add(wrap,[0,.75,1,.25]);
  add(new T.CircleGeometry(.0110,64),[0,0,.5,.5],-.0373,.003,-.010,0,-Math.PI/2);
  add(new T.RingGeometry(.0237,.0258,96),[.5,0,.5,.5],0,0,.04466);
  const material=new T.MeshBasicMaterial({map,transparent:true,opacity:.76,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  const mesh=new T.Mesh(mergeGeometries(parts,false),material);mesh.name='OpticEngravings';scope.add(mesh);
  parts.forEach(p=>p.dispose());
}

function curvedLens(radius,sag){
  const vertices=[0,0,sag],uv=[.5,.5],indices=[],segments=64,rings=6;
  for(let ring=1;ring<=rings;ring++)for(let i=0;i<=segments;i++){
    const r=ring/rings,a=i*tau/segments,x=Math.cos(a)*r,y=Math.sin(a)*r;
    vertices.push(x*radius,y*radius,sag*(1-r*r));uv.push(x*.5+.5,y*.5+.5);
  }
  for(let i=0;i<segments;i++)indices.push(0,1+i,2+i);
  for(let ring=1;ring<rings;ring++)for(let i=0;i<segments;i++){
    const a=1+(ring-1)*(segments+1)+i,b=a+segments+1;
    indices.push(a,b,b+1,a,b+1,a+1);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function addOpticGlass(scope){
  const glass=new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
    uniforms:{coatingWarm:{value:0}},
    vertexShader:`varying vec2 lensUv; varying vec3 eyeLocal;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);
        eyeLocal=vec3(dot(modelViewMatrix[0].xyz,-mv.xyz),dot(modelViewMatrix[1].xyz,-mv.xyz),dot(modelViewMatrix[2].xyz,-mv.xyz));
        lensUv=uv*2.0-1.0;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec2 lensUv; varying vec3 eyeLocal; uniform float coatingWarm;
      void main(){
        vec3 eye=normalize(eyeLocal),normal=normalize(vec3(lensUv*.12,1.0));
        float radius=length(lensUv),edge=smoothstep(.72,1.0,radius);
        float fresnel=pow(1.0-abs(dot(normal,eye)),3.0);
        float oblique=smoothstep(.10,.65,length(eye.xy));
        float band=exp(-pow((lensUv.y-.35*lensUv.x-.38-eye.y*.8)/.19,2.0));
        float secondary=exp(-pow((lensUv.y+.5*lensUv.x+.56+eye.x*.5)/.26,2.0));
        float tint=smoothstep(-.75,.8,lensUv.y+.25*lensUv.x+eye.y*.6);
        vec3 cool=mix(vec3(.025,.18,.17),vec3(.19,.30,.47),tint);
        vec3 warm=mix(vec3(.26,.12,.025),vec3(.58,.29,.07),tint);
        vec3 color=mix(cool,warm,coatingWarm);
        color+=vec3(.25,.33,.34)*band*oblique;
        color+=vec3(.09,.04,.18)*secondary*oblique;
        float alpha=.024+edge*.12+fresnel*.26+oblique*(.055+.15*band+.045*secondary);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`,
  });
  const ocular=new T.Mesh(curvedLens(.02245,.0011),glass);ocular.name='CoatedOcularLens';ocular.position.z=.034;ocular.renderOrder=2;scope.add(ocular);
  const objectiveMaterial=glass.clone();objectiveMaterial.uniforms.coatingWarm.value=1;
  const objective=new T.Mesh(curvedLens(.02355,-.0008),objectiveMaterial);
  objective.name='CoatedObjectiveLens';objective.position.z=-.040;objective.renderOrder=1;scope.add(objective);

  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d');c.translate(256,256);c.lineCap='butt';
  function stroke(x0,y0,x1,y1,width=2){
    c.lineWidth=width;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();
  }
  c.strokeStyle='rgba(13,21,22,.88)';
  for(const side of [-1,1]){
    stroke(side*42,0,side*186,0);stroke(0,side*44,0,side*184);
    for(let i=1;i<=3;i++)stroke(side*(62+i*32),-5,side*(62+i*32),5,1.6);
  }
  c.font='19px monospace';c.fillStyle='rgba(13,21,22,.78)';c.textBaseline='middle';
  for(let i=1;i<=3;i++){
    const y=60+i*32;stroke(-6-i*4,y,6+i*4,y,1.6);c.fillText(String(i*2),18+i*4,y);
  }
  // An open central ring keeps the target readable; the red dot remains at the
  // existing aim axis and inherits the original ADS fade through material.opacity.
  c.strokeStyle='rgba(238,78,46,.9)';c.lineWidth=2.7;
  for(let i=0;i<4;i++){c.beginPath();c.arc(0,0,28,i*Math.PI/2+.17,(i+1)*Math.PI/2-.17);c.stroke();}
  const halo=c.createRadialGradient(0,0,0,0,0,13);halo.addColorStop(0,'rgba(255,87,53,.8)');halo.addColorStop(1,'rgba(255,74,34,0)');
  c.fillStyle=halo;c.fillRect(-13,-13,26,26);c.fillStyle='#ff583b';c.beginPath();c.arc(0,0,3.8,0,tau);c.fill();
  const reticle=new T.Mesh(new T.PlaneGeometry(.0415,.0415),new T.MeshBasicMaterial({map:canvasTexture(canvas),transparent:true,depthWrite:false,toneMapped:false}));
  reticle.name='RedDot';reticle.position.z=-.035;reticle.renderOrder=3;scope.add(reticle);
  return reticle;
}
