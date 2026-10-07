# AndERP — Instrucciones para Claude

Sistema de gestión de egresos, honorarios, prestadores y credenciales. Monorepo pnpm: `apps/api` (NestJS 11 + Drizzle + Postgres), `apps/web` (React 19 + Vite + TanStack Router/Query + shadcn/ui), `packages/shared` (Zod, fechas, dinero, códigos de error).

**La fuente de verdad es [`docs/sdd/`](docs/sdd/README.md):** `constitution.md` (principios), `design.md` (diseño y su historial de cambios), `roadmap.md` (estado de cada feature) y `features/NNN-*/` (spec, plan y tareas). Antes de trabajar en una feature, lee su `spec.md`, `plan.md` y `tasks.md`.

## Reglas obligatorias

### 1. El navegador solo con autorización

**No abras ni uses ningún navegador sin que el usuario lo autorice en el chat**, cada vez. Esto incluye el navegador integrado (`mcp__Claude_Browser__*`, `preview_start`), Claude in Chrome y cualquier herramienta que abra páginas. Para verificar cambios usa primero pruebas, `curl` y las consultas a la base de datos. Si una verificación visual de verdad hace falta, pídela y espera el sí.

### 2. Skill `ponytail` obligatoria en toda tarea

Usa la skill `ponytail` siempre que crees o corrijas código o cumplas una tarea: favorece la solución más simple y mínima que funciona.

**Tiene que estar instalada a nivel de proyecto, sí o sí.** Al empezar cada sesión, antes de escribir código, comprueba que existe `.claude/skills/ponytail/`. Si no está:

1. **Detente** y pide al usuario que la instale desde la raíz del repositorio:

   ```bash
   npx skills add https://github.com/dietrichgebert/ponytail --skill ponytail
   ```

2. **La instalación la ejecuta el usuario, no Claude.** Es código de un repositorio de terceros, y Claude no descarga ni ejecuta código de fuentes externas por su cuenta.
3. Cuando el usuario confirme que la instaló, verifica que la carpeta exista y activa la skill.

Si el usuario decide seguir sin instalarla en ese momento, aplica su principio a mano: lo mínimo que cumpla la spec, sin capas, opciones ni abstracciones que nadie pidió (constitución, principio XI, YAGNI). Recuérdaselo en la siguiente sesión.

### 3. Economía de tokens

- Ante tareas o preguntas simples, ve directo: un `grep` o una lectura dirigida, no recorrer el código entero.
- Agrupa en un mismo turno las llamadas que no dependen entre sí.
- No releas archivos completos cuando alcanza con un rango de líneas.
- Corre solo las pruebas del archivo o proyecto afectado mientras trabajas; la suite completa, una vez antes del commit.
- Respuestas al usuario breves: qué se hizo, qué falta y qué decidir.

## Flujo de trabajo (SDD)

1. Una rama por feature: `feat/NNN-nombre`, desde `main` actualizado.
2. Por cada tarea de `tasks.md`: prueba que falla → código mínimo → prueba en verde → marcar `[x]`.
3. Commits en inglés con Conventional Commits y el ID de la tarea: `feat(f03): ... [F03-T010]`.
4. **Si la spec o el diseño cambian, se actualiza el documento primero** (y el historial de `design.md`). Las decisiones de implementación van en "Notas de implementación" del `plan.md`.
5. Al cerrar: `roadmap.md` actualizado, push y PR con el resumen. El merge lo hace el usuario.

**Git:** commits como `bmunoz-dev <bayrol.dev@gmail.com>`, configurado por repositorio. Remoto: `github.com/bmunoz-dev/andERP`.

## Comandos

| Comando | Para qué |
|---|---|
| `docker compose up -d` | Postgres 17 (`:5432`) y Mailpit (SMTP `:1025`, bandeja http://localhost:8025) |
| `pnpm dev` | shared en watch + API (`:3000`) + web (`:5173`) |
| `pnpm db:migrate` / `pnpm db:seed` | Migraciones y datos iniciales (idempotente) |
| `pnpm db:generate -- --name x` | Migración desde el esquema Drizzle |
| `pnpm db:generate:custom -- --name x` | Migración SQL escrita a mano (triggers, EXCLUDE, vistas) |
| `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` | Verificación completa, la misma del CI |
| `npx vitest run --project api test/x.test.ts` | Un archivo de pruebas |

Docker Desktop debe estar abierto para Postgres y para las pruebas de integración (Testcontainers).

## Reglas técnicas que no se deben romper

- **Base de datos:** todo va en el esquema `anderp`, nunca en `public`. Las extensiones van en `extensions`. Las tablas de una organización llevan `organization_id`, `UNIQUE (organization_id, id)` y FK compuestas. Las invariantes importantes se escriben también en la base de datos (CHECK, UNIQUE, EXCLUDE, trigger) con un nombre de restricción que se registra en `registerConstraintCodes`.
- **Aislamiento:** toda consulta a tablas de una organización pasa por `OrgScope` (`where`, `forInsert`, `forUpdate`, `forSoftDelete`). Cada módulo tiene una prueba de que una organización no ve ni toca datos de otra.
- **Dinero:** `numeric(14,2)` en la base de datos, string decimal (`"150000.00"`) en la API y la web; las sumas se hacen en SQL. Nunca aritmética con `number`.
- **Fechas de negocio:** strings `YYYY-MM-DD` en zona `America/Bogota` (`todayIn()`), nunca `Date` para fechas de calendario.
- **Errores:** el dominio lanza `DomainError(code, status)`. Cada `code` nuevo va en `packages/shared/src/errors/codes.ts` y con su mensaje en español en `apps/web/src/lib/error-messages.es.ts`; el `satisfies` obliga a no olvidarlo.
- **Idiomas:** código, base de datos, `code` de error y commits en inglés. Interfaz y documentación en español.
- **Pruebas de la API:** corren en serie contra un Postgres real (Testcontainers). No simules la base de datos.
- **Secretos:** contraseñas con argon2id y tokens solo como hash. Nada de esto aparece en logs ni en respuestas.
- **Puerto de la API:** `API_PORT`, no `PORT`.
