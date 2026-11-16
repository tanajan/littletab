import { describe, expect, it } from 'vitest';
import { calculate, sampleRoom, type Room } from './lib';
const room = (amount: number): Room => ({ ...sampleRoom(), people: [{id:'a',name:'Alex'},{id:'b',name:'Sam'},{id:'c',name:'Jamie'}], items: [{ id:'1', name:'Dinner', amount, paidBy:'a', participants:['a','b','c'] }] });
describe('penny-exact expense splitting', () => {
  it('assigns remainder pennies deterministically and conserves money', () => {
    const result = calculate(room(1000));
    expect(result.shares).toEqual({a:334,b:333,c:333});
    expect(Object.values(result.balances).reduce((a,b)=>a+b,0)).toBe(0);
    expect(result.transfers).toEqual([{from:'b',to:'a',amount:333},{from:'c',to:'a',amount:333}]);
  });
  it('supports a payer who does not share the item', () => {
    const r = room(101); r.items[0].participants = ['b','c'];
    expect(calculate(r).balances).toEqual({a:101,b:-51,c:-50});
  });
  it('settles all balances without creating or losing a penny', () => {
    for (let cents = 1; cents < 1000; cents++) {
      const result = calculate(room(cents));
      const final = {...result.balances};
      for (const t of result.transfers) { final[t.from] += t.amount; final[t.to] -= t.amount; expect(t.amount).toBeGreaterThan(0); }
      expect(Object.values(final).every(v => v === 0)).toBe(true);
    }
  });
  it('handles empty rooms and zero balances', () => {
    const r = room(100); r.items = [];
    expect(calculate(r).transfers).toEqual([]);
    expect(calculate(r).total).toBe(0);
  });
});
import { splitItem } from './lib';
describe('custom amounts with automatic remainder', () => {
  it('handles participant IDs that match object property names', () => {
    const item = {...room(10).items[0],participants:['constructor','__proto__']};
    const shares=splitItem(item);
    expect(shares.constructor).toBe(5);
    expect(shares['__proto__']).toBe(5);
  });
  it('keeps a fixed share and divides the remainder penny-exactly', () => {
    const item = room(10001).items[0]; item.allocations = {a:2000};
    expect(splitItem(item)).toEqual({a:2000,b:4001,c:4000});
    const result=calculate({...room(10001),items:[item]});
    expect(result.shares).toEqual({a:2000,b:4001,c:4000});
    expect(Object.values(result.balances).reduce((a,b)=>a+b,0)).toBe(0);
  });
  it('allows explicit zero amounts and exact fully specified shares', () => {
    const item=room(100).items[0];item.allocations={a:0,b:30,c:70};
    expect(splitItem(item)).toEqual({a:0,b:30,c:70});
  });
  it('rejects overspending, incomplete fully specified splits, and invalid amounts', () => {
    const item=room(100).items[0];
    const invalidSplits: Record<string,number>[] = [{a:101},{a:10,b:20,c:30},{a:-1},{a:1.5},{outsider:50}];
    for(const allocations of invalidSplits) {
      expect(()=>splitItem({...item,allocations})).toThrow();
    }
  });
  it('settles a mix of fixed, free and automatic shares exactly', () => {
    for(let amount=1;amount<300;amount++) {
      const r=room(amount);r.items[0].allocations={a:Math.floor(amount/3),b:0};
      const result=calculate(r);const final={...result.balances};
      result.transfers.forEach(t=>{final[t.from]+=t.amount;final[t.to]-=t.amount;});
      expect(Object.values(final).every(value=>value===0)).toBe(true);
      expect(Object.values(result.shares).reduce((a,b)=>a+b,0)).toBe(amount);
    }
  });
});
import { animalFor, animalTone } from './lib';
describe('playful repeated animals',()=>{
  it('keeps matching animals distinct and consistent across views',()=>{
    const people=[{id:'a',name:'Alex',avatar:'dog' as const},{id:'b',name:'Jamie',avatar:'dog' as const},{id:'c',name:'Sam',avatar:'dog' as const}];
    expect(animalTone(people,'a')).toBe(0);
    expect(animalTone(people,'b')).toBe(1);
    expect(animalTone(people,'c')).toBe(2);
    expect(animalTone(people,'c','cat')).toBe(0);
    expect(animalFor({name:'Legacy name'})).toBe(animalFor({name:'Legacy name'}));
  });
});
