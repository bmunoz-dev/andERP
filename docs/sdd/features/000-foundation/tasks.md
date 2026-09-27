# F00 — Fundaciones · Tareas

- **Rama:** `feat/000-foundation`
- **Plan:** [plan.md](plan.md)

## Bloque A — Repositorio y herramientas

- [x] F00-T001 Inicializar git, `.gitignore`, `.editorconfig`, `.nvmrc` (24) y un `README.md` raíz con los comandos de arranque. Primer commit con `docs/sdd/`.
      Verificación: `git log` muestra el commit inicial.
- [x] F00-T002 Crear `pnpm-workspace.yaml` y el `package.json` raíz con `packageManager`, `engines` y los scripts `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate` (delegan con `pnpm -r` o `--filter`).
      Depende de: F00-T001
- [x] F00-T003 Crear `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), `eslint.config.js` (typescript-eslint en modo estricto con tipos) y Prettier.
      Depende de: F00-T002
- [x] F00-T004 Crear `vitest.config.ts` raíz con `test.projects` que incluya los tres paquetes (en Vitest 5 el antiguo `vitest.workspace.ts` ya no existe).
      Depende de: F00-T002

## Bloque B — `@anderp/shared`

- [x] F00-T005 Crear el paquete `packages/shared` con `tsup` (ESM + CJS + `.d.ts`), `exports` en `package.json` y script `dev` en modo watch.
      Depende de: F00-T003
- [x] F00-T006 [TDD] Escribir las pruebas de `weekOfMonth` y `weekRange` con la tabla de CA-3 más validaciones de entrada (mes fuera de 1–12 y semana fuera de 1–4 lanzan error). Verlas fallar e implementar `src/dates/week.ts`.
      Depende de: F00-T005 · Verificación: CA-3
- [x] F00-T007 [TDD] Escribir las pruebas de `colombianHolidays` para 2025, 2026 y 2027 con las listas oficiales escritas a mano, más pruebas de `isColombianHoliday`. Implementar `src/dates/holidays-co.ts` (Pascua con el algoritmo de Butcher y Ley Emiliani).
      Depende de: F00-T005 · Verificación: CA-4
- [x] F00-T008 [P] [TDD] Escribir las pruebas de `money.ts` (`isMoney`, `toMoney` con entradas como `"150.000"`, `"150000"`, `"150000,5"` y `"abc"`, y `formatCOP`) e implementar.
      Depende de: F00-T005
- [x] F00-T009 [P] Crear `src/errors/codes.ts` con los códigos base: `INTERNAL_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE`, `UNAUTHORIZED`, `FORBIDDEN`, `SERVICE_UNAVAILABLE`.
      Depende de: F00-T005

## Bloque C — Base de datos local

- [x] F00-T010 Crear `docker-compose.yml` con `postgres:17` (base de datos `anderp`, volumen persistente, puerto 5432) y `db/bootstrap.sql` (crea el rol `app_runtime`) montado en el initdb.
      Verificación: `psql` con `app_runtime` conecta y no puede ejecutar `CREATE TABLE`.

## Bloque D — `@anderp/api`

- [x] F00-T011 Crear el esqueleto de NestJS con SWC en `apps/api`, prefijo global `/api/v1` y las carpetas `modules/` y `shared/`.
      Depende de: F00-T003
- [x] F00-T012 [TDD] Crear `config/`: esquema Zod del entorno que falla al arrancar si falta una variable, y `.env.example`.
      Depende de: F00-T011
- [x] F00-T013 Configurar `nestjs-pino`: `genReqId`, cabecera `x-request-id` en la respuesta y `redact` según el plan.
      Depende de: F00-T011
- [x] F00-T014 Configurar `nestjs-cls` con `requestId` en el contexto.
      Depende de: F00-T013
- [x] F00-T015 Crear `db/client.ts`: módulo de base de datos con postgres-js + drizzle, token de inyección `DB` y cierre de conexiones al apagar.
      Depende de: F00-T012
- [x] F00-T016 Crear `drizzle.config.ts` (usa `DATABASE_URL_MIGRATIONS`) y los scripts `db:generate`, `db:generate:custom` y `db:migrate`.
      Depende de: F00-T015
- [x] F00-T017 Crear la migración custom `0000_base`: esquema `anderp`, extensiones, enums de §5.2 y privilegios por defecto para `app_runtime`. Configurar Drizzle con `pgSchema('anderp')`.
      Depende de: F00-T016 · Verificación: CA-8
- [x] F00-T018 Crear `db/columns.ts` (`id()` con uuid v7, `auditColumns`, `orgColumn`) y declarar los enums en Drizzle (`pgEnum`) sin volver a crearlos en migraciones.
      Depende de: F00-T017
- [x] F00-T019 [TDD] Crear `DomainError` y `pg-error.mapper.ts`, con pruebas unitarias de cada SQLSTATE de §7 (`23505`, `23P01`, `23503`, `23514`, `P0001` con código en el mensaje, y otros → 500).
      Depende de: F00-T011
- [x] F00-T020 Crear `ProblemDetailsFilter` global, `ZodValidationPipe` global (nestjs-zod) y el manejo de 404.
      Depende de: F00-T019
- [x] F00-T021 [P] Configurar Swagger en `/api/docs`, desactivado cuando `NODE_ENV=production`.
      Depende de: F00-T020
- [x] F00-T022 Crear el módulo `health`: `GET /health` con `SELECT 1` y 503 si falla. Marcarlo público desde ya con un decorador `@Public()` (sin efecto hasta F01).
      Depende de: F00-T015

## Bloque E — Harness de pruebas de integración

- [x] F00-T023 Crear `test/setup/global-setup.ts` (Testcontainers `postgres:17` + `bootstrap.sql` + migraciones), `reset-db.ts` y `create-test-app.ts`.
      Depende de: F00-T017 · Verificación: CA-9
- [x] F00-T024 [TDD] Escribir las pruebas de integración de CA-2, CA-5, CA-6 (con una ruta de prueba que lanza un error y captura del log para verificar el `redact`) y CA-7 (con una ruta de prueba con esquema Zod).
      Depende de: F00-T020, F00-T022, F00-T023

## Bloque F — `@anderp/web`

- [x] F00-T025 Crear el esqueleto de Vite + React + TS en `apps/web`, con alias `@/`, Tailwind 4 e inicialización de shadcn/ui.
      Depende de: F00-T003
- [x] F00-T026 Configurar TanStack Router (plugin de archivos) y TanStack Query: layout raíz, página de inicio vacía y página 404.
      Depende de: F00-T025
- [x] F00-T027 [TDD] Crear `lib/api-client.ts` y `lib/error-messages.es.ts`, con pruebas del parseo de Problem Details a `ApiError` y del mensaje por defecto.
      Depende de: F00-T025, F00-T009 · Verificación: CA-10
- [x] F00-T028 Configurar el proxy de Vite `/api` → `http://localhost:3000`. Mostrar en la página de inicio el estado de `/api/v1/health` para comprobar la integración.
      Depende de: F00-T026, F00-T022
- [x] F00-T029 Importar `weekRange` de `@anderp/shared` en la web y en la API (una prueba en cada una) para validar que el paquete compilado se consume bien.
      Depende de: F00-T006, F00-T011, F00-T025

## Bloque G — CI y cierre

- [ ] F00-T030 Crear `.github/workflows/ci.yml` según el plan.
      Depende de: F00-T024 · Verificación: CA-11
- [ ] F00-T031 Cierre: ejecutar los tres comandos de CA-1 desde un clon limpio, revisar la Definición de Hecho y actualizar `roadmap.md`.
