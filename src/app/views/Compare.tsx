import { useMemo, useState } from 'preact/hooks';
import { analyzeScope, bucketLabel } from '../analysis.ts';
import { contextOf } from '../context.ts';
import { Filters, useFilters } from '../components/Filters.tsx';
import { LineChart } from '../components/LineChart.tsx';
import { date, pct, ratio } from '../format.ts';
import { useDataset } from '../store.ts';

const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

export function Compare() {
  const { data } = useDataset();
  const [f, set] = useFilters();
  const ctx = contextOf(data);
  const buckets = [...new Set(data.assets.map((a) => a.bucket))].filter((b) => data.benchmarks.some((x) => x.buckets.includes(b)));
  const [scope, setScope] = useState<string>(buckets[0] ?? 'total');
  const res = useMemo(() => {
    const benches = ctx.benchmarks.filter((b) => b.buckets.includes(scope)).slice(0, 3);
    return analyzeScope(ctx, scope === 'total' ? { kind: 'total' } : { kind: 'bucket', bucket: scope }, f.ccy, f.asOf, f.window, benches);
  }, [data, scope, f.ccy, f.asOf, f.window]);
  const dates = res.growth.map((g) => g.date);
  const series = [
    { id: 'portfolio', name: scope === 'total' ? 'Mi portafolio' : `Mi portafolio: ${bucketLabel(scope)}`, color: COLORS[0]!, values: res.growth.map((g) => g.portfolio) },
    ...res.benches
      .filter((b) => !b.missing)
      .map((b, i) => ({ id: b.symbol, name: b.name, color: COLORS[i + 1]!, values: res.growth.map((g) => g.benches[b.symbol] ?? null) })),
  ];
  return (
    <>
      <Filters state={f} set={set} />
      <div class="filters">
        <label>
          Comparar
          <select value={scope} onChange={(e) => setScope((e.target as HTMLSelectElement).value)}>
            {buckets.map((b) => (
              <option value={b}>{bucketLabel(b)}</option>
            ))}
            <option value="total">Portafolio total (sin índice)</option>
          </select>
        </label>
      </div>
      {res.error && <div class="notice err">{res.error}</div>}
      <div class="card">
        <h2>Crecimiento de 100 invertidos (TWR, {f.ccy})</h2>
        <p class="small muted">
          Desde {date(res.perf?.since)}. La línea del portafolio usa la rentabilidad ponderada por tiempo, así tus aportes y retiros no la mueven; los índices son de retorno total
          (dividendos reinvertidos).
        </p>
        <LineChart dates={dates} series={series} format={(v) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v)} reference={100} label="Crecimiento de 100 del portafolio frente a los índices" />
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th class="n">TWR anual</th>
                <th class="n">XIRR anual</th>
                <th class="n">KS-PME</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{series[0]!.name}</td>
                <td class="n">{pct(res.perf?.twrAnnual)}</td>
                <td class="n">{pct(res.perf?.xirr)}</td>
                <td class="n"></td>
              </tr>
              {res.benches.map((b) => (
                <tr>
                  <td>{b.name}</td>
                  <td class="n">{b.missing ? <span class="badge warn" title={b.missing}>sin datos</span> : pct(b.annual)}</td>
                  <td class="n"></td>
                  <td class={`n ${b.ksPme === undefined ? '' : b.ksPme >= 1 ? 'pos' : 'neg'}`}>{ratio(b.ksPme)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="small muted" style="margin-top:8px">KS-PME mayor que 1: le ganaste al índice con tus mismas fechas de aportes y retiros.</p>
      </div>
    </>
  );
}
