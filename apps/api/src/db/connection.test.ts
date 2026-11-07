import { describe, expect, it } from 'vitest';
import { isLocalDatabase, sslFor } from './connection';

describe('conexión a la base (F22 CA-1)', () => {
  it.each([
    'postgres://u:p@localhost:5432/anderp',
    'postgres://u:p@127.0.0.1:55432/anderp',
    'postgres://u:p@[::1]:5432/anderp',
  ])('%s es local y va sin TLS', (url) => {
    expect(isLocalDatabase(url)).toBe(true);
    expect(sslFor(url)).toBe(false);
  });

  it.each([
    'postgres://u:p@db.abc.supabase.co:5432/postgres',
    'postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
  ])('%s exige TLS', (url) => {
    expect(isLocalDatabase(url)).toBe(false);
    expect(sslFor(url)).toBe('require');
  });
});
