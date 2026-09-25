import { useMemo } from 'preact/hooks';
import { daysBetween } from '../../domain/dates.ts';
import { analyze } from '../analysis.ts';
import type { Report } from '../analysis.ts';
import { contextOf, coverage } from '../context.ts';
import { Filters, useFilters } from '../components/Filters.tsx';
import { Glossary } from '../components/Glossary.tsx';
import { date, money, moneyShort, pct, ratio } from '../format.ts';
import { useDataset } from '../store.ts';
import type { Dataset } from '../../data/json.ts';

const sign = (x: number | undefined | null) => (x === undefined || x === null ? '' : x >= 0 ? 'pos' : 'neg');

export function Summary() {
  const { data } = useDataset();
  const [f, set] = useFilters();
  const rep = useMemo(() => analyze(contextOf(data), f.ccy, f.asOf, f.window), [data, f.ccy, f.asOf, f.window]);
  const t = rep.total;
  const gain = t.perf ? t.perf.endValue.minus(t.perf.startValue).minus(t.perf.netFlows) : undefined;
  return (
    <>
      <Filters state={f} set={set} />
      <DataAlerts rep={rep} data={data} />
      <div class="tiles">
        <div class="tile">
          <div class="label">Valor del portafolio</div>
          <div class="value">{moneyShort(t.value, f.ccy)}</div>
          <div class="sub">{money(t.value, f.ccy)} al {date(f.asOf)}</div>
        </div>
        <div class="tile">
          <div class="label">Tu rentabilidad (XIRR, anual)</div>
          <div class={`value ${sign(t.perf?.xirr)}`}>{pct(t.perf?.xirr)}</div>
          <div class="sub">Ponderada por dinero: incluye cuándo aportaste y retiraste</div>
        </div>
        <div class="tile">
          <div class="label">Rentabilidad de la inversión (TWR, anual)</div>
          <div class={`value ${sign(t.perf?.twrAnnual)}`}>{pct(t.perf?.twrAnnual)}</div>
          <div class="sub">Ponderada por tiempo · acumulada {pct(t.perf?.twr)} desde {date(t.perf?.since)}</div>
        </div>
        <div class="tile">
          <div class="label">Ganancia en el periodo</div>
          <div class={`value ${sign(gain?.toNumber())}`}>{gain ? moneyShort(gain, f.ccy) : '—'}</div>
          <div class="sub">Aportes netos {t.perf ? moneyShort(t.perf.netFlows, f.ccy) : '—'} · efectivo en cuentas {moneyShort(rep.cash, f.ccy)}</div>
        </div>
      </div>

      <div class="card">
        <h2>Por clase de activo</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Clase / índice de comparación</th>
                <th class="n">Valor</th>
                <th class="n">Peso</th>
                <th class="n">XIRR anual</th>
                <th class="n">TWR anual</th>
                <th class="n">KS-PME</th>
                <th class="n">No realizada</th>
                <th class="n">Realizada</th>
                <th class="n">Dividendos</th>
              </tr>
            </thead>
            <tbody>
              {rep.buckets.map((b) => (
                <>
                  <tr key={b.bucket}>
                    <td>
                      <a href={`#/activos?clase=${b.bucket}`}>{b.label}</a>
                      {b.error && <div class="badge err" title={b.error}>error de datos</div>}
                    </td>
                    <td class="n">{money(b.value, f.ccy)}</td>
                    <td class="n">{pct(b.weight)}</td>
                    <td class={`n ${sign(b.perf?.xirr)}`}>{pct(b.perf?.xirr)}</td>
                    <td class={`n ${b.leveraged ? '' : sign(b.perf?.twrAnnual)}`} title={b.leveraged ? 'No comparable: pagos a plazos sobre una base pequeña (apalancado)' : undefined}>
                      {b.leveraged ? 'n. c.*' : pct(b.perf?.twrAnnual)}
                    </td>
                    <td class="n"></td>
                    <td class={`n ${sign(b.unrealized.toNumber())}`}>{money(b.unrealized, f.ccy)}</td>
                    <td class={`n ${sign(b.realized.toNumber())}`}>{money(b.realized, f.ccy)}</td>
                    <td class="n">{money(b.income, f.ccy)}</td>
                  </tr>
                  {b.benches.map((x) => (
                    <tr class="sub" key={b.bucket + x.symbol}>
                      <td>vs {x.name}</td>
                      <td class="n"></td>
                      <td class="n"></td>
                      <td class="n"></td>
                      <td class="n">{x.missing ? <span class="badge warn" title={x.missing}>sin datos</span> : pct(x.annual)}</td>
                      <td class={`n ${x.ksPme === undefined ? '' : x.ksPme >= 1 ? 'pos' : 'neg'}`}>{ratio(x.ksPme)}</td>
                      <td class="n" colSpan={3}></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total (con efectivo)</td>
                <td class="n">{money(t.value, f.ccy)}</td>
                <td class="n">100 %</td>
                <td class={`n ${sign(t.perf?.xirr)}`}>{pct(t.perf?.xirr)}</td>
                <td class={`n ${sign(t.perf?.twrAnnual)}`}>{pct(t.perf?.twrAnnual)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="small muted" style="margin-top:8px">
          Periodo por clase: desde su primer movimiento dentro del periodo elegido. Realizada y dividendos: acumulados hasta la fecha de corte, cada uno a la tasa de su fecha.
          {rep.buckets.some((b) => b.leveraged) && ' *n. c.: el TWR de un inmueble sobre planos no es comparable porque se paga a plazos sobre una base pequeña; mira la XIRR y la valorización del precio de lista en Activos.'}
        </p>
      </div>
      <Glossary />
    </>
  );
}

function DataAlerts({ rep, data }: { rep: Report; data: Dataset }) {
  const cov = coverage(data);
  const staleManual = rep.positions.filter((p) => p.open && p.method === 'manual' && p.priceDate && daysBetween(p.priceDate, rep.asOf) > 35);
  const atCost = rep.positions.filter((p) => p.open && p.method === 'cost');
  const oldPrices = rep.positions.filter((p) => p.open && p.method === 'market' && (p.priceAgeDays ?? 0) > 5);
  const lastTrm = cov.fx.get('COP');
  const errors = [rep.error, rep.total.error].filter(Boolean) as string[];
  return (
    <>
      {errors.map((e) => (
        <div class="notice err">{e}</div>
      ))}
      {(staleManual.length > 0 || atCost.length > 0 || oldPrices.length > 0 || (lastTrm && daysBetween(lastTrm, rep.asOf) > 5)) && (
        <div class="notice warn" role="status">
          <strong>Datos por actualizar</strong>
          <ul>
            {staleManual.length > 0 && (
              <li>
                Valores manuales viejos: {staleManual.map((p) => `${p.name} (${date(p.priceDate)})`).join(', ')}. <a href="#/cierre">Registrar cierre mensual</a>.
              </li>
            )}
            {atCost.length > 0 && <li>Sin precio ni valor manual, se muestran al costo: {atCost.map((p) => p.name).join(', ')}.</li>}
            {oldPrices.length > 0 && <li>Precios de mercado con más de 5 días: {oldPrices.map((p) => `${p.name} (${date(p.priceDate)})`).join(', ')}.</li>}
            {lastTrm && daysBetween(lastTrm, rep.asOf) > 5 && <li>Última TRM cargada: {date(lastTrm)}.</li>}
          </ul>
        </div>
      )}
    </>
  );
}
