import * as T from 'three';

export const grenadeStats = { supply: 5, gravity: 9.81, radius: .075, fuse: 2.7, blastRadius: 11, damage: 155 };
const stepTime = 1 / 120;
export function throwVelocity(direction, power, movement = new T.Vector3()) {
  const velocity = direction.clone().normalize().multiplyScalar(10 + 9 * T.MathUtils.clamp(power, 0, 1));
  velocity.y += 2.2;
  return velocity.addScaledVector(movement, .65);
}
export function blastDamage(distance) {
  return distance >= grenadeStats.blastRadius ? 0
    : Math.round(grenadeStats.damage * (1 - .85 * Math.pow(Math.max(0, distance) / grenadeStats.blastRadius, 1.25)));
}
export function makeBallistic(position, velocity, sweep) {
  const p = position.clone(), v = velocity.clone(), next = new T.Vector3(), delta = new T.Vector3();
  let age = 0, accumulator = 0, resting = false, bounces = 0, impact = 0;
  return {
    position: p, velocity: v,
    get age() { return age; }, get resting() { return resting; }, get bounces() { return bounces; },
    // Strongest normal impact speed since the last call; sliding contacts report almost zero.
    takeImpact() { const value = impact; impact = 0; return value; },
    update(dt) {
      accumulator += dt;
      while (accumulator + 1e-9 >= stepTime && age + 1e-8 < grenadeStats.fuse) {
        accumulator -= stepTime; age += stepTime;
        if (resting) continue;
        // Analytic gravity inside a fixed step, with a swept sphere against the environment.
        next.copy(p).addScaledVector(v, stepTime); next.y -= .5 * grenadeStats.gravity * stepTime ** 2;
        v.y -= grenadeStats.gravity * stepTime;
        const hit = sweep(p, next, grenadeStats.radius);
        if (hit) {
          p.copy(hit.position).addScaledVector(hit.normal, .001);
          const normalSpeed = v.dot(hit.normal);
          if (normalSpeed < 0) {
            v.addScaledVector(hit.normal, -1.43 * normalSpeed);
            delta.copy(hit.normal).multiplyScalar(v.dot(hit.normal));
            v.sub(delta).multiplyScalar(.72).add(delta);
            bounces++;
            impact = Math.max(impact, -normalSpeed);
          }
          if (hit.normal.y > .65 && v.lengthSq() < .65) { v.set(0, 0, 0); resting = true; }
        } else p.copy(next);
      }
      if(age + 1e-8 >= grenadeStats.fuse){age=grenadeStats.fuse;return true;}
      return false;
    },
  };
}

// Swept sphere vs expanded collision boxes. The terrain check also covers slopes in the market.
export function makeGrenadeSweep(world) {
  const ray = new T.Ray(), direction = new T.Vector3(), expanded = new T.Box3(), point = new T.Vector3();
  return (from, to, radius) => {
    direction.subVectors(to, from);
    const length = direction.length();
    if (length < 1e-9) return null;
    ray.set(from, direction.divideScalar(length));
    let distance = length + 1, result = null;
    for (const box of world.colliders) {
      expanded.copy(box).expandByScalar(radius);
      if (expanded.containsPoint(from)) continue;
      if (!ray.intersectBox(expanded, point)) continue;
      const d = from.distanceTo(point);
      if (d > length || d >= distance) continue;
      const normal = new T.Vector3();
      let nearest = Infinity;
      for (const axis of ['x', 'y', 'z']) for (const side of ['min', 'max']) {
        const gap = Math.abs(point[axis] - expanded[side][axis]);
        if (gap < nearest) { nearest = gap; normal.set(0, 0, 0); normal[axis] = side === 'min' ? -1 : 1; }
      }
      distance = d; result = { position: point.clone(), normal };
    }
    const height = world.terrainHeight(to.x, to.z) + radius;
    if (to.y <= height) {
      const t = T.MathUtils.clamp((from.y - height) / Math.max(1e-9, from.y - to.y), 0, 1);
      const ground = from.clone().lerp(to, t); ground.y = height;
      if (from.distanceTo(ground) < distance) {
        const e = .08;
        const normal = new T.Vector3(world.terrainHeight(to.x-e,to.z)-world.terrainHeight(to.x+e,to.z), 2*e,
          world.terrainHeight(to.x,to.z-e)-world.terrainHeight(to.x,to.z+e)).normalize();
        result = { position: ground, normal };
      }
    }
    return result;
  };
}
