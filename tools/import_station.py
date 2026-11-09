"""Import the user-provided TMDC_Zombie station textures, audio and EFK closure."""
from pathlib import Path
import json, re, shutil, sys

resource = Path(sys.argv[1]) / 'ClientCocos/ZombieResource'
out = Path(__file__).resolve().parents[1] / 'public/station'
out.mkdir(parents=True, exist_ok=True)
files = {
    'station-normal.png': 'Models/Fish/station_director/Station_director_normal.png',
    'station-mask.jpg': 'Models/Fish/station_director/Station_director_mask.jpg',
    'environment.png': 'Models/Scene_ZB/TrainStation/station_environment_rough4.png',
    'wet-noise.png': 'Models/Scene_ZB/TrainStation/station_wet_noise.png',
    'door-light.jpg': 'Models/Scene_ZB/TrainStation/train/door_light.jpg',
    'head-light.jpg': 'Models/Scene_ZB/TrainStation/train/Light_blue.jpg',
    'head-light-warm.jpg': 'Models/Scene_ZB/TrainStation/train/Light.jpg',
    'train-window.jpg': 'Models/Scene_ZB/TrainStation/train/train_env.jpg',
}
for sound in ['Station_train_in', 'Station_train_out', 'SD_in_1', 'SD_reward_M_1', 'SD_reward_L_1', 'SD_train', 'SD_out_1']:
    files[f'audio/{sound}.mp3'] = f'Sound/mp3/sound/Zombie/{sound}.mp3'
for name, source in files.items():
    target = out / name
    target.parent.mkdir(exist_ok=True)
    shutil.copy2(resource / source, target)

source = resource / 'Effekseer_ZB_1'
queue = ['Z_021_ingame.efk', 'Z_021_middle_reward.efk', 'Z_021_big_reward.efk', 'Z_021_out.efk', 'Z_021_train_come.efk']
done = set()
while queue:
    name = queue.pop()
    if name in done:
        continue
    p = source / name
    target = out / 'fx' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, target)
    done.add(name)
    if p.suffix.lower() not in ('.efk', '.efkmat'):
        continue
    data = p.read_bytes()
    for text in [data.decode('utf-16-le', errors='ignore'), data[1:].decode('utf-16-le', errors='ignore'), data.decode('utf-8', errors='ignore')]:
        for dep in re.findall(r'[A-Za-z0-9_./\\ -]+\.(?:png|jpg|efkmodel|efkmat|dds|tga)', text, re.I):
            dep = dep.replace('\\', '/').strip()
            found = next((c for c in [dep, dep.split('/')[-1]] if (source / c).is_file()), None)
            if found:
                queue.append(found)
models = {
    'station-scene.glb': 'Scene_ZB/TrainStation/Train_scene.c3b',
    'station-door.glb': 'Scene_ZB/TrainStation/door.c3b',
    'station-flag.glb': 'Scene_ZB/TrainStation/flag.c3b',
    'train-body.glb': 'Scene_ZB/TrainStation/train/TRAIN_C_2.c3b',
    'train-head.glb': 'Scene_ZB/TrainStation/train/Bonus_train.c3b',
    'train-gold.glb': 'Scene_ZB/TrainStation/train/gold_train.c3b',
    'stationmaster.glb': 'Fish/station_director/station_director.c3b',
}
(out / 'SOURCE.json').write_text(json.dumps({'project': 'TMDC_Zombie', 'modelRoot': 'ClientCocos/ZombieResource/Models',
    'models': models, 'files': files, 'effectsRoot': 'ClientCocos/ZombieResource/Effekseer_ZB_1',
    'shaderReferences': ['ClientCocos/ZombieResource/Shader/trainStationLight.frag',
        'ClientCocos/ZombieResource/Shader/mat/ground/TrainStationLight.material',
        'ClientCocos/ZombieResource/Shader/trainMetal.frag',
        'ClientCocos/ZombieResource/Shader/mat/ground/TrainMetal.material',
        'ClientCocos/ZombieLua/View/GameView/BGScene/GameSceneTrainStation/GameSceneTrainStationLight.lua',
        'ClientCocos/ZombieLua/View/GameView/BGScene/GameSceneTrainStation/GameSceneTrainStationDefine.lua'],
    'effects': sorted(done), 'notes': 'User-provided original assets, not stock or generated artwork. C3B rigs and authored door bones converted by tools/convert_cocos_zombies.mjs --station. FishDefine TrainMaster=23; EFK asset prefix Z_021.'}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print('Station assets:', len(files), 'textures/audio;', len(done), 'EFK resources')
