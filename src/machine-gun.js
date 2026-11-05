import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { supportArm } from './weapon-rig.js';

const v = (x, y, z) => new T.Vector3(x, y, z);
const ease = T.MathUtils.smoothstep;
const halfPi = Math.PI / 2;

// Each moving assembly is batched by finish. Individual rivets and vent faces share draw calls.
function assembly(parent) {
  const batches = new Map();
  function add(material, geometry) {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry.index ? geometry.toNonIndexed() : geometry);
  }
  function box(m, x, y, z, w, h, l) {
    add(m, new T.BoxGeometry(w, h, l).translate(x, y, z));
  }
  function tube(m, x, y, z, front, back, len, axis = 'z', open = false) {
    const g = new T.CylinderGeometry(front, back, len, 20, 1, open);
    if (axis === 'z') g.rotateX(-halfPi);
    if (axis === 'x') g.rotateZ(-halfPi);
    add(m, g.translate(x, y, z));
  }
  function plate(m, profile, width, x = 0) {
    const shape = new T.Shape(profile.map(([z, y]) => new T.Vector2(z, y)));
    add(m, new T.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: 0.003,
      bevelThickness: 0.003, bevelSegments: 1 }).rotateY(-halfPi).translate(x + width / 2, 0, 0));
  }
  function finish() {
    for (const [m, geos] of batches) parent.add(new T.Mesh(mergeGeometries(geos), m));
  }
  return { add, box, tube, plate, finish };
}

function ventPanel(w) {
  const shape = new T.Shape();
  const length = 0.99;
  shape.moveTo(0, -w / 2); shape.lineTo(length, -w / 2);
  shape.lineTo(length, w / 2); shape.lineTo(0, w / 2); shape.closePath();
  for (let i = 0; i < 8; i++) {
    const a = 0.056 + i * 0.121, b = a + 0.051, r = w * 0.23;
    const slot = new T.Path();
    slot.moveTo(a, r); slot.lineTo(b, r);
    slot.absarc(b, 0, r, halfPi, -halfPi, true); slot.lineTo(a, -r);
    slot.absarc(a, 0, r, -halfPi, halfPi, true);
    shape.holes.push(slot);
  }
  return new T.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false, curveSegments: 4 }).rotateY(halfPi);
}

// Bent sheet metal has rolled shoulders and a shallow crown that catches a narrow highlight.
function pressedHousing(sections) {
  const vertices = [], indices = [];
  for (const [z, halfWidth, top, bottom] of sections) {
    const w = halfWidth;
    for (const [x,y] of [[-w,bottom],[-w,top-.018],[-w*.84,top-.007],[-w*.57,top],
      [0,top+.002],[w*.57,top],[w*.84,top-.007],[w,top-.018],[w,bottom]])
      vertices.push(x,y,z);
  }
  const ring = 9;
  for (let j = 1; j < sections.length; j++) {
    for (let i = 0; i < ring; i++) {
      const a = (j-1)*ring+i, b = (j-1)*ring+(i+1)%ring;
      indices.push(a,a+ring,b,b,a+ring,b+ring);
    }
  }
  const end = (sections.length-1)*ring;
  for (let i = 1; i < ring-1; i++) indices.push(0,i,i+1,end,end+i+1,end+i);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices,3));
  g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));
  g.setIndex(indices);
  const faces = g.toNonIndexed();
  faces.computeVertexNormals();
  return faces;
}

function stamping(parent, text, width, length, x, y, z, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 46px monospace';
  ctx.fillStyle = paint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text,192,40,368);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const ink = new T.Mesh(new T.PlaneGeometry(width,length).rotateX(-halfPi),
    new T.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:.82}));
  ink.position.set(x,y,z);
  parent.add(ink);
  return ink;
}

function finishSteel(color, roughness, detail) {
  const m = new T.MeshStandardMaterial({ color, metalness: 0.79, roughness });
  m.onBeforeCompile = shader => {
    shader.uniforms.mgFinish = { value: detail };
    shader.vertexShader = 'varying vec2 vStamp;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvStamp=vec2(position.z*2.8+(position.x*.43),position.y*7.+position.x*4.);');
    shader.fragmentShader = 'varying vec2 vStamp;uniform sampler2D mgFinish;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec2 grain=texture2D(mgFinish,vStamp).rg;diffuseColor.rgb*=.79+.38*grain.g+.12*grain.r;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+.24*(grain.r-.5),.23,.85);');
  };
  m.customProgramCacheKey = () => 'mg3-stamped-steel';
  return m;
}

