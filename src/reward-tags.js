import { makeRewardTagState, formatReward, easeOut, REWARD_HOLD, REWARD_EXIT, REWARD_ENTER } from './reward-tag-state.js';
import { parseRewardFont, drawRewardNumber } from './reward-font.js';

const kinds = { bronze: '命中小獎', silver: '擊倒賞金', gold: 'BOSS 賞金' };
const portraits = new Set(['walker', 'stalker', 'mummy', 'raider', 'necromancer', 'bride', 'warden', 'stationmaster']);
async function loadImage(src) {
  const img = new Image(); img.src = src; await img.decode(); return img;
}

export async function loadRewardTags(parent) {
  const [atlas, description] = await Promise.all([
    loadImage('/reward-tags/digits.png'),
    fetch('/reward-tags/digits.fnt').then(r => { if (!r.ok) throw new Error('Reward font failed to load'); return r.text(); }),
    ...Object.keys(kinds).map(t => loadImage('/reward-tags/' + t + '.png')),
    ...[...portraits].map(id => loadImage('/autoplay/' + id + '.webp')),
  ]);
  const font = parseRewardFont(description), state = makeRewardTagState(), cards = new Map();
  const root = document.createElement('div');
  root.id = 'reward-tags'; root.setAttribute('role', 'log');
  root.setAttribute('aria-label', '獲得賞金'); root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-relevant', 'additions'); parent.append(root);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 360;

  function render() {
    const active = new Set(state.entries.map(e => e.id));
    for (const [id, card] of cards) if (!active.has(id)) { card.el.remove(); cards.delete(id); }
    for (const e of state.entries) {
      const card = cards.get(e.id), entering = easeOut(e.age / REWARD_ENTER);
      const leaving = easeOut((e.age - REWARD_HOLD) / REWARD_EXIT);
      const shift = reduced.matches ? 0 : (1 - entering) * 90 - leaving * width * .75;
      const y = -(reduced.matches ? e.targetSlot : e.slot) * (width / 3 + 8);
      card.el.style.transform = `translate3d(${shift}px,${y}px,0) scale(${reduced.matches ? 1 : 1 - leaving * .12})`;
      card.el.style.opacity = String(entering * (1 - leaving));
      card.el.dataset.phase = e.age >= REWARD_HOLD ? 'exit' : 'hold';
      card.sheen.style.opacity = reduced.matches ? '0' : String(Math.sin(Math.min(1, e.age / .8) * Math.PI) * .55);
      card.sheen.style.transform = `translateX(${-160 + Math.min(1, e.age / .8) * 350}%) skewX(-24deg)`;
      if (card.value !== e.value || card.width !== width) {
        const text = '+' + formatReward(e.value);
        drawRewardNumber(card.number, text, font, atlas, width * .555, width * .143, devicePixelRatio,
          '+' + formatReward(e.amount));
        card.number.dataset.value = text;
        card.value = e.value; card.width = width;
      }
    }
  }

  return {
    push(reward) {
      if (!portraits.has(reward.species)) return;
      const e = state.push(reward); if (!e) return;
      const el = document.createElement('article'); el.className = 'reward-tag ' + e.tier;
      el.dataset.species = e.species; el.dataset.tier = e.tier;
      el.setAttribute('aria-label', `${e.name}，${kinds[e.tier]}，${formatReward(e.amount)} 金幣`);
      const art = document.createElement('img'); art.className = 'reward-tag-plate'; art.alt = '';
      art.src = '/reward-tags/' + e.tier + '.png'; art.draggable = false;
      const portrait = document.createElement('img'); portrait.className = 'reward-tag-portrait'; portrait.alt = '';
      portrait.src = '/autoplay/' + e.species + '.webp'; portrait.draggable = false;
      const name = document.createElement('strong'); name.className = 'reward-tag-name'; name.textContent = e.name;
      const kind = document.createElement('span'); kind.className = 'reward-tag-kind'; kind.textContent = kinds[e.tier];
      const number = document.createElement('canvas'); number.className = 'reward-tag-number'; number.setAttribute('aria-hidden', 'true');
      const sheen = document.createElement('i'); sheen.className = 'reward-tag-sheen';
      el.append(art, portrait, name, kind, number, sheen); root.append(el);
      cards.set(e.id, { el, number, sheen }); render();
    },
    update(dt) { state.update(dt); if (cards.size) render(); },
    align(walletRect, viewportWidth, headerBottom = 64) {
      width = Math.max(1, Math.min(360, viewportWidth - walletRect.left - 14));
      root.style.left = walletRect.left + 'px';
      root.style.bottom = Math.max(0, innerHeight - walletRect.top + 10) + 'px';
      root.style.width = width + 'px';
      root.style.height = Math.max(0, walletRect.top - 10 - headerBottom) + 'px';
      root.style.setProperty('--tag-width', width + 'px'); render();
    },
    clear() { state.clear(); cards.clear(); root.replaceChildren(); },
  };
}
