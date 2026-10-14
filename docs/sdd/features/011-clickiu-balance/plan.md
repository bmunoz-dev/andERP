# F11 — Saldo de Clic Kiu · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Datos

1. **`0020_clickiu_movements` (generada con `pnpm db:generate`):**
   - enums `clickiu_movement_type` (`recharge`, `sale`) y `clickiu_sale_status` (`credit`, `completed`);
   - tabla `clickiu_movements` con `id()`, `organizationId()`, `auditColumns` y `UNIQUE (organization_id, id)`, igual que `expenses`;
   - `clickiu_movements_status_ck`: `(type = 'sale') = (status IS NOT NULL)`;
   - `clickiu_movements_amount_ck`: `amount > 0`;
   - `clickiu_movements_org_date_idx (organization_id, movement_date) WHERE deleted_at IS NULL`.
2. **`0021_clickiu_rules` (escrita a mano, `pnpm db:generate:custom`):**
   - `v_clickiu_balance` (`security_invoker = true`): `organization_id`, `balance = SUM(amount) FILTER (recarga) - SUM(amount) FILTER (venta)`, con `COALESCE` a 0 y sin borrados.
   - `clickiu_movements_type_immutable` (`BEFORE UPDATE`): si cambia `type` → `RAISE 'CLICKIU_MOVEMENT_TYPE_IMMUTABLE'`.
   - `clickiu_movements_check_balance`: constraint trigger `AFTER INSERT OR UPDATE`, `DEFERRABLE INITIALLY DEFERRED`, `FOR EACH ROW`:
     1. `PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 0))`;
     2. si `balance < 0` en `v_clickiu_balance` para esa organización → `RAISE 'CLICKIU_INSUFFICIENT_BALANCE'`.

     Corre en cada cambio, aunque no pueda bajar el saldo (cambio de estado o borrado de una venta): es una suma indexada y evita una regla que decida cuándo revisar. El bloqueo se toma antes de leer, y en `READ COMMITTED` la lectura siguiente ya ve lo confirmado por la otra transacción: así dos ventas simultáneas se validan en serie (CA-9). La API no usa `REPEATABLE READ`; si algún día lo hiciera, esta regla tendría que revisarse.

   - Las dos funciones con `SET search_path = ''` y nombres calificados (`anderp.…`), para no sumar avisos `function_search_path_mutable` de Supabase (pendiente 3 de F07).
   - `GRANT SELECT` de la vista a `app_runtime` si los privilegios por defecto no la cubren (se verifica en T001, que corre con ese rol).

En Drizzle: `db/schema/clickiu.ts` con la tabla y la vista `.existing()`.

## Paquete compartido

`packages/shared/src/schemas/clickiu.ts`:

- `clickiuMovementTypeSchema`, `clickiuSaleStatusSchema`;
- `saveClickiuMovementSchema`: `type`, `status` opcional, `movementDate` (`isoDateSchema`), `amount` (`positiveMoneySchema`), `description` (máx. 500, `''` → `null`);
- `updateClickiuMovementSchema = saveClickiuMovementSchema.partial()`. Incluye `type` a propósito: si llega distinto, lo rechaza el trigger con su `code` (CA-3). Si Zod lo quitara, el cambio se ignoraría en silencio;
- `clickiuFiltersSchema`: `from`, `to`, `type` y `status` opcionales, con un `refine` para `from <= to` (`422 VALIDATION_ERROR`);
- `clickiuMovementSchema` y `clickiuSummarySchema` (`totalRecharged`, `totalSold`, `creditAmount`, `balanceAsOf`, `currentBalance`).

Zod **no** valida la combinación tipo/estado: la aplica solo el CHECK, registrado como `CLICKIU_SALE_STATUS_REQUIRED` (CA-2). Así hay una sola regla y la API responde igual al crear y al editar, en especial con un `PATCH { status }` sobre una recarga.

**Errores** en `codes.ts` y en `error-messages.es.ts`: `CLICKIU_INSUFFICIENT_BALANCE`, `CLICKIU_MOVEMENT_TYPE_IMMUTABLE` y `CLICKIU_SALE_STATUS_REQUIRED`.

