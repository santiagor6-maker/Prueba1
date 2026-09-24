import type { Transaction, TxType } from './types.ts';

/**
 * Same-day processing order: money arrives first, then trades in the order they were entered,
 * then income, then valuations, then money leaves. Keeping trades in entry order lets a user
 * record a same-day buy-then-sell (or sell-then-buy) exactly as it happened.
 */
const RANK: Record<TxType, number> = {
  DEPOSIT: 0,
  TRANSFER_IN: 0,
  COMMITMENT: 1,
  BUY: 2,
  SELL: 2,
  WRITE_OFF: 2,
  CAPITAL_CALL: 2,
  DIVIDEND: 3,
  INTEREST: 3,
  FEE: 4,
  TAX: 4,
  VALUATION: 5,
  WITHDRAWAL: 6,
  TRANSFER_OUT: 6,
};

export function sortLedger(txs: readonly Transaction[]): Transaction[] {
  return txs
    .map((tx, i) => ({ tx, i }))
    .sort((a, b) =>
      a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : RANK[a.tx.type] - RANK[b.tx.type] || a.i - b.i,
    )
    .map((x) => x.tx);
}

export function positionKey(account: string, asset: string): string {
  return `${account}\u0000${asset}`;
}
