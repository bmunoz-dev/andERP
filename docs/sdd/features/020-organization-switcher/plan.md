# F20 — Selector de organización · Plan

- **Estado:** Aprobado (2026-10-22)
- **Spec:** [spec.md](spec.md)

## Datos

Una migración, **`0035_organization_switcher`**, generada con `pnpm db:generate --name organization_switcher` después de tocar el esquema de Drizzle:

- `core.ts`:
  - `organizationMembers.lastSelectedAt: timestamptz()` (nula);
  - `sessions.organizationId: uuid().notNull()` y `foreignKey({ name: 'sessions_membership_fk', columns: [t.userId, t.organizationId], foreignColumns: [organizationMembers.userId, organizationMembers.organizationId] })`.
- `drizzle-kit` genera `ADD COLUMN ... NOT NULL`, que falla con filas existentes. Se edita el SQL a mano, en este orden:
  1. `ADD COLUMN organization_id uuid` (nula);
  2. el relleno de CA-2, con la misma regla que `findMembership` hoy (membresía activa y no borrada, organización no borrada, la más antigua), para que cada sesión quede con la organización que ya lleva su access token. Las sesiones que no encuentren ninguna (filas históricas) toman la membresía más antigua sin filtrar: la FK solo exige que exista;
  3. `DELETE` de las sesiones que sigan sin organización: un usuario con sesión siempre tuvo membresía, así que solo serían filas históricas huérfanas;
  4. `SET NOT NULL` y la FK.
  Son cambios de datos y de orden: el snapshot de Drizzle no cambia. Se revisa el SQL antes de aceptarlo.
- `registerConstraintCodes` (en `AuthModule`): `sessions_membership_fk` → `NOT_FOUND` (404). Solo ocurriría si la membresía desaparece entre la validación y el `INSERT`/`UPDATE`, y entonces la respuesta coincide con CA-9.
- Ni el seed ni los fixtures insertan sesiones: no cambian.

## Paquete compartido

- `schemas/auth.ts`:
  - `authProfileSchema` suma `organizations: z.array(z.object({ id: z.string().uuid(), name: z.string() }))` (CA-7);
  - `switchOrganizationSchema = z.object({ organizationId: z.string().uuid() })`.
- `errors/codes.ts`: `ORGANIZATION_CHANGED`; `error-messages.es.ts`: "Cambiaste de organización en otra pestaña. Recargando…".

## API

**Membresías (`ports.ts`, `drizzle-auth.repositories.ts`, `in-memory-auth.ts`):**

- `findMembership(userId)` se reemplaza por `findMemberships(userId): Promise<MembershipRecord[]>`. Es la misma consulta sin `LIMIT 1`, ordenada por `last_selected_at DESC NULLS LAST, organization_members.created_at ASC`. Devuelve las suspendidas: la regla del super admin depende del usuario y vive en `access.ts`.
- Una consulta sirve para todo: la organización de entrada es la primera disponible, la del token se busca por `id`, y el perfil lista todas.

**Reglas de acceso (`access.ts`):**

- `requireAccess(user, membership, status)` pasa a `requireAccess(user, memberships, preferredOrgId, status)`:
  - filtra las disponibles (CA-3: suspendidas fuera, salvo para el super admin);
  - sin ninguna, lanza `ACCOUNT_DISABLED` como hoy (CA-5);
  - devuelve `{ user, membership, organizations }`: `membership` es la preferida si está disponible, si no la primera; `organizations` son todas las disponibles.
- `toProfile` suma `organizations`, ordenadas por nombre (CA-7).
- Login: `preferredOrgId = null` (CA-4). Refresh: la organización de la sesión, y si no está disponible cae a la primera (CA-6). `GetCurrentUserUseCase` recibe el actor y usa `actor.organizationId`.

**Sesiones (`ports.ts`, `drizzle-auth.repositories.ts`, `in-memory-auth.ts`):**

- `NewSession` y `SessionRecord` suman `organizationId`. `SessionIssuer.issue` lo toma de `access.membership`, así la rotación del refresh (CA-6) guarda la organización resultante.
- `isFamilyActive(familyId, at): boolean` pasa a `findActiveFamilyOrganization(familyId, at): string | null`: la misma consulta, que ahora devuelve `organization_id` de la fila activa.
- `switchOrganization(familyId, userId, organizationId, at)`: en una transacción, `UPDATE sessions SET organization_id ... WHERE family_id = $1 AND revoked_at IS NULL` y `UPDATE organization_members SET last_selected_at = $at` (CA-8).

**Guard (`JwtAuthGuard`, CA-10):**

