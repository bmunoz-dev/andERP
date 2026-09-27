# F01 — Auth y usuarios · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §5.3, §5.9, §6.1, §6.2, §6.4

## Objetivo

Que un usuario pueda iniciar sesión de forma segura, mantener su sesión, cerrarla, cambiar su contraseña y recuperarla por correo. Se crean la organización inicial y el super admin, y la infraestructura de auditoría que usarán las demás features.

## Historias

- **HU1.** Como usuario, quiero iniciar sesión con mi email y contraseña para usar AndERP.
- **HU2.** Como usuario, quiero que mi sesión se mantenga mientras la use, sin volver a escribir la contraseña cada 15 minutos.
- **HU3.** Como usuario, quiero cerrar sesión para que nadie más use mi cuenta en ese equipo.
- **HU4.** Como usuario, quiero cambiar mi contraseña conociendo la actual.
- **HU5.** Como usuario, quiero recuperar mi contraseña por correo si la olvido.
- **HU6.** Como dueño del sistema, quiero que exista una organización inicial y mi usuario super admin al instalar AndERP.
- **HU7.** Como dueño, quiero que los intentos de acceso queden auditados y que los ataques de fuerza bruta se bloqueen.

## Criterios de aceptación

**Login**
- **CA-1.** Con credenciales correctas, `POST /auth/login` responde `200` con `accessToken` (JWT de 15 minutos) y el perfil (`id`, `email`, `firstName`, `lastName`, `isSuperAdmin`, `organization { id, name }`, `role`). Además fija la cookie `anderp_rt` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`, 7 días).
- **CA-2.** Con una contraseña incorrecta **o** un email inexistente, responde `401 INVALID_CREDENTIALS` con el mismo mensaje y un tiempo de respuesta similar (se verifica un hash ficticio). Se registra `auth.login_failed`.
- **CA-3.** Tras 5 fallos consecutivos, la cuenta queda bloqueada 15 minutos: responde `423 ACCOUNT_LOCKED` aunque la contraseña sea correcta y se registra `auth.account_locked`. Un login exitoso reinicia el contador.
- **CA-4.** Un usuario con `status = inactive`, o que no es super admin y cuya organización está `suspended`, recibe `403 ACCOUNT_DISABLED`.
- **CA-5.** Más de 10 peticiones por minuto desde una misma IP a `/auth/login` o `/auth/password/forgot` responden `429 TOO_MANY_REQUESTS`.
- **CA-6.** Un login exitoso actualiza `last_login_at`, registra `auth.login` y, si el hash guardado usa parámetros inferiores a los actuales, lo vuelve a generar.

**Sesión**
- **CA-7.** `POST /auth/refresh` con una cookie válida devuelve un nuevo `accessToken` y **rota** la cookie: el token anterior queda revocado y el nuevo dura 7 días desde ese momento (sesión deslizante).
- **CA-8.** Si se presenta un refresh token ya rotado o revocado, responde `401 SESSION_REVOKED` y **se revocan todas las sesiones de esa familia**.
- **CA-9.** Una petición con access token vencido responde `401 TOKEN_EXPIRED`. La web hace un solo intento de refresh y repite la petición; si el refresh falla, envía al login.
- **CA-10.** `POST /auth/logout` revoca la sesión actual y borra la cookie.
- **CA-11.** Toda ruta que no esté marcada `@Public()` responde `401 UNAUTHORIZED` sin token. Si el usuario fue desactivado después de emitir el token, responde `401 ACCOUNT_DISABLED`.
- **CA-12.** `GET /auth/me` devuelve el mismo perfil que el login.

**Contraseñas**
- **CA-13.** `POST /auth/password/change` exige la contraseña actual (si es incorrecta, `422 INVALID_CURRENT_PASSWORD`). Aplica la política (mínimo 12 y máximo 128 caracteres; se rechazan las contraseñas comunes con `422 WEAK_PASSWORD`), revoca las **demás** sesiones y registra `auth.password_changed`.
- **CA-14.** `POST /auth/password/forgot` responde siempre `202`. Solo si el email existe y está activo, envía un correo con un enlace `WEB_URL/restablecer?token=…` que vence en 30 minutos y registra `auth.password_reset_requested`.
- **CA-15.** `POST /auth/password/reset` con un token válido cambia la contraseña, marca el token como usado, revoca **todas** las sesiones y registra `auth.password_reset`. Un token vencido, usado o inexistente responde `422 INVALID_RESET_TOKEN`.

**Instalación y auditoría**
- **CA-16.** `pnpm db:seed` crea (de forma idempotente) la organización inicial y el super admin a partir de variables de entorno. Si se ejecuta dos veces, no duplica nada.
- **CA-17.** `audit_logs` guarda `ip`, `user_agent`, `user_id` y `organization_id` cuando aplican. El rol `app_runtime` **no puede** ejecutar `UPDATE` ni `DELETE` sobre `audit_logs` (prueba de integración).
- **CA-18.** Ninguna respuesta ni log contiene `password_hash`, contraseñas ni tokens en claro.

**Web**
- **CA-19.** Hay pantallas de login, "¿Olvidaste tu contraseña?", restablecer contraseña y cambiar contraseña (desde el menú de usuario), con mensajes en español para cada `code`.
- **CA-20.** Las rutas privadas redirigen al login sin sesión. Al recargar la página, la sesión se recupera con `/auth/refresh`.

## Fuera de alcance

MFA, gestión de usuarios por el admin (F02), selector de organización e inicio de sesión con proveedores externos.
