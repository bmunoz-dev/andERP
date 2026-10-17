# F16 — Pagos de monto fijo · Spec

- **Estado:** Aprobado (2026-10-17)
- **Diseño:** `design.md` §2 (decisión 17), §3 (glosario), §5.5 (`provider_contracts.payment_mode`, `fixed_payments`), §5.7 (`v_expense_ledger`, `v_contract_month_totals`)
- **Depende de:** F04 (pagos de honorarios), F05 (libro y matriz de egresos), F10 (monto mensual de referencia), F12 (auditoría atómica)

## Objetivo

Hoy a una persona solo se le puede pagar por semana, con un valor por cada día trabajado (F04). Ahora también trabajan con la empresa personas que cobran un **monto fijo por periodo** (quincena o mes), como empleados. F16 permite registrar **lo que se les paga**, sin desglose por días.

AndERP **no calcula nómina**: ni seguridad social, ni prestaciones, ni retenciones, ni nómina electrónica. Solo registra el pago.

El contrato decide la forma de pago: **por días trabajados** (como hoy) o **monto fijo**. En la interfaz, "Prestadores" pasa a llamarse **"Personal"** y "Honorarios" pasa a **"Pagos"**. En el código y la base de datos se conservan `service_providers` y `fee_payments`. El renombrado del código queda como una feature aparte (ver Fuera de alcance).

## Historias

- **HU1.** Como admin, quiero indicar en el contrato si a la persona se le paga por días trabajados o con un monto fijo.
- **HU2.** Como admin, quiero registrar un pago de monto fijo con el mes trabajado, la fecha de pago y el valor, y poder registrar varios en el mismo mes (quincenas, anticipos).
- **HU3.** Como admin, quiero ver los pagos de monto fijo de un mes, corregirlos o borrarlos.
- **HU4.** Como admin, quiero que estos pagos sumen en la matriz de Egresos y en lo pagado del mes frente al monto mensual de referencia, igual que los pagos por días.

## Criterios de aceptación

**Forma de pago del contrato**

- **CA-1.** `provider_contracts.payment_mode` (`daily` | `fixed`), `NOT NULL DEFAULT 'daily'`. Los contratos existentes quedan en `daily`.
- **CA-2.** `POST /service-providers/:id/contracts` y `PATCH /contracts/:id` aceptan `paymentMode`, que por defecto vale `daily`. Las respuestas de contratos (incluido `GET /contracts?overlaps=`) lo devuelven.
- **CA-3.** Cambiar `paymentMode` de un contrato con pagos no borrados (por días o de monto fijo) responde `422 CONTRACT_PAYMENT_MODE_LOCKED`. Lo aplican el servicio y un trigger.

**Pagos de monto fijo**

- **CA-4.** `POST /fixed-payments` recibe `{ contractId, periodYear, periodMonth, paymentDate, amount, notes? }` y crea el pago.
  - `amount` es un string decimal `> 0`.
  - `periodMonth` va de 1 a 12.
  - `notes` es opcional.
  - Un dato inválido responde `422 VALIDATION_ERROR`.
- **CA-5.** Un pago de monto fijo sobre un contrato `daily` responde `422 CONTRACT_PAYMENT_MODE_MISMATCH`. Lo aplican el servicio y un trigger.
- **CA-6.** El mes trabajado debe cruzarse con las fechas del contrato: el primer día del mes es anterior o igual a `end_date` (o `end_date` es NULL), y el último día es posterior o igual a `start_date`. Si no, responde `422 FIXED_PAYMENT_OUTSIDE_CONTRACT`. Lo aplican el servicio y un trigger.
- **CA-7.** Se permiten varios pagos por contrato y mes; no hay restricción de unicidad. `paymentDate` puede ser cualquier fecha, incluso fuera del mes trabajado (como F04 CA-7).
- **CA-8.** `GET /fixed-payments?periodYear=&periodMonth=&serviceProviderId=` lista los pagos no borrados, con el nombre de la persona, el mes trabajado, la fecha de pago y el valor.
- **CA-9.** `PATCH /fixed-payments/:id` solo cambia `paymentDate`, `amount` y `notes`. El contrato y el mes trabajado no se pueden cambiar: el esquema de la API no los acepta y un trigger en la base de datos lo impide.
- **CA-10.** `DELETE /fixed-payments/:id` hace un borrado lógico. El pago deja de sumar en las vistas.
- **CA-11.** Crear, editar y borrar genera `audit_logs` (`fixed_payment.create`, `fixed_payment.update`, `fixed_payment.delete`) en la misma transacción que el cambio (F12).

