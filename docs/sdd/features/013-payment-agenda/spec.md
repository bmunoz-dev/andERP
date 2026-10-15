# F13 — Agenda de pagos a entidades · Spec

- **Estado:** Borrador
- **Diseño:** `design.md` §3 (glosario), §5.2 (enum), §5.11 (`payment_obligations`, `obligation_due_dates`), §8 (pantalla Agenda). Se agregan al aprobar esta spec.
- **Depende de:** F02 (organizaciones y `OrgScope`), F12 (auditoría atómica)

## Objetivo

La empresa tiene obligaciones de pago periódicas con entidades (DIAN, Fontur, alcaldías…): declaraciones y contribuciones mensuales, bimestrales, trimestrales o anuales. AndERP lleva su **agenda**: qué vence, cuándo, y avisa con anticipación. **No registra el pago** (ni monto ni comprobante): solo la fecha límite y si ya se cumplió.

Las fechas las ingresa el usuario. AndERP no calcula el calendario tributario: cambia cada año por decreto y depende del NIT.

Las alertas son **dentro de la app**: no hay correo ni tareas programadas.

## Historias

- **HU1.** Como admin, quiero registrar una obligación (entidad, concepto, periodicidad, días de aviso y notas) con su primera fecha límite.
- **HU2.** Como admin, quiero ver la agenda ordenada por urgencia, con lo vencido y lo próximo a vencer resaltado.
- **HU3.** Como admin, quiero ver en el menú cuántas obligaciones están vencidas o próximas, desde cualquier pantalla.
- **HU4.** Como admin, quiero marcar un vencimiento como hecho y dejar programado el siguiente con una fecha sugerida que puedo ajustar.
- **HU5.** Como admin, quiero cambiar la fecha del vencimiento pendiente o quitarlo cuando la obligación deja de aplicar.
- **HU6.** Como admin, quiero ver el historial de una obligación: qué vencimientos se cumplieron, cuándo y quién los marcó.

## Criterios de aceptación

**Obligaciones**

- **CA-1.** Una obligación tiene `entityName` (hasta 100 caracteres), `concept` (hasta 150), `frequency` (`once` = única, `monthly`, `bimonthly`, `quarterly`, `semiannual`, `annual`), `noticeDays` (0 a 365, 15 por defecto) y `notes` opcionales.
- **CA-2.** No puede haber dos obligaciones con la misma entidad y concepto en la organización, sin distinguir mayúsculas: `409 DUPLICATE_OBLIGATION`. Una obligación borrada no cuenta.
- **CA-3.** Al crearla se indica `firstDueDate` y se crea su primer vencimiento pendiente en la misma transacción.
- **CA-4.** Se pueden editar entidad, concepto, periodicidad, días de aviso y notas. Borrar es lógico: la obligación y su historial dejan de aparecer.

**Vencimientos**

- **CA-5.** Una obligación tiene **como máximo un vencimiento pendiente**. La base de datos lo garantiza (`409 OBLIGATION_ALREADY_PENDING`).
- **CA-6.** Completar (`POST /obligations/:id/complete`) marca el pendiente con la fecha y el usuario, y si llega `nextDueDate` crea el siguiente pendiente, todo en una transacción. `nextDueDate` es opcional en cualquier periodicidad: sin él, la obligación queda sin próximo vencimiento. Si llega, debe ser posterior a la fecha que se completa: `422 NEXT_DUE_DATE_NOT_AFTER`.
- **CA-7.** Completar sin pendiente responde `409 NO_PENDING_DUE_DATE`. Si dos personas completan el mismo vencimiento a la vez, una lo completa y la otra recibe `409 DUE_DATE_ALREADY_COMPLETED`; queda un solo siguiente y una sola auditoría.
- **CA-8.** `PUT /obligations/:id/pending` con `dueDate` crea el pendiente si no hay o le cambia la fecha si existe. `DELETE /obligations/:id/pending` lo quita (`409 NO_PENDING_DUE_DATE` si no hay).
- **CA-9.** Un vencimiento completado no cambia de fecha ni de obligación: `422 DUE_DATE_COMPLETED_IMMUTABLE` (trigger en la base de datos).

