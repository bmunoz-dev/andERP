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
} satisfies Record<ErrorCode, string>;

const CLIENT_MESSAGES: Record<string, string> = {
  [NETWORK_ERROR]: 'No hay conexión con el servidor. Revisa tu conexión a internet.',
};

const ALL_MESSAGES: Record<string, string> = { ...MESSAGES, ...CLIENT_MESSAGES };

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return ALL_MESSAGES[error.code] ?? GENERIC;
  return GENERIC;
}
