"""Cut, align and encode the game's sound effects from CC0 source recordings.

    python tools/build_sfx.py --fetch <sources dir>   # download Freesound previews + Kenney packs
    python tools/build_sfx.py <sources dir>           # rebuild public/audio and src/audio-manifest.js

Requires ffmpeg (with libmp3lame) on PATH and NumPy. The sources directory holds
freesound/<id>.ogg (Freesound HQ previews) and kenney/<pack>/... (unzipped packs).

Every recipe below is one edit decision: the slice of the source, fades, filters, layers
and peak level. Each clip also gets a "sync" time: the loudest 5 ms frame (or an explicit
override). The game schedules clips so that this instant lands on the animation frame it
belongs to (magazine latch, bolt slam, knife contact, grenade release...).
"""
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "audio")
MANIFEST = os.path.join(ROOT, "src", "audio-manifest.js")
SR = 44100
K = "k:"  # Kenney packs

# name: (source, start, duration, options)
# options: fi/fo fade seconds, peak dBFS, af ffmpeg filters, layers [(src,start,dur,delay,gainDb,af)],
#          stereo, sync (seconds into the finished clip), rev (reverse), tail (silence padding)
R = {}


def r(name, src, start=0.0, dur=None, **o):
    R[name] = (src, start, dur, o)


# ---- Weapons: shots are cut to the body of the report so automatic fire does not smear.
# AK interval 0.115 s, MG3 0.075 s, pistol 0.36 s. Reverb tails play once after a burst.
# Rifle: a battle-rifle report for body and crack, a sub-180 Hz thump layered underneath for weight,
# low/low-mid lift and the fizz above 10 kHz removed. Three pitch takes keep full auto from looping.
HEAVY = "equalizer=f=100:t=q:w=1:g=3,equalizer=f=220:t=q:w=1:g=2,lowpass=f=10000,highpass=f=35"
for i, rate in enumerate([1.0, 0.95, 1.04], 1):
    r(f"weapons/ak_fire_{i}", "fs:391725", 0.012, 0.42, fo=0.22, sync=0,
      af=f"asetrate=44100*{rate},aresample=44100," + HEAVY,
      layers=[("fs:384687", 0.038, 0.40, 0.0, -7, f"asetrate=44100*{rate},aresample=44100,lowpass=f=180")])
r("weapons/ak_tail", "fs:391725", 0.30, 1.6, fi=0.10, fo=0.7, peak=-7, sync=0, af="lowpass=f=6000")
for i, at in enumerate([0.012, 1.626, 3.198], 1):
    r(f"weapons/pistol_fire_{i}", "fs:855652", at, 0.70, fo=0.32, af="highpass=f=70", sync=0)
for i, at in enumerate([0.004, 1.266, 2.727], 1):
    r(f"weapons/mg_fire_{i}", "fs:239138", at, 0.118, fo=0.045,
      af="equalizer=f=120:t=q:w=1.1:g=3,highpass=f=45", sync=0)
r("weapons/mg_tail", "fs:391725", 0.30, 1.6, fi=0.10, fo=0.7, peak=-7,
  af="asetrate=44100*0.88,aresample=44100,lowpass=f=5000", sync=0)
r("weapons/dry_rifle", "fs:725402", 0.03, 0.22, fo=0.08, peak=-6)
r("weapons/dry_pistol", "fs:674568", 0.055, 0.12, fo=0.05, peak=-6)

# Reload parts. sync = the mechanical hit that matches the viewmodel keyframe.
r("weapons/ak_mag_out", "fs:674742", 0.085, 0.42, fo=0.10, peak=-4, sync=0.113)
r("weapons/ak_mag_in", "fs:674742", 0.83, 0.62, fo=0.14, peak=-3)
r("weapons/ak_bolt", "fs:675008", 2.15, 0.65, fo=0.15, peak=-2)
r("weapons/mag_drop", K + "impact-sounds/Audio/impactPlate_light_001.ogg", 0, None, fo=0.1, peak=-12,
  af="lowpass=f=3200")
