import * as T from 'three';

function impactTexture(mark) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  function puff(x, y, r, inner, outer) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (mark) {
    puff(64, 64, 58, 'rgba(42,36,24,.8)', 'rgba(70,59,37,0)');
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = (i * Math.PI) / 14,
        r = 19 + Math.random() * 14;
      ctx.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = '#b8a68e';
    ctx.fill();
    puff(64, 63, 25, '#1d1915', 'rgba(67,57,49,0)');
  } else {
    for (let i = 0; i < 48; i++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * 33;
      puff(
        64 + Math.cos(a) * r,
        64 + Math.sin(a) * r,
        13 + Math.random() * 17,
        'rgba(255,255,255,.32)',
        'rgba(255,255,255,0)',
      );
    }
  }
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

let smokeTexture;
export function getSmokeTexture() {
  return (smokeTexture ??= impactTexture(false));
}

export function makeEffects(scene, playBlood) {
  const up = new T.Vector3(0, 1, 0),
    forward = new T.Vector3(0, 0, 1);
  const gunLight = new T.PointLight(0xffab58, 0, 8, 2);
  scene.add(gunLight);
  let lightLife = 0, peakLight = 0;
  const dustMap = getSmokeTexture(),
    scarMap = impactTexture(true);
  const beam = new T.CylinderGeometry(0.005, 0.013, 1, 6);
  const light = new T.MeshBasicMaterial({
    color: 0xffdda1,
    toneMapped: false,
    transparent: true,
    opacity: 0.8,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const chip = new T.IcosahedronGeometry(1, 0);
  const grit = new T.MeshStandardMaterial({ color: 0xb69a73, roughness: 1 });
  const scarPlane = new T.PlaneGeometry(1, 1);
  function pool(count, make) {
    let index = 0;
    const entries = Array.from({ length: count }, () => {
      const obj = make();
      obj.visible = false;
      scene.add(obj);
      return { obj, velocity: new T.Vector3(), age: 0, life: 0 };
    });
    return {
      entries,
      take() {
        const slot = entries[index++ % entries.length];
        slot.age = 0;
        slot.obj.visible = true;
        return slot;
      },
    };
  }
  const trails = pool(6, () => new T.Mesh(beam, light));
  const fragments = pool(60, () => new T.Mesh(chip, grit));
  const clouds = pool(
    32,
    () =>
      new T.Sprite(new T.SpriteMaterial({ map: dustMap, transparent: true, depthWrite: false })),
  );
  const flashes = pool(
    5,
    () =>
      new T.Sprite(
        new T.SpriteMaterial({
          map: dustMap,
          color: 0xffba59,
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          toneMapped: false,
        }),
      ),
  );
  const marks = pool(
    32,
    () =>
      new T.Mesh(
        scarPlane,
        new T.MeshBasicMaterial({
          map: scarMap,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      ),
  );
  function impact(hit, power) {
    if (hit.kind === 'air') return;
    if (hit.kind === 'monster') {
      playBlood(hit.position, hit.normal);
      return;
    }
    const wall = hit.kind === 'wall';
    const normal = hit.normal;
    for (let i = 0; i < (wall ? 5 : 2); i++) {
      const p = clouds.take();
      p.obj.position.copy(hit.position).addScaledVector(normal, 0.055);
      p.velocity
        .randomDirection()
        .multiplyScalar(0.65)
        .addScaledVector(normal, 0.8 + Math.random() * 1.1);
      p.life = 0.28 + Math.random() * 0.38;
      p.size = (wall ? 0.88 : 0.44) * power;
      p.obj.material.color.set(0xc6ad8d);
      p.obj.material.rotation = Math.random() * 6.28;
      p.obj.material.opacity = 0.6;
      p.obj.scale.setScalar(0.12);
    }
    for (let i = 0; i < (wall ? 12 : 6); i++) {
      const p = fragments.take();
      p.obj.position.copy(hit.position).addScaledVector(normal, 0.025);
      p.velocity.randomDirection();
      if (p.velocity.dot(normal) < 0) p.velocity.reflect(normal);
      p.velocity.multiplyScalar(1 + Math.random() * 3).addScaledVector(normal, 1.2);
      p.life = 0.18 + Math.random() * 0.36;
      const s = 0.012 + Math.random() * 0.029;
      p.obj.scale.set(s, s * 0.68, s * 1.4);
    }
    if (wall) {
      const flare = flashes.take();
      flare.life = 0.065;
      flare.obj.position.copy(hit.position).addScaledVector(normal, 0.075);
      flare.obj.scale.setScalar(0.52 * power);
      flare.obj.material.opacity = 1;
      const p = marks.take();
      p.life = 14;
      p.obj.material.opacity = 0.9;
      p.obj.position.copy(hit.position).addScaledVector(normal, 0.008);
      p.obj.quaternion.setFromUnitVectors(forward, normal);
      p.obj.rotateZ(Math.random() * 6.28);
      p.obj.scale.setScalar((0.16 + Math.random() * 0.1) * power);
    }
  }
  function shot(from, hit, weapon) {
    gunLight.position.copy(from);
    lightLife = .085;
    peakLight = weapon === 'rifle' ? 19 : 12;
    const t = trails.take();
    t.origin ??= new T.Vector3();
    t.origin.copy(from);
    t.velocity.subVectors(hit.position, from);
    t.distance = t.velocity.length();
    t.velocity.normalize();
    t.speed = weapon === 'rifle' ? 580 : 370;
    t.life = Math.max(0.024, t.distance / t.speed);
    t.hit = hit;
    t.power = weapon === 'rifle' ? 1.16 : 1;
    t.obj.position.copy(from);
    t.obj.scale.set(1, 0.02, 1);
    t.obj.quaternion.setFromUnitVectors(up, t.velocity);
  }
  function update(dt) {
    if (dt <= 0) return;
    gunLight.intensity = peakLight * (lightLife / .085) ** 2;
    lightLife = Math.max(0, lightLife - dt);
    for (const t of trails.entries) {
      if (!t.obj.visible) continue;
      // Leave the tip on screen for one rendered frame, even at a low frame rate.
      if (t.age >= t.life) {
        t.obj.visible = false;
        continue;
      }
      t.age += dt;
      const tip = t.distance * Math.min(1, t.age / t.life);
      const tail = Math.max(0, tip - Math.min(3.8, t.distance * 0.5));
      t.obj.position.copy(t.origin).addScaledVector(t.velocity, (tip + tail) * 0.5);
      t.obj.scale.y = Math.max(0.01, tip - tail);
      if (t.age >= t.life) impact(t.hit, t.power);
    }
    for (const set of [fragments, clouds, flashes, marks]) {
      for (const p of set.entries) {
        if (!p.obj.visible) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.obj.visible = false;
          continue;
        }
        const t = p.age / p.life;
        if (set === clouds) {
          p.velocity.multiplyScalar(Math.exp(-dt * 3.8));
          p.velocity.y += 0.9 * dt;
          p.obj.position.addScaledVector(p.velocity, dt);
          p.obj.scale.setScalar(0.12 + p.size * Math.sqrt(t));
          p.obj.material.opacity = 0.57 * (1 - t) ** 1.5;
        } else if (set === fragments) {
          p.velocity.y -= 9.8 * dt;
          p.obj.position.addScaledVector(p.velocity, dt);
          p.obj.rotation.x += dt * 8;
        } else if (set === flashes) p.obj.material.opacity = 1 - t;
        else p.obj.material.opacity = Math.min(0.88, (1 - t) * 5);
      }
    }
  }
  return { shot, update };
}
