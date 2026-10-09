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
  // F03 — prestadores y contratos
  INCOMPLETE_BANK_ACCOUNT:
    'La cuenta bancaria va completa o no va: indica banco, tipo de cuenta y número, o deja los tres vacíos.',
  DUPLICATE_DOCUMENT: 'Ya hay un prestador con ese tipo y número de documento.',
  INACTIVE_CATALOG_VALUE:
    'Uno de los valores elegidos (banco, tipo de cuenta o de documento) está desactivado.',
  PROVIDER_HAS_CONTRACTS: 'Este prestador tiene contratos. Elimina primero sus contratos.',
  INVALID_DATE_RANGE: 'La fecha de fin no puede ser anterior a la de inicio.',
  CONTRACT_OVERLAP: 'Las fechas se cruzan con otro contrato de este prestador.',
  // F04 — pagos de honorarios
  FEE_PAYMENT_WITHOUT_DAYS: 'Ingresa el valor de al menos un día.',
  DUPLICATE_WORK_DATE: 'Hay una fecha repetida en el pago.',
  WORK_DATE_OUTSIDE_WEEK: 'Hay días fuera de la semana elegida.',
  WORK_DATE_OUTSIDE_CONTRACT: 'Hay días fuera de las fechas del contrato.',
  FEE_PAYMENT_ALREADY_EXISTS:
    'Esa semana ya está pagada para este contrato. Edita el pago existente.',
  FEE_PAYMENT_PERIOD_IMMUTABLE:
    'El contrato y la semana de un pago no se cambian. Elimina el pago y créalo de nuevo.',
  CONTRACT_HAS_PAYMENTS: 'Este contrato tiene pagos de honorarios. Elimina primero esos pagos.',
  CONTRACT_DATES_EXCLUDE_PAYMENTS: 'Con esas fechas quedarían días ya pagados fuera del contrato.',
  CONTRACT_BALANCE_EXCEEDED:
    'Con este pago se superaría el valor total del contrato. Si se acordó pagar más, aumenta primero el valor del contrato en Prestadores.',
  FEES_CATEGORY_NOT_ALLOWED:
    'Los honorarios se registran desde la sección Honorarios, no como egreso manual.',
  INACTIVE_CATEGORY: 'Ese departamento está inactivo. Elige otro o actívalo en Configuración.',
  CATEGORY_HAS_EXPENSES:
    'Ese departamento tiene egresos registrados y no se puede borrar. Puedes desactivarlo.',
  CONTACT_REQUIRED: 'Ingresa al menos un correo o un teléfono del responsable.',
  RESPONSIBLE_IN_USE:
    'Ese responsable tiene credenciales asignadas. Asígnalas a otra persona antes de borrarlo.',
  DUPLICATE_CREDENTIAL: 'Ya existe una credencial con esa entidad y ese usuario.',
  CREDENTIAL_DECRYPT_FAILED:
    'No se pudo descifrar la contraseña: el registro está dañado. Avisa al administrador.',
  CREDENTIAL_KEY_UNAVAILABLE:
    'La llave con la que se cifró esta contraseña ya no está configurada. Avisa al administrador.',
  PROXY_MISCONFIGURED:
    'La web no está conectada con el servidor (falta configuración en Cloudflare). Avisa al administrador.',
} satisfies Record<ErrorCode, string>;

const CLIENT_MESSAGES: Record<string, string> = {
  [NETWORK_ERROR]: 'No hay conexión con el servidor. Revisa tu conexión a internet.',
};

const ALL_MESSAGES: Record<string, string> = { ...MESSAGES, ...CLIENT_MESSAGES };

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return ALL_MESSAGES[error.code] ?? GENERIC;
  return GENERIC;
}
