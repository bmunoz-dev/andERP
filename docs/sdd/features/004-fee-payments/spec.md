# F04 — Pagos de honorarios · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §2 (decisiones 4, 8, 9 y 11), §5.5 (`fee_payments`, `fee_payment_days`), §5.7 (`v_fee_payment_totals`, `v_contract_balances`)

## Objetivo

Registrar el pago semanal de honorarios de un contrato, con un valor por cada fecha trabajada dentro de la semana (formato B), y controlar el saldo del contrato.

## Historias

- **HU1.** Como admin, quiero elegir una semana de un mes y un prestador con contrato en esa semana, y anotar cuánto se le paga por cada día trabajado.
- **HU2.** Como admin, quiero ver los festivos marcados en la cuadrícula.
- **HU3.** Como admin, quiero ver cuánto se ha pagado de cada contrato y cuánto queda.
- **HU4.** Como admin, quiero corregir un pago (días, valores, fecha de pago o notas) o borrarlo.

## Criterios de aceptación

**Registro**
- **CA-1.** `POST /fee-payments` recibe `{ contractId, periodYear, periodMonth, weekOfMonth, paymentDate, notes?, days: [{ workDate, amount, isHoliday }] }` y crea la cabecera y los días en una sola transacción. La respuesta incluye `periodStart`, `periodEnd`, `total` (calculado en SQL) y `warnings[]`.
- **CA-2.** La base de datos calcula `period_start` y `period_end` (columnas generadas) según el formato B. Ejemplos: agosto de 2026, semana 4 → del 22 al 31; febrero de 2026, semana 4 → del 22 al 28; septiembre de 2026, semana 2 → del 8 al 14.
- **CA-3.** Un pago sin días responde `422 FEE_PAYMENT_WITHOUT_DAYS`, y una fecha repetida en `days` responde `422 DUPLICATE_WORK_DATE`.
- **CA-4.** Un `workDate` fuera de `periodStart..periodEnd` responde `422 WORK_DATE_OUTSIDE_WEEK`, y uno fuera de las fechas del contrato responde `422 WORK_DATE_OUTSIDE_CONTRACT`. Las dos reglas las aplican el dominio **y** un trigger en la base de datos.
- **CA-5.** Un segundo pago para el mismo contrato, año, mes y semana responde `409 FEE_PAYMENT_ALREADY_EXISTS`. Si el pago anterior fue borrado, se permite.
- **CA-6.** Los montos son strings decimales `>= 0`. Uno inválido responde `422 VALIDATION_ERROR`.
- **CA-7.** `paymentDate` puede caer en cualquier fecha, incluso fuera del periodo (pagos anticipados o posteriores).
- **CA-8.** `isHoliday` lo propone la web con `isColombianHoliday` y el usuario puede cambiarlo. Se guarda tal como llega.

**Saldo del contrato**
- **CA-9.** Si con el pago (al crearlo o editarlo) lo pagado supera el `totalAmount` del contrato, responde `422 CONTRACT_BALANCE_EXCEEDED` y **no se guarda nada**. Dos pagos simultáneos no pueden superar el total entre ambos. Tampoco se puede bajar el `totalAmount` de un contrato por debajo de lo ya pagado (mismo código). *(Cambio del 2026-10-06: antes solo se avisaba.)*
- **CA-10.** `GET /service-providers/:id/contracts` (F03) agrega a cada contrato `paidAmount` y `balance`, calculados en `v_contract_balances`.

**Edición y borrado**
- **CA-11.** `PUT /fee-payments/:id` puede cambiar `paymentDate`, `notes` y la lista completa de `days` (se reemplazan en una transacción). **No** puede cambiar el contrato ni el periodo: si llegan distintos, responde `422 FEE_PAYMENT_PERIOD_IMMUTABLE`. Un trigger en la base de datos aplica la misma regla.
- **CA-12.** `DELETE /fee-payments/:id` hace un borrado lógico. El pago deja de sumar en las vistas.
- **CA-13.** Crear, editar y borrar pagos genera `audit_logs` (`fee_payment.create`, `fee_payment.update`, `fee_payment.delete`) con la cabecera y los días antes y después.

**Reglas nuevas sobre contratos (amplían F03)**
- **CA-14.** Borrar un contrato con pagos no borrados responde `422 CONTRACT_HAS_PAYMENTS`.
- **CA-15.** Cambiar las fechas de un contrato de forma que algún día ya pagado quede fuera responde `422 CONTRACT_DATES_EXCLUDE_PAYMENTS`. Lo aplican el servicio y un trigger.

**Consulta**
- **CA-16.** `GET /fee-payments?periodYear=&periodMonth=&weekOfMonth=&serviceProviderId=` lista los pagos con prestador, periodo, fecha de pago y total.
- **CA-17.** `GET /contracts?overlaps=YYYY-MM-DD..YYYY-MM-DD` devuelve los contratos cuyas fechas se cruzan con ese rango, con el nombre del prestador. Alimenta el select del formulario.

**Aislamiento y web**
- **CA-18.** Un admin de otra organización recibe `404`. Las FK compuestas impiden días o pagos que crucen organizaciones.
- **CA-19.** Web:
  - **Listado:** filtros de año, mes, semana y prestador.
  - **Formulario:**
    1. elegir año, mes y semana (se muestra el rango de fechas);
    2. elegir el prestador o contrato (solo los que se cruzan con la semana);
    3. una cuadrícula con **una columna por cada fecha del rango** (día de la semana + `dd/mm`, marca de festivo, `MoneyInput`); los días fuera del contrato quedan deshabilitados; un día vacío no se envía;
    4. fecha de pago y notas;
    5. el total se muestra en vivo.
  - Si hay advertencia de saldo, se muestra un aviso.

## Fuera de alcance

Tarifas, horas, recargos automáticos por festivo y alertas por periodicidad.
