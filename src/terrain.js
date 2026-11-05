import * as T from 'three';

// Rectangles use x/z bounds; four corner heights produce both the render mesh and the walk surface.
const surfaces = [];
function patch(name, x0, x1, z0, z1, north, south = north, extra = {}) {
  surfaces.push({ name, x0, x1, z0, z1, h: [north, north, south, south], ...extra });
}
// The T terrace splits into the drop towards mid, the tunnel ramp and the approach to Long.
patch('T 出生平台', -10, 6, 20, 30, 1.2);
patch('中路頂', -6.5, 2.5, 13, 20, 0, 1.2);
patch('T 出生區斜坡', -18, -10, 20, 27, 0, 0, { h: [0, 1.2, 1.2, 0] });
patch('A 門外', 6, 13, 20, 27, 0, 0, { h: [1.2, 0, 0, 1.2] });
patch('A 小道', 6, 11.35, 3, 13, 1.3, 0);
patch('A 小道', 6, 11.35, -5, 3, 1.3);
const stairCount = 10;
for (let i = 0; i < stairCount; i++) {
  const south = -5 - i * 0.96;
  patch('A 小道階梯', 6, 11.35, south - 0.96, south, 1.3 + (i + 1) * 0.17);
}
patch('A 小道', 6, 11.35, -19, -14.6, 3);
patch('A 小道', 11.35, 21, -19, -14.6, 3);
patch('A 點橋下', 21, 29, -19, -14.6, 3, 3, { bridge: true });
patch('A 小道', 29, 32, -19, -14.6, 3);
patch('A 據點', 32, 48, -35, -14.6, 3);
patch('A 大道斜坡', 38, 46.8, -14.6, -2.6, 3, 0);
const pitWest = 40.9, pitEast = 48.6;
patch('A 大道凹坑', pitWest, pitEast, 3, 6, 0, -1.4, { pit: true });
patch('A 大道凹坑', pitWest, pitEast, 6, 11, -1.4, -1.4, { pit: true });
patch('A 大道凹坑', pitWest, pitEast, 11, 14, -1.4, 0, { pit: true });
patch('B 區上層隧道', -45, -37, 6, 15, 1.05, 0);
patch('B 區上層隧道', -45, -37, -17, 6, 1.05);
patch('B 區上層隧道', -37, -35, -1.8, 2.4, 1.05);
for (let i = 0; i < 6; i++) {
  patch('B 隧道階梯', -35 + i * 0.68, -35 + (i + 1) * 0.68, -1.8, 2.4, (6 - i) * 0.15);
}
patch('B 據點', -48, -26, -34, -17, 1.05);
patch('B 窗', -26, -25.65, -21, -18.5, 1.05);
patch('B 區雙門', -26, -23, -27.28, -21.92, 1.05);
patch('B 區雙門', -23, -19, -27.28, -21.92, 1.05, 0, { h: [1.05, 0, 0, 1.05] });

export { surfaces as terrainPatches };

function at(x, z) {
  return surfaces.find((s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1);
}
export function terrainHeight(x, z, feet = Infinity) {
  const s = at(x, z);
  if (!s || (s.bridge && feet < s.h[0] - 0.35)) return 0;
  return heightOn(s, x, z);
}
function heightOn(s, x, z) {
  const u = (x - s.x0) / (s.x1 - s.x0),
    v = (z - s.z0) / (s.z1 - s.z0);
  return T.MathUtils.lerp(
    T.MathUtils.lerp(s.h[0], s.h[1], u),
    T.MathUtils.lerp(s.h[3], s.h[2], u),
    v,
  );
}
export function terrainName(x, z, feet) {
  const s = at(x, z);
  if (s?.bridge && feet > 2.6) return 'A 小道';
  return s?.name;
}
export function buildTerrain(draw, solid, paving, stone) {
  function quad(points, mat, color, kind) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    draw(geo, mat, color, kind);
  }
  const rect = (x0, x1, z0, z1) =>
    quad(
      [
        [x0, 0, z0],
        [x1, 0, z0],
        [x1, 0, z1],
        [x0, 0, z1],
      ],
      paving,
      '#e7bc91',
      'ground',
    );
  // A cut in the base paving makes the pit genuinely lower than the street.
  rect(-110, pitWest, -100, 100);
  rect(pitEast, 110, -100, 100);
  rect(pitWest, pitEast, -100, 3);
  rect(pitWest, pitEast, 14, 100);
  for (const s of surfaces) {
    const { x0, x1, z0, z1, h } = s,
      corners = [
        [x0, h[0], z0],
        [x1, h[1], z0],
        [x1, h[2], z1],
        [x0, h[3], z1],
      ];
    quad(corners, paving, s.pit ? '#bba68e' : '#ddc9ae', 'ground');
    const bottom = s.bridge ? h[0] - 0.43 : 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const outsideX = Math.sign(dz) * 0.004, outsideZ = -Math.sign(dx) * 0.004;
      // An edge can meet flat street, a ramp and another platform along different spans.
      // Split at those joints and join the actual heights on each side of the edge.
      const splits = new Set([0, 1]);
      for (const neighbor of surfaces) {
        if (dx && (a[2] + outsideZ < neighbor.z0 || a[2] + outsideZ > neighbor.z1)) continue;
        if (dz && (a[0] + outsideX < neighbor.x0 || a[0] + outsideX > neighbor.x1)) continue;
        const ends = dx ? [neighbor.x0, neighbor.x1] : [neighbor.z0, neighbor.z1];
        for (const edge of ends) {
          const t = dx ? (edge - a[0]) / dx : (edge - a[2]) / dz;
          if (t > 0.00001 && t < 0.99999) splits.add(t);
        }
      }
      const cuts = [...splits].sort((v, w) => v - w);
      for (let j = 1; j < cuts.length; j++) {
        const mid = (cuts[j - 1] + cuts[j]) / 2;
        const neighbor = at(a[0] + mid * dx + outsideX, a[2] + mid * dz + outsideZ);
        const rim = [], base = [];
        for (const t of [cuts[j - 1], cuts[j]]) {
          const x = a[0] + dx * t, z = a[2] + dz * t;
          const top = T.MathUtils.lerp(a[1], b[1], t);
          const adjacent = neighbor ? heightOn(neighbor, x, z) : 0;
          rim.push([x, top, z]);
          base.push([x, s.pit ? Math.max(top, adjacent) : Math.min(top, Math.max(bottom, adjacent)), z]);
        }
        if (Math.abs(rim[0][1] - base[0][1]) + Math.abs(rim[1][1] - base[1][1]) < 0.001) continue;
        quad([rim[1], rim[0], base[0], base[1]], stone, '#d6b992', 'wall');
      }
    }
    if (s.bridge) {
      quad(
        [
          [x0, bottom, z1],
          [x1, bottom, z1],
          [x1, bottom, z0],
          [x0, bottom, z0],
        ],
        stone,
        '#ccb48e',
        'wall',
      );
      solid((x0 + x1) / 2, (bottom + h[0]) / 2, (z0 + z1) / 2, x1 - x0, h[0] - bottom, z1 - z0);
    }
  }
}