**Agenda y estados**

- **CA-10.** El estado se calcula con la fecha de hoy en Bogotá y no se guarda:
  - `overdue` (Vencido): hay pendiente y su fecha es anterior a hoy;
  - `upcoming` (Próximo): hay pendiente y su fecha está entre hoy y hoy + `noticeDays` (bordes incluidos);
  - `scheduled` (Programado): hay pendiente con fecha posterior;
  - `none` (Sin próximo): no hay pendiente.
- **CA-11.** `GET /obligations` devuelve cada obligación con `pending` (`{ id, dueDate }` o `null`), `status` y `daysLeft` (días hasta la fecha; negativo si está vencida; `null` sin pendiente). Orden: Vencido, Próximo, Programado, Sin próximo; dentro de cada grupo, por fecha ascendente. Acepta `status` como filtro opcional.
- **CA-12.** `GET /obligations/:id` agrega `history`: los vencimientos del más reciente al más antiguo, con `dueDate`, `completedAt` y `completedBy` (`{ id, name }`), incluido el pendiente.

**Auditoría, permisos y aislamiento**

- **CA-13.** Crear, editar y borrar una obligación, completar un vencimiento y crear, cambiar o quitar el pendiente generan un registro en `audit_logs` en la misma transacción que el cambio (F12).
- **CA-14.** Todas las rutas requieren un admin de la organización o un super admin.
- **CA-15.** Un admin de la organización A no lista, lee, edita, borra ni completa obligaciones de B, ni toca sus vencimientos.

**Web**

- **CA-16.** Ítem **Agenda** en el menú (grupo Operación) con un contador de obligaciones vencidas + próximas: rojo si hay alguna vencida, ámbar si solo hay próximas, sin contador si no hay ninguna.
- **CA-17.** Página `/agenda` con pestañas Todos · Vencidos · Próximos · Programados · Sin próximo, cada una con su número; la pestaña elegida va en la URL.
- **CA-18.** Tabla con Estado (insignia: roja Vencido, ámbar Próximo, gris Programado, con borde Sin próximo), Entidad, Concepto, Periodicidad y Vence (`dd/mm/yyyy` y "en N días", "hoy" o "hace N días"). Acciones: Completar (solo con pendiente), Historial, Editar y Eliminar (con confirmación).
- **CA-19.** Diálogo de obligación: Entidad (sugiere las entidades ya usadas), Concepto, Periodicidad, Días de aviso (15 por defecto), Notas y, solo al crear, Primer vencimiento.
- **CA-20.** Diálogo Completar: muestra entidad, concepto y fecha; "Próximo vencimiento" viene con la fecha sugerida (la fecha que se completa más el periodo: 1, 2, 3, 6 o 12 meses; si el día no existe en el mes de destino, el último día de ese mes) y se puede cambiar o dejar vacío. En una obligación única viene vacío. Si la API responde `DUE_DATE_ALREADY_COMPLETED`, se muestra el mensaje y se refresca la agenda.
- **CA-21.** Historial en un panel lateral: cada vencimiento con su fecha y "Hecho el dd/mm/yyyy por {nombre}"; el pendiente con Cambiar fecha y Quitar; sin pendiente, Agregar vencimiento.

## Fuera de alcance

- Registrar el pago (monto, comprobante, número de radicado).
- Avisos por correo, notificaciones push o tareas programadas (siguiente paso posible: correo diario con GitHub Actions y Brevo).
- Calcular el calendario tributario de la DIAN o cualquier fecha legal.
- Catálogo de entidades (la entidad es texto libre con sugerencias).
- Deshacer un vencimiento completado por error.
- Relación con Egresos o con Credenciales.
