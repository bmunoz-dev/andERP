# F00 — Fundaciones · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Versiones base

| Herramienta | Versión |
|---|---|
| Node.js | 24 LTS (fijada en `.nvmrc` y `engines`) |
| pnpm | 11 (fijada con `packageManager`) |
| TypeScript | 6.0.x. La 7 (compilador nativo) aún no es compatible con typescript-eslint (`<6.1`). |
| NestJS | 11.x. `nestjs-zod` todavía no soporta Nest 12 (peer `^10 \|\| ^11`). |
| PostgreSQL local | Misma versión mayor que el proyecto de Supabase. Se verifica al crear el proyecto; a la fecha es 17. |
| Resto de dependencias | Última versión estable al instalar. Se registran en el lockfile. |

## Estructura

```
/
  .github/workflows/ci.yml
  apps/
    api/                         @anderp/api
      drizzle/                   migraciones SQL generadas y a mano
      drizzle.config.ts
      src/
        main.ts
        app.module.ts
        config/                  env validado con Zod
        db/
          client.ts              postgres-js + drizzle
          schema/                tablas Drizzle (una por archivo o por módulo)
          columns.ts             id(), auditColumns, orgColumn
        shared/
          errors/                DomainError, ProblemDetailsFilter, pg-error.mapper.ts
          context/               nestjs-cls (requestId; userId y orgId en F01)
          logging/
        modules/
          health/
      test/
        setup/                   global-setup.ts (Testcontainers), reset-db.ts, create-test-app.ts
    web/                         @anderp/web
      src/
        routes/                  TanStack Router basado en archivos
        lib/api-client.ts
        lib/error-messages.es.ts
        components/ui/           shadcn/ui
  packages/
    shared/                      @anderp/shared
      src/
        dates/week.ts
        dates/holidays-co.ts
        money.ts
        errors/codes.ts
        schemas/                 esquemas Zod (se llenan feature a feature)
  db/
    bootstrap.sql                crea el rol app_runtime (se ejecuta una vez por entorno)
  docker-compose.yml
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.js
  vitest.config.ts             test.projects con los tres paquetes
```

## Decisiones técnicas

**Paquete compartido**
- `@anderp/shared` se compila con `tsup` en formato ESM + CJS con `.d.ts`.
- La API (CJS, NestJS) y la web (ESM, Vite) lo consumen compilado.
- En desarrollo, `pnpm dev` ejecuta `tsup --watch` en paralelo.

**Semanas (formato B)**
- `weekOfMonth(date) = min(floor((día − 1) / 7) + 1, 4)`.
- `weekRange(y, m, w)`: el inicio es el día `(w − 1) × 7 + 1`; el fin es `inicio + 6` en las semanas 1–3 y el último día del mes en la semana 4.
- Las fechas se manejan como strings `YYYY-MM-DD` (fechas de calendario sin zona horaria). **No se usa `Date` con zona para fechas de negocio**, porque un `Date` en UTC puede caer en el día anterior en Bogotá.
- Aritmética de fechas propia en UTC sobre strings `YYYY-MM-DD` (`dates/calendar-date.ts`), sin dependencias: sumar días, días del mes y día de la semana.

**Festivos de Colombia**
- Implementación propia, sin dependencia externa:
  - Fijos: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
  - Trasladables al lunes siguiente (Ley 51 de 1983): 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov.
  - Basados en la Pascua (algoritmo de Butcher): Jueves y Viernes Santo; Ascensión (+43 días), Corpus Christi (+64) y Sagrado Corazón (+71), estos tres trasladados a lunes.
- Se valida contra los calendarios oficiales de 2025–2027 escritos a mano en las pruebas.

**Dinero**
- `money.ts` expone el tipo `Money` (string que cumple `^-?\d{1,12}\.\d{2}$`), `isMoney()`, `toMoney(input)` (normaliza la entrada del usuario) y `formatCOP()` (con `Intl.NumberFormat('es-CO')`).
- No hace aritmética con `number`. F04 agrega `sumMoney()` con centavos en `BigInt` para la vista previa de totales en la web; el total oficial siempre sale de SQL.

**API**
- NestJS con compilador SWC.
- `nestjs-zod`: `ZodValidationPipe` global y `ZodSerializerInterceptor`; los DTO se crean desde los esquemas de `@anderp/shared`.
- `nestjs-pino` con `genReqId` (UUID o el `x-request-id` entrante) y `redact` para `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.token`, `*.refreshToken` y `*.newPassword`.
- `nestjs-cls` monta el contexto por petición con `requestId`.
- `ProblemDetailsFilter` global traduce:
  - `DomainError` → su `status` y `code`.
  - `ZodValidationException` → 422 `VALIDATION_ERROR`.
  - `NotFoundException` → 404 `NOT_FOUND`.
  - Errores de Postgres → `pg-error.mapper.ts` según `design.md` §7.
  - Cualquier otro error → 500 `INTERNAL_ERROR`.
