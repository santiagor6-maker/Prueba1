import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLedgerCsv } from '../src/data/csv.ts';
import { parseBook, parseFx, parsePrices } from '../src/data/load.ts';
import { dec } from '../src/domain/money.ts';
import { FxTable } from '../src/domain/fx.ts';
import { SeriesPriceSource } from '../src/domain/prices.ts';
import { portfolioSeries } from '../src/domain/portfolio.ts';
import { performance } from '../src/domain/returns.ts';
import { analyze, customWindow, positionRows, seriesDates } from '../src/app/analysis.ts';
import { accounts, assets, tx } from './helpers.ts';

const read = (f: string) => readFileSync(new URL(`../samples/${f}`, import.meta.url), 'utf8');
const book = parseBook(read('book.json'));
const ctx = { book: { ...book, prices: parsePrices(read('prices.csv')), fx: parseFx(read('fx.csv')) }, ledger: parseLedgerCsv(read('ledger.csv')), benchmarks: book.benchmarks };

describe('report on the synthetic sample', () => {
  const rep = analyze(ctx, 'COP', '2025-06-30', 'all');

  it('total matches the engine computed directly', () => {
    const s = portfolioSeries(ctx.book, ctx.ledger, { kind: 'total' }, 'COP', seriesDates('2024-12-31', '2025-06-30'));
    const p = performance(s, '2024-12-31', '2025-06-30');
    expect(rep.error).toBeUndefined();
    expect(rep.total.value.eq(p.endValue)).toBe(true);
    expect(rep.total.perf!.xirr).toBeCloseTo(p.xirr!, 12);
    expect(rep.total.perf!.twr).toBeCloseTo(p.twr, 12);
  });

  it('buckets add up to the total minus cash, with benchmarks where configured', () => {
    const sumBuckets = rep.buckets.reduce((a, b) => a.plus(b.value), dec(0));
    expect(sumBuckets.plus(rep.cash).minus(rep.total.value).abs().lt(1)).toBe(true);
    const usd = rep.buckets.find((b) => b.bucket === 'acciones_usd')!;
    expect(usd.benches.map((b) => b.symbol)).toEqual(['BENCH:DEMO-TR']);
    expect(usd.benches[0]!.ksPme).toBeGreaterThan(0);
    expect(rep.buckets.find((b) => b.bucket === 'inmobiliario')!.leveraged).toBe(true);
  });

  it('growth of 100 ends at 100 × (1 + cumulative TWR)', () => {
    const usd = rep.buckets.find((b) => b.bucket === 'acciones_usd')!;
    expect(usd.growth[0]!.portfolio).toBe(100);
    expect(usd.growth.at(-1)!.portfolio).toBeCloseTo(100 * (1 + usd.perf!.twr), 9);
  });

  it('a custom window starts on the chosen date', () => {
    const r = analyze(ctx, 'COP', '2025-06-30', customWindow('2025-03-31'));
    expect(r.total.perf!.from).toBe('2025-03-31');
    expect(r.total.perf!.startValue.gt(0)).toBe(true);
  });
});

describe('position rows', () => {
  it('converts realized gains at the rate of the sale date, not the report date', () => {
    const fx = new FxTable().set('COP', [
      { date: '2025-01-01', perUsd: dec(4000), source: 't' },
      { date: '2025-02-01', perUsd: dec(5000), source: 't' },
    ]);
    const c = { book: { assets, accounts, fx, prices: new SeriesPriceSource() }, ledger: [
      tx('2025-01-01', 'usd', 'BUY', -100, { asset: 'AAA', q: 1 }),
      tx('2025-01-02', 'usd', 'SELL', 150, { asset: 'AAA', q: 1 }),
    ], benchmarks: [] };
    const [row] = positionRows(c, 'COP', '2025-02-01');
    expect(row!.realized.toNumber()).toBe(50 * 4000);
  });
});
