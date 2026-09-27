# F07 — Despliegue y endurecimiento · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §6, §10

## Objetivo

Poner AndERP en producción de forma segura y repetible: base de datos en Supabase, API en Render, web en Cloudflare Pages, despliegue automatizado y runbooks de operación.

## Historias

- **HU1.** Como dueño, quiero que cada merge a `main` despliegue AndERP de forma automática y segura.
- **HU2.** Como dueño, quiero que la base de datos de producción no quede expuesta por la API pública de Supabase.
- **HU3.** Como dueño, quiero instrucciones claras para restaurar un backup, rotar llaves y desplegar o revertir.

## Criterios de aceptación

**Base de datos (Supabase)**
- **CA-1.** El proyecto de Supabase está en la región de São Paulo (`sa-east-1`), la más cercana a Colombia, y usa la misma versión mayor de Postgres que Docker local y CI.
- **CA-2.** Las tablas de AndERP viven en el esquema **`anderp`**, que la Data API (PostgREST) de Supabase no expone. La Data API está **desactivada** en la configuración del proyecto. Los roles `anon` y `authenticated` no tienen privilegios sobre `anderp`, y una prueba manual con la llave `anon` no obtiene datos.
- **CA-3.** El rol `app_runtime` existe con una contraseña robusta, solo tiene los privilegios de las migraciones y no puede escribir en `audit_logs` más allá del `INSERT`.
- **CA-4.** La API se conecta por **Supavisor en modo sesión** (IPv4) con un pool pequeño y límites de tiempo configurados.
- **CA-5.** El plan de Supabase de producción incluye **backups diarios** y no pausa el proyecto por inactividad. El plan gratuito **no se usa en producción**, por eso mismo.

**API (Render)**
- **CA-6.** Hay una imagen Docker multi-etapa que corre como usuario no root y contiene solo las dependencias de producción. Tiene un health check sobre `/api/v1/health`.
- **CA-7.** El servicio de Render usa una instancia de pago que no se duerme, `NODE_ENV=production`, los secretos como variables de entorno y Swagger desactivado.
- **CA-8.** La API solo acepta tráfico que venga del proxy de la web: toda petición sin la cabecera `X-Proxy-Secret` válida responde `403`, salvo `/health`. La IP del cliente se toma de `X-Client-IP`, que solo escribe el proxy, y la usan el throttler y la auditoría.
- **CA-9.** La API envía las cabeceras de seguridad de `helmet`.

**Web (Cloudflare Pages)**
- **CA-10.** La web se publica desde `main`. Una **Pages Function** en `/api/*` reenvía a la API:
  - método, cuerpo, `Authorization`, `Cookie` y `Content-Type`;
  - agrega `X-Proxy-Secret` y `X-Client-IP` (tomada de `CF-Connecting-IP`);
  - devuelve la respuesta tal cual, incluido `Set-Cookie`.
- **CA-11.** El archivo `_headers` define:
  - CSP: `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  - `Strict-Transport-Security`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `X-Content-Type-Options: nosniff`;
  - `Permissions-Policy` restrictiva.
- **CA-12.** El refresh con cookie funciona en producción: iniciar sesión, recargar la página y conservar la sesión.

**Pipeline**
- **CA-13.** `deploy.yml` se ejecuta en cada push a `main`:
  1. CI completo;
  2. aprobación manual (environment `production` de GitHub);
  3. `db:migrate` contra producción;
  4. deploy hook de Render;
  5. espera a que `/api/v1/health` responda `200`.

  Cloudflare Pages construye la web por su cuenta desde git.
- **CA-14.** Una migración que falla detiene el pipeline **antes** de desplegar la API.

**E2E y operación**
- **CA-15.** Una suite de Playwright ejecuta los flujos de humo (login → nuevo egreso → verlo en la matriz → nuevo pago de honorarios → verlo en Honorarios → revelar una credencial → logout) en local y contra staging cuando exista.
- **CA-16.** `docs/runbooks/` contiene:
  - puesta en marcha inicial;
  - despliegue y reversión;
  - restauración de un backup;
  - rotación de `CREDENTIALS_KEYS`;
  - rotación de `JWT_SECRET` y `X-Proxy-Secret`;
  - alta de una nueva organización.

## Fuera de alcance

Dominio propio (opcional; los runbooks explican cómo agregarlo), monitoreo externo de uptime y alertas, y entorno de staging permanente.
