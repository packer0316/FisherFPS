import * as T from 'three';
import { reloadHand } from './reload-hand.js';
import { wrapFinger, armChain, articulateFingers } from './hand-pose.js';
import { desertEagle, eagleReload as timing } from './desert-eagle-spec.js';

const v = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
const ease = T.MathUtils.smoothstep;

// Existing authored PBR detail carries the machining, engraving and grip relief.
// Chrome uses broad, stable highlights rather than high-frequency procedural scratches.
function finishEagle(gun) {
  const materials = new Map();
  gun.traverse(node => {
    if (!node.isMesh) return;
    const old = node.material;
    const kind = node.name === 'Grip' ? 'rubber' :
      /^(FrontSight|RearSight|Hammer|Trigger|GripBolt|Safety|MagazineBase)$/.test(node.name) ? 'black' :
      /^Bullet/.test(node.name) && node.name !== 'BulletThrow' ? 'brass' : 'chrome';
    const key = old.uuid + kind;
    let mat = materials.get(key);
    if (!mat) {
      mat = new T.MeshPhysicalMaterial({
        name: 'Eagle '+kind+' '+old.name,
        map: old.map, normalMap: old.normalMap, roughnessMap: old.roughnessMap,
        color: kind === 'rubber' ? 0x333638 : kind === 'black' ? 0x454a4e : 0xffffff,
        metalness: kind === 'rubber' ? .03 : .96,
        roughness: kind === 'rubber' ? 1 : kind === 'black' ? .82 : .72,
        normalScale: new T.Vector2(.65,.65),
        envMapIntensity: kind === 'chrome' ? .68 : .8,
        clearcoat: 0,
        anisotropy: kind === 'chrome' ? .35 : 0, anisotropyRotation: Math.PI / 2,
      });
      if (kind === 'chrome') {
        mat.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n'+
            'float steelMark = smoothstep(.018,.22,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));\n'+
            'float machining = clamp(.86 + dot(diffuseColor.rgb,vec3(.22,.50,.18)),.88,1.12);\n'+
            'diffuseColor.rgb = mix(vec3(.018,.021,.024),vec3(.24,.255,.27),steelMark)*machining;')
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(.29+roughnessFactor*.25,.30,.47);');
        };
        mat.customProgramCacheKey = () => 'eagle-brushed-chrome-v2';
      }
      for (const texture of [mat.map, mat.normalMap, mat.roughnessMap]) if (texture) texture.anisotropy = 4;
      materials.set(key,mat);
    }
    node.material = mat;
  });
}

function fitEagleHands(space) {
  const at=name=>space.getObjectByName(name).getWorldPosition(v());
  const quat=()=>new T.Quaternion();
  for(const side of ['R','L']) {
    const wrist=at('IK_Hand_Cntrl_'+side),index=at('Bone_'+side+'005'),little=at('Bone_'+side+'017');
    const center=index.clone().lerp(little,.5),along=center.clone().sub(wrist).normalize();
    const across=index.sub(little);across.addScaledVector(along,-across.dot(along)).normalize();
    const home=quat().setFromRotationMatrix(new T.Matrix4().makeBasis(across,along,across.clone().cross(along)));
    const forward=v(side==='R'?-.06:.10,.13,-.99).normalize();
    const span=v(0,1,0).addScaledVector(forward,-forward.y).normalize();
    const frame=quat().setFromRotationMatrix(new T.Matrix4().makeBasis(span,forward,span.clone().cross(forward)));
    const turn=frame.clone().multiply(home.invert());
    const knuckles=side==='R'?v(.046,-.068,.094):v(-.073,-.094,.060);
    wrist.sub(center).applyQuaternion(turn).add(knuckles);
    const orientation=turn.clone().multiply(space.getObjectByName('IK_Hand_Cntrl_'+side).getWorldQuaternion(quat()));
    armChain(space,side,true)(v(side==='R'?.28:-.32,-.34,.41),wrist,orientation,undefined,1,1);
    space.updateMatrixWorld(true);
    articulateFingers(space,side,frame,
      side==='R'?[[0,12,42,32],[3,26,72,52],[4,28,78,53],[5,34,78,52]]:
        [[0,25,65,40],[2,32,70,45],[3,35,74,48],[4,40,76,48]],
      side==='R'?quat().set(-.5801,-.77228,-.15509,.20740).normalize():quat().set(-.24519,-.41588,-.47763,.73402).normalize(),
      side==='R'?[45,28]:[20,12]);
  }
  // Opposing thumbs stay below the moving slide, with a relaxed web over the backstrap.
  wrapFinger(space,'R',20,[v(-.020,-.029,.171),v(-.040,-.001,.137),v(-.040,.004,.090)]);
  wrapFinger(space,'L',20,[v(-.069,-.041,.128),v(-.060,-.026,.087),v(-.052,-.022,.045)]);
  space.updateMatrixWorld(true);
}

