# F18 — Cuentas aéreas · Plan

- **Estado:** En revisión (2026-10-20)
- **Spec:** [spec.md](spec.md)

## Datos

Cuatro migraciones que se aplican en el mismo despliegue (la decisión del usuario de "una sola migración" es un solo despliegue, sin ventana doble). Van en varios archivos porque `drizzle-kit generate` solo diffea el esquema de Drizzle: la vista y las funciones de F11 están fuera de él y hay que soltarlas a mano antes de que el diff borre la tabla.

1. **`0030_drop_clickiu_guard` (a mano, `pnpm db:generate:custom`):**
   - **guarda (CA-34):** `DO $$ … IF EXISTS (SELECT 1 FROM anderp.clickiu_movements) THEN RAISE EXCEPTION 'clickiu_movements is not empty' …`. Si producción tuviera filas, la migración falla y el pipeline se detiene antes de borrar nada; la consulta de solo lectura previa (T010) es la primera barrera, esta la segunda;
   - `DROP VIEW anderp.v_clickiu_balance`.
2. **`0031_drop_clickiu` (generada, tras borrar `db/schema/clickiu.ts`):** borra `clickiu_movements` (con sus triggers) y los enums `clickiu_movement_type` y `clickiu_sale_status`.
3. **`0032_air_accounts` (generada, tras crear `db/schema/air-accounts.ts`):**
   - crea los enums `air_movement_type` y `air_collection_status`;
   - crea `air_operators`, `air_accounts` y `air_account_movements` como en `design.md` §5.10: `id()`, `organizationId()`, `auditColumns`, `UNIQUE (organization_id, id)`, FK compuestas `(organization_id, operator_id)` y `(organization_id, account_id)` con `ON DELETE RESTRICT`, `varchar(120)` para los nombres con índice único sobre `lower(name)` (patrón de `payment_obligations`);
   - CHECK `air_accounts_credit_limit_ck`, `air_account_movements_ticket_ck` (con `num_nonnulls`), `air_account_movements_amount_ck`, `air_account_movements_fare_ck` y los de formato de `pnr` y `ticket_number`;
   - índices únicos parciales `air_operators_name_uq`, `air_accounts_name_uq`, `air_account_movements_ticket_number_uq` y `air_account_movements_opening_uq` (`(account_id) WHERE type = 'opening_balance' AND deleted_at IS NULL`), y el índice `air_account_movements_account_date_idx`.
   Se revisa el SQL generado antes de aceptarlo (orden de los `DROP`, nombres de las restricciones).
4. **`0033_air_account_rules` (a mano):**
   - `DROP FUNCTION` de las dos funciones de F11 que quedaron huérfanas al borrar la tabla;
   - `v_air_account_balances` (`security_invoker = true`): `LEFT JOIN` de `air_accounts` con sus movimientos no borrados; `balance = COALESCE(SUM(CASE WHEN type = 'issue' THEN -amount ELSE amount END), 0)`, `available = balance + credit_limit`;
   - `air_account_movements_immutable` (`BEFORE UPDATE`, `WHEN (OLD.type IS DISTINCT FROM NEW.type OR OLD.account_id IS DISTINCT FROM NEW.account_id)`): lanza `AIR_MOVEMENT_TYPE_IMMUTABLE` o `AIR_MOVEMENT_ACCOUNT_IMMUTABLE`;
   - una función `anderp.check_air_account_limit(account uuid)` con el cuerpo de la regla: rechaza `REPEATABLE READ` (`25000`, copiado de la 0023), `pg_advisory_xact_lock(18, hashtext(account::text))`, lee `available` y `credit_limit` de la vista y lanza `AIR_ACCOUNT_INSUFFICIENT_BALANCE` o `AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED` si `available < 0`;
   - dos constraint triggers `DEFERRABLE INITIALLY DEFERRED FOR EACH ROW` que la llaman: `air_account_movements_check_limit` (`AFTER INSERT OR UPDATE`) y `air_accounts_check_limit` (`AFTER UPDATE OF credit_limit`, `WHEN (NEW.credit_limit < OLD.credit_limit)`: subir el límite nunca lo puede violar);
   - todas las funciones con `SET search_path = ''` y nombres calificados.

