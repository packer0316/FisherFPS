"""Bundle the selected, user-supplied DragonTycoon3 grenade explosion layers.
Usage: python tools/import_grenade_effects.py <DragonTycoon3 checkout>
Runtime EFKs and their texture/material/model dependency closure stay unchanged.
"""
from pathlib import Path
import re
import shutil
import sys

source = Path(sys.argv[1]).resolve() / 'ClientCocos/DragonTycoon3Resource'
destination = Path(__file__).resolve().parents[1] / 'public/effects/grenade/dragon'
effects = [
    'EffekseerMechaJaeger/Explosion.efk',
    'EffekseerMechaJaeger/shock_smoke.efk',
    'Effekseer_dt3/Boss_TRex/Bs05_Smoke.efk',
]
queue = [Path(name) for name in effects]
done = set()
while queue:
    name = queue.pop()
    if name in done:
        continue
    path = source / name
    if not path.is_file():
        raise FileNotFoundError(path)
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    done.add(name)
    if path.suffix.lower() not in ('.efk', '.efkmat'):
        continue
    data = path.read_bytes()
    for text in [data.decode('utf-16le', errors='ignore'), data[1:].decode('utf-16le', errors='ignore'), data.decode('utf-8', errors='ignore')]:
        for match in re.findall(r'[A-Za-z0-9_./\\ -]+\.(?:png|jpg|efkmodel|efkmat|dds|tga)', text, re.I):
            dep = name.parent / match.replace('\\', '/').split('/')[-1].strip()
            if not (source / dep).is_file():
                # Materials may retain the author's editor preview textures.
                # The runtime effect supplies the actual texture bindings.
                if path.suffix.lower() == '.efk':
                    raise FileNotFoundError(source / dep)
                continue
            if dep not in done:
                queue.append(dep)
print(f'Bundled {len(effects)} EFKs and {len(done)-len(effects)} dependencies ({sum((destination / n).stat().st_size for n in done):,} bytes).')
