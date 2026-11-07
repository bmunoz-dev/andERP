# F23 — Reglas de datos en la base · Spec

- **Estado:** Aprobado (2026-11-06)
- **Origen:** [revisión de huecos del 2026-11-06](../../../reviews/2026-11-06-revision-modulos.md) (prestadores, contratos, credenciales, documentos y pagos).
- **Diseño:** `design.md` §5.5 (reglas de prestadores, contratos y pagos), §5.8 (credenciales hacia responsables vigentes), §5.9 (auditoría de la cuenta bancaria), §6.3 (rotación por fila), §6.5 (límite antes de leer el archivo) y §11 (decisiones sobre revelar contraseñas), más el historial. Los cambios a `design.md` se hacen en la primera tarea, antes del código.
- **Depende de:** F03, F04, F06, F09, F10, F12, F16 y F17.

## Objetivo

La constitución (III) pide que las invariantes importantes estén también en la base de datos. La revisión encontró reglas que hoy solo aplica el código: se revisan y después se escribe, en dos pasos sin bloqueo. Con peticiones simultáneas, o editando un registro en vez de crearlo, esas reglas se pueden saltar.

F23 lleva esas reglas a la base de datos, audita los cambios de cuenta bancaria y hace que la rotación de llaves no se trabe con un registro dañado.

## Decisiones del usuario (2026-11-06)

- **Un contrato de un prestador inactivo no puede volver a quedar vigente.** Para reabrirlo, primero se reactiva al prestador.
- **Un pago de honorarios exige al menos un día con monto mayor que cero.** Un día en cero equivale a no llenarlo, pero una semana entera en $0 no se puede registrar.
- **Revelar contraseñas:** sin pantalla que muestre quién reveló cada una (sigue en §11, "Visor de `audit_logs`") y sin tope de revelaciones. Cada revelación sigue auditada y se consulta con SQL.

## Decisiones técnicas (de quien escribe la spec)

- La auditoría de la cuenta bancaria guarda el número completo antes y después. Ese número ya está en la base sin cifrar, y sirve para rastrear un cambio fraudulento.
- Los triggers de contratos bloquean la fila del prestador (`FOR SHARE`). Así una desactivación y un alta de contrato simultáneas no pasan las dos.

## Historias

- **HU1.** Como responsable de la empresa, quiero que no exista un contrato vigente de un prestador inactivo o borrado, aunque dos personas trabajen a la vez.
- **HU2.** Como responsable de la empresa, quiero saber quién cambió la cuenta bancaria de un prestador, y cuál era la anterior.
- **HU3.** Como quien rota la llave de credenciales, quiero que un registro dañado no detenga la rotación y saber cuál es.
- **HU4.** Como quien registra pagos, quiero que una semana sin montos no quede marcada como pagada.

## Criterios de aceptación

**Prestadores y contratos**

- **CA-1.** Marcar como borrado un prestador con contratos no borrados lo rechaza la base de datos con `422 PROVIDER_HAS_CONTRACTS`. El servicio puede dejar de comprobarlo antes.
- **CA-2.** La base rechaza con `422 PROVIDER_INACTIVE` (el código de F09) un contrato vigente o futuro de un prestador inactivo o borrado. La regla aplica tanto al insertar como al actualizar `start_date`, `end_date` o `deleted_at`. "Vigente o futuro" se define igual que en F09.
- **CA-3.** Los triggers de CA-1 y CA-2 y los de F09 bloquean la fila contraria antes de comprobar. Prueba de concurrencia: desactivar un prestador y crearle un contrato al mismo tiempo deja un resultado válido, porque una de las dos operaciones falla.
- **CA-4.** `ServiceProvidersService.get(id)` consulta un solo prestador por id, sin listar todos.

**Auditoría de la cuenta bancaria**

- **CA-5.** Si al editar un prestador cambia `bank_id`, `account_type_id` o `account_number`, se registra `provider.bank_account_update` en la misma transacción. El registro lleva los tres valores antes y después. Si no cambian, no se registra. La prueba cubre ambos casos.

**Pagos**

- **CA-6.** Crear o editar un pago de honorarios con todos los días en cero responde `422 FEE_PAYMENT_EMPTY`, un código nuevo con su mensaje en español. Lo aplica el servicio, igual que `FEE_PAYMENT_WITHOUT_DAYS` para un pago sin días, y la base de datos también lo impide. (2026-11-07, al implementar: se volvió a la redacción original. La regla vive junto a `FEE_PAYMENT_WITHOUT_DAYS` en `fee-payment-rules.ts`, no en un `refine` de shared, así la API responde con el código propio.)
- **CA-7.** Los triggers de pagos de honorarios y de pagos fijos que leen el contrato exigen `deleted_at IS NULL`. Un pago no puede quedar asociado a un contrato borrado en paralelo.

**Credenciales**

- **CA-8.** Crear o editar una credencial con un responsable borrado responde lo mismo que hoy responde con un responsable de otra organización, que rechaza la FK compuesta. Lo impide un trigger sobre `entity_credentials`, y la lista deja de mostrar el nombre de un responsable borrado.
- **CA-9.** `pnpm credentials:rotate` atrapa el error de cada fila: informa su `id`, sigue con las demás y, si alguna falló, termina con código distinto de 0 y la lista de ids. El runbook 04 explica qué hacer con esas filas. La prueba ya no borra el registro dañado para que la rotación avance.

**Documentos del contrato**

- **CA-10.** El límite de 20 subidas por hora y la comprobación del contrato corren **antes** de leer el archivo. Pasado el límite, o con un contrato inexistente o de otra organización, la API responde `429` o `404` sin cargar el archivo en memoria.
- **CA-11.** Un runbook nuevo, `docs/runbooks/07-archivos-huerfanos.md`, incluye la consulta que lista los objetos huérfanos: los de `storage.objects` del bucket `contract-documents` cuyo `name` no aparece en `anderp.contract_documents.storage_key`. Los objetos no se borran (decisión de F17).

**Entrega**

- **CA-12.** Un solo PR. Antes de crear los triggers, la migración comprueba que no haya filas que los violen y aborta con un mensaje si las hay, como hizo `0030`.

## Fuera de alcance

- Visor de `audit_logs` y tope de revelaciones de contraseñas (decisión del usuario).
- Borrar objetos huérfanos del bucket.
- Contar los objetos huérfanos en el límite de subidas.
