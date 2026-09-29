import type { ErrorCode } from '@anderp/shared';
import { ApiError, NETWORK_ERROR } from './api-client';

const GENERIC =
  'Ocurrió un error inesperado. Intenta de nuevo y, si continúa, contacta al administrador.';

/**
 * Mensajes en español por `code` (constitución, principio VIII: el backend no envía textos de
 * interfaz). Cada feature añade los suyos; `satisfies` obliga a cubrir todos los códigos base.
 */
const MESSAGES = {
  INTERNAL_ERROR: GENERIC,
  VALIDATION_ERROR: 'Revisa los campos marcados.',
  BAD_REQUEST: 'La solicitud no es válida.',
  NOT_FOUND: 'No encontramos lo que buscas.',
  CONFLICT: 'Ya existe un registro con esos datos.',
  UNPROCESSABLE: 'No se pudo completar la operación con esos datos.',
  UNAUTHORIZED: 'Tu sesión terminó. Inicia sesión de nuevo.',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible en este momento. Intenta más tarde.',
  // F01 — auth
  INVALID_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  ACCOUNT_LOCKED:
    'Tu cuenta está bloqueada por demasiados intentos fallidos. Intenta de nuevo en 15 minutos.',
  ACCOUNT_DISABLED: 'Tu cuenta está desactivada. Contacta al administrador.',
  TOKEN_EXPIRED: 'Tu sesión venció. Inicia sesión de nuevo.',
  SESSION_REVOKED: 'Tu sesión se cerró. Inicia sesión de nuevo.',
  INVALID_CURRENT_PASSWORD: 'La contraseña actual no es correcta.',
  WEAK_PASSWORD:
    'Esa contraseña es demasiado común o no cumple la longitud (entre 12 y 128 caracteres). Elige otra.',
  INVALID_RESET_TOKEN:
    'El enlace no es válido o ya venció. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".',
  // F02 — organizaciones, catálogos y usuarios
  TAX_ID_TAKEN: 'Ya existe una organización con ese NIT.',
  DUPLICATE_NAME: 'Ya existe un registro con ese nombre.',
  SYSTEM_CATEGORY_PROTECTED:
    'Esta categoría la usa el sistema para los honorarios: no se puede renombrar, desactivar ni eliminar.',
  INVALID_CATEGORY_ORDER: 'La lista de categorías cambió. Recarga la página e inténtalo de nuevo.',
  ALREADY_MEMBER: 'Esa persona ya pertenece a la organización.',
  CANNOT_DEACTIVATE_SELF: 'No puedes desactivar tu propio usuario.',
  LAST_ADMIN: 'La organización necesita al menos un administrador activo.',
  INVITE_NOT_PENDING: 'Esa persona ya activó su cuenta; no hace falta reenviar la invitación.',
} satisfies Record<ErrorCode, string>;

const CLIENT_MESSAGES: Record<string, string> = {
  [NETWORK_ERROR]: 'No hay conexión con el servidor. Revisa tu conexión a internet.',
};

const ALL_MESSAGES: Record<string, string> = { ...MESSAGES, ...CLIENT_MESSAGES };

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return ALL_MESSAGES[error.code] ?? GENERIC;
  return GENERIC;
}
