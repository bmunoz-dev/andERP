# F14 — Panel de notificaciones · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §3 (glosario), §5.2 (enum), §5.9 (no se audita), §5.12 (`notification_states`), §8 (campana y panel).
- **Depende de:** F13 (agenda de pagos; de ella salen las notificaciones)

## Objetivo

Hoy la única señal de la Agenda es el contador del menú (F13 CA-16). F14 agrega una **campana** en la cabecera que abre un **panel de notificaciones**: cada una se puede pulsar para ir a la Agenda o descartar, y un punto en la campana indica que hay notificaciones sin revisar.

Por ahora la única fuente es la Agenda: vencimientos **Próximos** y **Vencidos**. Las notificaciones **no se guardan**: se calculan al consultar con la misma regla de estados de F13. Solo se guarda, por usuario, qué vio y qué descartó.

Como en F13, todo es dentro de la app: sin correo, push ni tareas programadas.

## Historias

- **HU1.** Como admin, quiero ver en la cabecera, desde cualquier pantalla, si tengo notificaciones sin revisar.
- **HU2.** Como admin, quiero abrir un panel con las obligaciones vencidas y próximas, e ir a la Agenda desde cada una.
- **HU3.** Como admin, quiero descartar una notificación que ya atendí o no me interesa, sin que vuelva a aparecer… salvo que la obligación pase a vencida.

## Criterios de aceptación

**Qué es una notificación**

- **CA-1.** Una notificación es el par **vencimiento pendiente + tipo**, con dos tipos: `obligation_upcoming` (el vencimiento está Próximo) y `obligation_overdue` (está Vencido), según F13 CA-10. Programado, Sin próximo, completado o borrado no generan notificación.
- **CA-2.** La notificación aparece sola cuando el vencimiento entra en Próximo o en Vencido (el cambio de día se toma de `todayIn()`, sin tareas programadas) y desaparece sola cuando deja de cumplir CA-1: se completa, se quita, se borra la obligación o su fecha sale del aviso.
- **CA-3.** Cambiar la fecha del pendiente (`PUT /obligations/:id/pending`) conserva el vencimiento, así que si sigue en el mismo tipo **es la misma notificación**: si estaba vista o descartada, sigue así.
- **CA-4.** Pasar de Próximo a Vencido crea una **notificación nueva** (otro tipo): aparece sin revisar aunque la Próxima se hubiera descartado.

**Estado por usuario**

- **CA-5.** Lo visto y lo descartado es de cada usuario: lo que hace un admin no cambia lo que ve otro admin de la misma organización.
- **CA-6.** Ver o descartar una notificación **no se registra en `audit_logs`**: no cambia datos del negocio (excepción a F12, `design.md` §5.9).

**API**

- **CA-7.** `GET /notifications` devuelve `{ unseen, items }`. Cada ítem trae `dueDateId`, `kind`, `obligationId`, `entityName`, `concept`, `dueDate`, `daysLeft` y `seen`. No incluye las descartadas. Orden: primero vencidas y luego próximas; dentro de cada grupo, por fecha ascendente (el de la Agenda). `unseen` es verdadero si alguna de `items` tiene `seen: false`.
- **CA-8.** `POST /notifications/seen` (sin cuerpo, `204`) marca como vistas todas las notificaciones activas del usuario en ese momento. No cambia la fecha de una ya vista.
- **CA-9.** `POST /notifications/dismiss` con `{ dueDateId, kind }` (`204`) descarta esa notificación para el usuario. Si no es una notificación activa de la organización (otra organización, vencimiento completado o borrado, o un `kind` que no corresponde al estado actual), `404 NOTIFICATION_NOT_FOUND`. Descartar dos veces responde `204`.

**Permisos y aislamiento**

- **CA-10.** Todas las rutas requieren un admin de la organización o un super admin, como la Agenda (F13 CA-14).
- **CA-11.** Un admin de la organización A no ve las notificaciones de B ni puede marcarlas como vistas o descartarlas (`404`).

**Web**

- **CA-12.** Campana en la cabecera, junto al menú de usuario, para quien ve la Agenda. Con notificaciones sin revisar muestra un **punto rojo, sin número**; su nombre accesible es "Notificaciones sin revisar" (sin punto: "Notificaciones").
- **CA-13.** Pulsar la campana abre un panel (popover, alineado a la derecha, con scroll si no caben). Al abrirlo se llama a `POST /notifications/seen` y el punto se apaga; mientras el panel sigue abierto, las que estaban sin revisar llevan la marca "Nueva".
- **CA-14.** Cada notificación muestra la insignia de estado de la Agenda (roja Vencido, ámbar Próximo), **Entidad · Concepto** y "Vence dd/mm/yyyy" con "en N días", "hoy" o "hace N días" (formato de F13 CA-18).
- **CA-15.** Pulsar una notificación cierra el panel y lleva a `/agenda?status=overdue` o `/agenda?status=upcoming` según su tipo.
- **CA-16.** Cada notificación tiene un botón "Descartar" (icono X), sin confirmación: llama a `POST /notifications/dismiss` y la notificación sale de la lista.
- **CA-17.** Sin notificaciones, el panel dice "No tienes notificaciones."
- **CA-18.** Las notificaciones se vuelven a consultar al volver a la pestaña del navegador y cuando una acción de la Agenda cambia algo (crear, editar o borrar una obligación; completar; cambiar o quitar el pendiente). No hay consultas periódicas.
- **CA-19.** El contador del ítem Agenda en el menú (F13 CA-16) se mantiene: cuenta todas las alertas, incluidas las descartadas.

## Fuera de alcance

- Otras fuentes de notificaciones (contratos, Clic Kiu, actividad de otros usuarios).
- Fijar notificaciones: una notificación ya se queda hasta que se resuelve o se descarta.
- Marcar como revisada una por una; deshacer un descarte.
- Abrir la obligación concreta desde la notificación (se llega a la pestaña filtrada de la Agenda).
- Correo, push o tareas programadas.
- Consultas periódicas para detectar notificaciones nuevas sin cambiar de pestaña.
- Prueba E2E con Playwright (se agrega cuando F07-T013 haya corrido por primera vez).
