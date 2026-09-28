import { ErrorCode, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@anderp/shared';
import { DomainError } from '../../../shared/errors/domain-error';

export type WeakPasswordReason = 'too_short' | 'too_long' | 'common';

/**
 * Política de contraseñas (F01 CA-13): longitud 12–128 contada en caracteres, sin reglas de
 * composición, y rechazo de contraseñas comunes (comparadas en minúsculas).
 */
export function assertPasswordPolicy(password: string, common: ReadonlySet<string>): void {
  // Se cuentan grafemas (lo que el usuario ve como un carácter), no unidades UTF-16.
  const length = Array.from(new Intl.Segmenter().segment(password)).length;
  let reason: WeakPasswordReason | undefined;
  if (length < PASSWORD_MIN_LENGTH) reason = 'too_short';
  else if (length > PASSWORD_MAX_LENGTH) reason = 'too_long';
  else if (common.has(password.toLowerCase())) reason = 'common';

  if (reason) throw new DomainError(ErrorCode.WEAK_PASSWORD, 422, reason);
}
