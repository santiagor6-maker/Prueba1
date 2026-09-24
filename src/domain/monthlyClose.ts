import type { Decimal } from './money.ts';
import { monthEnd } from './dates.ts';
import type { IsoDate } from './dates.ts';
import { holdingsAt } from './holdings.ts';
import type { Asset, Transaction } from './types.ts';

export interface ValuationDue {
  account: string;
  asset: string;
  name: string;
  /** Month-end the value is needed for. */
  date: IsoDate;
  /** Latest valuation before this month, to pre-fill or compare in the form. */
  previous?: { date: IsoDate; value: Decimal };
}

/**
 * Month-end close: manually priced positions (copy portfolios, funds, property) that are open at `date`
 * and have no VALUATION within that calendar month. Each one is a field the user fills in.
 */
export function valuationsDue(
  txs: readonly Transaction[],
  assets: ReadonlyMap<string, Asset>,
  date: IsoDate,
): ValuationDue[] {
  const end = monthEnd(date);
  const monthStart = `${end.slice(0, 8)}01`;
  const h = holdingsAt(txs, end);
  const due: ValuationDue[] = [];
  for (const p of h.positions.values()) {
    const asset = assets.get(p.asset);
    if (!p.open || asset?.pricing !== 'manual') continue;
    if (p.valuation && p.valuation.date >= monthStart) continue;
    due.push({
      account: p.account,
      asset: p.asset,
      name: asset.name,
      date: end,
      previous: p.valuation && { date: p.valuation.date, value: p.valuation.value },
    });
  }
  return due.sort((a, b) => a.account.localeCompare(b.account) || a.asset.localeCompare(b.asset));
}

/**
 * Builds the VALUATION transaction for a month-end value typed by the user.
 * `estimated`: true for appraisals or list prices, false for a statement value (broker, fund manager).
 */
export function valuationTx(
  due: ValuationDue,
  value: Decimal,
  ccy: string,
  opts: { estimated: boolean; note?: string },
): Transaction {
  return { date: due.date, account: due.account, type: 'VALUATION', asset: due.asset, amount: value, ccy, ...opts };
}
