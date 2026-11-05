import * as T from 'three';

const range = T.MathUtils.randFloat;
const tau = Math.PI * 2;

function brokenConcrete() {
  const geometry = new T.DodecahedronGeometry(1, 0);
  const vertices = geometry.attributes.position;
  // Deform coincident vertices identically so the broken faces stay watertight.
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const chip = 0.88 + 0.15 * Math.sin(x * 13 + y * 23 + z * 29);
    vertices.setXYZ(i, x * chip + 0.23 * y, y * chip, z * chip - 0.19 * x);
  }
  geometry.computeVertexNormals();
  const colors = [];
  for (let i = 0; i < vertices.count; i += 3) {
    const cut = 0.79 + 0.16 * geometry.attributes.normal.getY(i) + 0.07 * Math.sin(i * 3.7);
    for (let j = 0; j < 3; j++) colors.push(cut, cut, cut);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  return geometry;
}

export function makePrisonRubble(scene, coarse, colliders, trussY, concrete) {
  const capacity = coarse ? 64 : 104;
  const mesh = new T.InstancedMesh(brokenConcrete(), new T.MeshStandardMaterial({
    map: concrete.map, normalMap: concrete.normalMap, normalScale: new T.Vector2(0.58, 0.58),
    vertexColors: true, roughness: 0.98, flatShading: true,
  }), capacity);
  mesh.name = 'Prison impact rubble';
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.setColorAt(0, new T.Color());
  mesh.instanceColor.setUsage(T.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const palette = [0xe8e6e1, 0xadb5bf, 0xd2c9b9, 0x9baab9, 0xe1dccf].map(c => new T.Color(c));
  const stones = Array.from({ length: capacity }, () => ({
    position: new T.Vector3(), velocity: new T.Vector3(), size: new T.Vector3(),
    spin: new T.Vector3(), rotation: new T.Euler(), color: palette[0],
    bounces: 0, rest: 0, restLife: 0, settled: false,
  }));
  const pose = new T.Object3D();
  const cover = colliders.filter(b => b.max.y > 0 && b.max.y <= 2);
  let active = 0;

  function surface(x, z, below) {
    let y = 0;
    for (const b of cover) {
      if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= below)
        y = Math.max(y, b.max.y);
    }
    return y;
  }

  function burst(at, strength, attack, origin) {
    const circle = attack === 'circle';
    const count = Math.round((circle ? 40 : 30) * (coarse ? 0.63 : 1));
    const overhead = circle ? (coarse ? 4 : 7) : 0;
    const heading = Math.atan2(at.x - origin.x, at.z - origin.z);
    const rightX = Math.cos(heading), rightZ = -Math.sin(heading);
    for (let i = 0; i < count + overhead && active < capacity; i++) {
      const s = stones[active++];
      const roof = i >= count;
      const large = i % 5 === 0;
      const size = large ? range(0.15, 0.27) : range(0.045, 0.14);
      const angle = (i + Math.random()) * tau / count;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      let x, y, z;
      if (roof) {
        // The main crossbeams are eight metres apart along the Z axis.
        x = T.MathUtils.clamp(at.x + range(-4, 4), -21, 21);
        z = T.MathUtils.clamp(Math.round(at.z / 8) * 8, -24, 24) + range(-0.10, 0.10);
        y = trussY - 0.19;
        s.velocity.set(range(-0.55, 0.55), range(-1.8, -0.3), range(-0.6, 0.6));
      } else if (circle) {
        const radius = range(0.8, 3.65);
        x = at.x + dx * radius; z = at.z + dz * radius;
        const speed = range(2.0, 5.0);
        s.velocity.set(dx * speed, range(4, 7.0), dz * speed);
      } else {
        // Lift two ragged seams down the actual locked attack lane.
        const along = i % 4 === 0 ? range(0.82, 1) : (i + Math.random()) / count;
        const side = i % 2 === 0 ? -1 : 1;
        const offset = side * range(0.28, 1.35);
        x = T.MathUtils.lerp(origin.x, at.x, along) + rightX * offset;
        z = T.MathUtils.lerp(origin.z, at.z, along) + rightZ * offset;
        const cross = side * range(1.3, 3.6), forward = range(0.4, 2.1);
        s.velocity.set(rightX * cross - rightZ * forward, range(3.3, 6.7) * strength,
          rightZ * cross + rightX * forward);
      }
      s.size.set(size * range(1, 1.65), size * range(0.5, 0.9), size * range(0.7, 1.2));
      s.position.set(x, y ?? surface(x, z, Infinity) + s.size.y, z);
      s.rotation.set(range(0, tau), range(0, tau), range(0, tau));
      s.spin.set(range(-8, 8), range(-7, 7), range(-8, 8));
      s.color = palette[Math.floor(Math.random() * palette.length)];
      s.bounces = s.rest = 0;
      s.restLife = range(0.5, 1.05);
      s.settled = false;
    }
  }

  function update(dt) {
    if (!active) return;
    for (let i = 0; i < active;) {
      const s = stones[i], p = s.position, v = s.velocity;
      if (s.settled) {
        s.rest += dt;
        if (s.rest >= s.restLife) {
          stones[i] = stones[--active];
          stones[active] = s;
          continue;
        }
      } else {
        const previousY = p.y;
        p.addScaledVector(v, dt);
        p.y -= 0.5 * 9.81 * dt * dt;
        v.y -= 9.81 * dt;
        s.rotation.x += s.spin.x * dt;
        s.rotation.y += s.spin.y * dt;
        s.rotation.z += s.spin.z * dt;
        if (v.y < 0) {
          const floor = surface(p.x, p.z, previousY) + s.size.y;
          if (p.y <= floor) {
            p.y = floor;
            s.bounces++;
            v.set(v.x * 0.55, -v.y * 0.32, v.z * 0.55);
            s.spin.multiplyScalar(0.55);
            s.settled = s.bounces >= 2 || v.y < 0.8;
          }
        }
      }
      pose.position.copy(p);
      pose.rotation.copy(s.rotation);
      pose.scale.copy(s.size).multiplyScalar(Math.min(1, (s.restLife - s.rest) / 0.35));
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
      mesh.setColorAt(i, s.color);
      i++;
    }
    mesh.count = active;
    mesh.visible = active > 0;
    mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true;
  }
  function clear() {
    active = mesh.count = 0;
    mesh.visible = false;
  }
  return { burst, update, clear };
}
