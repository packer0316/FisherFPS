import * as T from 'three';
import { stationSurface } from './station-materials.js';

// Small, tileable colour/roughness pair. Millimetre-size rubber flecks survive
// mipmapping without the sparkling normal maps of a scratched metal floor.
function rubberFloor(coarse) {
  const size=coarse?256:512,colour=new Uint8Array(size*size*4),rough=new Uint8Array(colour.length);
  let seed=7319;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<colour.length;i+=4){
    const n=random()*6-3;
    colour.set([57+n,64+n,63+n,255],i);rough.set([0,196+random()*16,0,255],i);
  }
  for(let i=0;i<size*size*.075;i++){
    const x=Math.floor(random()*size),y=Math.floor(random()*size),radius=random()<.12?2:1;
    const value=random(),c=value<.26?[32,39,39]:value<.8?[82,88,83]:[124,125,109];
    for(let dy=0;dy<radius;dy++)for(let dx=0;dx<radius;dx++){
      const at=(((y+dy)%size)*size+(x+dx)%size)*4;
      colour.set([...c,255],at);rough[at+1]=value<.26?218:183;
    }
  }
  const texture=(data,srgb)=>{
    const map=new T.DataTexture(data,size,size);map.name='cabin-rubber-'+(srgb?'colour':'roughness');
    if(srgb)map.colorSpace=T.SRGBColorSpace;
    map.wrapS=map.wrapT=T.RepeatWrapping;map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;
    map.generateMipmaps=true;map.anisotropy=coarse?4:8;map.needsUpdate=true;return map;
  };
  return {map:texture(colour,true),roughnessMap:texture(rough,false)};
}

export function trainCabinMaterials({woodMap,woodNormal,woodRough,cabinLabels,trainWindow,detail,leatherDetail}) {
  const mat=(name,color,roughness,metalness=0,fill=.13)=>{
    const m=new T.MeshStandardMaterial({name:'cabin-'+name,color,roughness,metalness,emissive:color,emissiveIntensity:fill});
    m.envMapIntensity=.8;m.dithering=true;return m;
  };
  const m={
    wall:mat('enamel',0xb2baad,.43),
    ceiling:mat('ceiling',0xc9c9b7,.63),
    wood:mat('walnut',0x9c856f,.67),
    floor:mat('rubber',0xffffff,.98,0,.075),
    seat:mat('teal-upholstery',0x245f59,.53,0,.2),
    seam:mat('seat-piping',0x143c38,.64),
    steel:mat('brushed-steel',0x8b999c,.32,.83,.035),
    brass:mat('aged-brass',0xa48a57,.36,.75,.035),
    dark:mat('gasket',0x171e1d,.82,0,.07),
    glass:mat('smoked-glass',0x213a40,.24,.32,.12),
    sign:mat('safety-ochre',0xc0a367,.65),
    glow:new T.MeshBasicMaterial({name:'cabin-diffuser',color:0xffe8bc,toneMapped:false}),
    label:mat('labels',0xffffff,.64,0,.2),
  };
  m.label.map=m.label.emissiveMap=cabinLabels;
  Object.assign(m.floor,rubberFloor(detail.coarse));
  m.floor.emissiveMap=m.floor.map;
  Object.assign(m.wood,{map:woodMap,normalMap:woodNormal,roughnessMap:woodRough});m.wood.normalScale.set(.10,.10);
  m.wood.userData.cabinUvScale=[.38,.7];
  // All detail follows carriage-local UVs: a moving train must not swim through
  // a world-space plaster texture. Broad roughness variation, very soft normals.
  stationSurface(m.wall,{...detail,uv:true,scale:2,strength:.035,variation:.09});
  stationSurface(m.seat,{...leatherDetail,uv:true,scale:2.6,strength:.30,variation:.17});
  stationSurface(m.steel,{...detail,uv:true,scale:2,strength:.025,variation:.1});
  stationSurface(m.brass,{...detail,uv:true,scale:2,strength:.02,variation:.1});
  stationSurface(m.glass,{...detail,uv:true,scale:1,strength:.012,variation:.025,window:trainWindow});
  m.ceiling.side=T.DoubleSide;
  return m;
}
