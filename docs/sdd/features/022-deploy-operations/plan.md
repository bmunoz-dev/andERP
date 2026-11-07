# F22 — Despliegue y operación · Plan

- **Estado:** Aprobado (2026-11-07)
- **Spec:** [spec.md](spec.md)

## Restricciones globales

- No cambia el comportamiento de la aplicación ni su contrato.
- Va después de F21: la migración de privilegios (CA-5) cuenta con que F21 ya borra `sessions` y `password_resets`, y ya no borra `organization_members`.
- Nada imprime cadenas de conexión ni contraseñas (constitución VII).
- Activar "Enforce SSL" en Supabase, crear secretos o tocar Render y Cloudflare lo hace el usuario, o Claude con su confirmación (regla 6 de `CLAUDE.md`).

## Base de datos

**Host local y SSL (CA-1, CA-6)**

- `apps/api/src/db/connection.ts`:
  - `isLocalDatabase(url: string): boolean`, verdadero si el host es `localhost`, `127.0.0.1` o `::1`;
  - `sslFor(url: string): 'require' | false`.
- `sslFor` se usa en `database.module.ts` (opción `ssl` de `postgres(...)`), en `seed.ts` y en el migrador nuevo.
- `drizzle.config.ts` no cambia: `drizzle-kit generate` no se conecta.
- `seed.ts`: si `!isLocalDatabase(url)` y `SEED_SUPERADMIN_PASSWORD` es igual al valor de `apps/api/.env.example` (`cambia-esta-clave-local`), lanza `Error('SEED_SUPERADMIN_PASSWORD es la de ejemplo: define una propia para este entorno')`.

**Migrador (CA-2)**

- `apps/api/src/db/migrate.ts` exporta `migrateDatabase(options: { url: string; migrationsFolder: string; write: (line: string) => void }): Promise<0 | 1>`:
  1. Abre `postgres(url, { max: 1, connect_timeout: 10, ssl: sslFor(url), onnotice: () => undefined })`.
  2. Hace `select 1`. Si falla, escribe "No se pudo conectar a la base de datos (¿proyecto pausado o caído?): <code>" y retorna `1`.
  3. Hace `set lock_timeout = '5s'`.
  4. Llama a `migrate(drizzle(sql), { migrationsFolder, migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' })`.
  5. Si falla, escribe "La migración falló: <message> (código <code>, restricción <constraint_name>)" con los datos de `err.cause ?? err`, y retorna `1`.
  6. Siempre `sql.end()`.
- Al ejecutarse como script (`import.meta.url` = `process.argv[1]`), carga `.env` si existe, lee `DATABASE_URL_MIGRATIONS`, usa `./drizzle` y termina con `process.exit(await migrateDatabase(...))`.
- `apps/api/package.json`: `"db:migrate": "tsx src/db/migrate.ts"`.
- `test/setup/global-setup.ts` usa `migrateDatabase` en lugar de llamar a `migrate` directamente.

**Migraciones sin superusuario (CA-3)**

- En `global-setup.ts`, después de `bootstrap.sql` y como `postgres`:
  - `CREATE ROLE anderp_owner LOGIN PASSWORD 'anderp_owner' NOSUPERUSER CREATEROLE`;
  - `ALTER DATABASE anderp OWNER TO anderp_owner`;
  - `GRANT app_runtime TO anderp_owner`, si las migraciones lo necesitan para `ALTER DEFAULT PRIVILEGES`.
- Las migraciones corren con la URL de `anderp_owner`, que también pasa a ser `ownerDatabaseUrl`.
- Si alguna prueba necesita superusuario de verdad, se anota en "Notas de implementación" y se le da una URL aparte de `postgres`.

**Privilegios de `app_runtime` (CA-5)**

- Migración escrita a mano (`pnpm db:generate:custom --name runtime_delete_grants`):
  - `REVOKE DELETE ON ALL TABLES IN SCHEMA anderp FROM app_runtime`;
  - `ALTER DEFAULT PRIVILEGES IN SCHEMA anderp REVOKE DELETE ON TABLES FROM app_runtime`;
  - `GRANT DELETE ON anderp.fee_payment_days, anderp.sessions, anderp.password_resets TO app_runtime`.
- Antes de escribirla, un `grep -rniE "\.delete\(|delete from" apps/api/src` confirma la lista.
- `foundation.test.ts`: las tablas con `DELETE` para `app_runtime` en `information_schema.role_table_grants` son exactamente esas tres.

**Esquema sincronizado (CA-4)**

- En el CI, un paso con `DATABASE_URL_MIGRATIONS=postgres://unused@localhost/unused` corre `pnpm db:generate` y después `git diff --exit-code -- apps/api/drizzle` más `test -z "$(git status --porcelain apps/api/drizzle)"`.

## CI y despliegue

- `ci.yml`, job `verify`:
  - después de `pnpm test`, se agregan `pnpm build` y `docker build -f apps/api/Dockerfile .` (CA-7);
  - el paso de CA-4.
