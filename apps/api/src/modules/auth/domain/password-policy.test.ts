import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/errors/domain-error';
import { assertPasswordPolicy } from './password-policy';

const common = new Set(['password1234', 'qwertyuiop123']);

function weakReason(password: string): string | undefined {
  try {
    assertPasswordPolicy(password, common);
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: 'WEAK_PASSWORD', status: 422 });
    return (error as DomainError).detail;
  }
}

describe('assertPasswordPolicy', () => {
  it('acepta una contraseña de 12 a 128 caracteres que no es común', () => {
    expect(weakReason('correcto caballo batería')).toBeUndefined();
    expect(weakReason('a'.repeat(12))).toBeUndefined();
    expect(weakReason('a'.repeat(128))).toBeUndefined();
  });

  it('rechaza menos de 12 caracteres', () => {
    expect(weakReason('a'.repeat(11))).toBe('too_short');
  });

  it('rechaza más de 128 caracteres', () => {
    expect(weakReason('a'.repeat(129))).toBe('too_long');
  });

  it('rechaza contraseñas comunes sin importar mayúsculas', () => {
    expect(weakReason('password1234')).toBe('common');
    expect(weakReason('QwertyUiop123')).toBe('common');
  });

  it('cuenta caracteres, no bytes (emojis y tildes)', () => {
    expect(weakReason('ñandú🙂ñandú🙂ab')).toBeUndefined();
  });
});
