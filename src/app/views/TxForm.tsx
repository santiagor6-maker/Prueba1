import { useMemo, useState } from 'preact/hooks';
import { holdingsAt } from '../../domain/holdings.ts';
import { positionKey } from '../../domain/ledger.ts';
import { dec } from '../../domain/money.ts';
import type { Decimal } from '../../domain/money.ts';
import type { Asset, Transaction, TxType } from '../../domain/types.ts';
import { validateTransaction } from '../../domain/validate.ts';
import type { Issue } from '../../domain/validate.ts';
import { bucketLabel } from '../analysis.ts';
import { contextOf } from '../context.ts';
import { money, num, today } from '../format.ts';
import { TYPE_LABELS } from '../labels.ts';
import { addTransactions, newId, replaceTransactions, upsertAsset } from '../mutations.ts';
import { getDataset, setDataset, useDataset } from '../store.ts';

type Kind = TxType | 'TRANSFER';
const CREATE_KINDS: Kind[] = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'INTEREST', 'FEE', 'TAX', 'WRITE_OFF', 'CAPITAL_CALL', 'COMMITMENT', 'VALUATION'];
const WITH_ASSET = new Set<Kind>(['BUY', 'SELL', 'DIVIDEND', 'WRITE_OFF', 'CAPITAL_CALL', 'COMMITMENT', 'VALUATION']);
const WITH_QTY = new Set<Kind>(['BUY', 'SELL', 'WRITE_OFF']);
const NEGATIVE = new Set<Kind>(['BUY', 'WITHDRAWAL', 'TRANSFER_OUT', 'FEE', 'TAX', 'CAPITAL_CALL', 'COMMITMENT']);
const NEW = '__new__';

const AMOUNT_LABEL: Partial<Record<Kind, string>> = {
  BUY: 'Total pagado (incluye comisión)',
  SELL: 'Total recibido (neto de comisión)',
  DIVIDEND: 'Dividendo neto recibido',
  VALUATION: 'Valor de mercado a la fecha',
  COMMITMENT: 'Precio total del contrato',
  CAPITAL_CALL: 'Valor pagado',
  TRANSFER: 'Monto que sale',
};

interface Draft {
  kind: Kind;
  date: string;
  account: string;
  asset: string;
  qty: string;
  amount: string;
  fee: string;
  note: string;
  estimated: boolean;
  toBank: boolean;
  external: boolean;
  toAccount: string;
  amountIn: string;
  newAsset: Asset;
}

function parseNum(s: string): Decimal | undefined {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return undefined;
  // Accept "1.234.567,89" (es-CO) and "1234567.89".
  const norm = /,\d*$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  try {
    return dec(norm);
  } catch {
    return undefined;
  }
}

