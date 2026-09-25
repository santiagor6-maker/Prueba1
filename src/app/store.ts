import { useEffect, useState } from 'preact/hooks';
import { emptyDataset } from '../data/json.ts';
import type { Dataset } from '../data/json.ts';

/**
 * The whole dataset lives in the browser's IndexedDB (one record), so it never leaves this device.
 * Every change replaces the dataset object: identity changes drive recomputation.
 */
const DB = 'investment-tracker';
const STORE = 'kv';
const KEY = 'dataset';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<Dataset | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as Dataset | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function write(d: Dataset): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(d, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let current: Dataset = emptyDataset();
let loaded = false;
let storageError: string | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const ready: Promise<void> = read()
  .then((d) => {
    if (d) current = { ...emptyDataset(), ...d };
  })
  .catch((e) => {
    storageError = `No se pudo abrir el almacenamiento del navegador: ${e}. Los cambios no se guardarán.`;
  })
  .finally(() => {
    loaded = true;
    notify();
  });

export function getDataset(): Dataset {
  return current;
}

export async function setDataset(next: Dataset): Promise<void> {
  current = next;
  notify();
  try {
    await write(next);
    storageError = undefined;
  } catch (e) {
    storageError = `No se pudo guardar en el navegador: ${e}`;
  }
  notify();
}

export function useDataset(): { data: Dataset; loaded: boolean; storageError?: string } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    l(); // catch up on any change (e.g. the initial load) that happened before subscribing
    return () => listeners.delete(l);
  }, []);
  return { data: current, loaded, storageError };
}

/** Per-viewer UI preferences (currency, window…). Best effort: private windows may block storage. */
export function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(`pref:${key}`) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  return [
    v,
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(`pref:${key}`, nv);
      } catch {
        /* ignore */
      }
    },
  ];
}