r("weapons/pistol_mag_out", "fs:396331", 0.0, 0.24, fo=0.07, peak=-5)
r("weapons/pistol_mag_in", "fs:427593", 0.50, 0.40, fo=0.12, peak=-3)
r("weapons/pistol_slide", "fs:427593", 1.50, 0.55, fo=0.15, peak=-2, sync=0.227)
r("weapons/mg_latch", "fs:481789", 0.15, 0.30, fo=0.10, peak=-5)
r("weapons/mg_cover_open", "fs:481786", 0.04, 0.36, fo=0.12, peak=-6)
r("weapons/mg_belt_out", "fs:693125", 0.05, 0.40, fo=0.12, peak=-7)
r("weapons/mg_box_out", "fs:677160", 0.24, 0.40, fo=0.12, peak=-4)
r("weapons/mg_box_drop", K + "impact-sounds/Audio/impactMetal_heavy_002.ogg", 0, None, fo=0.15, peak=-13,
  af="lowpass=f=2200")
r("weapons/mg_box_in", "fs:725397", 3.08, 0.45, fo=0.14, peak=-2)
r("weapons/mg_belt_in", "fs:693125", 0.50, 0.45, fo=0.14, peak=-7)
r("weapons/mg_cover_close", "fs:386777", 0.90, 0.40, fo=0.14, peak=-2)
r("weapons/mg_bolt", "fs:386777", 1.50, 0.50, fo=0.14, peak=-2, sync=0.222)

r("weapons/equip_rifle", K + "rpg-audio/Audio/cloth1.ogg", 0, None, peak=-9,
  layers=[(K + "rpg-audio/Audio/metalClick.ogg", 0, None, 0.12, -2, "")])
r("weapons/equip_pistol", K + "rpg-audio/Audio/cloth2.ogg", 0, None, peak=-10,
  layers=[(K + "rpg-audio/Audio/metalClick.ogg", 0, None, 0.09, -3, "asetrate=44100*1.12,aresample=44100")])
r("weapons/equip_mg", K + "rpg-audio/Audio/beltHandle1.ogg", 0, None, peak=-8,
  layers=[(K + "rpg-audio/Audio/metalLatch.ogg", 0, None, 0.14, -2, "asetrate=44100*0.85,aresample=44100")])
for i in (1, 2, 3):
    r(f"weapons/equip_knife_{i}", K + f"rpg-audio/Audio/drawKnife{i}.ogg", 0, None, peak=-8)
r("weapons/equip_grenade", K + "rpg-audio/Audio/cloth3.ogg", 0, None, peak=-11)

# Knife: whoosh peak is placed on the 0.238 s contact frame by the game.
r("weapons/knife_swing_1", "fs:420668", 0.0, 0.20, fo=0.06, peak=-5)
r("weapons/knife_swing_2", "fs:389590", 0.0, 0.32, fo=0.08, peak=-5)
r("weapons/knife_swing_3", "fs:59988", 0.0, 0.28, fo=0.08, peak=-5)
r("weapons/knife_flesh_1", "fs:179222", 0.13, 0.42, fo=0.15, peak=-3)
r("weapons/knife_flesh_2", "fs:344404", 0.32, 0.48, fo=0.18, peak=-3)
r("weapons/knife_flesh_3", K + "rpg-audio/Audio/knifeSlice.ogg", 0, None, fo=0.1, peak=-3)
r("weapons/knife_stone_1", K + "impact-sounds/Audio/impactMining_000.ogg", 0, 0.45, fo=0.2, peak=-5)
r("weapons/knife_stone_2", K + "impact-sounds/Audio/impactMining_002.ogg", 0, 0.45, fo=0.2, peak=-5)

# Grenade: pin pops 0.40 s after press, release at the end of the 0.42 s throw, 2.7 s fuse.
r("weapons/grenade_pin", "fs:481789", 0.17, 0.26, fo=0.10, peak=-6)
r("weapons/grenade_spoon", K + "rpg-audio/Audio/metalClick.ogg", 0, None, fo=0.05, peak=-10,
  af="asetrate=44100*1.3,aresample=44100")
r("weapons/grenade_throw", "fs:60013", 0.0, 0.43, fo=0.10, peak=-4)
# Grenade on the floor: a dense metal body, so short dry hits instead of ringing sheet metal.
# Hard landings use single impacts of a dropped submachine gun; light skips a small metal object.
for i, at in enumerate([0.215, 4.13], 1):
    r(f"weapons/grenade_hit_{i}", "fs:854494", at, 0.20, fo=0.09, peak=-3, af="lowpass=f=8000")
