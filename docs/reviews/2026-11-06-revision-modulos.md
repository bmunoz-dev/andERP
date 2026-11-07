# Revisión de huecos por módulo (2026-11-06)

> **Estado (2026-11-07):** los hallazgos se cubren en F21 (sesión y acceso), F22 (despliegue y operación), F23 (reglas de datos en la base) y F24 (robustez y documentación); ver `docs/sdd/roadmap.md`. Riesgos aceptados por el usuario: la web se publica sin esperar a la API, el aviso "cuenta bloqueada", los pagos fijos duplicados y revelar contraseñas sin visor ni tope. Los backups siguen aplazados.

Revisión de un desarrollador senior sobre el estado del código en `main` (commit `581e893`). Compara el código con la constitución, el diseño y la spec de cada feature, y busca lo que falta o puede fallar: seguridad, integridad de datos, criterios de aceptación sin cumplir, pruebas que faltan y operación.

## Cómo se hizo

Cinco revisiones en paralelo, solo de lectura: identidad y multi-organización, datos maestros y credenciales, dinero y avisos, web, e infraestructura. No se corrieron pruebas ni la aplicación. Cada hallazgo lleva evidencia (`ruta:línea`) y una de estas marcas:

- **Verificado:** se vio en el código.
- **Verificado a mano:** además lo comprobó el revisor principal antes de escribir este informe (todos los de severidad alta y los medios de seguridad).
- **Sospecha:** inferido; hay que confirmarlo antes de actuar.

Las severidades son: **Alta** (puede exponer datos, romper producción o perder dinero), **Media** (rompe una regla del proyecto o falla en un caso realista) y **Baja** (mejora o caso raro).

## Resumen

El proyecto está en buen estado. El dinero, el aislamiento entre organizaciones y el cifrado de credenciales están bien resueltos y con pruebas, y no apareció ninguna fuga directa de datos entre organizaciones en la API. Los huecos importantes se concentran en tres lugares:

1. **El despliegue**, que deja salir la web sin control y no exige SSL hacia la base.
2. **La sesión en la web**, que no limpia la caché al cerrar sesión.
3. **Reglas que solo valida el código y no la base de datos**, con condiciones de carrera: bloqueo por intentos fallidos, último administrador y borrado de prestadores.

Lo más urgente, en orden:

| # | Hallazgo | Severidad | Esfuerzo |
|---|---|---|---|
| 1 | La web se publica sin esperar al CI, la aprobación ni las migraciones | Alta | Medio |
| 2 | Cerrar sesión no vacía la caché de la web | Alta | Muy bajo |
| 3 | Nada exige SSL en la conexión a la base | Alta (condicionada) | Muy bajo |
| 4 | El bloqueo por intentos fallidos se salta con peticiones en paralelo | Media | Bajo |
| 5 | Desactivar a alguien en una organización lo expulsa de todas | Media | Bajo |
| 6 | Un error 500 de la base podría dejar datos sensibles en el log | Media | Bajo |
| 7 | Los cambios de cuenta bancaria de un prestador no se auditan | Media | Bajo |
| 8 | Sin timeouts SMTP, un correo lento retiene una transacción abierta | Media | Muy bajo |

## API: identidad, organizaciones y transversales

### auth

- **Media: el bloqueo por fuerza bruta se puede saltar con peticiones en paralelo.** Verificado a mano. El contador de intentos fallidos se calcula en JavaScript y se guarda como valor absoluto. Diez intentos simultáneos leen el mismo valor y escriben "uno más", así que el límite de 5 de F01 CA-3 no se cumple. El throttle es por IP, de modo que varias IP lo multiplican. Evidencia: `apps/api/src/modules/auth/application/login.use-case.ts:47` y `apps/api/src/modules/auth/infrastructure/drizzle-auth.repositories.ts:88`. Recomendación: incrementar en SQL (`failed_login_attempts = failed_login_attempts + 1 ... returning`), decidir el bloqueo con el valor devuelto y añadir una prueba con logins en paralelo.
- **Baja: cambiar la contraseña no tiene throttle.** Verificado. Con un access token robado se puede probar la contraseña actual sin límite. Evidencia: `apps/api/src/modules/auth/http/auth.controller.ts` (`password/change`). Recomendación: `@UseGuards(ThrottlerGuard)`.
- **Baja: "Olvidé mi contraseña" podría permitir enumerar usuarios por el tiempo de respuesta.** Sospecha. Si el email existe se hacen tres escrituras antes de responder; si no, se responde de inmediato. Evidencia: `apps/api/src/modules/auth/application/password.use-cases.ts:79-83`. Recomendación: responder antes de esas escrituras, como ya se hace con el correo.
- **Baja: la respuesta 423 de cuenta bloqueada confirma que la cuenta existe, y cualquiera puede bloquear la cuenta de otro.** Verificado. Lo dicta la spec. Recomendación: dejarlo escrito en la spec como riesgo aceptado.