function cartridges() {
  const parts = [];
  function colored(g, color) {
    const rgb = new T.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    parts.push(g);
  }
  function segment(front, back, length, z, color) {
    const g = new T.CylinderGeometry(front, back, length, 12).rotateX(-halfPi).translate(0, 0, z).toNonIndexed();
    colored(g,color);
  }
  segment(0.013, 0.0145, 0.082, 0.008, 0xc99c4c);
  segment(0.009, 0.013, 0.013, -0.039, 0xe5bb68);
  segment(0.0014, 0.009, 0.033, -0.062, 0xb76d48);
  segment(0.016, 0.016, 0.018, 0.000, 0x52585b);
  segment(0.016, 0.016, 0.009, 0.025, 0x62696c);
  segment(0.012, 0.012, 0.005, 0.050, 0x65502f);
  segment(0.0148, 0.0148, 0.004, 0.0545, 0xbd9250);
  segment(0.0062, 0.0062, 0.002, 0.0572, 0x685e48);
  segment(0.0048, 0.0048, 0.001, 0.0587, 0xdbb97a);
  for (const z of [0.000,0.024])
    colored(new T.BoxGeometry(.041,.005,.010).translate(-.013,-.009,z).toNonIndexed(),0x52565a);
  const belt = new T.InstancedMesh(mergeGeometries(parts),
    new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.72, roughness: 0.35 }), 9);
  belt.instanceMatrix.setUsage(T.DynamicDrawUsage);
  belt.frustumCulled = false;
  return belt;
}