for i, at in enumerate([0.15, 0.405], 1):
    r(f"weapons/grenade_tick_{i}", "fs:259553", at, 0.14, fo=0.06, peak=-5,
      af="asetrate=44100*0.85,aresample=44100")
r("weapons/explosion_1", "fs:609587", 0.0, 3.4, fo=1.6, peak=-1, sync=0)
r("weapons/explosion_2", "fs:516914", 0.19, 3.6, fo=1.6, peak=-1, sync=0)
r("weapons/explosion_3", "fs:398283", 0.0, 2.8, fo=1.3, peak=-1, sync=0)

# Bullet impacts by surface (world:impact kind) and on flesh.
for i, n in enumerate(["001", "003", "004"], 1):
    r(f"impacts/stone_{i}", K + f"impact-sounds/Audio/impactMining_{n}.ogg", 0, 0.32, fo=0.14, peak=-4,
      af="highpass=f=250")
r("impacts/dirt_1", "fs:319229", 0.31, 0.42, fo=0.18, peak=-4)
r("impacts/dirt_2", "fs:319222", 0.26, 0.46, fo=0.2, peak=-4)
r("impacts/dirt_3", "fs:789388", 0.0, 0.50, fo=0.22, peak=-4)
r("impacts/wood_1", "fs:319226", 0.15, 0.22, fo=0.08, peak=-4)
r("impacts/wood_2", "fs:319228", 0.075, 0.18, fo=0.07, peak=-4)
r("impacts/wood_3", "fs:319223", 0.025, 0.10, fo=0.04, peak=-4)
r("impacts/ricochet_1", "fs:392975", 0.0, 0.42, fo=0.15, peak=-6)
r("impacts/ricochet_2", "fs:148840", 1.345, 0.42, fo=0.15, peak=-6)
r("impacts/flesh_1", "fs:138481", 0.0, 0.21, fo=0.07, peak=-3)
r("impacts/flesh_2", "fs:660769", 0.0, 0.25, fo=0.09, peak=-3)
r("impacts/flesh_3", "fs:511194", 0.05, 0.45, fo=0.2, peak=-3)

# ---- Rewards: coin ticks follow the 0.03 s burst / 0.045 s collect cadence of the coin system.
r("reward/coin_1", "fs:343462", 0.0, 0.16, fo=0.06, peak=-6)
r("reward/coin_2", "fs:163451", 0.0, 0.21, fo=0.08, peak=-6)
r("reward/coin_3", K + "casino-audio/Audio/chip-lay-1.ogg", 0, None, fo=0.06, peak=-7,
  af="asetrate=44100*1.25,aresample=44100")
r("reward/coin_spray_small", "fs:121990", 0.0, 0.50, fo=0.2, peak=-5)
r("reward/coin_shower", "fs:361346", 0.0, 3.80, fi=0.05, fo=0.3, peak=-4, sync=0)
r("reward/tag_bronze", K + "interface-sounds/Audio/confirmation_001.ogg", 0, None, peak=-6)
r("reward/tag_silver", "fs:209578", 0.05, 1.45, fo=0.4, peak=-3)
r("reward/tag_gold", "fs:456966", 0.0, 3.40, fo=1.0, peak=-2, sync=0)
r("reward/roll_tick", K + "interface-sounds/Audio/tick_002.ogg", 0, None, peak=-10)
r("reward/refund", K + "casino-audio/Audio/chips-collide-1.ogg", 0, 0.25, fo=0.1, peak=-12,
  af="highpass=f=900")
r("reward/purchase", "fs:728224", 0.12, 1.30, fo=0.4, peak=-3)
r("reward/resupply", K + "casino-audio/Audio/chips-stack-1.ogg", 0, None, peak=-5)
r("reward/wave", "fs:539956", 0.0, 3.5, fo=1.3, peak=-4, sync=0)
r("reward/boom", "fs:255111", 0.0, 4.0, fo=1.8, peak=-2, sync=0)

# ---- Monsters and bosses (positional).
for i, (sid, at, d) in enumerate([("196722", 0.85, 1.0), ("196722", 2.30, 1.2), ("346626", 0, 0.88),
                                  ("754438", 0.14, 0.80), ("754441", 0.12, 0.62), ("463721", 0.05, 2.5),
                                  ("559558", 0.0, 2.4)], 1):
    r(f"monsters/groan_{i}", "fs:" + sid, at, d, fi=0.03, fo=min(0.4, d * 0.35), peak=-4)