### organizations

- **Media: desactivar a alguien en una organización lo saca de todas.** Verificado a mano. Desactivar un miembro o suspender una organización llama a `revokeAllForUser`, que no filtra por organización. Un usuario que trabaja para varios clientes queda expulsado de todos, lo que anula en la práctica F20 CA-6. Además, si la revocación falla después de confirmar, la API responde 500 aunque el cambio quedó hecho. Evidencia: `apps/api/src/modules/organizations/members.service.ts:144` y `apps/api/src/modules/organizations/organizations.service.ts:164`. Recomendación: revocar solo las sesiones de esa organización (el guard ya corta el acceso en cada petición) y registrar el error en vez de devolver 500.
- **Media: la regla "último administrador" tiene una carrera y no tiene prueba.** Verificado a mano. El conteo se hace fuera de la transacción: si dos personas se desactivan entre sí al mismo tiempo, la organización queda sin nadie activo. También cuenta invitados que nunca activaron su cuenta, así que alguien que no puede entrar puede quedar como único activo. No hay ninguna prueba de `LAST_ADMIN`, lo que incumple la constitución III. Evidencia: `apps/api/src/modules/organizations/members.service.ts:115-125`. Recomendación: contar dentro de la transacción con un bloqueo sobre la organización, excluir a quienes no tienen contraseña y añadir la prueba.
- **Media: al invitar un email que ya existe, un admin ve datos de ese usuario en otras organizaciones.** Verificado. La respuesta trae el nombre guardado, si tiene contraseña y el `lastLoginAt` global, que delata su actividad con otros clientes. Además, por F02 CA-20, cualquier admin puede reemplazar la invitación pendiente de otra organización. Evidencia: `apps/api/src/modules/organizations/members.service.ts:40-56` y `apps/api/src/modules/organizations/member-onboarding.ts:50-85`. Recomendación: no devolver `lastLoginAt` global y revisar CA-20 ahora que hay varios clientes.
- **Baja: el registro de auditoría `member.invitation_replaced` sale sin IP ni user agent.** Verificado. Se inserta directo en `audit_logs` en vez de pasar por `AuditService`, lo que incumple F01 CA-17. Evidencia: `apps/api/src/modules/organizations/member-onboarding.ts:75`.

### Transversales

- **Media: un error 500 de la base podría escribir datos sensibles en el log.** El código está verificado a mano; el impacto es sospecha. El filtro de errores registra la excepción completa. Drizzle incluye los parámetros de la consulta en el mensaje del error, y la redacción de pino no alcanza ese texto. Un fallo inesperado al guardar una contraseña o una credencial dejaría en el log hashes o texto cifrado, contra la constitución VII. Evidencia: `apps/api/src/shared/errors/problem-details.filter.ts:42`; la prueba de `apps/api/test/foundation.test.ts:94` solo usa un `Error('boom')`. Recomendación: un serializador que, ante un error de Drizzle, registre solo el código y la restricción del driver, y una prueba con un error real.
- **Baja: las tablas `sessions` y `password_resets` crecen sin límite.** Verificado. Cada refresh inserta una fila y nadie borra las vencidas. No es urgente; conviene anotarlo en `design.md` o programar una limpieza.

## API: datos maestros y credenciales

### service-providers

