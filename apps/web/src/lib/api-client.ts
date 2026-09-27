import { ErrorCode, type ProblemDetails, type ProblemFieldError } from '@anderp/shared';

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

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('accept', 'application/json');
  if (json !== undefined) requestHeaders.set('content-type', 'application/json');

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
  if (response.status === 204) return undefined as T;
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
