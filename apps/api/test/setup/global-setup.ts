import path from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Conexión con el rol `app_runtime`, la misma que usa la API. */
    databaseUrl: string;
    /** Conexión con el rol dueño del esquema (migraciones, TRUNCATE, verificaciones). */
    ownerDatabaseUrl: string;
    /** F17: s3mock de pruebas, con el bucket `contract-documents` ya creado. */
    s3Endpoint: string;
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
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

  // F17: s3mock (MinIO ya no publica imágenes). No valida firmas: eso se prueba contra Supabase.
  const s3mock = await new GenericContainer('adobe/s3mock:4.7.0')
    .withExposedPorts(9090)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const s3 = {
    endpoint: `http://${s3mock.getHost()}:${String(s3mock.getMappedPort(9090))}`,
    accessKeyId: 'test',
    secretAccessKey: 'test',
  };
  const client = new S3Client({
    endpoint: s3.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  });
  await client.send(new CreateBucketCommand({ Bucket: 'contract-documents' }));
  client.destroy();
  project.provide('s3Endpoint', s3.endpoint);
  project.provide('s3AccessKeyId', s3.accessKeyId);
  project.provide('s3SecretAccessKey', s3.secretAccessKey);

  return async () => {
    await Promise.all([container.stop(), s3mock.stop()]);
  };
}
