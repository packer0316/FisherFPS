// Original 768 x 320 renders have different transparent gutters. Frame the
// visible model with 12 px of breathing room without modifying the textures.
const bounds = {
  rifle:[109,55,660,264], m4a1:[95,55,671,268],
  scarl:[97,50,673,268], vss:[44,65,723,299],
  pistol:[223,23,547,303], deagle:[192,21,580,297],
  knife:[46,78,711,230], grenade:[295,43,476,274], mg3:[65,57,730,244],
};

export function weaponPortrait(id) {
  const [left,top,right,bottom]=bounds[id];
  const viewBox=[left-12,top-12,right-left+24,bottom-top+24].join(' ');
  return `<svg class="weapon-portrait" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><image href="loadout/${id}.webp" width="768" height="320"/></svg>`;
}
