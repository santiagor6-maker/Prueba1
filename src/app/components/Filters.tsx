import type { ComponentChildren } from 'preact';
import { WINDOWS, customWindow } from '../analysis.ts';
import type { Window } from '../analysis.ts';
import { today } from '../format.ts';
import { coverage } from '../context.ts';
import { usePref, useDataset } from '../store.ts';

export interface FilterState {
  ccy: 'COP' | 'USD';
  asOf: string;
  window: Window;
}

/** Default cut-off: today, or the last day with an exchange rate if the data is older (never value past the data). */
export function defaultAsOf(lastRate: string | undefined): string {
  return lastRate && lastRate < today() ? lastRate : today();
}

/** Shared filters (currency, cut-off date, period), remembered per browser. An unset date follows the data. */
export function useFilters(): [FilterState, (f: Partial<FilterState>) => void] {
  const { data } = useDataset();
  const [ccy, setCcy] = usePref<'COP' | 'USD'>('ccy', 'COP');
  const [asOf, setAsOf] = usePref<string>('asOf', '');
  const [window, setWindow] = usePref<Window>('window', 'all');
  const fallback = defaultAsOf(coverage(data).fx.get('COP'));
  return [
    { ccy, asOf: asOf || fallback, window },
    (f) => {
      if (f.ccy) setCcy(f.ccy);
      if (f.asOf !== undefined) setAsOf(f.asOf === fallback ? '' : f.asOf);
      if (f.window) setWindow(f.window);
    },
  ];
}

export function Filters({ state, set, showWindow = true, children }: { state: FilterState; set: (f: Partial<FilterState>) => void; showWindow?: boolean; children?: ComponentChildren }) {
  return (
    <div class="toolbar">
      <div class="filters">
        {showWindow && (
          <label>
            Periodo
            <select
              value={state.window.startsWith('from:') ? 'custom' : state.window}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                set({ window: v === 'custom' ? customWindow(`${Number(state.asOf.slice(0, 4)) - 1}-12-31`) : (v as Window) });
              }}
            >
              {WINDOWS.map((w) => (
                <option value={w.id}>{w.label}</option>
              ))}
              <option value="custom">Desde una fecha…</option>
            </select>
          </label>
        )}
        {showWindow && state.window.startsWith('from:') && (
          <label>
            Desde
            <input type="date" value={state.window.slice(5)} max={state.asOf} onChange={(e) => (e.target as HTMLInputElement).value && set({ window: customWindow((e.target as HTMLInputElement).value) })} />
          </label>
        )}
        <label>
          Fecha de corte
          <input type="date" value={state.asOf} max={today()} onChange={(e) => set({ asOf: (e.target as HTMLInputElement).value || today() })} />
        </label>
        <div class="field">
          Moneda
          <div class="seg" role="group" aria-label="Moneda">
            {(['COP', 'USD'] as const).map((c) => (
              <button type="button" aria-pressed={state.ccy === c} onClick={() => set({ ccy: c })}>
                {c}
              </button>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
