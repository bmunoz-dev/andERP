import { describe, expect, it } from 'vitest';
import { colombianHolidays, easterSunday, isColombianHoliday } from './holidays-co';

// Calendarios oficiales escritos a mano (no derivados del código bajo prueba).
const OFFICIAL: Record<number, string[]> = {
  2025: [
    '2025-01-01',
    '2025-01-06',
    '2025-03-24',
    '2025-04-17',
    '2025-04-18',
    '2025-05-01',
    '2025-06-02',
    '2025-06-23',
    '2025-06-30',
    '2025-07-20',
    '2025-08-07',
    '2025-08-18',
    '2025-10-13',
    '2025-11-03',
    '2025-11-17',
    '2025-12-08',
    '2025-12-25',
  ],
  2026: [
    '2026-01-01',
    '2026-01-12',
    '2026-03-23',
    '2026-04-02',
    '2026-04-03',
    '2026-05-01',
    '2026-05-18',
    '2026-06-08',
    '2026-06-15',
    '2026-06-29',
    '2026-07-20',
    '2026-08-07',
    '2026-08-17',
    '2026-10-12',
    '2026-11-02',
    '2026-11-16',
    '2026-12-08',
    '2026-12-25',
  ],
  2027: [
    '2027-01-01',
    '2027-01-11',
    '2027-03-22',
    '2027-03-25',
    '2027-03-26',
    '2027-05-01',
    '2027-05-10',
    '2027-05-31',
    '2027-06-07',
    '2027-07-05',
    '2027-07-20',
    '2027-08-07',
    '2027-08-16',
    '2027-10-18',
    '2027-11-01',
    '2027-11-15',
    '2027-12-08',
    '2027-12-25',
  ],
};

describe('easterSunday', () => {
  it.each([
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
  ])('%i → %s', (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

describe('colombianHolidays', () => {
  it.each(Object.entries(OFFICIAL))('coincide con el calendario oficial de %s', (year, dates) => {
    expect(colombianHolidays(Number(year)).map((h) => h.date)).toEqual(dates);
  });

  it('une en una sola fecha dos festivos que coinciden (30 de junio de 2025)', () => {
    const june30 = colombianHolidays(2025).find((h) => h.date === '2025-06-30');
    expect(june30?.name.split(' / ').sort()).toEqual(['Sagrado Corazón', 'San Pedro y San Pablo']);
  });

  it('rechaza años anteriores a la Ley 51 de 1983', () => {
    expect(() => colombianHolidays(1983)).toThrow(RangeError);
  });
});

describe('isColombianHoliday', () => {
  it('es verdadero para todas las fechas oficiales', () => {
    for (const dates of Object.values(OFFICIAL)) {
      for (const date of dates) expect(isColombianHoliday(date)).toBe(true);
    }
  });

  it.each(['2026-08-15', '2026-01-06', '2026-06-30', '2026-09-27'])(
    'es falso para %s (día trasladado o día común)',
    (date) => {
      expect(isColombianHoliday(date)).toBe(false);
    },
  );
});
