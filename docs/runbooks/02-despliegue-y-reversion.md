# Runbook 02 — Despliegue y reversión

## Desplegar

Cada merge a `main` ejecuta [`deploy.yml`](../../.github/workflows/deploy.yml):

1. **CI** completo (formato, lint, tipos y pruebas).
2. **Aprobación**: GitHub pide aprobar el job "Migrar y desplegar" (environment `production`). Revisa qué migraciones trae el merge antes de aprobar (`apps/api/drizzle/`). **Ojo:** a esta altura la web nueva ya está publicada (ver abajo); no dejes la aprobación esperando.
3. **Migraciones** contra producción (`pnpm db:migrate`). Si una falla, el job se detiene aquí y **la API no se despliega** (CA-14). El log dice por qué (F22):
   - `No se pudo conectar a la base de datos (¿proyecto pausado o caído?)`: lo más probable es que Supabase Free haya pausado el proyecto por inactividad. Reactívalo en el panel de Supabase (*Restore project*, tarda unos minutos) y repite solo el job fallido: `gh run rerun <id> --failed`.
   - `La migración falló: … (código …, restricción …)`: el error real de Postgres. Corrige la migración en una rama nueva; no edites una migración ya aplicada.
4. **Deploy hook** de Render con `ref=<commit del job>`: construye la imagen de ese commit, no "el último de `main`" (F22).
5. **Espera** a que `/api/v1/health` responda con `version` igual al commit desplegado (hasta 15 minutos).

Cloudflare (Workers Builds) publica la web por su cuenta en cada push a `main`. **Riesgo aceptado (2026-11-06):** la web no espera al CI, a la aprobación ni a las migraciones. Si el deploy de la API falla o tarda, queda una web nueva hablando con una API vieja hasta que se resuelva; por eso el paso 2 no debe quedar esperando y un deploy fallido se atiende enseguida.

**Orden y compatibilidad.** Las migraciones corren **antes** de la API nueva, así que durante unos minutos la API anterior trabaja con el esquema nuevo. Las migraciones deben ser compatibles hacia atrás: agregar columnas o tablas sí; renombrar o borrar, en dos despliegues (primero se deja de usar, después se borra). La plantilla de PR lo pregunta (F22).

**Monitoreo (F22):** el workflow `health.yml` llama a `/api/v1/health` cada 2 días; si falla, GitHub avisa por correo. Para comprobar a mano: *Actions → Health → Run workflow*.

## Revertir

### La API nueva falla y no hay migraciones de por medio
1. Render → servicio → *Events* → despliegue anterior → **Rollback**.
2. Revierte el commit en git (`git revert <sha>` en una rama, PR y merge) para que el próximo despliegue no lo traiga de vuelta.

### Hubo migraciones
Las migraciones no se deshacen solas (Drizzle solo avanza):
1. Si la API anterior funciona con el esquema nuevo (lo normal si la migración fue compatible), haz el **Rollback** de Render y corrige con una migración nueva.
2. Si el esquema quedó dañado, escribe una migración que lo repare y despliégala.
3. Último recurso, con pérdida de los datos posteriores al backup: [runbook 03](03-restaurar-backup.md).

### La web falla
Cloudflare → Worker `anderp` → *Deployments* → versión anterior → **Rollback** (o `npx wrangler rollback` desde `apps/web`). Después revierte el commit en git.

## Desplegar a mano (sin pipeline)

Solo si GitHub Actions no está disponible: `pnpm db:migrate` desde tu equipo con `DATABASE_URL_MIGRATIONS` de producción, y luego *Manual Deploy → Deploy latest commit* en Render.
