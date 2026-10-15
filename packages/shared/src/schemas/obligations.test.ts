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
