// @vitest-environment node
// La prueba vive fuera de functions/: Cloudflare publica como ruta cada archivo de esa carpeta.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';

const env = { API_ORIGIN: 'https://anderp-api.onrender.com', PROXY_SECRET: 's'.repeat(40) };

function upstream(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Pages Function /api/* (F07 CA-10)', () => {
  it('reenvía método, ruta, query, cuerpo y cabeceras, y agrega el secreto y la IP', async () => {
    const fetchMock = upstream(new Response('{}', { status: 201 }));
    const request = new Request('https://anderp.pages.dev/api/v1/expenses?x=1', {
      method: 'POST',
      body: '{"amount":"10.00"}',
      headers: {
        Authorization: 'Bearer token',
        Cookie: 'anderp_refresh=abc',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.7',
        'X-Proxy-Secret': 'falso',
        'X-Client-IP': '10.0.0.1',
        Host: 'anderp.pages.dev',
      },
    });

    const res = await onRequest({ request, env });

    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://anderp-api.onrender.com/api/v1/expenses?x=1');
    expect(init?.method).toBe('POST');
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"amount":"10.00"}');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('cookie')).toBe('anderp_refresh=abc');
    expect(headers.get('content-type')).toBe('application/json');
    // El navegador no puede imponer el secreto ni la IP: los escribe solo el proxy.
    expect(headers.get('x-proxy-secret')).toBe(env.PROXY_SECRET);
    expect(headers.get('x-client-ip')).toBe('203.0.113.7');
    expect(headers.get('host')).toBeNull();
  });

  it('GET va sin cuerpo', async () => {
    const fetchMock = upstream(new Response('[]'));
    await onRequest({ request: new Request('https://anderp.pages.dev/api/v1/credentials'), env });
    expect(fetchMock.mock.calls[0]![1]?.body).toBeNull();
  });

  it('devuelve la respuesta tal cual, incluido Set-Cookie', async () => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    headers.append('Set-Cookie', 'anderp_refresh=nuevo; HttpOnly; Secure; SameSite=Strict');
    upstream(new Response('{"accessToken":"t"}', { status: 200, headers }));

    const res = await onRequest({
      request: new Request('https://anderp.pages.dev/api/v1/auth/refresh', { method: 'POST' }),
      env,
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"accessToken":"t"}');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.getSetCookie()).toEqual([
      'anderp_refresh=nuevo; HttpOnly; Secure; SameSite=Strict',
    ]);
  });
});
