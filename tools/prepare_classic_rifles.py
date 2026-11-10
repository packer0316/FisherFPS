"""Extract textured display models into FisherFPS's visual viewmodel frame.
No arms or source animations are reused. Credits: public/viewmodel/classic-rifles-CREDITS.md.
blender -b --python tools/prepare_classic_rifles.py -- source_dir output_dir
"""
import bpy,bmesh,sys,os
from mathutils import Matrix,Vector
source,out=sys.argv[sys.argv.index('--')+1:];os.makedirs(out,exist_ok=True)
B=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
configs={
 'm4a1':dict(grip=(0,-.075,.295),support=(-.052,-.102,-.735),rail=(0,.055,-.43)),
 'scarl':dict(grip=(0,-.110,.262),support=(-.05,-.075,-.72),rail=(0,.073,-.43)),
 'vss':dict(grip=(0,-.140,.350),support=(-.05,-.100,-.73),rail=(0,.018,-.43)),
}
for name,cfg in configs.items():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=os.path.join(source,name+'-detailed.glb'))
 bpy.context.view_layer.update();s=.85;delta=Vector((0,-.21,-.23))-Vector(cfg['grip'])*s
 transform=B@Matrix.Translation(delta)@Matrix.Diagonal((s,s,s,1))@B.inverted()
 gun=bpy.data.objects.get('Gun_'+name);meshes=[o for o in gun.children_recursive if o.type=='MESH']
 markers={}
 for key,old in [('Muzzle','MuzzleSocket'),('EjectionPort','EjectionPort')]:
  node=bpy.data.objects.get(old);markers[key]=transform@node.matrix_world.translation.copy()
 keep=[];roles={}
 for o in meshes:
  if 'Glass' in o.name or 'RearIronSight' in o.name:continue
  role='Magazine' if 'Magazine' in o.name else 'ChargingHandle' if 'ChargingHandle' in o.name else 'ClassicBody'
  world=o.matrix_world.copy();o.parent=None;o.matrix_world=Matrix.Identity(4);o.data.transform(world)
  if name=='vss' and role=='ClassicBody':
   # Replace the closed baked scope with the game's optically usable sight.
   bm=bmesh.new();bm.from_mesh(o.data)
   bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z>.112 and -.62<v.co.y<.65],context='VERTS')
   bm.to_mesh(o.data);bm.free()
  o.data.transform(transform);o.data.update();keep.append(o);roles[o]=role
 for o in list(bpy.data.objects):
  if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
 # Rename mesh nodes first so exported assembly names never receive .001 suffixes.
 for i,o in enumerate(keep):o.name=roles[o]+'Geometry'+str(i)
 for role in ['ClassicBody','Magazine','ChargingHandle']:
  g=bpy.data.objects.new(role,None);bpy.context.collection.objects.link(g)
  objects=[o for o in keep if roles[o]==role]
  for o in objects:o.parent=g
  if objects and role!='ClassicBody':
   # Read transformed vertices directly: Blender's cached object bounds can still
   # describe the imported pose until the dependency graph has evaluated again.
   pts=[v.co.copy() for o in objects for v in o.data.vertices];center=Vector([(min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)])
   for o in objects:o.data.transform(Matrix.Translation(-center))
   g.location=center
  elif role=='ChargingHandle':
   bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=B@Vector((.065,-.035,-.51)),scale=(.025,.012,.013))
   h=bpy.context.object;h.name='ChargingHandleGeometry';g.location=h.location.copy();h.parent=g;h.location=(0,0,0)
   mat=bpy.data.materials.new('Handle');mat.diffuse_color=(.09,.10,.11,1);mat.use_nodes=True
   p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.09,.10,.11,1);p.inputs['Metallic'].default_value=.8;p.inputs['Roughness'].default_value=.4;h.data.materials.append(mat)
 for key,point in [('PrimaryGrip',(0,-.21,-.23)),('SupportGrip',cfg['support']),('RailContact',cfg['rail'])]:markers[key]=B@Vector(point)
 for key,point in markers.items():
  node=bpy.data.objects.new(key,None);bpy.context.collection.objects.link(node);node.location=point
 for mat in bpy.data.materials:mat.use_backface_culling=True
 bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=os.path.join(out,name+'.glb'),export_format='GLB',export_animations=False,export_tangents=True,export_extras=True)
 print('Prepared detailed',name)