for i, (sid, at, d) in enumerate([("555412", 0, 0.66), ("744096", 0, 1.0), ("555426", 0, 0.60)], 1):
    r(f"monsters/death_{i}", "fs:" + sid, at, d, fo=0.25, peak=-3)
r("monsters/zombie_hit", "fs:555420", 0.02, 0.55, fo=0.2, peak=-4)
r("monsters/roar_long", "fs:476083", 0.0, 3.6, fo=1.3, peak=-2)
r("monsters/roar_short", "fs:132874", 0.0, 1.30, fo=0.4, peak=-2)
r("monsters/roar_death", "fs:489901", 0.0, 2.6, fo=0.9, peak=-2)
r("monsters/boss_step", "fs:721601", 0.40, 1.0, fo=0.5, peak=-3, af="lowpass=f=1800")
r("monsters/slam_1", "fs:258195", 0.0, 1.6, fo=0.8, peak=-2, sync=0)
r("monsters/slam_2", "fs:182429", 0.0, 1.4, fo=0.7, peak=-2, sync=0)
r("monsters/slam_3", K + "sci-fi-sounds/Audio/lowFrequency_explosion_000.ogg", 0, None, fo=0.6, peak=-2, sync=0)
r("monsters/bride_intro", "fs:333832", 0.05, 3.4, fo=1.0, peak=-3)
r("monsters/bride_summon", "fs:211872", 0.0, 2.6, fo=0.8, peak=-4)
r("monsters/bride_march", "fs:420679", 0.0, 1.57, fo=0.45, peak=-5)
r("monsters/bride_vow", "fs:406063", 0.08, 1.9, fo=0.6, peak=-3)
r("monsters/bride_laugh", "fs:417826", 0.0, 1.16, fo=0.3, peak=-4)
r("monsters/bride_death", "fs:359153", 0.0, 2.3, fo=0.8, peak=-3)

# ---- Player.
for i, (sid, at, d) in enumerate([("342229", 0, 0.62), ("342230", 0, 0.80), ("342231", 0.05, 0.9),
                                  ("413186", 0, 0.35), ("547209", 0, 0.30)], 1):
    r(f"player/hurt_{i}", "fs:" + sid, at, d, fo=0.18, peak=-4)
for i, n in enumerate(["000", "002", "004"], 1):
    r(f"player/hurt_hit_{i}", K + f"impact-sounds/Audio/impactPunch_heavy_{n}.ogg", 0, None, fo=0.1, peak=-6)
r("player/death", "fs:554443", 0.08, 0.9, fo=0.35, peak=-3)
r("player/heartbeat", "fs:22440", 0.0, 0.66, fo=0.12, peak=-5)
for i in range(5):
    r(f"player/step_stone_{i + 1}", K + f"impact-sounds/Audio/footstep_concrete_00{i}.ogg", 0, None, peak=-6)
    r(f"player/step_dirt_{i + 1}", K + f"rpg-audio/Audio/footstep0{i * 2}.ogg", 0, None, peak=-6)
    r(f"player/step_marble_{i + 1}", K + f"impact-sounds/Audio/footstep_concrete_00{i}.ogg", 0, None, peak=-6,
      af="asetrate=44100*1.05,aresample=44100,aecho=0.8:0.6:70|140:0.22|0.12", tail=0.25)
r("player/jump", K + "rpg-audio/Audio/cloth4.ogg", 0, None, peak=-10)
r("player/land_1", "fs:540272", 0.0, 0.31, fo=0.12, peak=-5)
r("player/land_2", "fs:572459", 0.0, 0.42, fo=0.15, peak=-5)
r("player/land_heavy", "fs:364690", 0.0, 0.50, fo=0.2, peak=-3)
r("player/crate_drop", K + "impact-sounds/Audio/impactWood_heavy_001.ogg", 0, None, fo=0.15, peak=-3,
  layers=[(K + "impact-sounds/Audio/impactPlank_medium_002.ogg", 0, None, 0.05, -5, "")])
r("player/pickup_heal", "fs:471834", 0.0, 0.62, fo=0.2, peak=-4)
r("player/pickup_mg3", "fs:632822", 0.0, 0.60, fo=0.2, peak=-3)
r("player/pickup_speed", "fs:172631", 0.0, 0.75, fo=0.25, peak=-6)
r("player/speed_end", "fs:172631", 0.0, 0.75, fi=0.15, fo=0.05, peak=-8, rev=True,
  af="asetrate=44100*0.8,aresample=44100")