## API: módulo `clickiu` (controlador → servicio, sin hexagonal)

- `clickiu.module.ts`: `ClickiuController` en `/clickiu` y `registerConstraintCodes({ clickiu_movements_status_ck: CLICKIU_SALE_STATUS_REQUIRED })`. Los dos `code` de los triggers llegan como `P0001` y el mapper ya los traduce.
- `clickiu.service.ts`, con el mismo patrón que `ExpensesService` (`OrgScope` y `AUDIT_LOGGER`):
  - `list(filters)`: `scope.where` + filtros, `ORDER BY movement_date DESC, created_at DESC`;
  - `summary(filters)`: una consulta con `SUM(amount) FILTER (…)` para `totalRecharged`, `totalSold` y `creditAmount` sobre lo filtrado, y `balanceAsOf` con todos los movimientos hasta `to`. `currentBalance` se lee de `v_clickiu_balance`;
  - `get`, `create`, `update` y `remove` (borrado lógico), con auditoría `clickiu_movement.create|update|delete` (antes/después);
  - rango por defecto: si no llegan `from` ni `to`, el primer y el último día del mes de `todayIn()` (con `parseIsoDate`, `daysInMonth` y `formatIsoDate`).
- Endpoints: `GET /clickiu/movements`, `GET /clickiu/summary`, `POST /clickiu/movements`, `GET|PATCH|DELETE /clickiu/movements/:id`, con `@ApiTags('clickiu')` y DTOs `createZodDto` (también para los filtros en `@Query()`).

## Web

- `lib/clickiu-api.ts`: consultas y mutaciones de TanStack Query. Al guardar o borrar se invalidan `movements` y `summary`.
- `routes/_app/clic-kiu.tsx`: `validateSearch` con un esquema propio que usa `.catch(undefined)` en cada campo (igual que `egresos.tsx`, para que una URL inválida no rompa la página), las cuatro tarjetas (`summary`), los filtros (Estado deshabilitado si Tipo ≠ Venta; al cambiar Tipo se limpia Estado) y el `DataTable` con sus acciones. "Marcar como completado" es un `PATCH { status: 'completed' }`.
- `components/clickiu/movement-form-dialog.tsx`: usa `FormDialog`, `MoneyInput` y `SelectField`. Estado solo para ventas; "Saldo disponible" = `currentBalance` (+ el monto original si se edita una venta), con el aviso si `sumMoney([saldo, -monto])` da negativo (sin aritmética con `number`).
- `lib/navigation.ts`: "Clic Kiu" (icono `Wallet`) en Operación.

## Pruebas

- `apps/api/test/clickiu.db.test.ts` (Postgres real): CHECK de estado y monto, tipo inmutable, la vista sin borrados, saldo negativo rechazado al crear, subir, bajar una recarga y borrarla, venta igual al saldo aceptada y **concurrencia** (dos transacciones en conexiones distintas con `Promise.all`; solo una confirma).
- `apps/api/test/clickiu.test.ts` (Supertest): CRUD, estados, auditoría, filtros (bordes, combinados, mes por defecto, `from > to`), `summary` y aislamiento con `seedTwoOrgs()`.
- Web (Testing Library): el diálogo (estado solo en ventas, aviso de saldo, saldo al editar) y la página (filtro de estado, marcar como completado).

## Despliegue

Solo agrega tablas, vista y triggers: no rompe la API anterior durante la ventana entre la migración y el despliegue. Pasa por el pipeline de F07 (CI → aprobación → migración → deploy). **Recomendación:** tener el respaldo de producción (pendiente 1 de F07) antes de desplegar F11.

## Notas de implementación

- **Privilegios (T001):** los privilegios por defecto de `0000_base.sql` (`ON TABLES`) ya cubren la vista; no hizo falta `GRANT`. La prueba lee `v_clickiu_balance` con `app_runtime`.
- **Concurrencia (T001):** la prueba CA-9 abre dos transacciones que insertan antes de que cualquiera confirme. Se comprobó que falla si se quita el `pg_advisory_xact_lock` del trigger.
- **Tipo inmutable:** el trigger usa `WHEN (OLD.type IS DISTINCT FROM NEW.type)`, así la función solo lanza el error.
