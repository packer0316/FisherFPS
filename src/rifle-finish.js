import * as T from 'three';

// Distances to real creases, in the rifle's authored units. Coplanar triangle
// diagonals and concave seams don't get a silver outline when the gun catches light.
export function creaseGeometry(source, points, attribute = 'akEdge') {
  const index = source.index?.array;
  const count = index ? index.length : points.length;
  const welded = new Map(), edges = new Map();
  const ids = points.map(p => {
    const key = [p.x, p.y, p.z].map(n => Math.round(n * 20000)).join('/');
    if (!welded.has(key)) welded.set(key, welded.size);
    return welded.get(key);
  });
  const distance = new Float32Array(count * 3).fill(1);
  const a = new T.Vector3(), b = new T.Vector3(), normal = new T.Vector3();
  function mark(face, opposite, height) {
    for (let k = 0; k < 3; k++)
      distance[(face + k) * 3 + opposite] = k === opposite ? height : 0;
  }
  for (let i = 0; i < count; i += 3) {
    const corners = index ? [index[i], index[i + 1], index[i + 2]] : [i, i + 1, i + 2];
    const [p, q, r] = corners.map(k => points[k]);
    normal.crossVectors(a.subVectors(q, p), b.subVectors(r, p));
    const area = normal.length();
    if (area < 1e-10) continue;
    normal.multiplyScalar(1 / area);
    for (let k = 0; k < 3; k++) {
      const u = corners[(k + 1) % 3], v = corners[(k + 2) % 3];
      const key = Math.min(ids[u], ids[v]) * points.length + Math.max(ids[u], ids[v]);
      const height = area / points[u].distanceTo(points[v]);
      const other = edges.get(key);
      if (!other) {
        edges.set(key, { face: i, k, height, normal: normal.clone() });
      } else if (normal.dot(other.normal) < 0.84 && a.subVectors(points[corners[k]], points[u]).dot(other.normal) < 0.000015) {
        mark(other.face, other.k, other.height);
        mark(i, k, height);
      }
    }
  }
  const geometry = index ? source.toNonIndexed() : source;
  geometry.setAttribute(attribute, new T.BufferAttribute(distance, 3));
  return geometry;
}

const finishes = {
  AK47BluedReceiverSteel: { steel: [0.054, 0.070, 0.083], rough: 0.36, metal: 0.78 },
  AK47PhosphateSteel: { steel: [0.057, 0.064, 0.065], rough: 0.55, metal: 0.59 },
  AK47WornBoltSteel: { steel: [0.19, 0.21, 0.22], rough: 0.31, metal: 0.84 },
  AK47LaminatedWoodPBR: { wood: true },
  AK47BakeliteMagazine: { polymer: true },
};

export function finishRifle(space, detailMap) {
  const matrix = new T.Matrix4(), inverse = space.matrixWorld.clone().invert();
  const materials = new Map();
  space.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible || mesh.isSkinnedMesh) return;
    const original = mesh.material, finish = finishes[original.name];
    if (!finish) return;
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    const geometry = mesh.geometry, pos = geometry.attributes.position;
    const points = Array.from({ length: pos.count }, (_, i) =>
      new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrix));
    const uv = new Float32Array(pos.count * 2);
    // Use the same coordinates on the fresh and spent magazines.
    const origin = finish.polymer ? mesh.parent.getWorldPosition(new T.Vector3()).applyMatrix4(inverse) : new T.Vector3();
    points.forEach((p, i) => {
      const z = p.z - origin.z, cross = p.y - origin.y + 0.62 * (p.x - origin.x);
      const grip = finish.wood && p.y < -0.08 && p.z > -0.26;
      uv[i * 2] = grip ? -p.y * 1.8 : z * (finish.wood ? 1.7 : 4.8);
      uv[i * 2 + 1] = grip ? (p.x + p.z * 0.70) * 5.2 : cross * (finish.wood ? 5.0 : 6.4);
    });
    geometry.setAttribute('akUv', new T.BufferAttribute(uv, 2));
    if (finish.steel) mesh.geometry = creaseGeometry(geometry, points);
    if (!materials.has(original.name)) {
      const m = original.clone();
      m.color.set(0xffffff);
      m.aoMapIntensity = 0.65;
      m.clearcoat = finish.wood ? 0.25 : finish.polymer ? 0.075 : 0;
      m.clearcoatRoughness = finish.wood ? 0.34 : 0.52;
      installFinishShader(m, finish, detailMap);
      materials.set(original.name, m);
    }
    mesh.material = materials.get(original.name);
  });
}

