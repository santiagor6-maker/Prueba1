import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './styles.css';
import { useDataset } from './store.ts';
import { Summary } from './views/Summary.tsx';
import { Positions } from './views/Positions.tsx';
import { Transactions } from './views/Transactions.tsx';
import { MonthlyClose } from './views/MonthlyClose.tsx';
import { Compare } from './views/Compare.tsx';
import { DataView } from './views/Data.tsx';

const ROUTES = [
  { id: 'resumen', label: 'Resumen', view: Summary },
  { id: 'activos', label: 'Activos', view: Positions },
  { id: 'comparacion', label: 'Comparación', view: Compare },
  { id: 'movimientos', label: 'Movimientos', view: Transactions },
  { id: 'cierre', label: 'Cierre mensual', view: MonthlyClose },
  { id: 'datos', label: 'Datos', view: DataView },
] as const;

function useRoute(): string {
  const get = () => location.hash.replace(/^#\/?/, '').split('?')[0] || '';
  const [r, setR] = useState(get);
  useEffect(() => {
    const on = () => setR(get());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

function App() {
  const { data, loaded, storageError } = useDataset();
  const route = useRoute();
  if (!loaded) return <main class="muted">Cargando…</main>;
  const empty = data.ledger.length === 0;
  const current = ROUTES.find((r) => r.id === route) ?? (empty ? ROUTES[5] : ROUTES[0]);
  const View = current.view;
  return (
    <>
      <header class="top">
        <div class="bar">
          <h1>Mis inversiones</h1>
          <nav class="tabs" aria-label="Secciones">
            {ROUTES.map((r) => (
              <a href={`#/${r.id}`} aria-current={r.id === current.id ? 'page' : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {storageError && <div class="notice err">{storageError}</div>}
        {empty && current.id !== 'datos' ? (
          <div class="card">
            <p>Todavía no hay movimientos. Ve a <a href="#/datos">Datos</a> para importar tu respaldo o cargar el portafolio de demostración.</p>
          </div>
        ) : (
          <View />
        )}
      </main>
    </>
  );
}

render(<App />, document.getElementById('app')!);