- `ci.yml`, job nuevo `e2e` (CA-12), en paralelo con `verify`:
  1. `docker compose up -d --wait`;
  2. `cp apps/api/.env.example apps/api/.env`;
  3. `pnpm db:migrate`, con `DATABASE_URL_MIGRATIONS` de `.env.example`;
  4. `pnpm db:seed`;
  5. `pnpm build`;
  6. la API con `node dist/main.js &` desde `apps/api`;
  7. la web con `pnpm --filter @anderp/web preview --port 5173 &`, que usa el proxy de `vite.config.ts`;
  8. esperar `http://localhost:3000/api/v1/health` y `http://localhost:5173`;
  9. `pnpm --filter @anderp/e2e exec playwright install --with-deps chromium`;
  10. `pnpm test:e2e`, con `E2E_EMAIL` y `E2E_PASSWORD` iguales a `SEED_SUPERADMIN_EMAIL` y `SEED_SUPERADMIN_PASSWORD` de `.env.example`.
  - Si falla, sube `e2e/test-results` como artefacto.
- Acciones de terceros (CA-8): `pnpm/action-setup@<sha> # v6` en `ci.yml` y `deploy.yml`. El SHA se obtiene con `gh api repos/pnpm/action-setup/git/ref/tags/v6.x.y`.
- `Dockerfile`: `node:24.<x>.<y>-slim`, con la versión de `.nvmrc` o la última 24 publicada.
- `deploy.yml`:
  - `curl -fsS --max-time 20` en la espera (CA-9);
  - en el hook de Render, `"$RENDER_DEPLOY_HOOK_URL&ref=$GITHUB_SHA"` si la documentación de Render lo admite. Si no, solo la nota del runbook 02 (CA-10).
- `.github/pull_request_template.md` con la casilla de CA-11 y "Verificación completa en verde".

## Monitoreo (CA-13)

- `.github/workflows/health.yml`, con `on: schedule: - cron: '0 13 */2 * *'` (8:00 en Bogotá) y `workflow_dispatch`.
- Un paso: `curl -fsS --max-time 90 --retry 2 --retry-all-errors "$API_HEALTH_URL"`, con `vars.API_HEALTH_URL`.
- `permissions: {}`.

## Documentación (CA-14)

- Runbook 01: nota de Supabase Free y el paso "Enforce SSL".
- Runbook 02:
  - el riesgo aceptado de la web;
  - los dos mensajes del migrador y qué hacer con cada uno;
  - Supabase pausado: reactivar y luego `gh run rerun <id> --failed`;
  - el comportamiento del hook de Render.
- Runbook 03: nota al principio.
- `design.md` §10: SSL, migrador, health check y el riesgo aceptado de la web.
- `roadmap.md`: F07 con T012 y T013 cubiertas por F22.

## Pruebas

| CA | Dónde | Caso |
|---|---|---|
| CA-1, CA-6 | `apps/api/src/db/connection.test.ts` | `localhost`, `127.0.0.1` y `::1` son locales; `db.xxx.supabase.co` no; `sslFor` devuelve `'require'` fuera de local |
| CA-6 | `apps/api/test/seed.test.ts` (o el archivo que ya pruebe el seed) | Con un host no local y la contraseña de ejemplo, `seed` lanza antes de escribir |
| CA-2 | `apps/api/test/migrate.test.ts` | Base nueva en el contenedor y carpeta `test/fixtures/broken-migration/` (journal y `0000_broken.sql` con `select 1/0`): retorna `1` y escribe una línea con `22012`. Con una URL a un puerto cerrado: retorna `1` y escribe "No se pudo conectar". Ninguna línea contiene la contraseña de la URL |
| CA-3 | toda la suite | Las migraciones corren como `anderp_owner` |
| CA-5 | `foundation.test.ts` | Lista exacta de tablas con `DELETE` |
| CA-4, CA-7, CA-12 | CI | El PR de F22 muestra los pasos en verde |
| CA-13 | GitHub | Ejecución manual de `health.yml` en verde, después del merge |

## Puntos de revisión

1. **La URL de Supabase con `?sslmode=require` ya incluida.** `postgres` con `ssl: 'require'` no debe fallar por la doble indicación (prueba en `connection.test.ts`: `sslFor` ignora los parámetros de la URL).
2. **`.env.example` cambia en el futuro.** La comparación del seed lee el valor del archivo, no una constante copiada.
3. **Health check con Render dormido.** El primer intento puede tardar unos 50 s; `--max-time 90` lo cubre.
4. **Migración que pasa en local y falla en Supabase por falta de superusuario.** Es lo que cubre CA-3; si aparece un caso real, va en las notas.
5. **Pruebas que necesitaban superusuario sin saberlo** (por ejemplo, `TRUNCATE` de tablas de otro dueño). Se ven en la primera corrida de T004.

## Notas de implementación

(Se completan al implementar.)
