import { describe, expect, it } from 'vitest';
import { dec } from '../src/domain/money.ts';
import { annualize, performance, twr, xirr } from '../src/domain/returns.ts';

const cf = (date: string, amount: number) => ({ date, amount: dec(amount) });
const v = (date: string, value: number) => ({ date, value: dec(value) });

describe('xirr', () => {
  it('10 % over exactly 365 days', () => {
    expect(xirr([cf('2023-01-01', -1000), cf('2024-01-01', 1100)])).toBeCloseTo(0.1, 10);
  });

  it('matches the Microsoft Excel XIRR documentation example (37.34 %)', () => {
    const r = xirr([cf('2008-01-01', -10000), cf('2008-03-01', 2750), cf('2008-10-30', 4250), cf('2009-02-15', 3250), cf('2009-04-01', 2750)]);
    expect(r).toBeCloseTo(0.373362535, 8);
  });

  it('negative return', () => {
    expect(xirr([cf('2023-01-01', -1000), cf('2024-01-01', 500)])).toBeCloseTo(-0.5, 10);
  });

  it('same-day flows are summed', () => {
    expect(xirr([cf('2023-01-01', -1000), cf('2023-01-01', -500), cf('2024-01-01', 1650)])).toBeCloseTo(0.1, 10);
  });

  it('ignores zero flows and returns null without a sign change', () => {
    expect(xirr([cf('2023-01-01', -1000), cf('2023-06-01', 0), cf('2024-01-01', 1100)])).toBeCloseTo(0.1, 10);
    expect(xirr([cf('2023-01-01', -1000), cf('2024-01-01', -100)])).toBeNull();
    expect(xirr([cf('2023-01-01', -1000)])).toBeNull();
  });
});

describe('twr (Modified Dietz, chained)', () => {
  it('no flows: plain growth', () => {
    expect(twr([v('2023-04-30', 100), v('2023-05-31', 110)], []).cumulative).toBeCloseTo(0.1, 12);
  });

  it('deposit mid-period is weighted by the time it was invested', () => {
    // 30-day period, 500 deposited with 15 days left: W = 250; r = (1600 − 1000 − 500) / 1250 = 8 %
    const r = twr([v('2023-04-30', 1000), v('2023-05-30', 1600)], [cf('2023-05-15', 500)]);
    expect(r.periods[0]!.r).toBeCloseTo(0.08, 12);
  });

  it('withdrawal mid-period', () => {
    // W = −200; r = (660 − 1000 + 400) / 800 = 7.5 %
    const r = twr([v('2023-04-30', 1000), v('2023-05-30', 660)], [cf('2023-05-15', -400)]);
    expect(r.cumulative).toBeCloseTo(0.075, 12);
  });

  it('chains periods geometrically', () => {
    const r = twr([v('2023-04-30', 1000), v('2023-05-30', 1600), v('2023-06-30', 1680)], [cf('2023-05-15', 500)]);
    expect(r.periods.map((p) => p.r)).toEqual([expect.closeTo(0.08, 12), expect.closeTo(0.05, 12)]);
    expect(r.cumulative).toBeCloseTo(1.08 * 1.05 - 1, 12);
  });

  it('portfolio starting inside the period (V0 = 0) gives the flow full weight', () => {
    const r = twr([v('2023-04-30', 0), v('2023-05-31', 1050)], [cf('2023-05-10', 1000)]);
    expect(r.cumulative).toBeCloseTo(0.05, 12);
  });

  it('a flow on the start date belongs to the previous period', () => {
    const r = twr([v('2023-04-30', 1000), v('2023-05-31', 1100)], [cf('2023-04-30', 1000)]);
    expect(r.cumulative).toBeCloseTo(0.1, 12);
  });

  it('skips a period whose capital base is not positive', () => {
    const r = twr([v('2023-04-30', 100), v('2023-05-30', 0), v('2023-06-30', 0)], [cf('2023-05-01', -150)]);
    expect(r.periods[0]!.r).toBeNull();
  });
});

describe('performance window', () => {
  it('a position opened before the window counts as a contribution at the start', () => {
    const series = { ccy: 'USD', values: [v('2023-12-31', 1000), v('2024-12-31', 1100)].map((x) => ({ ...x, valuation: undefined as never })), flows: [cf('2023-06-01', 1000)] };
    const p = performance(series, '2023-12-31', '2024-12-31');
    const expected = 1.1 ** (365 / 366) - 1; // 2024 is a leap year
    expect(p.twr).toBeCloseTo(0.1, 12);
    expect(p.twrAnnual).toBeCloseTo(expected, 10);
    expect(p.xirr).toBeCloseTo(expected, 8);
    expect(p.netFlows.toNumber()).toBe(0);
  });

  it('annualizes by actual days / 365', () => {
    expect(annualize(0.21, '2022-01-01', '2024-01-01')).toBeCloseTo(1.21 ** (365 / 730) - 1, 12);
  });
});
