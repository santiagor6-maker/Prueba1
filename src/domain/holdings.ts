import { Decimal, ZERO } from './money.ts';
import type { IsoDate } from './dates.ts';
import { positionKey, sortLedger } from './ledger.ts';
import type { Transaction } from './types.ts';

/**
 * Cost basis method: AVERAGE COST per (account, asset), in the account currency.
 * A sale removes cost in proportion to the units sold; realized gain = proceeds − cost removed.
 * Units-less assets (qty omitted): a SELL below the latest valuation is a partial withdrawal that removes cost
 * pro rata to value; otherwise a SELL/WRITE_OFF without qty closes the position.
 */
export interface Position {
  account: string;
  asset: string;
  qty: Decimal;
  /** Remaining cost basis, account currency. */
  cost: Decimal;
  /** Cumulative realized gain on sales and write-offs, account currency. */
  realized: Decimal;
  /** Cumulative dividends/income received, account currency. */
  income: Decimal;
  /** Contract price still owed is `commitment − cost` (off-plan property). */
  commitment?: Decimal;
  /** Latest manual valuation on or before the as-of date. */
  valuation?: { date: IsoDate; value: Decimal; estimated: boolean };
  open: boolean;
}

export interface Holdings {
  asOf: IsoDate;
  positions: Map<string, Position>;
  /** Derived cash per account, account currency. */
  cash: Map<string, Decimal>;
}

export class LedgerError extends Error {
  readonly tx: Transaction;

  constructor(message: string, tx: Transaction) {
    super(message);
    this.tx = tx;
  }
}

function position(h: Holdings, account: string, asset: string): Position {
  const k = positionKey(account, asset);
  let p = h.positions.get(k);
  if (!p) {
    p = { account, asset, qty: ZERO, cost: ZERO, realized: ZERO, income: ZERO, open: false };
    h.positions.set(k, p);
  }
  return p;
}

/** Replays the ledger up to and including `asOf`. Throws LedgerError on an impossible sale. */
export function holdingsAt(txs: readonly Transaction[], asOf: IsoDate): Holdings {
  const h: Holdings = { asOf, positions: new Map(), cash: new Map() };
  for (const tx of sortLedger(txs)) {
    if (tx.date > asOf) break;
    apply(h, tx);
  }
  return h;
}

export function apply(h: Holdings, tx: Transaction): void {
  if (tx.type !== 'VALUATION' && tx.type !== 'COMMITMENT') {
    h.cash.set(tx.account, (h.cash.get(tx.account) ?? ZERO).plus(tx.amount));
  }
  if (!tx.asset) return;
  const p = position(h, tx.account, tx.asset);
  switch (tx.type) {
    case 'BUY':
    case 'CAPITAL_CALL':
      if (tx.qty) p.qty = p.qty.plus(tx.qty);
      p.cost = p.cost.plus(tx.amount.neg());
      p.open = true;
      break;
    case 'SELL':
    case 'WRITE_OFF': {
      if (!p.open) throw new LedgerError(`${tx.date}: ${tx.type} de ${tx.asset} sin posición abierta en ${tx.account}`, tx);
      const proceeds = tx.type === 'SELL' ? tx.amount : ZERO;
      let fraction: Decimal;
      if (tx.qty !== undefined) {
        if (tx.qty.gt(p.qty)) {
          throw new LedgerError(`${tx.date}: venta de ${tx.qty} ${tx.asset} excede la posición (${p.qty}) en ${tx.account}`, tx);
        }
        fraction = tx.qty.div(p.qty);
      } else if (p.qty.isZero() && p.valuation && tx.type === 'SELL' && proceeds.lt(p.valuation.value)) {
        // Units-less asset (fund valued by statement): a partial withdrawal removes cost pro rata to value.
        fraction = proceeds.div(p.valuation.value);
        p.valuation = { ...p.valuation, value: p.valuation.value.minus(proceeds) };
      } else {
        fraction = new Decimal(1);
      }
      const full = fraction.eq(1);
      const removed = full ? p.cost : p.cost.times(fraction);
      p.realized = p.realized.plus(proceeds.minus(removed));
      p.cost = p.cost.minus(removed);
      p.qty = full ? ZERO : p.qty.minus(tx.qty ?? ZERO);
      if (full) {
        p.open = false;
        p.valuation = undefined;
      }
      break;
    }
    case 'DIVIDEND':
      p.income = p.income.plus(tx.amount);
      break;
    case 'VALUATION':
      p.valuation = { date: tx.date, value: tx.amount, estimated: tx.estimated ?? false };
      break;
    case 'COMMITMENT':
      p.commitment = (p.commitment ?? ZERO).plus(tx.amount.neg());
      break;
  }
}
