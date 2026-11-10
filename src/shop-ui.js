import { $, gunIcon } from './ui.js';
import { weaponSlot, slotWeapon } from './weapon-slots.js';
import { weaponPortrait } from './weapon-portrait.js';
import './shop.css';

const categories = [
  { id:'rifle', label:'步槍', icon:'rifle', description:'選擇你的主力武器，配合習慣的射擊節奏。', weapons:['rifle','m4a1','scarl','vss'] },
  { id:'pistol', label:'手槍', icon:'pistol', description:'隨時切換副武器，保持火力。', weapons:['pistol','deagle'] },
  { id:'melee', label:'近戰', icon:'knife', description:'近距離揮砍，無需消耗子彈。', weapons:['knife'] },
  { id:'throwable', label:'投擲', icon:'grenade', description:'把握敵群聚集的時機，投出範圍攻擊。', weapons:['grenade'] },
  { id:'heavy', label:'重型武器', icon:'mg3', description:'大容量彈箱，提供持續的壓制火力。', weapons:['mg3'] },
];
const portraits = new Set(['rifle','m4a1','scarl','vss','pistol','deagle','knife','grenade','mg3']);
const number = n => n.toLocaleString('en-US');

// Presentation only: purchases, ammunition and saved slots stay in the game.
export function makeShopUI({weapons,economy,onClose}) {
  const overlay=$('shop'),tabs=$('shop-categories'),panel=$('shop-panel'),stock=$('stock');
  let category='rifle',opener=null;
  const roster=group=>group.weapons.filter(id=>weapons[id]);
  tabs.innerHTML=categories.map(group=>`<button type="button" role="tab" id="shop-tab-${group.id}"
    data-shop-category="${group.id}" aria-controls="shop-panel" aria-selected="false" tabindex="-1">
    ${gunIcon(group.icon)}<span>${group.label}</span><b>${roster(group).length}</b></button>`).join('');

  function render() {
    const active=document.activeElement?.closest('[data-buy]')?.dataset.buy;
    const group=categories.find(g=>g.id===category),ids=roster(group);
    for(const tab of tabs.children){const selected=tab.dataset.shopCategory===category;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    panel.setAttribute('aria-labelledby','shop-tab-'+category);
    $('shop-balance').textContent=number(economy.wallet);
    $('shop-category-title').textContent=group.label;
    $('shop-category-description').textContent=group.description;
    $('shop-count').textContent=String(ids.length).padStart(2,'0')+' 款裝備';
    $('shop-equipped').textContent=weapons[economy.weapon].name;
    $('grant').hidden=economy.wallet>=2;
    stock.innerHTML=ids.map(id=>{
      const w=weapons[id],owned=economy.owned.has(id),current=economy.weapon===id;
      const slot=weaponSlot(id),selected=owned&&slot&&slotWeapon(economy,slot)===id;
      const affordable=economy.wallet>=w.price,disabled=current||(!owned&&!affordable);
      const label=current?'使用中':owned?'裝備':affordable?'購買 '+number(w.price):'賞金不足';
      const badge=current?'目前使用':selected?'已配裝':owned?'已擁有':'可購買';
      const detail=id==='grenade'?`剩餘 ${economy.ammo.grenade} / 5 顆`:id==='knife'?'近戰 · 無需彈藥':`${w.mag} 發${id==='mg3'?'彈箱':'彈匣'} · ${w.semiAuto?'半自動':'全自動'}`;
      const cost=id==='grenade'?'每場配發 5 顆 · 範圍機率擊倒':id==='knife'?'近戰清怪 · 不發賞金':number(economy.bet)+' 幣 / 命中 · 打空退款';
      const art=portraits.has(id)?weaponPortrait(id):gunIcon(id);
      return `<article class="armory-card${current?' is-current':''}${selected?' is-selected':''}" data-shop-weapon="${id}">
        <div class="armory-card-top"><span>${w.family}</span><b>${badge}</b></div>
        <div class="armory-art${portraits.has(id)?'':' is-silhouette'}">${art}</div>
        <h3>${w.name}</h3><p class="armory-detail">${detail}</p>
        <div class="armory-card-bottom"><span>${cost}</span><button type="button" data-buy="${id}" ${disabled?'disabled':''} aria-label="${label}：${w.name}">${label}</button></div>
      </article>`;
    }).join('');
    if(active){const button=stock.querySelector(`[data-buy="${active}"]`);if(button&&!button.disabled)button.focus({preventScroll:true});else tabs.querySelector('[aria-selected="true"]').focus({preventScroll:true});}
  }
  function select(id) {
    category=id;render();panel.scrollTop=0;
    const tab=$('shop-tab-'+id);tab.focus({preventScroll:true});tab.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  tabs.addEventListener('click',e=>{const tab=e.target.closest('[data-shop-category]');if(tab)select(tab.dataset.shopCategory);});
  overlay.addEventListener('keydown',e=>{
    // Menu navigation must not trigger firing, switching or another overlay.
    e.stopPropagation();
    if(e.code==='Escape'||e.code==='KeyB'){e.preventDefault();if(!e.repeat)onClose();return;}
    if(e.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
      e.preventDefault();const i=categories.findIndex(g=>g.id===category),n=categories.length;
      select(categories[e.key==='Home'?0:e.key==='End'?n-1:(i+(e.key==='ArrowRight'?1:n-1))%n].id);
    }
    if(e.key==='Tab'){
      const buttons=[...overlay.querySelectorAll('button:not(:disabled):not([tabindex="-1"])')].filter(b=>!b.hidden);
      const first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  $('shop-done').onclick=onClose;
  return {
    render,
    show(){opener=document.activeElement;render();panel.scrollTop=0;$('shop-status').textContent='';tabs.querySelector('[aria-selected="true"]').focus({preventScroll:true});},
    chosen(id){render();$('shop-status').textContent='已裝備 '+weapons[id].name;},
    close(restoreFocus){if(restoreFocus)(opener?.isConnected&&opener!==document.body?opener:$('shop-btn')).focus({preventScroll:true});},
  };
}
