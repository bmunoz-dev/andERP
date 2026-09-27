# F07 — Despliegue y endurecimiento · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Topología

```
Navegador ──HTTPS──► Cloudflare Pages (web estática)
                        └─ /api/* ─► Pages Function (proxy) ──HTTPS + X-Proxy-Secret──► Render (API, Docker)
                                                                                          └─► Supavisor (sesión, IPv4) ─► Postgres (Supabase, sa-east-1)
```

La web y la API comparten origen desde el navegador (la cookie `SameSite=Strict` funciona y no hace falta CORS).

## Decisiones

**Por qué Cloudflare Pages y no Vercel**
- El plan gratuito de Vercel (Hobby) no permite uso comercial, y AndERP es para una empresa. Cloudflare Pages sí lo permite en su plan gratuito.
- Las reglas `_redirects` de Cloudflare **no** reenvían a dominios externos. Por eso se usa una Pages Function (`functions/api/[[path]].ts`, unas 30 líneas).

**Esquema `anderp`**
- Supabase publica el esquema `public` por su Data API usando la llave `anon`. Si las tablas estuvieran en `public` sin RLS, **cualquiera con la URL del proyecto podría leerlas**.
- Todas las tablas van en el esquema `anderp` (Drizzle `pgSchema('anderp')`, `search_path` del rol `app_runtime`) y además se desactiva la Data API.
- Esto se aplica **desde F00** (ver el historial de `design.md`) para no mover tablas después.

**Conexión a Supabase**
- La conexión directa de Supabase es solo IPv6 y Render sale por IPv4. Se usa el **pooler Supavisor en modo sesión** (puerto 5432 del host del pooler, usuario `app_runtime.<project-ref>`).
- `postgres-js` con `max: 10`, `idle_timeout: 20` y `connect_timeout: 10`.
- Se verifica al configurar que Supavisor acepta el rol propio. Si no, el runbook documenta la alternativa con el complemento IPv4.

**Planes y costos**
- Producción usa planes de pago en Supabase (backups diarios, sin pausa por inactividad) y en Render (sin dormirse; el plan gratuito tarda unos 50 segundos en despertar).
- Los precios se revisan al contratar y se anotan en el runbook de puesta en marcha.

**Secretos (Render)**
- `DATABASE_URL`, `JWT_SECRET`, `CREDENTIALS_KEYS`, `CREDENTIALS_ACTIVE_KEY_VERSION`, `PROXY_SECRET`, `WEB_URL`, `SMTP_*`, `MAIL_FROM`.
- En Cloudflare, la Function usa `API_ORIGIN` y `PROXY_SECRET`.
- En GitHub (environment `production`): `DATABASE_URL_MIGRATIONS` y `RENDER_DEPLOY_HOOK_URL`.

**Correo en producción**
- Cualquier proveedor SMTP transaccional (por ejemplo Resend o Brevo) con el dominio verificado (SPF y DKIM).
- Mientras no haya dominio propio, se usa el subdominio de prueba que ofrezca el proveedor.

**Guard del proxy en la API**
- `ProxySecretGuard` global compara `X-Proxy-Secret` en tiempo constante (`crypto.timingSafeEqual`) y excluye `/health`.
- Un middleware toma `X-Client-IP` solo si el secreto es válido y lo guarda en el contexto CLS para el throttler y la auditoría.
- En desarrollo el guard se desactiva si `PROXY_SECRET` está vacío. **En producción la API no arranca sin él.**

**Imagen Docker**
- Etapa de build: `pnpm install --frozen-lockfile`, build de `@anderp/shared` y `@anderp/api`, `pnpm deploy --filter @anderp/api --prod /out`.
- Etapa final: `node:24-slim`, usuario `node`, `CMD ["node", "dist/main.js"]`.
- `.dockerignore` excluye `apps/web`, `docs` y los tests.

## Estructura nueva

```
apps/api/Dockerfile
apps/web/functions/api/[[path]].ts
apps/web/public/_headers
.github/workflows/deploy.yml
e2e/                          Playwright (paquete propio @anderp/e2e)
docs/runbooks/
  01-puesta-en-marcha.md
  02-despliegue-y-reversion.md
  03-restaurar-backup.md
  04-rotar-llave-credenciales.md
  05-rotar-secretos.md
  06-nueva-organizacion.md
```
