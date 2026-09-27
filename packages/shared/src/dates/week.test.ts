import { describe, expect, it } from 'vitest';
import { weekOfMonth, weekRange } from './week';

describe('weekOfMonth (formato B: 1–7, 8–14, 15–21, 22–fin)', () => {
  it.each([
    ['2026-02-01', 1],
    ['2026-02-07', 1],
    ['2026-02-08', 2],
    ['2026-02-14', 2],
    ['2026-02-15', 3],
    ['2026-02-21', 3],
    ['2026-02-22', 4],
    ['2026-02-28', 4],
    ['2026-08-31', 4],
    ['2028-02-29', 4],
  ])('%s → semana %i', (date, expected) => {
    expect(weekOfMonth(date)).toBe(expected);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-2-1', '01/02/2026', '', '2026-02-07T00:00:00Z'])(
    'rechaza la fecha inválida %j',
    (date) => {
      expect(() => weekOfMonth(date)).toThrow(RangeError);
    },
  );
});

describe('weekRange', () => {
  it.each([
    [2026, 8, 1, '2026-08-01', '2026-08-07'],
    [2026, 9, 2, '2026-09-08', '2026-09-14'],
    [2026, 9, 3, '2026-09-15', '2026-09-21'],
    [2026, 2, 4, '2026-02-22', '2026-02-28'],
    [2028, 2, 4, '2028-02-22', '2028-02-29'],
    [2026, 9, 4, '2026-09-22', '2026-09-30'],
    [2026, 8, 4, '2026-08-22', '2026-08-31'],
    [2026, 12, 4, '2026-12-22', '2026-12-31'],
  ])('%i-%i semana %i → %s … %s', (year, month, week, start, end) => {
    expect(weekRange(year, month, week)).toEqual({ start, end });
  });

  it.each([
    [2026, 0, 1],
    [2026, 13, 1],
    [2026, 1, 0],
    [2026, 1, 5],
    [2026, 1.5, 1],
  ])('rechaza year=%i month=%i week=%i', (year, month, week) => {
    expect(() => weekRange(year, month, week)).toThrow(RangeError);
  });

  it('toda fecha del rango pertenece a esa semana', () => {
    for (let month = 1; month <= 12; month++) {
      for (let week = 1; week <= 4; week++) {
        const { start, end } = weekRange(2028, month, week);
        expect(weekOfMonth(start)).toBe(week);
        expect(weekOfMonth(end)).toBe(week);
      }
    }
  });
});
