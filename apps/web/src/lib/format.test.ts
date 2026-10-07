import { describe, expect, it } from 'vitest';
import { formatDate, formatMoneyPlain } from './format';

describe('formatDate', () => {
  it('muestra una fecha ISO como dd/mm/aaaa sin desplazarla por la zona horaria', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });

  it('devuelve un guion si no hay fecha', () => {
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatMoneyPlain (para campos de entrada)', () => {
  it.each([
    ['1500000.00', '1.500.000'],
    ['2500000.50', '2.500.000,50'],
    ['0.00', '0'],
  ])('%s → %s', (money, expected) => {
    expect(formatMoneyPlain(money)).toBe(expected);
  });
});
