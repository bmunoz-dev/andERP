import { describe, expect, it } from 'vitest';
import { InvalidEnvError, loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://app_runtime:secret-password@localhost:5432/anderp',
  JWT_SECRET: 'x'.repeat(32),
  WEB_URL: 'http://localhost:5173',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'AndERP <no-reply@anderp.local>',
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

  it('no incluye los valores en el mensaje de error', () => {
    try {
      loadEnv({ ...valid, DATABASE_URL: 'not-a-url-with-secret-password' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('secret-password');
    }
  });
});
