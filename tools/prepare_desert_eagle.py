"""Prepare ELIZION's CC BY 4.0 Desert Eagle for the game.
Run: blender -b --python tools/prepare_desert_eagle.py -- source.glb output.glb
The source URL and attribution are in public/viewmodel/desert-eagle-CREDITS.md.
Only presentation geometry is included; this is a game prop.
"""
import bpy,sys
from mathutils import Matrix
src,dest=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
# Match the existing gloved pistol rig's contact frame, with the muzzle along -Z.
s=.0165
normal=Matrix(((-s,0,0,0),(0,-s,0,4*s),(0,0,s,-20*s),(0,0,0,1)))
groups={}
for name in ['EagleFrame','EagleSlide','EagleMagazine','EagleHammer','EagleTrigger','EagleRound']:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);groups[name]=o
for o in meshes:
 name=o.name.split('_low')[0]
 transform=normal@o.matrix_world.copy()
 o.parent=None;o.matrix_world=Matrix.Identity(4);o.data.transform(transform);o.data.update()
 o.name=name
 if name.startswith('Bullet') and name!='BulletThrow': group='EagleRound'
 elif name in ['Magazine','MagazineBase','BaseInside']: group='EagleMagazine'
 elif name=='Hammer': group='EagleHammer'
 elif name=='Trigger': group='EagleTrigger'
 elif name in ['Slide','RearSight','Safety','SlidePart'] or name.startswith('Bolt'): group='EagleSlide'
 else: group='EagleFrame'
 o.parent=groups[group]
# The supplied loose display cartridge is repositioned to the magazine feed lips.
for o in groups['EagleRound'].children:
 o.data.transform(Matrix.Translation((0,-.165,.114)))
groups['EagleRound'].parent=groups['EagleMagazine']
for o in list(bpy.data.objects):
 if o not in meshes and o not in groups.values(): bpy.data.objects.remove(o,do_unlink=True)
for m in bpy.data.materials: m.use_backface_culling=True
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dest,export_format='GLB',export_animations=False,
 export_tangents=True,export_extras=True)
print('Exported game prop:',dest)
