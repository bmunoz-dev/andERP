# Runbook 01 — Puesta en marcha de producción

Se hace **una sola vez**. Al terminar, cada merge a `main` despliega solo (runbook 02).

```
Navegador ─► Cloudflare Worker (web estática + proxy /api/*) ─► Render (API, Docker) ─► Supabase (Postgres, sa-east-1)
```

> Los nombres de menús de Supabase, Render y Cloudflare cambian con el tiempo. Si algo no coincide, busca la opción equivalente y corrige este documento.

## 0. Generar los secretos

En una terminal local (no los pegues en chats ni en tickets; guárdalos en un gestor de contraseñas):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # APP_RUNTIME_PASSWORD
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # PROXY_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # llave 1 de CREDENTIALS_KEYS
```

Las contraseñas de la base de datos van en **hexadecimal** (solo letras y números): van dentro de una URL, y caracteres como `/`, `+`, `=`, `@` o `#` la rompen (`DATABASE_URL: invalid_format`). La contraseña de `postgres` que crea Supabase también: si tiene esos caracteres, cámbiala (*Database Settings → Reset database password*) o codifícalos (`/` → `%2F`, `+` → `%2B`, `=` → `%3D`, `@` → `%40`, `#` → `%23`).

## 1. Supabase (F07-T006, T007)

1. Crea el proyecto:
   - región **South America (São Paulo) — `sa-east-1`**;
   - plan **de pago** (backups diarios y sin pausa por inactividad; el gratuito no sirve para producción);
   - Postgres **17**, la misma versión mayor que en local y en CI.
   Anota el precio en la sección "Costos" al final.
2. **Desactiva la Data API**: *Project Settings → Data API* → desactivar. AndERP no la usa; así nada queda expuesto por PostgREST.
3. Crea el rol de la API en el *SQL Editor* (sin contraseña todavía, así no queda escrita en el historial de consultas):

   ```sql
   do $$ begin
     if not exists (select from pg_roles where rolname = 'app_runtime') then create role app_runtime login; end if;
   end $$;
   alter role app_runtime set search_path = anderp, extensions;
   ```

   Después ponle la contraseña (hexadecimal, paso 0) en una consulta aparte que **no guardes**:

   ```sql
   alter role app_runtime with login password '<APP_RUNTIME_PASSWORD>';
   ```

   Alternativa con psql: `psql "<cadena del usuario postgres>" -v app_runtime_password='<APP_RUNTIME_PASSWORD>' -f db/bootstrap.sql`. En Supabase no se pueden declarar `NOSUPERUSER` y similares (el usuario `postgres` no es superusuario); un rol nuevo ya nace sin esos privilegios.

4. Cadenas de conexión (*Connect → Session pooler*, puerto **5432**, IPv4). Copia el host y el `project-ref` que muestre Supabase (el host puede empezar por `aws-0-` o `aws-1-`); se escriben sin comillas ni corchetes:
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
   | `WEB_URL` | URL del Worker de Cloudflare (paso 3), p. ej. `https://anderp.<subdominio>.workers.dev` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | del proveedor de correo (paso 4). Son obligatorias para arrancar; mientras no haya proveedor: `localhost`, `1025`, `false`, vacío, vacío y `AndERP <no-reply@example.com>` (la app funciona, pero no envía correos) |

3. *Settings → Deploy Hook*: copia la URL (es un secreto).
4. Comprueba: `https://<servicio>.onrender.com/api/v1/health` → `{"status":"ok","db":"ok","version":"<commit>"}`, y cualquier otra ruta sin `X-Proxy-Secret` → `403`.

## 3. Cloudflare Workers (F07-T009)

La web se publica como **Worker con archivos estáticos** ([`apps/web/wrangler.jsonc`](../../apps/web/wrangler.jsonc)): Cloudflare sirve `dist` y el código del Worker ([`apps/web/worker/index.ts`](../../apps/web/worker/index.ts)) solo atiende `/api/*`, reenviando a Render.

Requisito: la API de Render ya responde (paso 2). Sin ella la web carga, pero no puede iniciar sesión.

1. *Workers & Pages → Create → Import a repository*: autoriza la app de Cloudflare en GitHub **solo** para `bmunoz-dev/andERP` y elígelo.
2. Configuración:

   | Campo | Valor |
   |---|---|
   | Project name | `anderp` (debe coincidir con `name` de `wrangler.jsonc`) |
   | Build command | ver abajo |
   | Deploy command | `npx wrangler deploy` |
   | Non-production branch deploy command (si aparece) | `npx wrangler versions upload` |
   | Path / Root directory | `apps/web` |
   | API token | dejar que Cloudflare cree uno nuevo |
   | Build variables | `NODE_VERSION` = `24` y `SKIP_DEPENDENCY_INSTALL` = `1` |

   Build command (el lockfile de pnpm está en la raíz del monorepo, por eso instala desde allí):

   ```bash
   cd ../.. && npx -y pnpm@11.22.0 install --frozen-lockfile && npx -y pnpm@11.22.0 --filter @anderp/shared build && npx -y pnpm@11.22.0 --filter @anderp/web build
   ```

3. *Deploy*. Si falla, el log está en el Worker → *Deployments* (o *Builds*) → el último → *View build*.
4. Secreto del Worker: *Settings → Runtime variables and secrets* (no las de *Build*) → **Add** → tipo **Secret**, nombre `PROXY_SECRET`, el mismo valor de Render → **Save** (se aplica al guardar). `API_ORIGIN` no se carga en el panel: está en `vars` de `wrangler.jsonc` (es la URL pública de la API); si el servicio de Render cambia de nombre, se cambia ahí. Si falta algo, `/api/v1/health` responde `502 PROXY_MISCONFIGURED` con el nombre de la variable.
5. Actualiza `WEB_URL` en Render con la URL del Worker (p. ej. `https://anderp.<tu-subdominio>.workers.dev`); los enlaces de los correos usan esa URL.
6. Comprueba:
   - `https://<url-del-worker>/api/v1/health` responde `{"status":"ok",...}` (pasa por el proxy);
   - iniciar sesión, recargar la página y seguir con sesión (CA-12);
   - en <https://securityheaders.com> aparecen CSP, HSTS y el resto de cabeceras (CA-11).

Antes de cambiar `wrangler.jsonc`, valida en local sin publicar: `npx wrangler deploy --dry-run` (desde `apps/web`, con `dist` ya construido).

**Dominio propio (opcional):** en el Worker, *Settings → Domains & Routes → Add → Custom domain*; después cambia `WEB_URL` en Render y el remitente del correo.

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

- Flujo de humo completo en producción (`E2E_EMAIL`, `E2E_PASSWORD` y `BASE_URL` apuntando al Worker, con una organización de prueba): `pnpm test:e2e`.
- Sesión que se conserva al recargar, cabeceras en securityheaders.com y llave `anon` sin acceso.

## Costos

Anota aquí los planes y precios al contratar:

| Servicio | Plan | Precio mensual | Fecha |
|---|---|---|---|
| Supabase | | | |
| Render | | | |
| Cloudflare Workers | Free | 0 | |
| Correo | | | |
