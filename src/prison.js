import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePrisonRubble } from './prison-rubble.js';

const half = 24;
const up = new T.Vector3(0, 1, 0);

export function makePrison(scene, coarse, environment) {
  scene.background = new T.Color(0x192534);
  scene.backgroundIntensity = 0.84;
  scene.fog = new T.FogExp2(0x1c2a36, 0.018);
  scene.environment = environment;
  scene.environmentIntensity = 0.13;
  const hemi = new T.HemisphereLight(0xa9c7dc, 0x725446, 0.87);
  const sun = new T.DirectionalLight(0xc2d7e8, 1.2);
  sun.position.set(-14, 33, -19);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 34, bottom: -34, far: 82 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.00025;
  scene.add(sun, sun.target, hemi);
  const rim = new T.DirectionalLight(0xda9666, 0.87);
  rim.position.set(-19, 7, 12);
  scene.add(rim);
  const loader = new T.TextureLoader();
  loader.load('/prison/dusk.webp', (sky) => {
    sky.colorSpace = T.SRGBColorSpace;
    sky.mapping = T.EquirectangularReflectionMapping;
    scene.background = sky;
  });
  function tex(url, rx = 1, ry = 1, color = true) {
    const t = loader.load(url);
    if (color) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = coarse ? 2 : 4;
    return t;
  }
  const paint = (color, props = {}) =>
    new T.MeshStandardMaterial({ color, roughness: 0.82, ...props });
  const cement = paint(0x949594, {
    map: tex('/surfaces/plaster-diff.webp', 2, 1),
    normalMap: tex('/surfaces/plaster-nor_gl.webp', 2, 1, false),
    normalScale: new T.Vector2(0.4, 0.4),
  });
  const lower = paint(0x516864, {
    map: cement.map,
    normalMap: cement.normalMap,
    normalScale: new T.Vector2(0.4, 0.4),
  });
  const lip = paint(0x778183, { map: tex('/surfaces/stone-diff.webp', 3, 1) });
  const steel = paint(0x434e55, { metalness: 0.55, roughness: 0.48 });
  const rust = paint(0x715541, { metalness: 0.48, roughness: 0.64 });
  const dark = paint(0x202a30, { metalness: 0.35 });
  const patina = tex('/prison/weathering.webp', 1, 1, false);
  // The same packed map supplies oxide, pits, water streaks and fractures.
  // Project in metres so plates, round pipes and moving grilles have comparable detail.
  function weather(material, metal) {
    material.customProgramCacheKey = () => (metal ? 'oxidized-iron' : 'spalled-cement');
    material.onBeforeCompile = (s) => {
      s.uniforms.patina = { value: patina };
      s.vertexShader =
        'varying vec2 vWear;varying float vElevation;\n' +
        s.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vec3 n = abs(normal);
        vWear = n.y > max(n.x,n.z) ? position.xz : n.x > n.z ? position.zy : position.xy;
        vElevation = position.y;`,
        );
      s.fragmentShader =
        'varying vec2 vWear;varying float vElevation;uniform sampler2D patina;\n' +
        s.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
        vec4 detail=texture2D(patina,vWear*.33);
        vec4 leaks=texture2D(patina,vWear*vec2(.093,.116)+vec2(.43,.17));
        float pitting=smoothstep(.39,.62,detail.r*.58+leaks.r*.42);
        float drip=smoothstep(.40,.81,leaks.b*.71+detail.b*.29);
        ` +
            (metal
              ? `vec3 oxide=mix(vec3(.067,.027,.014),vec3(.31,.103,.039),detail.g);
          diffuseColor.rgb=mix(diffuseColor.rgb*(.64+.39*detail.g),oxide,pitting*.92)*(1.-.32*drip);`
              : `float exposed=smoothstep(.61,.74,leaks.r*.52+detail.r*.48);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.15,.132,.111)*(.48+.72*detail.g),exposed*.8);
          diffuseColor.rgb*=1.-.55*drip;
          diffuseColor.rgb*=mix(.28,1.,leaks.a);
          diffuseColor.rgb*=1.-.38*(1.-smoothstep(0.,1.9,vElevation))*smoothstep(.28,.72,leaks.g);`),
        );
      if (metal)
        s.fragmentShader = s.fragmentShader
          .replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.96,pitting);',
          )
          .replace(
            '#include <metalnessmap_fragment>',
            '#include <metalnessmap_fragment>\nmetalnessFactor*=1.-pitting*.88;',
          );
    };
  }
  for (const mat of [steel, rust, dark]) weather(mat, true);
  for (const mat of [cement, lower, lip]) weather(mat, false);
  const slab = paint(0xa2a6a7, {
    map: tex('/prison/court.webp'),
    roughnessMap: tex('/surfaces/paving-rough.webp', 15, 15, false),
    normalMap: tex('/surfaces/paving-nor_gl.webp', 15, 15, false),
    normalScale: new T.Vector2(0.18, 0.18),
    roughness: 0.84,
    metalness: 0.08,
  });
  slab.onBeforeCompile = (s) => {
    s.uniforms.patina = { value: patina };
    s.vertexShader =
      'varying vec3 vCourt;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCourt = position;',
      );
    s.fragmentShader =
      'varying vec3 vCourt;uniform sampler2D patina;\n' +
      s.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      vec2 p = vCourt.xz;
      vec2 tile = p / vec2(2.2,1.1); tile.x += 0.5 * mod(floor(tile.y),2.0);
      vec2 seam = min(fract(tile),1.0-fract(tile)) / max(fwidth(tile),vec2(0.0001));
      float grout = 1.0-smoothstep(0.0,1.15,min(seam.x,seam.y));
      vec4 wear=texture2D(patina,p*.092);
      diffuseColor.rgb *= (1.0 - 0.32*grout)*mix(.48,1.,wear.a)*(.78+.33*wear.g);
      float paintEdge = abs(abs(p.x)-20.1);
      float stripe=(1.-smoothstep(.07,.095,paintEdge))*smoothstep(.38,.59,wear.r);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.29,.18,.066),stripe*.64);
      float lamps = exp(-abs(abs(p.x)-22.4)*0.37) * exp(-abs(mod(p.y+4.,8.)-4.)*0.44);
      diffuseColor.rgb += vec3(.21,.065,.008)*lamps;`,
      );
    s.fragmentShader = s.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = max(0.49, roughnessFactor);',
    );
  };
  const doorFace = paint(0xc4c0ae, { map: tex('/prison/door.webp') });
  const upperFace = paint(0xc3cfce, { map: tex('/prison/upper.webp') });
  const wood = paint(0x93816c, { map: tex('/surfaces/wood-diff.webp', 1, 1) });
  const lamp = new T.MeshBasicMaterial({ color: 0xffc07b, toneMapped: false });
  const lightGlass = new T.MeshBasicMaterial({ color: 0x87aebf });
  // Backlit wire glass. Bake the dirt, putty and uneven transmission once for all windows.
  const glassCanvas = document.createElement('canvas');
  glassCanvas.width = 256;
  glassCanvas.height = 192;
  const glassCtx = glassCanvas.getContext('2d');
  let seed = 483651;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const glow = glassCtx.createRadialGradient(156, 52, 5, 142, 66, 176);
  glow.addColorStop(0, '#758b96');
  glow.addColorStop(0.6, '#435c6f');
  glow.addColorStop(1, '#182a35');
  glassCtx.fillStyle = glow;
  glassCtx.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 760; i++) {
    glassCtx.fillStyle = 'rgba(13,24,32,' + (0.03 + rand() * 0.12) + ')';
    glassCtx.fillRect(rand() * 256, rand() * 192, 1 + rand() * 2, 3 + rand() * 39);
  }
  glassCtx.strokeStyle = 'rgba(12,26,38,.18)';
  glassCtx.lineWidth = 0.8;
  glassCtx.beginPath();
  for (let x = -192; x < 448; x += 13) {
    glassCtx.moveTo(x, 0);
    glassCtx.lineTo(x + 192, 192);
    glassCtx.moveTo(x, 0);
    glassCtx.lineTo(x - 192, 192);
  }
  glassCtx.stroke();
  const glassMap = new T.CanvasTexture(glassCanvas);
  glassMap.colorSpace = T.SRGBColorSpace;
  const windowGlass = new T.MeshBasicMaterial({ map: glassMap, color: 0xbacdd7 });
  const fracturedGlass = new T.MeshBasicMaterial({ color: 0x414f5b });
  fracturedGlass.onBeforeCompile = (s) => {
    s.uniforms.patina = { value: patina };
    s.vertexShader =
      'varying vec2 vGlass;varying vec2 vEdge;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vGlass=vec2(abs(normal.x)>.6?position.z:position.x,position.y);vEdge=uv;`,
      );
    s.fragmentShader =
      'varying vec2 vGlass;varying vec2 vEdge;uniform sampler2D patina;\n' +
      s.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec4 dust=texture2D(patina,vGlass*vec2(.17,.10));
      float light=.5+.5*sin(vGlass.y*.53+vGlass.x*.23+dust.g*.27);
      float grime=smoothstep(.34,.82,dust.b);
      float edge=(1.-smoothstep(0.,.016,min(vEdge.y,1.-vEdge.x)));
      diffuseColor.rgb=mix(vec3(.021,.038,.047),vec3(.079,.119,.147),light)*(.98-.58*grime)
        +vec3(.075,.104,.117)*edge+.035*(1.-dust.a);`,
      );
  };
  const alarmLens = new T.MeshBasicMaterial({ color: 0xed7949, toneMapped: false });
  const atmosphereTime = { value: 0 };
  const haloes = [];
  const paintStripe = paint(0xb99c64, { roughness: 0.92 });
  const batches = new Map(),
    colliders = [],
    zones = [],
    gates = [];
  function solid(x, y, z, sx, sy, sz) {
    colliders.push(
      new T.Box3(
        new T.Vector3(x - sx / 2, y - sy / 2, z - sz / 2),
        new T.Vector3(x + sx / 2, y + sy / 2, z + sz / 2),
      ),
    );
  }
  function add(geo, mat, kind = 'wall') {
    const key = mat.uuid + kind;
    if (!batches.has(key)) batches.set(key, { mat, kind, list: [] });
    batches.get(key).list.push(geo);
  }
  function box(x, y, z, sx, sy, sz, mat, collision = false, kind = 'wall') {
    const geo = new T.BoxGeometry(sx, sy, sz).translate(x, y, z);
    if (mat === cement || mat === lower || mat === lip) {
      const { position, normal, uv } = geo.attributes;
      for (let i = 0; i < uv.count; i++) {
        const onX = Math.abs(normal.getX(i)) > 0.5,
          onY = Math.abs(normal.getY(i)) > 0.5;
        uv.setXY(
          i,
          (onX ? position.getZ(i) : position.getX(i)) * 0.23,
          (onY ? position.getZ(i) : position.getY(i)) * 0.36,
        );
      }
    }
    add(geo, mat, kind);
    if (collision) solid(x, y, z, sx, sy, sz);
  }
  function beam(x, y, z, X, Y, Z, r, mat) {
    const dir = new T.Vector3(X - x, Y - y, Z - z);
    const g = new T.CylinderGeometry(r, r, dir.length(), 6);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up, dir.normalize()));
    add(g.translate((x + X) / 2, (y + Y) / 2, (z + Z) / 2), mat);
  }
  function plate(label, x, y, z, width, height, yaw = 0, warning = false) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = warning ? '#754b34' : '#213137';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#9d9b88';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = warning ? '#ffdc99' : '#dbd9c8';
    ctx.font = 'bold 68px Arial';
    ctx.fillText(label, 256, 65, 473);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    add(
      new T.PlaneGeometry(width, height).rotateY(yaw).translate(x, y, z),
      paint(0xffffff, { map: t }),
    );
  }
  // Four exterior retaining walls surround a square court. The side gates lead into shallow cells.
  add(new T.PlaneGeometry(58, 58).rotateX(-Math.PI / 2), slab, 'ground');
  box(0, 5, -26.5, 55, 10, 0.8, cement, true);
  box(0, 5, 26.5, 55, 10, 0.8, cement, true);
  const gateZ = [-16, 0, 16];
  for (const side of [-1, 1]) {
    box(side * 27, 5, 0, 0.8, 10, 53, cement, true);
    for (let bay = 0; bay < 7; bay++) {
      const z = (bay - 3) * 8,
        gate = gateZ.includes(z);
      const x = side * 24.8;
      for (const level of [0, 1]) {
        const y = level * 4.35,
          face = level ? upperFace : doorFace;
        for (const sign of [-1, 1]) {
          box(x, y + 2.08, z + sign * 2.95, 0.8, 4.15, 2.1, cement, true);
          box(x - side * 0.42, y + 0.7, z + sign * 2.95, 0.09, 1.36, 2.08, lower);
        }
        box(x, y + 3.86, z, 0.8, 0.64, 4, cement, true);
        if (!gate || level) {
          box(x + side * 0.13, y + 1.73, z, 0.38, 3.46, 3.8, face, true);
          box(x - side * 0.16, y + 2.3, z, 0.08, 1.05, 1.5, dark);
          for (let n = -2; n <= 2; n++)
            box(x - side * 0.24, y + 2.3, z + n * 0.26, 0.09, 1.03, 0.065, rust);
        }
        box(x - side * 0.52, y + 3.35, z, 0.29, 0.17, 1.05, dark);
        if ((bay + level + (side > 0 ? 2 : 0)) % 4 !== 1)
          box(x - side * 0.7, y + 3.32, z, 0.07, 0.095, 0.87, lamp);
      }
      box(side * 24.05, 4.35, z, 3.0, 0.34, 7.99, lip, true);
      for (const dy of [4.96, 5.44]) {
        if ((bay === 2 && side < 0) || (bay === 4 && side > 0)) {
          beam(side * 22.66, dy, z - 4, side * 22.55, dy - 0.08, z - 1, 0.055, rust);
          beam(side * 22.55, dy - 0.08, z - 1, side * 22.2, dy - 0.72, z + 0.4, 0.055, rust);
          beam(side * 22.6, dy - 0.16, z + 2.6, side * 22.66, dy, z + 4, 0.055, rust);
        } else box(side * 22.66, dy, z, 0.07, 0.07, 8, steel);
      }
      for (const dz of [-3.9, -1.3, 1.3]) box(side * 22.66, 4.93, z + dz, 0.075, 1.13, 0.075, rust);
      box(x - side * 0.5, 4.04, z + 3.85, 0.55, 8.1, 0.31, steel, true);
      if (gate) {
        const pieces = [];
        for (let i = -5; i <= 5; i++)
          pieces.push(new T.BoxGeometry(0.12, 3.45, 0.08).translate(0, 1.74, i * 0.33));
        for (const gy of [0.19, 1.68, 3.38])
          pieces.push(new T.BoxGeometry(0.16, 0.115, 3.7).translate(0, gy, 0));
        const geo = mergeGeometries(pieces);
        pieces.forEach((g) => g.dispose());
        const mesh = new T.Mesh(geo, rust);
        mesh.position.set(x, 0, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.impactKind = 'wall';
        scene.add(mesh);
        mesh.updateMatrixWorld();
        zones.push(mesh);
        gates.push({ mesh, side, z, x, hold: 0, lift: 0 });
        plate(
          (side < 0 ? 'W' : 'E') + ' / ' + String(bay + 1).padStart(2, '0'),
          x - side * 0.49,
          3.9,
          z,
          2.05,
          0.46,
          (-side * Math.PI) / 2,
        );
      }
    }
    for (const y of [8.72, 9.1]) beam(side * 23.9, y, -26, side * 23.9, y, 26, 0.115, rust);
  }
  // North guardhouse windows, security shutters, beams and suspended service lamps.
  for (const end of [-1, 1]) {
    const z = end * 25.98;
    box(0, 2.0, z, 50, 4, 0.45, lower);
    for (let i = -4; i <= 4; i++) {
      const x = i * 5.1;
      box(x, 6.55, z - end * 0.32, 4.55, 3.2, 0.19, windowGlass);
      if (Math.abs(i) === 2 || Math.abs(i) === 4) {
        for (let k = 0; k < 6; k++) box(x, 5.14 + k * 0.28, z - end * 0.5, 4.5, 0.2, 0.15, dark);
      }
      for (const dx of [-2.16, -1.44, -0.72, 0, 0.72, 1.44, 2.16])
        box(x + dx, 6.55, z - end * 0.46, 0.1, 3.32, 0.12, steel);
      for (const y of [5.0, 6.55, 8.12]) box(x, y, z - end * 0.46, 4.6, 0.14, 0.13, dark);
      box(x + 2.48, 4.5, z - end * 0.36, 0.39, 9, 0.78, cement);
    }
    for (const x of [-5, 0, 5]) {
      box(x, 2.0, z - end * 0.4, 4.65, 4.02, 0.17, dark);
      for (let k = -5; k <= 5; k++) box(x + k * 0.39, 2, z - end * 0.55, 0.08, 3.95, 0.12, steel);
      for (const y of [0.23, 1.97, 3.82]) box(x, y, z - end * 0.6, 4.62, 0.13, 0.14, rust);
    }
    plate(
      end < 0 ? 'BLOCK   C' : 'INTAKE',
      0,
      4.36,
      z - end * 0.66,
      6.5,
      0.9,
      end < 0 ? 0 : Math.PI,
    );
    for (const x of [-18, 18]) {
      plate('RESTRICTED', x, 2.35, z - end * 0.35, 3, 0.63, end < 0 ? 0 : Math.PI, true);
      box(x, 1.1, z - end * 0.3, 10, 0.07, 0.15, rust);
    }
    box(0, 4.65, z - end * 0.36, 50, 0.35, 0.57, steel);
    for (const x of [-9.5, 9.5]) {
      beam(x, 0.12, z - end * 0.58, x, 4.37, z - end * 0.58, 0.14, rust);
      beam(x, 4.37, z - end * 0.58, x + 2.7, 4.37, z - end * 0.58, 0.14, rust);
      for (const y of [0.62, 2.85, 4.25]) box(x, y, z - end * 0.58, 0.34, 0.09, 0.35, dark);
    }
  }
  const roof = paint(0x33434c, { metalness: 0.44 });
  weather(roof, true);
  const brick = paint(0x79655a, { map: tex('/surfaces/stone-diff.webp', 1, 1) });
  weather(brick, false);
  const eaves = 24,
    truss = eaves - 3.2;
  // Three tall arched lights high above the original two-storey cell block.
  // The missing glass opens onto the exterior; the remaining panes carry the wire pattern.
  function brokenPane(x, y, z, w, h, side, missing) {
    const g = new T.PlaneGeometry(w, h);
    if (missing) {
      const pos = g.attributes.position;
      pos.setY(2, h * (rand() * 0.39 - 0.06));
      pos.setY(3, h * (rand() * 0.54 - 0.19));
      pos.setX(3, w * (0.16 + rand() * 0.34));
    }
    if (side > 0) g.rotateY(Math.PI);
    add(g.translate(x, y, z), fracturedGlass);
  }
  for (const side of [-1, 1]) {
    const ez = side * 26.1,
      face = ez - side * 0.46;
    box(0, 10.3, ez, 53, 2.6, 0.7, cement);
    box(0, 22.72, ez, 53, 2.55, 0.7, cement);
    for (const x of [-24, -8, 8, 24]) {
      box(x, 16.25, ez, 3.35, 13.5, 1.25, brick);
      box(x, 15.7, face - side * 0.34, 0.52, 16.4, 0.62, steel);
      for (const y of [9.4, 13, 16.6, 20.1, 23.4])
        box(x, y, face - side * 0.45, 0.86, 0.23, 0.67, rust);
    }
    for (const x of [-16, 0, 16]) {
      const sill = 11.6,
        spring = 17.3,
        rx = 6.15,
        ry = 4.22;
      box(x, sill, face, 12.8, 0.43, 0.94, lip);
      for (let n = 0; n <= 8; n++) {
        const dx = (n / 4 - 1) * rx,
          cap = spring + ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2));
        box(x + dx, (sill + cap) * 0.5, face, 0.1, cap - sill, 0.2, rust);
        if (n === 8) break;
        const cx = x + dx + rx / 8,
          paneWidth = rx / 4 - 0.1;
        for (let row = 0; row < 2; row++) {
          const chip = rand();
          if (chip > 0.25)
            brokenPane(cx, sill + 1.51 + row * 2.83, ez, paneWidth, 2.73, side, chip < 0.62);
        }
      }
      box(x, spring, face, rx * 2, 0.24, 0.27, steel);
      box(x, sill + 2.93, face, rx * 2, 0.14, 0.23, rust);
      for (let k = 0; k < 14; k++) {
        const a = (k * Math.PI) / 14,
          b = ((k + 1) * Math.PI) / 14;
        beam(
          x + rx * Math.cos(a),
          spring + ry * Math.sin(a),
          face,
          x + rx * Math.cos(b),
          spring + ry * Math.sin(b),
          face,
          0.19,
          steel,
        );
      }
      for (let k = 1; k < 8; k++) {
        const a = (k * Math.PI) / 8;
        beam(x, spring, face, x + rx * Math.cos(a), spring + ry * Math.sin(a), face, 0.068, rust);
      }
    }
    for (let bay = -3; bay <= 3; bay++) {
      const z = bay * 8,
        x = side * 25.7;
      box(x, 10.7, z, 0.65, 3.85, 8, cement);
      box(x, 21.4, z, 0.64, 5.25, 8, brick);
      for (const dz of [-3.39, 3.39]) box(x, 15.75, z + dz, 0.64, 6.3, 1.25, cement);
      for (const dz of [-2.35, -0.78, 0.78, 2.35]) {
        box(x - side * 0.12, 15.7, z + dz, 0.19, 6.1, 0.09, steel);
        if (rand() > 0.35)
          box(x + side * 0.1, 16.96, z + dz + 0.42, 0.1, rand() * 2.1 + 1.2, 0.71, fracturedGlass);
      }
      box(x, 15.8, z, 0.26, 0.18, 6, rust);
      box(x - side * 0.38, 16.8, z - 3.95, 0.67, 14, 0.52, steel);
      beam(x - side * 0.7, 17.8, z - 3.95, x - side * 4.3, truss, z - 3.95, 0.2, rust);
      if (!(bay === 1 && side < 0)) box(side * 21.7, eaves, z, 10.7, 0.24, 7.88, roof);
      if (bay !== -1) box((bay + 3) * 7.5 - 22.5, eaves, side * 23.55, 7.44, 0.24, 4.55, roof);
    }
    for (const y of [9.45, 12.65, 19.1, eaves]) box(side * 25.22, y, 0, 0.48, 0.32, 54, rust);
  }
  for (let z = -24; z <= 24; z += 8) {
    box(0, truss, z, 52, 0.34, 0.32, steel);
    for (const side of [-1, 1]) {
      beam(side * 26, eaves - 0.25, z, 0, eaves + 2.1, z, 0.24, rust);
      for (let x = 0; x < 24; x += 4)
        beam(side * x, truss, z, side * (x + 4), eaves + 2.1 - (x + 4) * 0.09, z, 0.13, steel);
    }
    for (const x of [-14, 14]) {
      const y = truss - 2.4 - ((z + 24) % 16) * 0.16;
      beam(x, truss, z, x, y, z, 0.047, dark);
      box(x, y, z, 1.92, 0.27, 0.68, dark);
      if ((x + z) % 3 !== 0) box(x, y - 0.142, z, 1.64, 0.055, 0.49, lightGlass);
    }
  }
  // Suspended power conduits sag between the trusses, above headroom and the drop paths.
  for (const side of [-1, 1]) {
    for (let cable = 0; cable < 2; cable++)
      for (let bay = -3; bay < 3; bay++) {
        const x = side * (10.2 + cable * 0.29),
          z = bay * 8;
        const sag = 1.92 + ((bay + 4 + cable) % 3) * 0.82;
        let lastY = truss + 0.2;
        for (let k = 1; k <= 8; k++) {
          const t = k / 8,
            y = truss + 0.2 - 4 * sag * t * (1 - t);
          beam(x, lastY, z + k - 1, x, y, z + k, cable ? 0.034 : 0.052, dark);
          lastY = y;
        }
      }
  }
  // Sparse cover, outside the central dodge lanes. Tops are valid player jump surfaces.
  function crate(x, z, w, h) {
    box(x, h / 2, z, w, h, w, wood, true, 'prop');
    for (const sign of [-1, 1]) {
      box(x, h - 0.08, z + sign * w * 0.5, w + 0.08, 0.15, 0.09, rust);
      box(x, 0.12, z + sign * w * 0.5, w + 0.08, 0.17, 0.09, rust);
      for (const side of [-1, 1])
        box(x + side * w * 0.38, h / 2, z + sign * w * 0.51, 0.11, h, 0.08, steel);
    }
  }
  crate(-12, 8, 2.05, 1.02);
  crate(-14.2, 8.55, 1.9, 1.77);
  crate(14, -11, 2, 1.1);
  crate(16.05, -11.8, 2.1, 1.63);
  crate(-12, -14, 2.3, 1.4);
  // Spalled pieces below the two broken rails, kept out of the inner dodge lanes.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const x = side * (20.35 + rand() * 2.7),
        z = side * 8 + (rand() - 0.5) * 6.2,
        span = 0.12 + 0.49 * rand();
      const chunk = new T.BoxGeometry(span, 0.11 + rand() * 0.18, span * (0.48 + rand() * 0.45));
      chunk.rotateX(rand() * 0.44);
      chunk.rotateZ(rand() * 0.32);
      chunk.rotateY(rand() * Math.PI);
      add(chunk.translate(x, 0.07, z), lip, 'prop');
    }
    // Only a silhouette and dim cabin windows are visible across the high broken openings.
    const tx = -side * 8.5,
      tz = side * 51;
    for (const dx of [-2.8, 2.8])
      for (const dz of [-2, 2]) {
        beam(tx + dx, 0, tz + dz, tx + dx, 16.4, tz + dz, 0.27, steel);
      }
    for (const y of [4, 10]) beam(tx - 2.8, y, tz, tx + 2.8, y + 6, tz, 0.16, steel);
    box(tx, 17.7, tz, 6.6, 3.6, 5.1, dark);
    box(tx, 18.55, tz - side * 2.61, 5.7, 0.87, 0.14, windowGlass);
    for (const dx of [-1.35, 1.35]) box(tx + dx, 18.54, tz - side * 2.72, 0.1, 0.97, 0.17, rust);
    box(tx, 19.68, tz, 7.7, 0.35, 6.2, steel);
    beam(tx + 2.2, 19.85, tz, tx + 2.2, 24.6, tz, 0.08, steel);
    box(tx + 2.2, 24.62, tz, 0.17, 0.2, 0.17, alarmLens);
    for (const x of [-8.25, 8.25]) {
      box(x, 4.2, side * 25.12, 0.65, 0.62, 0.28, dark);
      box(x, 4.23, side * 24.92, 0.42, 0.31, 0.21, alarmLens);
      haloes.push(
        new T.PlaneGeometry(4.6, 4.1)
          .rotateY(side < 0 ? 0 : Math.PI)
          .translate(x, 4.23, side * 24.79),
      );
    }
  }
  for (const [x, z] of [
    [13, 8],
    [-16, -3],
  ]) {
    box(x, 1.05, z, 3.5, 0.16, 1.4, wood, true, 'prop');
    for (const dx of [-1.43, 1.43])
      for (const dz of [-0.48, 0.48])
        box(x + dx, 0.51, z + dz, 0.11, 1.03, 0.11, steel, true, 'prop');
  }
  for (const x of [-20.6, 20.6]) {
    box(x, 0.009, 0, 0.22, 0.013, 48, dark);
    for (let z = -23; z < 24; z += 0.63) box(x, 0.019, z, 0.25, 0.012, 0.076, steel);
  }
  for (const z of gateZ) for (const x of [-22, 22]) box(x, 0.012, z, 0.16, 0.012, 3.6, paintStripe);
  for (const { mat, kind, list } of batches.values()) {
    const g = mergeGeometries(list);
    list.forEach((p) => p.dispose());
    const o = new T.Mesh(g, mat);
    o.castShadow = kind !== 'ground' && mat !== roof;
    o.receiveShadow = true;
    o.userData.impactKind = kind;
    scene.add(o);
    zones.push(o);
  }
  for (const [x, z, color] of [
    [-21, -6, 0xff783d],
    [21, 9, 0xffac60],
    [0, -21, 0x83bde8],
  ]) {
    const light = new T.PointLight(color, x ? 82 : 110, 26, 2);
    light.position.set(x, x ? 3.45 : 8, z);
    scene.add(light);
  }
  const shafts = [];
  for (const x of [-16, 0, 16]) {
    const geometry = new T.PlaneGeometry(9.4, 16);
    const { position, uv } = geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      const fall = 1 - uv.getY(i);
      position.setXYZ(
        i,
        x + position.getX(i) * (1 + fall * 0.22) + fall * 2.9,
        17.55 - fall * 17.4,
        -25.3 + fall * 13.6,
      );
    }
    shafts.push(geometry);
  }
  const haze = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    vertexShader:
      'varying vec2 beamUv;void main(){beamUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 beamUv;void main(){
      float u=beamUv.x,v=beamUv.y;
      float edges=smoothstep(0.,.25,u)*smoothstep(0.,.25,1.-u);
      float panes=.72+.28*cos(u*37.);
      float density=pow(v,1.15)*smoothstep(0.,.20,1.-v)*edges*panes;
      gl_FragColor=vec4(.28,.48,.64,density*.21);
    }`,
  });
  haze.forceSinglePass = true;
  const dust = new T.Mesh(mergeGeometries(shafts), haze);
  shafts.forEach((g) => g.dispose());
  scene.add(dust);
  const haloMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { clock: atmosphereTime },
    vertexShader:
      'varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 p;uniform float clock;void main(){
      float r=dot(p,p);float light=exp(-r*8.)*.37+exp(-r*48.)*.42;
      gl_FragColor=vec4(.95,.19,.043,light*(.84+.16*sin(clock*2.4)));
    }`,
  });
  scene.add(new T.Mesh(mergeGeometries(haloes), haloMat));
  haloes.forEach((g) => g.dispose());
  // One draw call for the fine dust lit by the broken windows.
  const moteCount = coarse ? 80 : 185,
    motes = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motes[i * 3] = rand() * 46 - 23;
    motes[i * 3 + 1] = 0.3 + rand() * 17;
    motes[i * 3 + 2] = rand() * 44 - 22;
  }
  const dustGeometry = new T.BufferGeometry();
  dustGeometry.setAttribute('position', new T.BufferAttribute(motes, 3));
  const dustSpecks = new T.Points(
    dustGeometry,
    new T.ShaderMaterial({
      uniforms: { clock: atmosphereTime },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: `uniform float clock;varying float glint;void main(){
      vec3 p=position;float seed=p.x*1.7+p.y*2.1;
      p.x+=sin(clock*.24+seed)*.40;p.y+=sin(clock*.38+seed)*.53;
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(30./max(.2,-mv.z),1.,3.);
      glint=(.1+.12*abs(sin(clock*.5+seed)))*smoothstep(1.,4.,-mv.z);
    }`,
      fragmentShader: `varying float glint;void main(){float r=length(gl_PointCoord-.5);
      gl_FragColor=vec4(.74,.72,.65,glint*(1.-smoothstep(.04,.49,r)));}`,
    }),
  );
  scene.add(dustSpecks);
  function overlap(b, x, z, r) {
    return x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z;
  }
  function blocked(x, z, r = 0.32, feet = 0, height = 1.84, step = 0.24) {
    if (Math.abs(x) > half - r || Math.abs(z) > 25 - r) return true;
    return colliders.some(
      (b) => overlap(b, x, z, r) && b.max.y > feet + step && b.min.y < feet + height - 0.002,
    );
  }
  function verticalLimits(x, z, feet, height) {
    let floor = 0,
      ceiling = Infinity;
    for (const b of colliders)
      if (overlap(b, x, z, 0.32)) {
        if (b.max.y <= feet + 0.002) floor = Math.max(floor, b.max.y);
        if (b.min.y >= feet + height - 0.002) ceiling = Math.min(ceiling, b.min.y - height);
      }
    return { floor, ceiling };
  }
  let sequence = 0;
  function openGate(player) {
    for (let i = 0; i < gates.length; i++) {
      const g = gates[sequence++ % gates.length];
      if (!g.hold && Math.hypot(g.x - player.x, g.z - player.z) > 7) {
        g.hold = 3.6;
        return g;
      }
    }
    return null;
  }
  function updateGates(dt) {
    const t = atmosphereTime.value;
    alarmLens.color.setRGB(
      0.87 + 0.11 * Math.sin(t * 2.4),
      0.12 + 0.044 * Math.sin(t * 2.4),
      0.042,
    );
    for (const g of gates) {
      g.hold = Math.max(0, g.hold - dt);
      const y = T.MathUtils.clamp(g.lift + (g.hold > 0 ? 1.9 : -1.25) * dt, 0, 1);
      if (y === g.lift) continue;
      g.lift = y;
      g.mesh.position.y = 3.56 * T.MathUtils.smoothstep(y, 0, 1);
      g.mesh.updateMatrixWorld();
    }
  }
  scene.updateMatrixWorld(true);
  return {
    prison: true,
    bossArena: true,
    navigationBounds: {x:half,z:25},
    dropCeilingY: eaves,
    rubble: makePrisonRubble(scene, coarse, colliders, truss, cement),
    sun,
    colliders,
    zones,
    blocked,
    verticalLimits,
    terrainHeight: () => 0,
    district: () => '監獄中庭',
    breeze: atmosphereTime,
    centerShadow: () => {},
    openGate,
    updateGates,
    resetGates() {
      for (const g of gates) {
        g.hold = g.lift = g.mesh.position.y = 0;
        g.mesh.updateMatrixWorld();
      }
    },
  };
}