En Drizzle: `db/schema/air-accounts.ts` con las tres tablas y la vista `.existing()`; se quita `clickiu` de `db/schema/index.ts`.

## Paquete compartido

`packages/shared/src/schemas/air-accounts.ts` (y se borra `clickiu.ts` con su prueba):

- `airMovementTypeSchema`, `airCollectionStatusSchema`;
- `saveAirOperatorSchema` (`name` con `trim`, 1–120) y su `partial()` con `isActive`;
- `saveAirAccountSchema` (`operatorId`, `name`, `creditLimit` con un esquema de dinero ≥ 0) y su `partial()` con `isActive`;
- `createAirMovementSchema`: `z.discriminatedUnion('type', …)`:
  - `issue`: `pnr` (`trim` + `toUpperCase` + `/^[A-Z0-9]{6}$/`), `ticketNumber` (`/^\d{13}$/`), `passenger` (1–120), `netFare` y `taxes` (dinero ≥ 0), `collectionStatus` (por defecto `pending`); sin `amount` (`.strict()`);
  - `opening_balance`: `amount` decimal distinto de 0, puede ser negativo;
  - `recharge`, `payment`, `refund`: `amount` positivo (`positiveMoneySchema`);
  - comunes: `movementDate` (`isoDateSchema`) y `description` (máx. 500, `''` → `null`);
- `updateAirMovementSchema`: objeto parcial con todos los campos, **incluido `type`**, sin discriminar: la combinación tipo/campos la valida el CHECK (CA-10) y el cambio de tipo el trigger (CA-12), así un `PATCH` incoherente responde con su `code` y no se ignora;
- `airMovementFiltersSchema` (`from`, `to`, `type`, `collectionStatus`, con `refine` de `from <= to`);
- tipos de respuesta: `airOperatorSchema`, `airAccountSchema` (con `balance`, `available`, `pendingCollection`), `airOperatorBalanceSchema`, `airMovementSchema`, `airMovementSummarySchema`.

**Errores** (`codes.ts` y `error-messages.es.ts`): se agregan `AIR_ACCOUNT_INSUFFICIENT_BALANCE`, `AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED`, `AIR_ACCOUNT_INACTIVE`, `AIR_OPERATOR_INACTIVE`, `AIR_MOVEMENT_TYPE_IMMUTABLE`, `AIR_MOVEMENT_ACCOUNT_IMMUTABLE`, `AIR_MOVEMENT_TICKET_FIELDS_MISMATCH`, `AIR_MOVEMENT_AMOUNT_INVALID`, `AIR_TICKET_NUMBER_TAKEN` y `AIR_OPENING_BALANCE_EXISTS`; se reutiliza `DUPLICATE_NAME`; se quitan los tres `CLICKIU_*`.

## API: módulo `air-accounts` (controlador → servicio, sin hexagonal)

Se borra `modules/clickiu/` y su import en `app.module.ts`.

- `air-accounts.module.ts`: `registerConstraintCodes` para los CHECK y los índices únicos (los dos nombres → `DUPLICATE_NAME`); los `code` de los triggers llegan como `P0001` y el mapper ya los traduce. Tres controladores, todos con el guard de admin de organización o super admin y `@ApiTags('air-accounts')`.
- `air-operators.service.ts`: `list({ active })`, `create`, `update`. Sin auditoría (catálogo).
- `air-accounts.service.ts`:
  - `list({ active })` y `get`: `JOIN` con el operador y con `v_air_account_balances`, más `pendingCollection` con un `SUM … FILTER` en la misma consulta;
  - `byOperator()`: `GROUP BY` operador sobre las cuentas activas;
  - `create` / `update`: si llega `operatorId`, comprueba que el operador sea de la organización (`OrgScope`; si no, `404`) y esté activo (`AIR_OPERATOR_INACTIVE`); auditoría `air_account.create|update` en la transacción.
