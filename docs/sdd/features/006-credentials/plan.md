# F06 — Responsables y credenciales · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Migraciones

1. **`responsible_persons_and_credentials` (generada y revisada):**
   - `responsible_persons` con `UNIQUE (organization_id, id)` y `CHECK (email IS NOT NULL OR phone IS NOT NULL)`.
   - `entity_credentials`:
     - FK compuesta nullable `(organization_id, responsible_person_id)`. Se usa `MATCH SIMPLE`, así que un `responsible_person_id` NULL no se valida;
     - columnas `bytea` para el cifrado;
     - `CHECK (char_length(url) <= 2048)`;
     - `entity_credentials_uq (organization_id, entity_name, username) WHERE deleted_at IS NULL`.
2. **`responsible_persons_guard` (custom):** trigger `BEFORE UPDATE OF deleted_at` sobre `responsible_persons` → `RESPONSIBLE_IN_USE` si tiene credenciales no borradas.

## Módulos

```
modules/responsible-persons/     CRUD (no hexagonal)
modules/credentials/             hexagonal
  domain/
    credential.ts                entidad sin la contraseña en claro; conoce su EncryptedSecret
    encrypted-secret.ts          { ciphertext, iv, authTag, keyVersion }
  application/
    ports/                       CipherPort, CredentialRepository, AuditLogger
    commands/                    create-credential, update-credential, reveal-credential, delete-credential
    rotate-keys.ts               caso de uso que ejecuta el script
  infrastructure/
    aes-gcm.cipher.ts            node:crypto createCipheriv('aes-256-gcm'), setAAD, getAuthTag
    key-ring.ts                  lee CREDENTIALS_KEYS y valida al arrancar
    drizzle-credential.repository.ts
  http/
    credentials.controller.ts
scripts/credentials-rotate.ts    se ejecuta con `pnpm credentials:rotate`
```

**Orden al crear.** El `id` (UUIDv7) se genera **antes** de cifrar, porque forma parte del AAD. Por eso el repositorio recibe la entidad con el `id` ya asignado.

**Puerto `CipherPort`:**
- `encrypt(plaintext, aad) → EncryptedSecret` (siempre con la llave activa);
- `decrypt(secret, aad) → string`.

Los errores se mapean a `CREDENTIAL_DECRYPT_FAILED` y `CREDENTIAL_KEY_UNAVAILABLE`.

**Seguridad de la memoria y los logs:**
- el `redact` de pino añade `*.password` (ya estaba) y las respuestas de reveal;
- el controlador de reveal responde con `Cache-Control: no-store` y `Pragma: no-cache`;
- nunca se registra el cuerpo de las respuestas.

**Rotación de llaves:**
1. Se agrega la nueva llave a `CREDENTIALS_KEYS` y se cambia `CREDENTIALS_ACTIVE_KEY_VERSION`.
2. Se despliega y se ejecuta `credentials:rotate`.
3. Cuando ningún registro usa la versión vieja, se quita del JSON.

El runbook de F07 documenta estos pasos.

## Endpoints

| Método | Ruta |
|---|---|
| GET, POST | `/responsible-persons` |
| GET, PATCH, DELETE | `/responsible-persons/:id` |
| GET, POST | `/credentials` |
| GET, PATCH, DELETE | `/credentials/:id` |
| POST | `/credentials/:id/reveal` |

## Web

- `credenciales/index.tsx`: `DataTable`, `RevealButton` (con estado local y temporizador de 30 segundos) y `CopyButton` (`navigator.clipboard.writeText`).
- La contraseña revelada **no** se guarda en la caché de TanStack Query: es una `mutation` sin caché.
- `responsables/index.tsx`: CRUD con `FormDialog`.

## Variables de entorno nuevas

```
CREDENTIALS_KEYS={"1":"<openssl rand -base64 32>"}
CREDENTIALS_ACTIVE_KEY_VERSION=1
```
