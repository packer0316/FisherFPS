// Presentation / feel values for the game. Paid-hit prizes remain in rtp.js.
export const classicRifles = {
  m4a1: {name:'M4A1 卡賓步槍',code:'M4A1',family:'全自動步槍',slot:'rifle',
    mag:30,delay:.095,damage:18,cost:2,price:0,reload:2.25,aimFov:44,
    recoil:.010,viewKick:36,description:'俐落連射 · 輕快回正',finish:'消光黑 / 金屬護木'},
  vss: {name:'VSS 消音步槍',code:'VSS',family:'整合消音步槍',slot:'rifle',
    mag:20,delay:.14,damage:23,cost:2,price:0,reload:2.65,aimFov:36,
    recoil:.008,viewKick:29,description:'消音射擊 · 木紋槍托',finish:'胡桃木 / 黑化鋼材'},
  scarl: {name:'SCAR-L 突擊步槍',code:'SCAR-L',family:'全自動步槍',slot:'rifle',
    mag:30,delay:.12,damage:21,cost:2,price:0,reload:2.45,aimFov:42,
    recoil:.014,viewKick:46,description:'沉穩節奏 · 明確後座力',finish:'沙漠色 / 陽極金屬'},
};
export const isClassicRifle = id => Object.hasOwn(classicRifles,id);
