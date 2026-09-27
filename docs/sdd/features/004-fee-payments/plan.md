# F04 — Pagos de honorarios · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Migraciones

1. **`0007_fee_payments` (generada y revisada a mano):**
   - `fee_payments` con `UNIQUE (organization_id, id)`, la FK compuesta a `provider_contracts`, los CHECK de año, mes y semana, y `fee_payments_period_uq (contract_id, period_year, period_month, week_of_month) WHERE deleted_at IS NULL`.
   - Columnas generadas (`GENERATED ALWAYS AS (...) STORED`):
     ```
     period_start = make_date(period_year, period_month, 1) + (week_of_month - 1) * 7
     period_end   = CASE WHEN week_of_month < 4
                      THEN make_date(period_year, period_month, 1) + (week_of_month - 1) * 7 + 6
                      ELSE (make_date(period_year, period_month, 1) + interval '1 month' - interval '1 day')::date
                    END
     ```
   - `fee_payment_days` con la FK compuesta `(organization_id, fee_payment_id)` y `ON DELETE CASCADE`, `CHECK (amount >= 0)` y `UNIQUE (fee_payment_id, work_date)`.
2. **`0008_fee_payments_rules` (custom). Triggers**, cada uno con `RAISE EXCEPTION` y un `MESSAGE` igual al `code`:
   - `fee_payment_days_validate` (`BEFORE INSERT OR UPDATE` en `fee_payment_days`): la fecha debe caer dentro del periodo de la cabecera (`WORK_DATE_OUTSIDE_WEEK`) y dentro de las fechas del contrato (`WORK_DATE_OUTSIDE_CONTRACT`).
   - `fee_payments_period_immutable` (`BEFORE UPDATE` en `fee_payments`): si cambian `contract_id`, `period_year`, `period_month` o `week_of_month` → `FEE_PAYMENT_PERIOD_IMMUTABLE`.
   - `provider_contracts_protect_payments` (`BEFORE UPDATE` en `provider_contracts`):
     - si se llena `deleted_at` y el contrato tiene pagos no borrados → `CONTRACT_HAS_PAYMENTS`;
     - si cambian las fechas y algún día pagado queda fuera → `CONTRACT_DATES_EXCLUDE_PAYMENTS`.
3. **`0009_fee_payment_views` (custom):**
   - `v_fee_payment_totals`: pagos no borrados, con `SUM(days.amount)` (`COALESCE` a 0).
   - `v_contract_balances`: contratos no borrados, con `paid_amount = COALESCE(SUM(v_fee_payment_totals.total_amount), 0)` y `balance = total_amount - paid_amount`.
   - Ambas vistas con `security_invoker = true` y `GRANT SELECT` a `app_runtime`.

## Módulo `fee-payments` (hexagonal)

```
modules/fee-payments/
  domain/
    fee-payment.ts                 agregado: create(), replaceDays(), changePaymentDate(), changeNotes()
    period.ts                      value object (year, month, week) → usa weekRange de @anderp/shared
    fee-payment-day.ts             value object (workDate, amount: Money, isHoliday)
    errors.ts
  application/
    ports/                         FeePaymentRepository, ContractReader, BalanceReader, AuditLogger, UnitOfWork
    commands/                      create-fee-payment, update-fee-payment, delete-fee-payment
  infrastructure/
    drizzle-fee-payment.repository.ts
    drizzle-contract.reader.ts
    drizzle-balance.reader.ts
  http/
    fee-payments.controller.ts
    fee-payments.queries.ts        lecturas (listado y detalle) directo en SQL, sin pasar por el dominio
```

**Invariantes del agregado** (se prueban en unitarias, sin base de datos):
- tiene al menos un día;
- no hay fechas repetidas;
- cada fecha cae dentro del periodo;
- cada fecha cae dentro del rango del contrato (se pasa `ContractDates` al crear);
- los montos son `Money` mayores o iguales a 0;
- el periodo y el contrato no cambian.

**Transacción.** `UnitOfWork` envuelve `db.transaction()`. El comando:
1. carga el contrato;
2. construye el agregado;
3. lo persiste (cabecera + `DELETE` e `INSERT` de los días);
4. lee `v_contract_balances` dentro de la misma transacción;
5. registra la auditoría;
6. devuelve el pago y sus `warnings`.

**Otras decisiones**
- **Errores de triggers:** vuelven como `P0001` y el mapper los traduce al mismo `code` que el dominio. La API responde igual lo detecte quien lo detecte.
- **Ampliaciones de F03:**
  - `contracts.service` valida `CONTRACT_HAS_PAYMENTS` y `CONTRACT_DATES_EXCLUDE_PAYMENTS` antes de escribir (el trigger queda como respaldo);
  - la consulta de contratos agrega `paidAmount` y `balance` desde `v_contract_balances`;
  - nuevo endpoint `GET /contracts?overlaps=`.
- **`@anderp/shared/money.ts`:** se agrega `sumMoney(values: Money[]): Money` con centavos en `BigInt`, para el total en vivo de la web.

## Endpoints

| Método | Ruta |
|---|---|
| GET, POST | `/fee-payments` |
| GET, PUT, DELETE | `/fee-payments/:id` |
| GET | `/contracts?overlaps=` |

## Web

- `honorarios/index.tsx`: filtros y `DataTable`.
- `honorarios/nuevo.tsx` y `honorarios/$id.tsx`: comparten el componente `FeePaymentForm`.
- `WeekGrid`: recibe `periodStart`/`periodEnd` (calculados en el cliente con `weekRange`) y el rango del contrato. Muestra entre 7 y 10 columnas con desplazamiento horizontal en móvil.
- El total en vivo usa `sumMoney`.
- El aviso de saldo usa un `Alert` de shadcn.
