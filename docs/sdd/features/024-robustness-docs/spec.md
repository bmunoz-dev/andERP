# F24 — Robustez y documentación al día · Spec

- **Estado:** Aprobado (2026-11-06)
- **Origen:** [revisión de huecos del 2026-11-06](../../../reviews/2026-11-06-revision-modulos.md) (correo, egresos, web y alineación de specs).
- **Diseño:** `design.md` §5.5 (riesgo aceptado de pagos fijos duplicados), §8 (errores visibles en las tablas, fechas con hora de Bogotá) e historial. Los cambios a `design.md` se hacen en la primera tarea, antes del código.
- **Depende de:** F04, F05, F14, F16 y F19.

## Objetivo

Cerrar los huecos menores de la revisión:

- un servidor de correo lento que retiene la base;
- un parámetro sin validar que responde `500`;
- tablas que dicen "no hay datos" cuando en realidad falló la carga;
- formularios que reescriben reglas de `packages/shared`;
- datos que tardan en refrescarse.

F24 también deja las specs anteriores al día con lo que el código decidió.

## Decisiones del usuario (2026-11-06)

- **Pagos fijos duplicados (riesgo aceptado).** Un mes puede tener varios pagos, así que la base no impide dos iguales. La web desactiva el botón mientras guarda. Un duplicado por reintento de red o por dos pestañas se ve en la lista y se borra. Se documenta en `design.md` §5.5.

## Historias

- **HU1.** Como quien usa la Agenda, quiero que si falla la carga la pantalla me lo diga, en vez de mostrar que no hay vencimientos.
- **HU2.** Como quien mantiene el código, quiero que cada regla de negocio viva en un solo lugar y que las specs describan lo que el código hace.
- **HU3.** Como admin, quiero que una invitación no se quede colgada porque el servidor de correo esté lento.

## Criterios de aceptación

**API**

- **CA-1.** El transporte SMTP fija `connectionTimeout`, `greetingTimeout` y `socketTimeout` en 10 segundos. Un SMTP que no responde hace fallar la invitación en unos 10 segundos con `500`, y la transacción se revierte.
- **CA-2.** `GET /reports/expenses/ledger` valida `categoryId` como UUID opcional: uno mal formado responde `422`, no `500`. Hay prueba.

**Web**

- **CA-3.** `DataTable` recibe el error de la consulta y lo muestra con `errorMessage(error)` en lugar del mensaje de lista vacía. Lo usan Agenda, Pagos, Personal, Credenciales, Responsables, Cuentas aéreas, Usuarios, Departamentos y Organizaciones. Prueba: con un error, la tabla muestra el mensaje de error y no el de lista vacía.
- **CA-4.** Las reglas "cuenta bancaria completa o vacía", el formato del número de cuenta y "fin ≥ inicio" viven en `packages/shared` como helpers (`ACCOUNT_NUMBER_PATTERN`, `isBankAccountComplete` e `isContractEndValid`). Los usan los formularios de prestador y de contrato y la API. Hay prueba del formulario de prestador. (Ajustado el 2026-11-06 al planificar: derivar el schema completo no encaja, porque el formulario usa `''` donde la API usa `null`.)
- **CA-5.** Invalidaciones de caché:
  - editar un responsable invalida `['credentials']`;
  - editar un departamento invalida las consultas de egresos;
  - crear, editar o borrar un contrato en Personal invalida `['contracts', 'overlaps', …]`.
- **CA-6.** El enlace de una credencial se muestra como enlace solo si empieza por `http://` o `https://`; si no, se muestra como texto. El schema de respuesta de shared exige lo mismo.
- **CA-7.** Las marcas de tiempo de Usuarios y Organizaciones se formatean con `timeZone: 'America/Bogota'`.
- **CA-8.** Después de cambiar los paquetes de una organización o de crear una, la web vuelve a pedir el perfil. El menú y el selector se actualizan sin recargar.
- **CA-9.** Prueba del formulario de credencial: dejar la contraseña vacía al editar no la cambia.
- **CA-10.** El comentario de `apps/web/public/_headers` dice "Worker con archivos estáticos", no "Cloudflare Pages".

**Specs al día**

- **CA-11.** Se corrigen las specs donde el código ya decidió otra cosa, con una nota fechada en cada spec:
  - F04 CA-1: se tacha `warnings[]`.
  - F16 CA-12 y CA-5, CA-6 y CA-14 de pagos fijos: dicen "lo aplica un trigger" en lugar de "el servicio y un trigger".
  - F02 CA-20: remite a F21 CA-7.
- **CA-12.** Una nota al principio del informe `docs/reviews/2026-11-06-revision-modulos.md` remite a F21–F24 y a los riesgos aceptados.

**Entrega**

- **CA-13.** Un solo PR, sin migraciones.

## Fuera de alcance

- Idempotencia de los pagos fijos (riesgo aceptado).
- Rediseño de `DataTable` más allá del estado de error.
