# Comandos y entorno local

Referencia; no se carga sola en cada tarea. Los permisos son los de `CLAUDE.md` (reglas 5 y 6).

| Comando | Para qué | ¿Claude necesita permiso? |
|---|---|---|
| `docker compose up -d` | Postgres 17 (`:5432`) y Mailpit (SMTP `:1025`, bandeja http://localhost:8025) | Sí |
| `pnpm dev` | shared en watch + API (`:3000`) + web (`:5173`) | Sí |
| `pnpm db:migrate` / `pnpm db:seed` | Migraciones y datos iniciales (idempotente) | Sí |
| `pnpm db:generate --name x` | Migración desde el esquema Drizzle | No (solo escribe archivos) |
| `pnpm db:generate:custom --name x` | Migración SQL escrita a mano (triggers, EXCLUDE, vistas) | No (solo escribe archivos) |
| `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` | Verificación completa, la misma del CI | No |
| `npx vitest run --project api test/x.test.ts` | Un archivo de pruebas | No |

Docker Desktop debe estar abierto para Postgres y para Testcontainers. Si está cerrado, Claude pide al usuario que lo abra.

## Notas del entorno

- **`node_modules` desincronizado** (pnpm pide confirmación sin TTY): `CI=true pnpm install --frozen-lockfile`.
- **Scripts con `node -e` o heredocs:** las comillas invertidas de TypeScript se rompen dentro de comillas dobles de bash. Para editar código usa la herramienta de edición.
