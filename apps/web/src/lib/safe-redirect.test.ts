import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each(['/', '/egresos?y=2026&m=9', '/configuracion/usuarios'])(
    'acepta la ruta interna %s',
    (path) => {
      expect(safeRedirect(path)).toBe(path);
    },
  );

  it.each([
    undefined,
    '',
    'https://sitio-falso.com',
    '//sitio-falso.com',
    '/\\sitio-falso.com',
    'javascript:alert(1)',
  ])('rechaza %j', (path) => {
    expect(safeRedirect(path)).toBe('/');
  });
});
