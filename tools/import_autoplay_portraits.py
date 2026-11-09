"""Extract original reward portraits from TMDC_Zombie's TexturePacker atlas.

Usage: python tools/import_autoplay_portraits.py <TMDC_Zombie directory>
Requires Pillow. Keeps original pixels, transparency and the atlas's orientation.
"""
import json
import plistlib
import re
import sys
from pathlib import Path
from PIL import Image

source = Path(sys.argv[1])
relative = Path('ClientCocos/ZombieResource/DinosaurExport/plist/Reward_common_Zombie.plist')
atlas_path = source / relative
atlas = plistlib.loads(atlas_path.read_bytes())
sheet = Image.open(atlas_path.with_suffix('.png')).convert('RGBA')
output = Path(__file__).resolve().parents[1] / 'public' / 'autoplay'
output.mkdir(parents=True, exist_ok=True)
# FishDefine.lua establishes these FishType ids; the reward atlas uses the same ids.
mapping = {'walker': 10, 'stalker': 11, 'raider': 14, 'mummy': 19,
           'necromancer': 21, 'bride': 27, 'warden': 29}
numbers = lambda value: tuple(map(int, re.findall(r'-?\d+', value)))
manifest = {'sourceProject': 'TMDC_Zombie', 'atlas': relative.as_posix(), 'portraits': {}}
def extract(name):
    frame = atlas['frames'][name]
    x, y, width, height = numbers(frame['frame'])
    packed_w, packed_h = (height, width) if frame['rotated'] else (width, height)
    image = sheet.crop((x, y, x + packed_w, y + packed_h))
    if frame['rotated']:
        image = image.transpose(Image.Transpose.ROTATE_90)
    assert image.size == (width, height)
    return image

for species, fish_id in mapping.items():
    name = f'Z_{fish_id:03d}_reward.png'
    image = extract(name)
    # Use the trimmed art so every card gets the same useful portrait area.
    image.save(output / f'{species}.webp', lossless=True, method=6)
    manifest['portraits'][species] = {'fishType': fish_id, 'frame': name,
                                    'size': list(image.size), 'file': f'{species}.webp'}
victory = extract('Z_039_Prison_officer_reward.png')
victory.save(output.parent / 'prison' / 'warden-victory.webp', lossless=True, method=6)
manifest['victory'] = {'warden': {'frame': 'Z_039_Prison_officer_reward.png',
                               'size': list(victory.size), 'file': '../prison/warden-victory.webp'}}
(output / 'source.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Extracted {len(mapping)} original portraits to {output}')
