/** Convert the original game rigs, including their animated parent nodes and skin palettes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Vector3, Quaternion } from 'three';

const source = process.argv[2];
if (!source) throw new Error('Pass the TMDC_Zombie directory as the first argument.');
const output = fileURLToPath(new URL('../public/monsters/', import.meta.url));
for (const [key, folder, model, skin] of [
  ['walker', 'GoldenZombie_Man', 'Zombie_man', 'Zombie_man_ALL_01'],
  ['stalker', 'GoldenZombie_Woman', 'Zombie_girl', 'Zombie_girl_ALL_01'],
  ['raider', 'Thief', 'Grave_robber', 'Grave_robber'],
]) {
  const dir = path.join(source, 'ClientCocos/ZombieResource/Models/Fish', folder);
  const data = fs.readFileSync(path.join(dir, model + '.c3b'));
  if (!data.subarray(0, 6).equals(Buffer.from([67, 51, 66, 0, 0, 7])))
    throw new Error('Expected C3B 0.7');
  let cursor = 6;
  function u32() {
    const v = data.readUInt32LE(cursor);
    cursor += 4;
    return v;
  }
  function f32() {
    const v = data.readFloatLE(cursor);
    cursor += 4;
    return v;
  }
  function string() {
    const size = u32();
    cursor += size;
    return data.toString('utf8', cursor - size, cursor);
  }
  function read(count, fn) {
    return Array.from({ length: count }, () => fn());
  }
  const offsets = new Map();
  for (const entry of read(u32(), () => [string(), u32(), u32()])) offsets.set(entry[1], entry[2]);

  const gltf = {
    asset: { version: '2.0', generator: 'FisherFPS Cocos 0.7', extras: { frameOffset: 0 } },
    scene: 0,
    scenes: [{ nodes: [0] }],
    // The animated root joints already contain the Cocos axis conversion.
    nodes: [{ name: 'Centimeters to meters', scale: [0.01, 0.01, 0.01], children: [] }],
    accessors: [],
    bufferViews: [],
    buffers: [],
    meshes: [],
    skins: [],
    animations: [],
    images: [],
    textures: [{ source: 0 }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.82,
        },
      },
    ],
  };
  const chunks = [];
  let bytes = 0;
  function bufferView(buffer) {
    const bin = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const id = gltf.bufferViews.push({ buffer: 0, byteOffset: bytes, byteLength: bin.length }) - 1;
    const pad = (4 - (bin.length % 4)) % 4;
    chunks.push(bin, Buffer.alloc(pad));
    bytes += bin.length + pad;
    return id;
  }
  function accessor(values, type, componentType = 5126, bounds = false) {
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const typed = componentType === 5126 ? Float32Array.from(values) : Uint16Array.from(values);
    const a = { bufferView: bufferView(typed), componentType, count: typed.length / width, type };
    if (bounds) {
      a.min = Array(width).fill(Infinity);
      a.max = Array(width).fill(-Infinity);
      typed.forEach((v, i) => {
        const j = i % width;
        a.min[j] = Math.min(a.min[j], v);
        a.max[j] = Math.max(a.max[j], v);
      });
    }
    return gltf.accessors.push(a) - 1;
  }
  const attributesByName = {
    POSITION: ['POSITION', 'VEC3'],
    NORMAL: ['NORMAL', 'VEC3'],
    TEX_COORD: ['TEXCOORD_0', 'VEC2'],
    BLEND_WEIGHT: ['WEIGHTS_0', 'VEC4'],
    BLEND_INDEX: ['JOINTS_0', 'VEC4'],
  };
  const primitives = new Map();
  cursor = offsets.get(34);
  const meshCount = u32();
  for (let m = 0; m < meshCount; m++) {
    const fields = read(u32(), () => ({
      size: u32(),
      type: string(),
      attr: string().replace('VERTEX_ATTRIB_', ''),
      values: [],
    }));
    const stride = fields.reduce((n, f) => n + f.size, 0),
      vertices = u32() / stride;
    for (let v = 0; v < vertices; v++) for (const f of fields) f.values.push(...read(f.size, f32));
    const parts = u32();
    for (let j = 0; j < parts; j++) {
      const name = string(),
        indices = read(u32(), () => {
          const i = data.readUInt16LE(cursor);
          cursor += 2;
          return i;
        });
      cursor += 24; // Stored mesh-part bounds.
      // Each mesh part has a separate joint palette. Unreferenced vertices belong to other skins.
      const vertices = [...new Set(indices)],
        remap = new Map(vertices.map((index, i) => [index, i]));
      const attributes = {};
      for (const f of fields) {
        if (f.type !== 'GL_FLOAT') throw new Error('Unexpected vertex component ' + f.type);
        const [attr, type] = attributesByName[f.attr];
        const values = vertices.flatMap((i) => f.values.slice(i * f.size, (i + 1) * f.size));
        if (attr === 'TEXCOORD_0')
          for (let i = 1; i < values.length; i += 2) values[i] = 1 - values[i];
        attributes[attr] = accessor(
          values,
          type,
          attr === 'JOINTS_0' ? 5123 : 5126,
          attr === 'POSITION',
        );
      }
      primitives.set(name, {
        attributes,
        indices: accessor(
          indices.map((i) => remap.get(i)),
          'SCALAR',
          5123,
        ),
        material: 0,
      });
    }
  }
  const byName = new Map(),
    bindings = [];
  function node() {
    const name = string();
    cursor++; // The skeleton flag precedes the local matrix.
    const mat = new Matrix4().fromArray(read(16, f32)),
      pos = new Vector3(),
      rot = new Quaternion(),
      scale = new Vector3();
    mat.decompose(pos, rot, scale);
    const n = { name, translation: pos.toArray(), rotation: rot.toArray(), scale: scale.toArray() };
    const id = gltf.nodes.push(n) - 1;
    byName.set(name, id);
    const parts = u32();
    for (let j = 0; j < parts; j++) {
      const prim = primitives.get(string());
      string();
      if (j > 0 || !prim) throw new Error('Unexpected character mesh partition');
      n.mesh = gltf.meshes.push({ primitives: [prim] }) - 1;
      const bones = read(u32(), () => ({ name: string(), inverse: read(16, f32) }));
      if (bones.length) bindings.push({ node: n, bones });
      const uvMaps = u32();
      for (let k = 0; k < uvMaps; k++) {
        const textureIndices = u32();
        cursor += 4 * textureIndices;
      }
    }
    const children = read(u32(), node);
    if (children.length) n.children = children;
    return id;
  }
  cursor = offsets.get(2);
  gltf.nodes[0].children = read(u32(), node);
  for (const { node: n, bones } of bindings) {
    n.skin =
      gltf.skins.push({
        joints: bones.map((b) => byName.get(b.name)),
        inverseBindMatrices: accessor(
          bones.flatMap((b) => b.inverse),
          'MAT4',
        ),
      }) - 1;
  }
  cursor = offsets.get(3);
  const anim = { name: string(), samplers: [], channels: [] };
  const duration = f32(),
    animatedNodes = u32();
  for (let i = 0; i < animatedNodes; i++) {
    const name = string(),
      count = u32();
    const channels = [
      ['rotation', 4],
      ['scale', 3],
      ['translation', 3],
    ].map(([kind, size]) => ({ kind, size, times: [], values: [] }));
    for (let k = 0; k < count; k++) {
      const t = f32() * duration,
        flags = data[cursor++];
      for (const [bit, c] of channels.entries())
        if (flags & (1 << bit)) {
          c.times.push(t);
          c.values.push(...read(c.size, f32));
        }
    }
    for (const c of channels)
      if (c.times.length) {
        const sampler =
          anim.samplers.push({
            input: accessor(c.times, 'SCALAR', 5126, true),
            output: accessor(c.values, 'VEC' + c.size),
          }) - 1;
        anim.channels.push({ sampler, target: { node: byName.get(name), path: c.kind } });
      }
  }
  gltf.animations.push(anim);
  gltf.images.push({
    mimeType: 'image/jpeg',
    bufferView: bufferView(fs.readFileSync(path.join(dir, skin + '.jpg'))),
  });
  gltf.buffers.push({ byteLength: bytes });
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonSize = Math.ceil(json.length / 4) * 4;
  const header = Buffer.alloc(20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonSize + bytes, 8);
  header.writeUInt32LE(jsonSize, 12);
  header.write('JSON', 16);
  const bin = Buffer.alloc(8);
  bin.writeUInt32LE(bytes);
  bin.write('BIN', 4);
  fs.writeFileSync(
    path.join(output, key + '.glb'),
    Buffer.concat([header, json, Buffer.alloc(jsonSize - json.length, 32), bin, ...chunks]),
  );
}
