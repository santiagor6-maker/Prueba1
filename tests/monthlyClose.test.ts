import { describe, expect, it } from 'vitest';
import { dec } from '../src/domain/money.ts';
import { valuationTx, valuationsDue } from '../src/domain/monthlyClose.ts';
import { holdingsAt } from '../src/domain/holdings.ts';
import { positionKey } from '../src/domain/ledger.ts';
import { assets, tx } from './helpers.ts';

const ledger = [
  tx('2025-08-08', 'usd', 'BUY', -2000, { asset: 'COPY', q: 1 }),
  tx('2025-08-31', 'usd', 'VALUATION', 2050, { asset: 'COPY' }),
  tx('2025-08-08', 'usd', 'BUY', -1000, { asset: 'AAA', q: 10 }),
];

describe('month-end close', () => {
  it('asks for every open manually priced position without a value that month', () => {
    const due = valuationsDue(ledger, assets, '2025-09-15');
    expect(due).toEqual([
      { account: 'usd', asset: 'COPY', name: 'Copy portfolio', date: '2025-09-30', previous: { date: '2025-08-31', value: dec(2050) } },
    ]);
  });

  it('market-priced assets never need a manual value', () => {
    expect(valuationsDue(ledger, assets, '2025-09-30').map((d) => d.asset)).not.toContain('AAA');
  });

  it('a value entered in the month clears the field', () => {
    expect(valuationsDue(ledger, assets, '2025-08-31')).toEqual([]);
  });

  it('closed positions drop out', () => {
    const sold = [...ledger, tx('2025-09-10', 'usd', 'SELL', 2080, { asset: 'COPY', q: 1 })];
    expect(valuationsDue(sold, assets, '2025-09-30')).toEqual([]);
  });

  it('the typed value becomes a VALUATION transaction used for that month-end', () => {
    const [due] = valuationsDue(ledger, assets, '2025-09-30');
    const v = valuationTx(due!, dec('2123.45'), 'USD', { estimated: false });
    expect(v).toMatchObject({ date: '2025-09-30', type: 'VALUATION', asset: 'COPY', ccy: 'USD', estimated: false });
    const p = holdingsAt([...ledger, v], '2025-09-30').positions.get(positionKey('usd', 'COPY'))!;
    expect(p.valuation!.value.toString()).toBe('2123.45');
  });
});
