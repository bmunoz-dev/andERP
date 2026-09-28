import {
  type AuthSessionResponse,
  ErrorCode,
  type ProblemDetails,
  type ProblemFieldError,
} from '@anderp/shared';
import { authStore } from './auth-store';

export const API_BASE = '/api/v1';

/** Código solo del cliente: el navegador no pudo hablar con la API. */
export const NETWORK_ERROR = 'NETWORK_ERROR';

/** Error de la API ya interpretado (Problem Details, design.md §7). */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    readonly errors: ProblemFieldError[] = [],
    readonly requestId?: string,
  ) {
    super(detail ?? code);
  }
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  /** Cuerpo que se serializa como JSON. */
  json?: unknown;
}

// ── Sesión ────────────────────────────────────────────────────────────────────────────────

const sessionExpiredListeners = new Set<() => void>();

/** El router se suscribe para llevar al login cuando la sesión ya no se puede renovar. */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Renueva la sesión con la cookie del refresh token. Las llamadas simultáneas comparten una
 * sola petición; entre pestañas se serializa con Web Locks, porque la API rota el token en cada
 * uso y dos pestañas con el mismo token cerrarían la sesión por "reutilización" (F01 CA-8).
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= withCrossTabLock(doRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      authStore.clear();
      return false;
    }
    authStore.setSession((await response.json()) as AuthSessionResponse);
    return true;
  } catch {
    authStore.clear();
    return false;
  }
}

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('anderp-auth-refresh', fn) : fn();
}

// ── Peticiones ────────────────────────────────────────────────────────────────────────────

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  try {
    return await send<T>(path, init);
  } catch (error) {
    if (!(error instanceof ApiError && error.code === ErrorCode.TOKEN_EXPIRED)) throw error;
    // El access token venció: se renueva una sola vez y se repite la petición.
    if (await refreshSession()) return send<T>(path, init);
    for (const listener of sessionExpiredListeners) listener();
    throw error;
  }
}

async function send<T>(path: string, init: ApiRequestInit): Promise<T> {
  const { json, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('accept', 'application/json');
  if (json !== undefined) requestHeaders.set('content-type', 'application/json');
  const { accessToken } = authStore.get();
  if (accessToken) requestHeaders.set('authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: requestHeaders,
      credentials: 'include',
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 202 || response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallbackCode = response.status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) return new ApiError(response.status, fallbackCode);

  try {
    const body = (await response.json()) as Partial<ProblemDetails>;
    return new ApiError(
      response.status,
      body.code ?? fallbackCode,
      body.detail,
      body.errors ?? [],
      body.requestId,
    );
  } catch {
    return new ApiError(response.status, fallbackCode);
  }
}
