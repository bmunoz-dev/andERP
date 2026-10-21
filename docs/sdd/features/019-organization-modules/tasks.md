# F19 — Módulos por organización · Tareas

- **Ramas:** `feat/019-organization-modules` (PR 1: bloques A–C) y `feat/019-organization-modules-web` (PR 2: bloque D)
- **Plan:** [plan.md](plan.md)

## Bloque A — Diseño y base de datos

- [x] F19-T001 Actualizar `design.md` antes del código:
      - §2: decisión 1, "Tenencia": pasa de uso interno a varias empresas cliente. Decisión 12, "Roles": paquetes por organización;
      - §5.2: enum `app_module`;
      - §5.3: `organizations.modules`;
      - §6.4: tabla de permisos por paquete;
      - §8: menú filtrado y Plataforma → Organizaciones;
      - §11: aclarar que los permisos granulares por usuario siguen fuera;
      - historial de cambios.
      Archivos: `docs/sdd/design.md`
- [x] F19-T002 [TDD] Primero los casos de migración y valor por defecto en `organization-modules.test.ts`; después:
      - `appModule` en `enums.ts`;
      - `organizations.modules` en `core.ts`;
      - `0034_organization_modules` generada, con el `UPDATE` de relleno agregado a mano;
      - `seed.ts` y `fixtures.ts` con los cuatro paquetes;
      - `app_module` en `foundation.test.ts`.
      Archivos: `apps/api/src/db/schema/enums.ts`, `apps/api/src/db/schema/core.ts`, `apps/api/drizzle/0034_*.sql`, `apps/api/src/db/seed.ts`, `apps/api/test/setup/fixtures.ts`, `apps/api/test/foundation.test.ts`
      Depende de: F19-T001 · Verificación: CA-1, CA-2

## Bloque B — Compartido

- [x] F19-T003 [P] [TDD] En shared:
      - `APP_MODULES`, `appModuleSchema` y `appModulesSchema` (descarta repetidos);
      - `modules` en `organizationSchema`, `createOrganizationSchema`, `updateOrganizationSchema` y `authProfileSchema`;
      - `MODULE_DISABLED` con su mensaje en español;
      - una prueba de que `appModule.enumValues` de la API es igual a `APP_MODULES`.
      Archivos: `packages/shared/src/schemas/organizations.ts`, `packages/shared/src/schemas/auth.ts`, `packages/shared/src/errors/codes.ts`, `apps/web/src/lib/error-messages.es.ts`
      Verificación: CA-1, CA-4, CA-15

## Bloque C — API

- [x] F19-T004 [TDD] Casos de Plataforma en `organization-modules.test.ts` y después `organizations.service.ts`:
      - `POST` y `PATCH` con `modules`;
      - repetidos y valor inválido;
      - `modules` en `get` y en el listado;
      - `modules` en la auditoría de `organization.create` y `organization.update`.
      Depende de: F19-T002, F19-T003 · Verificación: CA-4–CA-7
- [ ] F19-T005 [TDD] Casos de perfil y token y después el cambio en auth:
      - `modules` en `MembershipRecord`, `findMembership`, `in-memory-auth.ts`, `Actor`, `JwtAuthGuard` y `toProfile`;
      - `/auth/me` con `modules`;
      - mismo token antes y después de apagar un paquete.
      Depende de: F19-T004 · Verificación: CA-8, CA-11, CA-15
- [ ] F19-T006 [TDD] Casos de cumplimiento y después el código:
      - pruebas: una ruta `GET` por controlador de cada paquete, apagado (403) y encendido (200, datos intactos); el super admin; A contra B; el libro de Egresos con `staff_payments` apagado; la prueba de cobertura con `DiscoveryService`;
      - código: `RequiresModule` y `ModuleGuard` en `guards.ts`, y el decorador en los 12 controladores.
      Depende de: F19-T005 · Verificación: CA-3, CA-9, CA-10, CA-12–CA-14, CA-25
- [ ] F19-T007 Cierre del PR 1:
      - verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`);
      - notas de implementación en `plan.md` y roadmap;
      - consulta de solo lectura en producción, con confirmación del usuario (CA-28);
      - PR 1. Lo mergea el usuario.
      Depende de: F19-T006 · Verificación: CA-27, CA-28

## Bloque D — Web (PR 2)

- [ ] F19-T008 [TDD] Menú y guardia:
      - `module` en `NavItem`;
      - `navigationFor` que filtra y quita los grupos vacíos;
      - `moduleForPath`;
      - redirección a `/egresos` en `_app.tsx`;
      - campana solo con `agenda`;
      - concepto sin enlace en `ledger-sheet.tsx`.
      Depende de: F19-T007 (PR 1 en producción) · Verificación: CA-16–CA-20, CA-24
- [ ] F19-T009 [TDD] Plataforma → Organizaciones:
      - `ModuleCheckboxes` y casillas en `CreateOrganizationDialog`;
      - `ModulesDialog` con la acción **Módulos**;
      - confirmación al quitar un paquete;
      - columna **Módulos** con insignias;
      - `modules` en `admin-api.ts`.
      Depende de: F19-T008 · Verificación: CA-21–CA-23, CA-26
- [ ] F19-T010 Cierre:
      - verificación completa y Definición de Hecho;
      - notas de implementación en `plan.md`;
      - F19 marcada "Hecho" en el roadmap;
      - PR 2. Lo mergea el usuario cuando `/auth/me` en producción ya devuelve `modules`;
      - después del despliegue, verificación manual del usuario (CA-28).
      Depende de: F19-T009 · Verificación: CA-27, CA-28
