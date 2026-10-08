# F05 — Egresos y matriz mensual · Tareas

- **Rama:** `feat/005-expenses`
- **Plan:** [plan.md](plan.md)

## Bloque A — Datos

- [x] F05-T001 [TDD] Crear la migración `0010_week_of_month_fn`, con una prueba que compara la función SQL contra `weekOfMonth` de TypeScript para todos los días de 2024 a 2030.
      Verificación: CA-2
- [x] F05-T002 Definir `expenses` en Drizzle (la columna generada usa `week_of_month(payment_date)`). Generar `0011_expenses` y revisarla.
      Depende de: F05-T001
- [x] F05-T003 [TDD] Escribir las pruebas de los triggers (egreso en la categoría FEES y borrado de una categoría con egresos) y después crear `0012_expenses_rules`.
      Depende de: F05-T002 · Verificación: CA-3, CA-7
- [x] F05-T004 [TDD] Escribir las pruebas de las vistas y después crear `0013_expense_views`:
      - no hay doble conteo (CA-9);
      - un pago de honorarios cae en el mes y la semana de su fecha de pago (CA-10);
      - el concepto generado es correcto;
      - los borrados no aparecen, en ninguno de los dos orígenes.
      Depende de: F05-T002 · Verificación: CA-8–CA-10

## Bloque B — API

- [x] F05-T005 Crear los esquemas en `@anderp/shared/schemas/expenses.ts`.
- [x] F05-T006 [TDD] Crear el servicio y el controlador de egresos: validación de la categoría (FEES e inactiva), CRUD y auditoría.
      Depende de: F05-T003, F05-T005 · Verificación: CA-1, CA-3–CA-6
- [x] F05-T007 Añadir la regla `CATEGORY_HAS_EXPENSES` al servicio de categorías de F02.
      Depende de: F05-T003 · Verificación: CA-7
- [x] F05-T008 [TDD] Crear las consultas de la matriz (categorías, celdas y `GROUPING SETS`) y del libro, y el controlador de reportes.
      Depende de: F05-T004 · Verificación: CA-11, CA-12
- [x] F05-T009 Añadir los códigos `FEES_CATEGORY_NOT_ALLOWED`, `INACTIVE_CATEGORY` y `CATEGORY_HAS_EXPENSES`, con sus mensajes en español.

## Bloque C — Pruebas de API

- [x] F05-T010 Pruebas de API de CA-1 a CA-12. Incluye un escenario completo: 3 categorías, egresos en las 4 semanas, 2 pagos de honorarios (uno pagado en el mes siguiente), una categoría inactiva con montos, y los totales verificados a mano.
      Depende de: F05-T006, F05-T008
- [x] F05-T011 Pruebas de aislamiento con `seedTwoOrgs()` en egresos, matriz y libro.
      Depende de: F05-T010 · Verificación: CA-13

## Bloque D — Web

- [ ] F05-T012 [P] Crear `MonthPicker` con el mes sincronizado en la URL.
- [ ] F05-T013 [TDD] Crear `ExpenseMatrix`: render con los datos de ejemplo de CA-11, celdas en cero, totales y clic en una celda.
      Depende de: F05-T012
- [ ] F05-T014 Crear `LedgerSheet`: filas manuales editables y borrables, y filas de honorarios con enlace a F04.
      Depende de: F05-T013 · Verificación: CA-14
- [ ] F05-T015 [TDD] Crear `ExpenseForm` con `WeekSelect` + `DateInput` acotado, autoselección de la semana y exclusión de "Honorarios".
      Depende de: F05-T012 · Verificación: CA-15
- [ ] F05-T016 Hacer de Egresos la ruta de inicio después del login y quitar su "Próximamente".
      Depende de: F05-T013

## Cierre

- [ ] F05-T017 Verificación manual con datos de un mes real de la empresa: comparar la matriz de AndERP con la hoja que usan hoy. Revisar la Definición de Hecho y actualizar `roadmap.md`.