# ---- Interface.
r("ui/click", K + "ui-audio/Audio/click1.ogg", 0, None, peak=-9)
# Menus: a rifle magazine slapped home with a receiver-cover clack on top (short, metallic);
# returning to combat is the first "chk-chk" of a gun being charged.
r("ui/menu_open", "fs:725397", 3.115, 0.26, fo=0.12, peak=-3, sync=0,
  layers=[("fs:386777", 0.945, 0.12, 0.009, -4, "highpass=f=1500")])
r("ui/menu_close", "fs:632822", 0.005, 0.20, fo=0.08, peak=-5, sync=0)

# ---- Ambience beds (stereo, crossfaded by the runtime looper) and castle thunder.
r("ambience/desert", "fs:104320", 2.0, 40, fi=1.0, fo=1.0, peak=-3, stereo=True, sync=0)
r("ambience/prison", "fs:477871", 1.0, 45, fi=1.0, fo=1.0, peak=-3, stereo=True, sync=0)
r("ambience/castle", "fs:159509", 6.0, 40, fi=1.0, fo=1.0, peak=-3, stereo=True, sync=0)
r("ambience/station", "fs:697217", 0.5, 40, fi=1.0, fo=1.0, peak=-3, stereo=True, sync=0,
  af="lowpass=f=2400")
r("ambience/thunder", "fs:38250", 0.0, 9.8, fo=3.0, peak=-3, stereo=True, sync=0)


def source_path(src, base):
    if src.startswith("fs:"):
        return os.path.join(base, "freesound", src[3:] + ".ogg")
    return os.path.join(base, "kenney", src[2:])


def decode(path, start, dur, af, channels):
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start:.4f}"]
    if dur:
        cmd += ["-t", f"{dur:.4f}"]
    cmd += ["-i", path]
    chain = []
    if af:
        chain.append(af)
    chain.append(f"aresample={SR}")
    cmd += ["-af", ",".join(chain), "-ac", str(channels), "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).copy()


def fade(x, fi, fo):
    n = len(x)
    if fi > 0:
        k = min(n, int(fi * SR))
        x[:k] *= (np.sin(np.linspace(0, np.pi / 2, k)) ** 2)[:, None]
    if fo > 0:
        k = min(n, int(fo * SR))
        x[n - k:] *= (np.cos(np.linspace(0, np.pi / 2, k)) ** 2)[:, None]
    return x


def sync_point(x):
    hop = int(SR * 0.005)
    m = x.mean(axis=1)
    n = len(m) // hop
    if n < 1:
        return 0.0
    rms = np.sqrt((m[: n * hop].reshape(n, hop) ** 2).mean(axis=1))
    return float(np.argmax(rms) * hop / SR)


def build(base):
    manifest = {}
    for name, (src, start, dur, o) in R.items():
        ch = 2 if o.get("stereo") else 1
        x = decode(source_path(src, base), start, dur, o.get("af", ""), ch)
        if o.get("rev"):
            x = x[::-1].copy()
        for lsrc, lstart, ldur, delay, gain, laf in o.get("layers", []):
            y = decode(source_path(lsrc, base), lstart, ldur, laf, ch) * 10 ** (gain / 20)
            at = int(delay * SR)
            if at + len(y) > len(x):
                x = np.vstack([x, np.zeros((at + len(y) - len(x), ch), np.float32)])
            x[at:at + len(y)] += y
        if o.get("tail"):
            x = np.vstack([x, np.zeros((int(o["tail"] * SR), ch), np.float32)])
        x = fade(x, o.get("fi", 0.002), o.get("fo", 0.02))
        peak = np.abs(x).max()
        if peak > 0:
            x *= 10 ** (o.get("peak", -1.0) / 20) / peak
        path = os.path.join(OUT, name + ".mp3")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        quality = "6" if ch == 2 else "4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
                        "-c:a", "libmp3lame", "-q:a", quality, path], input=x.astype(np.float32).tobytes(), check=True)
        sync = o["sync"] if "sync" in o else sync_point(x)
        manifest[name] = [round(len(x) / SR, 3), round(sync, 3)]
        print(f"{name:32s} {len(x) / SR:6.3f}s sync {sync:5.3f}s")
    with open(MANIFEST, "w", encoding="utf8", newline="\n") as f:
        f.write("// Generated by tools/build_sfx.py. [duration seconds, sync seconds] per clip.\n")
        f.write("// sync is the key transient the game aligns to an animation frame.\n")
        f.write("export const clips = " + json.dumps(manifest, separators=(",", ":")).replace('],"', '],\n  "')
                .replace('{"', '{\n  "').replace("]}", "],\n};") + "\n")
    write_credits(base)


