# F11 — Saldo de Clic Kiu · Tareas

- **Rama:** `feat/011-clickiu-balance`
- **Plan:** [plan.md](plan.md)

## Bloque A — Base de datos

- [x] F11-T001 [TDD] Escribir `clickiu.db.test.ts` y después crear `0020_clickiu_movements` y `0021_clickiu_rules` con el esquema de Drizzle (`db/schema/clickiu.ts`). Pruebas:
      - CHECK de estado (venta sin estado, recarga con estado) y de monto;
      - tipo inmutable;
      - `v_clickiu_balance` no cuenta borrados;
      - saldo negativo rechazado al crear o subir una venta, bajar una recarga y borrarla; venta igual al saldo aceptada;
      - dos ventas simultáneas que juntas superan el saldo: solo una confirma;
      - `app_runtime` puede leer la vista.
      Archivos: `apps/api/drizzle/0020_*.sql`, `apps/api/drizzle/0021_*.sql`, `apps/api/src/db/schema/clickiu.ts`
      Verificación: CA-2, CA-3, CA-5–CA-9

## Bloque B — Compartido

- [x] F11-T002 [P] Esquemas Zod en `packages/shared/src/schemas/clickiu.ts` (con pruebas de `description` vacía → `null` y `from > to`) y los tres códigos de error con su mensaje en español.
      Archivos: `packages/shared/src/schemas/clickiu.ts`, `packages/shared/src/errors/codes.ts`, `apps/web/src/lib/error-messages.es.ts`
      Verificación: CA-1, CA-10

## Bloque C — API

- [x] F11-T003 [TDD] Escribir `clickiu.test.ts` y después crear el módulo `clickiu` (servicio, controlador y registro del CHECK): CRUD, cambio de estado, auditoría, errores con su `code`, filtros (bordes, combinados, mes por defecto, `from > to`) y `summary`.
      Depende de: F11-T001, F11-T002 · Verificación: CA-1–CA-14
- [x] F11-T004 Pruebas de aislamiento con `seedTwoOrgs()`: A no lista, lee, edita ni borra lo de B, y los movimientos de B no cambian el `summary` de A.
      Depende de: F11-T003 · Verificación: CA-15

## Bloque D — Web

- [x] F11-T005 [TDD] `movement-form-dialog.tsx` y las funciones de crear y editar de `clickiu-api.ts`: estado solo en ventas, Crédito por defecto, tipo fijo en el título, aviso de saldo (también al editar una venta) y el mensaje de `CLICKIU_INSUFFICIENT_BALANCE`.
      Depende de: F11-T002 · Verificación: CA-20
- [ ] F11-T006 [TDD] Página `/clic-kiu` y `clickiu-api.ts`: tarjetas, filtros en la URL (Estado solo con Venta), tabla, botones "Nueva recarga" y "Nueva venta", "Marcar como completado" y borrar con confirmación. Agregar "Clic Kiu" al menú.
      Depende de: F11-T003, F11-T005 · Verificación: CA-16–CA-19

## Cierre

- [ ] F11-T007 Verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`), endpoints en OpenAPI, Definición de Hecho y notas de implementación en `plan.md`.
      Depende de: F11-T004, F11-T006
- [ ] F11-T008 Verificación manual del usuario (recargar, vender a crédito, marcar como completada, intentar vender sin saldo, filtros y tarjetas) y `roadmap.md`.
      Depende de: F11-T007