- Prefijo global `/api/v1`. Swagger en `/api/docs` solo fuera de producción.

**Base de datos**
- Driver `postgres` (postgres-js).
- Hay dos URLs:
  - `DATABASE_URL`: rol `app_runtime`, lo usa la aplicación.
  - `DATABASE_URL_MIGRATIONS`: rol dueño del esquema, lo usan `drizzle-kit` y el script de migración.
- `db/bootstrap.sql` crea `app_runtime` con `LOGIN` y sin privilegios de DDL. En local se monta en `/docker-entrypoint-initdb.d`. En Supabase se ejecuta a mano una vez (F07).
- **Esquema `anderp`:** todas las tablas, vistas y funciones van ahí, nunca en `public`, porque Supabase expone `public` por su Data API (ver F07). En Drizzle, `export const anderp = pgSchema('anderp')` y todas las tablas se declaran con `anderp.table(...)`. `bootstrap.sql` fija `ALTER ROLE app_runtime SET search_path = anderp, extensions`. `extensions` tiene que estar en el `search_path` o los operadores de `citext` no se encuentran y la comparación de emails pasa a distinguir mayúsculas sin avisar.
- Migración `0000_base.sql` (custom):
  - `CREATE SCHEMA anderp`.
  - `CREATE SCHEMA IF NOT EXISTS extensions` y `CREATE EXTENSION IF NOT EXISTS citext` y `btree_gist` `WITH SCHEMA extensions`: el mismo esquema que usa Supabase, así local y producción se comportan igual. En Drizzle el tipo se declara como `extensions.citext` para no depender del `search_path` del rol de migraciones.
  - `GRANT USAGE ON SCHEMA extensions TO app_runtime`.
  - Todos los enums de §5.2, en `anderp`.
  - `GRANT USAGE ON SCHEMA anderp TO app_runtime`.
  - `ALTER DEFAULT PRIVILEGES IN SCHEMA anderp GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime`.
  - `ALTER DEFAULT PRIVILEGES IN SCHEMA anderp GRANT EXECUTE ON FUNCTIONS TO app_runtime`.
- `columns.ts`:
  - `id()`: `uuid` con default generado en la aplicación con `uuid` v7 (`$defaultFn`).
  - `auditColumns`: las seis columnas de auditoría.
  - `orgColumn`: `organization_id` `uuid NOT NULL`.
- Las migraciones generadas se revisan a mano antes de commitearlas. Las restricciones que Drizzle no expresa (triggers, EXCLUDE, vistas, índices parciales complejos) van en migraciones custom (`drizzle-kit generate --custom`).

**Pruebas**
- Vitest con `test.projects` en el `vitest.config.ts` raíz (`packages/shared`, `apps/api`, `apps/web`).
- Integración de la API:
  - `globalSetup` levanta `postgres:17` con Testcontainers, ejecuta `bootstrap.sql` y aplica las migraciones.
  - Expone la URL por `process.env`.
  - `resetDb()` hace `TRUNCATE ... CASCADE` de todas las tablas de negocio al inicio de cada archivo de prueba.
- `createTestApp()` crea la app Nest completa y devuelve un cliente `supertest`.
- Requisito en Windows: Docker Desktop encendido.

**Web**
- Vite + React + TypeScript.
- Tailwind CSS 4 + shadcn/ui.
- TanStack Router (enrutamiento por archivos, plugin de Vite) + TanStack Query.
- `api-client.ts`:
  - `fetch` con `credentials: 'include'`.
  - Base `/api/v1`.
  - Parsea Problem Details y lanza un `ApiError { status, code, detail, errors }`.
- `error-messages.es.ts` mapea `code` a mensaje en español, con uno genérico por defecto.
- El proxy de Vite envía `/api` a `http://localhost:3000`, así la web y la API comparten origen igual que en producción.

**CI**
- GitHub Actions en `ubuntu-latest`: checkout → pnpm → Node 24 → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test`.
- Testcontainers funciona con el Docker del runner.

## Variables de entorno (`apps/api/.env.example`)

```
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
DATABASE_URL=postgres://app_runtime:app_runtime@localhost:5432/anderp
DATABASE_URL_MIGRATIONS=postgres://postgres:postgres@localhost:5432/anderp
```

## Riesgos

- **Columnas generadas con `EXTRACT`.** Postgres exige expresiones inmutables. Se valida con una prueba de migración en F04/F05. Si fallara, se usa una función SQL propia marcada `IMMUTABLE`.
- **Consumo de `@anderp/shared` compilado.** Se valida en este feature importándolo desde la API y la web.
