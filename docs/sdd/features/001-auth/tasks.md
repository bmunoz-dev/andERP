# F01 — Auth y usuarios · Tareas

- **Rama:** `feat/001-auth`
- **Plan:** [plan.md](plan.md)

## Bloque A — Datos

- [ ] F01-T001 Definir en Drizzle las tablas `organizations`, `users`, `organization_members`, `sessions`, `password_resets` y `audit_logs`. Generar `0001_core` y revisarla a mano: índices parciales, tipos `citext` e `inet`.
- [ ] F01-T002 Crear la migración custom `0002_audit_logs_privileges`.
      Depende de: F01-T001
- [ ] F01-T003 [TDD] Prueba de integración: `app_runtime` no puede hacer `UPDATE`, `DELETE` ni `TRUNCATE` sobre `audit_logs`, y un email repetido con distintas mayúsculas viola la unicidad.
      Depende de: F01-T002 · Verificación: CA-17
- [ ] F01-T004 Crear el seed idempotente (`db/seed.ts`, script `db:seed`) con las variables `SEED_*`, más una prueba de integración que lo ejecuta dos veces.
      Depende de: F01-T001 · Verificación: CA-16

## Bloque B — Auditoría y correo

- [ ] F01-T005 Crear el módulo `audit`: `AuditService.log()` que toma el contexto de CLS. Prueba de integración que verifica la fila insertada.
      Depende de: F01-T001
- [ ] F01-T006 [P] Añadir Mailpit a `docker-compose` y crear `SmtpMailer` con la plantilla de recuperación. Prueba de integración que envía a Mailpit y consulta su API.
      Depende de: F00

## Bloque C — Dominio y aplicación de `auth` (TDD con fakes)

- [ ] F01-T007 [P] [TDD] `password-policy`: longitud 12–128 y lista de contraseñas comunes, comparada en minúsculas.
- [ ] F01-T008 [P] [TDD] `login-attempts`: contar fallos, bloquear al quinto, desbloquear a los 15 minutos (con un `Clock` falso) y reiniciar el contador tras un éxito.
- [ ] F01-T009 [TDD] Caso de uso `login`: éxito, contraseña incorrecta, email inexistente (verifica el hash ficticio), bloqueado, inactivo, organización suspendida (y super admin exento), rehash cuando los parámetros son antiguos y eventos de auditoría.
      Depende de: F01-T007, F01-T008 · Verificación: CA-1–CA-4, CA-6
- [ ] F01-T010 [TDD] Caso de uso `refresh-session`: rotación, token desconocido, token vencido, y reutilización que revoca toda la familia.
      Depende de: F01-T009 · Verificación: CA-7, CA-8
- [ ] F01-T011 [P] [TDD] Caso de uso `logout`.
      Depende de: F01-T010 · Verificación: CA-10
- [ ] F01-T012 [P] [TDD] Caso de uso `change-password`: contraseña actual incorrecta, contraseña débil y revocación de las demás sesiones.
      Depende de: F01-T007 · Verificación: CA-13
- [ ] F01-T013 [P] [TDD] Casos de uso `request-password-reset` (siempre "OK"; solo envía correo si el usuario existe y está activo) y `reset-password` (token vencido, usado o inexistente; revoca todas las sesiones).
      Depende de: F01-T007 · Verificación: CA-14, CA-15

## Bloque D — Infraestructura y HTTP

- [ ] F01-T014 Crear los adaptadores `Argon2PasswordHasher` (con `needsRehash`), `JwtTokenService` y los repositorios Drizzle.
      Depende de: F01-T001
- [ ] F01-T015 Crear `JwtAuthGuard` global, el decorador `@Public()`, `SuperAdminGuard` y el volcado al contexto CLS. Quitar el marcador temporal de `health`, que queda `@Public()`.
      Depende de: F01-T014
- [ ] F01-T016 Crear `auth.controller.ts`: endpoints, cookie `anderp_rt` y esquemas en `@anderp/shared/schemas/auth.ts`.
      Depende de: F01-T009–F01-T015
- [ ] F01-T017 Configurar `@nestjs/throttler` en `login` y `forgot`.
      Depende de: F01-T016 · Verificación: CA-5
- [ ] F01-T018 Añadir los códigos de error nuevos a `@anderp/shared/errors/codes.ts`: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_DISABLED`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `INVALID_CURRENT_PASSWORD`, `WEAK_PASSWORD`, `INVALID_RESET_TOKEN` y `TOO_MANY_REQUESTS`.
      Depende de: F01-T016

## Bloque E — Pruebas de API

- [ ] F01-T019 [TDD] Pruebas de API de CA-1 a CA-15 con supertest, incluidos los atributos de la cookie y el flujo completo de recuperación leyendo el correo en Mailpit.
      Depende de: F01-T016, F01-T017, F01-T006
- [ ] F01-T020 Prueba de que las respuestas de `/auth/*` nunca incluyen `passwordHash` ni tokens de refresco en el cuerpo, y de que los logs no contienen la contraseña enviada.
      Depende de: F01-T019 · Verificación: CA-18

## Bloque F — Web

- [ ] F01-T021 Crear `AuthProvider`: token en memoria, recuperación de sesión al montar y `logout`.
      Depende de: F00-T027
- [ ] F01-T022 [TDD] Hacer que `api-client` añada el header `Authorization`, refresque una sola vez ante peticiones concurrentes y redirija al login si el refresh falla.
      Depende de: F01-T021 · Verificación: CA-9
- [ ] F01-T023 Crear las rutas `/login`, `/olvide-contrasena` y `/restablecer`, y el layout privado `_app` con `beforeLoad`.
      Depende de: F01-T021 · Verificación: CA-19, CA-20
- [ ] F01-T024 Añadir al menú de usuario el diálogo de cambiar contraseña y el botón de cerrar sesión.
      Depende de: F01-T023
- [ ] F01-T025 Añadir los mensajes en español de los códigos de F01-T018 a `error-messages.es.ts`.
      Depende de: F01-T018

## Cierre

- [ ] F01-T026 Verificación manual del hito M1: seed → login → recargar la página (la sesión sigue) → cambiar la contraseña → logout → olvidé mi contraseña (el correo llega a Mailpit) → restablecer → login. Revisar la Definición de Hecho y actualizar `roadmap.md`.
