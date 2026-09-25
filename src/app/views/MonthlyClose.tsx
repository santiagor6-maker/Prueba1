import { useMemo, useState } from 'preact/hooks';
import { monthEnds } from '../../domain/dates.ts';
import { holdingsAt } from '../../domain/holdings.ts';
import { valuationTx, valuationsDue } from '../../domain/monthlyClose.ts';
import type { Transaction } from '../../domain/types.ts';
import { validateTransaction } from '../../domain/validate.ts';
import { bucketLabel } from '../analysis.ts';
import { contextOf } from '../context.ts';
import { date, money, monthLabel, today } from '../format.ts';
import { addTransactions, deleteTransactions } from '../mutations.ts';
import { getDataset, setDataset, useDataset } from '../store.ts';
import { dec } from '../../domain/money.ts';

interface Row {
  account: string;
  asset: string;
  name: string;
  bucket: string;
  ccy: string;
  previous?: { date: string; value: string };
  existing?: Transaction[];
}

export function MonthlyClose() {
  const { data } = useDataset();
  const ctx = contextOf(data);
  const months = useMemo(() => {
    const first = ctx.ledger.reduce((m, t) => (t.date < m ? t.date : m), today());
    return monthEnds(first, today()).reverse();
  }, [ctx]);
  const [month, setMonth] = useState(months[0] ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const [estimated, setEstimated] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ kind: 'err' | 'info'; text: string }>();

  const pending = useMemo(() => months.slice(0, 12).map((m) => ({ m, n: valuationsDue(ctx.ledger, ctx.book.assets, m).length })).filter((x) => x.n > 0), [ctx, months]);

  const rows: Row[] = useMemo(() => {
    if (!month) return [];
    const start = `${month.slice(0, 8)}01`;
    const h = holdingsAt(ctx.ledger.filter((t) => !(t.type === 'VALUATION' && t.date >= start && t.date <= month)), month);
    const out: Row[] = [];
    for (const p of h.positions.values()) {
      const a = ctx.book.assets.get(p.asset);
      if (!p.open || a?.pricing !== 'manual') continue;
      const existing = ctx.ledger.filter((t) => t.type === 'VALUATION' && t.account === p.account && t.asset === p.asset && t.date >= start && t.date <= month);
      out.push({
        account: p.account,
        asset: p.asset,
        name: a.name,
        bucket: a.bucket,
        ccy: ctx.book.accounts.get(p.account)!.ccy,
        previous: p.valuation && { date: p.valuation.date, value: p.valuation.value.toString() },
        existing: existing.length ? existing : undefined,
      });
    }
    return out.sort((x, y) => x.bucket.localeCompare(y.bucket) || x.name.localeCompare(y.name));
  }, [ctx, month]);

  const key = (r: Row) => `${r.account}|${r.asset}`;
  const isEstimated = (r: Row) => estimated[key(r)] ?? r.existing?.[0]?.estimated ?? r.bucket === 'inmobiliario';

  async function save(e: Event) {
    e.preventDefault();
    setMsg(undefined);
    const add: Transaction[] = [];
    const remove: string[] = [];
    for (const r of rows) {
      const raw = (values[key(r)] ?? '').trim();
      if (!raw) continue;
      const norm = /,\d*$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
      let v;
      try {
        v = dec(norm);
      } catch {
        setMsg({ kind: 'err', text: `${r.name}: "${raw}" no es un número` });
        return;
      }
      const tx = valuationTx({ account: r.account, asset: r.asset, name: r.name, date: month }, v, r.ccy, {
        estimated: isEstimated(r),
        note: r.bucket === 'inmobiliario' ? 'precio de lista' : 'valor del extracto al cierre',
      });
      const issues = validateTransaction([], tx, { assets: ctx.book.assets, accounts: ctx.book.accounts, today: today() }).filter((i) => i.level === 'error');
      if (issues.length) {
        setMsg({ kind: 'err', text: `${r.name}: ${issues.map((i) => i.message).join('; ')}` });
        return;
      }
      add.push(tx);
      remove.push(...(r.existing ?? []).map((t) => t.id!).filter(Boolean));
    }
    if (!add.length) {
      setMsg({ kind: 'err', text: 'No escribiste ningún valor' });
      return;
    }
    await setDataset(addTransactions(deleteTransactions(getDataset(), remove), add));
    setValues({});
    setEstimated({});
    setMsg({ kind: 'info', text: `Guardados ${add.length} valores al ${date(month)}.` });
  }

  return (
    <>
      <div class="card">
        <h2>Cierre mensual</h2>
        <p class="small muted">
          Escribe el valor de mercado al último día del mes de los activos sin precio público: copy portfolios de eToro, fondos de Protección e inmuebles. Las acciones se valoran
          solas con su precio de mercado.
        </p>
        {pending.length > 0 && (
          <div class="notice warn">
            Meses con valores pendientes:{' '}
            {pending.map((p, i) => (
              <>
                {i > 0 && ', '}
                <button class="link" type="button" onClick={() => setMonth(p.m)}>
                  {monthLabel(p.m)} ({p.n})
                </button>
              </>
            ))}
          </div>
        )}
        <div class="filters">
          <label>
            Mes
            <select value={month} onChange={(e) => { setMonth((e.target as HTMLSelectElement).value); setValues({}); setMsg(undefined); }}>
              {months.map((m) => (
                <option value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </label>
        </div>
        {msg && <div class={`notice ${msg.kind}`} role="status">{msg.text}</div>}
        {rows.length === 0 ? (
          <p class="muted">No hay activos de valor manual abiertos al {date(month)}.</p>
        ) : (
          <form onSubmit={save}>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Activo</th>
                    <th>Valor anterior</th>
                    <th>Valor al {date(month)}</th>
                    <th>¿Estimado?</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={key(r)}>
                      <td>
                        {r.name}
                        <div class="small muted">
                          {bucketLabel(r.bucket)} · {ctx.book.accounts.get(r.account)?.name}
                        </div>
                      </td>
                      <td class="small">{r.previous ? `${money(dec(r.previous.value), r.ccy)} (${date(r.previous.date)})` : '—'}</td>
                      <td>
                        <input
                          inputMode="decimal"
                          aria-label={`Valor de ${r.name} al ${month}`}
                          placeholder={r.existing ? r.existing[0]!.amount.toString() : r.ccy}
                          value={values[key(r)] ?? ''}
                          onInput={(e) => setValues({ ...values, [key(r)]: (e.target as HTMLInputElement).value })}
                        />
                        {r.existing && <div class="small muted">Ya registrado: {money(r.existing[0]!.amount, r.ccy)} — si escribes otro, lo reemplaza</div>}
                      </td>
                      <td>
                        <label style="display:flex;gap:6px;align-items:center" class="small">
                          <input type="checkbox" checked={isEstimated(r)} onChange={(e) => setEstimated({ ...estimated, [key(r)]: (e.target as HTMLInputElement).checked })} />
                          {r.bucket === 'inmobiliario' ? 'precio de lista' : 'estimado'}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="actions" style="margin-top:12px">
              <button type="submit" class="primary">
                Guardar cierre de {monthLabel(month)}
              </button>
              <span class="small muted">Marca "estimado" si no es el valor de un extracto (p. ej. precio de lista del inmueble).</span>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