- **Media: la base de datos no impide borrar un prestador que tiene contratos.** Verificado a mano. F03 CA-5 solo se cumple en el código, en dos pasos sin transacción: primero mira si hay contratos y después borra. El trigger de F09 tampoco mira `deleted_at`, así que la base acepta un contrato nuevo para un prestador borrado. Esto va contra la constitución III. Evidencia: `apps/api/src/modules/service-providers/service-providers.service.ts:231-243` y `apps/api/drizzle/0018_provider_deactivation_guards.sql:23-27`. Recomendación: un trigger que rechace el borrado lógico con contratos y que la inserción exija `deleted_at IS NULL`.
- **Media: se puede reabrir un contrato de un prestador inactivo.** Verificado. El trigger que lo impide solo corre al insertar. Un `PATCH` que quite la fecha de fin deja un prestador inactivo con un contrato vigente, que es justo lo que F09 CA-3 protege. Evidencia: `apps/api/drizzle/0018_provider_deactivation_guards.sql:17` y `contracts.service.ts:143-170`. Recomendación: definir la regla en la spec y extender el trigger a `UPDATE`.
- **Media: los cambios de cuenta bancaria no quedan en la auditoría.** Verificado a mano. Cambiar la cuenta a la que se paga es el camino típico de fraude, y la constitución X pide auditar lo que toca dinero. Solo queda `updated_by`, sin el valor anterior. Evidencia: `apps/api/src/modules/service-providers/service-providers.service.ts:209-226`. Recomendación: llevarlo primero a la spec y luego registrar `provider.update` con antes y después.
- **Baja: `get(id)` lista todos los prestadores para devolver uno.** Verificado. El costo crece con el número de prestadores. Evidencia: `service-providers.service.ts:150-154`.
- **Baja: los triggers de F09 se pueden saltar con peticiones simultáneas.** Sospecha. Cada trigger consulta la otra tabla sin bloquear filas. Evidencia: `0018_provider_deactivation_guards.sql:23,43`.

### credentials y responsible-persons

- **Media: una credencial puede apuntar a un responsable borrado.** Verificado. Al crear o editar no se revisa que el responsable siga vigente, la FK compuesta acepta filas borradas y la lista sigue mostrando su nombre. Evidencia: `apps/api/src/modules/credentials/credentials.service.ts:113,229-241,60-66`. Recomendación: validar con `OrgScope` que exista y esté vigente (422 si no), con prueba.
- **Media (operación): un solo registro dañado detiene toda la rotación de llaves, y el error no dice cuál es.** Verificado. Cada nueva ejecución tropieza con la misma fila, así que el paso de retirar la llave vieja queda bloqueado. El runbook 04 lo admite. Evidencia: `apps/api/src/modules/credentials/rotate-keys.ts:28-47` y `apps/api/test/credentials.test.ts:241-242`. Recomendación: atrapar el error por fila, informar el `id` y seguir.
- **Baja: no hay forma de ver quién reveló una contraseña sin entrar a la base.** Sospecha. HU4 lo pide; el evento se registra (`credentials.service.ts:201`), pero ninguna pantalla lo muestra. Recomendación: confirmar si es una decisión tomada y anotarla en `design.md`.
- **Baja: "revelar contraseña" no tiene límite de frecuencia.** Sospecha. Un miembro puede revelar todas seguidas; queda auditado, pero nada lo frena. La spec no lo pide; es una decisión pendiente.

### contract-documents

- **Baja: el archivo entero (hasta 10 MB) se carga en memoria antes de revisar el contrato y el límite por hora.** Verificado. Evidencia: `apps/api/src/modules/contract-documents/contract-documents.module.ts:35-37` y `contract-documents.service.ts:57-58`. Con la memoria de Render Free puede pesar.
- **Baja (operación): no hay forma de encontrar archivos huérfanos en el bucket.** Verificado. Si la transacción falla, el objeto queda subido (aceptado en CA-7) y no cuenta en el límite de 20 por hora, que además es por organización. Evidencia: `contract-documents.service.ts:76-78,184-197`. Recomendación: una consulta en el runbook que compare el bucket con `contract_documents.storage_key`.

### catalogs

Sin huecos relevantes. La escritura es solo para super admin y las reglas importantes están en la base de datos.

## API: dinero, pagos y avisos

No hay hallazgos de severidad alta. El dinero viaja como texto, se suma en SQL y no se encontró aritmética con `number` ni `Date` para fechas de calendario.

