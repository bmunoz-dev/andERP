import { describe, expect, it } from 'vitest';
import {
  airMovementFiltersSchema,
  createAirMovementSchema,
  saveAirOperatorSchema,
  updateAirMovementSchema,
} from './air-accounts';

describe('createAirMovementSchema', () => {
  const issue = {
    type: 'issue',
    movementDate: '2026-10-01',
    pnr: ' k4j2ll ',
    ticketNumber: '1234567890123',
    passenger: 'Ana Pérez',
    netFare: '120000.00',
    taxes: '30000.00',
  };

  it('CA-9 una emisión normaliza el PNR, queda Por cobrar y la descripción vacía es null', () => {
    expect(createAirMovementSchema.parse({ ...issue, description: '  ' })).toMatchObject({
      pnr: 'K4J2LL',
      collectionStatus: 'pending',
      description: null,
    });
  });

  it('CA-9 una emisión exige su tiquete y no acepta monto', () => {
    const { pnr: _, ...noPnr } = issue;
    expect(createAirMovementSchema.safeParse(noPnr).success).toBe(false);
    expect(createAirMovementSchema.safeParse({ ...issue, amount: '1.00' }).success).toBe(false);
    expect(createAirMovementSchema.safeParse({ ...issue, ticketNumber: '123' }).success).toBe(
      false,
    );
  });

  it('CA-7 y CA-10 recarga, pago y reembolso: monto positivo y sin campos de tiquete', () => {
    for (const type of ['recharge', 'payment', 'refund']) {
      const m = { type, movementDate: '2026-10-01', amount: '100.00' };
      expect(createAirMovementSchema.safeParse(m).success).toBe(true);
      expect(createAirMovementSchema.safeParse({ ...m, amount: '-100.00' }).success).toBe(false);
      expect(createAirMovementSchema.safeParse({ ...m, pnr: 'K4J2LL' }).success).toBe(false);
    }
  });

  it('CA-7 el saldo inicial puede ser negativo pero no 0', () => {
    const m = { type: 'opening_balance', movementDate: '2026-10-01' };
    expect(createAirMovementSchema.safeParse({ ...m, amount: '-12400000.00' }).success).toBe(true);
    expect(createAirMovementSchema.safeParse({ ...m, amount: '0.00' }).success).toBe(false);
    expect(createAirMovementSchema.safeParse({ ...m, amount: '-0.00' }).success).toBe(false);
  });
});

describe('updateAirMovementSchema', () => {
  it('CA-12 conserva el tipo para que el trigger lo rechace', () => {
    expect(updateAirMovementSchema.parse({ type: 'payment' })).toEqual({ type: 'payment' });
  });
});

describe('saveAirOperatorSchema', () => {
  it('CA-1 recorta el nombre y exige al menos un carácter', () => {
    expect(saveAirOperatorSchema.parse({ name: '  Satena ' })).toEqual({ name: 'Satena' });
    expect(saveAirOperatorSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('airMovementFiltersSchema', () => {
  it('CA-21 acepta filtros vacíos y rechaza from posterior a to', () => {
    expect(airMovementFiltersSchema.safeParse({}).success).toBe(true);
    expect(
      airMovementFiltersSchema.safeParse({ from: '2026-10-02', to: '2026-10-01' }).success,
    ).toBe(false);
  });
});
