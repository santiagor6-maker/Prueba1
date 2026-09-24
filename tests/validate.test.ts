import { describe, expect, it } from 'vitest';
import { validateTransaction } from '../src/domain/validate.ts';
import { accounts, assets, tx } from './helpers.ts';

const ref = { assets, accounts, today: '2026-09-24' };
const ledger = [
  tx('2026-01-02', 'usd', 'DEPOSIT', 1000, { id: '1' }),
  tx('2026-01-05', 'usd', 'BUY', -1000, { id: '2', asset: 'AAA', q: 10 }),
  tx('2026-03-05', 'usd', 'SELL', 600, { id: '3', asset: 'AAA', q: 5 }),
];
const codes = (t: Parameters<typeof validateTransaction>[1], id?: string) => validateTransaction(ledger, t, ref, id).map((i) => `${i.level}:${i.code}`);

describe('validating a new buy/sell', () => {
  it('accepts a normal sale', () => {
    expect(codes(tx('2026-04-01', 'usd', 'SELL', 700, { asset: 'AAA', q: 5 }))).toEqual([]);
  });

  it('rejects selling more than held', () => {
    expect(codes(tx('2026-04-01', 'usd', 'SELL', 800, { asset: 'AAA', q: 6 }))).toEqual(['error:OVERSELL']);
  });

  it('rejects a back-dated sale that leaves a later sale uncovered', () => {
    expect(codes(tx('2026-02-01', 'usd', 'SELL', 700, { asset: 'AAA', q: 6 }))).toEqual(['error:BREAKS_LATER']);
  });

  it('accepts editing a trade in place (replaceId)', () => {
    expect(codes(tx('2026-03-05', 'usd', 'SELL', 1300, { id: '3', asset: 'AAA', q: 10 }), '3')).toEqual([]);
  });

  it('checks signs, currency, dates and required fields', () => {
    expect(codes(tx('2026-04-01', 'usd', 'BUY', 100, { asset: 'AAA', q: 1 }))).toEqual(['error:SIGN']);
    expect(codes(tx('2026-04-01', 'usd', 'BUY', -100, { asset: 'AAA', q: 1, ccy: 'COP' }))).toEqual(['error:CCY']);
    expect(codes(tx('2026-10-01', 'usd', 'DEPOSIT', 100))).toEqual(['error:FUTURE_DATE']);
    expect(codes(tx('2026-02-30', 'usd', 'DEPOSIT', 100))).toEqual(['error:DATE']);
    expect(codes(tx('2026-04-01', 'usd', 'BUY', -100, { asset: 'AAA' }))).toEqual(['error:QTY_REQUIRED']);
    expect(codes(tx('2026-04-01', 'usd', 'BUY', -100, { asset: 'ZZZ', q: 1 }))).toEqual(['error:ASSET']);
    expect(codes(tx('2026-04-01', 'nope', 'DEPOSIT', 100))).toEqual(['error:ACCOUNT']);
  });

  it('warns when derived cash goes negative (a deposit is probably missing)', () => {
    expect(codes(tx('2026-04-01', 'usd', 'BUY', -700, { asset: 'AAA', q: 5 }))).toEqual(['warning:NEGATIVE_CASH']);
  });

  it('warns about duplicates', () => {
    expect(codes(tx('2026-01-02', 'usd', 'DEPOSIT', 1000))).toEqual(['warning:DUPLICATE']);
  });

  it('a manual value for a market-priced asset is only a fallback', () => {
    expect(codes(tx('2026-04-30', 'usd', 'VALUATION', 900, { asset: 'AAA' }))).toEqual(['warning:VALUATION_IGNORED']);
  });
});
