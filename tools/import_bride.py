
"""Bundle licensed local Bride assets and their Effekseer dependency closure.
Usage: python tools/import_bride.py MODEL_DIRECTORY ZOMBIE_RESOURCE_DIRECTORY
"""
from pathlib import Path
import re, shutil, sys
root=Path(__file__).resolve().parents[1]/'public'/'castle'
root.mkdir(parents=True,exist_ok=True)
model,resource=map(Path,sys.argv[1:3])
for p in model.iterdir():
    if p.suffix.lower() in ('.png','.jpg'):
        shutil.copy2(p,root/p.name)
source=resource/'Effekseer_ZB'
target=root/'fx';target.mkdir(exist_ok=True)
queue=['Z_037_Ingame.efk','Z_037_Middle_reward.efk','Z_037_Middle_reward_0.efk',
       'Z_037_Big_reward.efk','Z_037_out.efk','Z_018_Ghost.efk','Z_18_Sphere_Hit.efk','noise4.png']
done=set()
while queue:
    name=queue.pop()
    if name in done:continue
    p=source/name
    if not p.is_file():raise FileNotFoundError(p)
    dst=target/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
    done.add(name)
    if p.suffix.lower() not in ('.efk','.efkmat'):continue
    data=p.read_bytes()
    # Effect resources are length-prefixed UTF-16; materials also carry UTF-8 names.
    texts=[data.decode('utf-16-le',errors='ignore'),data[1:].decode('utf-16-le',errors='ignore'),data.decode('utf-8',errors='ignore')]
    for txt in texts:
        for dep in re.findall(r'[A-Za-z0-9_./\\ -]+\.(?:png|jpg|efkmodel|efkmat|dds|tga)',txt,re.I):
            dep=dep.replace('\\','/').strip()
            # A prefix may include printable bytes from the preceding length.
            candidates=[dep,dep.split('/')[-1]]
            found=next((c for c in candidates if (source/c).is_file()),None)
            if not found:
                files=[x for x in source.rglob(Path(dep).name) if x.is_file()]
                if len(files)==1:found=str(files[0].relative_to(source)).replace('\\','/')
            if found:queue.append(found)
print('Copied EFK closure:',len(done),'files',sum((target/n).stat().st_size for n in done),'bytes')
