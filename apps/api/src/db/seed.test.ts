import { describe, expect, it } from 'vitest';
import { assertSafeSeedPassword } from './seed';

describe('assertSafeSeedPassword (F22 CA-6)', () => {
  const example = 'cambia-esta-clave-local';

  it('fuera de local rechaza la contraseña de ejemplo', () => {
    expect(() => {
      assertSafeSeedPassword('postgres://u:p@db.x.supabase.co/postgres', example, example);
    }).toThrow('SEED_SUPERADMIN_PASSWORD es la de ejemplo');
  });

  it('en local la acepta, y fuera de local acepta una propia', () => {
    expect(() => {
      assertSafeSeedPassword('postgres://u:p@localhost:5432/anderp', example, example);
    }).not.toThrow();
    expect(() => {
      assertSafeSeedPassword(
        'postgres://u:p@db.x.supabase.co/postgres',
        'otra clave propia',
        example,
      );
    }).not.toThrow();
  });
});
