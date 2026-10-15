import { describe, expect, it } from 'vitest';
import { completeDueDateSchema, createObligationSchema, FREQUENCY_MONTHS } from './obligations';

describe('createObligationSchema', () => {
  const base = {
    entityName: ' DIAN ',
    concept: 'IVA bimestral',
    frequency: 'bimonthly',
    firstDueDate: '2026-11-12',
  };

  it('recorta textos y pone 15 días de aviso por defecto', () => {
    expect(createObligationSchema.parse(base)).toMatchObject({
      entityName: 'DIAN',
      noticeDays: 15,
    });
  });

  it('rechaza entidad vacía, días de aviso fuera de 0–365 y periodicidad desconocida', () => {
    expect(createObligationSchema.safeParse({ ...base, entityName: '  ' }).success).toBe(false);
    expect(createObligationSchema.safeParse({ ...base, noticeDays: 366 }).success).toBe(false);
    expect(createObligationSchema.safeParse({ ...base, noticeDays: 1.5 }).success).toBe(false);
    expect(createObligationSchema.safeParse({ ...base, frequency: 'weekly' }).success).toBe(false);
  });

  it('días de aviso: vacío, decimales o fuera de rango dan mensajes en español', () => {
    const message = (noticeDays: number) =>
      createObligationSchema.safeParse({ ...base, noticeDays }).error?.issues[0]?.message;
    expect(message(Number.NaN)).toBe('Indica los días de aviso');
    expect(message(1.5)).toBe('Debe ser un número entero');
    expect(message(-1)).toBe('Debe estar entre 0 y 365');
    expect(message(366)).toBe('Debe estar entre 0 y 365');
  });
});

describe('completeDueDateSchema', () => {
  it('exige el vencimiento y deja opcional el siguiente', () => {
    const dueDateId = '11111111-1111-4111-8111-111111111111';
    expect(completeDueDateSchema.safeParse({ dueDateId }).success).toBe(true);
    expect(completeDueDateSchema.safeParse({ nextDueDate: '2026-12-01' }).success).toBe(false);
  });
});

it('FREQUENCY_MONTHS: la única no tiene periodo', () => {
  expect(FREQUENCY_MONTHS).toEqual({
    monthly: 1,
    bimonthly: 2,
    quarterly: 3,
    semiannual: 6,
    annual: 12,
  });
});
