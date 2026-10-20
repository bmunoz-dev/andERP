# F18 — Cuentas aéreas · Tareas

- **Rama:** `feat/018-air-accounts`
- **Plan:** [plan.md](plan.md)

## Bloque A — Base de datos

- [x] F18-T001 [TDD] Escribir `air-accounts.db.test.ts` y después crear `0030_drop_clickiu_guard`, `0031_drop_clickiu`, `0032_air_accounts` y `0033_air_account_rules` con `db/schema/air-accounts.ts` (y borrar `db/schema/clickiu.ts` y `clickiu.db.test.ts`). Pruebas:
      - la guarda de la 0030 falla si `clickiu_movements` tiene filas;
      - CHECK de campos del tiquete, de monto (incluido `amount = net_fare + taxes` y saldo inicial ≠ 0), de límite y de formato de PNR y tiquete;
      - índices únicos: nombres sin distinguir mayúsculas, tiquete repetido, segundo saldo inicial; se pueden repetir tras un borrado lógico;
      - FK compuesta: una cuenta no apunta a un operador de otra organización;
      - tipo y cuenta inmutables;
      - `v_air_account_balances`: sin borrados, cuenta sin movimientos con saldo 0, emisiones en negativo;
      - cupo en prepago y en crédito: crear y subir una emisión, bajar o borrar una recarga, saldo inicial negativo, bajar el límite por debajo de la deuda; disponible justo en 0 aceptado; código según el límite;
      - concurrencia: dos emisiones simultáneas en la misma cuenta, solo una confirma; en cuentas distintas, las dos;
      - `REPEATABLE READ` rechazado; `app_runtime` lee la vista.
      Archivos: `apps/api/drizzle/0030_*.sql`, `0031_*.sql`, `0032_*.sql`, `0033_*.sql`, `apps/api/src/db/schema/air-accounts.ts`, `apps/api/src/db/schema/index.ts`
      Verificación: CA-1, CA-3, CA-6–CA-12, CA-14–CA-18, CA-33, CA-34
- [x] F18-T002 Actualizar `foundation.test.ts` (enums) y `design.md` si el SQL generado obligó a algún cambio.
      Depende de: F18-T001

## Bloque B — Compartido

- [x] F18-T003 [P] Esquemas Zod en `packages/shared/src/schemas/air-accounts.ts` con su prueba (y borrar `clickiu.ts` y su prueba); los diez códigos nuevos con su mensaje en español y quitar los `CLICKIU_*`.
      Archivos: `packages/shared/src/schemas/air-accounts.ts`, `packages/shared/src/index.ts`, `packages/shared/src/errors/codes.ts`, `apps/web/src/lib/error-messages.es.ts`
      Verificación: CA-1, CA-3, CA-6, CA-7, CA-9, CA-10, CA-21

## Bloque C — API

- [x] F18-T004 [TDD] Operadores y cuentas: escribir sus casos en `air-accounts.test.ts` y después crear el módulo `air-accounts` con `air-operators.service.ts`, `air-accounts.service.ts` y sus controladores (borrar `modules/clickiu/` y `clickiu.test.ts`): CRUD, `DUPLICATE_NAME`, operador inactivo, `byOperator`, saldo y disponible en el listado, bajar el límite rechazado, auditoría de cuentas.
      Depende de: F18-T001, F18-T003 · Verificación: CA-1–CA-5, CA-19, CA-20, CA-23 (cuentas), CA-24
- [x] F18-T005 [TDD] Movimientos: casos en `air-accounts.test.ts` y después `air-account-movements.service.ts` y su controlador: crear cada tipo, `discriminatedUnion`, monto calculado y recalculado, `PATCH` incoherente con su `code`, cuenta inactiva, marcar como cobrado, borrado lógico, filtros, mes por defecto, `from > to`, `summary`, errores de cupo con su `code`, auditoría. Pasar el caso de `audit-atomicity.test.ts` a `air_account_movement.create`.
      Depende de: F18-T004 · Verificación: CA-6–CA-17, CA-21–CA-23
- [x] F18-T006 Pruebas de aislamiento con `seedTwoOrgs()`: A no lista, lee, edita ni usa operadores, cuentas ni movimientos de B (`404`), y lo de B no cambia saldos, totales ni el consolidado de A. Rutas en OpenAPI.
      Depende de: F18-T005 · Verificación: CA-25

## Bloque D — Web

- [x] F18-T007 [TDD] `lib/air-accounts-api.ts`, página `/configuracion/operadores-aereos` y página `/cuentas-aereas` con `OperatorBalanceCards`, `AccountsTable` y `AccountFormDialog`. Menú: "Cuentas aéreas" reemplaza a "Clic Kiu" y "Operadores aéreos" en Configuración. Borrar `clic-kiu.tsx`, `components/clickiu/` y `lib/clickiu-api.ts`.
      Depende de: F18-T003, F18-T004 · Verificación: CA-26–CA-28
- [ ] F18-T008 [TDD] Página `/cuentas-aereas/$accountId` con `MovementSummaryCards`, `MovementFilters`, `MovementsTable`, `IssueFormDialog` y `MovementFormDialog` (saldo inicial con A favor / En deuda), "Marcar como cobrado" y borrar con confirmación; mensajes de cupo en español.
      Depende de: F18-T005, F18-T007 · Verificación: CA-29–CA-32

## Cierre

- [ ] F18-T009 Verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`), Definición de Hecho, notas de implementación en `plan.md`, F11 marcada como reemplazada en el roadmap y PR.
- [ ] F18-T010 Antes del merge: consulta de solo lectura `SELECT count(*) FROM anderp.clickiu_movements` en producción, con confirmación del usuario (CA-34). Después del deploy: verificación manual del usuario.
