# F16 — Pagos de monto fijo · Plan

- **Estado:** Borrador (pendiente de aprobación)
- **Spec:** [spec.md](spec.md)

## Datos (dos migraciones)

1. **Generada con Drizzle** (`pnpm db:generate --name fixed_payments`):
   - el enum `payment_mode` (`daily`, `fixed`);
   - `provider_contracts.payment_mode NOT NULL DEFAULT 'daily'`;
   - la tabla `fixed_payments` con `UNIQUE (organization_id, id)`, la FK compuesta `(organization_id, contract_id)` → `provider_contracts`, los CHECK `fixed_payments_amount_ck` (`amount > 0`) y de año y mes (como en `fee_payments`), y un índice por `(contract_id, period_year, period_month)`.

2. **Escrita a mano** (`pnpm db:generate:custom --name fixed_payment_rules`). Igual que en `0008`, el mensaje de cada excepción es el `code` que devuelve la API. Las funciones nuevas llevan `SET search_path = ''` para no sumar avisos `function_search_path_mutable` (pendiente 3 de F07).
   - `fixed_payments_validate` (`BEFORE INSERT OR UPDATE`):
     - el contrato debe ser `fixed` (`CONTRACT_PAYMENT_MODE_MISMATCH`);
     - el mes trabajado debe cruzarse con las fechas del contrato (`FIXED_PAYMENT_OUTSIDE_CONTRACT`);
     - en un UPDATE, `contract_id`, `period_year` y `period_month` no cambian (`FIXED_PAYMENT_PERIOD_IMMUTABLE`).
   - `fee_payments_check_mode` (`BEFORE INSERT ON fee_payments`): el contrato debe ser `daily` (`CONTRACT_PAYMENT_MODE_MISMATCH`). Basta con el INSERT, porque el contrato del pago ya es inmutable (`fee_payments_period_immutable`).
   - `CREATE OR REPLACE FUNCTION provider_contracts_protect_payments`, que añade tres reglas a las de F04:
     - borrar un contrato con `fixed_payments` vivos → `CONTRACT_HAS_PAYMENTS`;
     - fechas nuevas que dejan fuera el mes de un pago fijo → `CONTRACT_DATES_EXCLUDE_PAYMENTS`;
     - cambiar `payment_mode` con pagos de cualquiera de las dos tablas → `CONTRACT_PAYMENT_MODE_LOCKED`.

     Es la misma función, así que se le añade `SET search_path = ''` y se califican todas sus tablas.
   - `CREATE OR REPLACE VIEW v_contract_month_totals`: `UNION ALL` de `v_fee_payment_totals` (como hoy) y `fixed_payments` no borrados, agrupado por contrato y mes trabajado.
   - `CREATE OR REPLACE VIEW v_expense_ledger`: una tercera rama, `'fixed_payment'`. Las columnas no cambian, así que `v_expense_monthly_summary` no se toca. El nombre del mes en el concepto se forma igual que en la rama de honorarios.

**Cruce de un mes con el contrato:** `make_date(y, m, 1) <= coalesce(end_date, 'infinity')` y `(make_date(y, m, 1) + interval '1 month - 1 day')::date >= start_date`.

**Drizzle:** `paymentMode` en `providerContracts`, y la tabla `fixedPayments` en `schema/`.

**Códigos nuevos** en `codes.ts` y `error-messages.es.ts`: `CONTRACT_PAYMENT_MODE_LOCKED`, `CONTRACT_PAYMENT_MODE_MISMATCH`, `FIXED_PAYMENT_OUTSIDE_CONTRACT` y `FIXED_PAYMENT_PERIOD_IMMUTABLE`. El último solo se alcanza por SQL, pero el mapeo de `P0001` lo necesita. `fixed_payments_amount_ck` va en `registerConstraintCodes` → `VALIDATION_ERROR`.

**Producción:** las dos migraciones solo añaden cosas (una columna con valor por defecto, un enum, una tabla, funciones y vistas reemplazadas con las mismas columnas). La API anterior sigue funcionando en los minutos entre la migración y el despliegue. Se despliega sin respaldo, por decisión del usuario del 2026-10-17.

## Shared

