import { ZERO } from './money.ts';
import type { Decimal } from './money.ts';
import type { IsoDate } from './dates.ts';
import type { Flow } from './portfolio.ts';
import { xirr } from './returns.ts';

/** Total-return index level on a date, already in the portfolio currency. Throws MissingDataError when unknown. */
export type IndexLevel = (date: IsoDate) => Decimal;

/**
 * Kaplan–Schoar PME: (distributions + NAV) / contributions, every flow compounded by the index to `end`.
 * > 1 means the portfolio beat the index given the same cash-flow timing. A start value counts as a contribution.
 */
export function ksPme(flows: readonly Flow[], endValue: Decimal, end: IsoDate, level: IndexLevel): number {
  const iT = level(end);
  let contrib = ZERO;
  let dist = ZERO;
  for (const f of flows) {
    if (f.date > end) continue;
    const g = iT.div(level(f.date));
    if (f.amount.gt(0)) contrib = contrib.plus(f.amount.times(g));
    else dist = dist.plus(f.amount.neg().times(g));
  }
  if (contrib.isZero()) throw new Error('KS-PME sin aportes');
  return dist.plus(endValue).div(contrib).toNumber();
}

/**
 * Public market equivalent: the same flows bought and sold in the index on the same dates.
 * Returns the index account's terminal value and its XIRR (comparable to the portfolio XIRR).
 * The terminal value can go negative when withdrawals exceed what the index would have grown to.
 */
export function pme(flows: readonly Flow[], end: IsoDate, level: IndexLevel): { endValue: Decimal; xirr: number | null } {
  let units = ZERO;
  for (const f of flows) {
    if (f.date > end) continue;
    units = units.plus(f.amount.div(level(f.date)));
  }
  const endValue = units.times(level(end));
  const cfs = flows.filter((f) => f.date <= end).map((f) => ({ date: f.date, amount: f.amount.neg() }));
  return { endValue, xirr: xirr([...cfs, { date: end, amount: endValue }]) };
}

/** Cumulative index return between two dates (annualize with `annualize`). */
export function indexReturn(level: IndexLevel, from: IsoDate, to: IsoDate): number {
  return level(to).div(level(from)).minus(1).toNumber();
}

