import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { existsSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { sslFor } from './connection';

interface PgErrorFields {
  message?: string;
  code?: string;
  constraint_name?: string;
}

/**
 * F22 CA-2: aplica las migraciones y, si algo falla, dice por qué. `drizzle-kit migrate` solo
 * devolvía `exit 1`. Nunca escribe la cadena de conexión ni la contraseña.
 */
export async function migrateDatabase(options: {
  url: string;
  migrationsFolder: string;
  write: (line: string) => void;
}): Promise<0 | 1> {
  const { url, migrationsFolder, write } = options;
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 10,
    ssl: sslFor(url),
    onnotice: () => undefined,
  });
  try {
    try {
      await sql`select 1`;
    } catch (error) {
      const { code } = error as PgErrorFields;
      write(
        `No se pudo conectar a la base de datos (¿proyecto pausado o caído?): ${code ?? 'sin código'}`,
      );
      return 1;
    }
    // Un ALTER que espera un bloqueo no debe frenar la API en producción.
    await sql`set lock_timeout = '5s'`;
    try {
      await migrate(drizzle(sql), {
        migrationsFolder,
        migrationsSchema: 'drizzle',
        migrationsTable: '__drizzle_migrations',
      });
    } catch (error) {
      const pg = ((error as { cause?: unknown }).cause ?? error) as PgErrorFields;
      write(
        `La migración falló: ${pg.message ?? 'sin mensaje'} (código ${pg.code ?? '—'}, restricción ${pg.constraint_name ?? '—'})`,
      );
      return 1;
    }
    write('Migraciones aplicadas.');
    return 0;
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.DATABASE_URL_MIGRATIONS;
  if (!url) {
    console.error('DATABASE_URL_MIGRATIONS is required');
    process.exit(1);
  }
  void migrateDatabase({
    url,
    migrationsFolder: path.resolve(__dirname, '../../drizzle'),
    write: (line) => {
      console.log(line);
    },
  }).then((code) => {
    process.exit(code);
  });
}
