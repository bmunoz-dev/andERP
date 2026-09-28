import type { AuthSessionResponse } from '@anderp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, onSessionExpired, refreshSession } from './api-client';
import { authStore } from './auth-store';

const profile = {
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'ana@empresa.co',
  firstName: 'Ana',
  lastName: 'Gómez',
  isSuperAdmin: false,
  organization: { id: '018f0000-0000-7000-8000-000000000002', name: 'Empresa' },
  role: 'admin' as const,
};

function json(status: number, body: unknown, problem = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': problem ? 'application/problem+json' : 'application/json' },
  });
}

const expired = () => json(401, { status: 401, code: 'TOKEN_EXPIRED' }, true);
const revoked = () => json(401, { status: 401, code: 'SESSION_REVOKED' }, true);
const session = (token: string): AuthSessionResponse => ({ accessToken: token, user: profile });

type Handler = (url: string, init: RequestInit) => Response;

function stubServer(handler: Handler) {
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const authHeader = (init: RequestInit) => new Headers(init.headers).get('authorization');

beforeEach(() => {
  authStore.setSession(session('old-token'));
});

describe('apiFetch con sesión', () => {
  it('envía el access token en Authorization', async () => {
    const fetchMock = stubServer(() => json(200, { ok: true }));
    await apiFetch('/things');
    expect(authHeader(fetchMock.mock.calls[0]![1])).toBe('Bearer old-token');
  });

  it('CA-9 ante TOKEN_EXPIRED refresca una vez y repite la petición', async () => {
    const fetchMock = stubServer((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, session('new-token'));
      return authHeader(init) === 'Bearer new-token' ? json(200, { ok: true }) : expired();
    });

    await expect(apiFetch('/things')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(authStore.get().accessToken).toBe('new-token');
  });

  it('varias peticiones vencidas a la vez comparten un solo refresh', async () => {
    const fetchMock = stubServer((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, session('new-token'));
      return authHeader(init) === 'Bearer new-token' ? json(200, { ok: true }) : expired();
    });

    await Promise.all([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('si el refresh falla, cierra la sesión, avisa y propaga el error', async () => {
    const expiredHandler = vi.fn();
    const unsubscribe = onSessionExpired(expiredHandler);
    stubServer((url) => (url.endsWith('/auth/refresh') ? revoked() : expired()));

    await expect(apiFetch('/things')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(authStore.get().status).toBe('anonymous');
    expect(expiredHandler).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('no intenta refrescar ante otros 401 (p. ej. credenciales inválidas)', async () => {
    const fetchMock = stubServer(() =>
      json(401, { status: 401, code: 'INVALID_CREDENTIALS' }, true),
    );
    await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('refreshSession', () => {
  it('recupera la sesión desde la cookie al cargar la página (CA-20)', async () => {
    authStore.clear();
    stubServer(() => json(200, session('restored')));
    await expect(refreshSession()).resolves.toBe(true);
    expect(authStore.get()).toMatchObject({ status: 'authenticated', accessToken: 'restored' });
  });

  it('sin cookie válida queda anónima', async () => {
    stubServer(() => revoked());
    await expect(refreshSession()).resolves.toBe(false);
    expect(authStore.get().status).toBe('anonymous');
  });
});
