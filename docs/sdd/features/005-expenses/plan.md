# F05 — Egresos y matriz mensual · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Migraciones

0. **`0010_week_of_month_fn` (custom):**
   ```sql
   CREATE FUNCTION week_of_month(d date) RETURNS smallint
     LANGUAGE sql IMMUTABLE PARALLEL SAFE
     AS $$ SELECT LEAST((EXTRACT(DAY FROM d)::int - 1) / 7 + 1, 4)::smallint $$;
   ```
1. **`0011_expenses` (generada y revisada):**
   - `expenses` con la FK compuesta a `expense_categories`, `CHECK (amount > 0)` y `char_length(invoice_number) <= 40`.
   - `week_of_month smallint GENERATED ALWAYS AS (week_of_month(payment_date)) STORED`.
   - `INDEX expenses_org_date_idx (organization_id, payment_date) WHERE deleted_at IS NULL`.
2. **`0012_expenses_rules` (custom). Triggers:**
   - `expenses_reject_fees_category` (`BEFORE INSERT OR UPDATE OF category_id`): si la categoría tiene `system_code = 'FEES'` → `FEES_CATEGORY_NOT_ALLOWED`.
   - `expense_categories_protect_expenses` (`BEFORE UPDATE OF deleted_at`): si se llena `deleted_at` y hay egresos no borrados → `CATEGORY_HAS_EXPENSES`.
3. **`0013_expense_views` (custom):**
   ```sql
   CREATE VIEW v_expense_ledger WITH (security_invoker = true) AS
     SELECT e.organization_id, 'manual' AS source, e.id AS source_id, e.category_id,
            e.concept, e.invoice_number, e.payment_date,
            EXTRACT(YEAR FROM e.payment_date)::int AS year,
            EXTRACT(MONTH FROM e.payment_date)::int AS month,
            e.week_of_month, e.amount
     FROM expenses e WHERE e.deleted_at IS NULL
     UNION ALL
     SELECT fp.organization_id, 'fee_payment', fp.id, c.id,
            'Honorarios – ' || sp.name || ' – Sem ' || fp.week_of_month || ' '
              || lpad(fp.period_month::text, 2, '0') || '/' || fp.period_year,
            NULL, fp.payment_date,
            EXTRACT(YEAR FROM fp.payment_date)::int,
            EXTRACT(MONTH FROM fp.payment_date)::int,
            week_of_month(fp.payment_date),
            t.total_amount
     FROM fee_payments fp
     JOIN v_fee_payment_totals t ON t.fee_payment_id = fp.id
     JOIN provider_contracts pc ON pc.organization_id = fp.organization_id AND pc.id = fp.contract_id
     JOIN service_providers sp  ON sp.organization_id = pc.organization_id AND sp.id = pc.service_provider_id
     JOIN expense_categories c  ON c.organization_id = fp.organization_id AND c.system_code = 'FEES'
     WHERE fp.deleted_at IS NULL;

   CREATE VIEW v_expense_monthly_summary WITH (security_invoker = true) AS
     SELECT organization_id, year, month, category_id, week_of_month, SUM(amount) AS amount
     FROM v_expense_ledger
     GROUP BY organization_id, year, month, category_id, week_of_month;
   ```
   La fórmula de la semana existe en dos lugares: la función SQL `week_of_month` (la usan la columna generada y la vista) y `weekOfMonth` en `@anderp/shared`. Una prueba las compara para todos los días de 2024 a 2030, así no pueden desincronizarse.

## Módulos

```
modules/expenses/          CRUD (no hexagonal); valida la categoría activa y que no sea FEES
modules/reports/
  expense-reports.controller.ts    /reports/expenses/monthly, /reports/expenses/ledger
  expense-reports.queries.ts       SQL sobre las vistas; arma la matriz (4 semanas × categorías)
```

**Cómo se arma la matriz.** Una consulta trae las categorías (activas, más las inactivas con montos) y otra trae el resumen del mes. El backend las combina en la estructura de CA-11 **sin sumar en JS**:
- las celdas vienen de la vista;
- los totales por fila, por semana y el total general salen de una tercera consulta con `GROUPING SETS ((category_id), (week_of_month), ())`.

**Rendimiento.** El índice `(organization_id, payment_date)` más el filtro por rango de fechas (`payment_date >= inicio_mes AND < inicio_mes_siguiente`) en lugar de `year`/`month` calculados. Para eso, las consultas del reporte filtran por `payment_date` y las vistas también exponen `payment_date`.

## Endpoints

| Método | Ruta |
|---|---|
| GET, POST | `/expenses` |
| GET, PATCH, DELETE | `/expenses/:id` |
| GET | `/reports/expenses/monthly?year=&month=` |
| GET | `/reports/expenses/ledger?year=&month=&categoryId=&week=` |

## Web

- **`egresos/index.tsx`:** es la pantalla de inicio de la app después del login.
  - Contiene `MonthPicker`, `ExpenseMatrix` (tabla con columnas fijas: la categoría a la izquierda y el total a la derecha) y `LedgerSheet` (panel lateral `Sheet` de shadcn).
  - El mes seleccionado va en la URL (`?y=2026&m=9`) para poder compartir el enlace.
- **`ExpenseForm`:** `WeekSelect` + `DateInput` con `min`/`max` según `weekRange`. Después de guardar, invalida las consultas de la matriz y del libro.

## Notas de implementación

- **Migraciones reales:** `0011_week_of_month_fn`, `0012_expenses`, `0013_expenses_rules` y `0014_expense_ledger` (F04 ocupó hasta la `0010`).
- **Sin `v_expense_monthly_summary`:** la matriz sale de una sola consulta `GROUP BY GROUPING SETS` sobre `v_expense_ledger` (celdas, totales por categoría, por semana y del mes). Una vista menos que mantener.
- **Sin `GET /expenses`:** el listado del mes lo da el libro (`/reports/expenses/ledger`), que ya une egresos manuales y honorarios.
- **Reglas solo en la base de datos:** `FEES_CATEGORY_NOT_ALLOWED` y `CATEGORY_HAS_EXPENSES` las lanzan los triggers y el filtro de errores las devuelve como `422` con su `code`; el servicio no las repite. El servicio sí valida `INACTIVE_CATEGORY` (no hay trigger para eso).
- **Pruebas (T010):** el escenario completo está repartido en varias pruebas de `test/expenses.test.ts`: matriz con honorarios pagados el mes siguiente, totales por semana y del mes, categoría inactiva con montos y filtros del libro.
