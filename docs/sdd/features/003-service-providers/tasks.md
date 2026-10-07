# F03 — Prestadores y contratos · Tareas

- **Rama:** `feat/003-service-providers`
- **Plan:** [plan.md](plan.md)

## Bloque A — Datos

- [x] F03-T001 Definir en Drizzle `service_providers` y `provider_contracts` con las restricciones **nombradas**. Generar `0005_service_providers` y revisarla.
- [x] F03-T002 [TDD] Escribir las pruebas de integración en SQL:
      - CHECK de la cuenta bancaria (todo o nada);
      - documento duplicado, y documento que se puede recrear tras un borrado;
      - la FK compuesta impide que un contrato apunte a un prestador de otra organización;
      - `total_amount > 0` y `end_date >= start_date`.
      Depende de: F03-T001
- [x] F03-T003 [TDD] Escribir las pruebas de solapamiento (rangos que se cruzan, rangos contiguos permitidos, contrato abierto contra un contrato posterior y contrato borrado que ya no bloquea) y después crear `0006_contracts_no_overlap`.
      Depende de: F03-T001 · Verificación: CA-7
- [x] F03-T004 Ampliar el mapper de errores de Postgres con la tabla `constraintName → code` y sus pruebas unitarias.
      Depende de: F03-T001

## Bloque B — API

- [x] F03-T005 Crear los esquemas Zod en `@anderp/shared/schemas/service-providers.ts` (documento, cuenta bancaria todo o nada y dinero).
- [x] F03-T006 [TDD] Crear el servicio y el controlador de prestadores: alta con validación de catálogos activos, edición, borrado con `PROVIDER_HAS_CONTRACTS` y listado con `search`, `hasActiveContract` y `activeContract`.
      Depende de: F03-T004, F03-T005 · Verificación: CA-1–CA-5
- [x] F03-T007 [TDD] Crear el servicio y el controlador de contratos: CRUD, `status` calculado y auditoría con `changes` antes y después.
      Depende de: F03-T006 · Verificación: CA-6, CA-8–CA-10
- [x] F03-T008 Añadir los códigos `INCOMPLETE_BANK_ACCOUNT`, `DUPLICATE_DOCUMENT`, `INACTIVE_CATALOG_VALUE`, `PROVIDER_HAS_CONTRACTS`, `INVALID_DATE_RANGE` y `CONTRACT_OVERLAP`, con sus mensajes en español.

## Bloque C — Pruebas de API

- [x] F03-T009 Pruebas de API de CA-1 a CA-10 y de aislamiento con `seedTwoOrgs()`.
      Depende de: F03-T006, F03-T007 · Verificación: CA-11

## Bloque D — Web

- [x] F03-T010 [P] [TDD] Crear los componentes `MoneyInput` (formatea mientras se escribe y entrega un string decimal) y `DateInput` (`YYYY-MM-DD` ↔ `dd/mm/aaaa`).
- [x] F03-T011 Crear el listado de prestadores y su formulario de alta y edición.
      Depende de: F03-T010
- [x] F03-T012 Crear el detalle del prestador con la tabla de contratos y su formulario.
      Depende de: F03-T011 · Verificación: CA-12

## Cierre

- [x] F03-T013 Verificación manual: prestador con y sin cuenta bancaria, dos contratos seguidos, intento de solapamiento y borrado bloqueado. Revisar la Definición de Hecho y actualizar `roadmap.md`.
