# F22 — Despliegue y operación · Spec

- **Estado:** Aprobado (2026-11-06)
- **Origen:** [revisión de huecos del 2026-11-06](../../../reviews/2026-11-06-revision-modulos.md) (infraestructura, base de datos y despliegue).
- **Diseño:** `design.md` §10 (SSL, migrador, health check programado, riesgo aceptado de la publicación de la web, privilegios de `app_runtime`) e historial. Los cambios a `design.md` se hacen en la primera tarea, antes del código.
- **Depende de:** F07 (pipeline y runbooks) y F21 (cambia qué tablas borra la API, CA-8).

## Objetivo

El despliegue del 2026-11-07 falló porque Supabase estaba pausado, y el log solo dijo `exit 1`. La revisión encontró además:

- conexiones a la base que no exigen SSL;
- un CI que no construye lo que se despliega;
- nadie que se entere si producción se cae;
- documentación de backups y de F07 que no coincide con la realidad.

F22 hace el pipeline más seguro y más fácil de diagnosticar, y deja los runbooks al día. No cambia el comportamiento de la aplicación.

## Decisiones del usuario (2026-11-06)

- **La web se sigue publicando como hoy (riesgo aceptado).** Cloudflare la publica en cada push a `main`, sin esperar al CI, a la aprobación ni a las migraciones. Si el deploy de la API falla o tarda en aprobarse, queda una web nueva hablando con una API vieja. Se documenta en `design.md` §10 y en el runbook 02, en el paso de aprobación.
- **Backups:** siguen aplazados (decisiones del 2026-10-10, 2026-10-17 y 2026-10-22). F22 solo corrige la documentación que los describe como si existieran.

## Decisiones técnicas (de quien escribe la spec)

- **SSL en el código:** se exige para todo host que no sea local, sin cambiar los secretos de conexión. Activar "Enforce SSL" en Supabase es un paso del usuario, en el runbook 01.
- **Health check:** un workflow programado de GitHub cada 2 días. GitHub avisa por correo al dueño cuando falla.

## Historias

- **HU1.** Como responsable de la plataforma, quiero que cuando un despliegue falle el log diga por qué.
- **HU2.** Como responsable de la plataforma, quiero enterarme si producción se cae, o si Supabase se pausó, antes de que lo note un usuario.
- **HU3.** Como responsable de la plataforma, quiero que lo que se despliega haya pasado por el CI completo, imagen Docker incluida.
- **HU4.** Como quien opera el sistema, quiero que los runbooks digan lo que de verdad hay en producción.

## Criterios de aceptación

**Base de datos**

- **CA-1.** La API, el migrador y el seed se conectan con TLS obligatorio (`ssl: 'require'`) a todo host que no sea `localhost` ni `127.0.0.1`. Las pruebas con Testcontainers y el `docker compose` local siguen funcionando sin TLS.
- **CA-2.** `pnpm db:migrate` usa un script propio con el migrador de `drizzle-orm`, el mismo que usan las pruebas. El script:
  - Antes de migrar, hace `select 1` con 10 segundos de timeout. Si falla, termina con código distinto de 0 y el mensaje "No se pudo conectar a la base de datos (¿proyecto pausado o caído?)" más el código del error.
  - Fija `lock_timeout = '5s'` en la conexión antes de aplicar las migraciones.
  - Si una migración falla, imprime el mensaje, el código y la restricción del error de Postgres, y termina con código distinto de 0.
  - Nunca imprime la cadena de conexión ni la contraseña.
  - Prueba con Testcontainers: una migración rota a propósito hace que el script termine con código distinto de 0 e imprima el error. Esto cubre F07-T012 sin tocar producción.
- **CA-3.** Las pruebas aplican las migraciones con un rol **sin** superusuario, dueño del esquema `anderp`, como el rol `postgres` en Supabase. Una migración que necesite superusuario falla en el CI y no en producción.
- **CA-4.** El CI falla si el esquema de Drizzle y las migraciones no coinciden: después de `pnpm db:generate` no puede haber archivos nuevos.
- **CA-5.** `app_runtime` tiene `DELETE` solo en las tablas que la API borra físicamente (hoy `fee_payment_days`, más las que deje F21: `sessions` y `password_resets`). `foundation.test.ts` comprueba la lista exacta (constitución XII).
- **CA-6.** El seed se niega a crear el super admin con la contraseña de ejemplo de `apps/api/.env.example` cuando el host no es local.

**CI y despliegue**

- **CA-7.** El CI ejecuta `pnpm build` y construye la imagen de la API (`docker build -f apps/api/Dockerfile .`, sin publicarla).
- **CA-8.** Las acciones de terceros (`pnpm/action-setup`) se fijan al SHA de un commit, con la versión en un comentario. La imagen base de la API se fija a una versión exacta de Node 24 (`node:24.x.y-slim`).
- **CA-9.** El `curl` del paso de espera lleva `--max-time 20`.
- **CA-10.** El deploy hook de Render construye el commit del job. Si Render admite indicar el commit en el hook, se le pasa `GITHUB_SHA`. Si no, el runbook 02 explica que, con dos merges seguidos, el primer job falla en la espera y el segundo despliega lo correcto. Se confirma en la documentación de Render en la primera tarea.
- **CA-11.** Plantilla de PR (`.github/pull_request_template.md`) con la casilla "Las migraciones son compatibles con la versión anterior de la API (o el cambio va en dos despliegues)".
- **CA-12.** Las pruebas e2e (`e2e/`, Playwright) corren en el CI contra la API y la web levantadas en el mismo job, con el Postgres del job. El smoke test pasa en verde. Esto cubre F07-T013.

**Monitoreo**

- **CA-13.** Workflow `health.yml`, programado cada 2 días y ejecutable a mano. Llama a `vars.API_HEALTH_URL` con hasta 3 intentos de 90 segundos, porque Render Free tarda en despertar, y falla si ninguno responde `200`. El fallo llega por correo al dueño del repo.

**Documentación**

- **CA-14.** Runbooks y roadmap al día:
  - Runbooks 01 y 03: una nota al principio dice que producción está en Supabase Free, sin backups, y remite a la decisión del `roadmap.md`. Lo que describen pasa a ser el procedimiento para cuando haya plan de pago.
  - Runbook 01: un paso para activar "Enforce SSL" en Supabase.
  - Runbook 02: el riesgo aceptado de la publicación de la web, el diagnóstico de los mensajes de CA-2 y qué hacer si Supabase está pausado (reactivar y repetir el job con `gh run rerun <id> --failed`).
  - `roadmap.md`: F07 refleja qué quedó cubierto aquí (T012 y T013) y qué sigue pendiente (respaldo, T015 y T016).

**Entrega**

- **CA-15.** Un solo PR, sin migraciones de esquema salvo el cambio de privilegios de CA-5, que se despliega después de F21. Activar "Enforce SSL" en Supabase lo hace el usuario después del despliegue y se verifica con `/health`.

## Fuera de alcance

- Publicar la web desde el job de GitHub (riesgo aceptado).
- Backups de la base y de Storage (aplazados por el usuario).
- Alertas fuera de GitHub (Slack, SMS) y monitoreo de métricas.
- Fijar la imagen base por digest.
