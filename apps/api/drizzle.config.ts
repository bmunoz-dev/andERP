import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL_MIGRATIONS;
if (!url) throw new Error('DATABASE_URL_MIGRATIONS is required to run drizzle-kit');

// Las migraciones las ejecuta el rol dueño del esquema, nunca `app_runtime`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  schemaFilter: ['anderp'],
  dbCredentials: { url },
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  strict: true,
  verbose: true,
});
