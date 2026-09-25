import { fromStored } from '../data/json.ts';
import type { Dataset } from '../data/json.ts';
import { fxTable, priceSource } from '../data/load.ts';
import type { Context } from './analysis.ts';

const cache = new WeakMap<Dataset, Context>();

/** Engine inputs built from the stored dataset; rebuilt only when the dataset object changes. */
export function contextOf(d: Dataset): Context {
  let c = cache.get(d);
  if (!c) {
    c = {
      book: {
        accounts: new Map(d.accounts.map((a) => [a.id, a])),
        assets: new Map(d.assets.map((a) => [a.id, a])),
        prices: priceSource(d.prices),
        fx: fxTable(d.fx),
      },
      ledger: d.ledger.map(fromStored),
      benchmarks: d.benchmarks,
    };
    cache.set(d, c);
  }
  return c;
}

const covCache = new WeakMap<Dataset, { prices: Map<string, string>; fx: Map<string, string> }>();

/** Latest date per price symbol / FX currency, to show how fresh the market data is. */
export function coverage(d: Dataset): { prices: Map<string, string>; fx: Map<string, string> } {
  const hit = covCache.get(d);
  if (hit) return hit;
  const prices = new Map<string, string>();
  for (const p of d.prices) if ((prices.get(p.symbol) ?? '') < p.date) prices.set(p.symbol, p.date);
  const fx = new Map<string, string>();
  for (const r of d.fx) if ((fx.get(r.ccy) ?? '') < r.date) fx.set(r.ccy, r.date);
  covCache.set(d, { prices, fx });
  return { prices, fx };
}