**Pagos por días (F04)**

- **CA-12.** `POST /fee-payments` sobre un contrato `fixed` responde `422 CONTRACT_PAYMENT_MODE_MISMATCH`. Lo aplican el servicio y un trigger. El resto de F04 no cambia.

**Reglas sobre contratos (amplían F04 CA-14 y CA-15)**

- **CA-13.** Borrar un contrato con pagos de monto fijo no borrados responde `422 CONTRACT_HAS_PAYMENTS`.
- **CA-14.** Cambiar las fechas de un contrato de forma que el mes trabajado de algún pago de monto fijo deje de cruzarse con ellas responde `422 CONTRACT_DATES_EXCLUDE_PAYMENTS`. Lo aplican el servicio y un trigger.

**Libro, matriz y monto mensual**

- **CA-15.** `v_expense_ledger` incluye una fila por cada pago de monto fijo no borrado:
  - `source = 'fixed_payment'`;
  - categoría `FEES`;
  - mes y semana de su **`payment_date`**;
  - concepto `Pago – {persona} – {mes}/{año}` del mes trabajado;
  - su `amount`.
- **CA-16.** **No hay doble conteo:** con un egreso manual de $100.000, un pago por días de $50.000 y un pago de monto fijo de $30.000 en el mismo mes, el total del mes es exactamente $180.000.
- **CA-17.** `v_contract_month_totals` suma los pagos de monto fijo en su **mes trabajado**. Por tanto, lo pagado en el mes frente al monto mensual de referencia (F10) se ve igual para los dos modos.

**Aislamiento**

- **CA-18.** Un admin de otra organización recibe `404` al leer, editar o borrar un pago de monto fijo, y no lo ve en los listados. Las FK compuestas impiden un pago con el contrato de otra organización.

**Web**

- **CA-19.** Menú, títulos y migas: "Prestadores" pasa a "Personal" y "Honorarios" a "Pagos". Las rutas cambian a `/personal` y `/pagos`, sin redirecciones desde las antiguas.
- **CA-20.** El formulario de contrato tiene el campo "Forma de pago", con las opciones "Por días trabajados" y "Monto fijo". Queda deshabilitado, con una nota, si el contrato ya tiene pagos. La tabla de contratos muestra la forma de pago.
- **CA-21.** `/pagos` tiene dos pestañas:
  - **"Por días":** la pantalla actual de F04, sin cambios de comportamiento.
  - **"Monto fijo":** filtros de año y mes, y una tabla con persona, mes trabajado, fecha de pago, valor y acciones (editar y eliminar con confirmación).
- **CA-22.** El formulario de monto fijo pide:
  - año y mes trabajado;
  - persona (solo las que tienen un contrato `fixed` que se cruza con ese mes);
  - fecha de pago (por defecto, `todayIn()`);
  - valor;
  - notas.

  Muestra además lo ya pagado en ese mes frente al monto mensual de referencia del contrato. Para editar se usa el mismo formulario, con el contrato y el mes bloqueados.
- **CA-23.** Al crear, editar o borrar un pago de monto fijo se refrescan la lista, la ficha de la persona y los egresos.
- **CA-24.** Cada código de error nuevo tiene su mensaje en español en `error-messages.es.ts`.

## Fuera de alcance

- Cálculo de nómina: seguridad social, prestaciones, retenciones, nómina electrónica.
- Un "tipo de vínculo" (prestador o empleado) en la persona: el modo del contrato ya resuelve la diferencia que importa.
- Pagos de monto fijo por quincena con su propia unidad de periodo: la quincena se registra como un pago más dentro del mes trabajado.
- Alertas por periodicidad de pago.
- Renombrar en el código y la base de datos `service_providers`, `fee_payments` y sus rutas, códigos de error y acciones de auditoría. Es una feature aparte de solo refactor, después de F16 y del respaldo de producción (decisión del usuario del 2026-10-17).