1. `findActiveFamilyOrganization(claims.sid)`; `null` → `SESSION_REVOKED`, como hoy.
2. Si no es igual a `claims.org` → `409 ORGANIZATION_CHANGED`.
3. `requireAccess(user, memberships, sessionOrg, 401)`. Si la organización elegida no es la de la sesión (la desactivaron ahí, pero le quedan otras) → `409 ORGANIZATION_CHANGED` también: la web recarga y el refresh cae a la siguiente (CA-6). Sin ninguna → `401 ACCOUNT_DISABLED`, como hoy.

Sigue siendo una consulta de sesión y una de membresías por petición, como hoy.

**Cambio (`SwitchOrganizationUseCase` y `POST /auth/organization`):**

- Recibe el actor (CLS) y `switchOrganizationSchema`. `@HttpCode(204)`.
- Busca el destino entre las disponibles; si no está → `NOT_FOUND` (CA-9). Si es la organización activa → termina sin escribir.
- `sessions.switchOrganization(...)` y después `audit.log({ action: 'auth.organization_switch', organizationId: destino, changes: { from, to } })`, fuera de la transacción como los demás eventos de auth (F12 CA-3).
- Una pestaña con el token viejo que llama al endpoint recibe `409` del guard antes de llegar: no puede cambiar desde una organización que ya no es la activa.

**Carrera conocida:** si un refresh de otra pestaña lee la sesión justo antes del cambio y la rota justo después, la fila nueva queda con la organización anterior y el cambio se pierde. Es seguro: el guard compara con la fila activa y todas las pestañas terminan en la misma organización. El usuario vuelve a elegir. No se agrega bloqueo.

## Web

- `lib/auth-api.ts`: `switchOrganization(organizationId)` (`POST /auth/organization`).
- `lib/organization-switch.ts` (nuevo, pocas líneas):
  - `goHome()`: `window.location.assign('/egresos')`;
  - `announceSwitch()`: `new BroadcastChannel('anderp-organization').postMessage('switched')`;
  - `listenForSwitch()`: el mismo canal, con `onmessage = goHome`. Se llama una vez en `main.tsx`.
  - `BroadcastChannel` viene en el navegador y en Node: sin dependencias.
- `lib/api-client.ts`: en `apiFetch`, un `ApiError` con `ORGANIZATION_CHANGED` llama a `goHome()` antes de relanzar (CA-15).
- `components/organization-switcher.tsx` (nuevo):
  - con menos de dos organizaciones, el mismo `<span>` de hoy (CA-13);
  - con dos o más, `DropdownMenu` de `ui/dropdown-menu.tsx` (ya existe, como `user-menu.tsx`): el nombre de la activa como disparador y un ítem por organización, con `Check` en la activa;
  - al elegir otra: `switchOrganization`, `announceSwitch()`, `goHome()` (CA-14). Si falla, el error se muestra como en `user-menu.tsx`.
- `routes/_app.tsx`: el `<span>` de la cabecera pasa a `<OrganizationSwitcher user={auth.user} />`. Con `truncate` y el menú, entra en la cabecera del celular (CA-16).

## Pruebas

- **API, Postgres real (`test/organization-switch.test.ts`):**
  - FK de sesiones y relleno de la migración (CA-1, CA-2; como en F19, la prueba extrae el `UPDATE` del archivo y lo ejecuta sobre datos recién creados);
  - organización de entrada, suspendidas, super admin y sin organizaciones (CA-3 a CA-5);
  - refresh con la organización de la sesión y con la caída a la siguiente (CA-6);
  - `organizations` en el perfil (CA-7);
  - cambio, `last_selected_at`, auditoría, `404` y elegir la activa (CA-8, CA-9);
  - token viejo con `409` en lectura y escritura sin guardar (CA-10);
  - dos sesiones independientes (CA-11) y A contra B con `seedTwoOrgs` (CA-12).
- **Unitarias:** `auth.use-cases.test.ts` se adapta a `findMemberships` y suma los casos de `requireAccess`.
- **Web:**
  - `organization-switcher.test.tsx`: una organización sin menú, dos con menú y la activa marcada, y elegir otra llama al endpoint, avisa y va a `/egresos` (CA-13, CA-14);
  - `api-client.test.ts`: `409 ORGANIZATION_CHANGED` llama a `goHome` (CA-15).

## Despliegue

Dos PR (CA-18), en la rama `feat/020-organization-switcher`:

1. **PR 1:** bloques A a C. Datos, shared y API. La web en producción ignora `organizations` y nunca llama al endpoint nuevo. El `409` no aparece: nadie cambia de organización sin la web nueva, y las sesiones rellenadas tienen la misma organización que sus tokens.
2. **PR 2:** bloque D, la web, desde `main` después del merge del PR 1. Después del despliegue, el usuario hace la verificación de CA-19.

## Notas de implementación

