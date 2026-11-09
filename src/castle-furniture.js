import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Upholstered three-seat settees: shaped backs, separate cushions, scrolled arms
// and four turned feet. They remain static cover in the existing side aisles.
export function addCastleSettees({add,box,cyl,tube,solid,surfaces}) {
  const {wood,velvet,bronze,gold}=surfaces;
  function rounded(x,y,z,w,h,d,r,m) {
    const raw=new RoundedBoxGeometry(w,h,d,2,r),g=mergeVertices(raw);raw.dispose();
    add(g.translate(x,y,z),m);
  }
  for(const side of [-1,1])for(const z of [-14,3,18]) {
    const x=side*13.6;
    // Four individual feet, with tapered shafts and a collar below the seat rail.
    for(const dx of [-1.9,1.9])for(const dz of [-.5,.5]) {
      const profile=[[.12,0],[.15,.06],[.11,.14],[.075,.36],[.13,.49],[.13,.58]].map(([r,h])=>new T.Vector2(r,h));
      add(new T.LatheGeometry(profile,12).translate(x+dx,0,z+dz),wood);
      cyl(x+dx,.49,z+dz,.135,.055,bronze,.135,12);
    }
    rounded(x,.58,z,4.25,.22,1.4,.08,wood);
    for(const dz of [-.69,.69])box(x,.60,z+dz,4.08,.035,.035,bronze);
    for(const dx of [-1.36,0,1.36]) {
      rounded(x+dx,.78,z-.03,1.31,.25,1.24,.10,velvet);
      // Three padded back panels follow a shallow scalloped top rail.
      const h=dx===0?1.10:.99,cy=1.36+(dx===0?.045:0);
      rounded(x+dx,cy,z+.55,1.36,h,.24,.15,wood);
      rounded(x+dx,cy,z+.39,1.20,h-.15,.20,.13,velvet);
      for(const oy of [-.21,.21]) {
        add(new T.SphereGeometry(.035,8,6).scale(1,1,.45).translate(x+dx,cy+oy,z+.275),bronze);
        for(const sign of [-1,1])tube([[x+dx+sign*.4,cy+oy+.18,z+.285],[x+dx,cy+oy,z+.278],[x+dx+sign*.4,cy+oy-.18,z+.285]],.009,bronze,8);
      }
      // Small upholstery tacks sit in the frame instead of thick gilded bars.
      for(let i=0;i<7;i++)add(new T.SphereGeometry(.019,6,4).translate(x+dx-.48+i*.16,cy-h/2+.085,z+.30),gold);
    }
    for(const dx of [-2.08,2.08]) {
      tube([[x+dx,.62,z-.48],[x+dx,1.05,z-.58],[x+dx,1.17,z-.32],[x+dx,1.20,z+.45],[x+dx,1.66,z+.58]],.075,wood,22);
      rounded(x+dx,1.20,z-.03,.21,.18,.97,.075,velvet);
      add(new T.SphereGeometry(.105,12,8).translate(x+dx,1.68,z+.58),bronze);
      solid(x+dx,.95,z,.22,.75,1.25);
    }
    solid(x,.44,z,4.3,.88,1.4);
    solid(x,1.37,z+.54,4.22,1.2,.28);
  }
}
