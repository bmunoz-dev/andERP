# F21 — Sesión y acceso · Spec

- **Estado:** Aprobado (2026-11-06)
- **Origen:** [revisión de huecos del 2026-11-06](../../../reviews/2026-11-06-revision-modulos.md) (auth, organizations, transversales y sesión en la web).
- **Diseño:** `design.md` §5.3 (`organization_members.last_access_at`, invitaciones por organización), §6.2 (contador de bloqueo, revocación de sesiones, limpieza, riesgo aceptado del aviso de bloqueo) e historial (reemplaza la decisión del 2026-10-09). Los cambios a `design.md` se hacen en la primera tarea, antes del código.
- **Depende de:** F01 (login, sesiones, throttle), F02 (miembros e invitaciones), F12 (auditoría atómica), F20 (organización activa en la sesión).

## Objetivo

La revisión encontró que varias reglas de acceso fallan con peticiones simultáneas o con usuarios de varias organizaciones, y que la web conserva datos de la sesión anterior.

F21 hace que:

- el bloqueo por intentos fallidos y la regla del último administrador se cumplan aunque lleguen peticiones a la vez;
- lo que pase en una organización no afecte a las otras del mismo usuario;
- cerrar sesión, o perderla, borre de la web los datos de la organización.

## Decisiones del usuario (2026-11-06)

- **Cada organización tiene sus propias invitaciones.** Invitar a un usuario sin contraseña ya no anula sus invitaciones pendientes en otras organizaciones. Esto **reemplaza la decisión del 2026-10-09** (F02 CA-20), que se tomó porque el login entraba siempre en la organización más antigua; F20 resolvió eso con el selector.
- **El aviso "cuenta bloqueada" se mantiene (riesgo aceptado).** Revela que un email existe y permite bloquear a otro a propósito durante 15 minutos. Con pocos usuarios, todos internos, el aviso ayuda más de lo que expone. Se corrige el contador (CA-1).

## Decisiones técnicas (de quien escribe la spec)

- **Al desactivar un miembro o suspender una organización se revocan solo las sesiones cuya organización activa es esa.** La revocación global expulsaba al usuario de todas sus organizaciones. No revocar nada tampoco sirve: si se desactiva a alguien para cortar una sesión robada y después se le reactiva, la sesión robada volvería a funcionar. (Corregido el 2026-11-06 al planificar; la primera versión aprobada decía "no se revocan sesiones".)
- **El último ingreso que ve un admin es el de su organización:** columna nueva `organization_members.last_access_at`. `users.last_login_at` deja de mostrarse.
- **Limpieza de filas viejas sin tareas programadas:** al iniciar sesión se borran las del propio usuario.

## Historias

- **HU1.** Como responsable de la plataforma, quiero que el bloqueo por intentos fallidos funcione aunque alguien envíe muchos intentos a la vez.
- **HU2.** Como usuario de varias empresas, quiero que desactivarme en una no me saque de las demás. Como admin, quiero que desactivar a alguien corte de verdad sus sesiones en mi organización.
- **HU3.** Como admin de una organización, quiero que nunca quede sin nadie que pueda entrar a administrarla.
- **HU4.** Como admin de una organización, quiero invitar a alguien sin anular la invitación que le hizo otra empresa, y no ver su actividad en otras empresas.
- **HU5.** Como usuario de un equipo compartido, quiero que al cerrar sesión no quede nada de mi organización a la vista del siguiente.

## Criterios de aceptación

**Login y contraseña**

- **CA-1.** Cada intento fallido incrementa `users.failed_login_attempts` en SQL (`= failed_login_attempts + 1 ... returning`), y la decisión de bloquear usa el valor devuelto. Con N intentos fallidos simultáneos, el contador sube exactamente N, y al llegar a 5 la cuenta queda bloqueada 15 minutos (F01 CA-3).
- **CA-2.** `POST /auth/password/change` tiene el mismo throttle que los demás endpoints de auth y responde `429` al superarlo.
- **CA-3.** `POST /auth/password/forgot` responde `202` sin esperar a ninguna escritura. Invalidar tokens, crear el nuevo, auditar y enviar el correo ocurren después de responder; un error ahí se registra en el log y no cambia la respuesta. El tiempo de respuesta no depende de si el email existe.
- **CA-4.** Un login exitoso borra del usuario las sesiones con `expires_at` vencido y los `password_resets` vencidos o usados. No toca sesiones vigentes ni revocadas sin vencer, que la detección de reutilización del refresh necesita.

