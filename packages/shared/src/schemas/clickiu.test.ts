import { describe, expect, it } from 'vitest';
import { clickiuFiltersSchema, saveClickiuMovementSchema } from './clickiu';

describe('saveClickiuMovementSchema', () => {
  const sale = { type: 'sale', status: 'credit', movementDate: '2026-10-01', amount: '1500.00' };

  it('acepta una venta y convierte la descripción vacía en null', () => {
    expect(saveClickiuMovementSchema.parse({ ...sale, description: '  ' })).toMatchObject({
      description: null,
    });
  });

  it('rechaza monto 0, tipo desconocido y descripción de más de 500', () => {
    expect(saveClickiuMovementSchema.safeParse({ ...sale, amount: '0.00' }).success).toBe(false);
    expect(saveClickiuMovementSchema.safeParse({ ...sale, type: 'balance' }).success).toBe(false);
    expect(
      saveClickiuMovementSchema.safeParse({ ...sale, description: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

describe('clickiuFiltersSchema', () => {
  it('acepta filtros vacíos y un rango con los bordes iguales', () => {
    expect(clickiuFiltersSchema.safeParse({}).success).toBe(true);
    expect(clickiuFiltersSchema.safeParse({ from: '2026-10-01', to: '2026-10-01' }).success).toBe(
      true,
    );
  });

  it('CA-10 rechaza from posterior a to', () => {
    expect(clickiuFiltersSchema.safeParse({ from: '2026-10-02', to: '2026-10-01' }).success).toBe(
      false,
    );
  });
});
