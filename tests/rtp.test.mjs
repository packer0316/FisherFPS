import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPTURE_RULES,TARGET_RTP,DEFAULT_BET,STARTING_WALLET,MAX_BET,MIN_BET,captureRule,rollCapture,resolveCaptureHit,grenadeKillChance,makeRtpLedger,makePrizeRandom,stepBet,bossEnraged} from '../src/rtp.js';
import {makeBossPayout} from '../src/boss-payout.js';

test('every species independently returns exactly 97% in expectation, including small prizes',()=>{
  assert.equal(STARTING_WALLET,10_000_000);assert.equal(DEFAULT_BET,10_000);
  for(const r of Object.values(CAPTURE_RULES)){
    assert.ok(r.killChance>0&&r.killChance+r.bonusChance<=1);
    assert.ok(Math.abs(r.killChance*r.multiplier+r.bonusChance*r.bonusMultiplier-TARGET_RTP)<1e-12,r.id);
    for(const bet of [MIN_BET,9999,DEFAULT_BET,MAX_BET]){
      assert.equal(rollCapture(r.id,bet,'shot',1,()=>0).amount,r.multiplier*bet);
      assert.equal(rollCapture(r.id,bet,'shot',1,()=>.99999999).amount,0);
      assert.equal(rollCapture(r.id,bet,'shot',1,()=>r.killChance).kind,r.bonusChance?'bonus':'miss');
      assert.equal(rollCapture(r.id,bet,'shot',1,()=>r.killChance+r.bonusChance).kind,'miss');
    }
  }
});
test('paid gun damage, accumulated hits, BET changes and rage never force or improve a prize',()=>{
  const target={type:{id:'stationmaster'},boss:true,hp:4200,maxHp:4200,alive:true};
  for(let i=0;i<10000;i++){
    const r=resolveCaptureHit(target,{source:'shot',bet:i%2?1:MAX_BET,damage:1e9},()=>.99);
    assert.equal(r.killed,false);assert.equal(r.chance,captureRule('stationmaster').killChance);
    assert.equal(target.hp,4200);
  }
  assert.equal(bossEnraged(target),true);
  assert.equal(resolveCaptureHit(target,{source:'shot',bet:DEFAULT_BET},()=>0).amount,15_000_000);
});
test('free grenade capture rolls independently for each target, with stronger centre odds and BET-scaled awards',()=>{
  const outcomes=[],rolls=[0,.99,0,.99];let index=0;
  for(const id of ['walker','walker','mummy','mummy']){
    const target={type:{id},hp:100,alive:true};
    outcomes.push(resolveCaptureHit(target,{source:'grenade',bet:DEFAULT_BET,strength:1},()=>rolls[index++]));
  }
  assert.deepEqual(outcomes.map(r=>r.killed),[true,false,true,false]);
  assert.deepEqual(outcomes.map(r=>r.amount),[30000,0,150000,0]);
  assert.ok(outcomes.every(r=>r.stake===0));
  for(const r of Object.values(CAPTURE_RULES)){
    assert.ok(grenadeKillChance(r.id)>r.killChance);
    assert.ok(grenadeKillChance(r.id)<=.85);
    assert.ok(grenadeKillChance(r.id,.15)<grenadeKillChance(r.id,1));
    assert.equal(grenadeKillChance(r.id,0),0);
  }
});
test('knife clears for zero coins and never consumes a prize roll; dead actors cannot pay twice',()=>{
  const target={type:{id:'walker'},hp:75,alive:true},random=()=>assert.fail('knife must not roll prizes');
  assert.equal(resolveCaptureHit(target,{source:'knife',damage:42},random).killed,false);
  const kill=resolveCaptureHit(target,{source:'knife',damage:42},random);
  assert.equal(kill.killed,true);assert.equal(kill.amount,0);assert.equal(kill.stake,0);
  target.alive=false;assert.equal(resolveCaptureHit(target,{source:'shot'},random),null);
});
test('refunds, promotional grenade awards and paid prizes use separate accounting',()=>{
  const ledger=makeRtpLedger();ledger.refund(10000);ledger.refund(10000);
  ledger.record(rollCapture('walker',10000,'shot',1,()=>0));
  ledger.record(rollCapture('walker',10000,'shot',1,()=>.99));
  ledger.record(rollCapture('bride',10000,'grenade',1,()=>0));
  assert.deepEqual(ledger.snapshot(),{target:.97,paidRounds:2,paidStake:20000,paidAwards:30000,paidRtp:1.5,
    freeHits:1,freeAwards:10000000,refundedShots:2,refunds:20000});
});
test('large boss jackpots credit exactly once, even across duplicate arrival callbacks',()=>{
  const amount=15_000_000,payout=makeBossPayout(amount,73);payout.reveal();let credited=0,prior=0;
  for(let i=0;i<73;i++){const total=Math.floor(amount*(i+1)/73),value=total-prior;prior=total;
    credited+=payout.receive(i,value);assert.equal(payout.receive(i,value),0);}
  payout.update(20);assert.equal(credited,amount);assert.equal(payout.display,amount);assert.equal(payout.phase,'done');
});
test('BET controls accept large denominations and RNG batches preserve [0,1) endpoints',()=>{
  assert.equal(stepBet(10000,1),20000);assert.equal(stepBet(10000,-1),5000);
  assert.equal(stepBet(12345,1),20000);assert.equal(stepBet(12345,-1),10000);
  assert.equal(stepBet(MIN_BET,-1),MIN_BET);assert.equal(stepBet(MAX_BET,1),MAX_BET);
  let batches=0;const random=makePrizeRandom({getRandomValues(values){batches++;values.fill(4294967295);values[0]=0;}});
  assert.equal(random(),0);for(let i=1;i<256;i++)assert.equal(random(),1-1/4294967296);
  assert.equal(random(),0);assert.equal(batches,2);
  for(const bad of [0,-1,NaN,Infinity,1.5,MAX_BET+1])assert.throws(()=>rollCapture('walker',bad));
  assert.throws(()=>rollCapture('missing',DEFAULT_BET));
  assert.throws(()=>rollCapture('walker',DEFAULT_BET,'shot',1,()=>1));
});
