export const weaponSlots = [
  {id:'rifle',label:'步槍',key:'1',fallback:'rifle'},
  {id:'pistol',label:'手槍',key:'2',fallback:'pistol'},
  {id:'melee',label:'近戰',key:'3',fallback:'knife'},
];
const categories = {rifle:'rifle',m4a1:'rifle',vss:'rifle',scarl:'rifle',pistol:'pistol',deagle:'pistol',knife:'melee'};
export const weaponSlot = id => categories[id] ?? null;
export function normalizeLoadout(saved, owned) {
  return Object.fromEntries(weaponSlots.map(slot=>{
    const id=saved?.[slot.id];
    return [slot.id,weaponSlot(id)===slot.id && (!owned || owned.has(id)) ? id : slot.fallback];
  }));
}
export function slotWeapon(economy, slot) {
  return normalizeLoadout(economy.loadout,economy.owned)[slot];
}
export function selectLoadout(economy,id) {
  const slot=weaponSlot(id);
  if(!slot || !economy.owned.has(id))return false;
  economy.loadout={...normalizeLoadout(economy.loadout,economy.owned),[slot]:id};
  return true;
}
