/**
 * Cross-validation against an independent reference implementation.
 * Usage: node scripts/crossval.ts <dir>
 * <dir> (kept outside the repo) holds ledger.csv, book.json, prices.csv, fx.csv, portfolios.json
 * ({ "<portfolio>": { "scope": {...}, "ccy": "USD", "benches": ["BENCH:X"], "from"?: "YYYY-MM-DD" } }) and optionally expected.json:
 *   { "<portfolio>": { "xirr": 0.28, "twr": 4.46, "twrAnnual": 0.31, "value": 123, "ksPme": { "<bench>": 1.37 } } }
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseLedgerCsv } from '../src/data/csv.ts';
import { parseBook, parseFx, parsePrices } from '../src/data/load.ts';
import { addDays, monthEnds } from '../src/domain/dates.ts';
import { ksPme } from '../src/domain/benchmark.ts';
import { MissingDataError } from '../src/domain/fx.ts';
import type { Scope } from '../src/domain/portfolio.ts';
import { portfolioSeries } from '../src/domain/portfolio.ts';
import { performance } from '../src/domain/returns.ts';
import type { Book } from '../src/domain/valuation.ts';

const dir = process.argv[2];
const end = process.argv[3] ?? '2026-06-30';
if (!dir) throw new Error('Usage: node scripts/crossval.ts <dir> [end-date]');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');

const ledger = parseLedgerCsv(read('ledger.csv'));
const book: Book = { ...parseBook(read('book.json')), prices: parsePrices(read('prices.csv')), fx: parseFx(read('fx.csv')) };
const expected = existsSync(join(dir, 'expected.json')) ? JSON.parse(read('expected.json')) : {};

interface PortfolioDef {
  scope: Scope;
  ccy: string;
  /** Price symbols of total-return benchmarks, e.g. "BENCH:SP500TR". */
  benches: string[];
  /** Window start; defaults to the month-end before the first flow. */
  from?: string;
}
const portfolios: Record<string, PortfolioDef> = JSON.parse(read('portfolios.json'));

const pct = (x: number | null | undefined) => (x == null ? '   n/a ' : `${(x * 100).toFixed(2).padStart(7)}%`);
let worst = 0;
function cmp(name: string, got: number | null, want: number | undefined, tol: number) {
  if (want === undefined || got === null) return '';
  const d = Math.abs(got - want);
  worst = Math.max(worst, d / tol);
  return d <= tol ? ' ✓' : ` ✗ ref ${want}`;
}

for (const [name, p] of Object.entries(portfolios)) {
  const probe = portfolioSeries(book, ledger, p.scope, p.ccy, [end]);
  const d0 = p.from ?? probe.flows[0]!.date;
  const from = p.from ?? addDays(`${d0.slice(0, 8)}01`, -1);
  const s = portfolioSeries(book, ledger, p.scope, p.ccy, monthEnds(from, end));
  const perf = performance(s, from, end);
  const e = expected[name] ?? {};
  const atCost = s.values.at(-1)!.valuation.positions.filter((x) => x.method === 'cost').map((x) => x.asset);
  console.log(`\n== ${name} (${p.ccy}) ${from} → ${end}  value ${perf.endValue.toFixed(0)}${cmp('value', perf.endValue.toNumber(), e.value, Math.max(1, (e.value ?? 0) * 1e-6))}`);
  console.log(`   XIRR ${pct(perf.xirr)}${cmp('xirr', perf.xirr, e.xirr, 5e-5)}   TWR cum ${pct(perf.twr)}${cmp('twr', perf.twr, e.twr, 5e-4)}   TWR annual ${pct(perf.twrAnnual)}${cmp('twrA', perf.twrAnnual, e.twrAnnual, 5e-5)}`);
  if (atCost.length) console.log(`   valued at cost (no price): ${atCost.join(', ')}`);
  for (const b of p.benches) {
    const level = (d: string) => {
      const px = book.prices.close(b, d);
      if (!px) throw new MissingDataError(`No ${b} level on ${d}`);
      return book.fx.convert(px.close, px.ccy, p.ccy, d);
    };
    const ks = ksPme(s.flows, perf.endValue, end, level);
    console.log(`   KS-PME vs ${b.padEnd(17)} ${ks.toFixed(3)}${cmp('ks', ks, e.ksPme?.[b], 1.5e-3)}`);
  }
}
console.log(`\nworst deviation / tolerance: ${worst.toFixed(2)}`);
