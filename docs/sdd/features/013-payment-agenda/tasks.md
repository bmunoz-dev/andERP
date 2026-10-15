# F13 — Agenda de pagos a entidades · Tareas

- **Rama:** `feat/013-payment-agenda`
- **Plan:** [plan.md](plan.md)

## Bloque A — Base de datos

- [x] F13-T001 [TDD] Escribir `obligations.db.test.ts` y después crear `0024_payment_obligations`, `0025_obligation_rules` y `db/schema/obligations.ts`. Agregar `obligation_frequency` a la lista de enums de `foundation.test.ts`.
      Archivos: `apps/api/drizzle/0024_*.sql`, `apps/api/drizzle/0025_*.sql`, `apps/api/src/db/schema/obligations.ts`
      Verificación: CA-1, CA-2, CA-5, CA-9

## Bloque B — Compartido

- [x] F13-T002 [P] [TDD] `addMonths` con sus pruebas, los esquemas Zod de `schemas/obligations.ts`, `FREQUENCY_MONTHS` y los seis códigos de error con su mensaje en español.
      Archivos: `packages/shared/src/dates/calendar-date.ts`, `packages/shared/src/schemas/obligations.ts`, `packages/shared/src/errors/codes.ts`, `apps/web/src/lib/error-messages.es.ts`
      Verificación: CA-1, CA-20 (regla de la fecha sugerida)

## Bloque C — API

- [x] F13-T003 [TDD] Escribir la primera parte de `obligations.test.ts` y crear el módulo: crear (con el primer vencimiento), editar, borrar, la agenda (estados, `daysLeft`, orden y filtro) y el detalle con historial, todo con auditoría atómica.
      Depende de: F13-T001, F13-T002 · Verificación: CA-1–CA-4, CA-10–CA-14
- [x] F13-T004 [TDD] Completar (con `dueDateId`, con y sin siguiente, 409 y 404), completar en paralelo, y `PUT` y `DELETE` del pendiente.
      Depende de: F13-T003 · Verificación: CA-5–CA-8, CA-13
- [x] F13-T005 Aislamiento con `seedTwoOrgs()` y endpoints en OpenAPI.
      Depende de: F13-T004 · Verificación: CA-15

## Bloque D — Web

- [x] F13-T006 [TDD] `obligations-api.ts` con `countAlerts`, `AgendaBadge` en el menú, "Agenda" en `navigation.ts`, `AgendaTable` y la página `/agenda` con pestañas en la URL.
      Depende de: F13-T003 · Verificación: CA-16–CA-18
- [x] F13-T007 [TDD] `ObligationFormDialog`, `CompleteDueDateDialog` y `ObligationHistorySheet`, conectados a la página.
      Depende de: F13-T004, F13-T006 · Verificación: CA-19–CA-21

## Cierre

- [x] F13-T008 Verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`), Definición de Hecho (cada CA con prueba) y notas de implementación en `plan.md`.
      Depende de: F13-T005, F13-T007
- [ ] F13-T009 Verificación manual del usuario (crear una obligación trimestral, verla como Próxima, completarla con la fecha sugerida, ver el historial, quitar un pendiente y el contador del menú) y `roadmap.md`.
      Depende de: F13-T008
- [ ] F13-T010 [TDD] Resolver los hallazgos de la auditoría (`plan.md`): "Días de aviso" vacío → error de validación en español; mensajes en español en `noticeDays`; registrar `obligation_due_dates_date_uq` con un código propio (`DUE_DATE_ALREADY_EXISTS`) y su mensaje.
      Depende de: F13-T008 · Verificación: CA-1, CA-6, CA-8, CA-19
