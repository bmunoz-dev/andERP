import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout } from './auth-api';
import { queryClient } from './query-client';

describe('logout (F21 CA-10)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['la API responde', () => Promise.resolve(new Response(null, { status: 204 }))],
    ['falla la red', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('vacía la caché de datos cuando %s', async (_label, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    queryClient.setQueryData(['expenses'], [{ id: '1' }]);

    await logout().catch(() => undefined);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
