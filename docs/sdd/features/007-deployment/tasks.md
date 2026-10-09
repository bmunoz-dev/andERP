# F07 — Despliegue y endurecimiento · Tareas

- **Rama:** `feat/007-deployment`
- **Plan:** [plan.md](plan.md)

## Bloque A — Endurecimiento de la API

- [x] F07-T001 [TDD] Crear `ProxySecretGuard` (comparación en tiempo constante, `/health` excluido) y el middleware de `X-Client-IP`. Pruebas: sin secreto → 403; con secreto → pasa; la IP llega a la auditoría y al throttler.
      Verificación: CA-8
- [x] F07-T002 Añadir `helmet`, desactivar Swagger en producción (ya estaba) y exigir `PROXY_SECRET` en la validación del entorno de producción.
      Depende de: F07-T001 · Verificación: CA-9
- [x] F07-T003 Crear el `Dockerfile` multi-etapa y `.dockerignore`. Verificar en local con `docker build` + `docker run` contra el Postgres de Docker.
      Verificación: CA-6

## Bloque B — Web

- [x] F07-T004 [TDD] Crear el proxy de `/api/*` (Worker `worker/index.ts`; era una Pages Function), con pruebas unitarias del reenvío de cabeceras, cuerpo y `Set-Cookie`.
      Verificación: CA-10
- [x] F07-T005 Crear `public/_headers` con CSP y cabeceras de seguridad. Verificar que la app funciona sin errores de CSP en la consola.
      Verificación: CA-11

## Bloque C — Infraestructura (manual y documentada)

- [ ] F07-T006 Crear el proyecto de Supabase en `sa-east-1` con plan de pago, desactivar la Data API y crear `app_runtime` con `bootstrap.sql` (contraseña robusta y `search_path = anderp`). Comprobar con la llave `anon` que no se obtienen datos.
      Verificación: CA-1–CA-3, CA-5
- [ ] F07-T007 Configurar la conexión por Supavisor en modo sesión con `app_runtime` y ejecutar `db:migrate` + `db:seed` desde un equipo local por primera vez.
      Depende de: F07-T006 · Verificación: CA-4
- [ ] F07-T008 Crear el servicio web en Render (Docker, plan de pago, health check, secretos) y obtener el deploy hook.
      Depende de: F07-T003, F07-T007 · Verificación: CA-7
- [ ] F07-T009 Crear el Worker en Cloudflare (Workers Builds desde git, build de `apps/web`, variables `API_ORIGIN` y `PROXY_SECRET`).
      Depende de: F07-T004, F07-T008
- [ ] F07-T010 Configurar el proveedor SMTP y verificar que llega un correo real de recuperación de contraseña.
      Depende de: F07-T008

## Bloque D — Pipeline

- [x] F07-T011 Crear `.github/workflows/deploy.yml`: CI → aprobación del environment `production` → `db:migrate` → deploy hook de Render → espera del health check.
      Depende de: F07-T008 · Verificación: CA-13, CA-14
- [ ] F07-T012 Probar el pipeline con una migración deliberadamente rota en una rama de prueba, y comprobar que la API no se despliega.
      Depende de: F07-T011 · Verificación: CA-14

## Bloque E — E2E y runbooks

- [ ] F07-T013 Crear el paquete `e2e/` con Playwright y los flujos de humo de CA-15, ejecutables contra local (`BASE_URL`).
      Estado: escrito y compila; falta la primera ejecución (abre un navegador: requiere autorización del usuario).
      Verificación: CA-15
- [x] F07-T014 [P] Escribir los runbooks 01–06 en `docs/runbooks/`.
      Verificación: CA-16
- [ ] F07-T015 Ensayar la restauración: restaurar un backup de producción en un proyecto temporal siguiendo el runbook 03, y anotar el tiempo que tomó.
      Depende de: F07-T014

## Cierre

- [ ] F07-T016 Verificación del hito M4: flujo de humo completo en producción (a mano o con Playwright apuntando a producción usando una organización de prueba), sesión que se conserva al recargar, cabeceras verificadas con securityheaders.com y llave `anon` sin acceso. Revisar la Definición de Hecho y actualizar `roadmap.md`.
