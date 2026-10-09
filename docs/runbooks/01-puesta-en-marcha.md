# Runbook 01 — Puesta en marcha de producción

Se hace **una sola vez**. Al terminar, cada merge a `main` despliega solo (runbook 02).

```
Navegador ─► Cloudflare Pages (web + /api/* proxy) ─► Render (API, Docker) ─► Supabase (Postgres, sa-east-1)
```

> Los nombres de menús de Supabase, Render y Cloudflare cambian con el tiempo. Si algo no coincide, busca la opción equivalente y corrige este documento.

## 0. Generar los secretos

En una terminal local (no los pegues en chats ni en tickets; guárdalos en un gestor de contraseñas):

```bash
openssl rand -base64 32   # APP_RUNTIME_PASSWORD (contraseña del rol app_runtime)
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # PROXY_SECRET
openssl rand -base64 32   # llave 1 de CREDENTIALS_KEYS
```

## 1. Supabase (F07-T006, T007)

1. Crea el proyecto:
   - región **South America (São Paulo) — `sa-east-1`**;
   - plan **de pago** (backups diarios y sin pausa por inactividad; el gratuito no sirve para producción);
   - Postgres **17**, la misma versión mayor que en local y en CI.
   Anota el precio en la sección "Costos" al final.
2. **Desactiva la Data API**: *Project Settings → Data API* → desactivar. AndERP no la usa; así nada queda expuesto por PostgREST.
3. Crea el rol de la API. En el *SQL Editor* no hay variables de psql, así que reemplaza la contraseña a mano en una copia de [`db/bootstrap.sql`](../../db/bootstrap.sql), ejecútala y **no guardes la consulta** en Supabase. Alternativa con psql (cadena "Direct" o "Session pooler" del usuario `postgres`):

   ```bash
   psql "<cadena del usuario postgres>" -v app_runtime_password='<APP_RUNTIME_PASSWORD>' -f db/bootstrap.sql
   ```

4. Cadenas de conexión (*Connect → Session pooler*, puerto **5432**, IPv4):
   - **Migraciones** (dueño del esquema): `postgres://postgres.<project-ref>:<contraseña de postgres>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
   - **API** (`app_runtime`): `postgres://app_runtime.<project-ref>:<APP_RUNTIME_PASSWORD>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`

   Si Supavisor rechaza `app_runtime`, contrata el complemento IPv4 y usa la conexión directa (`db.<project-ref>.supabase.co:5432`) con el usuario `app_runtime`.
5. Primera migración y datos iniciales, desde tu equipo (PowerShell; en bash usa `export`):

   ```powershell
   $env:DATABASE_URL_MIGRATIONS = '<cadena de migraciones>'
   pnpm db:migrate
   $env:DATABASE_URL = '<cadena de la API>'
   $env:SEED_ORG_NAME = '<empresa>'; $env:SEED_ORG_TAX_ID = '<NIT>'
   $env:SEED_SUPERADMIN_EMAIL = '<tu correo>'; $env:SEED_SUPERADMIN_PASSWORD = '<contraseña robusta>'
   $env:SEED_SUPERADMIN_FIRST_NAME = '<nombre>'; $env:SEED_SUPERADMIN_LAST_NAME = '<apellido>'
   pnpm db:seed
   ```

   Si `apps/api/.env` existe, el seed lo carga; las variables de la sesión tienen prioridad.
6. Comprobaciones (CA-2, CA-3), en el SQL Editor:

   ```sql
   -- anon y authenticated sin privilegios sobre anderp: ambas deben dar false.
   select has_schema_privilege('anon', 'anderp', 'usage'),
          has_schema_privilege('authenticated', 'anderp', 'usage');
   -- app_runtime solo inserta en audit_logs: update y delete deben dar false.
   select has_table_privilege('app_runtime', 'anderp.audit_logs', 'update'),
          has_table_privilege('app_runtime', 'anderp.audit_logs', 'delete');
   ```

   Y con la llave `anon` (*Project Settings → API Keys*) contra la Data API desactivada:

   ```bash
   curl -s "https://<project-ref>.supabase.co/rest/v1/users" -H "apikey: <anon>"   # no debe devolver datos
   ```

## 2. Render (F07-T008)

1. *New → Web Service* desde el repo `bmunoz-dev/andERP`, rama `main`:
   - **Runtime:** Docker; **Dockerfile path:** `apps/api/Dockerfile`; **Docker context:** `.` (raíz).
   - **Región:** la de EE. UU. más cercana disponible (Render no tiene São Paulo; Virginia suele dar la menor latencia hacia `sa-east-1`).
   - **Plan:** de pago (no se duerme).
   - **Health check path:** `/api/v1/health`.
   - **Auto-Deploy: desactivado.** Despliega el pipeline después de migrar (runbook 02).
2. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `API_PORT` | `10000` (el puerto que Render espera) |
   | `LOG_LEVEL` | `info` |
   | `DATABASE_URL` | cadena de la API (`app_runtime`) |
   | `JWT_SECRET` | del paso 0 |
   | `PROXY_SECRET` | del paso 0 |
   | `CREDENTIALS_KEYS` | `{"1":"<llave 1>"}` |
   | `CREDENTIALS_ACTIVE_KEY_VERSION` | `1` |
   | `WEB_URL` | URL de Cloudflare Pages (paso 3), p. ej. `https://anderp.pages.dev` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | del proveedor de correo (paso 4) |

3. *Settings → Deploy Hook*: copia la URL (es un secreto).
4. Comprueba: `https://<servicio>.onrender.com/api/v1/health` → `{"status":"ok","db":"ok","version":"<commit>"}`, y cualquier otra ruta sin `X-Proxy-Secret` → `403`.

## 3. Cloudflare Pages (F07-T009)

Requisito: la API de Render ya responde (paso 2). Sin ella la web carga, pero no puede iniciar sesión.

1. *Workers & Pages → Create → Pages → Connect to Git*: autoriza la app de Cloudflare en GitHub **solo** para el repo `bmunoz-dev/andERP` y elígelo. Rama de producción: `main`.
2. Configuración de build:
   - **Framework preset:** `None`;
   - **Root directory (advanced):** `apps/web`. Ahí están `functions/` (el proxy `/api/*`) y `public/_headers`;
   - **Build command** (el lockfile de pnpm está en la raíz del monorepo, por eso se instala desde allí):

     ```bash
     cd ../.. && npx -y pnpm@11.22.0 install --frozen-lockfile && npx -y pnpm@11.22.0 --filter @anderp/shared build && npx -y pnpm@11.22.0 --filter @anderp/web build
     ```

   - **Build output directory:** `dist`;
   - **Environment variables (build):** `NODE_VERSION=24` y `SKIP_DEPENDENCY_INSTALL=1` (la instalación la hace el comando de build).
3. *Save and Deploy*. El primer build tarda unos minutos; si falla, el log está en *Deployments → (el despliegue) → View details*.
4. Variables de la Function: *Settings → Variables and Secrets*, entorno **Production**:
   - `API_ORIGIN` = `https://<servicio>.onrender.com` (texto, sin barra final);
   - `PROXY_SECRET` = el mismo de Render (tipo **Secret**).

   Las variables se aplican en el **siguiente** despliegue: *Deployments → último → Retry deployment*.
5. Actualiza `WEB_URL` en Render con la URL final de Pages (p. ej. `https://anderp.pages.dev`); los enlaces de los correos usan esa URL.
6. Comprueba:
   - `https://<proyecto>.pages.dev/api/v1/health` responde `{"status":"ok",...}` (pasa por el proxy);
   - iniciar sesión, recargar la página y seguir con sesión (CA-12);
   - en <https://securityheaders.com> aparecen CSP, HSTS y el resto de cabeceras (CA-11).

**Despliegues de vista previa.** Cada rama y PR genera una URL de vista previa. Si no le cargas variables al entorno *Preview*, esas vistas no llegan a la API; es lo esperado.

**Dominio propio (opcional):** en Pages, *Custom domains → Set up a domain*; después cambia `WEB_URL` en Render y el remitente del correo.

## 4. Correo (F07-T010)

1. Cuenta en un proveedor SMTP transaccional (Resend, Brevo u otro) con un dominio verificado (SPF y DKIM), o el subdominio de prueba que ofrezca mientras no haya dominio propio.
2. Carga `SMTP_*` y `MAIL_FROM` en Render.
3. Prueba: en la web, "¿Olvidaste tu contraseña?" con tu correo; debe llegar el enlace y funcionar.

## 5. GitHub (pipeline)

1. *Settings → Environments → New environment* `production`:
   - **Required reviewers:** `bmunoz-dev`;
   - secretos: `DATABASE_URL_MIGRATIONS` (cadena de migraciones) y `RENDER_DEPLOY_HOOK_URL`.
2. *Settings → Secrets and variables → Actions → Variables* (de repositorio): `API_HEALTH_URL=https://<servicio>.onrender.com/api/v1/health`. Mientras no exista, el pipeline solo corre el CI.
3. Primer despliegue: haz un merge a `main` y aprueba el job "Migrar y desplegar" (runbook 02).

## 6. Verificación del hito M4 (F07-T016)

- Flujo de humo completo en producción (`E2E_EMAIL`, `E2E_PASSWORD` y `BASE_URL` apuntando a Pages, con una organización de prueba): `pnpm test:e2e`.
- Sesión que se conserva al recargar, cabeceras en securityheaders.com y llave `anon` sin acceso.

## Costos

Anota aquí los planes y precios al contratar:

| Servicio | Plan | Precio mensual | Fecha |
|---|---|---|---|
| Supabase | | | |
| Render | | | |
| Cloudflare Pages | Free | 0 | |
| Correo | | | |