export function installMachineGun(body, arms, detail) {
  const space = new T.Group();
  space.add(arms);
  space.updateMatrixWorld(true);
  const arm = supportArm(space, true);
  const grip = arm.home.clone().add(v(0.012, -0.01, 0.105));
  arm.pose(grip, 0, 0, 0);
  space.updateMatrixWorld(true);
  arm.fitGrip();
  arms.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const finger = space.getObjectByName('Bone_R005') ?? space.getObjectByName('Bone_R.005');
  const triggerBind = finger?.quaternion.clone();
  const steel = finishSteel(0x464e53, 0.45, detail);
  const edge = finishSteel(0x70787a, 0.32, detail);
  const barrel = finishSteel(0x323638, 0.46, detail);
  const olive = finishSteel(0x66704b, 0.64, detail);
  olive.metalness = 0.36;
  const polymer = new T.MeshStandardMaterial({ color: 0x363636, roughness: 0.69 });
  const bore = new T.MeshStandardMaterial({ color: 0x111414, roughness: 0.92 });
  const fixed = assembly(space);

  // Stamped receiver, shoulder stock, pistol grip and under-folded bipod.
  fixed.add(steel,pressedHousing([[-.766,.059,.073,-.034],[-.656,.066,.104,-.041],
    [-.28,.067,.109,-.051],[.094,.064,.097,-.036],[.12,.059,.090,-.030]]));
  fixed.plate(polymer, [[.105,.091],[.26,.082],[.54,.029],[.57,-.158],[.49,-.167],[.24,-.063],[.12,-.04]], .124);
  fixed.plate(bore, [[.54,.029],[.575,.026],[.60,-.164],[.56,-.171]], .136);
  fixed.plate(polymer, [[-.21,-.031],[-.105,-.031],[-.059,-.227],[-.145,-.244]], .066);
  fixed.box(steel, 0,-.116,-.25,.021,.014,.12);
  fixed.box(steel, 0,-.077,-.309,.021,.087,.016);
  fixed.box(edge, 0,-.063,-.245,.015,.058,.014);
  fixed.tube(barrel, 0,.041,-1.216,.035,.04,1.09);
  for (const side of [-1, 1]) {
    fixed.add(steel, ventPanel(.111).translate(side < 0 ? -.059 : .053,.04,-.723));
    fixed.box(edge, side*.060,-.010,-1.215,.011,.012,.975);
    fixed.box(steel, side*.070,-.026,-1.36,.020,.025,.61);
    fixed.plate(barrel, [[-1.65,-.017],[-1.48,-.044],[-1.06,-.062],[-1.045,-.038],[-1.52,-.017]],.013,side*.076);
    fixed.box(steel,side*.076,-.049,-1.055,.046,.041,.076);
    fixed.box(edge,side*.065,.028,-.349,.009,.012,.65);
    for (const z of [-.07,-.195,-.411,-.595,-.697])
      fixed.tube(edge,side*.067,.053,z,.011,.011,.012,'x');
  }
  fixed.add(steel, ventPanel(.111).rotateZ(halfPi).translate(0,.094,-.723));
  fixed.box(barrel,0,-.014,-1.225,.105,.012,.98);
  fixed.plate(polymer,[[-.70,-.018],[-.725,-.057],[-.90,-.058],[-.942,-.020]],.098);
  // Muzzle booster with a hollow flared mouth and a recessed dark bore.
  fixed.tube(steel,0,.041,-1.704,.064,.07,.078);
  fixed.tube(barrel,0,.041,-1.797,.042,.049,.14);
  fixed.tube(steel,0,.041,-1.91,.065,.042,.095,'z',true);
  fixed.tube(bore,0,.041,-1.892,.044,.044,.012);
  fixed.add(edge,new T.TorusGeometry(.060,.005,6,24).translate(0,.041,-1.958));
  fixed.box(steel,0,.115,-1.64,.104,.042,.06);
  for(const side of [-1,1]) fixed.plate(steel,[[-1.665,.124],[-1.667,.202],[-1.65,.212],[-1.625,.141]],.012,side*.042);
  fixed.plate(edge,[[-1.65,.122],[-1.65,.197],[-1.641,.197],[-1.63,.123]],.009);
  fixed.box(barrel,.073,.032,-.42,.006,.045,.20);
  // Carrier hooks bridge the box to the left receiver wall below the moving belt.
  for (const z of [-.40,-.59]) {
    fixed.box(steel,-.113,-.013,z,.115,.019,.031);
    fixed.box(barrel,-.159,-.035,z,.022,.059,.031);
  }
  fixed.plate(barrel, [[.056,.094],[.071,.105],[.103,.102],[.117,.089],[.108,-.035],[.067,-.04]], .134);
  for (const z of [-.07,-.024]) fixed.tube(edge,0,.107,z,.009,.010,.002,'y');
  // Guides, pawls and bolt track are exposed while replacing the belt.
  fixed.box(barrel,0,.111,-.457,.115,.007,.344);
  for (const x of [-.043,.043]) fixed.box(edge,x,.119,-.453,.009,.011,.306);
  fixed.tube(steel,0,.128,-.437,.019,.019,.185);
  for (const z of [-.550,-.503]) fixed.box(edge,-.043,.136,z,.064,.023,.013);
  fixed.box(steel,-.077,.072,-.49,.062,.012,.143);
  fixed.finish();

  const lid = new T.Group(), box = new T.Group(), bolt = new T.Group();
  lid.position.set(0,.115,-.662);
  const cover = assembly(lid);
  cover.add(steel,pressedHousing([[-.012,.069,.014,-.014],[.047,.079,.047,-.014],
    [.285,.077,.053,-.015],[.395,.072,.040,-.016],[.443,.067,.026,-.014],[.459,.063,.012,-.009]]));
  for (const x of [-.052,.052])
    cover.plate(steel,[[.050,.036],[.072,.049],[.246,.054],[.266,.045],[.24,.043],[.073,.039]],.009,x);
  cover.tube(edge,0,0,0,.018,.018,.184,'x');
  // Tangent rear sight: sloped leaf, graduation marks and a shallow V notch.
  cover.plate(barrel,[[.096,.049],[.325,.080],[.344,.072],[.327,.054],[.105,.043]],.055);
  for (let i=0;i<8;i++) {
    const z=.125+i*.022;
    cover.box(edge,-.014,.055+i*.0030,z,i%2===0?.016:.009,.0018,.0028);
  }
  cover.box(steel,0,.070,.244,.072,.017,.022);
  for (const side of [-1,1]) {
    const ear = new T.BoxGeometry(.021,.023,.012).rotateZ(side*.52).translate(side*.013,.080,.332);
    cover.add(barrel,ear);
  }
  for (let i=0;i<5;i++) cover.box(barrel,0,.015-i*.001,.427+i*.005,.084,.008,.002);
  cover.box(edge,0,-.008,.452,.076,.020,.024);
  for (const x of [-.051,.051]) cover.box(barrel,x,-.018,.205,.011,.012,.307);
  cover.tube(edge,0,-.024,.243,.011,.011,.110,'x');
  cover.plate(steel,[[.119,-.018],[.173,-.041],[.243,-.032],[.301,-.021],[.242,-.015]],.037);
  for (const z of [.103,.139,.321,.355]) cover.box(edge,0,-.022,z,.069,.017,.012);
  cover.finish();
  stamping(space,'MG 3   7,62',.079,.025,0,.106,-.004,'#afb3a9');

  const bin = assembly(box);
  bin.plate(olive,[[.159,.12],[-.15,.123],[-.17,.099],[-.148,-.165],[.125,-.169],[.16,-.123]],.20);
  bin.box(olive,0,.127,-.111,.215,.019,.124);
  bin.box(olive,0,.127,.111,.215,.019,.122);
  bin.box(barrel,.015,.125,0,.115,.005,.104);
  for(const x of [-.097,.096]) bin.box(olive,x,.130,0,.021,.023,.334);
  for(const z of [-.052,.053]) bin.tube(edge,.003,.137,z,.005,.005,.188,'x');
  for(const x of [-.061,.053]) bin.box(steel,x,.142,.113,.015,.014,.036);
  bin.tube(olive,-.004,.151,.113,.008,.008,.124,'x');
  for(const side of [-1,1]) {
    for(const z of [-.107,.092]) bin.box(olive,side*.103,-.016,z,.009,.22,.017);
    bin.box(edge,side*.104,.104,.008,.012,.022,.049);
  }
  for(const x of [-.065,.065]) bin.box(olive,x,-.016,.153,.013,.16,.012);
  bin.finish();
  stamping(box,'200 PATR.',.152,.039,0,.137,-.108,'#cfbe8a');
  stamping(box,'7,62  •  NATO',.15,.030,0,.048,.165,'#b6ad83').rotation.x = halfPi;
  const boxHome = v(-.248,-.166,-.49);
  box.position.copy(boxHome);
  const handle = assembly(bolt);
  handle.box(edge,.076,.030,-.39,.028,.024,.093);
  handle.tube(steel,.102,.031,-.35,.02,.025,.066,'x');
  handle.finish();
  const belt = cartridges(), link = new T.Object3D();
  space.add(lid, box, bolt, belt);
  const unit = .52;
  space.scale.setScalar(unit);
  space.position.set(0,.035,.122);
  body.add(space);
  const tip = v(0,.041,-1.96).multiplyScalar(unit).add(space.position);
  const port = v(.080,.032,-.432).multiplyScalar(unit).add(space.position);
  const wrist = new T.Vector3(), contact = new T.Vector3();
  let lastCount = -1, lastFeed = -1;
  function pose(p, empty, cycle, ads, rounds) {
    const opening = ease(p,.035,.16) - ease(p,.70,.79);
    const takeBox = ease(p,.17,.29) - ease(p,.54,.65);
    const remove = ease(p,.29,.40) - ease(p,.44,.55);
    const seatBelt = ease(p,.56,.65) - ease(p,.69,.77);
    const shut = ease(p,.66,.71) - ease(p,.80,.85);
    const reachLid = ease(p,.005,.067) - ease(p,.135,.22);
    const rack = ease(p,.80,.86) - ease(p,.935,.985);
    const pull = ease(p,.855,.91) - ease(p,.91,.945);
    lid.rotation.x = -1.27 * opening;
    box.position.copy(boxHome);
    box.position.x -= .17 * remove; box.position.y -= .56 * remove; box.position.z += .14 * remove;
    box.rotation.z = -.24 * remove;
    box.visible = p < .40 || p >= .44;
    bolt.position.z = .119 * pull;
    wrist.copy(grip);
    contact.set(-.048,.138+.25*opening,-.265-.19*opening);
    wrist.lerp(contact,reachLid).lerp(contact.copy(box.position).addScaledVector(T.Object3D.DEFAULT_UP,.07),takeBox);
    wrist.lerp(contact.set(-.119,.112,-.50),seatBelt);
    wrist.lerp(contact.set(-.037,.149+.24*opening,-.26-.19*opening),shut);
    wrist.lerp(contact.set(.09,.042,-.327+bolt.position.z),rack);
    const reach = Math.max(reachLid,takeBox,seatBelt,shut,rack);
    arm.pose(wrist,reach,reach,reach*.4);
    if (finger) { finger.quaternion.copy(triggerBind); finger.rotateZ(-.13*(1-ease(cycle,.05,.72))); }

    // The last links run into the feed tray; a fresh belt is laid in before the cover closes.
    const remaining = p >= .58 ? 200 : rounds;
    belt.count = (p > .20 && p < .55) ? 0 : Math.min(9, remaining);
    const feed = 1 - ease(cycle,0,.85);
    if (belt.count === lastCount && feed === lastFeed) return;
    lastCount = belt.count;
    lastFeed = feed;
    for (let i = 0; i < belt.count; i++) {
      const u = (i + feed) / 9;
      link.position.set(-.042-.222*u,.078+.036*Math.sin(u*Math.PI)-.127*u*u,-.494);
      link.rotation.z = Math.atan2(.254*u-.036*Math.PI*Math.cos(u*Math.PI),.222);
      link.updateMatrix();
      belt.setMatrixAt(i,link.matrix);
    }
    belt.visible = belt.count > 0;
    belt.instanceMatrix.needsUpdate = true;
  }
  return { tip, port, sightY: 0, pose };
}
