import * as T from 'three';
import { buildTerrain, terrainHeight, terrainName } from './terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const TAU = Math.PI * 2;
export const bounds = { x: 63, z: 55 };
export const spawn = new T.Vector3(-3.6, 1.73, 24.5);

export function makeWorld(scene, renderer, mobile) {
  let seed = 1841;
  function rand() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const colliders = [],
    zones = [],
    batches = new Map(),
    surfaces = new Map();
  const loader = new T.TextureLoader();
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), mobile ? 2 : 8);
  scene.fog = new T.FogExp2(0xe9ceab, 0.0078);
  scene.background = new T.Color(0x95c7dc);
  new HDRLoader().load('surfaces/sky.hdr', (texture) => {
    texture.mapping = T.EquirectangularReflectionMapping;
    scene.background = scene.environment = texture;
    scene.backgroundIntensity = 0.76;
    scene.environmentIntensity = 0.39;
    scene.backgroundRotation.y = 1.75;
    scene.environmentRotation.y = 1.75;
  });
  const sun = new T.DirectionalLight(0xffe3b4, 3.05);
  sun.position.set(-38, 49, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {
    left: -46,
    right: 46,
    top: 46,
    bottom: -46,
    near: 1,
    far: 155,
  });
  sun.shadow.radius = 0.65;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target, new T.HemisphereLight(0xe0efff, 0xc38d65, 1.12));

  function surface(name, scale, normalStrength) {
    const maps = {};
    for (const [suffix, property] of [
      ['diff', 'map'],
      ['nor_gl', 'normalMap'],
      ['rough', 'roughnessMap'],
    ]) {
      const tex = loader.load('surfaces/' + name + '-' + suffix + '.webp');
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.anisotropy = anisotropy;
      if (property === 'map') tex.colorSpace = T.SRGBColorSpace;
      maps[property] = tex;
    }
    const mat = new T.MeshStandardMaterial({
      ...maps,
      vertexColors: true,
      roughness: 0.95,
      normalScale: new T.Vector2(normalStrength, normalStrength),
    });
    // World-space variation breaks up tiled scans and darkens damp masonry at its base.
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 vSitePos;\n' +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvSitePos=(modelMatrix*vec4(transformed,1.)).xyz;',
        );
      shader.fragmentShader =
        'varying vec3 vSitePos;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec3 p=vSitePos;
        float wear=sin(p.x*.51+p.z*.29+sin(p.y*.71))*sin(p.z*.43+p.y*.27)*.036;
        float base=exp(-max(0.,p.y)*1.8);
        diffuseColor.rgb *= vec3(1.+wear)+base*vec3(-.038,-.065,-.088);
      `,
        );
    };
    const addMasonryVariation = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      addMasonryVariation(shader);
      // Fade unresolved normal-map detail before it turns into crawling highlights.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal=normalize(mix(normal,nonPerturbedNormal,.7*smoothstep(18.,70.,length(vViewPosition))));`,
      );
    };
    surfaces.set(mat, scale);
    return mat;
  }
  const plaster = surface('plaster', 5.4, 0.53),
    stone = surface('stone', 3.1, 0.68),
    paving = surface('paving', 3.0, 0.72);
  const wood = surface('wood', 1.45, 0.67);
  const sandMap = loader.load('surfaces/sand-diff.webp');
  sandMap.colorSpace = T.SRGBColorSpace;
  sandMap.wrapS = sandMap.wrapT = T.RepeatWrapping;
  sandMap.anisotropy = anisotropy;
  const masonryShader = paving.onBeforeCompile;
  paving.customProgramCacheKey = () => 'windblown-sand';
  paving.onBeforeCompile = (shader) => {
    masonryShader(shader);
    shader.uniforms.looseSand = { value: sandMap };
    shader.fragmentShader =
      'uniform sampler2D looseSand;\n' +
      shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      vec2 s=vSitePos.xz;
      vec3 grains=texture2D(looseSand,s*.43).rgb;
      float flecks=texture2D(looseSand,s*.085).r;
      float drift=sin(s.x*.28+s.y*.13+sin(s.y*.31)*1.3)+sin(s.y*.52+s.x*.2)*.43;
      drift+=(flecks-.34)*3.8+(grains.g-.35)*1.5;
      float sandMix=smoothstep(.04,1.36,drift)*.72;
      vec3 sandTex=grains*vec3(1.26,1.04,.84);
      diffuseColor.rgb=mix(diffuseColor.rgb,sandTex,sandMix);
      normal=normalize(mix(normal,nonPerturbedNormal,sandMix*.79));
    `,
      );
  };
  const flat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const metal = new T.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.42,
    roughness: 0.62,
  });
  const cloth = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    side: T.DoubleSide,
  });
  const leaves = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.91,
    side: T.DoubleSide,
  });
  const breeze = { value: 0 };
  function wind(shader) {
    shader.uniforms.breeze = breeze;
    shader.vertexShader =
      'uniform float breeze;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      float gust=sin(breeze*1.4+position.x*.9+position.z*.7);
      transformed.x+=.042*gust;transformed.z+=.028*sin(breeze+position.x*1.3);
    `,
      );
  }
  leaves.onBeforeCompile = wind;
  const leafDepth = new T.MeshDepthMaterial({
    depthPacking: T.RGBADepthPacking,
    side: T.DoubleSide,
  });
  leafDepth.onBeforeCompile = wind;
  const unitBox = new T.BoxGeometry(),
    frame = new T.Object3D(),
    color = new T.Color();
  let impactKind = 'wall';
  function batch(
    geo,
    mat,
    tint,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    frame.position.set(x, y, z);
    frame.scale.set(sx, sy, sz);
    frame.rotation.set(rx, ry, rz);
    frame.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(frame.matrix);
    const pos = g.attributes.position,
      normal = g.attributes.normal;
    const colors = new Float32Array(pos.count * 3),
      uv = new Float32Array(pos.count * 2);
    color.set(tint);
    const scale = surfaces.get(mat);
    for (let i = 0; i < pos.count; i++) {
      color.toArray(colors, i * 3);
      if (scale) {
        const nx = Math.abs(normal.getX(i)),
          ny = Math.abs(normal.getY(i)),
          nz = Math.abs(normal.getZ(i));
        uv[i * 2] = (nx > nz && nx > ny ? pos.getZ(i) : pos.getX(i)) / scale;
        uv[i * 2 + 1] = (ny > nx && ny > nz ? -pos.getZ(i) : pos.getY(i)) / scale;
      }
    }
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    if (scale || !g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    for (const attr of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv', 'color'].includes(attr)) g.deleteAttribute(attr);
    const bucket = [
      mat.uuid,
      impactKind,
      Math.floor((x + 64) / 32),
      Math.floor((z + 56) / 32),
    ].join(':');
    if (!batches.has(bucket)) batches.set(bucket, { mat, impactKind, geos: [] });
    batches.get(bucket).geos.push(g);
  }
  function solid(x, y, z, w, h, d) {
    colliders.push(
      new T.Box3(
        new T.Vector3(x - w / 2, y - h / 2, z - d / 2),
        new T.Vector3(x + w / 2, y + h / 2, z + d / 2),
      ),
    );
  }
  function box(x, y, z, w, h, d, mat, tint, blocking = false, rz = 0) {
    batch(unitBox, mat, tint, x, y, z, w, h, d, 0, 0, rz);
    if (blocking) solid(x, y, z, w, h, d);
  }
  const cylinders = new Map();
  function cylinder(x, y, z, rt, rb, h, tint, mat = flat, n = 14) {
    const k = [rt, rb, h, n].join(',');
    if (!cylinders.has(k)) cylinders.set(k, new T.CylinderGeometry(rt, rb, h, n));
    batch(cylinders.get(k), mat, tint, x, y, z);
  }
  function rod(a, b, r, tint, mat = metal, sides = 7) {
    const dir = new T.Vector3().subVectors(b, a),
      mid = a.clone().lerp(b, 0.5);
    const geo = new T.CylinderGeometry(r, r, dir.length(), sides);
    geo.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()),
    );
    batch(geo, mat, tint, mid.x, mid.y, mid.z);
  }
  const v = (x, y, z) => new T.Vector3(x, y, z);
  impactKind = 'ground';
  buildTerrain(
    (geometry, material, tint, kind) => {
      impactKind = kind;
      batch(geometry, material, tint);
      geometry.dispose();
    },
    solid,
    paving,
    stone,
  );
  impactKind = 'wall';
  const cream = '#f0cfa3',
    trim = '#ffe2b3',
    teal = '#477c79',
    iron = '#414541';
  const stuccos = ['#e8bc91', '#d8a27c', '#e9c69c', '#d6b799', '#e6c5a4', '#eacdb2'];
  function sign(
    x,
    y,
    z,
    w,
    h,
    text,
    small = '',
    background = '#226864',
    ink = '#efe1b9',
    rotation = 0,
  ) {
    const cn = document.createElement('canvas');
    cn.width = 768;
    cn.height = 256;
    const c = cn.getContext('2d');
    c.fillStyle = background;
    c.fillRect(0, 0, 768, 256);
    c.strokeStyle = ink;
    c.lineWidth = 4;
    c.strokeRect(10, 10, 748, 236);
    c.globalAlpha = 0.35;
    c.strokeRect(18, 18, 732, 220);
    c.globalAlpha = 1;
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold ' + (small ? 108 : 145) + 'px Arial';
    c.fillText(text, 384, small ? 103 : 132, 700);
    if (small) {
      c.font = 'bold 37px monospace';
      c.fillText(small, 384, 195, 695);
    }
    for (let i = 0; i < 2400; i++) {
      c.fillStyle = rand() < 0.5 ? 'rgba(44,31,19,.12)' : 'rgba(252,241,214,.18)';
      c.fillRect(rand() * 768, rand() * 256, rand() * 6, rand() * 2);
    }
    const tex = new T.CanvasTexture(cn);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    const mesh = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshStandardMaterial({
        map: tex,
        roughness: 0.94,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.userData.impactKind = impactKind;
    scene.add(mesh);
    zones.push(mesh);
  }
  function pane(x, y, z, w, h, side, shade) {
    // side is the outward normal of a street-facing elevation.
    function face(dx, dy, depth, width, height, thick, m, color) {
      if (side === 0) box(x + dx, y + dy, z + depth, width, height, thick, m, color);
      else box(x + side * depth, y + dy, z + dx, thick, height, width, m, color);
    }
    face(0, 0, 0.025, w + 0.23, h + 0.2, 0.15, plaster, cream);
    face(0, 0, 0.13, w, h, 0.1, flat, '#302e2b');
    face(0, -h / 2 - 0.05, 0.2, w + 0.42, 0.12, 0.32, stone, trim);
    for (const dx of [-0.245, 0.245]) {
      face(dx * w, 0, 0.2, w * 0.44, h * 0.96, 0.09, flat, shade);
      for (let l = 0; l < 6; l++)
        face(dx * w, (l - 2.5) * h * 0.143, 0.27, w * 0.38, 0.055, 0.035, flat, '#344d4d');
    }
  }
  function awning(x, y, z, w, reach, side, tint) {
    const stripes = Math.ceil(w / 0.42);
    for (let i = 0; i < stripes; i++) {
      const a = -w / 2 + (w * i) / stripes,
        b = -w / 2 + (w * (i + 1)) / stripes;
      const points = [],
        indices = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6,
          drop = 0.48 * t + 0.17 * Math.sin(Math.PI * t);
        for (const xx of [a, b])
          points.push(side === 0 ? xx : side * reach * t, -drop, side === 0 ? reach * t : xx);
        if (j) {
          const k = j * 2;
          indices.push(k - 2, k, k - 1, k, k + 1, k - 1);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(points, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      const col = i % 2 ? tint : '#d7b382';
      batch(g, cloth, col, x, y, z);
      const mid = (a + b) / 2,
        et = y - 0.61 - 0.025 * Math.cos(i);
      if (side === 0) box(x + mid, et, z + reach, b - a, 0.27, 0.035, cloth, col);
      else box(x + side * reach, et, z + mid, 0.035, 0.27, b - a, cloth, col);
    }
    for (const d of [-w * 0.44, w * 0.44]) {
      const a = side === 0 ? v(x + d, y - 1.45, z) : v(x, y - 1.45, z + d);
      const b = side === 0 ? v(x + d, y - 0.5, z + reach) : v(x + side * reach, y - 0.5, z + d);
      rod(a, b, 0.027, iron);
    }
  }
  function house(x, z, w, d, h, tint, store = false) {
    box(x, h / 2, z, w, h, d, plaster, tint, true);
    box(x, 0.39, z, w + 0.09, 0.78, d + 0.09, stone, '#dbc097');
    box(x, h - 0.18, z, w + 0.38, 0.19, d + 0.38, stone, cream);
    box(x, h + 0.06, z, w + 0.48, 0.13, d + 0.48, plaster, trim);
    for (const dz of [-1, 1]) box(x, h + 0.41, z + dz * d * 0.48, w, 0.68, 0.23, plaster, tint);
    // Cut the side parapets flush with the inside of the cross walls.
    for (const dx of [-1, 1])
      box(x + dx * w * 0.48, h + 0.41, z, 0.23, 0.68, d * 0.96 - 0.23, plaster, tint);
    const front = z + d / 2;
    const shade = rand() > 0.34 ? teal : '#6c6552';
    const count = Math.max(2, Math.floor(w / 3.5));
    for (let i = 0; i < count; i++)
      pane(x + w * ((i + 0.5) / count - 0.5), h - 1.8, front, 1.0, 1.48, 0, shade);
    const side = x < 0 ? 1 : -1;
    for (let i = 0; i < Math.floor(d / 4); i++)
      pane(
        x + (side * w) / 2,
        h - 1.9,
        z + d * ((i + 0.5) / Math.floor(d / 4) - 0.5),
        1.1,
        1.5,
        side,
        shade,
      );
    const doorWidth = store ? 2.9 : 1.46;
    box(x, 1.46, front + 0.07, doorWidth + 0.32, 2.94, 0.18, stone, trim);
    box(x, 1.39, front + 0.19, doorWidth, 2.78, 0.11, flat, store ? '#706d5c' : '#574d3e');
    if (store) {
      for (let j = 0; j < 19; j++)
        box(x, 0.13 + j * 0.14, front + 0.26, doorWidth - 0.08, 0.035, 0.025, metal, '#484b44');
      awning(x, 3.48, front + 0.22, doorWidth + 1.2, 1.45, 0, rand() > 0.5 ? '#97704b' : '#a85035');
    } else {
      for (const dx of [-0.36, 0.36])
        for (const yy of [0.72, 1.88])
          box(x + dx, yy, front + 0.27, 0.53, 0.91, 0.055, flat, '#726148');
    }
    if (rand() > 0.24) {
      const rx = x + w * 0.23;
      box(rx, h + 1.05, z - 0.9, 2.5, 1.85, 2.9, plaster, tint);
      box(rx, h + 2.04, z - 0.9, 2.7, 0.16, 3.1, plaster, trim);
      cylinder(rx - 0.7, h + 2.65, z - 0.9, 0.105, 0.105, 1.35, iron, metal);
    }
    if (rand() > 0.4) {
      const ax = x - w * 0.27;
      rod(v(ax, h, z), v(ax, h + 2.9, z), 0.031, iron);
      for (let i = 0; i < 4; i++)
        rod(
          v(ax - 0.48, h + 2 + i * 0.2, z - 0.16),
          v(ax + 0.48, h + 2 + i * 0.2, z + 0.16),
          0.018,
          iron,
        );
    }
  }
  // Three linked districts. Streets run around each block and reconnect behind both sites.
  const blocks = [
    [-14, 10, 10, 13, 7.2],
    [-16, -7.2, 12, 9, 9.4],
    [18, 10, 12, 15, 7.7],
    [16, -4.8, 9, 12, 6.3],
    [-30, 12, 10, 18, 9],
    [-32, -8, 13, 11, 6.8],
    [30.7, 8, 8.4, 18, 8.5],
    [31, -8, 9, 10, 6],
    [-16, -33, 11, 8, 7.6],
    [15, -24.5, 11, 10, 8.2],
    [-33, -39, 13, 7, 8],
    [32, -40, 13, 7, 7.4],
    [-53, 1, 9, 19, 9.5],
    [-51, -26, 12, 15, 8],
    [51, -19, 10, 17, 9],
    [54.4, 8, 10.4, 18, 7],
    [-19, 35, 12, 12, 6],
    [5, 36, 17, 12, 8],
    [29, 34, 13, 10, 9],
    [-44, 35, 12, 12, 7.5],
    [49, 36, 10, 11, 6],
    [-43, -46, 15, 9, 9],
    [-13, -47, 19, 9, 8],
    [16, -47, 15, 8, 7.5],
    [45, -47, 13, 9, 8.5],
  ];
  blocks.forEach(([x, z, w, d, h], i) =>
    house(x, z, w, d, h, stuccos[i % stuccos.length], i % 3 !== 1),
  );
  // The island splits the straight sightline down Mid from the bend through Top Mid.
  house(2.05, 16.15, 5.4, 8.1, 4.85, '#d9bb96', false);
  // Arcade across the central lane, with a truly open arch and individually cut voussoirs.
  function gate(x, z, width, radius, spring, height, depth) {
    const side = (width - 2 * radius) / 2;
    for (const dir of [-1, 1]) {
      box(
        x + dir * (radius + side / 2),
        height / 2,
        z,
        side,
        height,
        depth,
        plaster,
        '#deb48b',
        true,
      );
      box(
        x + dir * (radius + 0.265),
        spring / 2,
        z + 0.01,
        0.58,
        spring,
        depth + 0.38,
        stone,
        trim,
        true,
      );
    }
    const outline = new T.Shape();
    outline.moveTo(-radius, spring);
    outline.absarc(0, spring, radius, Math.PI, 0, true);
    outline.lineTo(radius, height);
    outline.lineTo(-radius, height);
    outline.closePath();
    const fill = new T.ExtrudeGeometry(outline, { depth, bevelEnabled: false, curveSegments: 24 });
    batch(fill, plaster, '#e7bf91', x, 0, z - depth / 2);
    solid(x, (spring + radius + height) / 2, z, radius * 2, height - spring - radius, depth);
    for (let i = 0; i < 17; i++) {
      const a = (Math.PI * i) / 17 + 0.007,
        b = (Math.PI * (i + 1)) / 17 - 0.007,
        s = new T.Shape();
      s.absarc(0, 0, radius + 0.02, a, b, false);
      s.absarc(0, 0, radius + 0.52, b, a, true);
      s.closePath();
      batch(
        new T.ExtrudeGeometry(s, { depth: depth + 0.31, bevelEnabled: false, curveSegments: 4 }),
        stone,
        i % 3 ? trim : cream,
        x,
        spring,
        z - depth / 2 - 0.15,
      );
    }
    box(x, height + 0.1, z, width + 0.35, 0.3, depth + 0.4, stone, cream);
    for (let i = 0; i < Math.floor(width / 0.98); i++)
      box(
        x - width / 2 + 0.55 + i * 0.98,
        height + 0.54,
        z,
        0.67,
        0.68,
        depth - 0.1,
        plaster,
        '#e4bd92',
      );
  }
  gate(0.3, -10.8, 10.7, 3.35, 2.55, 7.3, 2.5);
  sign(4.65, 3.2, -9.53, 1.45, 1.05, 'A →', '', '#874634');
  sign(-4.12, 2.9, -9.53, 1.6, 1.05, '← B', '', '#8c4635');
  sign(-14, 3.97, 16.59, 4.5, 1.3, 'الواحة', 'CAFÉ   AL WAHA');
  sign(18, 4.07, 17.58, 5.2, 1.44, 'فندق النور', 'H Ô T E L    N O U R', '#64584b');
  // Glazed zellige, hand-painted weaving and carved streetside shopfronts.
  function facadeArt(x, y, z, w, h, side, kind) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = kind === 'tile' ? 64 : 384;
    const ctx = c.getContext('2d'),
      W = c.width,
      H = c.height;
    const palette =
      kind === 'tile'
        ? ['#436f6a', '#c1a878', '#ede1ba', '#334f50']
        : ['#a05239', '#d2b283', '#493f38', '#bc7453'];
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, W, H);
    function diamond(cx, cy, rx, ry, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry);
      ctx.lineTo(cx + rx, cy);
      ctx.lineTo(cx, cy + ry);
      ctx.lineTo(cx - rx, cy);
      ctx.closePath();
      ctx.fill();
    }
    if (kind === 'tile') {
      for (let j = 0; j < 8; j++) {
        const cx = j * 64 + 32;
        diamond(cx, 32, 30, 28, palette[2]);
        diamond(cx, 32, 22, 22, palette[1]);
        diamond(cx, 32, 15, 15, palette[3]);
        diamond(cx, 32, 7, 7, palette[2]);
      }
      for (const yy of [2, 59]) {
        ctx.fillStyle = palette[2];
        ctx.fillRect(0, yy, W, 2);
      }
    } else {
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = palette[i % 4];
        ctx.lineWidth = 4;
        ctx.strokeRect(8 + i * 5, 8 + i * 5, W - 16 - i * 10, H - 16 - i * 10);
      }
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 5; i++) {
          const xx = 76 + i * 88,
            yy = 77 + j * 114;
          diamond(xx, yy, 41, 48, palette[2]);
          diamond(xx, yy, 33, 38, palette[1]);
          diamond(xx, yy, 24, 29, palette[0]);
          diamond(xx, yy, 12, 13, palette[3]);
        }
      for (let i = 0; i < W; i += 3) {
        ctx.fillStyle = 'rgba(38,28,19,.16)';
        ctx.fillRect(i, 0, 1, H);
      }
    }
    for (let j = 0; j < 3000; j++) {
      ctx.fillStyle = rand() > 0.5 ? '#cab28c36' : '#4f463233';
      ctx.fillRect(rand() * W, rand() * H, 2, 3);
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = T.RepeatWrapping;
    tex.repeat.x = kind === 'tile' ? Math.max(1, Math.round(w / 4)) : 1;
    tex.anisotropy = anisotropy;
    const m = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshStandardMaterial({
        map: tex,
        roughness: kind === 'tile' ? 0.55 : 0.93,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      }),
    );
    m.rotation.y = (side * Math.PI) / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.userData.impactKind = 'wall';
    scene.add(m);
    zones.push(m);
  }
  facadeArt(0.3, 6.85, -9.525, 10.4, 0.32, 0, 'tile');
  for (const [x, z, side, tint] of [
    [-9, 10, 1, '#526d66'],
    [12, 8.2, -1, '#715e47'],
    [-10, -6.4, 1, '#4f665e'],
    [11.51, -5.2, -1, '#7b6a51'],
  ]) {
    function trimBox(dx, y, dz, th, height, width, m, col) {
      box(x + side * dx, y, z + dz, th, height, width, m, col);
    }
    trimBox(0.05, 1.46, 0, 0.16, 2.92, 3.65, stone, cream);
    trimBox(0.15, 1.41, 0, 0.13, 2.82, 3.27, flat, '#363e39');
    for (const s of [-1, 1]) {
      trimBox(0.235, 1.36, s * 0.78, 0.12, 2.69, 1.48, wood, tint);
      for (const y of [0.7, 1.94]) trimBox(0.31, y, s * 0.78, 0.06, 0.94, 1.05, wood, '#b6ae8b');
      trimBox(0.35, 1.24, s * 0.22, 0.11, 0.18, 0.08, metal, iron);
    }
    trimBox(0.18, 2.97, 0, 0.29, 0.2, 3.87, stone, trim);
    trimBox(0.28, 0.083, 0, 0.57, 0.16, 3.97, stone, cream);
    sign(
      x + side * 0.22,
      3.4,
      z,
      3.45,
      0.59,
      'السوق القديم',
      '',
      '#345954',
      '#ead8b4',
      (side * Math.PI) / 2,
    );
    facadeArt(x + side * 0.15, 4.98, z - 1.9, 1.47, 2.12, side, 'rug');
    for (const dz of [-2.34, 2.34]) {
      const lx = x + side * 0.54,
        lz = z + dz;
      rod(v(x, 3.18, lz), v(lx, 3.3, lz), 0.033, iron);
      rod(v(lx, 3.3, lz), v(lx, 3.05, lz), 0.018, iron);
      cylinder(lx, 2.95, lz, 0.048, 0.172, 0.2, iron, metal, 6);
      cylinder(lx, 2.66, lz, 0.15, 0.105, 0.38, '#ccab68', metal, 6);
      cylinder(lx, 2.43, lz, 0.124, 0.043, 0.1, iron, metal, 6);
      for (let i = 0; i < 6; i++) {
        const a = (TAU * i) / 6;
        rod(
          v(lx + 0.155 * Math.cos(a), 2.86, lz + 0.155 * Math.sin(a)),
          v(lx + 0.107 * Math.cos(a), 2.47, lz + 0.107 * Math.sin(a)),
          0.012,
          iron,
        );
      }
    }
  }
  awning(-8.96, 4.15, 10, 7.1, 2.14, 1, '#a2472b');
  awning(11.95, 4.35, 8.1, 6.8, 1.85, -1, '#537773');
  gate(-41, -14.6, 9, 2.65, 3.4, 6.5, 2.0);
  sign(-37.6, 3.6, -13.56, 1.4, 1.1, 'B', '', '#944b31');
  gate(41.5, 18, 10, 2.75, 2.2, 6.4, 2.1);
  sign(45.5, 3.2, 19.08, 1.85, 1.3, 'A', '', '#96452b');
  // Hinged timber leaves narrow the firing angle but leave a continuous passage.
  function doubleDoors(x, z, radius, angle, height, base = 0) {
    for (const side of [-1, 1]) {
      const along = new T.Vector3(-side * 0.57, 0, -side * 0.82).applyAxisAngle(v(0, 1, 0), angle);
      const hinge = v(x, base, z).add(v(side * radius, 0, 0).applyAxisAngle(v(0, 1, 0), angle));
      const yaw = Math.atan2(-along.z, along.x),
        width = radius * 0.91;
      for (let j = 0; j < 6; j++) {
        const p = hinge.clone().addScaledVector(along, (width * (j + 0.5)) / 6);
        batch(
          unitBox,
          wood,
          j % 2 ? '#9e7954' : '#b69668',
          p.x,
          base + height / 2,
          p.z,
          width / 6 - 0.01,
          height,
          0.16,
          0,
          yaw,
        );
        solid(
          p.x,
          base + height / 2,
          p.z,
          (Math.abs(along.x) * width) / 6 + 0.16,
          height,
          (Math.abs(along.z) * width) / 6 + 0.16,
        );
      }
      const mid = hinge.clone().addScaledVector(along, width * 0.5);
      for (const h of [0.23, height * 0.46, height - 0.25])
        batch(unitBox, metal, '#4b483e', mid.x, base + h, mid.z, width + 0.014, 0.12, 0.2, 0, yaw);
      const handle = hinge.clone().addScaledVector(along, width * 0.82);
      cylinder(handle.x, base + height * 0.51, handle.z, 0.11, 0.11, 0.16, '#63584a', metal, 10);
    }
  }
  doubleDoors(0.3, -10.8, 3.25, 0, 3.8);
  doubleDoors(41.5, 18, 2.65, 0, 3.55);
  doubleDoors(-25.30, -24.6, 2.62, Math.PI / 2, 3.55, 1.07);

  // B tunnels: a roofed upper gallery and a lower crossover to mid, lit by roof slots.
  const wall = (x, z, w, d, h) => box(x, h / 2, z, w, h, d, plaster, '#d3af85', true);
  wall(-7.72, -10.8, 5.46, 2.34, 5.65);
  wall(-23.9, -7.4, 4.1, 1.25, 6.1);
  wall(31.7, -2.0, 6.2, 2.05, 6.1);
  // The entrance to Long turns ninety degrees between the two pairs of doors.
  wall(41.5, 27.4, 10, 0.85, 5.1);
  wall(46.1, 22.7, 0.8, 9.5, 5.1);
  wall(37.0, 19.5, 0.8, 2.6, 5.1);
  wall(37.0, 26.6, 0.8, 1.7, 5.1);
  wall(35.4, 17.9, 2.85, 2.0, 5.55);
  box(37, 4.58, 23.28, 0.8, 1.04, 5.04, stone, cream, true);
  doubleDoors(37, 23.28, 2.5, Math.PI / 2, 3.55);
  for (const z of [19.9, 23.2, 26.4])
    box(41.55, 5.02, z, 9.0, 0.28, 0.35, wood, '#776048', true);
  box(43.8, 5.25, 22.8, 4.75, 0.21, 8.8, wood, '#927955', true);
  wall(-45.35, -0.7, 0.72, 28.4, 5.9);
  wall(-36.7, -8.5, 0.66, 12.9, 5.9);
  wall(-36.7, 8.5, 0.66, 11.7, 5.9);
  wall(-24.6, -2.12, 24.1, 0.62, 4.4);
  wall(-24.6, 2.7, 24.1, 0.62, 4.4);
  for (let i = 0; i < 6; i++) {
    const z = -12.2 + i * 4.5;
    box(-41, 5.6, z, 8.8, 0.45, 3.95, stone, '#d2b895', true);
    box(-41, 5.23, z + 1.83, 8.8, 0.29, 0.32, wood, '#8d7356', true);
    for (const x of [-44.67, -37.33]) {
      box(x, 2.4, z + 1.83, 0.4, 4.8, 0.55, stone, '#ceb591', true);
      box(x, 4.95, z + 1.83, 0.68, 0.28, 0.79, stone, cream);
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = -34.6 + i * 4.75;
    box(x, 4.18, 0.28, 4.4, 0.37, 4.95, stone, '#c4a784', true);
    box(x - 1.95, 3.9, 0.28, 0.26, 0.2, 4.95, wood, '#806a4e');
  }
  sign(-12.7, 3.28, 2.99, 2.1, 0.8, '← B', 'TUNNELS', '#54483c');
  // Northern courtyards have their own back walls, a window into B and a CT underpass.
  wall(-25.3, -31.1, 0.72, 7.7, 5.4);
  wall(-25.3, -21.45, 0.72, 1.0, 4.9);
  wall(-25.3, -15.9, 0.72, 5.3, 4.9);
  for (const z of [-27.38, -21.82]) {
    box(-25.3, 2.37, z, 1.06, 4.74, 0.48, stone, '#c6ab87', true);
    box(-25.3, 4.61, z, 1.17, 0.22, 0.65, stone, cream);
  }
  box(-25.3, 4.99, -24.6, 0.93, 0.62, 5.96, stone, '#c7ac88', true);
  // B Window sits between the site and CT scaffold, just beside the double doors.
  box(-25.3, 1.02, -19.75, 0.88, 2.04, 2.4, stone, '#c8ab88', true);
  box(-25.3, 4.24, -19.75, 0.72, 1.32, 2.4, stone, '#b79774', true);
  for (const z of [-21.14, -18.36]) {
    for (let row = 0; row < 4; row++)
      box(-25.3, 2.23 + 0.39 * row, z, 0.81, 0.37, row % 2 ? 0.44 : 0.35, stone, trim);
  }
  wall(-38, -35.2, 21, 0.9, 5.9);
  wall(-26.3, -35.2, 2.6, 0.9, 5.4);
  wall(-45.7, -25.0, 0.86, 20.1, 5.7);
  wall(-31.05, -16.65, 11.75, 0.72, 4.8);
  wall(-45.6, -16.65, 3.8, 0.72, 4.8);
  // Back façades join the courtyards so the B approaches converge at doors, window or tunnels.
  wall(-22.85, -32.25, 5.15, 0.9, 5.6);
  wall(10.4, -34.85, 43, 0.95, 5.8);
  for (const x of [-9.7, -3.8, 2.1, 8, 13.9, 19.8, 25.7, 31])
    box(x, 2.86, -34.29, 0.65, 5.72, 0.38, stone, '#c6a986', true);
  wall(40, -36, 17, 0.9, 6.4);
  wall(48.4, -24.8, 0.8, 20.6, 5.3);
  sign(38, 4.7, -35.52, 2.8, 2.2, 'A', 'SITE A', '#944a32');
  sign(-41, 3.8, -34.73, 2.9, 2.25, 'B', 'SITE B', '#86442e');
  sign(24.6, 2.78, -14.57, 3.17, 0.38, 'CT  ·  PASSAGE', '', '#625c4d');
  function sitePaint(x, z, letter) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ink = c.getContext('2d');
    ink.strokeStyle = ink.fillStyle = '#9a4328';
    ink.lineWidth = 9;
    ink.beginPath();
    ink.ellipse(129, 130, 104, 94, -0.13, 0.15, Math.PI * 2);
    ink.stroke();
    ink.translate(128, 131);
    ink.rotate(-0.09);
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    ink.font = 'bold 165px sans-serif';
    ink.fillText(letter, 0, 3);
    ink.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1600; i++) ink.fillRect(rand() * 256 - 128, rand() * 256 - 128, rand() * 3 + 1, rand() * 2 + 1);
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = anisotropy;
    const mark = new T.Mesh(new T.PlaneGeometry(4.65, 4.65), new T.MeshStandardMaterial({
      map, roughness: 1, transparent: true, opacity: 0.72,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(x, terrainHeight(x, z) + 0.005, z);
    mark.receiveShadow = true;
    scene.add(mark);
  }
  sitePaint(39.4, -26.0, 'A');
  sitePaint(-37.2, -28.2, 'B');
  for (const [x, z, w, depth, y] of [
    [6.04, -0.9, 0.25, 7.9, 1.3],
    [17.9, -18.84, 7.2, 0.24, 3],
    [37.45, -34.8, 9.5, 0.32, 3],
  ]) {
    box(x, y + 0.35, z, w, 0.7, depth, stone, '#d5bc95', true);
    box(x, y + 0.73, z, w + 0.07, 0.1, depth + 0.07, plaster, trim);
  }
  // Skyline silhouettes anchor navigation from opposite ends of the map.
  function dome(x, y, z, r, col) {
    cylinder(x, y + 0.42, z, r * 1.04, r * 1.08, 0.84, cream, plaster, 32);
    batch(
      new T.SphereGeometry(r, 40, 18, 0, TAU, 0, Math.PI / 2),
      metal,
      col,
      x,
      y + 0.8,
      z,
      1,
      0.82,
      1,
    );
    cylinder(x, y + 0.86 + r * 0.82 + 0.39, z, 0.035, 0.055, 0.85, '#a8814f', metal);
    batch(new T.SphereGeometry(0.15, 10, 8), metal, '#b89356', x, y + 0.96 + r * 0.82 + 0.58, z);
  }
  box(8.9, 5.3, -24.5, 8.3, 10.6, 8.8, plaster, '#edcda2', true);
  box(8.9, 10.45, -24.5, 8.65, 0.43, 9.12, stone, trim);
  dome(8.9, 10.65, -24.5, 4.1, '#669894');
  dome(-33, 8.15, -39, 3.4, '#b78d67');
  dome(45, 8.6, -47, 4.1, '#729590');
  function tower(x, z, base) {
    box(x, base / 2, z, 3.5, base, 3.5, plaster, '#e5bd91', true);
    for (const y of [base * 0.33, base * 0.76, base - 0.2])
      box(x, y, z, 3.76, 0.26, 3.76, stone, trim);
    for (const dx of [-0.75, 0.75]) pane(x + dx, base - 1.72, z + 1.75, 0.58, 1.9, 0, '#776c51');
    cylinder(x, base + 0.22, z, 2.64, 2.16, 0.56, cream, stone, 16);
    cylinder(x, base + 0.67, z, 2.59, 2.59, 0.38, trim, stone, 16);
    cylinder(x, base + 2.51, z, 1.33, 1.5, 3.68, cream, plaster, 16);
    for (let j = 0; j < 12; j++) {
      const a = (j * TAU) / 12;
      cylinder(
        x + 2.34 * Math.cos(a),
        base + 1.45,
        z + 2.34 * Math.sin(a),
        0.073,
        0.093,
        1.27,
        cream,
        stone,
      );
    }
    cylinder(x, base + 2.04, z, 2.51, 2.51, 0.13, '#e5c79b', stone, 20);
    cylinder(x, base + 4.44, z, 1.61, 1.42, 0.29, trim, stone, 16);
    dome(x, base + 4.55, z, 1.48, '#64938b');
  }
  tower(-8.1, -27.6, 14.6);
  tower(53, -37, 12.6);
  // Merchant cargo with slatted timber, metal corners and stencilled markings.
  impactKind = 'prop';
  function crate(x, z, w, h, y = 0, mark = false) {
    y += terrainHeight(x, z);
    box(x, y + h / 2, z, w, h, w, wood, '#c6a680', true);
    for (let j = 0; j < 5; j++) {
      box(
        x - w * 0.4 + j * w * 0.2,
        y + h / 2,
        z + w * 0.506,
        w * 0.188,
        h * 0.92,
        0.042,
        wood,
        j % 2 ? '#d5b58a' : '#e3c39a',
      );
      box(
        x - w * 0.508,
        y + h / 2,
        z - w * 0.4 + j * w * 0.2,
        0.04,
        h * 0.92,
        w * 0.188,
        wood,
        j % 3 ? '#d7bc93' : '#c8ad8d',
      );
      box(x - w * 0.4 + j * w * 0.2, y + h + 0.012, z, w * 0.187, 0.05, w * 0.97, wood, '#d8b68e');
    }
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        box(x + dx * w * 0.48, y + h / 2, z + dz * w * 0.48, 0.1, h + 0.06, 0.1, metal, '#575443');
    for (const yy of [y + 0.11, y + h - 0.11]) {
      box(x, yy, z, w + 0.07, 0.15, w + 0.07, flat, '#95724d');
    }
    box(x, y + h / 2, z + w * 0.535, Math.hypot(w, h) * 0.88, 0.11, 0.06, flat, '#91704b', false, Math.atan2(h, w));
    if (mark)
      sign(
        x + 0.21,
        y + h * 0.61,
        z + w * 0.55,
        w * 0.41,
        w * 0.21,
        '↑↑',
        '',
        '#ae895c',
        '#494539',
      );
  }
  // Paired cargo leaves a landing on the lower box and keeps the primary lanes open.
  for (const [x, z, w, h, base] of [
    [-7, 5, 1.8, 1.28], [-7.2, 2.95, 1.7, 0.70],
    [36, -26.4, 1.8, 0.72], [36, -28.65, 2.4, 1.42], [36, -28.9, 1.6, 0.72, 1.42],
    [-34, -29, 2.4, 1.26], [-31.5, -29, 2.15, 0.72], [-34.42, -29, 1.4, 1.05, 1.26],
    [-5, -16, 2, 1.26], [7, -30, 1.7, 0.74], [-39, -23, 2, 1.25],
    [-24, 27, 2, 1.23], [21, 23, 1.8, 0.75], [-38.1, 5.0, 1.65, 0.73], [1, -32.8, 1.7, 1.24],
    // From CT, step up the two cargo levels and jump onto extended A Short.
    [22.95, -10.95, 1.72, 0.72], [22.95, -13.1, 2.10, 1.95],
  ]) {
    crate(x, z, w, h, base, Math.abs(z) < 8);
  }
  function steelCargo(x, z, w, d, h, col) {
    box(x, h / 2, z, w, h, d, metal, col, true);
    for (const side of [-1, 1]) {
      for (let i = 0.24; i < w - 0.12; i += 0.38)
        box(x - w / 2 + i, h / 2, z + side * d / 2, 0.065, h - 0.18, 0.06, metal, col);
      for (const y of [0.07, h - 0.07]) {
        box(x, y, z + side * d / 2, w + 0.06, 0.14, 0.09, metal, '#596260');
        box(x + side * w / 2, y, z, 0.09, 0.14, d + 0.06, metal, '#596260');
      }
    }
  }
  // Xbox links lower mid to the open end of the catwalk parapet.
  steelCargo(4.28, -6.55, 2.85, 2.55, 1.26, '#74764f');
  for (const tilt of [-0.38, 0.38])
    box(4.28, 0.63, -5.235, 2.63, 0.09, 0.06, metal, '#a49e78', false, tilt);
  // Blue bin at Long corner; a pallet gives a second approach to the lid.
  steelCargo(36.45, 14.65, 2.40, 3.5, 1.28, '#4f7781');
  crate(36.45, 11.9, 1.78, 0.70);
  // Scaffold is open underneath. Only the structural posts and plank decks collide.
  function scaffold(x, w, top) {
    const z = -19.75, d = 2.65;
    for (const side of [-1, 1]) {
      for (const end of [-1, 1])
        box(x + side * (w / 2 - 0.12), top / 2, z + end * 1.19, 0.13, top, 0.13, wood, '#877253', true);
      box(x, top - 0.18, z + side * 1.19, w, 0.18, 0.13, wood, '#82674e');
      rod(v(x - w / 2 + 0.15, 0.16, z + side * 1.19),
          v(x + w / 2 - 0.15, top - 0.2, z + side * 1.19), 0.048, '#806950', wood);
    }
    for (let i = 0; i < 6; i++)
      box(x, top - 0.065, z + ((i + 0.5) / 6 - 0.5) * d, w, 0.13, d / 6 - 0.015, wood, i % 2 ? '#bca487' : '#cfb79a');
    solid(x, top - 0.065, z, w, 0.13, d);
  }
  scaffold(-21.92, 1.62, 0.72);
  scaffold(-23.86, 2.14, 1.48);
  // The pit shelf is below street level. The opposite lip keeps a clear firing lane to A.
  box(42.15, -1.03, 8.5, 2.5, 0.74, 4.82, stone, '#bfa17d', true);
  // Back Plat overlooks the B stack from the kasbah wall.
  box(-41.85, 1.42, -31.1, 5.8, 0.74, 4.55, stone, '#c0a383', true);
  for (const x of [-44.2, -42.65, -41.1, -39.55]) {
    box(x, 1.43, -28.80, 1.45, 0.62, 0.075, stone, '#d8bd99');
  }
  function barrel(x, z) {
    const base = terrainHeight(x, z);
    cylinder(x, base + 0.59, z, 0.44, 0.45, 1.18, '#477778', metal, 18);
    solid(x, base + 0.59, z, 0.88, 1.18, 0.88);
    for (const y of [0.04, 0.31, 0.86, 1.15])
      cylinder(x, base + y, z, 0.465, 0.465, 0.048, '#565b4d', metal, 18);
  }
  [
    [-7.9, 7],
    [-7.85, 8.1],
    [4.8, 1.05],
    [-23, -9],
    [25, 17],
    [48.15, 14.8],
    [4.8, -32.6],
  ].forEach((p) => barrel(...p));
  function cable(a, b, sag) {
    const points = [];
    for (let j = 0; j <= 18; j++) {
      const t = j / 18;
      points.push(
        a
          .clone()
          .lerp(b, t)
          .add(v(0, -sag * 4 * t * (1 - t), 0)),
      );
    }
    batch(new T.TubeGeometry(new T.CatmullRomCurve3(points), 22, 0.022, 5, false), flat, '#373d39');
  }
  for (let k = 0; k < 3; k++)
    cable(
      v(-10, 8.1 + k * 0.14, 8 - k * 0.32),
      v(13, 9.3 + k * 0.12, 4 - k * 0.35),
      1.9 + k * 0.12,
    );
  cable(v(-12, 10, -5), v(12, 7, -2), 1.9);
  cable(v(-14, 10, -6), v(-15, 13, -30), 2.4);
  cable(v(26, 9, 12), v(38, 8, -13), 1.8);
  function pennants(a, b) {
    cable(a, b, 0.95);
    for (let j = 1; j < 19; j++) {
      const t = j / 19,
        p = a.clone().lerp(b, t);
      p.y -= 0.95 * 4 * t * (1 - t);
      const g = new T.BufferGeometry();
      g.setAttribute(
        'position',
        new T.Float32BufferAttribute([-0.26, 0, 0, 0.26, 0, 0, 0.02, -0.75, rand() * 0.22], 3),
      );
      g.computeVertexNormals();
      batch(g, cloth, ['#b25439', '#c8a56e', '#497876', '#c6b189'][j % 4], p.x, p.y, p.z);
    }
  }
  pennants(v(-9, 6.1, -3), v(12, 6.9, -6.4));
  function palm(x, z, h, lean) {
    const base = terrainHeight(x, z), crown = v(x + lean, base + h, z + 0.28);
    for (let j = 0; j < 14; j++) {
      const t = j / 14,
        rt = 0.28 * (1 - 0.5 * t);
      cylinder(
        x + lean * t * t,
        base + h * (t + 0.036),
        z + 0.28 * t,
        rt * 0.96,
        rt * 1.21,
        h / 14 + 0.04,
        j % 2 ? '#897456' : '#79664c',
        flat,
        10,
      );
    }
    solid(x, base + h / 2, z, 0.48, h, 0.48);
    for (let j = 0; j < 18; j++) {
      const ang = (TAU * j) / 18 + rand() * 0.18,
        len = (2.2 + rand() * 1.75) * (h / 8),
        lift = 0.9 + rand() * 1.9;
      const dir = v(Math.cos(ang), 0, Math.sin(ang)),
        lateral = v(-dir.z, 0, dir.x);
      const point = (t) =>
        dir
          .clone()
          .multiplyScalar(t * len)
          .add(v(0, lift * Math.sin(t * Math.PI * 0.91) - 1.18 * t * t, 0));
      const positions = [];
      for (let k = 0; k < 23; k++) {
        const t = (k + 0.3) / 24,
          p = point(t),
          q = point(t + 0.043);
        for (const s of [-1, 1]) {
          const length = (0.22 + 0.43 * Math.sin(t * Math.PI)) * (1 - 0.5 * t);
          const tip = q
            .clone()
            .addScaledVector(lateral, s * length)
            .addScaledVector(dir, 0.35 + 0.18 * t);
          tip.y -= length * 0.72;
          const mid = p.clone().lerp(tip, 0.46);
          mid.y += 0.08;
          for (const vv of [p, q, mid, q, tip, mid]) positions.push(vv.x, vv.y, vv.z);
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      batch(
        geo,
        leaves,
        ['#667343', '#7b8550', '#526a43', '#8e8b51'][j % 4],
        crown.x,
        crown.y,
        crown.z,
      );
      const rib = new T.CatmullRomCurve3([point(0), point(0.32), point(0.68), point(1)]);
      batch(
        new T.TubeGeometry(rib, 10, 0.024, 4, false),
        leaves,
        '#86824f',
        crown.x,
        crown.y,
        crown.z,
      );
    }
  }
  [
    [9.6, 3, 8.5, -0.5],
    [-8.2, -6.6, 8.1, 0.52],
    [8, -20, 8.6, -0.45],
    [-23, 18, 7.9, 0.6],
    [42, -33, 10, 0.3],
    [-44, -34, 8, 0.5],
    [23, 24, 8.3, -0.7],
    [-42, 20, 9, 0.4],
  ].forEach((p) => palm(...p));
  // Impassable perimeter with an outer roofline, visible above alley walls.
  impactKind = 'wall';
  box(0, 2.55, -56, 128, 5.1, 1.6, stone, cream, true);
  box(0, 2.55, 56, 128, 5.1, 1.6, stone, cream, true);
  for (const s of [-1, 1]) box(s * 64, 2.7, 0, 1.7, 5.4, 112, stone, cream, true);
  for (let i = 0; i < 24; i++) {
    const x = -90 + i * 8,
      z = -65 - rand() * 22,
      h = 6 + rand() * 13;
    box(x, h / 2, z, 6 + rand() * 7, h, 8, plaster, '#dfbd9f');
    if (i % 4 === 0) dome(x, h, z, 2.4, '#a99b86');
  }
  for (const { mat, geos, impactKind } of batches.values()) {
    const merged = mergeGeometries(geos);
    merged.computeBoundingSphere();
    const mesh = new T.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.impactKind = impactKind;
    if (mat === leaves) mesh.customDepthMaterial = leafDepth;
    scene.add(mesh);
    zones.push(mesh);
    geos.forEach((g) => g.dispose());
  }
  function overlapsXZ(b, x, z, r) {
    return x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r;
  }
  // Static solids are indexed once. Padding covers the widest actor used by the hunt.
  const cells = new Map(), cellSize = 8, padding = 0.6, empty = [];
  for (const b of colliders) {
    for (let iz = Math.floor((b.min.z - padding) / cellSize); iz <= Math.floor((b.max.z + padding) / cellSize); iz++) {
      for (let ix = Math.floor((b.min.x - padding) / cellSize); ix <= Math.floor((b.max.x + padding) / cellSize); ix++) {
        const key = iz * 128 + ix;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(b);
      }
    }
  }
  function nearby(x, z) {
    return cells.get(Math.floor(z / cellSize) * 128 + Math.floor(x / cellSize)) ?? empty;
  }
  function verticalLimits(x, z, feet, bodyHeight = 1.84) {
    let floor = terrainHeight(x, z, feet),
      ceiling = Infinity;
    for (const b of nearby(x, z)) {
      if (!overlapsXZ(b, x, z, 0.32)) continue;
      if (b.max.y <= feet + 0.002) floor = Math.max(floor, b.max.y);
      if (b.min.y >= feet + bodyHeight - 0.002) ceiling = Math.min(ceiling, b.min.y - bodyHeight);
    }
    return { floor, ceiling };
  }
  function blocked(x, z, r = 0.32, feet = 0, bodyHeight = 1.84, stepHeight = 0.24) {
    if (Math.abs(x) > bounds.x - r || Math.abs(z) > bounds.z - r) return true;
    const surface = terrainHeight(x, z, feet);
    if (surface > feet + stepHeight) return true;
    const head = Math.max(feet, surface) + bodyHeight;
    return (r <= padding ? nearby(x, z) : colliders).some(
      (b) =>
        b.max.y > feet + 0.002 && b.min.y < head - 0.002 && overlapsXZ(b, x, z, r),
    );
  }
  function district(x, z, feet = 0) {
    if (x > -26.3 && x < -20.9 && Math.abs(z + 19.75) < 1.6) return x < -24.85 ? 'B 窗' : 'B 窗外鷹架';
    if (x > -44.8 && x < -38.9 && z > -33.4 && z < -28.7 && feet > 1.6) return 'B 點後平台';
    if (x > 40.8 && x < 43.5 && z > 6 && z < 11 && feet > -0.8) return 'A 大坑平台';
    if (Math.abs(x - 4.28) < 1.7 && Math.abs(z + 6.55) < 1.5 && feet > 1.1) return '中路 Xbox 箱';
    if (x > 36.6 && x < 46.6 && z > 17.3 && z < 27.7) return 'A 大道雙門';
    const area = terrainName(x, z, feet);
    if (area) return area;
    if (x < -24 && z < -16) return 'B 據點';
    if (x < -10 && x > -38 && z > -2 && z < 2.5) return 'B 區下層隧道';
    if (x > 36 && z < 20) return 'A 大道';
    if (z < -16) return 'CT 出生區';
    if (z > 16) return 'T 出生區';
    return z < -8 ? '中路雙門' : '中路';
  }
  // Keep the shadow sampling grid stationary in light space as the player moves.
  const lightOffset = sun.position.clone();
  const right = new T.Vector3(lightOffset.z, 0, -lightOffset.x).normalize();
  const up = new T.Vector3().crossVectors(lightOffset.clone().normalize(), right);
  const center = new T.Vector3();
  function centerShadow(x, z) {
    center.set(x, 0, z);
    const texel = 92 / sun.shadow.mapSize.x;
    for (const axis of [right, up]) {
      const d = center.dot(axis);
      center.addScaledVector(axis, Math.round(d / texel) * texel - d);
    }
    sun.target.position.copy(center);
    sun.position.copy(center).add(lightOffset);
  }
  return {
    sun,
    navigationBounds: bounds,
    colliders,
    zones,
    blocked,
    terrainHeight,
    verticalLimits,
    district,
    centerShadow,
    breeze,
  };
}
