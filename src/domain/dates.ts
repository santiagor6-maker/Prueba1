/** Dates are ISO strings (YYYY-MM-DD). They sort lexicographically in calendar order. */
export type IsoDate = string;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(d: IsoDate): number {
  if (!isIsoDate(d)) throw new Error(`Invalid date: ${d}`);
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

export function isIsoDate(d: string): boolean {
  if (!ISO.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, day));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day;
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return new Date(toUtc(d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function monthEnd(d: IsoDate): IsoDate {
  const [y, m] = d.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Month-end dates in [from, to], inclusive. */
export function monthEnds(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  for (;;) {
    const d = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (d > to) return out;
    if (d >= from) out.push(d);
    m += 1;
    if (m === 13) [y, m] = [y + 1, 1];
  }
}
