# F14 — Panel de notificaciones · Tareas

- **Rama:** `feat/014-notifications`
- **Plan:** [plan.md](plan.md)

## Bloque A — Base de datos

- [ ] F14-T001 [TDD] Escribir `notifications.db.test.ts` y después crear `0026_notification_states` y `db/schema/notifications.ts`. Agregar `notification_kind` a la lista de enums de `foundation.test.ts`.
      Archivos: `apps/api/drizzle/0026_*.sql`, `apps/api/src/db/schema/notifications.ts`
      Verificación: CA-1, CA-5

## Bloque B — Compartido

- [ ] F14-T002 [P] Esquemas Zod de `schemas/notifications.ts` y el código `NOTIFICATION_NOT_FOUND` con su mensaje en español.
      Archivos: `packages/shared/src/schemas/notifications.ts`, `packages/shared/src/errors/codes.ts`, `apps/web/src/lib/error-messages.es.ts`
      Verificación: CA-7, CA-9

## Bloque C — API

- [ ] F14-T003 [TDD] Escribir `notifications.test.ts` y crear el módulo: `GET`, `/seen` y `/dismiss` sobre `ObligationsService.list()`, con los casos de aparecer, desaparecer, volver al vencerse, cambio de fecha, por usuario y sin auditoría.
      Depende de: F14-T001, F14-T002 · Verificación: CA-1–CA-10
- [ ] F14-T004 Aislamiento con `seedTwoOrgs()`, `401` sin sesión y endpoints en OpenAPI.
      Depende de: F14-T003 · Verificación: CA-10, CA-11

## Bloque D — Web

- [ ] F14-T005 [TDD] `ui/popover.tsx`, `notifications-api.ts` (clave bajo `obligationKeys.all`), `STATUS_CLASSES` exportado, `NotificationsBell` y su lugar en la cabecera.
      Depende de: F14-T003 · Verificación: CA-12–CA-19

## Cierre

- [ ] F14-T006 Verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`), Definición de Hecho (cada CA con prueba) y notas de implementación en `plan.md`.
      Depende de: F14-T004, F14-T005
- [ ] F14-T007 Verificación manual del usuario (ver el punto con una obligación próxima, abrir el panel y ver que se apaga, ir a la Agenda, descartar, pasarla a vencida y ver que vuelve) y `roadmap.md`.
      Depende de: F14-T006
