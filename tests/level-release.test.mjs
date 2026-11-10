import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { releaseScene } from '../src/level-release.js';

const disposed = (resource) => {
  const state = { count: 0 };
  resource.addEventListener('dispose', () => state.count++);
  return state;
};

test('releases geometry, materials, textures, shadow maps and bone textures of a level', () => {
  const level = new T.Scene();
  const map = new T.Texture(), env = new T.Texture();
  const geometry = new T.BoxGeometry(), material = new T.MeshStandardMaterial({ map });
  level.add(new T.Mesh(geometry, material));
  const sun = new T.DirectionalLight();
  sun.castShadow = true;
  level.add(sun);
  const bone = new T.Bone(), skinned = new T.SkinnedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
  skinned.add(bone);
  skinned.bind(new T.Skeleton([bone]));
  level.add(skinned);
  level.environment = env;
  const watch = [geometry, material, map, env].map(disposed);
  let shadowDisposed = 0;
  sun.shadow.dispose = () => shadowDisposed++;
  let skeletonDisposed = 0;
  skinned.skeleton.dispose = () => skeletonDisposed++;

  const released = releaseScene(level);
  assert.deepEqual(watch.map((w) => w.count), [1, 1, 1, 1]);
  assert.equal(shadowDisposed, 1);
  assert.equal(skeletonDisposed, 1);
  assert.equal(level.children.length, 0);
  assert.equal(level.environment, null);
  assert.ok(released.textures >= 2);
});

test('resources shared with a kept scene stay resident', () => {
  const desert = new T.Scene(), boss = new T.Scene();
  const sharedGeometry = new T.BoxGeometry(), sharedTexture = new T.Texture(), environment = new T.Texture();
  const sharedMaterial = new T.MeshStandardMaterial({ map: sharedTexture });
  desert.add(new T.Mesh(sharedGeometry, sharedMaterial));
  desert.environment = environment;
  // The boss reuses the desert's geometry and environment but has its own skin.
  const skin = new T.Texture(), skinMaterial = new T.MeshStandardMaterial({ map: skin });
  boss.add(new T.Mesh(sharedGeometry, skinMaterial));
  boss.environment = environment;
  const watch = [sharedGeometry, sharedTexture, environment, skin, skinMaterial].map(disposed);

  releaseScene(boss, [desert]);
  assert.deepEqual(watch.map((w) => w.count), [0, 0, 0, 1, 1]);
  assert.equal(desert.children.length, 1, 'the kept scene is untouched');
});

test('textures bound through shader uniforms are released too', () => {
  const level = new T.Scene(), noise = new T.Texture(), ramp = new T.Texture();
  const material = new T.ShaderMaterial({ uniforms: { noise: { value: noise }, ramps: { value: [ramp] } } });
  level.add(new T.Mesh(new T.PlaneGeometry(), material));
  const watch = [noise, ramp].map(disposed);
  releaseScene(level);
  assert.deepEqual(watch.map((w) => w.count), [1, 1]);
});