- `air-account-movements.service.ts`, con el patrón de `ClickiuService`:
  - toda ruta resuelve primero la cuenta con `OrgScope` (`404` si no es de la organización); `create` exige además `is_active` (`AIR_ACCOUNT_INACTIVE`);
  - `create`: en una emisión, `amount` se escribe como `sql\`${netFare}::numeric + ${taxes}::numeric\``;
  - `update`: si cambia `netFare` o `taxes` de una emisión, `amount = COALESCE(nuevo net_fare, net_fare) + COALESCE(nuevo taxes, taxes)` en el mismo `UPDATE`; si el `PATCH` trae `amount` en una emisión, lo rechaza el CHECK;
  - `list(filters)` y `summary(filters)`: igual que F11, con `account_id` en el `WHERE` y el mes actual por defecto (`todayIn()`); `currentBalance` y `available` se leen de la vista;
  - `remove`: borrado lógico; auditoría `air_account_movement.create|update|delete`.
- Rutas: `GET|POST /air-operators`, `PATCH /air-operators/:id`; `GET|POST /air-accounts`, `GET /air-accounts/by-operator` (declarada antes de `/:id`), `GET|PATCH /air-accounts/:id`; `GET|POST /air-accounts/:accountId/movements`, `GET /air-accounts/:accountId/movements/summary` (antes de `/:id`), `GET|PATCH|DELETE /air-accounts/:accountId/movements/:id`. DTOs con `createZodDto`, también para los filtros en `@Query()`.

## Web

Se borran `routes/_app/clic-kiu.tsx`, `components/clickiu/` y `lib/clickiu-api.ts`.

- `lib/air-accounts-api.ts`: consultas y mutaciones de TanStack Query para los tres recursos. Guardar o borrar un movimiento invalida los movimientos, el resumen, la lista de cuentas y el consolidado; guardar una cuenta, la lista y el consolidado.
- `routes/_app/configuracion/operadores-aereos.tsx`: copia el patrón de `categorias.tsx` (tabla, diálogo con nombre, activar/desactivar).
- `routes/_app/cuentas-aereas/index.tsx`: `OperatorBalanceCards` (consolidado) y `AccountsTable` (insignia de modalidad derivada de `creditLimit === '0.00'`, saldo negativo en rojo), con `AccountFormDialog`.
- `routes/_app/cuentas-aereas/$accountId.tsx`: `validateSearch` con `.catch(undefined)` como en `clic-kiu.tsx`; `MovementSummaryCards`, `MovementFilters` (Estado de cobro solo con Tipo = Emisión; al cambiar el tipo se limpia), `MovementsTable` y los diálogos.
- `components/air-accounts/`:
  - `account-form-dialog.tsx`: operador (`SelectField` con los activos; al editar, el actual aunque esté inactivo), nombre y `MoneyInput` del límite con la ayuda "0 = prepago";
  - `issue-form-dialog.tsx`: PNR, tiquete, pasajero, tarifa neta, impuestos y estado de cobro; **Total** = `sumMoney([netFare, taxes])`; **Disponible** = `available` (+ el monto original al editar), con aviso si `sumMoney([disponible, -total])` es negativo;
  - `movement-form-dialog.tsx`: recarga, pago, reembolso y saldo inicial, con el tipo fijo; en el saldo inicial, selector **A favor / En deuda** que pone el signo al enviar;
  - `operator-balance-cards.tsx`, `accounts-table.tsx`, `movement-summary-cards.tsx`, `movement-filters.tsx`, `movements-table.tsx`;
  - reutiliza de F11 lo que sirva tal cual (filtros, tarjetas, tabla) moviéndolo y adaptándolo, no reescribiéndolo.
- `lib/navigation.ts`: "Cuentas aéreas" (icono `Plane`) en el lugar de "Clic Kiu"; "Operadores aéreos" (icono `Building`) en Configuración.

## Pruebas

