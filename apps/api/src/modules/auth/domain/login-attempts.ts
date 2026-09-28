/** Bloqueo por fuerza bruta (F01 CA-3). */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface FailedLoginResult {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  /** `true` si este fallo es el que bloquea la cuenta. */
  locked: boolean;
}

/**
 * Suma un fallo. Al llegar al máximo bloquea la cuenta y reinicia el contador, para que al
 * vencer el bloqueo el usuario vuelva a tener todos sus intentos.
 */
export function registerFailedLogin(currentAttempts: number, now: Date): FailedLoginResult {
  const attempts = currentAttempts + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginAttempts: 0,
      lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
      locked: true,
    };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null, locked: false };
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
