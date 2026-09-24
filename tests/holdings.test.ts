import { describe, expect, it } from 'vitest';
import { LedgerError, holdingsAt } from '../src/domain/holdings.ts';
import { positionKey } from '../src/domain/ledger.ts';
import { tx } from './helpers.ts';

const pos = (h: ReturnType<typeof holdingsAt>, acc: string, asset: string) => h.positions.get(positionKey(acc, asset))!;

describe('average cost', () => {
  const buys = [tx('2024-01-10', 'usd', 'BUY', -1000, { asset: 'AAA', q: 10 }), tx('2024-02-10', 'usd', 'BUY', -1500, { asset: 'AAA', q: 10 })];

  it('averages the cost of successive buys', () => {
    const p = pos(holdingsAt(buys, '2024-02-10'), 'usd', 'AAA');
    expect(p.qty.toNumber()).toBe(20);
    expect(p.cost.toNumber()).toBe(2500);
  });

  it('partial sell removes cost pro rata and books the realized gain', () => {
    // avg 125; sell 5 for 800: cost removed 625, realized 175
    const h = holdingsAt([...buys, tx('2024-03-10', 'usd', 'SELL', 800, { asset: 'AAA', q: 5 })], '2024-12-31');
    const p = pos(h, 'usd', 'AAA');
    expect(p.qty.toNumber()).toBe(15);
    expect(p.cost.toNumber()).toBe(1875);
    expect(p.realized.toNumber()).toBe(175);
  });

  it('selling the rest closes the position', () => {
    const h = holdingsAt(
      [...buys, tx('2024-03-10', 'usd', 'SELL', 800, { asset: 'AAA', q: 5 }), tx('2024-04-10', 'usd', 'SELL', 2000, { asset: 'AAA', q: 15 })],
      '2024-12-31',
    );
    const p = pos(h, 'usd', 'AAA');
    expect(p.open).toBe(false);
    expect(p.cost.toNumber()).toBe(0);
    expect(p.realized.toNumber()).toBe(300);
  });

  it('is exact with decimals that binary floats get wrong', () => {
    const h = holdingsAt(
      [tx('2024-01-10', 'usd', 'BUY', '-0.1', { asset: 'AAA', q: 1 }), tx('2024-01-11', 'usd', 'BUY', '-0.2', { asset: 'AAA', q: 1 })],
      '2024-12-31',
    );
    expect(pos(h, 'usd', 'AAA').cost.toString()).toBe('0.3');
  });
});

describe('same-day transactions', () => {
  const base = [tx('2024-01-02', 'usd', 'BUY', -1000, { asset: 'AAA', q: 10 })];

  it('are applied in entry order: sell-then-buy', () => {
    const h = holdingsAt(
      [...base, tx('2024-05-02', 'usd', 'SELL', 1500, { asset: 'AAA', q: 10 }), tx('2024-05-02', 'usd', 'BUY', -2000, { asset: 'AAA', q: 10 })],
      '2024-05-02',
    );
    const p = pos(h, 'usd', 'AAA');
    expect(p.realized.toNumber()).toBe(500);
    expect(p.cost.toNumber()).toBe(2000);
  });

  it('are applied in entry order: buy-then-sell averages first', () => {
    const h = holdingsAt(
      [...base, tx('2024-05-02', 'usd', 'BUY', -2000, { asset: 'AAA', q: 10 }), tx('2024-05-02', 'usd', 'SELL', 1500, { asset: 'AAA', q: 10 })],
      '2024-05-02',
    );
    const p = pos(h, 'usd', 'AAA');
    expect(p.realized.toNumber()).toBe(0);
    expect(p.cost.toNumber()).toBe(1500);
  });

  it('deposit entered after a same-day buy is still processed first', () => {
    const h = holdingsAt([tx('2024-01-02', 'usd', 'BUY', -1000, { asset: 'AAA', q: 10 }), tx('2024-01-02', 'usd', 'DEPOSIT', 1000)], '2024-01-02');
    expect(h.cash.get('usd')!.toNumber()).toBe(0);
  });
});

describe('errors and special cases', () => {
  it('rejects selling more than held', () => {
    expect(() => holdingsAt([tx('2024-01-02', 'usd', 'BUY', -100, { asset: 'AAA', q: 1 }), tx('2024-01-03', 'usd', 'SELL', 300, { asset: 'AAA', q: 2 })], '2024-12-31')).toThrow(LedgerError);
  });

  it('rejects selling a position that is not open', () => {
    expect(() => holdingsAt([tx('2024-01-03', 'usd', 'SELL', 300, { asset: 'AAA', q: 2 })], '2024-12-31')).toThrow(/sin posición abierta/);
  });

  it('write-off realizes the full cost as a loss', () => {
    const h = holdingsAt([tx('2024-01-02', 'cop', 'BUY', -500, { asset: 'BBB', q: 100 }), tx('2024-08-12', 'cop', 'WRITE_OFF', 0, { asset: 'BBB', q: 100 })], '2024-12-31');
    expect(pos(h, 'cop', 'BBB').realized.toNumber()).toBe(-500);
  });

  it('derives cash from every cash-moving transaction', () => {
    const h = holdingsAt(
      [tx('2024-01-02', 'usd', 'DEPOSIT', 1000), tx('2024-01-02', 'usd', 'BUY', -800, { asset: 'AAA', q: 8 }), tx('2024-03-01', 'usd', 'DIVIDEND', 10, { asset: 'AAA' }),
        tx('2024-03-02', 'usd', 'FEE', -5), tx('2024-03-03', 'usd', 'VALUATION', 999, { asset: 'AAA' })],
      '2024-12-31',
    );
    expect(h.cash.get('usd')!.toNumber()).toBe(205);
    expect(pos(h, 'usd', 'AAA').income.toNumber()).toBe(10);
  });

  it('ignores transactions after the as-of date', () => {
    const h = holdingsAt([tx('2024-01-02', 'usd', 'DEPOSIT', 1000), tx('2024-01-03', 'usd', 'DEPOSIT', 1000)], '2024-01-02');
    expect(h.cash.get('usd')!.toNumber()).toBe(1000);
  });

  it('units-less fund: partial withdrawal removes cost pro rata to value', () => {
    const txs = [tx('2024-01-31', 'cop', 'BUY', -1000, { asset: 'FUND' }), tx('2024-02-29', 'cop', 'VALUATION', 1200, { asset: 'FUND' }), tx('2024-03-15', 'cop', 'SELL', 300, { asset: 'FUND' })];
    const p = pos(holdingsAt(txs, '2024-03-15'), 'cop', 'FUND');
    expect(p.cost.toNumber()).toBe(750);
    expect(p.realized.toNumber()).toBe(50);
    expect(p.valuation!.value.toNumber()).toBe(900);
    const closed = pos(holdingsAt([...txs, tx('2024-03-20', 'cop', 'SELL', 900, { asset: 'FUND' })], '2024-03-20'), 'cop', 'FUND');
    expect(closed.open).toBe(false);
    expect(closed.realized.toNumber()).toBe(200);
  });
});
