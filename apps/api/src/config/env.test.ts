import { describe, expect, it } from 'vitest';
import { InvalidEnvError, loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://app_runtime:secret-password@localhost:5432/anderp',
  JWT_SECRET: 'x'.repeat(32),
  WEB_URL: 'http://localhost:5173',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'AndERP <no-reply@anderp.local>',
  CREDENTIALS_KEYS: JSON.stringify({ '1': Buffer.alloc(32, 1).toString('base64') }),
  CREDENTIALS_ACTIVE_KEY_VERSION: '1',
};

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    expect(loadEnv(valid)).toEqual({
      NODE_ENV: 'development',
      API_PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      WEB_URL: valid.WEB_URL,
      AUTH_THROTTLE_LIMIT: 10,
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      MAIL_FROM: valid.MAIL_FROM,
      CREDENTIALS_KEYS: new Map([[1, Buffer.alloc(32, 1)]]),
      CREDENTIALS_ACTIVE_KEY_VERSION: 1,
    });
  });

  it('convierte API_PORT a número', () => {
    expect(loadEnv({ ...valid, API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('falla si falta DATABASE_URL e indica la variable', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(InvalidEnvError);
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it.each([
    ['API_PORT', 'abc'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['DATABASE_URL', 'mysql://localhost/anderp'],
    ['JWT_SECRET', 'too-short'],
    ['WEB_URL', 'ftp://example.com'],
  ])('rechaza %s=%s', (key, value) => {
    expect(() => loadEnv({ ...valid, [key]: value })).toThrow(new RegExp(key));
  });

  // F06 CA-10: sin una llave activa válida la API no arranca.
  it.each([
    ['no es JSON', 'not-json'],
    ['falta la llave activa', JSON.stringify({ '2': Buffer.alloc(32).toString('base64') })],
    ['la llave no mide 32 bytes', JSON.stringify({ '1': Buffer.alloc(16).toString('base64') })],
    ['la versión no es un número', JSON.stringify({ uno: Buffer.alloc(32).toString('base64') })],
  ])('rechaza CREDENTIALS_KEYS si %s', (_case, keys) => {
    expect(() => loadEnv({ ...valid, CREDENTIALS_KEYS: keys })).toThrow(/CREDENTIALS_KEYS/);
  });

  it('acepta varias versiones de llave', () => {
    const keys = JSON.stringify({
      '1': Buffer.alloc(32, 1).toString('base64'),
      '2': Buffer.alloc(32, 2).toString('base64'),
    });
    const env = loadEnv({ ...valid, CREDENTIALS_KEYS: keys, CREDENTIALS_ACTIVE_KEY_VERSION: '2' });
    expect([...env.CREDENTIALS_KEYS.keys()]).toEqual([1, 2]);
  });

  // F07 CA-8: en producción la API no arranca sin el secreto del proxy.
  it('exige PROXY_SECRET en producción y con al menos 32 caracteres', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/PROXY_SECRET/);
    expect(() => loadEnv({ ...valid, PROXY_SECRET: 'corto' })).toThrow(/PROXY_SECRET/);
    expect(loadEnv({ ...valid, PROXY_SECRET: '' }).PROXY_SECRET).toBeUndefined();
    const secret = 's'.repeat(32);
    expect(loadEnv({ ...valid, NODE_ENV: 'production', PROXY_SECRET: secret }).PROXY_SECRET).toBe(
      secret,
    );
  });

  it('no incluye los valores en el mensaje de error', () => {
    try {
      loadEnv({ ...valid, DATABASE_URL: 'not-a-url-with-secret-password' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('secret-password');
    }
  });
});
