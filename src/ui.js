import { terrainPatches } from './terrain.js';

const lines = {
  pause: '<path d="M8 4v16m8-16v16" stroke-width="3"/>',
  shop: '<path d="M3 4h3l2.2 10.5a2 2 0 0 0 2 1.5h7.9a2 2 0 0 0 1.9-1.5L22 7H7"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  sound: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>',
  crosshair:
    '<circle cx="12" cy="12" r="7"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/><circle cx="12" cy="12" r="1"/>',
  target:
    '<path d="M8 3H4v4m12-4h4v4m0 10v4h-4M4 17v4h4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  coin: '<path d="m12 2 8.5 5v10L12 22l-8.5-5V7z"/><path d="m12 6 5 3v6l-5 3-5-3V9z"/><path d="m10 13 4-3"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  layers: '<path d="m3 9 9-5 9 5-9 5zM3 14l9 5 9-5"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 3v6"/>',
  reload: '<path d="M20 10a8 8 0 1 0 0 5m0-12v7h-7"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
};
export const $ = (id) => document.getElementById(id);
export function icon(name) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
    lines[name] +
    '</svg>'
  );
}
export function gunIcon(type) {
  const path =
    type === 'grenade'
      ? 'M41 7h15v5h-3l6 8c15 17 5 29-12 29S20 35 32 20l8-8h-3V7zm16 3h7l5 21-4 2-5-18h-3zM31 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'
      : type === 'knife'
      ? 'M4 36l20-12 3 4 4-3-4-8 4-2 4 5C50 16 68 9 89 7 76 22 59 30 39 32l2 5-4 2-5-8-5 3 1 4-19 10z'
      : type === 'pistol'
        ? 'M8 11h53v4h4v10H38l-4 5h-9l-4 14H10l5-21H8zm17 14-1 4h6l3-4z'
        : type === 'mg3'
          ? 'M2 19l13 2 8-3h8v-3h12l3 3h29v-4h3v5h7l4-2h3v6h-5l-3-1h-7l-15 9-2-2 11-7H53v4H40v12H24V27l-4 8-5-2 4-9-6 1-9 5H2zm45 1v2h5v-2zm8 0v2h5v-2zm8 0v2h5v-2z'
        : 'M3 19h14l7 4h8v-9h6v4h25v-3h4v4h12v3h10v4H66l-4 4H48l4 12-8 3-7-15h-5l-4 11-7-3 3-10h-7L4 35z';
  return (
    '<svg viewBox="0 0 ' +
    (type === 'pistol' ? 72 : 94) +
    ' 52" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="' +
    path +
    '"/></svg>'
  );
}
document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
export function makeRadar(world, player) {
  const canvas = $('radar'),
    ctx = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    s = 3.55;
  const map = document.createElement('canvas');
  map.width = Math.ceil(130 * s);
  map.height = Math.ceil(114 * s);
  const ink = map.getContext('2d');
  ink.translate(map.width / 2, map.height / 2);
  ink.scale(s, s);
  ink.strokeStyle = '#84998a38';
  ink.lineWidth = 0.2;
  for (let x = -64; x <= 64; x += 5) {
    ink.beginPath();
    ink.moveTo(x, -56);
    ink.lineTo(x, 56);
    ink.stroke();
  }
  for (let z = -55; z <= 55; z += 5) {
    ink.beginPath();
    ink.moveTo(-64, z);
    ink.lineTo(64, z);
    ink.stroke();
  }
  for (const p of world.bossArena ? [] : terrainPatches) {
    ink.fillStyle = p.pit ? '#484b40' : p.bridge ? '#676d57' : '#505d4f';
    ink.fillRect(p.x0, p.z0, p.x1 - p.x0, p.z1 - p.z0);
  }
  for (const b of world.colliders) {
    const ground = world.terrainHeight((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
    if (b.min.y > ground + 1.75) continue;
    ink.fillStyle = b.max.y - ground > 4 ? '#788278' : '#56665f';
    ink.strokeStyle = '#b6b8a3';
    ink.lineWidth = 0.28;
    const bw = b.max.x - b.min.x,
      bd = b.max.z - b.min.z;
    ink.fillRect(b.min.x, b.min.z, bw, bd);
    if (bw > 2 && bd > 2) ink.strokeRect(b.min.x, b.min.z, bw, bd);
  }
  ink.textAlign = 'center';
  ink.font = 'bold 4px sans-serif';
  ink.fillStyle = '#e8ab66';
  if (world.bossArena) ink.fillText(world.castle?'II':'C', 0, -22);
  else { ink.fillText('A', 40, -26); ink.fillText('B', -40, -26); }
  return (enemies) => {
    ctx.fillStyle = '#24312e';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(map, w / 2 - player.x * s - map.width / 2, h / 2 - player.z * s - map.height / 2);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-player.x, -player.z);
    for (const e of enemies) {
      if (!e.alive || e.opacity < 0.22) continue;
      ctx.fillStyle = e.boss ? '#ff4d47' : '#f18a56';
      ctx.beginPath();
      ctx.arc(e.root.position.x, e.root.position.z, e.boss ? 1.5 : 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(player.x, player.z);
    ctx.rotate(-player.yaw);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    grad.addColorStop(0, '#abdcc777');
    grad.addColorStop(1, '#abdcc700');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 18, -2.17, -0.97);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -2.1);
    ctx.lineTo(1.65, 1.65);
    ctx.lineTo(0, 0.9);
    ctx.lineTo(-1.65, 1.65);
    ctx.closePath();
    ctx.fillStyle = '#caf4de';
    ctx.fill();
    ctx.restore();
  };
}
