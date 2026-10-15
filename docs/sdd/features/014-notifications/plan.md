# F14 — Panel de notificaciones · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Datos

1. **`0026_notification_states` (generada con `pnpm db:generate`):**
   - enum `notification_kind` (`obligation_upcoming`, `obligation_overdue`);
   - `notification_states`: `id()`, `organizationId()`, `user_id uuid NOT NULL → users`, `due_date_id uuid NOT NULL`, `kind`, `seen_at timestamptz`, `dismissed_at timestamptz`, `created_at` y `updated_at` (`timestamptz NOT NULL DEFAULT now()`). **Sin `auditColumns`** (excepción de `design.md` §5.12);
     - `notification_states_org_id_uq (organization_id, id)`;
     - `notification_states_due_date_fk`: FK compuesta `(organization_id, due_date_id) → obligation_due_dates (organization_id, id)`;
     - `notification_states_key_uq`: `UNIQUE (user_id, due_date_id, kind)`, destino del upsert.

Sin triggers ni migración a mano. Los privilegios por defecto de `0000_base.sql` cubren la tabla para `app_runtime`. En Drizzle: `db/schema/notifications.ts`. El número de migración es orientativo.

## Paquete compartido

- `schemas/notifications.ts`:
  - `notificationKindSchema` (`obligation_upcoming`, `obligation_overdue`);
  - `notificationSchema`: `dueDateId`, `kind`, `obligationId`, `entityName`, `concept`, `dueDate`, `daysLeft`, `seen`;
  - `notificationsSchema`: `{ unseen: boolean, items: notificationSchema[] }`;
  - `dismissNotificationSchema`: `{ dueDateId: uuid, kind }`.
- **Error** en `codes.ts` y en `error-messages.es.ts`: `NOTIFICATION_NOT_FOUND` (404), "La notificación ya no está disponible.".

## API: módulo `notifications` (controlador → servicio, sin hexagonal)

- `ObligationsModule` exporta `ObligationsService`. **No se toca la regla de estados:** las notificaciones salen de `ObligationsService.list()` (la consulta `agenda()` de F13) filtrada a `overdue` y `upcoming`, que ya viene en el orden de CA-7. `kind` = `obligation_${status}`.
- `notifications.service.ts`, con `OrgScope` (`userId` sale de la sesión) y sin `AUDIT_LOGGER` (CA-6):
  - **`active()`** (privado): la lista filtrada de arriba, una entrada por vencimiento pendiente.
  - **`list()`:** `active()` + una consulta a `notification_states` del usuario (`scope.where` y `user_id = scope.userId`) con `due_date_id IN (…)`. Junta en memoria por `(dueDateId, kind)`: excluye las que tienen `dismissed_at`; `seen = seen_at IS NOT NULL`. `unseen = items.some(!seen)`. Sin alertas activas no hace la segunda consulta.
  - **`markSeen()`:** un `INSERT … ON CONFLICT (user_id, due_date_id, kind) DO UPDATE SET seen_at = coalesce(notification_states.seen_at, excluded.seen_at), updated_at = now()` con todas las de `active()`. Sin alertas, no hace nada.
  - **`dismiss({ dueDateId, kind })`:** si el par no está en `active()` → `DomainError(NOTIFICATION_NOT_FOUND, 404)`. Si está, el mismo upsert con `dismissed_at = coalesce(existente, now())` (idempotente).
- `notifications.module.ts`: `NotificationsController` en `/notifications`, `@ApiTags('notifications')`, DTO con `createZodDto`. Importa `ObligationsModule`. Los permisos son los de los guards globales, como en F13 (CA-10).
  - `GET /notifications` → `200`;
  - `POST /notifications/seen` → `204`;
  - `POST /notifications/dismiss` → `204`.

**Carrera aceptada:** `markSeen` marca lo activo al llegar la petición, no lo que el panel mostró. Solo difiere si una alerta aparece en ese mismo instante (medianoche u otro admin cambiando la Agenda). Si importara, la solución es enviar las claves mostradas en el cuerpo.

## Web

