# F12 — Auditoría atómica · Tareas

- **Rama:** `feat/012-atomic-audit`
- **Plan:** [plan.md](plan.md)

## Bloque A — Base

- [x] F12-T001 [TDD] Escribir `test/audit-atomicity.test.ts` con un caso por operación del CA-2 y verlo fallar. Agregar el parámetro `db?: DbExecutor` a `AuditLogger.log` y a `AuditService`.
      Archivos: `apps/api/test/audit-atomicity.test.ts`, `apps/api/src/modules/audit/audit.service.ts`
      Verificación: CA-1

## Bloque B — Servicios

- [x] F12-T002 `clickiu` y `expenses`: create, update y remove en una transacción con su auditoría.
      Depende de: F12-T001 · Verificación: CA-1, CA-2, CA-5
- [x] F12-T003 `fee-payments` y `contracts`: igual que T002.
      Depende de: F12-T001 · Verificación: CA-1, CA-2, CA-5
- [x] F12-T004 `organizations`, `members` (incluida la revocación después de confirmar en `setActive`) y `credentials.update`.
      Depende de: F12-T001 · Verificación: CA-1–CA-5

## Bloque C — Cierre

- [ ] F12-T005 Verificación completa (`format:check`, `lint`, `typecheck`, `test`), `roadmap.md` y notas de implementación en `plan.md`.
      Depende de: F12-T002–F12-T004
