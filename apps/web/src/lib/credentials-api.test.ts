import { describe, expect, it } from 'vitest';
import { credentialBody } from './credentials-api';

describe('credentialBody (F24 CA-9)', () => {
  const values = { entityName: 'DIAN', username: 'u', password: '' };

  it('al editar, la contraseña vacía no se envía: significa "no cambiar"', () => {
    expect(credentialBody(values, true)).toEqual({ entityName: 'DIAN', username: 'u' });
  });

  it('al editar con una contraseña nueva, se envía', () => {
    expect(credentialBody({ ...values, password: 'nueva' }, true)).toHaveProperty(
      'password',
      'nueva',
    );
  });

  it('al crear se envía tal cual', () => {
    expect(credentialBody(values, false)).toEqual(values);
  });
});
