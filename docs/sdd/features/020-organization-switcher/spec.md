# F20 — Selector de organización · Spec

- **Estado:** Aprobado (2026-10-22)
- **Diseño:** `design.md` §5.3 (`sessions.organization_id`, `organization_members.last_selected_at`), §6 (sesión y token con organización activa), §8 (selector en la cabecera), §11 (sale "selector de organización" de fuera de alcance) e historial. Los cambios a `design.md` se hacen en la primera tarea, antes del código.
- **Depende de:** F01 (sesiones, token, guard), F02 (organizaciones y membresías), F12 (auditoría atómica), F15 (vista de celular), F19 (paquetes por organización en el perfil).

## Objetivo

Con F19, AndERP sirve a varias empresas cliente. Hoy un usuario que pertenece a dos organizaciones siempre entra en la más antigua: `findMembership` toma la membresía activa más antigua y `JwtAuthGuard` la vuelve a calcular en cada petición, ignorando el `org` del token.

F20 deja que ese usuario **cambie de organización dentro de la app, sin volver a iniciar sesión**, con **una sola organización activa por sesión** y sin posibilidad de escribir en la equivocada: el servidor rechaza cualquier petición hecha con la organización anterior.

## Decisiones del usuario (2026-10-22)

- **Caso de uso:** una persona (un contador, el dueño de la plataforma) que atiende varias empresas y cambia de una a otra varias veces en el día. Por eso el selector está dentro de la app y no solo en el login.
- **Una organización a la vez por navegador.** La organización activa se guarda en la sesión (la familia del refresh token), que comparten todas las pestañas. Al cambiar, las otras pestañas se recargan en la nueva; si alguna intenta usar la anterior, el servidor la rechaza. No hay una organización distinta por pestaña.
- **Cada sesión es independiente:** cambiar en el portátil no cambia el celular. Por eso la organización activa va en `sessions` y no en `users`.
- **Al iniciar sesión se entra en la última organización elegida**, guardada en la base (sirve en cualquier navegador). Si nunca eligió, la más antigua (como hoy). Si la última ya no está disponible, la siguiente.
- **El super admin solo elige entre las organizaciones de las que es miembro.** Para entrar a la de un cliente se agrega como miembro desde Plataforma, y eso queda auditado. No hay acceso sin membresía.
- **Organizaciones suspendidas:** no se ofrecen a un usuario normal, que entra en la siguiente activa (hoy, si la más antigua estaba suspendida, se le negaba el acceso aunque tuviera otra activa). El super admin sí puede entrar a una suspendida, como hoy.
- **Entrega en dos PR** (ver CA-18).

## Historias

- **HU1.** Como usuario de varias empresas, quiero cambiar de organización desde la cabecera sin cerrar sesión.
- **HU2.** Como usuario de varias empresas, quiero entrar directamente a la última organización que usé.
- **HU3.** Como responsable de la plataforma, quiero que una pestaña que quedó con la organización anterior no pueda leer ni escribir en ella.
- **HU4.** Como usuario de una sola organización, quiero que la app se vea y funcione igual que hoy.

## Criterios de aceptación

**Modelo**

- **CA-1.** Columna `sessions.organization_id uuid NOT NULL` con FK compuesta `(user_id, organization_id)` → `organization_members (user_id, organization_id)` (`sessions_membership_fk`, registrada en `registerConstraintCodes`). Insertar una sesión con una organización de la que el usuario no es miembro falla. El único borrado físico de membresías (F02 CA-20, `member-onboarding.ts`) es de usuarios sin contraseña, que nunca tuvieron sesión, así que la FK no lo bloquea.
- **CA-2.** Columna `organization_members.last_selected_at timestamptz` (nula hasta que se elige). La migración rellena `sessions.organization_id` de cada sesión existente con la membresía activa más antigua de su usuario (la que usan hoy); nadie tiene que volver a iniciar sesión.
- **CA-3.** **Organizaciones disponibles** para un usuario: membresía activa y no borrada, organización no borrada y, si el usuario no es super admin, organización no suspendida. **Organización de entrada:** la disponible con `last_selected_at` más reciente; si ninguna tiene, la de membresía más antigua.

