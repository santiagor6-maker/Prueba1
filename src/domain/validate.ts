import { ZERO } from './money.ts';
import { isIsoDate } from './dates.ts';
import type { IsoDate } from './dates.ts';
import { LedgerError, apply } from './holdings.ts';
import type { Holdings } from './holdings.ts';
import { sortLedger } from './ledger.ts';
import { ASSET_TX, TX_TYPES } from './types.ts';
import type { Account, Asset, Transaction, TxType } from './types.ts';

export interface Issue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

/** Required sign of `amount` per type: 1 positive, −1 negative, 0 exactly zero. */
const SIGN: Record<TxType, 1 | -1 | 0> = {
  DEPOSIT: 1,
  TRANSFER_IN: 1,
  SELL: 1,
  DIVIDEND: 1,
  INTEREST: 1,
  VALUATION: 1,
  WITHDRAWAL: -1,
  TRANSFER_OUT: -1,
  BUY: -1,
  FEE: -1,
  TAX: -1,
  CAPITAL_CALL: -1,
  COMMITMENT: -1,
  WRITE_OFF: 0,
};

/**
 * Checks a new or edited transaction (a buy/sell "novedad", a dividend, a month-end value…) against the ledger.
 * Errors block saving; warnings are shown and the user may confirm.
 * `replaceId` lets an edit be validated as a replacement of the stored transaction with that id.
 */
export function validateTransaction(
  ledger: readonly Transaction[],
  tx: Transaction,
  ref: { assets: ReadonlyMap<string, Asset>; accounts: ReadonlyMap<string, Account>; today: IsoDate },
  replaceId?: string,
): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });

  if (!TX_TYPES.includes(tx.type)) err('TYPE', `Tipo de movimiento desconocido: ${tx.type}`);
  if (!isIsoDate(tx.date)) err('DATE', `Fecha inválida: ${tx.date}`);
  else if (tx.date > ref.today) err('FUTURE_DATE', `La fecha ${tx.date} está en el futuro`);

  const account = ref.accounts.get(tx.account);
  if (!account) err('ACCOUNT', `Cuenta desconocida: ${tx.account}`);
  else if (tx.ccy !== account.ccy) err('CCY', `La cuenta ${account.name} opera en ${account.ccy}, no en ${tx.ccy}`);

  const asset = tx.asset ? ref.assets.get(tx.asset) : undefined;
  if (ASSET_TX.has(tx.type)) {
    if (!tx.asset) err('ASSET_REQUIRED', `${tx.type} requiere un activo`);
    else if (!asset) err('ASSET', `Activo desconocido: ${tx.asset}`);
  }

  const sign = SIGN[tx.type];
  if (sign === 0 && !tx.amount.isZero()) err('SIGN', `${tx.type} no mueve efectivo: el monto debe ser 0`);
  if (sign === 1 && !tx.amount.gt(0)) err('SIGN', `${tx.type}: el monto debe ser positivo`);
  if (sign === -1 && !tx.amount.lt(0)) err('SIGN', `${tx.type}: el monto debe ser negativo (sale efectivo de la cuenta)`);

  if (tx.qty !== undefined && !tx.qty.gt(0)) err('QTY', 'La cantidad debe ser mayor que 0');
  if (asset?.pricing === 'market' && ['BUY', 'SELL', 'WRITE_OFF'].includes(tx.type) && tx.qty === undefined) {
    err('QTY_REQUIRED', `${asset.name} tiene precio de mercado: indica la cantidad de unidades`);
  }
  if (tx.type === 'VALUATION' && asset?.pricing === 'market') {
    warn('VALUATION_IGNORED', `${asset.name} se valora con precio de mercado; este valor solo se usa si falta el precio`);
  }

  if (issues.some((i) => i.level === 'error')) return issues;

  const others = ledger.filter((t) => replaceId === undefined || t.id !== replaceId);
  if (others.some((t) => sameTx(t, tx))) warn('DUPLICATE', 'Ya existe un movimiento idéntico en esa fecha');

  // Replay with the new transaction: later sales must still be covered, and derived cash should stay ≥ 0.
  const h: Holdings = { asOf: tx.date, positions: new Map(), cash: new Map() };
  let negativeCashOn: IsoDate | undefined;
  for (const t of sortLedger([...others, tx])) {
    try {
      apply(h, t);
    } catch (e) {
      if (!(e instanceof LedgerError)) throw e;
      err(e.tx === tx ? 'OVERSELL' : 'BREAKS_LATER', e.tx === tx ? e.message : `Rompe un movimiento posterior: ${e.message}`);
      return issues;
    }
    if (t.account === tx.account && t.date >= tx.date && !negativeCashOn && (h.cash.get(t.account) ?? ZERO).lt(0)) {
      negativeCashOn = t.date;
    }
  }
  if (negativeCashOn && tx.amount.lt(0) && tx.type !== 'COMMITMENT') {
    warn('NEGATIVE_CASH', `El efectivo calculado de ${account?.name ?? tx.account} queda negativo el ${negativeCashOn}: ¿falta registrar un depósito?`);
  }
  return issues;
}

function sameTx(a: Transaction, b: Transaction): boolean {
  return (
    a.date === b.date &&
    a.account === b.account &&
    a.type === b.type &&
    a.asset === b.asset &&
    a.amount.eq(b.amount) &&
    (a.qty === undefined ? b.qty === undefined : b.qty !== undefined && a.qty.eq(b.qty))
  );
}
