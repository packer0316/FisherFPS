"""Run with Blender --background --python tools/convert_monsters.py -- <source directory>."""
import sys
from pathlib import Path
import bpy


source = Path(sys.argv[sys.argv.index("--") + 1])
output = Path(__file__).resolve().parents[1] / "public" / "monsters"
output.mkdir(parents=True, exist_ok=True)
models = [

    ("mummy", "木乃伊", "mummy.fbx", "Mummy_Diffuse.jpg"),

    ("necromancer", "死靈法師", "Necromancer.fbx", "Necromancer_Diffuse.jpg"),
]
selected = sys.argv[sys.argv.index("--") + 2:]
for key, folder, model, texture in models:
    if selected and key not in selected:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(source / folder / model), use_image_search=False)
    image = bpy.data.images.load(str(source / folder / texture))
    material = bpy.data.materials.new(key)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .82
    tex = material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    material.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":

            obj.data.materials.clear()
            obj.data.materials.append(material)
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    print("CLIPS", key, [(a.name, list(a.frame_range)) for a in bpy.data.actions], flush=True)
    bpy.ops.export_scene.gltf(filepath=str(output / (key + ".glb")), export_format="GLB",
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=False,
        export_yup=True, export_cameras=False, export_lights=False)

