# F10 — Monto mensual de referencia en los contratos · Tareas

- **Rama:** `feat/010-monthly-contract-amount`
- **Plan:** [plan.md](plan.md)

- [ ] F10-T001 [TDD] Migración: renombrar a `monthly_amount`, quitar los dos triggers de saldo y cambiar la vista por `v_contract_month_totals`. Pruebas en SQL: agrupa por mes trabajado, no cuenta borrados y permite superar el monto.
      Verificación: CA-1–CA-4
- [ ] F10-T002 Drizzle, esquemas compartidos y códigos de error (retirar `CONTRACT_BALANCE_EXCEEDED`).
      Depende de: F10-T001
- [ ] F10-T003 [TDD] API: `monthlyAmount`, `paidThisMonth`, `paidInMonth` con `excludePayment`; quitar el bloqueo de F04. Actualizar las pruebas de F03, F04 y F09 que usan `totalAmount` o el bloqueo.
      Depende de: F10-T002 · Verificación: CA-1–CA-8
- [ ] F10-T004 [TDD] Web: resumen y aviso en el formulario de pago; ficha, listado y formulario de contrato.
      Depende de: F10-T003 · Verificación: CA-9, CA-10
- [ ] F10-T005 Verificación manual del usuario, actualizar F04 (CA-9 y CA-10 reemplazados), `design.md` y `roadmap.md`.
