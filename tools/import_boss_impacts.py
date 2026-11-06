
"""Extract runtime BIN_ chunks from official CC0 Effekseer 1.7 effects.
Usage: python tools/import_boss_impacts.py <EffectMaterials checkout>
Source pinned at 8bf8edfedb51ac09af3d4cf788cb81746ea75a82.
"""
from pathlib import Path
import sys, struct, re, shutil

source = Path(sys.argv[1]) / 'Effects'
dest = Path(__file__).resolve().parents[1] / 'public/effects/boss-impacts'
dest.mkdir(parents=True, exist_ok=True)
deps = {'Textures/tx_noise03_256.png', 'Textures/tx_shockring01_256.png',
        'Textures/tx_fire_flipbook01_1024.png'}
for name in ['ef_fire02', 'ef_parts_hit01']:
    data = (source / (name + '.efkefc')).read_bytes()
    assert data[:4] == b'EFKE'
    offset = 8
    while offset < len(data):
        tag, size = struct.unpack_from('<4sI', data, offset)
        chunk = data[offset+8:offset+8+size]
        offset += size + 8
        if tag == b'BIN_':
            (dest / (name + '.efk')).write_bytes(chunk)
        elif tag == b'INFO':
            deps.update(re.findall(r'(?:Textures|Materials|Meshes)[^\x00-\x1f]+',
                                  chunk.decode('utf-16le', errors='ignore')))
for dep in sorted(deps):
    target = dest / dep
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / dep, target)
print(f'Imported two runtime effects and {len(deps)} dependencies.')
