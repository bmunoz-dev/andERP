# F04 — Pagos de honorarios · Tareas

- **Rama:** `feat/004-fee-payments`
- **Plan:** [plan.md](plan.md)

## Bloque A — Datos

- [x] F04-T001 Definir en Drizzle `fee_payments` (con las columnas generadas) y `fee_payment_days`, con restricciones nombradas. Generar `0007_fee_payments` y revisarla.
- [x] F04-T002 [TDD] Pruebas de integración de las columnas generadas: casos de CA-2 más febrero de un año bisiesto y septiembre semana 4 (22 al 30). Esta prueba también valida el riesgo de inmutabilidad que se anotó en F00.
      Depende de: F04-T001 · Verificación: CA-2
- [x] F04-T003 [TDD] Escribir las pruebas de los tres triggers y después crear `0008_fee_payments_rules`:
      - día fuera de la semana;
      - día fuera del contrato;
      - cambio de periodo o de contrato;
      - borrado de un contrato con pagos;
      - fechas de contrato que excluyen días ya pagados.
      Depende de: F04-T001 · Verificación: CA-4, CA-11, CA-14, CA-15
- [x] F04-T004 [TDD] Escribir las pruebas de las vistas y después crear `0009_fee_payment_views`:
      - totales;
      - un pago borrado no suma;
      - contrato sin pagos con saldo igual al total;
      - saldo negativo.
      Depende de: F04-T001
- [x] F04-T005 Ampliar el mapper con `fee_payments_period_uq` → `FEE_PAYMENT_ALREADY_EXISTS` y con los `code` de los triggers.
      Depende de: F04-T003

## Bloque B — Dominio (TDD, sin base de datos)

- [x] F04-T006 [P] [TDD] Crear el value object `Period`: validaciones y `start`/`end` con `weekRange`.
- [x] F04-T007 [P] [TDD] Crear el value object `FeePaymentDay`.
- [x] F04-T008 [TDD] Crear el agregado `FeePayment` con todas las invariantes del plan.
      Depende de: F04-T006, F04-T007 · Verificación: CA-3, CA-4, CA-11

## Bloque C — Aplicación e infraestructura

- [x] F04-T009 Definir los puertos y crear los adaptadores Drizzle: repositorio, `ContractReader`, `BalanceReader` y `UnitOfWork`.
      Depende de: F04-T001
- [x] F04-T010 [TDD] Comando `create-fee-payment`: transacción, `warnings` de saldo y auditoría.
      Depende de: F04-T008, F04-T009 · Verificación: CA-1, CA-9, CA-13
- [x] F04-T011 [TDD] Comando `update-fee-payment`: reemplaza los días, rechaza cambios de periodo o contrato y registra la auditoría antes y después.
      Depende de: F04-T010 · Verificación: CA-11
- [x] F04-T012 [P] [TDD] Comando `delete-fee-payment`.
      Depende de: F04-T010 · Verificación: CA-12
- [x] F04-T013 Crear las consultas de listado y detalle, y el controlador. Añadir los esquemas a `@anderp/shared/schemas/fee-payments.ts`.
      Depende de: F04-T010
- [x] F04-T014 Ampliar F03:
      - reglas `CONTRACT_HAS_PAYMENTS` y `CONTRACT_DATES_EXCLUDE_PAYMENTS` en el servicio;
      - `paidAmount` y `balance` en los contratos;
      - `GET /contracts?overlaps=`.
      Depende de: F04-T004 · Verificación: CA-10, CA-14, CA-15, CA-17
- [x] F04-T015 [P] [TDD] Agregar `sumMoney` con `BigInt` en `@anderp/shared/money.ts`.
- [x] F04-T016 Añadir los códigos `FEE_PAYMENT_WITHOUT_DAYS`, `DUPLICATE_WORK_DATE`, `WORK_DATE_OUTSIDE_WEEK`, `WORK_DATE_OUTSIDE_CONTRACT`, `FEE_PAYMENT_ALREADY_EXISTS`, `FEE_PAYMENT_PERIOD_IMMUTABLE`, `CONTRACT_HAS_PAYMENTS`, `CONTRACT_DATES_EXCLUDE_PAYMENTS` y `CONTRACT_BALANCE_EXCEEDED`, con sus mensajes en español.

## Bloque D — Pruebas de API

- [x] F04-T017 Pruebas de API de CA-1 a CA-17, más una prueba de que un pago duplicado en paralelo (dos peticiones simultáneas) deja un solo registro.
      Depende de: F04-T013, F04-T014
- [x] F04-T018 Pruebas de aislamiento con `seedTwoOrgs()`.
      Depende de: F04-T017 · Verificación: CA-18

## Bloque E — Web

- [x] F04-T019 [TDD] Crear el componente `WeekGrid`: 7 y 10 columnas, días fuera del contrato deshabilitados, festivos marcados y total en vivo.
      Depende de: F04-T015
- [x] F04-T020 Crear `FeePaymentForm` con el flujo de periodo → contrato → cuadrícula → fecha de pago, y el aviso de saldo.
      Depende de: F04-T019
- [x] F04-T021 Crear el listado de honorarios con filtros, y las páginas de nuevo pago y edición.
      Depende de: F04-T020 · Verificación: CA-19
- [x] F04-T022 Mostrar pagado y saldo en el detalle del prestador (F03).
      Depende de: F04-T014

## Cierre

- [x] F04-T023 Verificación manual: registrar la semana 3 de agosto de 2026 (incluye el festivo del lunes 17) y la semana 4 (10 días, del 22 al 31), editar un pago, borrarlo y superar el saldo del contrato. Revisar la Definición de Hecho y actualizar `roadmap.md`.
