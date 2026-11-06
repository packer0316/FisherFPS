import * as T from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { supportArm } from './weapon-rig.js';
import { makeMachineReload } from './mg3-reload.js';
import { beltMaterial, finishGeometry, housingMaterial, loadMachineFinishes } from './mg3-finish.js';

const v = (x, y, z) => new T.Vector3(x, y, z);
const ease = T.MathUtils.smoothstep;
const halfPi = Math.PI / 2;

// Both open sights share this height in the gun's local space. The top of the
// front post is the point of aim, with clear air above it in the rear notch.
const sightLine = .202, lidHeight = .115;
function sightBlade(profile, depth, z) {
  const face = new T.Shape(profile.map(([x, y]) => new T.Vector2(x, y)));
  return new T.ExtrudeGeometry(face, { depth, bevelEnabled: false }).translate(0, 0, z);
}

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
  function screw(face, recess, x, y, z, radius, normal, angle) {
    const orient = new T.Quaternion().setFromUnitVectors(T.Object3D.DEFAULT_UP, normal);
    function place(material, geometry) {
      add(material,geometry.rotateY(angle).applyQuaternion(orient).translate(x,y,z));
    }
    place(recess,new T.CylinderGeometry(radius*1.18,radius*1.21,.0025,20));
    place(face,new T.CylinderGeometry(radius*.83,radius,.004,20).translate(0,.0023,0));
    place(recess,new T.BoxGeometry(radius*1.26,.00045,radius*.16).translate(0,.00445,0));
  }
  function finish() {
    for (const [m, geos] of batches) {
      const geometry = mergeGeometries(geos);
      parent.add(new T.Mesh(m.userData.mgFinish ? finishGeometry(geometry) : geometry, m));
    }
  }
  return { add, box, tube, plate, screw, finish };
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
  return new T.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: .0012,
    bevelSize: .0014, bevelSegments: 1, curveSegments: 5 }).rotateY(halfPi);
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
  return toCreasedNormals(g, .71);
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

function cartridges(maps) {
  const parts = [];
  const brass = [0xe5c585,.205,.98], copper = [0xc68460,.25,.97];
  const springSteel = [0x455057,.42,.85], primer = [0xd6d0bd,.22,.96];
  function add(g, [color, roughness, metalness], head = false, bridge = false) {
    const count = g.attributes.position.count;
    const rgb = new T.Color(color), colors = new Float32Array(count*3), alloy = new Float32Array(count*3);
    for (let i = 0; i < count*3; i+=3) {
      rgb.toArray(colors,i);
      alloy[i] = roughness; alloy[i+1] = metalness; alloy[i+2] = Number(head);
    }
    g.setAttribute('color', new T.BufferAttribute(colors,3));
    g.setAttribute('mgAlloy', new T.BufferAttribute(alloy,3));
    const weights = new Float32Array(count);
    if (bridge) {
      for (let i=0; i<count; i++) weights[i] = -g.attributes.position.getX(i)/.034;
    }
    g.setAttribute('mgBridge', new T.BufferAttribute(weights,1));
    parts.push(g);
  }
  function turned(profile, alloy, head = false, start = 0, arc = Math.PI*2) {
    const g = new T.LatheGeometry(profile.map(([r,z]) => new T.Vector2(r,z)),32,start,arc);
    add(g.rotateX(halfPi).toNonIndexed(),alloy,head);
  }
  turned([[0,-.083],[.0022,-.080],[.0055,-.073],[.0078,-.063],[.0086,-.054],[.0086,-.044]],copper);
  turned([[.0087,-.048],[.0096,-.0476],[.0097,-.038],[.013,-.030],[.0135,-.024],
    [.0147,.042],[.0144,.045],[.0123,.048],[.0123,.051],[.0142,.0513],[.0147,.0524],[.0147,.0546]],brass);
  turned([[.0147,.0546],[.01435,.0555],[.0135,.0561],[.0113,.05655],[.0083,.05665],
    [.0061,.0563],[.0055,.0555],[.0051,.0546]],brass,true);
  turned([[.0051,.0546],[.0049,.0557],[.0041,.05635],[.0022,.05665],[0,.0567]],primer);
  // Rolled open steel links leave the shoulder and the drawn brass case visible between clips.
  for (const z of [-.012,.018]) {
    turned([[.0143,z],[.0154,z+.0008],[.01565,z+.002],[.0157,z+.0078],[.0151,z+.009],[.0144,z+.0096]],
      springSteel,false,.76,Math.PI*1.55);
    add(new T.BoxGeometry(.034,.005,.008).translate(-.017,-.009,z+.0048).toNonIndexed(),springSteel,false,true);
  }
  const belt = new T.InstancedMesh(mergeGeometries(parts),beltMaterial(maps),9);
  belt.geometry.setAttribute('mgSpan',new T.InstancedBufferAttribute(new Float32Array(9*3),3).setUsage(T.DynamicDrawUsage));
  belt.instanceMatrix.setUsage(T.DynamicDrawUsage);
  belt.frustumCulled = false;
  return belt;
}

