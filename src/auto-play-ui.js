import { normalizePriority, togglePriority } from './auto-play-rules.js';

export function makeAutoPlayUI({onStart,onClose}) {
  const $=id=>document.getElementById(id),overlay=$('autoplay-menu'),grid=$('autoplay-roster');
  let roster=[],order=[],sceneKey='',opener;
  function draw(){
    for(const card of grid.children){
      const rank=order.indexOf(card.dataset.species);
      card.setAttribute('aria-pressed',String(rank>=0));
      card.querySelector('.auto-rank').textContent=rank<0?'+':String(rank+1).padStart(2,'0');
      card.setAttribute('aria-label',card.dataset.name+(rank<0?'，未選擇':'，優先順序 '+(rank+1)));
    }
    $('autoplay-count').textContent=order.length+' / '+roster.length;
    $('autoplay-start').disabled=!order.length;
    $('autoplay-order').replaceChildren(...order.map((id,i)=>{
      const li=document.createElement('li'),n=document.createElement('b');n.textContent=String(i+1).padStart(2,'0');
      li.append(n,document.createTextNode(roster.find(t=>t.id===id).name));return li;
    }));
    $('autoplay-empty').hidden=order.length>0;
  }
  $('autoplay-all').onclick=()=>{order=roster.map(t=>t.id);draw();};
  $('autoplay-reset').onclick=()=>{order=[];draw();};
  $('autoplay-close').onclick=onClose;
  $('autoplay-cancel').onclick=onClose;
  $('autoplay-start').onclick=()=>{
    if(!order.length)return;
    const config={order:[...order],grenades:$('autoplay-grenades').checked,supplies:$('autoplay-supplies').checked,
      maxShots:$('autoplay-limit').checked?Math.max(1,Math.min(100000,Math.floor(Number($('autoplay-shots').value)||300))):0};
    try{localStorage.setItem('dustline-autoplay-'+sceneKey,JSON.stringify(config));}catch{/* Private browsing may disable storage. */}
    onStart(config);
  };
  $('autoplay-limit').onchange=()=>{$('autoplay-shots').disabled=!$('autoplay-limit').checked;};
  overlay.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const nodes=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')],first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  return {
    open(items,key,title,bet){
      opener=document.activeElement;roster=items;sceneKey=key;
      let saved;try{saved=JSON.parse(localStorage.getItem('dustline-autoplay-'+key));}catch{/* Use scene defaults. */}
      order=saved?normalizePriority(saved.order,roster):roster.map(t=>t.id);
      $('autoplay-scene').textContent=title;$('autoplay-bet').textContent=bet.toLocaleString()+' 幣 / 發';
      $('autoplay-grenades').checked=saved?.grenades!==false;$('autoplay-supplies').checked=saved?.supplies!==false;
      $('autoplay-limit').checked=!!saved?.maxShots;$('autoplay-shots').value=saved?.maxShots||300;
      $('autoplay-shots').disabled=!saved?.maxShots;
      grid.replaceChildren(...roster.map(t=>{
        const card=document.createElement('button');card.type='button';card.className='auto-monster';card.dataset.species=t.id;card.dataset.name=t.name;
        const rank=document.createElement('span');rank.className='auto-rank';
        const img=document.createElement('img');img.alt='';img.width=256;img.height=256;
        img.src='/autoplay/'+t.id+'.webp';img.draggable=false;
        const tag=document.createElement('small');tag.textContent=t.actor.boss?'BOSS':'獵場目標';
        const name=document.createElement('strong');name.textContent=t.name;
        card.append(img,rank,tag,name);card.onclick=()=>{order=togglePriority(order,t.id);draw();};return card;
      }));
      overlay.hidden=false;draw();$('autoplay-close').focus();
    },
    close(){overlay.hidden=true;if(opener?.isConnected)opener.focus();},
  };
}
