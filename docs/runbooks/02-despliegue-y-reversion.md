# Runbook 02 — Despliegue y reversión

## Desplegar

Cada merge a `main` ejecuta [`deploy.yml`](../../.github/workflows/deploy.yml):

1. **CI** completo (formato, lint, tipos y pruebas).
2. **Aprobación**: GitHub pide aprobar el job "Migrar y desplegar" (environment `production`). Revisa qué migraciones trae el merge antes de aprobar (`apps/api/drizzle/`).
3. **Migraciones** contra producción (`pnpm db:migrate`). Si una falla, el job se detiene aquí y **la API no se despliega** (CA-14).
4. **Deploy hook** de Render: construye la imagen del último commit de `main`.
5. **Espera** a que `/api/v1/health` responda con `version` igual al commit desplegado (hasta 15 minutos).

Cloudflare Pages publica la web por su cuenta en cada push a `main`.

**Orden y compatibilidad.** Las migraciones corren **antes** de la API nueva, así que durante unos minutos la API anterior trabaja con el esquema nuevo. Las migraciones deben ser compatibles hacia atrás: agregar columnas o tablas sí; renombrar o borrar, en dos despliegues (primero se deja de usar, después se borra).

**Si el paso 5 falla** con un commit más nuevo que el del pipeline (dos merges seguidos), revisa en Render qué commit quedó en línea; no hace falta repetir nada si es el más reciente.

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
Cloudflare Pages → proyecto → *Deployments* → despliegue anterior → **Rollback to this deployment**. Después revierte el commit en git.

## Desplegar a mano (sin pipeline)

Solo si GitHub Actions no está disponible: `pnpm db:migrate` desde tu equipo con `DATABASE_URL_MIGRATIONS` de producción, y luego *Manual Deploy → Deploy latest commit* en Render.
