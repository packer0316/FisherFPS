// One paid, valid hit is one round. Misses are refunded. Free grenades are a
// separate promotional award stream and never enter the paid RTP denominator.
export const TARGET_RTP=.97;
export const STARTING_WALLET=10_000_000,DEFAULT_BET=10_000,MIN_BET=1,MAX_BET=1_000_000;
export const BET_STEPS=Object.freeze([1,10,50,100,500,1000,2000,5000,10000,20000,50000,100000,200000,500000,1000000]);
const table=[
  ['stalker','夜行獵手','small',2,0,8,0],
  ['walker','荒城行屍','small',3,0,8,0],
  ['raider','荒漠盜墓者','medium',8,.015,14,0],
  ['mummy','古墓守衛','medium',15,.015,14,0],
  ['necromancer','死靈法師','medium',25,.015,14,0],
  ['warden','典獄長','boss',600,.12,30,120],
  ['bride','鬼新娘','boss',1000,.12,30,160],
  ['stationmaster','站長','boss',1500,.12,30,200],
];
export const CAPTURE_RULES=Object.freeze(Object.fromEntries(table.map(([id,name,tier,multiplier,bonusChance,grenadeBoost,enrageHits])=>[
  id,Object.freeze({id,name,tier,multiplier,bonusChance,bonusMultiplier:bonusChance?2:0,grenadeBoost,enrageHits,
    killChance:(TARGET_RTP-bonusChance*2)/multiplier}),
])));
export function captureRule(id){const rule=CAPTURE_RULES[id];if(!rule)throw new RangeError('Unknown capture species: '+id);return rule;}
export function validBet(bet){return Number.isInteger(bet)&&bet>=MIN_BET&&bet<=MAX_BET;}
export function stepBet(bet,direction){return direction>0?(BET_STEPS.find(v=>v>bet)??MAX_BET):([...BET_STEPS].reverse().find(v=>v<bet)??MIN_BET);}
export function grenadeKillChance(id,strength=1){const r=captureRule(id);return Math.min(.85,r.killChance*r.grenadeBoost)*Math.max(0,Math.min(1,strength));}
export function captureChance(id,source='shot',strength=1){return source==='grenade'?grenadeKillChance(id,strength):source==='knife'?0:captureRule(id).killChance;}
export function formatChance(chance){return (chance*100).toFixed(chance<.01?4:2).replace(/\.?0+$/,'')+'%';}
export function bossEnraged(target){return (target.rage??0)>=captureRule(target.type.id).enrageHits;}

// The prize RNG is isolated from visual effects and is never reseeded or biased
// using a wallet balance, recent losses/wins, BET, elapsed time or player identity.
export function makePrizeRandom(crypto=globalThis.crypto){
  const values=new Uint32Array(256);let index=values.length;
  return ()=>{if(index===values.length){crypto.getRandomValues(values);index=0;}return values[index++]/4294967296;};
}
export function rollCapture(id,bet,source='shot',strength=1,random=Math.random){
  if(!validBet(bet))throw new RangeError('Invalid BET');
  if(source!=='shot'&&source!=='grenade')throw new RangeError('Invalid prize source');
  const rule=captureRule(id),chance=captureChance(id,source,strength),roll=random();
  if(!(roll>=0&&roll<1))throw new RangeError('Prize RNG must return [0, 1)');
  const kind=roll<chance?'kill':source==='shot'&&roll<chance+rule.bonusChance?'bonus':'miss';
  const multiplier=kind==='kill'?rule.multiplier:kind==='bonus'?rule.bonusMultiplier:0;
  return {source,kind,killed:kind==='kill',amount:bet*multiplier,multiplier,chance,bet,stake:source==='shot'?bet:0};
}

// HP is only durability for the free, non-paying knife. Paid projectiles and
// grenades resolve by independent chance; accumulated damage cannot force a prize.
export function resolveCaptureHit(target,{source='shot',bet=DEFAULT_BET,damage=0,strength=1}={},random=Math.random){
  if(!target.alive)return null;
  let result;
  if(source==='knife'){
    target.hp=Math.max(0,target.hp-Math.max(0,damage));
    result={source,kind:target.hp===0?'kill':'miss',killed:target.hp===0,amount:0,multiplier:0,chance:0,bet,stake:0};
  }else result=rollCapture(target.type.id,bet,source,strength,random);
  target.hitCount=(target.hitCount??0)+1;
  if(target.boss)target.rage=(target.rage??0)+(source==='grenade'?8*strength:1);
  if(result.killed)target.hp=0;
  return result;
}

export function makeRtpLedger(){
  let paidRounds=0,paidStake=0,paidAwards=0,freeAwards=0,freeHits=0,refundedShots=0,refunds=0;
  return {
    record(result){if(result.source==='shot'){paidRounds++;paidStake+=result.stake;paidAwards+=result.amount;}
      else if(result.source==='grenade'){freeHits++;freeAwards+=result.amount;}},
    refund(bet){refundedShots++;refunds+=bet;},
    snapshot(){return {target:TARGET_RTP,paidRounds,paidStake,paidAwards,paidRtp:paidStake?paidAwards/paidStake:null,
      freeHits,freeAwards,refundedShots,refunds};},
  };
}