export function installDesertEagle(body, handsAsset, eagleAsset, gloveMaterial) {
  const space = handsAsset, find = n => space.getObjectByName(n);
  // This is an independent SkeletonUtils clone. P12 geometry and pose are untouched.
  space.add(eagleAsset.scene);
  const arms = find('FPRig');
  arms.scale.setScalar(.79);
  arms.position.set(0,0,0);
  find('FPArms').material=gloveMaterial.clone();
  space.updateMatrixWorld(true);
  fitEagleHands(space);
  finishEagle(eagleAsset.scene);
  space.traverse(node => {
    if (node.isSkinnedMesh) {
      node.frustumCulled=false;
      node.material=node.material.clone();
      node.material.aoMapIntensity=.62;
    }
  });
  const slide = find('EagleSlide'), mag = find('EagleMagazine');
  const round = find('EagleRound'), hammer = find('EagleHammer');
  const hammerPivot=v(0,.04,.162);
  hammer.position.copy(hammerPivot);
  for(const child of hammer.children) child.position.sub(hammerPivot);
  const spare = mag.clone(true);spare.name='EagleFreshMagazine';space.add(spare);spare.visible=false;
  const left = reloadHand(space,'L',true);
  const palmUp = v(.05,.95,-.30), palmIn = v(1,0,.05);
  // Palm and opposing thumb follow the fresh magazine as one rigid contact frame.
  const grasp = left.articulated(spare,v(-.034,-.124,.082),v(.51161,.66324,-.54623),v(.84296,-.26437,.46854),
    [[12,26,70,52],[12,26,86,43],[12,27,86,43],[12,35,57,57]],
    new T.Quaternion(-.24519,-.41588,-.47763,.73402).normalize(),[15,6]);
  // Bake the opposing thumb against the magazine's far flat, not beside the
  // four fingers. Preserve the metacarpal and phalange lengths from the clean rig.
  const fittingKeys=[[0,left.rest],[.5,grasp],[1,left.rest]];
  left.update(.5,fittingKeys);space.updateMatrixWorld(true);
  wrapFinger(space,'L',20,[v(-.016,-.158,.155),v(.022,-.132,.140),v(.025,-.110,.115)]);
  for(let i=0;i<3;i++)grasp.fingers[12+i].copy(find('Bone_L0'+(20+i)).quaternion);
  left.update(0,fittingKeys);space.updateMatrixWorld(true);
  const pocket = left.place(left.loose,v(-.18,-.57,.24),palmUp,palmIn);
  const clear = left.place(left.loose,v(-.14,-.17,.18),palmUp,palmIn);
  const leftKeys = [
    [0,left.rest],[.07,clear],[.24,pocket],[timing.pickup,grasp],
    [timing.seat,grasp],[.80,clear],[.93,left.rest],[1,left.rest],
  ];
  const partialKeys = [[0,left.rest],[.07,clear],[.24,pocket],[timing.pickup,grasp],
    [timing.seat,grasp],[.81,clear],[.96,left.rest],[1,left.rest]];
  const index = find('Bone_R006'), indexHome = index.quaternion.clone();
  const thumb=find('Bone_R021'),thumbHome=thumb.quaternion.clone();
  const axis = v(1,0,0);
  const magHome = mag.position.clone(), pocketOffset = v(-.17,-.55,.13);
  body.add(space);
  const unit=.63;
  space.scale.setScalar(unit);space.position.set(0,.005,-.07);
  const socket = p => p.multiplyScalar(unit).add(space.position);
  const tip=socket(v(0,.056,-.245)), port=socket(v(.026,.062,.014));
  const sightY=.103*unit+space.position.y;
  function pose(p,empty,cycle,ads,rounds) {
    // Gas-operated visual: the barrel stays fixed, only the slide assembly cycles.
    const cycling=.075*Math.sin(cycle*Math.PI);
    const heldOpen = rounds===0 && (p===0 || p<timing.release);
    const rackBack=empty ? ease(p,.80,timing.rack)*(1-ease(p,timing.release,.935)) : 0;
    slide.position.z=Math.max(cycling,heldOpen?.075:0,.075*rackBack);
    hammer.rotation.x=-.20*(1-ease(cycle,0,.7));
    index.quaternion.copy(indexHome);
    index.rotateZ(p>0?.10:-.10*(1-ease(cycle,.08,.7)));
    thumb.quaternion.copy(thumbHome);
    if(empty)thumb.rotateZ(-.17*(ease(p,.84,.89)-ease(p,.91,.95)));
    round.visible = rounds>0;
    mag.visible=p<.45||p>=timing.seat;
    mag.position.copy(magHome);mag.quaternion.identity();
    if(p>=timing.drop && p<timing.seat) {
      const t=(p-timing.drop)*desertEagle.reload*(empty?1:.86);
      mag.position.x+=.012*t;mag.position.y-=.03*t+4.1*t*t;mag.position.z+=.008*t;
      mag.quaternion.setFromAxisAngle(axis,.10*t);
    }
    spare.visible=p>=timing.pickup&&p<timing.seat;
    const lift=ease(p,timing.rise,timing.align), seat=ease(p,timing.align,timing.seat);
    spare.position.copy(pocketOffset).multiplyScalar(1-lift).add(magHome);
    spare.position.y-=.08*lift*(1-seat);
    spare.quaternion.setFromAxisAngle(axis,.10*(1-seat));
    left.update(p,empty?leftKeys:partialKeys);
  }
  return { tip,port,sightY,pose };
}
