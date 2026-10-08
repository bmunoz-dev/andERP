# Runbook 05 — Rotar `JWT_SECRET` y `PROXY_SECRET`

Genera cada valor nuevo con `openssl rand -base64 48` y guárdalo en el gestor de contraseñas.

## `JWT_SECRET`

Firma los access tokens (duran 15 minutos). Las sesiones largas usan refresh tokens opacos guardados en la base de datos, que no dependen de este secreto.

1. Render → variables → cambia `JWT_SECRET` y guarda (redespliega).
2. Efecto: los access tokens vigentes dejan de valer; la web pide uno nuevo con la cookie de refresh y el usuario no nota nada.
3. Si además quieres **cerrar todas las sesiones** (por ejemplo, ante una filtración), revoca los refresh tokens en Supabase:

   ```sql
   update anderp.sessions set revoked_at = now() where revoked_at is null;
   ```

   Antes, revisa con `\d anderp.sessions` que la tabla y la columna se llamen así.

## `PROXY_SECRET`

Lo comparten la Pages Function (Cloudflare) y la API (Render). Mientras los dos no coincidan, la API responde `403` a todo menos `/health`. Hazlo en un momento de poco uso:

1. Cloudflare Pages → *Settings → Variables and Secrets* (Production) → cambia `PROXY_SECRET`.
2. Render → cambia `PROXY_SECRET` y guarda (redespliega).
3. Cloudflare aplica las variables en el **siguiente despliegue**: *Deployments* → último → **Retry deployment**.
4. Comprueba: iniciar sesión en la web funciona y `curl https://<servicio>.onrender.com/api/v1/auth/me` sin la cabecera responde `403`.

El corte dura lo que tarden en quedar listos los dos despliegues (unos minutos).

## Contraseñas de la base de datos

- **`app_runtime`:** `ALTER ROLE app_runtime PASSWORD '<nueva>';` en Supabase y actualiza `DATABASE_URL` en Render.
- **`postgres`:** Supabase → *Database Settings → Reset database password*; actualiza `DATABASE_URL_MIGRATIONS` en el environment `production` de GitHub.