def write_credits(base):
    import urllib.parse
    meta = {}
    path = os.path.join(base, "freesound", "meta.jsonl")
    if os.path.exists(path):
        for line in open(path, encoding="utf8"):
            row = json.loads(line)
            meta[row["id"]] = row
    used, packs = {}, {}
    for name, (src, _start, _dur, o) in R.items():
        for s in [src] + [layer[0] for layer in o.get("layers", [])]:
            if s.startswith("fs:"):
                used.setdefault(s[3:], set()).add(name)
            else:
                packs.setdefault(s[2:].split("/")[0], set()).add(name)
    lines = ["# Sound effect credits", "",
             "All sources are CC0 1.0 (public domain dedication): https://creativecommons.org/publicdomain/zero/1.0/",
             "Clips were cut, faded, filtered, pitched, layered and peak-normalised by `tools/build_sfx.py`;",
             "the exact edit for every clip is the recipe of the same name in that script.", "",
             "## Freesound (HQ previews of CC0 sounds)", "", "| Sound | Author | Used for |", "| --- | --- | --- |"]
    for sid in sorted(used, key=int):
        row = meta.get(sid, {})
        title = row.get("title", sid).rsplit(" by ", 1)[0].replace("|", "/")
        user = urllib.parse.unquote(row.get("user", "")) or "?"
        lines.append(f"| [{title}](https://freesound.org/s/{sid}/) | {user} | {', '.join(sorted(used[sid]))} |")
    lines += ["", "## Kenney (kenney.nl, CC0)", "", "| Pack | Used for |", "| --- | --- |"]
    for pack in sorted(packs):
        lines.append(f"| [{pack}](https://kenney.nl/assets/{pack}) | {', '.join(sorted(packs[pack]))} |")
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def fetch(base):
    import re
    import urllib.request
    ua = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    ids = sorted({s[3:] for s, *_ in R.values() if s.startswith("fs:")} |
                 {l[0][3:] for *_, o in R.values() for l in o.get("layers", []) if l[0].startswith("fs:")})
    os.makedirs(os.path.join(base, "freesound"), exist_ok=True)
    for sid in ids:
        dest = os.path.join(base, "freesound", sid + ".ogg")
        if os.path.exists(dest):
            continue
        page = urllib.request.urlopen(urllib.request.Request(f"https://freesound.org/s/{sid}/", headers=ua)).read()
        page = page.decode("utf8", "replace")
        if "publicdomain/zero" not in page:
            raise SystemExit(f"Freesound {sid} is no longer CC0; pick another source.")
        preview = re.search(r"(https://cdn\.freesound\.org/previews/\d+/" + sid + r"_\d+)-[lh]q\.(?:mp3|ogg)", page)
        urllib.request.urlretrieve(preview.group(1) + "-hq.ogg", dest)
        title = re.search(r'<meta property="og:title" content="([^"]*)"', page)
        user = re.search(r"/people/([^/]+)/sounds/" + sid, page)
        with open(os.path.join(base, "freesound", "meta.jsonl"), "a", encoding="utf8") as meta:
            meta.write(json.dumps({"id": sid, "title": title.group(1) if title else sid,
                                   "user": user.group(1) if user else ""}, ensure_ascii=False) + "\n")
        print("freesound", sid)
    packs = sorted({s[2:].split("/")[0] for s, *_ in R.values() if s.startswith(K)} |
                   {l[0][2:].split("/")[0] for *_, o in R.values() for l in o.get("layers", []) if l[0].startswith(K)})
    for pack in packs:
        if os.path.isdir(os.path.join(base, "kenney", pack)):
            continue
        print(f"Download https://kenney.nl/assets/{pack} and unzip it to {os.path.join(base, 'kenney', pack)}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    if args[0] == "--fetch":
        fetch(args[1])
    else:
        build(args[0])
