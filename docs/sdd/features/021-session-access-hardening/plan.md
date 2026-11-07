# F21 — Sesión y acceso · Plan

- **Estado:** Aprobado (2026-11-07)
- **Spec:** [spec.md](spec.md)

## Restricciones globales

- Códigos de error existentes: `LAST_ADMIN`, `SESSION_REVOKED`, `UNAUTHORIZED`, `ACCOUNT_DISABLED` y `TOKEN_EXPIRED`. F21 no crea códigos nuevos.
- Bloqueo: `MAX_FAILED_ATTEMPTS = 5` y `LOCK_DURATION_MS = 15 min` (`apps/api/src/modules/auth/domain/login-attempts.ts`). El quinto fallo bloquea y reinicia el contador a 0, como hoy.
- Las revocaciones y los eventos de auth van fuera de las transacciones de negocio (F12 CA-3 y CA-4).
- Un solo PR. La migración solo agrega una columna nula.

## Datos

Migración **`0037_session_access`**, generada con `pnpm db:generate --name session_access`:

- `core.ts`: `organizationMembers.lastAccessAt: timestamptz()` (nula), sin relleno. Las membresías existentes muestran "—" hasta el siguiente ingreso.

## API

**Contador atómico (CA-1)**

- `UserRepository.recordFailedLogin(userId, attempts, lockedUntil)` se reemplaza por `registerFailedLogin(userId: string, now: Date): Promise<FailedLoginResult>`.
- En Drizzle es un solo `UPDATE ... RETURNING`:
  - `failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= 5 THEN 0 ELSE failed_login_attempts + 1 END`;
  - `locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN $now + 15 min ELSE locked_until END`;
  - `locked = (failed_login_attempts devuelto = 0)`.
- `login-attempts.ts` conserva las constantes y `isLocked`. La función pura `registerFailedLogin` pasa a usarse solo en `in-memory-auth.ts`.

**Throttle y recuperación (CA-2, CA-3)**

- `auth.controller.ts`: `@UseGuards(ThrottlerGuard)` en `password/change`.
- `RequestPasswordResetUseCase.execute(email)` se divide:
  - `execute` llama a `void this.issue(email).catch(log)` y retorna de inmediato;
  - `private issue(email)` contiene lo que hoy hace `execute`.
- El correo ya iba sin `await`.

**Limpieza y último ingreso (CA-4, CA-8)**

- `SessionRepository.deleteExpiredForUser(userId: string, at: Date): Promise<void>` borra `expires_at < at`.
- `PasswordResetRepository.deleteSpentForUser(userId: string, at: Date): Promise<void>` borra `used_at IS NOT NULL OR expires_at < at`.
- `LoginUseCase` llama a ambos después de un login exitoso. Si fallan, registra el error en el log y no falla el login.
- `recordSuccessfulLogin(userId, at, rehashed)` pasa a `recordSuccessfulLogin(userId, organizationId, at, rehashed)`. También fija `organization_members.last_access_at = at` en la membresía de entrada. El login hoy calcula `access` después de este llamado: se reordena para que `requireAccess` vaya primero.
- `SessionRepository.switchOrganization(...)` también fija `lastAccessAt: at`.
- `MembersService.list()` selecciona `organizationMembers.lastAccessAt` como `lastLoginAt`.

**Revocación por organización (CA-5)**

- `SessionRepository.revokeOrganizationSessions(organizationId: string, at: Date, userId?: string): Promise<void>`:
  - `UPDATE sessions SET revoked_at = at WHERE organization_id = :org AND revoked_at IS NULL [AND user_id = :userId]`;
  - sin `userId`, excluye a los super admin con un `user_id IN (SELECT id FROM users WHERE NOT is_super_admin)`.
- `MembersService.setActive` y `OrganizationsService.update` (suspensión) la llaman después del commit, dentro de `try/catch` que registra el error con `Logger`.
- `revokeAllForUser` se queda para el reset y el cambio de contraseña.

**Último administrador (CA-6)**

- En `MembersService.setActive`, el conteo pasa dentro de `db.transaction`, antes del `UPDATE`:
  1. `SELECT id FROM organizations WHERE id = :org FOR UPDATE`;
  2. conteo de `organization_members` activos, sin borrar, de la organización, con `user_id <> :userId` y `users.password_hash IS NOT NULL`;
  3. si es 0, `DomainError(LAST_ADMIN, 422)`.
- `CANNOT_DEACTIVATE_SELF` y la regla del super admin no cambian.

**Invitaciones por organización (CA-7)**

- `MemberOnboarding.addMember`: se borra el bloque `if (!existing.passwordHash) { delete ... insert member.invitation_replaced }`. El resto queda igual: se crea la membresía nueva, y `sendInvitation` crea un token que invalida los anteriores.
- `ResetPasswordUseCase.execute`: si `reset.purpose === 'invite'`, después de `updatePassword` llama a `UserRepository.selectNewestMembership(userId: string, at: Date): Promise<void>`. Esa función fija `last_selected_at = at` en la membresía activa con `created_at` más reciente.
- Un reset de contraseña normal (`purpose = 'reset'`) no lo llama.

