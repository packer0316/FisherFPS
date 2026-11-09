"""Blender 5: optimize the licensed 3DWP/DAVID angel scan for the castle.

blender -b --python tools/prepare_castle_cherub.py -- source.stl output_dir
The derivative meshes and baked normal map retain CC BY-SA 4.0.
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

source, output = sys.argv[sys.argv.index('--') + 1:]
output = Path(output)
output.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.stl_import(filepath=source)
high = bpy.context.object
high.name = 'DAVID_3DWP_cherub_source'
bounds = [Vector(v) for v in high.bound_box]
lo = Vector([min(v[i] for v in bounds) for i in range(3)])
hi = Vector([max(v[i] for v in bounds) for i in range(3)])
centre = Vector(((lo.x + hi.x)/2, (lo.y + hi.y)/2, lo.z))
height = hi.z - lo.z
for v in high.data.vertices:
    v.co = (v.co - centre) / height
for p in high.data.polygons:
    p.use_smooth = True
print('SOURCE', len(high.data.polygons), 'dimensions', list(high.dimensions), flush=True)

low = high.copy()
low.data = high.data.copy()
bpy.context.collection.objects.link(low)
low.name = 'Baroque cherub - 3DWP - CC BY-SA 4.0'
bpy.context.view_layer.objects.active = low
modifier = low.modifiers.new('Preserve sculpted feather and face detail', 'DECIMATE')
modifier.ratio = min(1, 45000 / len(low.data.polygons))
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.012)
bpy.ops.object.mode_set(mode='OBJECT')

material = bpy.data.materials.new('Carved ivory marble')
material.use_nodes = True
nodes = material.node_tree.nodes
nodes.clear()
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
surface = nodes.new('ShaderNodeOutputMaterial')
material.node_tree.links.new(bsdf.outputs['BSDF'], surface.inputs['Surface'])
bsdf.inputs['Base Color'].default_value = (.68, .64, .56, 1)
bsdf.inputs['Roughness'].default_value = .62
low.data.materials.clear()
low.data.materials.append(material)
normal = bpy.data.images.new('cherub-sculpted-normal', width=2048, height=2048)
normal.colorspace_settings.name = 'Non-Color'
texture = nodes.new('ShaderNodeTexImage')
texture.image = normal
nodes.active = texture
high.select_set(True)
bpy.context.view_layer.objects.active = low
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = .008
scene.render.bake.max_ray_distance = .025
scene.render.bake.margin = 8
bpy.ops.object.bake(type='NORMAL')
normal.filepath_raw = str(output / 'cherub-normal.png')
normal.file_format = 'PNG'
normal.save()
normal_node = nodes.new('ShaderNodeNormalMap')
material.node_tree.links.new(texture.outputs['Color'], normal_node.inputs['Color'])
material.node_tree.links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])
high.hide_render = True
high.hide_set(True)

def export(name):
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(filepath=str(output/name), export_format='GLB',
        use_selection=True, export_yup=True, export_materials='EXPORT',
        export_image_format='AUTO', export_extras=True)
    print('EXPORTED', name, len(low.data.polygons), flush=True)

low['source'] = 'https://www.thingiverse.com/thing:488220'
low['license'] = 'CC BY-SA 4.0; original scan DAVID LaserScanner, prepared by 3DWP'
export('cherub.glb')
modifier = low.modifiers.new('Mobile silhouette-preserving simplification', 'DECIMATE')
modifier.ratio = 22000 / len(low.data.polygons)
bpy.ops.object.modifier_apply(modifier=modifier.name)
export('cherub-mobile.glb')
