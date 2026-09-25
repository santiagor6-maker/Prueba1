import { useMemo, useState } from 'preact/hooks';
import { LedgerError, holdingsAt } from '../../domain/holdings.ts';
import { sortLedger } from '../../domain/ledger.ts';
import type { Transaction } from '../../domain/types.ts';
import { contextOf } from '../context.ts';
import { date, money, num } from '../format.ts';
import { TYPE_LABELS } from '../labels.ts';
import { deleteTransactions } from '../mutations.ts';
import { getDataset, setDataset, useDataset } from '../store.ts';
import { TxForm } from './TxForm.tsx';

const PAGE = 150;

export function Transactions() {
  const { data } = useDataset();
  const ctx = contextOf(data);
  const [form, setForm] = useState<{ editing?: Transaction } | null>(null);
  const [account, setAccount] = useState('');
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [year, setYear] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string>();

  const years = useMemo(() => [...new Set(ctx.ledger.map((t) => t.date.slice(0, 4)))].sort().reverse(), [ctx]);
  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    return sortLedger(ctx.ledger)
      .reverse()
      .filter(
        (t) =>
          (!account || t.account === account) &&
          (!type || t.type === type) &&
          (!year || t.date.startsWith(year)) &&
          (!q || `${t.asset ?? ''} ${ctx.book.assets.get(t.asset ?? '')?.name ?? ''} ${t.note ?? ''}`.toLowerCase().includes(q)),
      );
  }, [ctx, account, type, text, year]);

  async function remove(t: Transaction) {
    setError(undefined);
    if (!t.id) return;
    const rest = ctx.ledger.filter((x) => x.id !== t.id);
    try {
      holdingsAt(rest, '9999-12-31');
    } catch (e) {
      if (e instanceof LedgerError) {
        setError(`No se puede eliminar: ${e.message}. Elimina o corrige primero ese movimiento.`);
        return;
      }
      throw e;
    }
    const label = `${TYPE_LABELS[t.type]} ${t.asset ?? ''} del ${date(t.date)} por ${money(t.amount, t.ccy)}`;
    if (!confirm(`¿Eliminar ${label}?`)) return;
    await setDataset(deleteTransactions(getDataset(), [t.id]));
  }

  return (
    <>
      {form ? (
        <TxForm editing={form.editing} onDone={() => setForm(null)} />
      ) : (
        <div class="actions" style="margin-bottom:16px">
          <button class="primary" onClick={() => setForm({})}>
            + Registrar movimiento
          </button>
          <span class="small muted">Compras, ventas, dividendos, depósitos, retiros y transferencias.</span>
        </div>
      )}
      {error && <div class="notice err">{error}</div>}
      <div class="filters">
        <label>
          Cuenta
          <select value={account} onChange={(e) => setAccount((e.target as HTMLSelectElement).value)}>
            <option value="">Todas</option>
            {data.accounts.map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value)}>
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Año
          <select value={year} onChange={(e) => setYear((e.target as HTMLSelectElement).value)}>
            <option value="">Todos</option>
            {years.map((y) => (
              <option value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Buscar activo o nota
          <input type="search" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="card">
        <p class="small muted">{rows.length} movimientos</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Activo</th>
                <th>Cuenta</th>
                <th class="n">Cantidad</th>
                <th class="n">Monto</th>
                <th>Nota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((t) => (
                <tr key={t.id}>
                  <td style="white-space:nowrap">{date(t.date)}</td>
                  <td>
                    {TYPE_LABELS[t.type]} {t.estimated && <span class="badge warn">estimado</span>}
                  </td>
                  <td>{t.asset ? ctx.book.assets.get(t.asset)?.name ?? t.asset : ''}</td>
                  <td>{ctx.book.accounts.get(t.account)?.name ?? t.account}</td>
                  <td class="n">{t.qty ? num(t.qty) : ''}</td>
                  <td class={`n ${t.type === 'VALUATION' || t.type === 'COMMITMENT' ? 'muted' : ''}`}>{money(t.amount, t.ccy)}</td>
                  <td class="small">{t.note}</td>
                  <td>
                    <div class="row-actions">
                      <button class="link" onClick={() => { setForm({ editing: t }); scrollTo(0, 0); }} aria-label={`Editar ${TYPE_LABELS[t.type]} del ${t.date}`}>
                        Editar
                      </button>
                      <button class="link danger" onClick={() => remove(t)} aria-label={`Eliminar ${TYPE_LABELS[t.type]} del ${t.date}`}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <button style="margin-top:8px" onClick={() => setLimit(limit + PAGE)}>
            Ver más ({rows.length - limit} restantes)
          </button>
        )}
        <p class="small muted" style="margin-top:8px">Montos con signo: negativo = sale efectivo de la cuenta. Valores de mercado y compromisos no mueven efectivo (en gris).</p>
      </div>
    </>
  );
}
