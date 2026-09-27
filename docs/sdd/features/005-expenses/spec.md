# F05 — Egresos y matriz mensual · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §2 (decisiones 4–8), §5.6, §5.7 (`v_expense_ledger`, `v_expense_monthly_summary`), §8

## Objetivo

Registrar los egresos manuales y mostrar la **matriz mensual categoría × semana**, que une egresos y pagos de honorarios sin contar nada dos veces.

## Historias

- **HU1.** Como admin, quiero registrar un egreso con su categoría, concepto, factura opcional, fecha de pago y valor.
- **HU2.** Como admin, quiero elegir primero la semana y luego una fecha dentro de ella, igual que lo hacemos hoy.
- **HU3.** Como admin, quiero ver la matriz del mes con los totales por categoría, por semana y del mes.
- **HU4.** Como admin, quiero hacer clic en una celda y ver qué egresos la componen.

## Criterios de aceptación

**Egresos**
- **CA-1.** `POST /expenses` con `{ categoryId, concept, invoiceNumber?, paymentDate, amount }` crea el egreso. La respuesta incluye `weekOfMonth`, calculada por la base de datos (columna generada).
- **CA-2.** `weekOfMonth` cumple el formato B: el día 7 → 1, el 8 → 2, el 21 → 3, el 22 → 4 y el 31 → 4.
- **CA-3.** Una categoría con `system_code = 'FEES'` responde `422 FEES_CATEGORY_NOT_ALLOWED`, tanto en el servicio como con un trigger al insertar directamente en SQL. Una categoría inactiva responde `422 INACTIVE_CATEGORY` en altas y en cambios de categoría.
- **CA-4.** `amount` mayor que 0, `concept` obligatorio y `invoiceNumber` de hasta 40 caracteres. Los errores responden `422 VALIDATION_ERROR`.
- **CA-5.** `PATCH /expenses/:id` y `DELETE /expenses/:id` (borrado lógico) funcionan.
- **CA-6.** Crear, editar y borrar egresos genera `audit_logs` (`expense.create`, `expense.update`, `expense.delete`) con `changes`.
- **CA-7.** Borrar una categoría que tiene egresos no borrados responde `422 CATEGORY_HAS_EXPENSES` (servicio y trigger). Se puede desactivar.

**Libro y matriz**
- **CA-8.** `v_expense_ledger` contiene una fila por egreso manual y una por pago de honorarios, sin incluir borrados. El pago de honorarios aparece:
  - en la categoría `FEES`;
  - con el mes y la semana de su **`payment_date`**;
  - con el concepto `Honorarios – {prestador} – Sem {n} {mes}/{año del periodo}`;
  - con el total de sus días.
- **CA-9.** **No hay doble conteo:** con 1 egreso manual de $100.000 y 1 pago de honorarios de $50.000 en el mismo mes, el total del mes es exactamente $150.000.
- **CA-10.** Un pago de honorarios cuyo periodo es la semana 4 de agosto y que se paga el 2 de septiembre aparece en **septiembre, semana 1**.
- **CA-11.** `GET /reports/expenses/monthly?year=&month=` devuelve:
  - `weeks`: 4 elementos con `{ week, start, end }`;
  - `rows`: una por categoría **activa**, más las inactivas que tengan montos ese mes, ordenadas por `sort_order`, cada una con `{ categoryId, name, isSystem, cells[4], total }`;
  - `weekTotals[4]`;
  - `grandTotal`.

  Todas las cifras son strings decimales calculados en SQL. Una celda sin movimientos vale `"0.00"`.
- **CA-12.** `GET /reports/expenses/ledger?year=&month=&categoryId=&week=` devuelve las filas del libro con `source`, `sourceId`, `concept`, `invoiceNumber`, `paymentDate` y `amount`, ordenadas por fecha.

**Aislamiento y web**
- **CA-13.** La matriz y el libro solo incluyen datos de la organización del token. Un admin de otra organización recibe `404` en los egresos ajenos.
- **CA-14.** Web — **pantalla principal de Egresos:**
  - selector de mes con flechas anterior y siguiente;
  - la matriz con las fechas de cada semana en el encabezado y los totales en negrita;
  - al hacer clic en una celda se abre un panel lateral con el detalle del libro:
    - las filas manuales se pueden editar y borrar;
    - las filas de honorarios muestran un enlace "Ver pago de honorarios".
  - Botón "Nuevo egreso".
- **CA-15.** Web — **formulario de egreso:**
  - select de categoría **sin** "Honorarios";
  - select de semana (1–4, con su rango de fechas) que limita el calendario a ese rango;
  - si la fecha ya existe, la semana se selecciona sola;
  - concepto, factura y `MoneyInput`.

## Fuera de alcance

Exportar a Excel o PDF, proveedores en egresos, adjuntos y presupuestos.