export function TxForm({ editing, onDone }: { editing?: Transaction; onDone: () => void }) {
  const { data } = useDataset();
  const ctx = contextOf(data);
  const accounts = data.accounts;
  const [d, setD] = useState<Draft>(() => ({
    kind: editing?.type ?? 'BUY',
    date: editing?.date ?? today(),
    account: editing?.account ?? accounts[0]?.id ?? '',
    asset: editing?.asset ?? '',
    qty: editing?.qty?.toString() ?? '',
    amount: editing ? editing.amount.abs().toString() : '',
    fee: editing?.fee?.toString() ?? '',
    note: editing?.note ?? '',
    estimated: editing?.estimated ?? false,
    toBank: true,
    external: true,
    toAccount: accounts[1]?.id ?? '',
    amountIn: '',
    newAsset: { id: '', name: '', ccy: 'USD', bucket: 'acciones_usd', pricing: 'market', symbol: '' },
  }));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [confirmWarnings, setConfirmWarnings] = useState(false);
  const up = (p: Partial<Draft>) => {
    setD({ ...d, ...p });
    setIssues([]);
    setConfirmWarnings(false);
  };

  const account = data.accounts.find((a) => a.id === d.account);
  const buckets = [...new Set(['acciones_cop', 'acciones_usd', 'cripto', 'fondos', 'inmobiliario', 'renta_fija', ...data.assets.map((a) => a.bucket)])];
  const held = useMemo(() => {
    try {
      return holdingsAt(ctx.ledger.filter((t) => t.id !== editing?.id), d.date);
    } catch {
      return undefined;
    }
  }, [ctx, d.date, editing?.id]);
  const inAccount = (openOnly: boolean) =>
    data.assets.filter((a) => {
      const p = held?.positions.get(positionKey(d.account, a.id));
      return p && (!openOnly || p.open);
    });
  const assetChoices = editing || d.kind === 'BUY' || d.kind === 'COMMITMENT' ? data.assets : inAccount(d.kind !== 'DIVIDEND');
  const pos = d.asset && held ? held.positions.get(positionKey(d.account, d.asset)) : undefined;
  const ccy = account?.ccy ?? '';
  const defaultEstimated = (assetId: string) => data.assets.find((a) => a.id === assetId)?.bucket === 'inmobiliario';

  function build(): { txs: Transaction[]; asset?: Asset } | string {
    if (!account) return 'Elige una cuenta';
    const amount = parseNum(d.amount);
    if (amount === undefined) return 'Escribe el monto';
    const signed = NEGATIVE.has(d.kind) ? amount.abs().neg() : d.kind === 'WRITE_OFF' ? dec(0) : amount.abs();
    let asset: Asset | undefined;
    let assetId = d.asset || undefined;
    if (WITH_ASSET.has(d.kind)) {
      if (d.asset === NEW) {
        const a = d.newAsset;
        if (!a.id.trim() || !a.name.trim()) return 'Escribe código y nombre del activo nuevo';
        if (data.assets.some((x) => x.id === a.id.trim())) return `Ya existe un activo con código ${a.id}`;
        asset = { ...a, id: a.id.trim(), name: a.name.trim(), symbol: a.pricing === 'market' ? a.symbol?.trim() || a.id.trim() : undefined };
        assetId = asset.id;
      }
      if (!assetId) return 'Elige el activo';
    }
    const qty = WITH_QTY.has(d.kind) ? parseNum(d.qty) : undefined;
    const fee = parseNum(d.fee);
    const base = { date: d.date, account: d.account, ccy, note: d.note.trim() || undefined, estimated: d.estimated || undefined };
    if (d.kind === 'TRANSFER') {
      const to = data.accounts.find((a) => a.id === d.toAccount);
      const amountIn = parseNum(d.amountIn);
      if (!to || to.id === account.id) return 'Elige una cuenta de destino distinta';
      if (amountIn === undefined) return 'Escribe el monto que llega a la cuenta destino';
      const transferId = newId();
      return {
        txs: [
          { ...base, type: 'TRANSFER_OUT', amount: amount.abs().neg(), transferId },
          { ...base, account: to.id, ccy: to.ccy, type: 'TRANSFER_IN', amount: amountIn.abs(), transferId },
        ],
      };
    }
    const tx: Transaction = { ...base, id: editing?.id, type: d.kind, amount: signed, asset: assetId, ...(qty ? { qty } : {}), ...(fee ? { fee } : {}) };
    const txs = [tx];
    if (!editing && d.kind === 'DIVIDEND' && d.toBank) {
      txs.push({ ...base, type: 'WITHDRAWAL', amount: amount.abs().neg(), note: 'dividendo pagado a la cuenta bancaria' });
    }
    if (!editing && d.kind === 'CAPITAL_CALL' && d.external) {
      txs.unshift({ ...base, type: 'DEPOSIT', amount: amount.abs(), note: 'aporte para cuota del inmueble' });
    }
    return { txs, asset };
  }

  async function submit(e: Event) {
    e.preventDefault();
    const b = build();
    if (typeof b === 'string') {
      setIssues([{ level: 'error', code: 'FORM', message: b }]);
      return;
    }
    const assets = new Map(ctx.book.assets);
    if (b.asset) assets.set(b.asset.id, b.asset);
    const ref = { assets, accounts: ctx.book.accounts, today: today() };
    let ledger = ctx.ledger.filter((t) => !editing || t.id !== editing.id);
    const found: Issue[] = [];
    for (const tx of b.txs) {
      found.push(...validateTransaction(ledger, tx, ref));
      ledger = [...ledger, tx];
    }
    const errors = found.filter((i) => i.level === 'error');
    if (errors.length || (found.length && !confirmWarnings)) {
      setIssues(found);
      setConfirmWarnings(!errors.length);
      return;
    }
    let next = getDataset();
    if (b.asset) next = upsertAsset(next, b.asset);
    next = editing?.id ? replaceTransactions(next, [editing.id], b.txs) : addTransactions(next, b.txs);
    await setDataset(next);
    onDone();
  }

  const kinds: Kind[] = editing ? [editing.type] : CREATE_KINDS;
  return (
    <form class="card" onSubmit={submit} aria-label={editing ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <h2>{editing ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
      <div class="form-grid">
        <label class="field">
          Tipo
          <select value={d.kind} disabled={!!editing} onChange={(e) => up({ kind: (e.target as HTMLSelectElement).value as Kind, asset: '' })}>
            {kinds.map((k) => (
              <option value={k}>{k === 'TRANSFER' ? 'Transferencia entre cuentas' : TYPE_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label class="field">
          Fecha
          <input type="date" required value={d.date} max={today()} onInput={(e) => up({ date: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="field">
          {d.kind === 'TRANSFER' ? 'Cuenta origen' : 'Cuenta'}
          <select value={d.account} onChange={(e) => up({ account: (e.target as HTMLSelectElement).value, asset: '' })}>
            {accounts.map((a) => (
              <option value={a.id}>
                {a.name} ({a.ccy})
              </option>
            ))}
          </select>
        </label>
        {WITH_ASSET.has(d.kind) && (
          <label class="field">
            Activo
            <select
              value={d.asset}
              required
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                up({ asset: v, estimated: d.kind === 'VALUATION' ? defaultEstimated(v) : d.estimated });
              }}
            >
              <option value="">— elige —</option>
              {assetChoices.map((a) => (
                <option value={a.id}>
                  {a.name} ({a.id})
                </option>
              ))}
              {d.kind === 'BUY' && <option value={NEW}>+ Activo nuevo…</option>}
            </select>
          </label>
        )}
      </div>

      {d.asset === NEW && (
        <fieldset class="card" style="background:var(--surface-2)">
          <legend>Activo nuevo</legend>
          <div class="form-grid">
            <label class="field">
              Código
              <input value={d.newAsset.id} placeholder="p. ej. MSFT" onInput={(e) => up({ newAsset: { ...d.newAsset, id: (e.target as HTMLInputElement).value.toUpperCase() } })} />
            </label>
            <label class="field">
              Nombre
              <input value={d.newAsset.name} placeholder="Microsoft" onInput={(e) => up({ newAsset: { ...d.newAsset, name: (e.target as HTMLInputElement).value } })} />
            </label>
            <label class="field">
              Clase
              <select value={d.newAsset.bucket} onChange={(e) => up({ newAsset: { ...d.newAsset, bucket: (e.target as HTMLSelectElement).value } })}>
                {buckets.map((b) => (
                  <option value={b}>{bucketLabel(b)}</option>
                ))}
              </select>
            </label>
            <label class="field">
              Moneda de cotización
              <input value={d.newAsset.ccy} maxLength={4} onInput={(e) => up({ newAsset: { ...d.newAsset, ccy: (e.target as HTMLInputElement).value.toUpperCase() } })} />
            </label>
            <label class="field">
              Precio
              <select value={d.newAsset.pricing} onChange={(e) => up({ newAsset: { ...d.newAsset, pricing: (e.target as HTMLSelectElement).value as Asset['pricing'] } })}>
                <option value="market">De mercado (cotiza en bolsa)</option>
                <option value="manual">Manual en cada cierre (copy portfolio, fondo, inmueble)</option>
              </select>
            </label>
            {d.newAsset.pricing === 'market' && (
              <label class="field">
                Símbolo de cotización
                <input value={d.newAsset.symbol ?? ''} placeholder="MSFT, CSPX.L, PFCIBEST.CL" onInput={(e) => up({ newAsset: { ...d.newAsset, symbol: (e.target as HTMLInputElement).value.toUpperCase() } })} />
              </label>
            )}
          </div>
        </fieldset>
      )}

      <div class="form-grid">
        {WITH_QTY.has(d.kind) && (
          <label class="field">
            Cantidad (unidades)
            <input inputMode="decimal" value={d.qty} onInput={(e) => up({ qty: (e.target as HTMLInputElement).value })} />
            {pos?.open && d.kind !== 'BUY' && <span class="small muted">Tienes {num(pos.qty)} a esa fecha</span>}
          </label>
        )}
        {d.kind !== 'WRITE_OFF' && (
          <label class="field">
            {AMOUNT_LABEL[d.kind] ?? 'Monto'} ({ccy})
            <input inputMode="decimal" required value={d.amount} onInput={(e) => up({ amount: (e.target as HTMLInputElement).value })} />
            {d.kind === 'SELL' && pos?.open && !pos.qty.isZero() && (
              <span class="small muted">Costo promedio: {money(pos.cost.div(pos.qty), ccy, 4)} por unidad</span>
            )}
          </label>
        )}
        {(d.kind === 'BUY' || d.kind === 'SELL') && (
          <label class="field">
            Comisión incluida ({ccy}, opcional)
            <input inputMode="decimal" value={d.fee} onInput={(e) => up({ fee: (e.target as HTMLInputElement).value })} />
          </label>
        )}
        {d.kind === 'TRANSFER' && (
          <>
            <label class="field">
              Cuenta destino
              <select value={d.toAccount} onChange={(e) => up({ toAccount: (e.target as HTMLSelectElement).value })}>
                {accounts.map((a) => (
                  <option value={a.id}>
                    {a.name} ({a.ccy})
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              Monto que llega ({data.accounts.find((a) => a.id === d.toAccount)?.ccy})
              <input inputMode="decimal" value={d.amountIn} onInput={(e) => up({ amountIn: (e.target as HTMLInputElement).value })} />
            </label>
          </>
        )}
        <label class="field" style="grid-column: 1 / -1">
          Nota (opcional)
          <input value={d.note} onInput={(e) => up({ note: (e.target as HTMLInputElement).value })} />
        </label>
      </div>
      <div class="actions" style="margin-bottom:12px">
        {!editing && d.kind === 'DIVIDEND' && (
          <label style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" checked={d.toBank} onChange={(e) => up({ toBank: (e.target as HTMLInputElement).checked })} />
            Se pagó a mi cuenta bancaria (sale del portafolio)
          </label>
        )}
        {!editing && d.kind === 'CAPITAL_CALL' && (
          <label style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" checked={d.external} onChange={(e) => up({ external: (e.target as HTMLInputElement).checked })} />
            El dinero vino de fuera del portafolio (registrar el aporte)
          </label>
        )}
        <label style="display:flex;gap:6px;align-items:center">
          <input type="checkbox" checked={d.estimated} onChange={(e) => up({ estimated: (e.target as HTMLInputElement).checked })} />
          Es un dato estimado
        </label>
      </div>
      {issues.length > 0 && (
        <div class={`notice ${issues.some((i) => i.level === 'error') ? 'err' : 'warn'}`} role="alert">
          <ul>
            {issues.map((i) => (
              <li>{i.message}</li>
            ))}
          </ul>
          {confirmWarnings && <p style="margin:6px 0 0">Revisa las advertencias y vuelve a guardar para confirmar.</p>}
        </div>
      )}
      <div class="actions">
        <button type="submit" class="primary">
          {confirmWarnings ? 'Guardar de todos modos' : 'Guardar'}
        </button>
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
