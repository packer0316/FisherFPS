import { makeRewardTagState, formatReward, easeOut, REWARD_HOLD, REWARD_EXIT, REWARD_ENTER } from './reward-tag-state.js';
import { parseRewardFont, drawRewardNumber } from './reward-font.js';
import { REWARD_ROLL, sampleRewardTagMotion } from './reward-tag-motion.js';

const kinds = { bronze: '命中小獎', silver: '擊倒賞金', gold: 'BOSS 賞金' };
// Left edge of the metal frame in bronze/silver/gold.png (columns 49–50 of 1086), as a share of the width.
const PLATE_INSET = 0.046;
const STAGE_BLEED = 18;
const portraits = new Set(['walker', 'stalker', 'mummy', 'raider', 'necromancer', 'bride', 'warden', 'stationmaster']);
async function loadImage(src) {
  const img = new Image(); img.src = src; await img.decode(); return img;
}

export async function loadRewardTags(parent) {
  const [atlas, description] = await Promise.all([
    loadImage('reward-tags/digits.png'),
    fetch('reward-tags/digits.fnt').then(r => { if (!r.ok) throw new Error('Reward font failed to load'); return r.text(); }),
    ...Object.keys(kinds).map(t => loadImage('reward-tags/' + t + '.png')),
    ...[...portraits].map(id => loadImage('autoplay/' + id + '.webp')),
  ]);
  const font = parseRewardFont(description), state = makeRewardTagState(), cards = new Map(), spare = [], active = new Set();
  const root = document.createElement('div');
  root.id = 'reward-tags'; root.setAttribute('role', 'log');
  root.setAttribute('aria-label', '獲得賞金'); root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-relevant', 'additions'); parent.append(root);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 360, availableHeight = Infinity;

  function makeCard() {
    const el = document.createElement('article');
    const art = document.createElement('img'); art.className = 'reward-tag-plate'; art.alt = ''; art.draggable = false;
    const portrait = document.createElement('img'); portrait.className = 'reward-tag-portrait'; portrait.alt = ''; portrait.draggable = false;
    const name = document.createElement('strong'); name.className = 'reward-tag-name';
    const kind = document.createElement('span'); kind.className = 'reward-tag-kind';
    const number = document.createElement('canvas'); number.className = 'reward-tag-number'; number.setAttribute('aria-hidden', 'true');
    const flash = document.createElement('i'); flash.className = 'reward-tag-impact';
    const rail = document.createElement('i'); rail.className = 'reward-tag-rail';
    const latch = document.createElement('i'); latch.className = 'reward-tag-latch';
    const sheen = document.createElement('i'); sheen.className = 'reward-tag-sheen';
    const sparks = document.createElement('span'); sparks.className = 'reward-tag-sparks';
    for (let i = 0; i < 4; i++) sparks.append(document.createElement('i'));
    for (const decoration of [flash, rail, latch, sheen, sparks]) decoration.setAttribute('aria-hidden', 'true');
    el.append(art, portrait, name, kind, number, rail, flash, latch, sheen, sparks);
    return { el, art, portrait, name, kind, number, flash, rail, latch, sheen, sparks, motion: {} };
  }
  function bindCard(e) {
    const card = spare.pop() ?? makeCard();
    card.el.className = 'reward-tag ' + e.tier;
    card.el.dataset.species = e.species; card.el.dataset.tier = e.tier;
    card.el.setAttribute('aria-label', `${e.name}，${kinds[e.tier]}，${formatReward(e.amount)} 金幣`);
    card.art.src = 'reward-tags/' + e.tier + '.png';
    card.portrait.src = 'autoplay/' + e.species + '.webp';
    card.name.textContent = e.name; card.kind.textContent = kinds[e.tier];
    card.finalText = '+' + formatReward(e.amount);
    card.value = null; card.width = 0;
    cards.set(e.id, card); root.append(card.el);
    return card;
  }
  function release(id, card) {
    card.el.remove(); cards.delete(id);
    // Keep a small reusable DOM/canvas pool; a single giant burst must not retain it forever.
    if (spare.length < 12) spare.push(card);
  }

  function render() {
    active.clear();
    for (const e of state.entries) active.add(e.id);
    for (const [id, card] of cards) if (!active.has(id)) release(id, card);
    for (const e of state.entries) {
      const slot = reduced.matches ? e.targetSlot : e.slot, y = -slot * (width / 3 + 8);
      // Cards clipped above the HUD keep their clocks, but need no DOM, draw or effects.
      if (-y > availableHeight + width / 3) {
        const old = cards.get(e.id); if (old) release(e.id, old);
        continue;
      }
      const card = cards.get(e.id) ?? bindCard(e), m = sampleRewardTagMotion(e, reduced.matches, card.motion);
      const leaving = easeOut((e.age - REWARD_HOLD) / REWARD_EXIT);
      const shift = reduced.matches ? 0 : m.x * width / 360;
      const exitScale = reduced.matches ? 1 : 1 - leaving * .12;
      card.el.style.transform = `translate3d(${shift}px,${y + m.y * width / 360}px,0) rotate(${m.rotate}deg) scale(${m.sx * exitScale},${m.sy * exitScale})`;
      card.el.style.opacity = String(m.opacity * (1 - leaving));
      card.el.dataset.phase = e.age >= REWARD_HOLD ? 'exit' : e.age < REWARD_ENTER ? 'enter' : 'hold';
      card.el.dataset.counter = e.age < REWARD_ROLL ? 'counting' : 'locked';
      card.number.style.transform = `translateY(${m.numberY}px) scale(${1 + (m.numberScale - 1) * .45},${m.numberScale})`;
      card.portrait.style.transform = `scale(${m.portraitScale})`;
      card.flash.style.opacity = String(m.flash);
      card.latch.style.opacity = String(m.lock * .8);
      card.latch.style.transform = `translateX(${(1 - m.lock) * 5}px)`;
      card.rail.style.transform = `scaleX(${m.rail})`;
      card.rail.style.opacity = String(e.age < REWARD_ROLL ? .32 : .16 + m.lock * .84);
      card.sparks.style.opacity = String(m.sparkOpacity);
      card.sparks.style.setProperty('--travel', String(m.spark));
      card.sheen.style.opacity = String(m.sheen);
      card.sheen.style.transform = `translateX(${m.sheenX}%) skewX(-24deg)`;
      if (card.value !== e.value || card.width !== width) {
        const text = '+' + formatReward(e.value);
        drawRewardNumber(card.number, text, font, atlas, width * .555, width * .143, devicePixelRatio,
          card.finalText);
        card.number.dataset.value = text;
        card.value = e.value; card.width = width;
      }
    }
  }

  return {
    push(reward) {
      if (!portraits.has(reward.species)) return;
      if (state.push(reward)) render();
    },
    update(dt) { state.update(dt); if (state.entries.length || cards.size) render(); },
    align(walletRect, viewportWidth, headerBottom = 64) {
      width = Math.max(1, Math.min(360, viewportWidth - walletRect.left - 14, viewportWidth - 20));
      // The plate art's metal frame starts ~4.6% in; the ball chain hangs in that margin.
      // Preserve alignment on desktop; leave 10 px of recoil room on narrow screens.
      const left = Math.max(10, Math.min(viewportWidth - width - 10, walletRect.left - width * PLATE_INSET));
      root.style.left = '0px';
      root.style.bottom = Math.max(0, innerHeight - walletRect.top + 10 - STAGE_BLEED) + 'px';
      root.style.width = viewportWidth + 'px';
      availableHeight = Math.max(0, walletRect.top - 10 - headerBottom);
      root.style.height = availableHeight + STAGE_BLEED + 'px';
      root.style.setProperty('--tag-left', left + 'px');
      root.style.setProperty('--tag-bleed', STAGE_BLEED + 'px');
      root.style.setProperty('--tag-width', width + 'px'); render();
    },
    clear() { state.clear(); for (const [id, card] of cards) release(id, card); active.clear(); },
  };
}
