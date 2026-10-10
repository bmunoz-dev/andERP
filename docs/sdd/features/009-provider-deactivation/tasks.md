# F09 — Desactivar prestadores · Tareas

- **Rama:** `feat/009-provider-deactivation`
- **Plan:** [plan.md](plan.md)

- [x] F09-T001 Columna `is_active` en Drizzle y migración generada.
- [x] F09-T002 [TDD] Pruebas en SQL de los dos triggers y migración escrita a mano.
      Verificación: CA-2, CA-3
- [x] F09-T003 [TDD] API: `isActive` en los esquemas y el servicio, códigos de error y pruebas de API (incluye pagos atrasados y aislamiento).
      Verificación: CA-1–CA-5
- [x] F09-T004 Web: botón, insignias y "Nuevo contrato" oculto. Sin prueba automática (presentación); se verifica a mano en T005.
      Verificación: CA-6
- [x] F09-T005 Antes del merge: aplicar las migraciones en Supabase y verificar producción. Verificación manual del usuario y `roadmap.md`.