function installFinishShader(material, finish, detailMap) {
  const steel = !!finish.steel;
  material.customProgramCacheKey = () => 'ak-finish-' + material.name;
  material.onBeforeCompile = shader => {
    shader.uniforms.akDetail = { value: detailMap };
    const edgeVarying = steel ? 'varying vec3 vAkEdge;' : '';
    shader.vertexShader = 'attribute vec2 akUv; varying vec2 vAkUv;\n' +
      (steel ? 'attribute vec3 akEdge;' + edgeVarying + '\n' : '') +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAkUv = akUv;\n' +
        (steel ? 'vAkEdge = akEdge;' : ''));
    const layer = steel ? `
      float edgeDistance = min(vAkEdge.x, min(vAkEdge.y, vAkEdge.z));
      float wear = (1.0 - smoothstep(0.00035, 0.0021 + min(fwidth(edgeDistance), 0.002), edgeDistance))
                   * smoothstep(0.26, 0.73, detail.g) * 0.83;
      vec3 oxide = vec3(${finish.steel.join(',')}) * (0.75 + 0.38 * detail.g + 0.18 * detail.r);
      diffuseColor.rgb = mix(oxide, vec3(0.34,0.36,0.36), wear) * originalTone;
      float akRough = mix(${finish.rough.toFixed(2)} + 0.19 * (detail.r - 0.50) + 0.08 * (detail.g - 0.50), 0.32, wear);
      float akMetal = mix(${finish.metal.toFixed(2)}, 0.91, wear);
      float microHeight = 0.000075 * detail.r;` : finish.wood ? `
      float layer = vAkUv.y * 7.0 + 0.70 * detail.g + 0.18 * sin(6.283 * vAkUv.x);
      float veneer = cos(6.283 * layer) * (1.0 - smoothstep(0.15,0.7,fwidth(layer)));
      float figure = smoothstep(0.12, 0.78, detail.b + 0.038 * veneer);
      vec3 walnut = mix(vec3(0.092,0.032,0.012), vec3(0.28,0.112,0.035), figure);
      diffuseColor.rgb = walnut * (0.86 + 0.19 * detail.g) * originalTone;
      float akRough = mix(0.49, 0.36, figure);
      float akMetal = 0.0;
      float microHeight = 0.000035 * detail.b;` : `
      diffuseColor.rgb = mix(vec3(0.060,0.023,0.012), vec3(0.16,0.059,0.026), detail.g) * originalTone;
      float akRough = 0.50 + 0.14 * (detail.r - 0.5);
      float akMetal = 0.035;
      float microHeight = 0.000055 * detail.r;`;
    shader.fragmentShader = 'uniform sampler2D akDetail; varying vec2 vAkUv; ' + edgeVarying + '\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 detail = texture2D(akDetail, vAkUv).rgb;
        float originalTone = clamp(0.87 + 9.0 * dot(diffuseColor.rgb, vec3(0.25,0.60,0.15)), 0.86, 1.14);
        ${layer}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(akRough + (roughnessFactor - 0.5) * 0.12, 0.18, 0.86);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = akMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 qx = dFdx(-vViewPosition), qy = dFdy(-vViewPosition);
        vec3 tx = cross(qy, normal), ty = cross(normal, qx);
        float det = dot(qx, tx);
        vec3 relief = sign(det) * (dFdx(microHeight) * tx + dFdy(microHeight) * ty);
        normal = normalize(max(abs(det), 1e-10) * normal - relief);`);
  };
}
