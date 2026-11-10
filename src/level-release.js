// Frees the GPU memory of a level scene that will not be shown again: geometry
// buffers, textures (including the environment map), compiled shader programs,
// bone textures, instancing buffers and shadow maps.
//
// three.js never frees GPU memory on garbage collection; only dispose() does.
// Resources still reachable from a scene in `keep` (monster geometry shared
// with the desert, the shared environment map) are left alone. Disposing only
// drops the GPU copy, so a shared resource missed here would simply upload
// again the next time it is drawn rather than break.

function collect(root, into) {
  const addTexture = (value) => { if (value?.isTexture) into.textures.add(value); };
  for (const value of [root.environment, root.background]) addTexture(value);
  root.traverse((object) => {
    if (object.geometry) into.geometries.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      into.materials.add(material);
      for (const value of Object.values(material)) addTexture(value);
      for (const uniform of Object.values(material.uniforms ?? {})) {
        const value = uniform?.value;
        if (Array.isArray(value)) value.forEach(addTexture);
        else addTexture(value);
      }
    }
    if (object.skeleton) into.skeletons.add(object.skeleton);
    if (object.isLight || object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh) into.objects.add(object);
  });
  return into;
}

const empty = () => ({ geometries: new Set(), materials: new Set(), textures: new Set(), skeletons: new Set(), objects: new Set() });

/**
 * Dispose everything `scene` uses that no scene in `keep` uses, then empty it.
 * Returns how many resources of each kind were released.
 */
export function releaseScene(scene, keep = []) {
  const doomed = collect(scene, empty()), kept = empty();
  for (const other of keep) collect(other, kept);
  const released = {};
  for (const kind of Object.keys(doomed)) {
    released[kind] = 0;
    for (const resource of doomed[kind]) {
      if (kept[kind].has(resource)) continue;
      // Lights free their shadow map; instanced/skinned/batched meshes their extra buffers.
      resource.dispose?.();
      released[kind]++;
    }
  }
  scene.clear();
  scene.environment = scene.background = null;
  return released;
}