- `paymentModeSchema` y `paymentMode` en los esquemas de contrato (crear y editar, con valor por defecto `daily`).
- `saveFixedPaymentSchema` (crear), `updateFixedPaymentSchema` (`paymentDate`, `amount`, `notes`; `.strict()`, para que `contractId` o el periodo respondan `VALIDATION_ERROR`) y el tipo `FixedPayment`.
- `LedgerEntry.source` suma `'fixed_payment'`.

## API

- **`service-providers`:**
  - `paymentMode` en las consultas y el alta de contratos, y en `GET /contracts?overlaps=`;
  - en `PATCH /contracts/:id`, antes de actualizar, el servicio comprueba si el contrato tiene pagos en `fee_payments` o en `fixed_payments`, y si los tiene y el modo cambia responde `CONTRACT_PAYMENT_MODE_LOCKED`;
  - el borrado y el cambio de fechas cubren también `fixed_payments` (el servicio replica lo que hace el trigger, como en F04).
- **`fee-payments.service`:** `assertContract` rechaza un contrato `fixed` con `CONTRACT_PAYMENT_MODE_MISMATCH`.
- **Módulo nuevo `fixed-payments`** (controlador y servicio en `fixed-payments.module.ts` y `fixed-payments.service.ts`, como `fee-payments`):
  - CRUD con `OrgScope`;
  - un `assertContract` que comprueba el modo y el cruce de fechas con la regla de `packages/shared`;
  - auditoría con `AuditService` dentro de la transacción (F12);
  - el listado hace `JOIN` a contrato y persona para devolver el nombre.

## Web

- **Renombrado** (`lib/navigation.ts`, títulos y textos):
  - `routes/_app/prestadores/` pasa a `routes/_app/personal/` y `routes/_app/honorarios/` pasa a `routes/_app/pagos/`, moviendo los archivos con `git mv`;
  - el `routeTree` se regenera;
  - se actualizan los `Link` en `ledger-sheet.tsx` y en las rutas.
- **`contract-form-dialog.tsx`:** el select "Forma de pago" queda deshabilitado si el contrato tiene pagos. Para saberlo, se usa el `paidAmount` o el `paidThisMonth` que ya llega; si no basta, se añade `hasPayments` a la respuesta del contrato. La ficha de la persona muestra la forma de pago en la tabla de contratos.
- **`pagos/index.tsx`:**
  - pestañas "Por días" y "Monto fijo", con el parámetro de búsqueda `tab` para que el libro de egresos pueda enlazar a la pestaña correcta;
  - "Por días" es el contenido actual, extraído a un componente;
  - "Monto fijo" es `components/fixed-payments/fixed-payments-tab.tsx`, con filtros de año y mes y un `DataTable`.
- **`components/fixed-payments/fixed-payment-form-dialog.tsx`:** un diálogo, como `expense-form-dialog`, que sirve para crear y editar. Las personas salen de `GET /contracts?overlaps=` del mes, filtradas por `paymentMode === 'fixed'`, y el resumen del mes usa `paidInMonth` y `monthlyAmount`, como el formulario de F04.
- **`ledger-sheet.tsx`:** una entrada `fixed_payment` enlaza a `/pagos?tab=fijo`, con el año y el mes de esa entrada.
- Al guardar o borrar se invalidan `fixedPaymentKeys`, `providerKeys` y `expenseKeys`.

## Pruebas

- **`test/fixed-payments.db.test.ts`:**
  - los triggers: modo en las dos tablas, cruce de fechas, inmutabilidad, protección del contrato (borrado, fechas y cambio de modo);
  - las vistas: el caso $100.000 + $50.000 + $30.000 = $180.000, el pago fijo en el mes y la semana de `payment_date`, y `v_contract_month_totals` por mes trabajado;
  - los borrados no suman.
- **`test/fixed-payments.test.ts`:**
  - CRUD, los códigos de error y la auditoría en la misma transacción;
  - el aislamiento (`404` desde otra organización y el listado vacío);
  - la regla de modo en `POST /fee-payments`, `paymentMode` en los contratos y la presencia en OpenAPI.
- **Web:** `fixed-payment-form-dialog.test.tsx` (validación, personas filtradas por modo y envío) y una prueba del select deshabilitado en `contract-form-dialog`.
- **Pruebas existentes:** se actualizan las que fijan las rutas `/prestadores` y `/honorarios` y los textos que cambian.

## Notas de implementación

_(Se completan al implementar.)_
