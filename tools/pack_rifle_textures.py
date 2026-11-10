"""Keep model geometry / UVs and repack embedded PBR textures for web delivery."""
import io,json,struct,sys
from PIL import Image
src,dest=sys.argv[1:];data=open(src,'rb').read();jl=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+jl]);raw=data[28+jl:];images={i['bufferView']:i for i in doc.get('images',[])};new=bytearray()
for n,view in enumerate(doc['bufferViews']):
 block=raw[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
 if n in images:
  im=Image.open(io.BytesIO(block))
  if im.format!='WEBP' or max(im.size)>2048:
   im.thumbnail((2048,2048));buf=io.BytesIO();im.save(buf,format='WEBP',quality=95,method=6);block=buf.getvalue()
  images[n]['mimeType']='image/webp'
 view['byteOffset']=len(new);view['byteLength']=len(block);new.extend(block)
 while len(new)%4:new.append(0)
if images:
 for tex in doc['textures']:
  if 'source' in tex:tex.setdefault('extensions',{})['EXT_texture_webp']={'source':tex.pop('source')}
 for key in ['extensionsUsed','extensionsRequired']:
  if 'EXT_texture_webp' not in doc.setdefault(key,[]):doc[key].append('EXT_texture_webp')
doc['buffers'][0]['byteLength']=len(new);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
with open(dest,'wb') as f:f.write(struct.pack('<III',0x46546c67,2,28+len(j)+len(new))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(new),0x004e4942)+new)
print(dest,len(data),'->',28+len(j)+len(new),'bytes')
