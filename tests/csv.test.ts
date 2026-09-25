import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv, parseLedgerCsv, toLedgerCsv } from '../src/data/csv.ts';
import { parseBook, parseFx, parsePrices } from '../src/data/load.ts';
import { dec } from '../src/domain/money.ts';
import { validateTransaction } from '../src/domain/validate.ts';

describe('CSV', () => {
  it('handles quotes, escaped quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });

  it('round-trips a ledger exactly (decimals as strings)', () => {
    const text = 'id,date,account,type,asset,qty,amount,ccy,fee,estimated,transfer_id,note\nt1,2025-01-10,usd,BUY,AAA,0.1,-10.123456789,USD,0.5,false,,"lote 1, parcial"\n';
    const txs = parseLedgerCsv(text);
    expect(txs[0]!.amount.toString()).toBe('-10.123456789');
    expect(txs[0]!.note).toBe('lote 1, parcial');
    expect(toLedgerCsv(txs)).toBe(text);
  });

  it('ignores extra columns and reports the line of a bad row', () => {
    expect(parseLedgerCsv('date,account,type,amount,ccy,source\n2025-01-10,usd,DEPOSIT,100,USD,x\n')).toHaveLength(1);
    expect(() => parseLedgerCsv('date,account,type,amount,ccy\n2025-01-10,usd,DEPOSIT,100,USD\n2025-01-11,usd,BOUGHT,1,USD\n')).toThrow(/Línea 3/);
    expect(() => parseLedgerCsv('date,account,type,ccy\n')).toThrow(CsvError);
  });

  it('loads FX in both conventions: COP per USD and EUR/USD pair', () => {
    const fx = parseFx('ccy,date,per_usd,source\nCOP,2025-01-02,4000,t\nEUR/USD,2025-01-02,1.25,t\n');
    expect(fx.perUsd('EUR', '2025-01-02').perUsd.toString()).toBe('0.8');
    expect(fx.convert(dec(100), 'EUR', 'COP', '2025-01-02').toNumber()).toBe(500000);
  });
});

describe('synthetic sample (samples/)', () => {
  const read = (f: string) => readFileSync(new URL(`../samples/${f}`, import.meta.url), 'utf8');
  const ledger = parseLedgerCsv(read('ledger.csv'));
  const book = parseBook(read('book.json'));

  it('every sample transaction passes validation', () => {
    const ref = { ...book, today: '2026-09-24' };
    for (let i = 0; i < ledger.length; i++) {
      const errors = validateTransaction(ledger.slice(0, i), ledger[i]!, ref).filter((x) => x.level === 'error');
      expect(errors, `${i}: ${JSON.stringify(errors)}`).toEqual([]);
    }
  });

  it('prices and FX load', () => {
    expect(parsePrices(read('prices.csv')).close('SMPL', '2025-03-31')?.close.toNumber()).toBeGreaterThan(0);
    expect(parseFx(read('fx.csv')).perUsd('COP', '2025-03-31').perUsd.toNumber()).toBeGreaterThan(0);
  });
});
