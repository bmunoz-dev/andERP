# F23 — Reglas de datos en la base · Tareas

- **Rama:** `feat/023-data-integrity`
- **Plan:** [plan.md](plan.md)

## Bloque A — Diseño

- [x] F23-T001 Actualizar `design.md` (§5.5, §5.8, §5.9, §6.3, §6.5, §11 e historial) según el plan.
      Archivos: `docs/sdd/design.md`

## Bloque B — Base de datos

- [x] F23-T002 [TDD] Primero las pruebas SQL de CA-1, CA-2 y CA-3 y los puntos de revisión 1 y 2. Después, en la migración `data_integrity_guards`:
      - la barrera;
      - el trigger de borrado de prestadores;
      - el trigger de contratos reemplazado.
      Archivos: `apps/api/drizzle/NNNN_data_integrity_guards.sql`, `apps/api/test/{service-providers,provider-deactivation}.db.test.ts`
      Depende de: F23-T001 · Verificación: CA-1–CA-3
- [x] F23-T003 [TDD] Pagos con contrato borrado y semana sin montos:
      - `FEE_PAYMENT_EMPTY` en shared, con su mensaje y el `refine`;
      - los triggers de pagos con `NOT FOUND` y la restricción diferida.
      Pruebas de CA-6, CA-7 y del punto de revisión 3.
      Archivos: la misma migración, `packages/shared/src/{errors/codes.ts,schemas/fee-payments.ts}`, `apps/web/src/lib/error-messages.es.ts`, `apps/api/test/{fee-payments,fixed-payments}.{db.,}test.ts`
      Depende de: F23-T002 · Verificación: CA-6, CA-7
- [x] F23-T004 [TDD] Trigger de credenciales hacia responsables vigentes y `leftJoin` filtrado. Pruebas de CA-8 y del punto de revisión 4.
      Archivos: la misma migración, `credentials.service.ts`, `apps/api/test/credentials.{db.,}test.ts`
      Depende de: F23-T002 · Verificación: CA-8
- [x] F23-T005 [TDD] Prueba de la barrera con una fila que viola cada regla.
      Archivos: `apps/api/test/data-integrity.db.test.ts`
      Depende de: F23-T004 · Verificación: CA-12

## Bloque C — API

- [x] F23-T006 [TDD] `ServiceProvidersService`:
      - `list({ id })` y `get` (CA-4);
      - `remove` sin la consulta previa;
      - `update` en una transacción, con `provider.bank_account_update` (CA-5).
      Archivos: `service-providers.service.ts`, `apps/api/test/service-providers.test.ts`
      Depende de: F23-T002 · Verificación: CA-1, CA-4, CA-5
- [x] F23-T007 [TDD] Rotación por fila (`{ rotated, failed }`) y el runbook 04. Prueba con el lote de tamaño 1 (punto de revisión 5).
      Archivos: `rotate-keys.ts`, `apps/api/test/credentials.test.ts`, `docs/runbooks/04-rotar-llave-credenciales.md`
      Depende de: F23-T001 · Verificación: CA-9
- [x] F23-T008 [TDD] `ContractDocumentUploadGuard` y `assertUploadAllowed`, y el runbook 07 de archivos huérfanos.
      Archivos: `contract-documents.{module,service}.ts`, `apps/api/test/contract-documents.test.ts`, `docs/runbooks/07-archivos-huerfanos.md`
      Depende de: F23-T001 · Verificación: CA-10, CA-11

## Bloque D — Cierre

- [ ] F23-T009 Cierre:
      - verificación completa;
      - notas de implementación;
      - F23 marcada "Hecho" en el roadmap;
      - PR. Lo mergea el usuario.
      Depende de: F23-T002 a F23-T008 · Verificación: CA-12