**Logs (CA-9)**

- `apps/api/src/shared/logging/serialize-error.ts`: `serializeError(err: unknown): Record<string, unknown>`.
  - Si `err` es un `DrizzleQueryError` (de `drizzle-orm`), devuelve `{ type: 'DrizzleQueryError', code, constraint, table, column }`, tomados de `err.cause`, el `PostgresError` de `postgres`.
  - En otro caso, delega en `pino.stdSerializers.err`.
- `logger.module.ts`: `serializers: { err: serializeError }` en las opciones de `pinoHttp`.
- El filtro no cambia: ya registra `{ err: exception }`.

## Web

- `apps/web/src/lib/query-client.ts` exporta el `queryClient`, que hoy vive en `main.tsx`, con las mismas opciones. `main.tsx` lo importa.
- `auth-api.ts`: en el `finally` de `logout()`, `queryClient.clear()` junto a `authStore.clear()` (CA-10). `user-menu.tsx` no cambia.
- `api-client.ts`: en el `catch` de `apiFetch`, antes del caso `TOKEN_EXPIRED`, si el error es un `ApiError` con estado `401` y código `SESSION_REVOKED`, `UNAUTHORIZED` o `ACCOUNT_DISABLED`, y `path` no empieza por `/auth/`, se avisa a `sessionExpiredListeners` y se relanza el error (CA-11). El listener de `main.tsx` ya limpia la sesión y navega.
- `lib/navigation.ts`: `appRedirect(auth: AuthState, location: { href: string; pathname: string }): { to: '/login'; search: { redirect: string } } | { to: '/egresos' } | null`. Contiene la lógica que hoy está en el `beforeLoad` de `_app.tsx`, que pasa a `const target = appRedirect(authStore.get(), location); if (target) throw redirect(target);` (CA-12).

## Pruebas

| CA | Dónde | Caso |
|---|---|---|
| CA-1 | `apps/api/test/auth.test.ts` | 7 logins fallidos con `Promise.all`: `locked_until` queda en el futuro y el siguiente login con la contraseña correcta responde `423` |
| CA-2 | `auth.test.ts` | `password/change` responde `429` al superar el límite del throttler de pruebas |
| CA-3 | `auth.use-cases.test.ts` | `execute` retorna antes de que se resuelva el repositorio (repositorio en memoria con una promesa pendiente) |
| CA-4 | `auth.test.ts` | Sesión con `expires_at` en el pasado y reset usado: tras el login no existen; una sesión revocada no vencida sigue |
| CA-5 | `organizations.test.ts` | Los dos casos de CA-5, que reemplazan "CA-2 suspender revoca…" (línea 102) y "CA-14 desactivar revoca…" (línea 405) |
| CA-6 | `organizations.test.ts` | Único miembro con contraseña; los demás invitados; desactivación cruzada con `Promise.all` (exactamente un `200` y un `422`) |
| CA-7 | `organizations.test.ts` | Reemplaza la prueba de F02 CA-20: la membresía en A sigue; activar con el enlace de B entra en B; un reset normal no cambia `last_selected_at` |
| CA-8 | `organization-switch.test.ts` | Login en A no cambia `last_access_at` en B; cambiar a B lo fija; el listado de B devuelve ese valor |
| CA-9 | `apps/api/test/foundation.test.ts` | `db.execute(sql\`select ${'F21-SENTINEL'}::uuid\`)` falla; `JSON.stringify(serializeError(err))` no contiene `F21-SENTINEL` y sí `code: '22P02'` |
| CA-10 | `apps/web/src/lib/auth-api.test.ts` | Con datos en `queryClient` y `fetch` simulado, `logout()` deja la caché vacía, también si la red falla |
| CA-11 | `api-client.test.ts` | `401 SESSION_REVOKED` en `/expenses` llama al listener; `401 ACCOUNT_DISABLED` en `/auth/login` no |
| CA-12 | `navigation.test.ts` | `appRedirect` sin sesión → login con `redirect`; módulo apagado → `/egresos`; con acceso → `null` |

## Puntos de revisión

Casos que la spec implica y ninguna prueba de arriba cubre. Cada uno lleva su prueba en la tarea indicada:

1. **Invitar a alguien que ya tiene contraseña en otra organización.** Se agrega como miembro activo, recibe el correo "te agregaron" y no se borra nada (T008).
2. **Logout sin red.** La caché se vacía igual (ya en CA-10).
3. **Desactivar a un miembro que solo tiene sesiones en B.** Ninguna sesión suya queda revocada (T006).
4. **`LAST_ADMIN` con un super admin miembro activo.** Cuenta como miembro con contraseña, y se puede desactivar al otro admin (T007).
5. **Login de una cuenta bloqueada con la contraseña correcta durante el bloqueo.** Sigue respondiendo `423` y no toca el contador (T003).

## Notas de implementación

(Se completan al implementar.)
