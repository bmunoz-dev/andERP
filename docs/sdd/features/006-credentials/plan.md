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

## Notas de implementación

- **Migraciones reales:** `0015_responsible_persons_and_credentials` y `0016_responsible_persons_guard`.
- **Sin capas hexagonales:** `credentials/` tiene `credential-cipher.ts` (AES-256-GCM, una clase con las llaves), `credentials.service.ts` (consultas, comandos y auditoría), `credentials.module.ts` (controlador) y `rotate-keys.ts` (caso de uso y script). No hubo un segundo adaptador que justificara puertos.
- **Llaves en `env.ts`:** `CREDENTIALS_KEYS` se valida y se convierte a `Map<versión, Buffer>` con el resto del entorno; si falta la llave activa o no mide 32 bytes, `loadEnv` falla y la API no arranca.
- **Reglas en la base de datos:** `CONTACT_REQUIRED` sale del CHECK `responsible_persons_contact_ck` (también al editar) y `DUPLICATE_CREDENTIAL` del índice `entity_credentials_uq`; el servicio no las repite.
- **Auditoría:** `credential.update` (con `passwordChanged`) y `credential.reveal`, como pide la spec. Crear y borrar no se auditan (§5.9). Los responsables tampoco.
- **CA-8:** el servicio registra `Credential integrity check failed` con nivel `error` antes de responder `500`.
- **Rotación:** recorre también las credenciales borradas. Si un registro no se puede descifrar, se detiene con error en lugar de saltarlo.
- **Script:** `pnpm credentials:rotate` ejecuta `apps/api/src/modules/credentials/rotate-keys.ts`.
