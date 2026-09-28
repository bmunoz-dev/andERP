import { describe, expect, it } from 'vitest';
import {
  isLocked,
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  registerFailedLogin,
} from './login-attempts';

const now = new Date('2026-09-28T10:00:00Z');

describe('registerFailedLogin', () => {
  it('suma un intento mientras no se llega al máximo', () => {
    expect(registerFailedLogin(0, now)).toEqual({
      failedLoginAttempts: 1,
      lockedUntil: null,
      locked: false,
    });
    expect(registerFailedLogin(MAX_FAILED_ATTEMPTS - 2, now).locked).toBe(false);
  });

  it(`al llegar a ${MAX_FAILED_ATTEMPTS} fallos bloquea 15 minutos y reinicia el contador`, () => {
    expect(registerFailedLogin(MAX_FAILED_ATTEMPTS - 1, now)).toEqual({
      failedLoginAttempts: 0,
      lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
      locked: true,
    });
  });
});

describe('isLocked', () => {
  it('está bloqueado hasta que pasan los 15 minutos', () => {
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
    expect(isLocked(lockedUntil, now)).toBe(true);
    expect(isLocked(lockedUntil, new Date(lockedUntil.getTime() - 1))).toBe(true);
    expect(isLocked(lockedUntil, lockedUntil)).toBe(false);
  });

  it('sin fecha de bloqueo no está bloqueado', () => {
    expect(isLocked(null, now)).toBe(false);
  });
});
