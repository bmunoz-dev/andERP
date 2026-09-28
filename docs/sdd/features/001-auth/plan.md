# F01 — Auth y usuarios · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Migraciones

1. **`0001_core` (generada y revisada a mano):**
   - Tablas `organizations`, `users`, `organization_members`, `sessions`, `password_resets` y `audit_logs`, según `design.md` §5.3 y §5.9.
   - `password_resets` incluye `purpose` (lo usará F02).
   - Índices únicos parciales:
     - `organizations(tax_id) WHERE deleted_at IS NULL`
     - `users(email) WHERE deleted_at IS NULL`
   - Índices de consulta:
     - `sessions(token_hash)`
     - `sessions(family_id)`
     - `password_resets(token_hash)`
     - `audit_logs(organization_id, created_at)`
     - `audit_logs(entity_type, entity_id)`
2. **`0002_audit_logs_privileges` (custom):** `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM app_runtime`.

## Módulo `auth` (hexagonal)

```
modules/auth/
  domain/
    password-policy.ts          reglas de longitud + lista de contraseñas comunes
    login-attempts.ts           lógica de bloqueo (5 intentos / 15 min)
    errors.ts                   InvalidCredentialsError, AccountLockedError, ...
  application/
    ports/                      PasswordHasher, TokenService, UserRepository, SessionRepository,
                                PasswordResetRepository, Mailer, Clock, AuditLogger
    use-cases/                  login, refresh-session, logout, change-password,
                                request-password-reset, reset-password, get-current-user
  infrastructure/
    argon2-password-hasher.ts   @node-rs/argon2 (m=19456, t=2, p=1) + needsRehash()
    jwt-token.service.ts        @nestjs/jwt (HS256, 15 min)
    drizzle-*.repository.ts
    smtp-mailer.ts              nodemailer
  http/
    auth.controller.ts
    jwt-auth.guard.ts           guard global; respeta @Public()
    super-admin.guard.ts        @SuperAdminOnly()
    refresh-cookie.ts           nombre, opciones y lectura de la cookie
```

## Decisiones

**Tokens**
- **Access token (JWT):** payload `{ sub, org, role, sa }`.
  - `org`: la organización de la única membresía del usuario. En el caso del super admin, la organización inicial.
  - `role`: rol del usuario en esa organización.
  - `sa`: `is_super_admin`.
- **Refresh token:** 32 bytes aleatorios en base64url. En la base de datos se guarda su `sha256`.
  - Cada login crea una `family_id` nueva.
  - Cada refresh marca `revoked_at` en la fila anterior e inserta una nueva en la misma familia.
  - Si llega un token que ya tiene `revoked_at`, se revoca toda la familia (se detecta reutilización).

**Guard global `JwtAuthGuard`**
1. Valida la firma y la expiración del JWT.
2. Carga el usuario de la base de datos: un `SELECT` por petición, aceptable al volumen actual.
3. Rechaza el acceso si el usuario no está activo o si su organización está suspendida (salvo que sea super admin).
4. Escribe `userId`, `organizationId`, `role` e `isSuperAdmin` en el contexto CLS.

**Otras decisiones**
- **Login con email inexistente:** se ejecuta `verify` contra un hash ficticio precalculado, para no revelar por el tiempo de respuesta qué emails existen.
- **Contraseñas comunes:** lista de las 10.000 más comunes (SecLists, licencia MIT) en `modules/auth/domain/common-passwords.txt`. Se carga en un `Set` al arrancar y se compara en minúsculas.
- **Límite de peticiones:** `@nestjs/throttler` con un límite específico en los endpoints de auth (10 por minuto por IP). En producción, `trust proxy` se activa para leer la IP real (F07).
- **Correo:** puerto `Mailer` implementado con `nodemailer` por SMTP. En local, **Mailpit** en `docker-compose` (SMTP en `:1025`, interfaz web en `:8025`). La plantilla del correo de recuperación es HTML simple, en español.
- **Auditoría:** `AuditService.log({ action, entityType?, entityId?, changes? })` en `modules/audit` toma `userId`, `organizationId`, `ip` y `userAgent` del contexto CLS. Es un servicio compartido (no hexagonal) que se inyecta como adaptador del puerto `AuditLogger`.
- **Seed:** `apps/api/src/db/seed.ts`, que se ejecuta con `pnpm db:seed`. Usa `SEED_ORG_NAME`, `SEED_ORG_TAX_ID`, `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD`, `SEED_SUPERADMIN_FIRST_NAME` y `SEED_SUPERADMIN_LAST_NAME`, y hace upsert por `tax_id` y `email`. F02 lo amplía con catálogos y categorías.