- `apps/api/test/air-accounts.db.test.ts` (Postgres real; reemplaza a `clickiu.db.test.ts`): cada CHECK y cada índice único; nombres sin distinguir mayúsculas; FK compuesta entre organizaciones; inmutables; la vista sin borrados y con cuentas sin movimientos (saldo 0); el cupo en prepago y en crédito (crear y subir emisión, bajar o borrar una entrada, saldo inicial negativo, bajar el límite, disponible justo en 0 aceptado); el código según el límite; **concurrencia** (dos emisiones en la misma cuenta: solo una confirma; en cuentas distintas: las dos); `REPEATABLE READ` rechazado; `app_runtime` lee la vista.
- `apps/api/test/air-accounts.test.ts` (Supertest; reemplaza a `clickiu.test.ts`): CRUD de los tres recursos; el `discriminatedUnion` (emisión sin campos, recarga con campos de tiquete, emisión con `amount`); monto calculado y recalculado al editar `taxes`; `PATCH` incoherente con su `code`; operador y cuenta inactivos; filtros, mes por defecto, `from > to` y `summary`; consolidado; auditoría; OpenAPI; aislamiento con `seedTwoOrgs()`.
- `audit-atomicity.test.ts`: el caso de Clic Kiu pasa a `air_account_movement.create`.
- `foundation.test.ts`: lista de enums de `anderp` (salen 2, entran 2).
- `packages/shared`: prueba del esquema (`discriminatedUnion`, PNR en mayúsculas, `description` vacía → `null`, `from > to`).
- Web (Testing Library): `issue-form-dialog` (total, aviso de cupo, disponible al editar), `movement-form-dialog` (signo del saldo inicial), `movement-filters` (estado solo con Emisión), `operator-balance-cards`, `accounts-table` (modalidad y saldo negativo).

## Despliegue

1. **Antes del merge (T010):** consulta de solo lectura en producción `SELECT count(*) FROM anderp.clickiu_movements`, con la confirmación del usuario. Si no es 0, se detiene y se vuelve a decidir.
2. Pipeline de F07: CI → aprobación → migraciones 0030–0033 → deploy. La guarda de la 0030 es la segunda barrera.
3. Durante la ventana entre la migración y el deploy, la API anterior responde 500 en `/clickiu` (riesgo aceptado por el usuario: sin datos ni uso).
4. Después: crear los operadores y las cuentas reales y sus saldos iniciales (lo hace el usuario).

## Notas de implementación

- **Cuatro migraciones (T001):** `drizzle-kit generate` pregunta de forma interactiva si las tablas nuevas son un renombre de `clickiu_movements`, y sin TTY falla. Se generó en dos pasos (primero solo el borrado, 0031; después solo la creación, 0032), así no hay nada que preguntar. Siguen yendo en un solo despliegue.
- **Nombres sin `citext` (T001):** `varchar(120)` con índice único sobre `lower(name)`, igual que `payment_obligations`; `citext` solo se usa en los correos.
- **Concurrencia (T001):** se comprobó que la prueba CA-18 falla si se quita el `pg_advisory_xact_lock` de `check_air_account_limit`.
- **Guarda de la 0030 (T001):** la prueba crea una `clickiu_movements` con una fila y ejecuta el archivo de la 0030: falla en el `DO` antes del `DROP VIEW`.
- **Web de Clic Kiu retirada en T003, no en T007:** quitar los esquemas y códigos `CLICKIU_*` del paquete compartido rompía la compilación de la página, que además ya no servía sin la API. Se borraron en T003 la página, sus componentes, `clickiu-api.ts` y la entrada del menú; T007 solo agrega lo nuevo.
- **Monto del saldo inicial (T003):** `-0.00` también se rechaza como 0.
- **Por cobrar como subconsulta correlacionada (T004):** el listado, la ficha y el consolidado leen `pendingCollection` con una subconsulta por cuenta en lugar de un `LEFT JOIN` a un agregado; con un helper de uniones compartido, el tipado de Drizzle no aceptaba campos distintos. Las sumas siguen en SQL.
- **Servicios (T004):** `AirOperatorsService` y `AirAccountsService`; los dos controladores van en `air-accounts.module.ts`, como hacía `clickiu.module.ts`.
