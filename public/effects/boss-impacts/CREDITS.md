
# Boss attack effects — CC0

Source: https://github.com/effekseer/EffectMaterials
Revision: 8bf8edfedb51ac09af3d4cf788cb81746ea75a82
License statement: https://github.com/effekseer/EffectMaterials/blob/main/README.md
All data in the source repository are under CC0.

- ef_fire02 — KTK_kumamoto, Effekseer 1.7: ground fissure explosions.
- ef_parts_hit01 — Effekseer, Effekseer 1.7: violet spectral impacts.
- Referenced textures, mesh and dissolve material are from the same repository.
- tx_noise03_256 / tx_shockring01_256 are also used by our pooled ground-wave shader.
- tx_fire_flipbook01_1024: source 4x4 alpha flipbook, rendered by one instanced
  billboard batch with fire / spectral tint, interpolated frames and noise dissolve.

The runtime BIN_ chunk was extracted without changing its particle definition.
Runtime scale, colour and spawn timing are adjusted for FisherFPS.
Reproduce the import with tools/import_boss_impacts.py.
Original TMDC Zombie boss EFK and animated bone bindings remain in use separately.
