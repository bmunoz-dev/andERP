import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Conexión con el rol `app_runtime`, la misma que usa la API. */
    databaseUrl: string;
    /** Conexión con el rol dueño del esquema (migraciones, TRUNCATE, verificaciones). */
    ownerDatabaseUrl: string;
  }
}

const API_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(API_ROOT, '../..');
const APP_RUNTIME_PASSWORD = 'app_runtime';

/**
 * Levanta un Postgres desechable igual al de producción: ejecuta el mismo `db/bootstrap.sql`
 * con psql y aplica todas las migraciones. Todas las pruebas de la API comparten este contenedor.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17')
    .withDatabase('anderp')
    .withUsername('postgres')
    .withPassword('postgres')
    .withCopyFilesToContainer([
      { source: path.join(REPO_ROOT, 'db/bootstrap.sql'), target: '/anderp/bootstrap.sql' },
    ])
    .start();

  const bootstrap = await container.exec([
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    `app_runtime_password=${APP_RUNTIME_PASSWORD}`,
    '-U',
    'postgres',
    '-d',
    'anderp',
    '-f',
    '/anderp/bootstrap.sql',
  ]);
  if (bootstrap.exitCode !== 0) {
    throw new Error(`db/bootstrap.sql failed:\n${bootstrap.output}`);
  }

  const ownerUrl = container.getConnectionUri();
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: path.join(API_ROOT, 'drizzle'),
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await sql.end();
  }

  const runtimeUrl = new URL(ownerUrl);
  runtimeUrl.username = 'app_runtime';
  runtimeUrl.password = APP_RUNTIME_PASSWORD;

  project.provide('databaseUrl', runtimeUrl.toString());
  project.provide('ownerDatabaseUrl', ownerUrl);

  return async () => {
    await container.stop();
  };
}