**Miembros y organizaciones**

- **CA-5.** Desactivar un miembro en A revoca solo sus sesiones con `organization_id = A`. Suspender A revoca las sesiones con `organization_id = A` de sus miembros que no son super admin. Pruebas con un usuario miembro de A y de B, con una sesión en A y otra en B:
  - Tras desactivarlo en A, la sesión en A queda revocada (su refresh responde `401 SESSION_REVOKED`), y la sesión en B sigue funcionando, refresh incluido.
  - Reactivarlo en A no revive la sesión revocada.
  - Lo mismo al suspender A. El super admin sigue entrando a la suspendida.
  - La revocación se hace después de confirmar el cambio (F12 CA-4). Si falla, el error se registra en el log y la respuesta es la normal, no un `500`.
- **CA-6.** La regla `LAST_ADMIN` se evalúa dentro de la transacción del cambio, bloqueando la fila de la organización (`FOR UPDATE`). Cuenta solo a los miembros activos **con contraseña**, sin incluir a quien se desactiva. Pruebas:
  - Desactivar al único miembro activo con contraseña responde `422 LAST_ADMIN`.
  - Si los demás miembros activos son invitados sin contraseña, también responde `422 LAST_ADMIN`.
  - Dos desactivaciones cruzadas simultáneas: una responde `422 LAST_ADMIN` y la organización conserva un miembro activo.
- **CA-7.** Invitar a un usuario sin contraseña que tiene una invitación pendiente en otra organización crea la membresía nueva y **no borra** las otras. Desaparecen el borrado y el evento `member.invitation_replaced`.
  - El usuario sigue con un solo token de invitación vigente: el nuevo invalida el anterior, como hoy.
  - Al activar la cuenta con cualquier enlace vigente, todas sus membresías quedan usables, y el primer login entra en la organización de la membresía creada más recientemente (se marca su `last_selected_at`).
  - La prueba de F02 CA-20 se reemplaza por esta.
- **CA-8.** `organization_members.last_access_at` (`timestamptz`, nula) se actualiza en dos casos: al entrar con login en esa organización y al cambiarse a ella (`POST /auth/organization`). El listado de miembros devuelve ese valor en `lastLoginAt`, sin cambiar el contrato, y nunca `users.last_login_at`. Prueba: un usuario que entra a A no cambia su último ingreso en B.

**Logs**

- **CA-9.** Un error inesperado de la base de datos se registra solo con el código del driver, la restricción, la tabla y la columna. Nunca incluye los parámetros de la consulta ni el texto del error de Drizzle que los contiene. Prueba: provocar un error real de Drizzle con un valor centinela entre los parámetros y comprobar que el log no lo contiene.

**Web**

- **CA-10.** Cerrar sesión vacía la caché de datos (`queryClient.clear()`) antes de navegar a `/login`. Prueba: después de cerrar sesión, la caché está vacía.
- **CA-11.** Fuera de las pantallas de login, activación y recuperación de contraseña, cualquier `401` distinto de `TOKEN_EXPIRED` se trata como sesión vencida. Esto incluye `SESSION_REVOKED`, `UNAUTHORIZED` y `ACCOUNT_DISABLED`: se borra la sesión, se vacía la caché y se navega a `/login` con `redirect`, igual que hoy al vencer la sesión.
- **CA-12.** Pruebas del guard de `_app.tsx`: sin sesión redirige a `/login` con `redirect`, y con el paquete de una ruta apagado redirige a `/egresos`.

**Entrega**

- **CA-13.** Un solo PR. La migración solo agrega una columna nula, así que es compatible con la versión anterior de la API.

## Fuera de alcance

- Avisar del cierre de sesión a las otras pestañas. Con CA-11, cada pestaña vuelve al login en su siguiente petición.
- Ocultar el aviso "cuenta bloqueada" (riesgo aceptado).
- Tareas programadas de limpieza.
- Pedir consentimiento a un usuario existente antes de agregarlo a otra organización.
