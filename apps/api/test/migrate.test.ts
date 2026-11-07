import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { migrateDatabase } from '../src/db/migrate';
import { withOwnerSql } from './setup/reset-db';

/** F22 CA-2: el migrador dice por qué falló, sin mostrar la cadena de conexión. */
describe('migrateDatabase', () => {
  it('una migración rota termina en 1 e imprime el error de Postgres', async () => {
    const name = `migrate_${randomUUID().slice(0, 8)}`;
    await withOwnerSql((sql) => sql.unsafe(`create database ${name}`));
    const url = new URL(inject('ownerDatabaseUrl'));
    url.pathname = `/${name}`;
    const lines: string[] = [];

    const code = await migrateDatabase({
      url: url.toString(),
      migrationsFolder: path.resolve(__dirname, 'fixtures/broken-migration'),
      write: (line) => lines.push(line),
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('22012');
    expect(lines.join('\n')).not.toContain(url.password);
  });

  it('sin conexión termina en 1 con un mensaje claro y sin la contraseña', async () => {
    const lines: string[] = [];
    const code = await migrateDatabase({
      url: 'postgres://anderp:super-secreta-123@127.0.0.1:1/anderp',
      migrationsFolder: path.resolve(__dirname, 'fixtures/broken-migration'),
      write: (line) => lines.push(line),
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('No se pudo conectar a la base de datos');
    expect(lines.join('\n')).not.toContain('super-secreta-123');
  });
});