- **Media: sin timeouts SMTP, un correo lento retiene una transacción abierta (mail y organizations).** Verificado a mano. La invitación se envía dentro de la transacción, y el transporte de nodemailer no fija `connectionTimeout`, `greetingTimeout` ni `socketTimeout`, cuyos valores por defecto llegan a minutos. Un SMTP lento deja la transacción y la conexión del pool abiertas. Evidencia: `apps/api/src/modules/mail/mailer.ts:26-31` y `apps/api/src/modules/organizations/member-onboarding.ts:121-146`. Recomendación: fijar los tres timeouts en unos 10 segundos; son tres líneas.
- **Media-baja: un `categoryId` mal formado en el libro de egresos devuelve 500.** Verificado a mano. El parámetro no se valida como UUID, a diferencia del resto de la API. Evidencia: `apps/api/src/modules/expenses/expenses.module.ts:85`. Recomendación: `ParseUUIDPipe` opcional con 422 y una prueba.
- **Baja: varias reglas que la spec dice que aplican "el servicio y un trigger" solo las aplica el trigger** (F16 CA-12 en honorarios; CA-5, CA-6 y CA-14 en pagos fijos). Verificado. El usuario no nota diferencia porque el trigger responde con el mismo código. Evidencia: `apps/api/src/modules/fee-payments/fee-payments.service.ts:147-153` y `apps/api/src/modules/fixed-payments/fixed-payments.service.ts:64-71`. Recomendación: corregir la spec en vez del código.
- **Baja: un pago podría quedar asociado a un contrato borrado al mismo tiempo.** Sospecha, con una ventana de tiempo muy pequeña. Los triggers bloquean el contrato pero no miran `deleted_at`. Evidencia: `apps/api/drizzle/0028_fixed_payment_rules.sql:24-28,52-56` y `0008_fee_payments_rules.sql:12-18`.
- **Baja: los pagos fijos no tienen protección contra duplicados.** Verificado. La web desactiva el botón al guardar; queda el riesgo de un reintento de red o dos pestañas. Recomendación: aceptarlo y dejarlo escrito en `design.md`.
- **Baja (decisión de producto): un pago de honorarios con todos los días en 0 marca la semana como pagada** y el índice único impide registrar otro. Verificado. La spec lo permite (CA-6).
- **Baja: la spec de F04 (CA-1) promete `warnings[]` en la respuesta y nadie lo devuelve.** Verificado. Probablemente sobra desde F10; hay que tacharlo de la spec.

Cuentas aéreas, agenda y notificaciones: sin huecos. Tienen bloqueos por cuenta, pruebas de concurrencia, "hoy" calculado en Bogotá y `@RequiresModule` con pruebas.

## Web

- **Alta: cerrar sesión no vacía la caché de datos.** Verificado a mano. `handleLogout` borra la sesión y navega a `/login`, pero no llama a `queryClient.clear()`. En un equipo compartido, quien entre después en la misma pestaña ve al instante los egresos, pagos y credenciales (sin contraseñas) de la organización anterior. Por los tiempos de caché, durante 30 segundos ni siquiera se vuelven a pedir. La caché solo se limpia cuando la sesión vence o al cambiar de organización. Evidencia: `apps/web/src/components/user-menu.tsx:35-38` frente a `apps/web/src/main.tsx:37`. Recomendación: `queryClient.clear()` o `window.location.assign('/login')` al cerrar sesión, con una prueba.
- **Media: una sesión revocada o una cuenta desactivada dejan al usuario dentro de la app.** Verificado. La web solo vuelve al login con `TOKEN_EXPIRED`. Con `SESSION_REVOKED`, `UNAUTHORIZED` o `ACCOUNT_DISABLED` se queda mostrando datos de la caché y errores sueltos. Evidencia: `apps/web/src/lib/api-client.ts:89-109`. Recomendación: tratar cualquier 401 como sesión vencida y avisar a las demás pestañas con el `BroadcastChannel` que ya existe.
- **Media: si falla la carga de una lista, la tabla dice que no hay datos.** Verificado. `DataTable` no recibe el error. En la Agenda eso muestra "No hay obligaciones en esta vista.", y puede hacer que se pase un vencimiento. Afecta a Agenda, Pagos, Personal, Credenciales, Responsables, Cuentas aéreas, Usuarios, Departamentos y Organizaciones. Evidencia: `apps/web/src/components/data-table.tsx:13-26` y `apps/web/src/routes/_app/agenda.tsx:81`. Recomendación: una prop `error` en `DataTable`.
- **Media: los formularios de prestador y contrato reescriben reglas que viven en `packages/shared`.** Verificado. Si la regla cambia en shared, la web se desincroniza sin avisar, contra la regla de frontend del proyecto. Evidencia: `apps/web/src/components/providers/provider-form-dialog.tsx:19-43` y `contract-form-dialog.tsx:25-41`. Recomendación: derivarlos de los schemas de shared y mover allí las reglas de cuenta completa y de fechas.
- **Baja: faltan algunas invalidaciones de caché.** Verificado. Al renombrar un responsable no se refrescan las credenciales, al renombrar un departamento no se refrescan los egresos, y los contratos editados en Personal no refrescan los solapes del formulario de pago. El efecto es de unos 30 segundos de datos viejos.
- **Baja: el enlace de una credencial se pinta sin revisar el protocolo.** Verificado. Hoy lo protege la validación al guardar (solo http o https), pero un dato importado con `javascript:` quedaría a un clic. Evidencia: `apps/web/src/routes/_app/credenciales.tsx:66-76`.
- **Baja: dos fechas de auditoría se muestran en la hora del navegador y no en la de Bogotá.** Verificado. Son marcas de tiempo, así que el impacto es menor. Evidencia: `configuracion/usuarios.tsx:31` y `plataforma/organizaciones.tsx:36`.
- **Baja: el menú no se actualiza al cambiar los módulos de la propia organización** hasta recargar. Sospecha. La API igual los bloquea.
- **Media: faltan pruebas donde hay más riesgo.** Verificado: cierre de sesión y caché, guard de rutas por sesión y módulo, respuesta a `SESSION_REVOKED`, "contraseña vacía al editar significa no cambiar" y el formulario de prestador, que no tiene ninguna prueba.

