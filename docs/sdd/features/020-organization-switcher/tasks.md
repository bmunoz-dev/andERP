# F20 — Selector de organización · Tareas

- **Rama:** `feat/020-organization-switcher` (PR 1: bloques A–C; PR 2: bloque D)
- **Plan:** [plan.md](plan.md)

## Bloque A — Diseño y base de datos

- [x] F20-T001 Actualizar `design.md` antes del código:
      - §5.3: `sessions.organization_id` con `sessions_membership_fk` y `organization_members.last_selected_at`;
      - §6: la organización activa vive en la sesión; el guard compara el `org` del token con ella;
      - §8: selector en la cabecera y recarga en `/egresos`;
      - §11: sale "selector de organización" de fuera de alcance (sigue el registro autoservicio);
      - historial de cambios.
      Archivos: `docs/sdd/design.md`
- [ ] F20-T002 [TDD] Primero los casos de FK y relleno en `organization-switch.test.ts`; después:
      - `lastSelectedAt` y `sessions.organizationId` con la FK en `core.ts`;
      - `0035_organization_switcher` generada y editada a mano (columna nula, relleno, borrado de huérfanas, `NOT NULL`, FK);
      - `sessions_membership_fk` en `registerConstraintCodes`.
      Archivos: `apps/api/src/db/schema/core.ts`, `apps/api/drizzle/0035_*.sql`, `apps/api/src/modules/auth/auth.module.ts`, `apps/api/test/organization-switch.test.ts`
      Depende de: F20-T001 · Verificación: CA-1, CA-2

## Bloque B — Compartido

- [ ] F20-T003 [P] [TDD] En shared:
      - `organizations` en `authProfileSchema`;
      - `switchOrganizationSchema`;
      - `ORGANIZATION_CHANGED` con su mensaje en español.
      Archivos: `packages/shared/src/schemas/auth.ts`, `packages/shared/src/errors/codes.ts`, `apps/web/src/lib/error-messages.es.ts`
      Verificación: CA-7, CA-10

## Bloque C — API

- [ ] F20-T004 [TDD] Casos de entrada, refresh y perfil, y después:
      - `findMemberships` en el puerto, Drizzle e `in-memory-auth.ts`;
      - `requireAccess` con `preferredOrgId` y `organizations`; `toProfile` con `organizations`;
      - `organizationId` en `NewSession`, `SessionRecord` y `SessionIssuer`;
      - login, refresh y `GetCurrentUserUseCase` con la organización de la sesión.
      Depende de: F20-T002, F20-T003 · Verificación: CA-3–CA-7
- [ ] F20-T005 [TDD] Casos del guard y después:
      - `findActiveFamilyOrganization` en lugar de `isFamilyActive`;
      - `409 ORGANIZATION_CHANGED` si el `org` del token no es el de la sesión, o si la organización de la sesión dejó de estar disponible.
      Depende de: F20-T004 · Verificación: CA-10–CA-12
- [ ] F20-T006 [TDD] Casos del cambio y después:
      - `switchOrganization` en el puerto, Drizzle e `in-memory-auth.ts`;
      - `SwitchOrganizationUseCase` y `POST /auth/organization` (`204`, `404`, sin escritura si es la activa, auditoría `auth.organization_switch`).
      Depende de: F20-T005 · Verificación: CA-8, CA-9, CA-10
- [ ] F20-T007 Cierre del PR 1:
      - verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`);
      - notas de implementación en `plan.md` y roadmap;
      - PR 1. Lo mergea el usuario.
      Depende de: F20-T006 · Verificación: CA-17, CA-18

## Bloque D — Web (PR 2)

- [ ] F20-T008 [TDD] Selector:
      - `switchOrganization` en `auth-api.ts`;
      - `lib/organization-switch.ts` (`goHome`, `announceSwitch`, `listenForSwitch`);
      - `OrganizationSwitcher` y su uso en `_app.tsx`.
      Depende de: F20-T007 (PR 1 en producción) · Verificación: CA-13, CA-14, CA-16
- [ ] F20-T009 [TDD] Otras pestañas:
      - `ORGANIZATION_CHANGED` en `api-client.ts` llama a `goHome`;
      - `listenForSwitch()` en `main.tsx`.
      Depende de: F20-T008 · Verificación: CA-15
- [ ] F20-T010 Cierre:
      - verificación completa y Definición de Hecho;
      - notas de implementación en `plan.md`;
      - F20 marcada "Hecho" en el roadmap;
      - PR 2. Lo mergea el usuario;
      - después del despliegue, verificación manual del usuario (CA-19).
      Depende de: F20-T009 · Verificación: CA-17–CA-19
