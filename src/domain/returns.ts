import { Decimal, ZERO } from './money.ts';
import { daysBetween } from './dates.ts';
import type { IsoDate } from './dates.ts';
import type { Flow, Series } from './portfolio.ts';

/**
 * Rates are plain numbers: they are ratios, not money. Amounts stay Decimal until the rate solve.
 * Year basis: actual days / 365 (same as Excel XIRR).
 */

export interface CashFlow {
  date: IsoDate;
  /** Investor perspective: contributions negative, distributions and terminal value positive. */
  amount: Decimal;
}

/** Money-weighted return (annual). Returns null when the flows have no sign change or no root in (−99.99 %, 1000 %). */
export function xirr(cfs: readonly CashFlow[]): number | null {
  const pts = cfs.filter((c) => !c.amount.isZero());
  if (pts.length < 2) return null;
  const t0 = pts.reduce((m, c) => (c.date < m ? c.date : m), pts[0]!.date);
  const ts = pts.map((c) => ({ t: daysBetween(t0, c.date) / 365, a: c.amount.toNumber() }));
  const npv = (r: number) => ts.reduce((s, { t, a }) => s + a / (1 + r) ** t, 0);
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let k = 0; k < 200 && hi - lo > 1e-12; k++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (flo * fm <= 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

export interface Period {
  start: IsoDate;
  end: IsoDate;
  /** Modified Dietz return, or null when the capital base (V0 + weighted flows) is not positive. */
  r: number | null;
}

/**
 * Time-weighted return: Modified Dietz within each period between consecutive valuations, chained.
 * r = (V1 − V0 − F) / (V0 + Σ Fi·(end − ti)/days). A flow on the start date belongs to the previous period.
 * When V0 = 0 the portfolio starts inside the period, so flows get full weight (W = F).
 * Periods with a non-positive base are skipped (reported with r = null) instead of producing a nonsense rate.
 */
export function twr(values: readonly { date: IsoDate; value: Decimal }[], flows: readonly Flow[]) {
  const periods: Period[] = [];
  let growth = new Decimal(1);
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1]!;
    const b = values[i]!;
    const n = daysBetween(a.date, b.date);
    let F = ZERO;
    let W = ZERO;
    for (const f of flows) {
      if (f.date <= a.date || f.date > b.date) continue;
      F = F.plus(f.amount);
      W = W.plus(f.amount.times(daysBetween(f.date, b.date)).div(n));
    }
    if (a.value.isZero()) W = F;
    const base = a.value.plus(W);
    if (base.lte(0)) {
      periods.push({ start: a.date, end: b.date, r: null });
      continue;
    }
    const r = b.value.minus(a.value).minus(F).div(base);
    growth = growth.times(r.plus(1));
    periods.push({ start: a.date, end: b.date, r: r.toNumber() });
  }
  return { cumulative: growth.minus(1).toNumber(), periods };
}

export function annualize(cumulative: number, from: IsoDate, to: IsoDate): number {
  return (1 + cumulative) ** (365 / daysBetween(from, to)) - 1;
}

export interface Performance {
  from: IsoDate;
  to: IsoDate;
  startValue: Decimal;
  endValue: Decimal;
  netFlows: Decimal;
  /** Money-weighted, annual. */
  xirr: number | null;
  /** Time-weighted, cumulative over the window and annualized (from the first flow if the start value is zero). */
  twr: number;
  twrAnnual: number;
  periods: Period[];
}

/**
 * Performance over [from, to] using the series' valuation dates in that window.
 * A non-zero start value counts as a contribution on `from` (a position opened before the window).
 * When the start value is zero the portfolio did not exist yet, so TWR is annualized from the first flow.
 */
export function performance(s: Series, from: IsoDate, to: IsoDate): Performance {
  const values = s.values.filter((v) => v.date >= from && v.date <= to);
  const first = values[0];
  const last = values[values.length - 1];
  if (!first || !last || first.date !== from || last.date !== to) {
    throw new Error(`La serie no tiene valoración en ${from} y ${to}`);
  }
  const flows = s.flows.filter((f) => f.date > from && f.date <= to);
  const cfs: CashFlow[] = [
    { date: from, amount: first.value.neg() },
    ...flows.map((f) => ({ date: f.date, amount: f.amount.neg() })),
    { date: to, amount: last.value },
  ];
  const t = twr(values, flows);
  const since = first.value.isZero() && flows[0] ? flows[0].date : from;
  return {
    from,
    to,
    startValue: first.value,
    endValue: last.value,
    netFlows: flows.reduce((acc, f) => acc.plus(f.amount), ZERO),
    xirr: xirr(cfs),
    twr: t.cumulative,
    twrAnnual: annualize(t.cumulative, since, to),
    periods: t.periods,
  };
}