## Infraestructura, base de datos y despliegue

- **Alta: la web sale a producción sin pasar por el CI ni por la aprobación.** Verificado a mano. Cloudflare publica la web en cada push a `main` por su cuenta. Si el CI falla, la aprobación tarda o una migración falla, como en el deploy del 2026-11-07, queda una web nueva hablando con una API vieja. Evidencia: `docs/runbooks/02-despliegue-y-reversion.md:13`. Recomendación: desactivar el build automático en `main` y publicar con `wrangler deploy` como último paso del job, después de que `/health` confirme la API nueva.
- **Alta (condicionada): nada exige SSL en la conexión a la base.** Verificado a mano que el código y las cadenas de conexión no lo piden. Que las conexiones viajen sin cifrar es sospecha: depende de si Supabase tiene activado "Enforce SSL". Por ahí pasa la contraseña de `postgres` desde el runner de GitHub. Evidencia: `apps/api/src/db/database.module.ts:31-36`, `apps/api/drizzle.config.ts` y `docs/runbooks/01-puesta-en-marcha.md:50-51`. Recomendación: `?sslmode=require` en las cadenas y activar "Enforce SSL" en Supabase.
- **Media: Render puede desplegar un commit cuyas migraciones no han corrido.** Verificado. El deploy hook construye el último commit de `main`, no el del job. Con dos merges seguidos, el job del primero publica el código del segundo. Evidencia: `.github/workflows/deploy.yml:48` y runbook 02, línea 10. Recomendación: pasar el commit al hook, si Render lo admite.
- **Media: dos migraciones ya aplicadas no eran compatibles con la versión anterior.** Verificado. La `0035` pone `NOT NULL` y borra sesiones, y la `0031` borró tablas que la API vieja seguía usando. El runbook lo prohíbe, pero solo lo vigila la revisión humana. Evidencia: `apps/api/drizzle/0035_organization_switcher.sql:2-5` y `0031_drop_clickiu.sql:1`. Recomendación: una casilla de compatibilidad en la plantilla de PR.
- **Media: el CI no construye la API, la web ni la imagen Docker.** Verificado. Un `Dockerfile` roto se descubre en producción, con las migraciones ya aplicadas. Evidencia: `.github/workflows/ci.yml:31-40`. Recomendación: `pnpm build` y `docker build` en el CI.
- **Media: cuando una migración falla, el log no dice por qué.** Verificado: el deploy del 2026-11-07 falló porque Supabase estaba pausado, y solo se vio `exit 1`. Recomendación: un script corto con el migrador de `drizzle-orm`, el mismo de `apps/api/test/setup/global-setup.ts`, que imprima el error, con un `select 1` previo para distinguir "base caída" de "SQL inválido".
- **Media: nadie se entera si la base o la API se caen.** Verificado. No hay monitoreo; la spec de F07 lo dejó fuera. Recomendación: un workflow programado cada 2 o 3 días que llame a `/api/v1/health` y avise por correo si falla. Sospecha: también evitaría la pausa por inactividad, si Supabase cuenta esa actividad.
- **Media: las pruebas e2e nunca se han ejecutado y no corren en el CI.** Verificado: `roadmap.md`, pendiente T013.
- **Baja: el CI migra como superusuario y producción no.** Sospecha. Una migración podría pasar el CI y fallar en Supabase, donde `postgres` no es superusuario. Tampoco está probado que el pipeline se detenga ante una migración rota (T012 pendiente).
- **Baja: `app_runtime` puede hacer `DELETE` en todas las tablas**, aunque solo dos lo necesitan (`fee_payment_days` y `organization_members`). Verificado. Evidencia: `apps/api/drizzle/0000_base.sql:21`. Recomendación: darlo solo a esas dos (constitución XII).
- **Baja: nada detecta que el esquema Drizzle y las migraciones se separen.** Verificado: no hay `drizzle-kit check` en el CI.
- **Baja: las migraciones no fijan `lock_timeout`**, las acciones de GitHub y la imagen `node:24-slim` no están fijadas a una versión exacta, y el `curl` de espera no tiene `--max-time`. Verificado.
- **Baja: el seed acepta la contraseña de ejemplo de `.env.example`**, porque cumple el mínimo de longitud. Verificado. Recomendación: rechazarla cuando el host no sea `localhost`.
- **Baja: la documentación de backups no coincide con la realidad.** Verificado a mano. El runbook 01 (línea 28) exige un plan de pago y el runbook 03 describe backups diarios, pero producción sigue en Supabase Free sin backups (`roadmap.md:74`). Además, F07 figura como "Hecho" con tareas pendientes. Recomendación: añadir una nota en los runbooks 01 y 03 que remita a la decisión del roadmap.

