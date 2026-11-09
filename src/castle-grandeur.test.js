import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addCastleGrandeur, castleMonuments } from './castle-grandeur.js';

test('castle monument details merge with architecture and preserve the combat corridor',()=>{
  for(const coarse of [false,true]) {
    const geometry=[],colliders=[];
    addCastleGrandeur({coarse,surfaces:{},
      add:g=>geometry.push(g),box:()=>{},cyl:()=>{},tube:()=>{},ring:()=>{},
      solid:(x,y,z,w,h,d)=>colliders.push(new T.Box3(new T.Vector3(x-w/2,y-h/2,z-d/2),new T.Vector3(x+w/2,y+h/2,z+d/2))),
    });
    const cube=new T.BoxGeometry(1,1,1);
    const merged=mergeGeometries([cube,...geometry]);
    assert.ok(merged,'sculptural frames must share the indexed architecture format');
    for(const attribute of Object.values(merged.attributes))
      assert.ok(attribute.array.every(Number.isFinite),'no invalid geometry in a static batch');
    assert.equal(colliders.length,4);
    for(const b of colliders) {
      assert.ok(b.max.x < -12 || b.min.x > 12,'leave the central 24-metre combat corridor clear');
      assert.ok(b.min.x>=-22&&b.max.x<=22&&b.min.z>=-28&&b.max.z<=28);
    }
    assert.ok(castleMonuments.every(p=>colliders.some(b=>b.containsPoint(new T.Vector3(p.x,1,p.z)))),'each giant statue needs a solid pedestal');
    merged.dispose();cube.dispose();geometry.forEach(g=>g.dispose());
  }
});
