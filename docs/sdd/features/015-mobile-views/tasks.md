# F15 — Vistas para el celular · Tareas

- **Rama:** `feat/015-mobile-views`
- **Plan:** [plan.md](plan.md)

## Bloque A — Tablas

- [x] F15-T001 [TDD] Stub de `matchMedia` en `test/setup.ts`. Escribir `data-table.test.tsx` y después inicializar `useIsMobile` con el ancho de la ventana y agregar las tarjetas a `DataTable`.
      Archivos: `apps/web/src/test/setup.ts`, `apps/web/src/hooks/use-mobile.ts`, `apps/web/src/components/data-table.tsx`, `apps/web/src/components/data-table.test.tsx`
      Verificación: CA-1–CA-5
- [x] F15-T002 [TDD] Caso a 375 px en `agenda.test.tsx`: completar un vencimiento desde su tarjeta.
      Depende de: F15-T001 · Verificación: CA-5, HU1

## Bloque B — Pantallas

- [x] F15-T003 [P] Pestañas de la Agenda con desplazamiento propio, diálogos con alto máximo y desplazamiento interno, y cuadrículas y monto de Clic Kiu.
      Archivos: `apps/web/src/components/obligations/agenda-tabs.tsx`, `apps/web/src/components/ui/dialog.tsx`, `apps/web/src/components/clickiu/summary-cards.tsx`, `apps/web/src/components/clickiu/movement-filters.tsx`
      Verificación: CA-6–CA-9 (visual, en F15-T005)

## Cierre

- [x] F15-T004 Verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`), Definición de Hecho y notas de implementación en `plan.md`.
      Depende de: F15-T002, F15-T003
- [x] F15-T005 Verificación visual a 360–390 px (CA-10): Agenda, notificaciones, Credenciales, Clic Kiu y Egresos. La hace el usuario en el celular, o Claude en el navegador con su autorización. Después, `roadmap.md`.
      Depende de: F15-T004