## Riesgos ya aceptados

No se vuelven a proponer como trabajo, pero se recuerdan porque cambian de peso con el primer cliente real:

- **Supabase Free:** sin backups y con pausa tras una semana sin uso (decisiones del 2026-10-10, 2026-10-17 y 2026-10-22 en `roadmap.md`). La pausa ya rompió un despliegue.
- **Render Free:** la API se duerme y tarda unos 50 segundos en despertar.

## Lo que está sólido

- **Aislamiento entre organizaciones:** guard global que valida en la base, en cada petición, la sesión, la membresía, la organización activa y los módulos. `OrgScope` en todos los servicios, FK compuestas y una prueba de aislamiento por módulo.
- **Sesiones y tokens:** el access token vive en memoria y el refresh en una cookie `HttpOnly` y `SameSite=Strict`. El refresh rota de forma atómica y revoca la familia si se reutiliza. Los tokens se guardan como hash, el JWT está fijado a HS256, el reset de contraseña se usa una sola vez y la web cierra las redirecciones abiertas.
- **Credenciales:** AES-256-GCM con IV aleatorio, AAD por organización y registro, versión de llave por fila y validación de llaves al arrancar. La contraseña revelada no pasa por la caché de la web, se oculta a los 30 segundos y queda auditada.
- **Dinero:** `numeric(14,2)` de punta a punta, sumas en SQL, saldos de cuentas aéreas protegidos por trigger con bloqueo, e índices únicos contra pagos de honorarios duplicados, con pruebas de concurrencia.
- **Base de datos:** roles separados para migraciones y para la API, `audit_logs` de solo inserción y pruebas que exigen `search_path = ''` en toda función. Las pruebas corren contra un Postgres real con el mismo bootstrap de producción.
- **Auditoría:** se escribe en la misma transacción que el cambio (F12).

## Siguientes pasos sugeridos

1. **Arreglos rápidos (menos de un día en total):** limpiar la caché al cerrar sesión, `sslmode=require` más "Enforce SSL", timeouts SMTP, incremento atómico del contador de bloqueo, revocar solo las sesiones de la organización, `ParseUUIDPipe` en el libro y throttle en el cambio de contraseña.
2. **Despliegue:** publicar la web desde el job tras confirmar la API, `pnpm build` y `docker build` en el CI, un migrador que muestre el error y el health check programado.
3. **Reglas en la base de datos (constitución III):** borrado de prestadores con contratos, reapertura de contratos de prestadores inactivos, `LAST_ADMIN` con bloqueo y prueba, y credenciales hacia responsables vigentes.
4. **Antes del primer cliente real:** auditoría de cambios bancarios (pasa primero por la spec), serializador de errores de Drizzle, errores visibles en las tablas, pruebas de sesión en la web y la decisión sobre backups.
5. **Documentación:** alinear las specs donde el código ya decidió (F04 `warnings[]`, "servicio y trigger" en F16) y los runbooks de backups.