- **Migración 0035 (T002):** la generó `drizzle-kit` y se editó a mano en el orden del plan (columna nula, relleno, `DELETE` de huérfanas, `NOT NULL`, FK). La base de pruebas se migra vacía, así que la prueba extrae del archivo el `UPDATE` y el `DELETE`, y los ejecuta en una transacción que se revierte, tras quitar el `NOT NULL` y la FK de `sessions`. Cubre: la más antigua activa gana sobre una inactiva más vieja, sin activas toma la más antigua sin filtrar, y sin membresía se borra. El orden real de aplicación sobre las filas de producción queda por confirmar al desplegar.
- **`sessions_membership_fk` → 404 (T002):** `mapPostgresError` responde `422` a toda violación de FK y solo deja cambiar el `code`. Queda registrada como `NOT_FOUND`, así que en la carrera (la membresía desaparece entre la validación y el `INSERT`/`UPDATE`) la respuesta es `422 NOT_FOUND`, no `404`. No se toca el mapper: el caso normal de CA-9 es el `404` del caso de uso y esta ventana es mínima.
- **Typecheck entre tareas (T002–T004):** al agregar `sessions.organization_id` y exigir `organizations` en el perfil, el typecheck estuvo en rojo hasta que T003 (web) y T004 (API) llenaron los datos. El PR 1 se evalúa completo.
- **Web (T003):** solo se agregó `organizations` a los tres perfiles de prueba que dejaron de compilar (`ledger-sheet`, `notifications-bell`, `api-client.refresh`) y el mensaje de `ORGANIZATION_CHANGED`. Nada de interfaz: es el PR 2.
- **Guard (T004–T005):** en T004 se usó `claims.org` como organización preferida mientras la sesión no la devolvía; T005 la reemplazó por `findActiveFamilyOrganization`. Siguen siendo una consulta de sesión y una de membresías por petición.
- **`findMemberships` (T004):** ordena en SQL con `last_selected_at DESC NULLS LAST, created_at ASC`. El doble en memoria devuelve las membresías en el orden en que se agregan (`addMembership`), y las pruebas de `requireAccess` pasan la lista ya ordenada.
- **`organizations` del perfil (T004):** se ordenan por nombre con `localeCompare('es')`; la organización activa no se separa de la lista.
- **Cambio (T006):** `SwitchOrganizationUseCase` reutiliza `requireAccess` para saber cuáles están disponibles (suspendidas fuera, salvo para el super admin) y no repite la regla. La auditoría lleva `organizationId` de destino y `changes: { from, to }`.
- **Pruebas (T002–T006):** `createMember` ya inicia una sesión, así que los casos de sesión borran las filas del usuario antes de empezar; las de auditoría filtran por usuario porque la tabla es de solo inserción y no se limpia entre casos.
- **Entorno:** en Windows, `vitest` cierra un worker al arrancar (`0xC0000409`) en algún archivo de la API; repetir el archivo lo resuelve.

- **Rama del PR 2:** se desarrolló en `feat/020-organization-switcher-web`, creada desde la rama del PR 1 antes de su merge; se integra `main` antes de mergear.
- **Menú (T008):** se usa `DropdownMenuCheckboxItem` con `onSelect`, que da el `Check` en la activa y `aria-checked` sin código propio. Elegir la activa retorna sin llamar a la API.
- **Error del cambio (T008):** `user-menu.tsx` no muestra errores; se usa `toast.error(errorMessage(e))` como en `password-buttons.tsx`. Si falla, no se avisa a las otras pestañas ni se recarga.
- **`BroadcastChannel` (T008–T009):** `announceSwitch` abre el canal, publica y lo cierra; `listenForSwitch` mantiene el suyo abierto toda la vida de la pestaña. Un canal no recibe sus propios mensajes, así que la pestaña que cambia no se recarga dos veces.
- **Pruebas de la web (T008):** el repositorio no tiene `user-event`; se abre el menú con `fireEvent.keyDown` (Enter) sobre el disparador. CA-16 (celular) queda para la verificación manual: el disparador y los ítems llevan `truncate` y el menú `max-w-[calc(100vw-2rem)]`.
- **Refresh hacia otra organización (T009, revisión):** una pestaña dormida que no recibió el aviso y cuyo access token venció recibía `TOKEN_EXPIRED`, renovaba la sesión con el token de la organización nueva y repetía la petición: el guard la aceptaba y la escritura quedaba en la otra organización, sin `409`. `apiFetch` compara la organización antes y después del refresh; si cambió, no repite la petición, recarga en `/egresos` y lanza `ORGANIZATION_CHANGED` (`api-client.refresh.test.ts`).
- **CA-19 (T010):** PR 2 mergeado (#42, 2026-10-22) y desplegado; el usuario hizo la verificación manual en producción el 2026-10-22.
