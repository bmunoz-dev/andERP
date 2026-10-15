import type { Obligation } from '@anderp/shared';
import { describe, expect, it } from 'vitest';
import { countAlerts, dueText } from './obligations-api';

const row = (status: Obligation['status']) => ({ status }) as Obligation;

describe('countAlerts (F13 CA-16)', () => {
  it('cuenta vencidas y próximas', () => {
    expect(
      countAlerts([
        row('overdue'),
        row('upcoming'),
        row('upcoming'),
        row('scheduled'),
        row('none'),
      ]),
    ).toEqual({ overdue: 1, upcoming: 2 });
    expect(countAlerts(undefined)).toEqual({ overdue: 0, upcoming: 0 });
  });
});

describe('dueText (F13 CA-18)', () => {
  it.each([
    [0, 'hoy'],
    [1, 'en 1 día'],
    [5, 'en 5 días'],
    [-1, 'hace 1 día'],
    [-3, 'hace 3 días'],
  ])('%i → %s', (days, text) => {
    expect(dueText(days)).toBe(text);
  });
});
