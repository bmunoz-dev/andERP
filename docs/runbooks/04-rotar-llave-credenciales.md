# Runbook 04 — Rotar la llave de las credenciales (`CREDENTIALS_KEYS`)

Las contraseñas de las credenciales se cifran con AES-256-GCM. Cada registro guarda la versión de llave con la que se cifró (`key_version`). Rotar no corta el servicio: mientras dure, conviven la llave vieja y la nueva.

**Cuándo:** si una llave pudo filtrarse, si alguien con acceso a los secretos deja la empresa, o como rutina (por ejemplo, una vez al año).

## Pasos

1. Genera la llave nueva: `openssl rand -base64 32`. Guárdala en el gestor de contraseñas.
2. En Render, **agrega** la versión nueva sin quitar la anterior y cámbiala a activa:

   ```
   CREDENTIALS_KEYS={"1":"<llave 1>","2":"<llave 2>"}
   CREDENTIALS_ACTIVE_KEY_VERSION=2
   ```

   Guarda y espera a que Render redespliegue. Desde ese momento lo nuevo se cifra con la 2 y lo viejo se sigue leyendo con la 1.
3. Vuelve a cifrar lo existente con la llave activa. En Render → servicio → **Shell**:

   ```bash
   node dist/modules/credentials/rotate-keys.js
   ```

   (En local es `pnpm credentials:rotate`.) Trabaja en lotes y es idempotente: si se corta, se vuelve a ejecutar. Informa cuántas credenciales procesó.
4. Comprueba en Supabase que ya nada usa la versión vieja:

   ```sql
   select key_version, count(*) from anderp.entity_credentials group by 1;   -- solo la 2
   ```

   Revela una credencial desde la web para confirmarlo.
5. Quita la versión vieja de `CREDENTIALS_KEYS` en Render (`{"2":"<llave 2>"}`) y deja que redespliegue.
6. **No borres la llave vieja del gestor de contraseñas** mientras existan backups cifrados con ella ([runbook 03](03-restaurar-backup.md)).

## Si algo falla

- **La API no arranca** tras el paso 2: la llave activa no está en el JSON o no mide 32 bytes. Corrige la variable; los datos no se tocaron.
- **`rotate-keys` se detiene con `CREDENTIAL_DECRYPT_FAILED`:** hay un registro dañado (su texto cifrado no corresponde a su `id`). El mensaje no dice cuál; búscalo descifrando por lotes o restaura ese registro desde un backup, y vuelve a ejecutar.
- **`CREDENTIAL_KEY_UNAVAILABLE`:** quitaste una versión que todavía usan registros. Vuelve a agregarla, rota y recién después quítala.
