import {writeFileSync} from 'node:fs';
import {CAPTURE_RULES,TARGET_RTP,DEFAULT_BET,rollCapture} from '../src/rtp.js';

// Reproducible QA only. Production uses Web Crypto, never this seeded generator.
function seeded(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);
  t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const args=process.argv.slice(2),get=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
const rounds=Number(get('--rounds',10_000_000)),seed=Number(get('--seed',20261109)),output=get('--out',null);
if(!Number.isSafeInteger(rounds)||rounds<1||!Number.isInteger(seed))throw new Error('Invalid rounds / seed');
const checkpoints=[1_000_000,10_000_000,rounds].filter((v,i,a)=>v<=rounds&&a.indexOf(v)===i).sort((a,b)=>a-b);
const species=[],rules=Object.values(CAPTURE_RULES);
for(const [index,r]of rules.entries()){
  const random=seeded(seed+index*101),variance=r.killChance*r.multiplier**2+r.bonusChance*r.bonusMultiplier**2-TARGET_RTP**2;
  let awarded=0,kills=0,bonuses=0;const samples=[];
  for(let i=1;i<=rounds;i++){
    const result=rollCapture(r.id,1,'shot',1,random);awarded+=result.amount;
    if(result.killed)kills++;else if(result.kind==='bonus')bonuses++;
    if(checkpoints.includes(i))samples.push({rounds:i,paidRtp:awarded/i,kills,bonuses,standardError:Math.sqrt(variance/i)});
  }
  species.push({id:r.id,name:r.name,tier:r.tier,multiplier:r.multiplier,prizeAtDefaultBet:r.multiplier*DEFAULT_BET,
    killChance:r.killChance,bonusChance:r.bonusChance,theoreticalRtp:r.killChance*r.multiplier+r.bonusChance*r.bonusMultiplier,samples});
}
// A declared example mix, not an assumption used by the game's probability table.
const mix=[['stalker',25],['walker',25],['raider',18],['mummy',12],['necromancer',10],['warden',4],['bride',3],['stationmaster',3]];
const deck=mix.flatMap(([id,n])=>Array(n).fill(id)),random=seeded(seed+999),blocks=[],mixed=[];
let awarded=0,block=0;
for(let i=1;i<=rounds;i++){
  const result=rollCapture(deck[Math.floor(random()*100)],1,'shot',1,random);awarded+=result.amount;block+=result.amount;
  if(i%100===0){blocks.push(block/100);block=0;}
  if(checkpoints.includes(i))mixed.push({rounds:i,paidRtp:awarded/i});
}
blocks.sort((a,b)=>a-b);
const report={seed,defaultBet:DEFAULT_BET,target:TARGET_RTP,definition:'One paid valid hit per round. Miss refunds excluded. Free grenade awards, starting balance and shop grants excluded.',
  species,mix:Object.fromEntries(mix),mixed,shortRuns100:{p10:blocks[Math.floor(blocks.length*.1)],median:blocks[Math.floor(blocks.length*.5)],p90:blocks[Math.floor(blocks.length*.9)],max:blocks.at(-1)}};
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.table(species.map(r=>({species:r.name,multiplier:r.multiplier,killPercent:(r.killChance*100).toFixed(6),
  ...Object.fromEntries(r.samples.map(s=>[s.rounds+' rounds',(s.paidRtp*100).toFixed(4)+'%']))})));
console.log(JSON.stringify({mixed,shortRuns100:report.shortRuns100,definition:report.definition},null,2));