export function installMachineGun(body, arms) {
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
  const maps = loadMachineFinishes();
  const steel = housingMaterial('steel',0x424c55,.465,.79,maps);
  const edge = housingMaterial('steel',0x777e82,.34,.88,maps);
  const barrel = housingMaterial('steel',0x353a3c,.50,.76,maps);
  const olive = housingMaterial('enamel',0x616b47,.55,.10,maps);
  const polymer = housingMaterial('polymer',0x373837,.62,.025,maps);
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
    const outward = v(side,0,0);
    for (const z of [-.07,-.195,-.411,-.595,-.697])
      fixed.screw(edge,barrel,side*.067,.053,z,.010,outward,z*19);
    fixed.plate(steel,[[-.61,.003],[-.58,.011],[-.27,.011],[-.241,.004],[-.27,-.002],[-.58,-.002]],.004,side*.067);
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
  fixed.add(steel, sightBlade([[-.011,.124],[.011,.124],[.006,sightLine],[-.006,sightLine]], .014, -1.655));
  fixed.box(barrel,.073,.032,-.42,.006,.045,.20);
  // Carrier hooks bridge the box to the left receiver wall below the moving belt.
  for (const z of [-.40,-.59]) {
    const yoke = new T.Shape([[-.064,.000],[-.146,-.005],[-.161,-.019],[-.161,-.046],
      [-.151,-.050],[-.143,-.027],[-.125,-.020],[-.064,-.015]].map(([x,y]) => new T.Vector2(x,y)));
    fixed.add(steel,new T.ExtrudeGeometry(yoke,{depth:.025,bevelSize:.002,bevelThickness:.002,bevelSegments:1})
      .translate(0,0,z-.013));
    fixed.tube(edge,-.15,-.037,z,.008,.008,.038);
  }
  fixed.plate(barrel, [[.056,.094],[.071,.105],[.103,.102],[.117,.089],[.108,-.035],[.067,-.04]], .134);
  fixed.screw(edge,barrel,-.034,.105,-.069,.009,T.Object3D.DEFAULT_UP,.46);
  fixed.screw(edge,barrel,.034,.105,-.069,.009,T.Object3D.DEFAULT_UP,-.75);
  fixed.plate(barrel,[[-.224,.060],[-.21,.084],[-.15,.061],[-.141,.046],[-.16,.040]],.011,-.076);
  fixed.screw(edge,barrel,-.084,.066,-.206,.014,v(-1,0,0),.35);
  // Guides, pawls and bolt track are exposed while replacing the belt.
  fixed.box(barrel,0,.111,-.457,.115,.007,.344);
  for (const x of [-.043,.043]) fixed.box(edge,x,.119,-.453,.009,.011,.306);
  fixed.tube(steel,0,.128,-.437,.019,.019,.185);
  for (const z of [-.550,-.503]) fixed.box(edge,-.043,.136,z,.064,.023,.013);
  fixed.box(steel,-.077,.072,-.49,.062,.012,.143);
  fixed.finish();

  const lid = new T.Group(), box = new T.Group(), bolt = new T.Group();
  lid.position.set(0,lidHeight,-.662);
  const cover = assembly(lid);
  cover.add(steel,pressedHousing([[-.012,.069,.014,-.014],[.047,.079,.047,-.014],
    [.285,.077,.053,-.015],[.395,.072,.040,-.016],[.443,.067,.026,-.014],[.459,.063,.012,-.009]]));
  for (const x of [-.052,.052])
    cover.plate(steel,[[.050,.036],[.072,.049],[.246,.054],[.266,.045],[.24,.043],[.073,.039]],.009,x);
  cover.tube(edge,0,0,0,.018,.018,.184,'x');
  // Keep the tangent leaf below the notch so the front blade stays visible through it.
  cover.plate(barrel,[[.096,.049],[.325,.066],[.344,.062],[.327,.054],[.105,.043]],.055);
  for (let i=0;i<8;i++) {
    const z=.125+i*.022;
    cover.box(edge,-.014,.054+i*.00165,z,i%2===0?.016:.009,.0018,.0028);
  }
  cover.box(steel,0,.064,.244,.072,.012,.022);
  const lip = sightLine - lidHeight;
  cover.add(barrel, sightBlade([[-.043,.059],[.043,.059],[.043,lip-.006],[.036,lip],
    [.0095,lip],[.006,lip-.014],[-.006,lip-.014],[-.0095,lip],[-.036,lip],[-.043,lip-.006]],
    .014, .326));
  for (const side of [-1,1]) {
    cover.screw(edge,barrel,side*.074,.019,.348,.008,v(side,0,0),1.2);
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
    // The folded lips and toggle catch interrupt the otherwise flat front and side panels.
    bin.plate(olive,[[.154,.102],[.155,.114],[-.15,.116],[-.16,.104]],.008,side*.105);
    bin.plate(olive,[[.155,-.103],[.132,-.156],[-.142,-.155],[-.150,-.146],[.122,-.146]],.008,side*.103);
  }
  for(const x of [-.082,.082]) {
    bin.plate(olive,[[.154,.086],[.165,.083],[.168,.068],[.166,-.076],[.158,-.090],[.153,-.081]],.011,x);
    bin.tube(olive,x,.096,.160,.006,.008,.007);
  }
  bin.box(olive,0,.101,.163,.049,.023,.008);
  bin.tube(edge,0,.102,.170,.005,.005,.045,'x');
  for (const x of [-.016,.016]) bin.box(barrel,x,.087,.169,.006,.030,.006);
  bin.tube(steel,0,.072,.169,.004,.004,.038,'x');
  bin.finish();
  box.position.set(-.248,-.166,-.49);
  const handle = assembly(bolt);
  handle.box(edge,.076,.030,-.39,.028,.024,.093);
  handle.tube(steel,.102,.031,-.35,.02,.025,.066,'x');
  handle.finish();
  const belt = cartridges(maps), link = new T.Object3D();
  const feedPath = new T.CubicBezierCurve3(v(-.041,.078,-.494),v(-.16,.116,-.485),
    v(-.245,.092,-.501),v(-.257,-.072,-.498));
  const centers = Array.from({length:10}, () => new T.Vector3());
  const span = new T.Vector3(), inverseLink = new T.Quaternion();
  const reload = makeMachineReload(space, lid, box, bolt, belt, feedPath);
  space.add(lid, box, bolt, belt);
  const unit = .52;
  space.scale.setScalar(unit);
  space.position.set(0,.035,.122);
  body.add(space);
  const tip = v(0,.041,-1.96).multiplyScalar(unit).add(space.position);
  const port = v(.080,.032,-.432).multiplyScalar(unit).add(space.position);
  let lastCount = -1, lastFeed = -1, lastExtension = -1;
  function pose(p, empty, cycle, ads, rounds) {
    const extension = reload(p, empty, rounds);
    if (finger && p === 0) { finger.quaternion.copy(triggerBind); finger.rotateZ(-.13*(1-ease(cycle,.05,.72))); }

    // The last links run into the feed tray; a fresh belt is laid in before the cover closes.
    const feed = 1 - ease(cycle,0,.85);
    if (belt.count === lastCount && feed === lastFeed && extension === lastExtension) return;
    lastCount = belt.count;
    lastFeed = feed;
    lastExtension = extension;
    // Equal distances along the arc keep the rounds at the same pitch as the belt bends.
    // The far end of each steel strap terminates at the neighbouring link, even on the turn into the box.
    for (let i=0; i<=belt.count; i++) feedPath.getPointAt(Math.min(1,1-extension+(i+feed)/9),centers[i]);
    for (let i = 0; i < belt.count; i++) {
      const u = Math.min(1,1-extension+(i+feed)/9);
      link.position.copy(centers[i]);
      span.subVectors(centers[i+1],centers[i]);
      if (span.lengthSq()<1e-10 && i>0) span.subVectors(centers[i],centers[i-1]);
      const twist = Math.sin(Math.PI*u);
      link.rotation.set(.06+.12*twist,.07+.46*twist+.06*u,Math.atan2(-span.y,-span.x),'ZXY');
      link.updateMatrix();
      belt.setMatrixAt(i,link.matrix);
      span.applyQuaternion(inverseLink.copy(link.quaternion).invert());
      if (i===belt.count-1) span.set(0,0,0);
      belt.geometry.attributes.mgSpan.setXYZ(i,span.x,span.y,span.z);
    }
    belt.visible = belt.count > 0;
    belt.instanceMatrix.needsUpdate = true;
    belt.geometry.attributes.mgSpan.needsUpdate = true;
  }
  return { tip, port, sightY: space.position.y + sightLine * unit, pose };
}
