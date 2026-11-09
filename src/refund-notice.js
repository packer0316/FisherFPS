// Game-time animation: pause freezes the notice, scene changes clear it.
// A small reusable pool also handles sustained MG3 misses without growing DOM.
export function makeRefundNotice(parent){
  const root=document.createElement('div');root.id='refund-notices';root.setAttribute('aria-hidden','true');parent.append(root);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),slots=Array.from({length:32},()=>{
    const el=document.createElement('div');el.className='refund-notice';el.hidden=true;root.append(el);return {el,age:0,y:0,targetY:0,active:false};
  });
  let next=0,height=300;
  return {
    push(amount){
      for(const s of slots)if(s.active)s.targetY+=28;
      const s=slots[next];next=(next+1)%slots.length;s.age=s.y=s.targetY=0;s.active=true;s.el.hidden=false;
      s.el.textContent='退款 + '+amount.toLocaleString('en-US');s.el.style.opacity='0';s.el.style.transform='translateY(0)';
    },
    update(dt){for(const s of slots){if(!s.active)continue;s.age+=dt;
      s.y=reduced.matches?s.targetY:s.y+(s.targetY-s.y)*(1-Math.exp(-dt*24));
      if(s.age>=1.8||s.y>height){s.active=false;s.el.hidden=true;continue;}
      s.el.style.opacity=String(Math.min(1,s.age/.07,(1.8-s.age)/.5));
      s.el.style.transform=`translateY(${-s.y-(reduced.matches?0:s.age*18)}px)`;
    }},
    align(rect){root.style.left=rect.left+'px';root.style.bottom=Math.max(0,innerHeight-rect.top+8)+'px';
      const radar=document.getElementById('radar-panel')?.getBoundingClientRect();
      const top=Math.max(document.querySelector('header')?.getBoundingClientRect().bottom??0,
        radar&&rect.left<radar.right&&rect.left+280>radar.left?radar.bottom:0);
      height=Math.max(32,rect.top-top-20);
      root.style.height=height+'px';root.style.width=Math.min(280,innerWidth-rect.left-8)+'px';},
    clear(){for(const s of slots){s.active=false;s.el.hidden=true;}},
  };
}
