import { describe, expect, it } from 'vitest';
import { dec } from '../src/domain/money.ts';
import { indexReturn, ksPme, pme } from '../src/domain/benchmark.ts';

const levels: Record<string, number> = { '2023-01-01': 100, '2024-01-01': 120, '2025-01-01': 150 };
const level = (d: string) => dec(levels[d]!);
const f = (date: string, amount: number) => ({ date, amount: dec(amount) });

describe('KS-PME', () => {
  it('equals 1 for a portfolio that tracks the index', () => {
    // 1000 at 100 and 1200 at 120 → 20 index units → NAV 3000 at 150
    expect(ksPme([f('2023-01-01', 1000), f('2024-01-01', 1200)], dec(3000), '2025-01-01', level)).toBeCloseTo(1, 12);
  });

  it('hand case with a distribution', () => {
    // contributions 1000 × 150/100 = 1500; distribution 500 × 150/120 = 625; (625 + 800) / 1500
    expect(ksPme([f('2023-01-01', 1000), f('2024-01-01', -500)], dec(800), '2025-01-01', level)).toBeCloseTo(0.95, 12);
  });
});

describe('PME', () => {
  it('buys and sells index units with the same flows', () => {
    // units 1000/100 − 500/120 = 5.8333…; value × 150 = 875
    const r = pme([f('2023-01-01', 1000), f('2024-01-01', -500)], '2025-01-01', level);
    expect(r.endValue.toNumber()).toBeCloseTo(875, 9);
  });

  it('PME XIRR equals the index return for a single contribution', () => {
    const r = pme([f('2023-01-01', 1000)], '2025-01-01', level);
    expect(r.xirr).toBeCloseTo(1.5 ** (365 / 731) - 1, 8);
    expect(indexReturn(level, '2023-01-01', '2025-01-01')).toBeCloseTo(0.5, 12);
  });
});
