import { dec } from '../domain/money.ts';
import { TX_TYPES } from '../domain/types.ts';
import type { Transaction, TxType } from '../domain/types.ts';

/** Ledger CSV columns. Extra columns are ignored on import; blank cells mean "not set". */
export const LEDGER_COLUMNS = ['date', 'account', 'type', 'asset', 'qty', 'amount', 'ccy', 'fee', 'estimated', 'transfer_id', 'note'] as const;

/** RFC 4180 rows: comma-separated, fields may be double-quoted with "" as an escaped quote. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export class CsvError extends Error {}

export function parseLedgerCsv(text: string): Transaction[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  for (const c of ['date', 'account', 'type', 'amount', 'ccy']) {
    if (!col.has(c)) throw new CsvError(`Falta la columna "${c}"`);
  }
  return rows.map((r, n) => {
    const get = (c: string) => {
      const i = col.get(c);
      const v = i === undefined ? '' : (r[i] ?? '').trim();
      return v === '' ? undefined : v;
    };
    const line = n + 2;
    const type = get('type') as TxType;
    if (!TX_TYPES.includes(type)) throw new CsvError(`Línea ${line}: tipo desconocido "${type}"`);
    const num = (c: string) => {
      const v = get(c);
      if (v === undefined) return undefined;
      try {
        return dec(v);
      } catch {
        throw new CsvError(`Línea ${line}: "${c}" no es un número: ${v}`);
      }
    };
    const amount = num('amount');
    if (!amount) throw new CsvError(`Línea ${line}: falta el monto`);
    const tx: Transaction = {
      date: get('date') ?? '',
      account: get('account') ?? '',
      type,
      amount,
      ccy: get('ccy') ?? '',
    };
    const opt = {
      id: get('id'),
      asset: get('asset'),
      qty: num('qty'),
      fee: num('fee'),
      estimated: get('estimated') ? /^(true|1|s[ií]|yes)$/i.test(get('estimated')!) : undefined,
      transferId: get('transfer_id'),
      note: get('note'),
    };
    for (const [k, v] of Object.entries(opt)) if (v !== undefined) (tx as unknown as Record<string, unknown>)[k] = v;
    return tx;
  });
}

function cell(v: unknown): string {
  const s = v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toLedgerCsv(txs: readonly Transaction[]): string {
  const lines = [LEDGER_COLUMNS.join(',')];
  for (const t of txs) {
    lines.push(
      [t.date, t.account, t.type, t.asset, t.qty?.toString(), t.amount.toString(), t.ccy, t.fee?.toString(),
        t.estimated === undefined ? undefined : String(t.estimated), t.transferId, t.note].map(cell).join(','),
    );
  }
  return lines.join('\n') + '\n';
}
