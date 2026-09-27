import postgres from 'postgres';
import { inject } from 'vitest';

/**
 * Vacía todas las tablas de `anderp`. Se llama al inicio de cada archivo de prueba de
 * integración. Usa el rol dueño porque `app_runtime` no tiene permiso de TRUNCATE.
 */
export async function resetDb(): Promise<void> {
  const sql = postgres(inject('ownerDatabaseUrl'), { max: 1, onnotice: () => undefined });
  try {
    const tables = await sql<{ name: string }[]>`
      select quote_ident(schemaname) || '.' || quote_ident(tablename) as name
      from pg_tables where schemaname = 'anderp'`;
    if (tables.length > 0) {
      await sql.unsafe(`truncate ${tables.map((t) => t.name).join(', ')} cascade`);
    }
  } finally {
    await sql.end();
  }
}

/** Ejecuta consultas con el rol dueño (verificaciones de esquema, datos de prueba). */
export async function withOwnerSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(inject('ownerDatabaseUrl'), { max: 1, onnotice: () => undefined });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Ejecuta consultas con el rol de la API, para probar sus permisos. */
export async function withRuntimeSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(inject('databaseUrl'), { max: 1, onnotice: () => undefined });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}
