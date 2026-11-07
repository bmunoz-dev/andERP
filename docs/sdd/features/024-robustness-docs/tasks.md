# F24 — Robustez y documentación al día · Tareas

- **Rama:** `feat/024-robustness-docs` (después de F21)
- **Plan:** [plan.md](plan.md)

## Bloque A — Diseño y specs

- [x] F24-T001 `design.md` §5.5 (riesgo aceptado de pagos fijos duplicados) e historial. Notas fechadas en las specs de F04, F16 y F02, y la nota al principio del informe de revisión.
      Archivos: `docs/sdd/design.md`, `docs/sdd/features/{002,004,016}-*/spec.md`, `docs/reviews/2026-11-06-revision-modulos.md`
      Verificación: CA-11, CA-12

## Bloque B — API y compartido

- [x] F24-T002 [TDD] Timeouts SMTP.
      Archivos: `apps/api/src/modules/mail/mailer.ts`, `apps/api/test/mail.test.ts`
      Verificación: CA-1
- [x] F24-T003 [TDD] `ParseUUIDPipe` en `categoryId`, con el caso vacío (punto de revisión 2).
      Archivos: `apps/api/src/modules/expenses/expenses.module.ts`, `apps/api/test/expenses.test.ts`
      Verificación: CA-2
- [ ] F24-T004 [TDD] `ACCOUNT_NUMBER_PATTERN`, `isBankAccountComplete` e `isContractEndValid` en shared. El servicio de prestadores usa `isBankAccountComplete`.
      Archivos: `packages/shared/src/schemas/service-providers{,.test}.ts`, `apps/api/src/modules/service-providers/service-providers.service.ts`
      Verificación: CA-4

## Bloque C — Web

- [ ] F24-T005 [TDD] `DataTable` con `error` (y el punto de revisión 1), y su uso en las nueve pantallas.
      Archivos: `apps/web/src/components/data-table{,.test}.tsx` y las pantallas listadas en el plan
      Verificación: CA-3
- [ ] F24-T006 [TDD] Formularios de prestador y contrato con los helpers de shared, y prueba del de prestador.
      Archivos: `apps/web/src/components/providers/{provider-form-dialog,provider-form-dialog.test,contract-form-dialog}.tsx`
      Depende de: F24-T004 · Verificación: CA-4
- [ ] F24-T007 [TDD] Enlace de credencial (`isWebUrl`) y `url` estricto en el schema de respuesta. Prueba del formulario de credencial sin contraseña.
      Archivos: `apps/web/src/lib/format{,.test}.ts`, `apps/web/src/routes/_app/credenciales.tsx`, `packages/shared/src/schemas/credentials.ts`, la prueba del formulario
      Verificación: CA-6, CA-9
- [ ] F24-T008 Cambios sin lógica nueva:
      - invalidaciones de caché;
      - `timeZone` en las fechas;
      - `refreshSession()` al guardar una organización;
      - comentario de `_headers`.
      Archivos: `responsables.tsx`, `configuracion/categorias.tsx`, `personal/$id.tsx`, `configuracion/usuarios.tsx`, `plataforma/organizaciones.tsx`, `apps/web/public/_headers`
      Verificación: CA-5, CA-7, CA-8, CA-10

## Bloque D — Cierre

- [ ] F24-T009 Cierre:
      - verificación completa;
      - notas de implementación;
      - F24 marcada "Hecho" en el roadmap;
      - PR. Lo mergea el usuario.
      Depende de: F24-T001 a F24-T008 · Verificación: CA-13
