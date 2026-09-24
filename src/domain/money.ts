import Decimal from 'decimal.js';

export { Decimal };

/** Currency code: ISO 4217 (COP, USD, EUR…) or a crypto ticker. */
export type Ccy = string;

export const ZERO = new Decimal(0);

export function dec(x: Decimal.Value): Decimal {
  return new Decimal(x);
}

export function sum(xs: Iterable<Decimal>): Decimal {
  let s = ZERO;
  for (const x of xs) s = s.plus(x);
  return s;
}
