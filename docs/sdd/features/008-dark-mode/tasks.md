# F08 — Modo oscuro · Tareas

- **Rama:** `feat/008-dark-mode`
- **Plan:** [plan.md](plan.md)

- [x] F08-T001 [TDD] Crear `lib/theme.ts`: elección por defecto Sistema, guardar y recordar, clase `.dark` y `color-scheme`, cambio en vivo del sistema, almacenamiento no disponible.
      Verificación: CA-1, CA-3
- [x] F08-T002 Llamar a `initTheme()` en `main.tsx` antes de pintar.
      Depende de: F08-T001 · Verificación: CA-4
- [x] F08-T003 Submenú Tema en `UserMenu` y `Toaster` según la elección. Sin prueba automática: el submenú de Radix es frágil en jsdom y la lógica está cubierta en T001; se verifica en T004.
      Depende de: F08-T001 · Verificación: CA-2, CA-5
- [x] F08-T004 Verificación manual en el navegador (con autorización): sin parpadeo, login, matriz, honorarios y credenciales en oscuro; contraste AA. Actualizar `design.md` y `roadmap.md`.
      Verificación: CA-4–CA-6
