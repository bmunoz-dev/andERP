import { describe, expect, it } from 'vitest';
import { mapPostgresError } from './pg-error.mapper';

function pgError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error((extra.message as string | undefined) ?? 'db error'), {
    name: 'PostgresError',
    severity: 'ERROR',
    code,
    ...extra,
  });
}

describe('mapPostgresError', () => {
  it.each([
    ['23505', 409, 'CONFLICT'],
    ['23P01', 409, 'CONFLICT'],
    ['23503', 422, 'UNPROCESSABLE'],
    ['23514', 422, 'UNPROCESSABLE'],
  ])('SQLSTATE %s → %i %s', (code, status, expected) => {
    expect(mapPostgresError(pgError(code))).toEqual({ status, code: expected });
  });

  it('usa el código registrado para la restricción violada', () => {
    const error = pgError('23505', { constraint_name: 'things_name_uq' });
    expect(mapPostgresError(error, { things_name_uq: 'DUPLICATE_NAME' })).toEqual({
      status: 409,
      code: 'DUPLICATE_NAME',
    });
  });

  it('P0001 con un código en el mensaje → 422 con ese código', () => {
    const error = pgError('P0001', { message: 'SYSTEM_CATEGORY_PROTECTED' });
    expect(mapPostgresError(error)).toEqual({ status: 422, code: 'SYSTEM_CATEGORY_PROTECTED' });
  });

  it('P0001 con un mensaje libre → 422 UNPROCESSABLE', () => {
    const error = pgError('P0001', { message: 'something went wrong' });
    expect(mapPostgresError(error)).toEqual({ status: 422, code: 'UNPROCESSABLE' });
  });

  it('encuentra el error de Postgres dentro de `cause` (Drizzle lo envuelve)', () => {
    const wrapped = new Error('Failed query', { cause: pgError('23505') });
    expect(mapPostgresError(wrapped)).toEqual({ status: 409, code: 'CONFLICT' });
  });

  it.each([
    ['otro SQLSTATE', pgError('42P01')],
    ['un error común', new Error('boom')],
    ['un valor que no es error', 'boom'],
    ['undefined', undefined],
  ])('devuelve null para %s', (_label, error) => {
    expect(mapPostgresError(error)).toBeNull();
  });
});
