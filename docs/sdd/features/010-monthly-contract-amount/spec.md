# F10 — Monto mensual de referencia en los contratos · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §5.5, §5.7
- **Modifica:** F03 (contratos) y F04 (CA-9 y CA-10)

## Objetivo

Los contratos de los prestadores se pactan por un **monto mensual**, y cada mes el usuario decide cuánto pagar. El contrato guarda ese monto como **referencia**: AndERP muestra cuánto se lleva pagado en el mes y avisa si se supera, pero **no bloquea**.

Reemplaza el modelo de F04, en el que el contrato tenía un valor total para toda su vigencia y se rechazaban los pagos que lo superaban (decisión del 2026-10-06).

## Historias

- **HU1.** Como admin, quiero registrar en el contrato el monto mensual acordado con el prestador.
- **HU2.** Como admin, al registrar un pago quiero ver cuánto llevo pagado en ese mes trabajado y que se me avise si me paso, sin que se me impida registrarlo.
- **HU3.** Como admin, quiero ver en la ficha y en el listado cuánto se le ha pagado este mes a cada prestador.

## Criterios de aceptación

**Contrato**
- **CA-1.** El contrato tiene `monthlyAmount` (mayor que 0, obligatorio) en lugar de `totalAmount`. Crear, editar y responder usan `monthlyAmount`. Se puede cambiar libremente: no depende de lo pagado.

**Lo pagado por mes**
- **CA-2.** Lo pagado de un contrato se agrupa por **mes trabajado**: el año y el mes del periodo del pago (`period_year`, `period_month`), no por su fecha de pago. Un pago de la semana 4 de agosto pagado el 2 de septiembre cuenta para **agosto**. La suma se hace en SQL (vista `v_contract_month_totals`) y no incluye pagos borrados.
- **CA-3.** Cada mes arranca en 0: no hay saldo que pase de un mes a otro.
- **CA-4.** Un pago que hace superar el monto mensual **se registra** (al crear y al editar). Ya no existe `CONTRACT_BALANCE_EXCEEDED` ni sus triggers.

**API**
- **CA-5.** El contrato vigente de cada prestador (`activeContract` en el listado y en el detalle) incluye `paidThisMonth`: lo pagado en el mes trabajado actual (en Bogotá).
- **CA-6.** `GET /contracts?overlaps=inicio..fin` incluye en cada contrato `monthlyAmount` y `paidInMonth`: lo pagado en el mes de `inicio`. Con `excludePayment=<id>` no cuenta ese pago, para editarlo sin sumarlo dos veces.
- **CA-7.** Los contratos de `GET /service-providers/:id/contracts` dejan de traer `paidAmount` y `balance`.
- **CA-8.** Un admin de otra organización no ve montos ni pagos ajenos (aislamiento, igual que en F03 y F04).

**Web**
- **CA-9.** Formulario de pago: debajo del contrato elegido muestra "Pagado en {mes}: $X de $Y", donde X incluye lo que se está registrando. Si X supera Y, muestra un aviso en ámbar ("Supera el monto mensual en $Z") y el botón para guardar sigue activo.
- **CA-10.** Ficha del prestador y listado: "Monto mensual" y "Pagado este mes" en lugar de "Valor total", "Pagado" y "Saldo". El formulario de contrato llama al campo "Monto mensual".

## Fuera de alcance

- Topes que bloquean, montos distintos por mes del mismo contrato y prorrateo de meses incompletos (el monto mensual es solo una referencia).
- Reportes de lo pagado contra lo acordado por mes (la matriz de Egresos ya muestra lo pagado por fecha de pago).
