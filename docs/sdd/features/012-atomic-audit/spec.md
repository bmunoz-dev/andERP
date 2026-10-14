# F12 — Auditoría atómica · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §5.9 (auditoría)
- **Depende de:** F01 (servicio de auditoría) y los módulos que auditan cambios (F02–F06, F11)

## Objetivo

Hoy `AuditService.log()` escribe en `audit_logs` con su propia conexión, después de que el cambio ya se confirmó. Si ese insert falla, o el proceso muere entre las dos sentencias, el cambio queda guardado sin su registro, y la constitución exige `audit_logs` para el dinero, las credenciales y la autenticación.

F12 hace que cada cambio auditado y su registro se confirmen juntos o no se confirmen. No cambia qué se audita ni el comportamiento visible de la API.

## Historias

- **HU1.** Como responsable de la empresa, quiero que todo cambio auditado tenga su registro en `audit_logs`, para poder reconstruir quién cambió qué sin huecos.

## Criterios de aceptación

- **CA-1.** El cambio y su registro de auditoría se escriben en la misma transacción. Si falla el insert en `audit_logs`, el cambio no queda guardado y la API responde `500`.
- **CA-2.** CA-1 aplica a estas operaciones:
  - `clickiu`: crear, editar y borrar un movimiento;
  - `expenses`: crear, editar y borrar un egreso;
  - `fee-payments`: crear, editar y borrar un pago;
  - `contracts`: crear, editar y borrar un contrato;
  - `organizations`: crear y editar una organización;
  - `members`: invitar, reenviar la invitación y activar o desactivar;
  - `credentials`: editar una credencial.
- **CA-3.** Se auditan igual que hoy, fuera de cualquier transacción de negocio, los eventos de auth (login, login fallido, bloqueo, cambio y recuperación de contraseña), que deben quedar aunque falle lo demás, y `credential.reveal`, que ya audita antes de devolver la contraseña.
- **CA-4.** Al desactivar un miembro, la membresía y su auditoría se confirman juntas. Las sesiones se revocan después de confirmar. Si la revocación falla, el miembro queda desactivado y sus sesiones vencen solas, como puede ocurrir hoy.
- **CA-5.** El resto del comportamiento no cambia: los mismos `code` de error (incluido `CLICKIU_INSUFFICIENT_BALANCE`, que el trigger diferido sigue lanzando al confirmar), las mismas respuestas y los mismos registros en `audit_logs` cuando todo sale bien.

## Fuera de alcance

- Auditar la creación y el borrado de credenciales: hoy no se registran. Es otro hueco frente a la constitución y se decide aparte.
- Enviar los correos de invitación después de confirmar: hoy se envían dentro de la transacción.
- Que `revokeAllForUser` reciba la transacción, lo que obliga a cambiar el puerto de auth.
- Bloquear la fila con `FOR UPDATE` para que el `before` sea exacto con ediciones simultáneas.
