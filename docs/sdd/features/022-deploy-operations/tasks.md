# F22 — Despliegue y operación · Tareas

- **Rama:** `feat/022-deploy-operations` (desde `main` con F21 mergeada)
- **Plan:** [plan.md](plan.md)

## Bloque A — Diseño

- [x] F22-T001 Actualizar `design.md` §10 (SSL, migrador, health check y riesgo aceptado de la publicación de la web) y su historial. Consultar en la documentación de Render si el deploy hook admite indicar el commit, y anotar la respuesta en "Notas de implementación".
      Archivos: `docs/sdd/design.md`, `docs/sdd/features/022-deploy-operations/plan.md`

## Bloque B — Base de datos

- [x] F22-T002 [TDD] `connection.ts` (`isLocalDatabase` y `sslFor`) y su uso en `database.module.ts`.
      Archivos: `apps/api/src/db/{connection,connection.test,database.module}.ts`
      Depende de: F22-T001 · Verificación: CA-1
- [x] F22-T003 [TDD] `migrate.ts` con su prueba y la carpeta `test/fixtures/broken-migration/`. `db:migrate` apunta al script nuevo, y `global-setup.ts` usa `migrateDatabase`.
      Archivos: `apps/api/src/db/migrate.ts`, `apps/api/package.json`, `apps/api/test/{migrate.test.ts,fixtures/broken-migration/**,setup/global-setup.ts}`
      Depende de: F22-T002 · Verificación: CA-2
- [x] F22-T004 Las migraciones de las pruebas corren como `anderp_owner`, sin superusuario. Toda la suite en verde; los ajustes van en las notas.
      Archivos: `apps/api/test/setup/global-setup.ts`
      Depende de: F22-T003 · Verificación: CA-3
- [x] F22-T005 [TDD] Primero la prueba de la lista exacta en `foundation.test.ts`. Después, la migración `runtime_delete_grants`.
      Archivos: `apps/api/drizzle/NNNN_runtime_delete_grants.sql`, `apps/api/test/foundation.test.ts`
      Depende de: F22-T004 · Verificación: CA-5
- [x] F22-T006 [TDD] El seed rechaza la contraseña de ejemplo fuera de local.
      Archivos: `apps/api/src/db/seed.ts`, su prueba
      Depende de: F22-T002 · Verificación: CA-6

## Bloque C — CI y despliegue

- [x] F22-T007 `ci.yml`:
      - en `verify`, `pnpm build`, `docker build` y el paso de esquema sincronizado;
      - `pnpm/action-setup` fijada por SHA en `ci.yml` y `deploy.yml`;
      - `Dockerfile` con la versión exacta de Node;
      - plantilla de PR.
      Archivos: `.github/workflows/{ci,deploy}.yml`, `apps/api/Dockerfile`, `.github/pull_request_template.md`
      Depende de: F22-T003 · Verificación: CA-4, CA-7, CA-8, CA-11 (el CI del PR en verde)
- [x] F22-T008 Job `e2e` en `ci.yml`; el smoke test en verde en el CI del PR.
      Archivos: `.github/workflows/ci.yml`, y `e2e/` si el smoke necesita ajustes
      Depende de: F22-T007 · Verificación: CA-12
- [x] F22-T009 `deploy.yml`:
      - `--max-time` en la espera;
      - el hook de Render con el commit, según lo anotado en T001.
      Workflow `health.yml`.
      Archivos: `.github/workflows/{deploy,health}.yml`
      Depende de: F22-T001 · Verificación: CA-9, CA-10, CA-13

## Bloque D — Documentación y cierre

- [x] F22-T010 Runbooks 01, 02 y 03, y F07 en `roadmap.md`, según el plan.
      Archivos: `docs/runbooks/0{1,2,3}-*.md`, `docs/sdd/roadmap.md`
      Depende de: F22-T009 · Verificación: CA-14
- [ ] F22-T011 Cierre:
      - verificación completa;
      - notas de implementación;
      - roadmap;
      - PR. Lo mergea el usuario.
      Después del despliegue, con confirmación del usuario:
      - activar "Enforce SSL" en Supabase y verificar `/health`;
      - ejecutar `health.yml` a mano.
      Depende de: F22-T002 a F22-T010 · Verificación: CA-15
