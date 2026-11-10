import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLoadout,selectLoadout,slotWeapon} from '../src/weapon-slots.js';
import {preferredAutoWeapon} from '../src/auto-play-rules.js';

const equipment=()=>({owned:new Set(['rifle','m4a1','scarl','vss','pistol','deagle','knife','mg3']),ammo:{m4a1:12,scarl:9,mg3:0},loadout:{rifle:'m4a1',pistol:'pistol',melee:'knife'}});
test('each equipment category changes independently without refilling magazines',()=>{
 const e=equipment();assert.ok(selectLoadout(e,'deagle'));
 assert.deepEqual(e.loadout,{rifle:'m4a1',pistol:'deagle',melee:'knife'});
 assert.ok(selectLoadout(e,'scarl'));
 assert.deepEqual(e.loadout,{rifle:'scarl',pistol:'deagle',melee:'knife'});
 assert.deepEqual(e.ammo,{m4a1:12,scarl:9,mg3:0});
 assert.equal(selectLoadout(e,'mg3'),false);
 assert.equal(selectLoadout(e,'unknown'),false);
});
test('saved slots reject cross-category, missing and unowned choices',()=>{
 const e=equipment();e.owned.delete('vss');
 assert.deepEqual(normalizeLoadout({rifle:'vss',pistol:'scarl',melee:'removed'},e.owned),{rifle:'rifle',pistol:'pistol',melee:'knife'});
 assert.deepEqual(normalizeLoadout(null,e.owned),{rifle:'rifle',pistol:'pistol',melee:'knife'});
 assert.equal(selectLoadout(e,'vss'),false);
 const saved=JSON.parse(JSON.stringify({rifle:'scarl',pistol:'deagle',melee:'knife'}));
 assert.deepEqual(normalizeLoadout(saved,e.owned),saved);
});
test('auto play returns to the chosen rifle when pickup ammunition runs out',()=>{
 const e=equipment();assert.equal(preferredAutoWeapon(e),'m4a1');
 e.ammo.mg3=4;assert.equal(preferredAutoWeapon(e),'mg3');
 e.ammo.mg3=0;selectLoadout(e,'scarl');assert.equal(preferredAutoWeapon(e),'scarl');
 assert.equal(slotWeapon(e,'pistol'),'pistol');
});
