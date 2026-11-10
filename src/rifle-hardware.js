import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addOpticMarkings, addOpticGlass } from './rifle-optics.js';

const alloy = (color, metalness, roughness) => new T.MeshStandardMaterial({ color, metalness, roughness });

// One mesh per finish, regardless of the number of grooves, fasteners or witness marks.
function hardware(parent) {
  const groups = new Map(), matrix = new T.Matrix4(), quaternion = new T.Quaternion();
  return {
    add(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      quaternion.setFromEuler(new T.Euler(rx, ry, rz));
      matrix.compose(new T.Vector3(x, y, z), quaternion, new T.Vector3(1, 1, 1));
      const part = geo.index ? geo.toNonIndexed() : geo;
      part.applyMatrix4(matrix);
      part.deleteAttribute('uv');
      if (!groups.has(material)) groups.set(material, []);
      groups.get(material).push(part);
      if (part !== geo) geo.dispose();
    },
    finish() {
      for (const [mat, parts] of groups) {
        parent.add(new T.Mesh(mergeGeometries(parts, false), mat));
        parts.forEach(p => p.dispose());
      }
    },
  };
}

export function addReceiverHardware(space, detailMap) {
  const receiver = space.getObjectByName('ReceiverGeometry');
  const shell = alloy(0x454d51, 0.74, 0.42), pins = alloy(0x596061, 0.79, 0.36);
  const kit = hardware(space), ray = new T.Raycaster(), direction = new T.Vector3(), origin = new T.Vector3();
  const hits = [];
  function surface() {
    hits.length = 0;
    ray.set(origin, direction);
    ray.intersectObject(receiver, false, hits);
    return hits[0]?.point;
  }
  // Sample the imported cover itself so a pressed rib meets its curved shoulders.
  for (const z of [-0.538, -0.282, -0.235]) {
    const vertices = [], indices = [];
    const shoulders = [[-0.007,-0.0005],[-0.005,0.0012],[-0.002,0.0028],[0.002,0.0028],[0.005,0.0012],[0.007,-0.0005]];
    for (let i = 0; i <= 22; i++) {
      const angle = (i / 22 - 0.5) * 2.52, dx = Math.sin(angle), dy = Math.cos(angle);
      for (const [dz, height] of shoulders) {
        origin.set(-0.0005 + dx * 0.095, 0.038 + dy * 0.095, z + dz);
        direction.set(-dx, -dy, 0);
        const hit = surface();
        if (!hit) break;
        const rise = height * Math.min(1, i / 2, (22 - i) / 2);
        vertices.push(hit.x + dx * rise, hit.y + dy * rise, hit.z);
      }
    }
    if (vertices.length !== 23 * shoulders.length * 3) continue;
    for (let i = 0; i < 22; i++)
      for (let j = 0; j < shoulders.length - 1; j++) {
        const a = i * shoulders.length + j, b = a + shoulders.length;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    kit.add(geo, shell);
  }
  for (const side of [-1, 1]) {
    for (const [z, y, r] of [[-0.62,0.026,0.006],[-0.594,0.014,0.005],[-0.58,0.033,0.006],[-0.28,-0.015,0.005],[-0.194,0.015,0.006]]) {
      origin.set(side * 0.11, y, z);
      direction.set(-side, 0, 0);
      const hit = surface();
      if (!hit || side * hit.x < 0.015) continue;
      const head = new T.SphereGeometry(1, 12, 6);
      head.scale(0.0028, r, r);
      kit.add(head, pins, hit.x, y, z);
    }
  }
  // The spring-guide button protrudes from the rear slope of the cover.
  origin.set(-0.0007, 0.045, -0.071);
  direction.set(0, 0, -1);
  const rear = surface();
  if (rear) {
    kit.add(new RoundedBoxGeometry(0.019,0.012,0.017,2,0.0023), shell, rear.x, rear.y, rear.z + 0.003);
    for (const dy of [-0.0034, 0, 0.0034])
      kit.add(new T.BoxGeometry(0.0165,0.0010,0.0016), pins, rear.x, rear.y + dy, rear.z + 0.012);
  }
  // Replace the flat adapter with a dovetailed foot and open cross slots.
  space.getObjectByName('OpticRailAdapterGeometry').visible = false;
  const rail = alloy(0x303639, 0.64, 0.43);
  opticFinish(rail, detailMap, 'anodized');
  function railSection(profile, z0, z1) {
    const shape = new T.Shape();
    profile.forEach(([x,y], i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
    shape.closePath();
    return new T.ExtrudeGeometry(shape, {depth: z1-z0, bevelEnabled: true,
      bevelThickness: 0.0008, bevelSize: 0.0007, bevelSegments: 1, steps: 1}).translate(0,0,z0);
  }
  // The adapter follows the receiver's narrow crown; its rear ends underneath
  // the sight foot instead of leaving a stack of wide bars in the ADS view.
  kit.add(railSection([[-0.016,0.081],[-0.016,0.087],[-0.013,0.092],[0.013,0.092],[0.016,0.087],[0.016,0.081]], -0.470, -0.342), rail);
  for (let i = 0; i < 5; i++) {
    const z0 = -0.467 + i * 0.026;
    kit.add(railSection([[-0.013,0.090],[-0.019,0.095],[-0.017,0.099],[0.017,0.099],[0.019,0.095],[0.013,0.090]], z0, z0 + 0.0185), rail);
  }
  kit.finish();
}

function turned(profile, segments = 48) {
  const g = new T.LatheGeometry(profile.map(([axial, radius]) => new T.Vector2(radius, axial)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

function dial(radius, height, teeth) {
  const g = new T.CylinderGeometry(radius, radius, height, teeth * 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (Math.round(Math.atan2(x, z) * teeth / Math.PI) % 2)
      p.setXYZ(i, x * 0.94, p.getY(i), z * 0.94);
  }
  g.computeVertexNormals();
  return g;
}

// Reuse the rifle's packed finish texture for three distinct surface treatments.
// Object-space sampling keeps grain continuous across the merged hardware, and
// micro-relief uses derivatives rather than extra geometry or render passes.
function opticFinish(material, detailMap, kind) {
  const rubber = kind === 'rubber', brushed = kind === 'brushed';
  const height = rubber ? '0.000010' : brushed ? '0.000003' : '0.000006';
  material.customProgramCacheKey = () => 'optic-finish-' + kind;
  material.onBeforeCompile = shader => {
    shader.uniforms.machining = { value: detailMap };
    shader.vertexShader = 'varying vec3 vHousing;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vHousing = position;');
    shader.fragmentShader = 'uniform sampler2D machining; varying vec3 vHousing;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 opticUv = vec2(vHousing.z, vHousing.y + vHousing.x * 0.67);
        vec2 grain = texture2D(machining, opticUv * 20.0).rg;
        float pores = texture2D(machining, opticUv * 95.0).r;
        float cut = vHousing.z * 1100.0;
        float turning = sin(cut * 6.2832) * (1.0 - smoothstep(0.18, 0.75, fwidth(cut)));
        diffuseColor.rgb *= 0.88 + 0.18 * grain.g + 0.05 * pores;
        float opticHeight = ${height} * (pores + 0.25 * grain.r);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (grain.r - 0.5) * ${rubber ? '0.16' : '0.12'}
          + (pores - 0.5) * 0.07 + turning * ${brushed ? '0.045' : '0.012'}, 0.22, 0.94);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 surfaceDx = dFdx(-vViewPosition), surfaceDy = dFdy(-vViewPosition);
        vec3 tangentX = cross(surfaceDy, normal), tangentY = cross(normal, surfaceDx);
        float determinant = dot(surfaceDx, tangentX);
        vec3 relief = sign(determinant) * (dFdx(opticHeight) * tangentX + dFdy(opticHeight) * tangentY);
        normal = normalize(max(abs(determinant), 1e-10) * normal - relief);`);
  };
}

export function addRifleSight(body, y, z, detailMap) {
  const scope = new T.Group();
  scope.name = 'TubeSight';
  scope.position.set(0, y, z);
  body.add(scope);
  const housing = alloy(0x303639, 0.64, 0.43);
  const bright = alloy(0x596266, 0.79, 0.35);
  const black = alloy(0x1d2325, 0.12, 0.76);
  const bore = alloy(0x101315, 0.025, 0.94);
  bore.envMapIntensity = 0.22;
  opticFinish(housing, detailMap, 'anodized');
  opticFinish(bright, detailMap, 'brushed');
  opticFinish(black, detailMap, 'rubber');
  const kit = hardware(scope);
  // Continuous turned exterior and bore, with a chamfered ocular rim and stepped objective.
  kit.add(turned([[-0.043,0.0245],[-0.0422,0.0267],[-0.038,0.0267],[-0.0365,0.0245],
    [-0.033,0.0245],[-0.031,0.0231],[0.016,0.0231],[0.022,0.0254],[0.037,0.0261],
    [0.0406,0.0267],[0.0433,0.0267],[0.0445,0.0258],[0.0445,0.0236],[0.0435,0.0228]],64), housing);
  kit.add(turned([[0.0435,0.0228],[0.040,0.0225],[0.034,0.0224],[0.033,0.0220],
    [0.032,0.0224],[0.025,0.0223],[0.024,0.0219],[0.023,0.0223],
    [-0.012,0.0224],[-0.035,0.0236],[-0.042,0.0240],[-0.043,0.0245]]), bore);
  const grip = turned([[0.0255,0.0256],[0.0268,0.0280],[0.0354,0.0280],[0.0366,0.0259]], 128);
  const gp = grip.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const px = gp.getX(i), py = gp.getY(i);
    if (Math.round(Math.atan2(py,px) * 64 / Math.PI) % 2)
      gp.setXYZ(i, px * 0.978, py * 0.978, gp.getZ(i));
  }
  grip.computeVertexNormals();
  kit.add(grip, black);
  kit.add(turned([[0.041,0.02675],[0.0419,0.02690],[0.0423,0.0268]]), bright);
  // Fine concentric seats catch light at the ocular edge; the bore stays matte.
  for(const zz of [.038,.0405])kit.add(new T.TorusGeometry(.0229,.00022,5,64),bright,0,0,zz);
  for(const zz of [-.0395,-.0368])kit.add(new T.TorusGeometry(.0250,.00028,5,64),black,0,0,zz);
  // Split saddle, rail cross-bolts and recessed hex sockets.
  kit.add(new RoundedBoxGeometry(0.023,0.003,0.056,2,.0007), housing, 0,-0.0334,0);
  for (const zz of [-0.018,0.014]) {
    kit.add(new RoundedBoxGeometry(0.021,0.0095,0.012,2,.0012), housing, 0,-0.0273,zz);
    kit.add(new RoundedBoxGeometry(0.0032,0.0064,0.013,1,.0004), housing,-0.0126,-0.0312,zz);
    kit.add(new T.CylinderGeometry(0.0027,0.0029,0.0016,12), bright,-0.0146,-0.0302,zz,0,0,Math.PI/2);
    kit.add(new T.CylinderGeometry(0.0013,0.0013,0.0003,6), bore,-0.0155,-0.0302,zz,0,0,Math.PI/2);
  }
  // Main control on the visible left side, as in the supplied compact optic.
  // The roof has only a low-profile service screw, not a tall adjustment turret.
  const sidePart=(shape,material,h)=>kit.add(shape,material,-h,.003,-.010,0,0,Math.PI/2);
  sidePart(new T.CylinderGeometry(.0105,.0114,.003,40),black,.0243);
  sidePart(dial(.0128,.009,40),housing,.0300);
  sidePart(new T.CylinderGeometry(.0118,.0124,.0021,48),bright,.0353);
  sidePart(new T.CylinderGeometry(.0112,.0118,.0011,48),black,.0366);
  kit.add(new T.CylinderGeometry(.0051,.0056,.002,32),housing,0,.0242,-.014);
  kit.add(new T.CylinderGeometry(.0024,.0024,.0004,6),bore,0,.02535,-.014);
  // Split mounting bands, clamp ears, recessed screws and a fixed dial index.
  for(const zz of [-.029,.017]){
    kit.add(turned([[zz-.0017,.02325],[zz-.0013,.0240],[zz+.0013,.0240],[zz+.0017,.02325]],64),housing);
    for(const side of [-1,1]){
      kit.add(new RoundedBoxGeometry(.004,.005,.0055,1,.0005),housing,side*.0258,-.003,zz);
      kit.add(new T.CylinderGeometry(.0016,.0016,.0005,12),bright,side*.0281,-.003,zz,0,0,Math.PI/2);
      kit.add(new T.CylinderGeometry(.0008,.0008,.0006,6),bore,side*.0284,-.003,zz,0,0,Math.PI/2);
    }
  }
  kit.add(new T.BoxGeometry(.0008,.003,.001),bright,-.0240,.0175,-.010);
  kit.finish();
  addOpticMarkings(scope);
  return addOpticGlass(scope);
}
