export function parseRewardFont(text) {
  const font = { glyphs: new Map() };
  for (const line of text.split(/\r?\n/)) {
    const fields = Object.fromEntries([...line.matchAll(/(\w+)=(-?\d+)/g)].map(m => [m[1], Number(m[2])]));
    if (line.startsWith('common ')) Object.assign(font, fields);
    if (line.startsWith('char ')) font.glyphs.set(String.fromCodePoint(fields.id), fields);
  }
  if (!(font.lineHeight > 0) || [...'0123456789,+'].some(c => !font.glyphs.has(c))) {
    throw new Error('Incomplete reward bitmap font');
  }
  return font;
}

export function drawRewardNumber(canvas, text, font, atlas, width, height, pixelRatio = 1, finalText = text) {
  const dpr = Math.min(2, pixelRatio);
  const w = Math.round(width * dpr), h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const glyphs = [...text].map(c => font.glyphs.get(c)).filter(Boolean);
  const total = glyphs.reduce((n, g) => n + g.xadvance, 0);
  // Fit the final award once: longer amounts are smaller, but crossing a digit
  // boundary during count-up must not make this card's font size jump.
  const finalWidth = [...finalText].reduce((sum, c) => sum + (font.glyphs.get(c)?.xadvance ?? 0), 0);
  const scale = Math.min(width / Math.max(1, finalWidth, total), height / font.lineHeight);
  let x = width - total * scale;
  const y = (height - font.lineHeight * scale) / 2;
  for (const g of glyphs) {
    ctx.drawImage(atlas, g.x, g.y, g.width, g.height,
      x + g.xoffset * scale, y + g.yoffset * scale, g.width * scale, g.height * scale);
    x += g.xadvance * scale;
  }
}
