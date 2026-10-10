# F10 — Monto mensual de referencia en los contratos · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Datos (una migración escrita a mano)

1. `ALTER TABLE provider_contracts RENAME COLUMN total_amount TO monthly_amount` y renombrar el CHECK `provider_contracts_total_amount_ck` a `provider_contracts_monthly_amount_ck`.
2. Borrar el trigger y la función `fee_payment_days_check_balance` (constraint trigger diferido de F04) y `provider_contracts_check_total`.
3. `DROP VIEW v_contract_balances` y crear `v_contract_month_totals` (`security_invoker`): `organization_id`, `contract_id`, `period_year`, `period_month`, `paid_amount numeric(14,2)`, agrupando `v_fee_payment_totals` por contrato y periodo.

En Drizzle: `totalAmount` → `monthlyAmount`; la vista `contractBalances` → `contractMonthTotals`. Se retira `CONTRACT_BALANCE_EXCEEDED` de `codes.ts` y de `error-messages.es.ts`.

Producción tiene 0 contratos: no hay datos que convertir. En local, los contratos de prueba conservan el número, que pasa a leerse como mensual.

## API

- `contract-queries.ts`: `contractColumns` deja `paidAmount` y `balance`; el contrato vigente agrega `paidThisMonth` con un `LEFT JOIN` a `v_contract_month_totals` del mes actual en Bogotá.
- `GET /contracts?overlaps=` agrega `monthlyAmount` y `paidInMonth` (mes de `inicio`), y acepta `excludePayment` para restar el pago que se edita.
- `fee-payments.service.ts`: se quita `lockContract` (el `SELECT … FOR UPDATE` existía solo para el tope).

## Web

- `fee-payment-form.tsx`: resumen del mes con `sumMoney` (solo para la vista previa) y aviso ámbar sin bloquear.
- `prestadores/$id.tsx`, `prestadores/index.tsx` y `contract-form-dialog.tsx`: textos y columnas nuevas.

## Despliegue

Primera feature con migración por el pipeline (F07): CI → aprobación → migración → deploy. El renombre rompe la API anterior durante los 2 o 3 minutos entre la migración y el despliegue. Con 0 contratos en producción no hay impacto. Con datos reales se haría en dos pasos (columna nueva y luego borrar la vieja).

## Notas de implementación

- **Snapshot de Drizzle.** La migración 0019 es escrita a mano, así que su snapshot se ajustó a mano: columna `monthly_amount`, su CHECK y la vista `v_contract_month_totals` en lugar de `v_contract_balances` (Drizzle también guarda las vistas `.existing()`). `drizzle-kit generate` confirma "No schema changes".
- **`paidThisMonth`** se calcula para todos los contratos con un `LEFT JOIN` al mes actual (no solo el vigente): es la misma consulta y evita dos formas de contrato.
- **`fee-payments.service`**: `lockContract` pasó a `assertContract` sin `FOR UPDATE`; el bloqueo de fila solo existía para el tope de F04.
- **Pruebas:** la prueba en SQL (T001) se escribió antes de la migración, pero solo se pudo correr al final (Docker estaba cerrado). En la web (T004) la prueba se escribió después del código; para compensar se comprobó que falla si se quita el aviso.
