# Classic silver Desert Eagle

“Desert Eagle” by ELIZION, CC BY 4.0.
Original: https://sketchfab.com/3d-models/desert-eagle-cabde59f5cf24effaf80536e35d04e95
Author: https://sketchfab.com/ELIZION
License: https://creativecommons.org/licenses/by/4.0/
Source copy: https://github.com/AetherRadar/operation-steel-tide/tree/main/assets/models/elizion_desert_eagle
Original SHA-256: 87b22c44a9b58d0a3aaee72232480de35008d95534f11ad84c8ae9a2cf4f9063

FisherFPS modifications: separate animated assemblies, viewmodel coordinates,
silver brushed-chrome physical material, optimized WebP textures, magazine choreography,
and independent gloved hand poses. The source asset remains copyright ELIZION.

The independent clone of the existing clean gloved arm rig retains the arm and rig
attributions in CREDITS.txt. The P12 and all earlier weapons are preserved.

Visual reference: https://www.magnumresearch.com/desert-eagle/
Classic six-inch silhouette and brushed chrome finish; gameplay timing is authored
for the game, not a claim about real-world firing performance.

Rebuild (Blender, Python + Pillow):
1. Download the source GLB from the source copy above.
2. blender -b --python tools/prepare_desert_eagle.py -- source.glb prepared.glb
3. python tools/pack_desert_eagle.py prepared.glb public/viewmodel/desert-eagle.glb
