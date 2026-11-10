import { weaponSlots, weaponSlot, slotWeapon } from './weapon-slots.js';
import './loadout.css';

export function makeLoadoutUI({weapons,economy,onOpen,onClose,onChoose}) {
  const holder=document.getElementById('lobby-loadout-slots');
  const overlay=document.createElement('div');overlay.id='loadout-menu';overlay.className='overlay';overlay.hidden=true;
  overlay.innerHTML=`<section class="loadout-window" role="dialog" aria-modal="true" aria-labelledby="loadout-title">
    <div class="loadout-heading"><div><small>DUSTLINE / FIELD LOADOUT</small><h2 id="loadout-title">整備出擊武器</h2></div><button type="button" class="icon-button" data-loadout-close aria-label="關閉武器選擇">×</button></div>
    <p class="loadout-intro">三個欄位獨立裝備，進入獵場後按對應數字鍵切換。</p>
    <div class="loadout-tabs" role="tablist" aria-label="武器分類"></div>
    <div class="loadout-roster" role="tabpanel" id="loadout-panel"></div>
    <div class="loadout-footer"><span role="status" aria-live="polite" id="loadout-status"></span><button type="button" data-loadout-close>完成整備</button></div>
  </section>`;
  document.getElementById('app').append(overlay);
  let category='rifle',opener=null,lastSelection='';
  const art=id=>`<span class="loadout-art"><img src="loadout/${id}.webp" alt="" decoding="async" width="768" height="320"></span>`;
  function refresh(){
    const signature=weaponSlots.map(slot=>slotWeapon(economy,slot.id)).join('|');
    if(signature===lastSelection)return;
    lastSelection=signature;
    holder.innerHTML=weaponSlots.map(slot=>{const id=slotWeapon(economy,slot.id),w=weapons[id];return `<button type="button" class="loadout-slot" data-slot="${slot.id}" aria-haspopup="dialog" aria-label="選擇${slot.label}，目前${w.name}"><kbd>${slot.key}</kbd>${art(id)}<span><small>${slot.label}</small><strong>${w.code}</strong></span><i aria-hidden="true">›</i></button>`}).join('');
    if(!overlay.hidden)render();
  }
  function render(resetScroll=false){
    overlay.querySelector('.loadout-tabs').innerHTML=weaponSlots.map(slot=>`<button role="tab" type="button" id="loadout-tab-${slot.id}" data-category="${slot.id}" aria-controls="loadout-panel" aria-selected="${category===slot.id}" tabindex="${category===slot.id?0:-1}"><kbd>${slot.key}</kbd>${slot.label}</button>`).join('');
    const panel=overlay.querySelector('.loadout-roster');panel.setAttribute('aria-labelledby','loadout-tab-'+category);
    panel.innerHTML=['rifle','m4a1','scarl','vss','pistol','deagle','knife'].filter(id=>weaponSlot(id)===category&&economy.owned.has(id)).map(id=>{
      const w=weapons[id];
      const selected=slotWeapon(economy,category)===id;
      return `<button type="button" class="loadout-option${selected?' is-equipped':''}" data-loadout-weapon="${id}" aria-pressed="${selected}"><span class="loadout-option-top"><small>${w.family}</small><b>${selected?'已裝備':'選擇裝備'}</b></span>${art(id)}<strong>${w.code}</strong><span class="loadout-description">${w.description??(id==='rifle'?'經典木紋 · 熟悉的重擊節奏':id==='deagle'?'銀色鍍鉻 · 重手槍':id==='pistol'?'輕巧可靠 · 半自動射擊':'近身揮砍 · 迅速切換')}</span><span class="loadout-spec">${w.mag?`${w.mag} 發彈匣 · ${w.semiAuto?'單發':category==='pistol'?'半自動':'全自動'}`:'近戰武器'}</span></button>`;
    }).join('');
    if(resetScroll)panel.scrollTop=0;
    document.getElementById('loadout-status').textContent=`${weaponSlots.find(s=>s.id===category).label}已裝備：${weapons[slotWeapon(economy,category)].name}`;
  }
  holder.onclick=e=>{const button=e.target.closest('[data-slot]');if(button){opener=button;onOpen(button.dataset.slot)}};
  overlay.onclick=e=>{
    if(e.target===overlay||e.target.closest('[data-loadout-close]')){onClose();return;}
    const tab=e.target.closest('[data-category]');if(tab){category=tab.dataset.category;render(true);overlay.querySelector(`[data-category="${category}"]`).focus();return;}
    const choice=e.target.closest('[data-loadout-weapon]');if(choice){onChoose(choice.dataset.loadoutWeapon);refresh();overlay.querySelector(`[data-loadout-weapon="${choice.dataset.loadoutWeapon}"]`)?.focus();}
  };
  overlay.addEventListener('keydown',e=>{
    if(e.code==='Escape'){e.preventDefault();e.stopPropagation();onClose();return;}
    if(e.target.matches('[role=tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
      e.preventDefault();const i=weaponSlots.findIndex(s=>s.id===category);
      category=weaponSlots[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3].id;render(true);overlay.querySelector(`[data-category="${category}"]`).focus();
    }
    if(e.key==='Tab'){
      const all=[...overlay.querySelectorAll('button:not([tabindex="-1"])')],first=all[0],last=all.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
  });
  refresh();
  return {refresh,show(slot){category=slot;overlay.hidden=false;render(true);overlay.querySelector(`[data-category="${category}"]`).focus()},hide(){overlay.hidden=true;holder.querySelector(`[data-slot="${opener?.dataset.slot??category}"]`)?.focus()}};
}
