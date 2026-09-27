import { describe, expect, it } from 'vitest';
import { InvalidEnvError, loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://app_runtime:secret-password@localhost:5432/anderp',
};

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    expect(loadEnv(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: valid.DATABASE_URL,
    });
  });

  it('convierte PORT a número', () => {
    expect(loadEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000);
  });

  it('falla si falta DATABASE_URL e indica la variable', () => {
    expect(() => loadEnv({})).toThrow(InvalidEnvError);
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it.each([
    ['PORT', 'abc'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['DATABASE_URL', 'mysql://localhost/anderp'],
  ])('rechaza %s=%s', (key, value) => {
    expect(() => loadEnv({ ...valid, [key]: value })).toThrow(new RegExp(key));
  });

  it('no incluye los valores en el mensaje de error', () => {
    try {
      loadEnv({ DATABASE_URL: 'not-a-url-with-secret-password' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('secret-password');
    }
  });
});
