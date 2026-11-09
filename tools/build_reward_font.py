"""Describe the generated alpha atlas as BMFont; never resample the artwork."""
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "public" / "reward-tags"


def bands(projection):
    indices = np.flatnonzero(projection)
    return [(int(part[0]), int(part[-1]) + 1)
            for part in np.split(indices, np.flatnonzero(np.diff(indices) > 8) + 1)
            if len(part)]


def build():
    atlas = Image.open(ROOT / "digits.png").convert("RGBA")
    alpha = np.asarray(atlas)[:, :, 3]
    rows = bands((alpha > 64).sum(axis=1) > 12)
    assert len(rows) == 3, rows
    glyphs = []
    for chars, (top, bottom) in zip(("0123", "4567", "89,+"), rows):
        columns = bands((alpha[top:bottom] > 64).sum(axis=0) > 6)
        assert len(columns) == 4, columns
        for char, (left, right) in zip(chars, columns):
            # Keep the antialiasing/outline around the visible gold face.
            y, x = np.nonzero(alpha[max(0, top-6):bottom+6, max(0, left-6):right+6] > 8)
            x0, y0 = max(0, left-6) + int(x.min()), max(0, top-6) + int(y.min())
            width, height = int(x.max()-x.min()+1), int(y.max()-y.min()+1)
            glyphs.append((char, x0, y0, width, height))
    cap_height = max(g[4] for g in glyphs if g[0].isdigit())
    advance = max(g[3] for g in glyphs if g[0].isdigit()) + 12
    line_height = cap_height + 12
    lines = [
        f'info face="Dustline Metal" size={cap_height} bold=1 italic=1 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0',
        f'common lineHeight={line_height} base={cap_height+6} scaleW={atlas.width} scaleH={atlas.height} pages=1 packed=0',
        'page id=0 file="digits.png"',
        f'chars count={len(glyphs)}',
    ]
    for char, x, y, width, height in glyphs:
        step = advance if char.isdigit() else width + 12
        y_offset = cap_height + 6 - height if char != '+' else (line_height-height)//2
        lines.append(f'char id={ord(char)} x={x} y={y} width={width} height={height} '
                     f'xoffset={(step-width)//2} yoffset={y_offset} xadvance={step} page=0 chnl=15')
    lines.append('kernings count=0')
    (ROOT / 'digits.fnt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Wrote {len(glyphs)} glyphs; line height {line_height}, digit advance {advance}')


if __name__ == '__main__':
    build()
