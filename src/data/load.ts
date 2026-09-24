import { dec } from '../domain/money.ts';
import { FxTable } from '../domain/fx.ts';
import type { RatePoint } from '../domain/fx.ts';
import { SeriesPriceSource } from '../domain/prices.ts';
import type { PricePoint } from '../domain/prices.ts';
import type { Account, Asset } from '../domain/types.ts';
import { CsvError, parseCsv } from './csv.ts';

function table(text: string, required: string[]): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const cols = header.map((h) => h.trim().toLowerCase());
  for (const c of required) if (!cols.includes(c)) throw new CsvError(`Falta la columna "${c}"`);
  return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()])));
}

export function parseBook(json: string): { accounts: Map<string, Account>; assets: Map<string, Asset> } {
  const b = JSON.parse(json) as { accounts: Account[]; assets: Asset[] };
  return { accounts: new Map(b.accounts.map((a) => [a.id, a])), assets: new Map(b.assets.map((a) => [a.id, a])) };
}

/** Columns: symbol, date, close, ccy, source. */
export function parsePrices(text: string, maxStaleDays?: number): SeriesPriceSource {
  const by = new Map<string, PricePoint[]>();
  for (const r of table(text, ['symbol', 'date', 'close', 'ccy'])) {
    const pts = by.get(r.symbol!) ?? [];
    pts.push({ date: r.date!, close: dec(r.close!), ccy: r.ccy!, source: r.source || 'unknown' });
    by.set(r.symbol!, pts);
  }
  const src = new SeriesPriceSource(maxStaleDays);
  for (const [s, pts] of by) src.set(s, pts);
  return src;
}

/**
 * Columns: ccy, date, per_usd, source. `ccy` is either a currency (value = units per USD, e.g. COP TRM)
 * or a pair quoted against USD like `EUR/USD` (value = USD per unit, market convention; inverted on load).
 */
export function parseFx(text: string, maxStaleDays?: number): FxTable {
  const by = new Map<string, RatePoint[]>();
  for (const r of table(text, ['ccy', 'date', 'per_usd'])) {
    const pair = r.ccy!.endsWith('/USD');
    const ccy = pair ? r.ccy!.slice(0, -4) : r.ccy!;
    const v = dec(r.per_usd!);
    const pts = by.get(ccy) ?? [];
    pts.push({ date: r.date!, perUsd: pair ? dec(1).div(v) : v, source: r.source || 'unknown' });
    by.set(ccy, pts);
  }
  const fx = new FxTable(maxStaleDays);
  for (const [c, pts] of by) fx.set(c, pts);
  return fx;
}
