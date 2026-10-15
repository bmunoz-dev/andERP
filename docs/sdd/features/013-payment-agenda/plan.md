# F13 — Agenda de pagos a entidades · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Datos

1. **`0024_payment_obligations` (generada con `pnpm db:generate`):**
   - enum `obligation_frequency` (`once`, `monthly`, `bimonthly`, `quarterly`, `semiannual`, `annual`);
   - `payment_obligations`: `id()`, `organizationId()`, `entity_name varchar(100)`, `concept varchar(150)`, `frequency`, `notice_days smallint DEFAULT 15`, `notes text`, `auditColumns`;
     - `payment_obligations_org_id_uq (organization_id, id)`;
     - `payment_obligations_notice_days_ck`: `notice_days BETWEEN 0 AND 365`;
     - `payment_obligations_name_uq`: índice único sobre `(organization_id, lower(entity_name), lower(concept)) WHERE deleted_at IS NULL` (Drizzle acepta expresiones `sql` en `.on()`);
   - `obligation_due_dates`: `id()`, `organizationId()`, `obligation_id`, `due_date date`, `completed_at timestamptz`, `completed_by uuid → users`, `auditColumns`;
     - `obligation_due_dates_org_id_uq (organization_id, id)`;
     - `obligation_due_dates_obligation_fk`: FK compuesta `(organization_id, obligation_id) → payment_obligations (organization_id, id)`;
     - `obligation_due_dates_completed_ck`: `(completed_at IS NULL) = (completed_by IS NULL)`;
     - `obligation_due_dates_pending_uq`: índice único `(obligation_id) WHERE completed_at IS NULL AND deleted_at IS NULL`;
     - `obligation_due_dates_date_uq`: índice único `(obligation_id, due_date) WHERE deleted_at IS NULL`.
2. **`0025_obligation_rules` (escrita a mano, `pnpm db:generate:custom`):**
   - `obligation_due_dates_completed_immutable` (`BEFORE UPDATE`, `WHEN (OLD.completed_at IS NOT NULL AND (NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id))`) → `RAISE 'DUE_DATE_COMPLETED_IMMUTABLE'`. La función lleva `SET search_path = ''`, como las de F11.

Los privilegios por defecto de `0000_base.sql` cubren las tablas nuevas para `app_runtime`. En Drizzle: `db/schema/obligations.ts`. Los números de migración son orientativos.

## Paquete compartido

- `dates/calendar-date.ts`: `addMonths(date, months)`. Suma meses y, si el día no existe en el mes de destino, usa el último día de ese mes (`2026-01-31 + 1 → 2026-02-28`). Reutiliza `parseIsoDate`, `daysInMonth` y `formatIsoDate`.
- `schemas/obligations.ts`:
  - `obligationFrequencySchema`, y `FREQUENCY_MONTHS` (`monthly: 1` … `annual: 12`; `once` no tiene);
  - `saveObligationSchema`: `entityName` y `concept` (trim, mínimo 1), `frequency`, `noticeDays` (entero 0–365, por defecto 15) y `notes` (`optionalText`);
  - `createObligationSchema = saveObligationSchema.extend({ firstDueDate })`, y `updateObligationSchema = saveObligationSchema.partial()`;
  - `completeDueDateSchema`: `{ dueDateId: uuid, nextDueDate?: isoDate }`, y `pendingDueDateSchema`: `{ dueDate }`;
  - `obligationSchema` (agenda: `pending`, `status`, `daysLeft`) y `obligationDetailSchema` (agrega `history`).
- **Errores** en `codes.ts` y en `error-messages.es.ts`: `DUPLICATE_OBLIGATION`, `OBLIGATION_ALREADY_PENDING`, `DUE_DATE_ALREADY_COMPLETED`, `NO_PENDING_DUE_DATE`, `NEXT_DUE_DATE_NOT_AFTER` y `DUE_DATE_COMPLETED_IMMUTABLE`.

## API: módulo `obligations` (controlador → servicio, sin hexagonal)

- `obligations.module.ts`: `ObligationsController` en `/obligations`, con `@ApiTags('obligations')` y DTOs `createZodDto`. `registerConstraintCodes({ payment_obligations_name_uq: DUPLICATE_OBLIGATION, obligation_due_dates_pending_uq: OBLIGATION_ALREADY_PENDING })`. El trigger llega como `P0001` y el mapper ya lo traduce.
- `obligations.service.ts`, con `OrgScope`, `AUDIT_LOGGER` y la regla de F12: lectura del `before`, cambio y `audit.log(…, tx)` dentro de `db.transaction`. Los `get` aceptan `db: DbExecutor = this.db`.
  - **Agenda** (`list(status?)`): una consulta con `LEFT JOIN` al pendiente (`completed_at IS NULL AND deleted_at IS NULL`). `status` es un `CASE` y `daysLeft = due_date - :today` (con `today = todayIn()`). El orden lo da el rango del estado (vencido 0 … sin próximo 3), luego `due_date` y `entity_name`. El filtro `status` usa el mismo `CASE`.
  - **Detalle** (`get(id)`): la obligación más `history` (todos los vencimientos no borrados, `due_date DESC`), con `completedBy` como `users.first_name || ' ' || users.last_name` mediante `LEFT JOIN users`.
  - **Crear:** inserta la obligación y el primer vencimiento en una transacción, y audita `obligation.create`.
  - **Editar / borrar:** `obligation.update` y `obligation.delete`. Como en F12, `remove` comprueba el `returning` y lanza `NOT_FOUND` si otro la borró antes.
  - **Completar** (`complete(id, { dueDateId, nextDueDate })`), en una transacción:
    1. `UPDATE obligation_due_dates SET completed_at = now(), completed_by = :user WHERE id = :dueDateId AND obligation_id = :id AND completed_at IS NULL` + scope, con `RETURNING due_date`;
    2. si no afecta filas: si el vencimiento existe en esa obligación y está completado → `409 DUE_DATE_ALREADY_COMPLETED`; si no → `404`;
    3. si llega `nextDueDate`: debe ser `> due_date` (`422 NEXT_DUE_DATE_NOT_AFTER`); se inserta;
    4. audita `obligation_due_date.complete`, con la fecha completada y la siguiente.

    La segunda petición simultánea espera el bloqueo de fila de la primera y, al reevaluar el `WHERE`, no afecta filas: recibe el 409.
  - **`PUT /pending`:** `UPDATE … SET due_date WHERE obligation_id AND completed_at IS NULL`; si no afecta filas, `INSERT`. Audita `obligation_due_date.set`. Si hay dos inserciones simultáneas, el índice responde `OBLIGATION_ALREADY_PENDING`.
  - **`DELETE /pending`:** borrado lógico del pendiente (`409 NO_PENDING_DUE_DATE` si no hay). Audita `obligation_due_date.delete`.
