# Desert Eagle sound design

The independent deagle_fire_1/2/3, deagle_mag_out/in, deagle_slide and equip_deagle clips
are FisherFPS edits of the project's CC0 sound recordings. The original weapon files
remain unchanged. Attribution and source URLs for these recordings are in CREDITS.md:

- Freesound 855652: pistol report, pitch-shifted and filtered.
- morganpurkis, Freesound 391725 and 384687: low-frequency report body from the existing AK mix.
- Freesound 396331 and 427593: magazine and slide transients.
- Kenney RPG audio: equipment cloth movement.

The shot adds a short authored 92 Hz decaying impact layer and a quiet slide transient.
Three takes retain a sharp attack, heavy mid/low body and a controlled tail. Peaks are
normalized to -2.5 dBFS before the game's sound-bus gain; runtime voice limits remain active.
These are designed game sounds, not a claim of field-recorded .50 AE audio.

Reproducible recipe: tools/build_deagle_audio.py. It reads the existing CC0-derived
clips, never overwrites them, and writes separate deagle assets and timing metadata.
