# F16 — Pagos de monto fijo · Tareas

- **Rama:** `feat/016-fixed-payments`
- **Plan:** [plan.md](plan.md)

- [x] F16-T001 [TDD] Migraciones: enum y columna `payment_mode`, tabla `fixed_payments`, triggers (modo en las dos tablas, cruce de fechas, inmutabilidad, protección del contrato) y Drizzle. Pruebas en SQL de cada regla.
      Verificación: CA-1, CA-3, CA-5–CA-7, CA-9, CA-12–CA-14 (en la base de datos)
- [x] F16-T002 [TDD] Vistas `v_contract_month_totals` y `v_expense_ledger` con la tercera fuente. Pruebas en SQL: sin doble conteo, mes y semana de `payment_date`, mes trabajado, borrados.
      Depende de: F16-T001 · Verificación: CA-15–CA-17
- [x] F16-T003 [TDD] Shared (esquemas, `LedgerEntry.source`, códigos y mensajes) y API de contratos: `paymentMode`, `CONTRACT_PAYMENT_MODE_LOCKED`, borrado y fechas con pagos fijos, regla de modo en `POST /fee-payments`.
      Depende de: F16-T001 · Verificación: CA-2, CA-3, CA-12–CA-14, CA-24
- [x] F16-T004 [TDD] Módulo `fixed-payments`: CRUD con `OrgScope`, auditoría atómica, aislamiento y OpenAPI.
      Depende de: F16-T003 · Verificación: CA-4–CA-11, CA-18
- [x] F16-T005 [TDD] Web: renombrado a "Personal" y "Pagos" (rutas, menú, textos, enlaces) y "Forma de pago" en el contrato.
      Depende de: F16-T003 · Verificación: CA-19, CA-20
- [x] F16-T006 [TDD] Web: pestaña "Monto fijo", diálogo de crear y editar, enlace desde el libro de egresos e invalidación de consultas.
      Depende de: F16-T004, F16-T005 · Verificación: CA-21–CA-23
- [ ] F16-T007 `design.md` (si la implementación cambió algo), notas de implementación, verificación completa (`format:check`, `lint`, `typecheck`, `test`), verificación manual del usuario y `roadmap.md`.
      Depende de: F16-T006