- Endpoints: `GET /obligations`, `GET /obligations/:id`, `POST /obligations`, `PATCH|DELETE /obligations/:id`, `POST /obligations/:id/complete` y `PUT|DELETE /obligations/:id/pending`.

## Web

- `lib/obligations-api.ts`: `obligationKeys`, las funciones de cada endpoint y `countAlerts(list)` → `{ overdue, upcoming }`. Al guardar se invalida `obligationKeys.all`, y con eso se refrescan la agenda, el detalle y el contador del menú.
- `components/obligations/`:
  - `agenda-table.tsx`: insignias de estado, "Vence" con `daysLeft` y las acciones;
  - `obligation-form-dialog.tsx`: Entidad con `<input list>` y un `<datalist>` con las entidades ya usadas (salen de la agenda); Periodicidad con `SelectField`; Primer vencimiento solo al crear;
  - `complete-due-date-dialog.tsx`: "Próximo vencimiento" con `addMonths(dueDate, FREQUENCY_MONTHS[frequency])`, vacío en `once`; envía `dueDateId`; ante el 409 muestra el mensaje e invalida la agenda;
  - `obligation-history-sheet.tsx`: `Sheet` con el historial y las acciones del pendiente (cambiar fecha, quitar, agregar);
  - `agenda-badge.tsx`: `SidebarMenuBadge` con `countAlerts`, roja si hay vencidas, ámbar si solo hay próximas y oculta si no hay ninguna.
- `routes/_app/agenda.tsx`: `validateSearch` con `status` (`.catch(undefined)`), las pestañas (`Tabs`) con su número calculado en la web sobre la lista completa (una sola consulta para la tabla, las pestañas y el menú) y los diálogos.
- `lib/navigation.ts`: "Agenda" (icono `CalendarClock`) en Operación. `components/app-sidebar.tsx` muestra `AgendaBadge` en ese ítem.

## Pruebas

- `packages/shared/src/dates/calendar-date.test.ts`: `addMonths` (31 de enero +1, 30 de noviembre +3, 29 de febrero +12, +12 normal).
- `apps/api/test/obligations.db.test.ts` (Postgres real): los CHECK, el índice de nombre sin importar mayúsculas (y que una borrada no cuenta), "un solo pendiente" (y que un pendiente borrado no cuenta), la fecha única y el trigger de inmutabilidad (cambiar la fecha de un completado falla; la de un pendiente, no).
- `apps/api/test/obligations.test.ts` (Supertest):
  - CRUD y creación con el primer vencimiento;
  - estados y orden, con fechas relativas a `todayIn()` (`addDays`): ayer, hoy, hoy + `noticeDays`, hoy + `noticeDays` + 1 y sin pendiente;
  - completar con y sin siguiente, siguiente no posterior → 422, `dueDateId` ya completado → 409, `dueDateId` de otra obligación → 404;
  - **completar en paralelo:** un 200 y un 409, un solo siguiente y una sola auditoría `complete`;
  - `PUT` y `DELETE` del pendiente;
  - historial con `completedBy`;
  - auditoría de cada acción;
  - aislamiento entre A y B;
  - OpenAPI.
- `test/foundation.test.ts`: `obligation_frequency` en la lista de enums.
- Web (Testing Library): `countAlerts`, `AgendaBadge`, `AgendaTable` (insignias, "en N días" / "hoy" / "hace N días", Completar solo con pendiente), `CompleteDueDateDialog` (fecha sugerida trimestral y del 31 de enero, vacía en `once`, envía `dueDateId`, mensaje del 409), `ObligationFormDialog` (sugerencias de entidad) y `navigation.test.ts`.

## Despliegue

Solo agrega tablas, índices y un trigger: no rompe la API anterior. Pasa por el pipeline de F07 (CI → aprobación → migración → Render). Sin variables de entorno ni tareas programadas nuevas. **Recomendación:** hacer el respaldo de producción (pendiente 1 de F07) antes de cargar obligaciones reales.

## Notas de implementación

- **T001:** la migración generada crea `obligation_due_dates` antes que `payment_obligations` y agrega las FK al final; se aplica bien desde cero. `drizzle-kit generate` confirma que no hay cambios pendientes. Además de lo previsto, una prueba comprueba que un vencimiento no puede apuntar a una obligación de otra organización (FK compuesta).
- **T003:** el `CASE` del estado vive en un solo lugar (`agenda()`), que sirve a la lista, al filtro y al detalle. Los casos de crear, editar y borrar se agregaron a `audit-atomicity.test.ts` (F12): si la auditoría falla, no queda ni la obligación ni su primer vencimiento.