**Login, refresh y perfil**

- **CA-4.** El login entra en la organización de entrada (CA-3) y la guarda en la sesión nueva. No marca `last_selected_at`: solo lo marca una elección del usuario (CA-8).
- **CA-5.** Sin organizaciones disponibles, el login y el refresh responden `ACCOUNT_DISABLED` como hoy, y el refresh revoca la familia.
- **CA-6.** El refresh emite el token de la organización de la sesión. Si esa ya no está disponible (por ejemplo, desactivaron al usuario en ella), pasa a la organización de entrada (CA-3) y actualiza la sesión.
- **CA-7.** El perfil (`/auth/me`, login y refresh) incluye `organizations: { id, name }[]` con las organizaciones disponibles, ordenadas por nombre. `organization`, `role` y `modules` son los de la organización activa.

**Cambio de organización**

- **CA-8.** `POST /auth/organization` con `{ organizationId }` hacia una organización disponible responde `204`. En una transacción cambia `organization_id` de las filas sin revocar de la familia de la sesión y marca `last_selected_at`. Después registra `auth.organization_switch` con la organización de origen y la de destino, fuera de la transacción, como los demás eventos de auth (F12 CA-3).
- **CA-9.** Si la organización no está disponible para el usuario (no es miembro, membresía inactiva, organización suspendida o borrada, o no existe), responde `404 NOT_FOUND` y no cambia ni audita nada. Elegir la organización activa responde `204` sin auditar.
- **CA-10.** `JwtAuthGuard` obtiene la organización de la sesión en la misma consulta que hoy comprueba que la familia esté activa. Si no coincide con el `org` del token, responde `409 ORGANIZATION_CHANGED` (código nuevo, con su mensaje en español) en cualquier ruta, y una escritura con ese token no se guarda. El actor se arma con la membresía de la organización de la sesión, no con la más antigua.
- **CA-11.** Dos sesiones del mismo usuario son independientes: cambiar de organización en una no afecta a la otra.
- **CA-12.** Aislamiento: después de cambiar de A a B, con el token nuevo el usuario no ve ni toca datos de A.

**Web**

- **CA-13.** Con dos o más organizaciones disponibles, el nombre de la organización en la cabecera (`_app.tsx`) es un menú desplegable con la lista y la activa marcada. Con una sola, la cabecera se ve como hoy.
- **CA-14.** Al elegir otra organización: `POST /auth/organization`, aviso por `BroadcastChannel('anderp-organization')` a las otras pestañas y recarga completa en `/egresos` (Base, siempre existe).
- **CA-15.** Una pestaña que recibe el aviso, o una petición que recibe `409 ORGANIZATION_CHANGED` en `api-client.ts`, recarga en `/egresos`. Lo no guardado en esa pestaña se pierde.
- **CA-16.** El selector funciona por debajo de 768 px (F15).

**Pruebas y despliegue**

- **CA-17.** Pruebas de la API contra Postgres real para CA-1 a CA-12 (CA-2: la prueba ejecuta el relleno de la migración sobre datos recién creados, como en F19). Pruebas de la web para CA-13 a CA-15.
- **CA-18.** Dos PR: el **PR 1** lleva migración, `packages/shared` y API (la web actual ignora `organizations` y nunca llama al endpoint nuevo); el **PR 2** lleva la web y se mergea cuando el PR 1 ya está en producción. Sin código de transición.
- **CA-19.** Después del despliegue del PR 2, el usuario verifica a mano en producción el cambio entre dos organizaciones, en el computador y en el celular.

## Fuera de alcance

- Una organización distinta por pestaña.
- Acceso del super admin a organizaciones de las que no es miembro.
- Cambiar la regla del 2026-10-09 (invitar a un usuario sin contraseña a otra organización reemplaza su invitación pendiente).
- Conservar la página o los formularios sin guardar al cambiar de organización.
- La organización en la URL, los enlaces o las notificaciones.
