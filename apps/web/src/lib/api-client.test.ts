import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api-client';
import { errorMessage } from './error-messages.es';

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function problem(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ type: 'about:blank', status, ...body }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

describe('apiFetch', () => {
  it('devuelve el JSON y envía cookies y cuerpo JSON a /api/v1', async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(apiFetch('/things', { method: 'POST', json: { name: 'x' } })).resolves.toEqual({
      ok: true,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/things');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"name":"x"}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('devuelve undefined en 204', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiFetch('/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('convierte Problem Details en ApiError', async () => {
    stubFetch(
      problem(422, {
        code: 'VALIDATION_ERROR',
        detail: 'Invalid body',
        requestId: 'req-123',
        errors: [{ path: 'name', message: 'Required' }],
      }),
    );

    const error = await apiFetch('/things').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      detail: 'Invalid body',
      requestId: 'req-123',
      errors: [{ path: 'name', message: 'Required' }],
    });
  });

  it('una respuesta de error que no es JSON → INTERNAL_ERROR', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiFetch('/things')).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
    });
  });

  it('un fallo de red → NETWORK_ERROR', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    await expect(apiFetch('/things')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('errorMessage', () => {
  it('traduce un código conocido', () => {
    expect(errorMessage(new ApiError(404, 'NOT_FOUND'))).toBe('No encontramos lo que buscas.');
  });

  it('usa un mensaje genérico para códigos desconocidos y errores que no son de la API', () => {
    const generic = errorMessage(new ApiError(500, 'SOMETHING_NEW'));
    expect(generic).toMatch(/error inesperado/);
    expect(errorMessage(new Error('boom'))).toBe(generic);
  });
});
