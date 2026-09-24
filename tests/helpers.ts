import { dec } from '../src/domain/money.ts';
import type { Transaction, TxType, Asset, Account } from '../src/domain/types.ts';

export function tx(date: string, account: string, type: TxType, amount: number | string, extra: Partial<Transaction> & { q?: number | string } = {}): Transaction {
  const { q, ...rest } = extra;
  return { date, account, type, amount: dec(amount), ccy: rest.ccy ?? (account.startsWith('cop') ? 'COP' : 'USD'), ...(q !== undefined ? { qty: dec(q) } : {}), ...rest };
}

export const accounts = new Map<string, Account>([
  ['usd', { id: 'usd', name: 'Bróker USD', ccy: 'USD' }],
  ['cop', { id: 'cop', name: 'Bróker COP', ccy: 'COP' }],
  ['cop-prop', { id: 'cop-prop', name: 'Inmueble', ccy: 'COP' }],
]);

export const assets = new Map<string, Asset>([
  ['AAA', { id: 'AAA', name: 'AAA Corp', ccy: 'USD', bucket: 'acciones_usd', pricing: 'market', symbol: 'AAA' }],
  ['EUR1', { id: 'EUR1', name: 'Euro Co', ccy: 'EUR', bucket: 'acciones_usd', pricing: 'market', symbol: 'EUR1' }],
  ['BBB', { id: 'BBB', name: 'BBB SA', ccy: 'COP', bucket: 'acciones_cop', pricing: 'market', symbol: 'BBB' }],
  ['COPY', { id: 'COPY', name: 'Copy portfolio', ccy: 'USD', bucket: 'acciones_usd', pricing: 'manual' }],
  ['FUND', { id: 'FUND', name: 'Fondo', ccy: 'COP', bucket: 'fondos', pricing: 'manual' }],
  ['APTO', { id: 'APTO', name: 'Apartamento sobre planos', ccy: 'COP', bucket: 'inmobiliario', pricing: 'manual' }],
]);