## Endpoints

| Método | Ruta | Pública | Notas |
|---|---|---|---|
| POST | `/auth/login` | ✔ | con throttle |
| POST | `/auth/refresh` | ✔ | lee la cookie |
| POST | `/auth/logout` | ✔ | lee la cookie; funciona aunque el access token haya vencido |
| GET | `/auth/me` | | |
| POST | `/auth/password/change` | | |
| POST | `/auth/password/forgot` | ✔ | con throttle |
| POST | `/auth/password/reset` | ✔ | |

Los esquemas de entrada y salida van en `@anderp/shared/schemas/auth.ts`.

## Web

- **Sesión:** `AuthProvider` guarda el `accessToken` **solo en memoria** y el perfil del usuario. Al montar la app llama a `/auth/refresh` para recuperar la sesión.
- **Rutas:**
  - `/login`, `/olvide-contrasena`, `/restablecer` son públicas.
  - La ruta de layout `_app` es privada: su `beforeLoad` redirige al login si no hay sesión.
- **Cliente HTTP:** `api-client` añade `Authorization: Bearer`. Ante `TOKEN_EXPIRED` hace un único refresh compartido (si llegan varias peticiones a la vez, esperan la misma promesa) y repite la petición.
- **Menú de usuario:** "Cambiar contraseña" (diálogo) y "Cerrar sesión".
- **Formularios:** React Hook Form con los esquemas Zod compartidos.

## Variables de entorno nuevas

```
JWT_SECRET=                      # ≥ 32 bytes aleatorios
WEB_URL=http://localhost:5173
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM="AndERP <no-reply@anderp.local>"
SEED_ORG_NAME=
SEED_ORG_TAX_ID=
SEED_SUPERADMIN_EMAIL=
SEED_SUPERADMIN_PASSWORD=
SEED_SUPERADMIN_FIRST_NAME=
SEED_SUPERADMIN_LAST_NAME=
```

En local la cookie `Secure` funciona igual, porque los navegadores tratan `localhost` como contexto seguro.

## Notas de implementación

- **`users.password_hash` es nullable.** Un usuario invitado (F02) existe antes de definir su contraseña. Con el hash en NULL, el login responde `INVALID_CREDENTIALS`, igual que con un email inexistente.
- **El access token lleva `sid` (la `family_id` de su sesión)**, y el guard comprueba en cada petición que esa familia siga activa. Un logout, un cambio de contraseña o la detección de reutilización invalidan también los access tokens, no solo los refresh. Si la sesión está cerrada, responde `401 SESSION_REVOKED`.
- **El quinto intento fallido responde `401 INVALID_CREDENTIALS` y bloquea la cuenta.** Los siguientes intentos, mientras dure el bloqueo, responden `423 ACCOUNT_LOCKED`.
- **`AUTH_THROTTLE_LIMIT`** (por defecto 10 por minuto por IP) hace configurable el límite. Las pruebas lo suben para poder iniciar sesión muchas veces, y una prueba específica lo baja a 3.
- **Tipo `citext` en Drizzle:** drizzle-kit cita el nombre completo del tipo, así que se declara como `extensions"."citext` para que el SQL resultante sea `"extensions"."citext"`.
- **Longitud de la contraseña:** el dominio cuenta grafemas (`Intl.Segmenter`) y Zod cuenta unidades UTF-16. El límite de Zod es el más estricto de los dos.
- **Pruebas:** la política de contraseñas y el bloqueo se hicieron con TDD. Los casos de uso se escribieron antes que sus pruebas unitarias con dobles en memoria; esas pruebas, y las de integración de la API, se escribieron inmediatamente después y cubren todos los criterios de aceptación.
- **Correo:** las pruebas de API usan una bandeja en memoria (`FakeMailer`). Una prueba aparte envía por SMTP real a un Mailpit de Testcontainers y verifica que el HTML escapa los datos del usuario.
- **Web:** el refresh se serializa entre pestañas con Web Locks (`navigator.locks`). Como la API rota el token en cada uso, dos pestañas que refrescaran a la vez con el mismo token dispararían la detección de reutilización y cerrarían la sesión.
- **Web:** el parámetro `redirect` del login solo acepta rutas internas (`safeRedirect`), para evitar redirecciones abiertas a sitios externos.
- **Web:** en `DropdownMenuCheckboxItem` (generado por shadcn) se quitó `checked={checked}`, porque `exactOptionalPropertyTypes` no acepta `undefined` explícito. La prop sigue llegando dentro de `...props`.
