# Runbook 03 — Restaurar un backup

Supabase guarda backups diarios en los planes de pago. Restaurar sobre producción **pierde todo lo registrado después del backup**: primero se ensaya en un proyecto temporal.

## Ensayo en un proyecto temporal (F07-T015)

1. Supabase → proyecto de producción → *Database → Backups*: elige el backup y usa **Restore to a new project** (si tu plan no lo ofrece, descarga el backup y restáuralo con `pg_restore` / `psql` en un proyecto nuevo de la misma región y versión de Postgres).
2. Crea `app_runtime` en el proyecto temporal si no vino con el backup ([runbook 01](01-puesta-en-marcha.md), paso 1.3). Los roles no siempre se restauran con los datos.
3. Comprueba los datos (con el usuario `postgres` del proyecto temporal):

   ```sql
   select count(*) from anderp.organizations;
   select max(created_at) from anderp.audit_logs;   -- debe coincidir con la hora del backup
   select key_version, count(*) from anderp.entity_credentials group by 1;
   ```

4. Opcional: levanta la API en local contra el proyecto temporal (`DATABASE_URL` del temporal y las **mismas** `CREDENTIALS_KEYS` de producción) y revela una credencial: así se confirma que el backup y las llaves siguen emparejados.
5. Anota abajo cuánto tomó y borra el proyecto temporal.

## Restaurar producción

1. Avisa a los usuarios y detén la escritura: Render → servicio → **Suspend**.
2. Supabase → *Database → Backups* → backup elegido → **Restore** (sobre el mismo proyecto).
3. Verifica con las consultas del ensayo y que `app_runtime` puede conectarse.
4. Render → **Resume**. Comprueba `/api/v1/health` y un inicio de sesión.
5. Las migraciones posteriores al backup se vuelven a aplicar solas en el siguiente despliegue (o con `pnpm db:migrate`).

**Llaves de credenciales.** Un backup cifrado con una versión de llave que ya se quitó de `CREDENTIALS_KEYS` no se puede revelar (`CREDENTIAL_KEY_UNAVAILABLE`). Guarda las llaves retiradas en el gestor de contraseñas al menos lo que duran los backups.

## Registro de ensayos

| Fecha | Backup usado | Tiempo total | Notas |
|---|---|---|---|
| | | | |
