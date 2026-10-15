import { describe, expect, it } from 'vitest';
import { addMonths } from './calendar-date';

describe('addMonths (F13 CA-20)', () => {
  it.each([
    ['2026-01-15', 3, '2026-04-15'],
    ['2026-01-15', 12, '2027-01-15'],
    ['2026-11-15', 2, '2027-01-15'],
    // Si el día no existe en el mes de destino, el último día de ese mes.
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2028-02-29', 12, '2029-02-28'],
    ['2026-08-31', 6, '2027-02-28'],
  ])('%s + %i meses = %s', (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });
});