- `components/ui/popover.tsx`: el de shadcn sobre `radix-ui` (ya instalado; sin dependencias nuevas).
- `lib/notifications-api.ts`: `notificationKeys`, `getNotifications`, `markNotificationsSeen` y `dismissNotification`.
  - **`notificationKeys.all = [...obligationKeys.all, 'notifications']`:** las cuatro mutaciones de la Agenda ya invalidan `obligationKeys.all`, y por prefijo refrescan también las notificaciones (CA-18) sin tocar sus archivos. Si llega otra fuente de notificaciones, la clave se independiza.
- `lib/obligations-api.ts`: exportar `STATUS_CLASSES` (hoy local en `agenda-table.tsx`) junto a `STATUS_LABELS`, para que el panel use la misma insignia (CA-14). `dueText` ya está exportado.
- `components/notifications/notifications-bell.tsx`:
  - `Popover` con un `Button` `ghost` de icono `Bell` y, si `unseen`, un punto `bg-destructive` en la esquina (CA-12);
  - al abrir: guarda en estado las claves que llegaron con `seen: false` (marca "Nueva", CA-13) y, si `unseen`, llama a `markNotificationsSeen` e invalida `notificationKeys.all`;
  - cada notificación es un botón que navega a `/agenda` con `search: { status }` y cierra el panel (CA-15), con la X aparte (`aria-label="Descartar"`) que llama a `dismissNotification` e invalida (CA-16);
  - vacío: "No tienes notificaciones." (CA-17). Ancho `w-[min(22rem,calc(100vw-2rem))]`, `max-h` con scroll, `align="end"`.
- `routes/_app.tsx`: `NotificationsBell` junto a `UserMenu` dentro de `ml-auto`. Todos los usuarios de `_app` ven la Agenda (`navigationFor`), así que se muestra siempre.
- El contador del menú (`AgendaBadge`) no cambia (CA-19).

## Pruebas

- `apps/api/test/notifications.db.test.ts` (Postgres real): `notification_states_key_uq` (un segundo insert del mismo par falla) y la FK compuesta (un `due_date_id` de otra organización falla).
- `apps/api/test/notifications.test.ts` (Supertest), fechas con `addDays(todayIn(), n)` como en F13:
  - aparecen `obligation_upcoming` y `obligation_overdue`; Programado, sin pendiente y completado no;
  - `unseen` antes y después de `/seen`; una alerta nueva lo vuelve a encender;
  - por usuario: lo visto y descartado por el admin A no cambia nada para el admin B de la misma organización;
  - descartar: sale de la lista, dos veces → `204`, `kind` que no corresponde → `404`, vencimiento completado → `404`;
  - Próximo descartado que pasa a Vencido (`PUT /pending` con fecha pasada) → aparece `obligation_overdue` sin revisar;
  - Próximo descartado con fecha cambiada dentro del aviso → sigue descartado;
  - completar → la notificación desaparece;
  - `audit_logs` no cambia con `/seen` ni con `/dismiss`;
  - aislamiento con `seedTwoOrgs()` (no ve, `404` al descartar) y sin sesión `401`;
  - OpenAPI.
- `test/foundation.test.ts`: `notification_kind` en la lista de enums.
- Web (Testing Library), `components/notifications/notifications-bell.test.tsx` con la API simulada en la frontera HTTP: punto con y sin `unseen` (nunca un número), abrir llama a `/seen` y muestra "Nueva", pulsar navega a `/agenda?status=…` y cierra, la X llama a `/dismiss`, mensaje de vacío.

## Despliegue

Solo agrega un enum y una tabla: no rompe la API anterior. Pasa por el pipeline de F07. Sin variables de entorno ni tareas programadas nuevas.

## Notas de implementación

- **T001:** la migración generada es `0026_notification_states`; `drizzle-kit generate` confirma que no hay cambios pendientes. El comando correcto es `pnpm db:generate --name x`: con `--` (como decían `CLAUDE.md` y el README, ya corregidos), pnpm lo reenvía y drizzle-kit rechaza las opciones.
