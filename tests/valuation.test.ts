import { describe, expect, it } from 'vitest';
import { dec } from '../src/domain/money.ts';
import { FxTable, MissingDataError } from '../src/domain/fx.ts';
import { holdingsAt } from '../src/domain/holdings.ts';
import { SeriesPriceSource } from '../src/domain/prices.ts';
import { valueHoldings } from '../src/domain/valuation.ts';
import type { Book } from '../src/domain/valuation.ts';
import { accounts, assets, tx } from './helpers.ts';

const rate = (date: string, perUsd: number | string) => ({ date, perUsd: dec(perUsd), source: 'test' });
const px = (date: string, close: number, ccy = 'USD') => ({ date, close: dec(close), ccy, source: 'test' });

function fxTable() {
  return new FxTable().set('COP', [rate('2024-01-01', 4000), rate('2024-01-03', 3900)]).set('EUR', [rate('2024-01-01', '0.9')]);
}

describe('FX', () => {
  it('uses the rate in force on the date (TRM validity)', () => {
    const fx = fxTable();
    expect(fx.convert(dec(4000), 'COP', 'USD', '2024-01-02').toNumber()).toBe(1);
    expect(fx.convert(dec(1), 'USD', 'COP', '2024-01-03').toNumber()).toBe(3900);
  });

  it('crosses through USD', () => {
    expect(fxTable().convert(dec(90), 'EUR', 'COP', '2024-01-03').toNumber()).toBe(390000);
  });

  it('never extrapolates: stale or earlier dates are missing', () => {
    const fx = fxTable();
    expect(() => fx.convert(dec(1), 'USD', 'COP', '2023-12-31')).toThrow(MissingDataError);
    expect(() => fx.convert(dec(1), 'USD', 'COP', '2024-01-20')).toThrow(MissingDataError);
    expect(() => fx.convert(dec(1), 'USD', 'JPY', '2024-01-02')).toThrow(MissingDataError);
  });
});

describe('position valuation', () => {
  const prices = new SeriesPriceSource()
    .set('AAA', [px('2024-01-02', 110)])
    .set('EUR1', [px('2024-01-02', 50, 'EUR')])
    .set('BBB', [px('2023-06-01', 9999, 'COP')]);
  const book: Book = { assets, accounts, prices, fx: fxTable() };

  it('market: units × close, converted with the rate of the valuation date', () => {
    const h = holdingsAt([tx('2024-01-02', 'usd', 'BUY', -1000, { asset: 'AAA', q: 10 }), tx('2024-01-02', 'usd', 'BUY', -45, { asset: 'EUR1', q: 1 })], '2024-01-03');
    const v = valueHoldings(book, h, 'COP', () => true, false);
    const aaa = v.positions.find((p) => p.asset === 'AAA')!;
    expect(aaa.method).toBe('market');
    expect(aaa.value.toNumber()).toBe(1100 * 3900);
    expect(aaa.priceAgeDays).toBe(1);
    expect(v.positions.find((p) => p.asset === 'EUR1')!.value.toNumber()).toBeCloseTo((50 / 0.9) * 3900, 6);
  });

  it('stale price falls back to cost and is flagged', () => {
    const h = holdingsAt([tx('2024-01-02', 'cop', 'BUY', -500000, { asset: 'BBB', q: 100 })], '2024-01-03');
    const [p] = valueHoldings(book, h, 'COP', () => true, false).positions;
    expect(p!.method).toBe('cost');
    expect(p!.estimated).toBe(true);
    expect(p!.value.toNumber()).toBe(500000);
  });

  it('manual: latest month-end value entered by the user (copy portfolio)', () => {
    const h = holdingsAt(
      [tx('2024-01-02', 'usd', 'BUY', -2000, { asset: 'COPY', q: 1 }), tx('2024-01-02', 'usd', 'VALUATION', 2100, { asset: 'COPY' })],
      '2024-01-03',
    );
    const [p] = valueHoldings(book, h, 'USD', () => true, false).positions;
    expect(p).toMatchObject({ method: 'manual', priceDate: '2024-01-02', estimated: false });
    expect(p!.value.toNumber()).toBe(2100);
  });

  it('off-plan property: equity = list price − amount still owed, flagged as estimate', () => {
    const h = holdingsAt(
      [
        tx('2024-01-01', 'cop-prop', 'COMMITMENT', -400_000_000, { asset: 'APTO' }),
        tx('2024-01-01', 'cop-prop', 'DEPOSIT', 5_000_000),
        tx('2024-01-01', 'cop-prop', 'CAPITAL_CALL', -5_000_000, { asset: 'APTO' }),
        tx('2024-01-02', 'cop-prop', 'DEPOSIT', 3_000_000),
        tx('2024-01-02', 'cop-prop', 'CAPITAL_CALL', -3_000_000, { asset: 'APTO' }),
        tx('2024-01-02', 'cop-prop', 'VALUATION', 440_000_000, { asset: 'APTO', estimated: true }),
      ],
      '2024-01-03',
    );
    const v = valueHoldings(book, h, 'COP');
    expect(v.positions[0]).toMatchObject({ method: 'manual', estimated: true });
    expect(v.positions[0]!.value.toNumber()).toBe(48_000_000); // 440M − (400M − 8M)
    expect(v.total.toNumber()).toBe(48_000_000); // cash is zero: deposits went straight to the developer
  });
});
