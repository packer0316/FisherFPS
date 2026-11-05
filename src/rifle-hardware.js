import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const tau = Math.PI * 2;
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

export function addReceiverHardware(space) {
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
  function railSection(profile, z0, z1) {
    const shape = new T.Shape();
    profile.forEach(([x,y], i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
    shape.closePath();
    return new T.ExtrudeGeometry(shape, {depth: z1-z0, bevelEnabled: false}).translate(0,0,z0);
  }
  kit.add(railSection([[-0.020,0.081],[-0.020,0.087],[-0.015,0.091],[0.015,0.091],[0.020,0.087],[0.020,0.081]], -0.470, -0.305), shell);
  for (let i = 0; i < 7; i++) {
    const z0 = -0.469 + i * 0.024;
    kit.add(railSection([[-0.015,0.089],[-0.0255,0.095],[-0.022,0.099],[0.022,0.099],[0.0255,0.095],[0.015,0.089]], z0, z0 + 0.0158), shell);
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

function opticMark(group) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ink = c.getContext('2d');
  ink.fillStyle = '#b8bcb4';
  ink.font = 'bold 39px sans-serif';
  ink.fillText('1×24', 21, 47);
  for (let i = 0; i < 6; i++) ink.fillRect(150 + 14 * i, i % 3 ? 32 : 21, 3, i % 3 ? 12 : 23);
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const mat = new T.MeshBasicMaterial({ map, transparent: true, opacity: 0.72, depthWrite: false, side: T.DoubleSide });
  const verts = [], uv = [], idx = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, a = Math.PI - 0.13 - 0.38 * t;
    for (const [s, z] of [[0, -0.030],[1, -0.006]]) {
      verts.push(0.02335 * Math.cos(a), 0.02335 * Math.sin(a), z);
      uv.push(s, t);
    }
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  group.add(new T.Mesh(g, mat));
}

export function addRifleSight(body, y, z, detailMap) {
  const scope = new T.Group();
  scope.name = 'TubeSight';
  scope.position.set(0, y, z);
  body.add(scope);
  const housing = alloy(0x444b4e, 0.69, 0.43);
  const bright = alloy(0x646c6c, 0.81, 0.365);
  const black = alloy(0x24292a, 0.30, 0.69);
  const bore = alloy(0x101315, 0.025, 0.94);
  bore.envMapIntensity = 0.22;
  housing.onBeforeCompile = shader => {
    shader.uniforms.machining = { value: detailMap };
    shader.vertexShader = 'varying vec3 vHousing;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vHousing = position;');
    shader.fragmentShader = 'uniform sampler2D machining; varying vec3 vHousing;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 grain = texture2D(machining, vec2(vHousing.z, vHousing.y + vHousing.x * 0.67) * 14.0).rg;
        diffuseColor.rgb *= 0.77 + 0.44 * grain.g;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float cut = vHousing.z * 780.0;
        float turning = sin(cut * 6.2832) * (1.0 - smoothstep(0.18, 0.75, fwidth(cut)));
        roughnessFactor += (grain.r - 0.5) * 0.24 + 0.019 * turning;`);
  };
  const kit = hardware(scope);
  // Continuous turned exterior and bore, with a chamfered ocular rim and stepped objective.
  kit.add(turned([[-0.043,0.0245],[-0.0422,0.0267],[-0.038,0.0267],[-0.0365,0.0245],
    [-0.033,0.0245],[-0.031,0.0231],[0.016,0.0231],[0.022,0.0254],[0.037,0.0261],
    [0.0406,0.0267],[0.0433,0.0267],[0.0445,0.0258],[0.0445,0.0236],[0.0435,0.0228]]), housing);
  kit.add(turned([[0.0435,0.0228],[0.040,0.0225],[0.034,0.0224],[0.033,0.0220],
    [0.032,0.0224],[0.025,0.0223],[0.024,0.0219],[0.023,0.0223],
    [-0.012,0.0224],[-0.035,0.0236],[-0.042,0.0240],[-0.043,0.0245]]), bore);
  const grip = turned([[0.0255,0.0256],[0.0268,0.0271],[0.0354,0.0271],[0.0366,0.0259]], 96);
  const gp = grip.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const px = gp.getX(i), py = gp.getY(i);
    if (Math.round(Math.atan2(py,px) * 48 / Math.PI) % 2)
      gp.setXYZ(i, px * 0.974, py * 0.974, gp.getZ(i));
  }
  grip.computeVertexNormals();
  kit.add(grip, housing);
  kit.add(turned([[0.041,0.02675],[0.0419,0.02690],[0.0423,0.0268]]), bright);
  // Split saddle, rail cross-bolts and recessed hex sockets.
  kit.add(new T.BoxGeometry(0.031,0.006,0.056), black, 0,-0.032,0);
  for (const zz of [-0.018,0.014]) {
    kit.add(new T.BoxGeometry(0.029,0.009,0.013), housing, 0,-0.0273,zz);
    kit.add(new T.BoxGeometry(0.005,0.008,0.016), housing,-0.0153,-0.0305,zz);
    kit.add(new T.CylinderGeometry(0.004,0.0043,0.0031,12), bright,-0.0188,-0.0298,zz,0,0,Math.PI/2);
    kit.add(new T.CylinderGeometry(0.0019,0.0019,0.0006,6), black,-0.0205,-0.0298,zz,0,0,Math.PI/2);
  }
  // Sealed elevation and windage caps share a cut knurl and contrasting witness marks.
  for (const top of [true, false]) {
    const zc = 0.002, rz = top ? 0 : -Math.PI / 2;
    const part = (shape, m, h) => kit.add(shape, m, top ? 0 : h, top ? h : 0, zc, 0, 0, rz);
    part(new T.CylinderGeometry(0.0093,0.0101,0.003,32), black, 0.0244);
    part(dial(0.0096,0.006,26), housing, 0.0285);
    part(new T.CylinderGeometry(0.0088,0.0094,0.0018,32), bright, 0.0324);
    part(new T.CylinderGeometry(0.00775,0.00775,0.0008,32), housing, 0.0334);
    part(new T.BoxGeometry(0.0090,0.00035,0.0010), black, 0.0339);
  }
  kit.finish();
  opticMark(scope);
  const glass = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 lensUv; varying vec3 eye;
      void main(){vec4 mv = modelViewMatrix * vec4(position,1.);
        eye = cameraPosition - (modelMatrix * vec4(position,1.)).xyz;
        lensUv = uv * 2. - 1.; gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec2 lensUv; varying vec3 eye;
      void main(){float rim=smoothstep(.64,1.,length(lensUv));
        vec3 ray = normalize(eye);
        float oblique = smoothstep(.10,.65,length(ray.xy));
        float sky = smoothstep(-.82,.86,lensUv.y + .30*lensUv.x + .55*ray.y);
        vec3 coating=mix(vec3(.035,.105,.12),vec3(.21,.32,.32),sky);
        gl_FragColor=vec4(coating,.037+.07*rim+oblique*(.08+.20*sky));
        #include <colorspace_fragment>
      }`,
  });
  const lens = new T.Mesh(new T.CircleGeometry(0.0224,48), glass);
  lens.position.z = 0.030;
  scope.add(lens);
  const dot = new T.Mesh(new T.CircleGeometry(0.00073,24), new T.MeshBasicMaterial({
    color: 0xff4230, toneMapped: false, depthWrite: false, transparent: true,
  }));
  dot.name = 'RedDot';
  dot.position.z = -0.037;
  scope.add(dot);
  return dot;
}
