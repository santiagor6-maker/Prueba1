import { Decimal } from './money.ts';
import type { Ccy } from './money.ts';
import { daysBetween } from './dates.ts';
import type { IsoDate } from './dates.ts';

export class MissingDataError extends Error {}

export interface RatePoint {
  /** First day the rate applies (TRM: its "vigencia desde"). */
  date: IsoDate;
  /** Units of the currency per 1 USD (COP: the TRM). */
  perUsd: Decimal;
  source: string;
}

/**
 * Exchange rates stored against USD. A rate applies from its date until the next one,
 * within `maxStaleDays`; beyond that the rate is missing (never extrapolated).
 */
export class FxTable {
  private readonly series = new Map<Ccy, RatePoint[]>();

  private readonly maxStaleDays: number;

  constructor(maxStaleDays = 10) {
    this.maxStaleDays = maxStaleDays;
  }

  set(ccy: Ccy, points: RatePoint[]): this {
    this.series.set(ccy, [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
    return this;
  }

  /** Units of `ccy` per 1 USD on `date`. */
  perUsd(ccy: Ccy, date: IsoDate): RatePoint {
    if (ccy === 'USD') return { date, perUsd: new Decimal(1), source: 'identity' };
    const pts = this.series.get(ccy);
    if (!pts) throw new MissingDataError(`Sin tasa de cambio para ${ccy}`);
    let lo = 0;
    let hi = pts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid]!.date <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const p = found >= 0 ? pts[found]! : undefined;
    if (!p || daysBetween(p.date, date) > this.maxStaleDays) {
      throw new MissingDataError(`Sin tasa ${ccy}/USD vigente el ${date}`);
    }
    return p;
  }

  convert(amount: Decimal, from: Ccy, to: Ccy, date: IsoDate): Decimal {
    if (from === to) return amount;
    return amount.div(this.perUsd(from, date).perUsd).times(this.perUsd(to, date).perUsd);
  }
}
