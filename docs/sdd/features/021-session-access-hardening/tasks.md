# F21 — Sesión y acceso · Tareas

- **Rama:** `feat/021-session-access-hardening`
- **Plan:** [plan.md](plan.md)

## Bloque A — Diseño y datos

- [x] F21-T001 Actualizar los documentos antes del código:
      - `design.md` §5.3: `organization_members.last_access_at` e invitaciones por organización;
      - `design.md` §6.2: contador atómico, revocación por organización, limpieza al iniciar sesión y riesgo aceptado del aviso "cuenta bloqueada";
      - historial de `design.md`: la entrada nueva reemplaza la del 2026-10-09;
      - notas fechadas en F02 (CA-2, CA-14 y CA-20) y F12 (CA-4) que remitan a F21.
      Archivos: `docs/sdd/design.md`, `docs/sdd/features/002-organizations-catalogs/spec.md`, `docs/sdd/features/012-atomic-audit/spec.md`
- [x] F21-T002 [TDD] `lastAccessAt` en `core.ts` y migración `0037_session_access`.
      Archivos: `apps/api/src/db/schema/core.ts`, `apps/api/drizzle/0037_*.sql`
      Depende de: F21-T001 · Verificación: `pnpm db:generate` sin cambios pendientes

## Bloque B — Auth

- [x] F21-T003 [TDD] Primero la prueba de 7 logins fallidos en paralelo y la de cuenta bloqueada con la contraseña correcta (punto de revisión 5). Después:
      - `registerFailedLogin` en `ports.ts`, Drizzle (un `UPDATE ... RETURNING`) e `in-memory-auth.ts`;
      - `LoginUseCase` lo usa en lugar de `recordFailedLogin`.
      Archivos: `apps/api/src/modules/auth/application/{ports,login.use-case}.ts`, `.../infrastructure/drizzle-auth.repositories.ts`, `.../testing/in-memory-auth.ts`, `apps/api/test/auth.test.ts`
      Depende de: F21-T001 · Verificación: CA-1
- [x] F21-T004 [TDD] Throttle en `password/change` y `RequestPasswordResetUseCase` en segundo plano.
      Archivos: `apps/api/src/modules/auth/http/auth.controller.ts`, `.../application/password.use-cases.ts`, `auth.use-cases.test.ts`, `apps/api/test/auth.test.ts`
      Depende de: F21-T001 · Verificación: CA-2, CA-3
- [x] F21-T005 [TDD] Limpieza al iniciar sesión y último ingreso por organización:
      - `deleteExpiredForUser` y `deleteSpentForUser`;
      - `recordSuccessfulLogin` con `organizationId`;
      - `lastAccessAt` en `switchOrganization`;
      - `MembersService.list` con `lastAccessAt`.
      Archivos: puertos y repositorios de auth, `login.use-case.ts`, `members.service.ts`, `apps/api/test/{auth,organization-switch}.test.ts`
      Depende de: F21-T002 · Verificación: CA-4, CA-8

## Bloque C — Miembros y organizaciones

- [x] F21-T006 [TDD] Primero los casos de CA-5 y el punto de revisión 3, reemplazando las pruebas de las líneas 102 y 405. Después:
      - `revokeOrganizationSessions` en el puerto, Drizzle e `in-memory-auth.ts`;
      - `setActive` y la suspensión la usan después del commit, con `try/catch` y log.
      Archivos: `ports.ts`, `drizzle-auth.repositories.ts`, `in-memory-auth.ts`, `members.service.ts`, `organizations.service.ts`, `apps/api/test/organizations.test.ts`
      Depende de: F21-T001 · Verificación: CA-5
- [ ] F21-T007 [TDD] `LAST_ADMIN` dentro de la transacción, con `FOR UPDATE` sobre la organización y solo miembros con contraseña. Pruebas de CA-6 y del punto de revisión 4.
      Archivos: `members.service.ts`, `apps/api/test/organizations.test.ts`
      Depende de: F21-T006 · Verificación: CA-6
- [ ] F21-T008 [TDD] Invitaciones por organización. Primero la prueba que reemplaza a F02 CA-20 y la del punto de revisión 1. Después:
      - se quita el borrado de `addMember`;
      - `selectNewestMembership` en el puerto, Drizzle e `in-memory-auth.ts`;
      - `ResetPasswordUseCase` lo llama solo con `purpose = 'invite'`.
      Archivos: `member-onboarding.ts`, `password.use-cases.ts`, puertos y repositorios de auth, `apps/api/test/organizations.test.ts`
      Depende de: F21-T005 · Verificación: CA-7

## Bloque D — Logs

- [ ] F21-T009 [TDD] `serializeError` con su prueba contra Postgres real, y `serializers.err` en `logger.module.ts`.
      Archivos: `apps/api/src/shared/logging/{serialize-error,logger.module}.ts`, `apps/api/test/foundation.test.ts`
      Depende de: F21-T001 · Verificación: CA-9

## Bloque E — Web

- [ ] F21-T010 [TDD] `lib/query-client.ts`, y `logout()` vacía la caché.
      Archivos: `apps/web/src/lib/{query-client,auth-api,auth-api.test}.ts`, `apps/web/src/main.tsx`
      Verificación: CA-10
- [ ] F21-T011 [TDD] Los `401` de sesión perdida fuera de `/auth/` avisan a `sessionExpiredListeners`.
      Archivos: `apps/web/src/lib/{api-client,api-client.test}.ts`
      Depende de: F21-T010 · Verificación: CA-11
- [ ] F21-T012 [TDD] `appRedirect` en `navigation.ts`, usado por `_app.tsx`.
      Archivos: `apps/web/src/lib/{navigation,navigation.test}.ts`, `apps/web/src/routes/_app.tsx`
      Verificación: CA-12

## Bloque F — Cierre

- [ ] F21-T013 Cierre:
      - verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`);
      - notas de implementación en `plan.md`;
      - F21 marcada "Hecho" en el roadmap;
      - PR. Lo mergea el usuario.
      Depende de: F21-T003 a F21-T012 · Verificación: CA-13
