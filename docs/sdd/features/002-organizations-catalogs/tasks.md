# F02 — Organizaciones, catálogos y usuarios · Tareas

- **Rama:** `feat/002-organizations-catalogs`
- **Plan:** [plan.md](plan.md)

## Bloque A — Datos

- [ ] F02-T001 Definir en Drizzle los catálogos y `expense_categories`, generar `0003_catalogs` y revisarla (índices parciales y `UNIQUE (organization_id, id)`).
- [ ] F02-T002 [TDD] Escribir la prueba de integración del trigger de protección de categorías de sistema (UPDATE de nombre, `is_active`, `deleted_at` y DELETE) y después crear `0004_expense_categories_guard`.
      Depende de: F02-T001 · Verificación: CA-10
- [ ] F02-T003 Extraer las categorías iniciales a `default-categories.ts` y ampliar el seed con catálogos globales y categorías de la organización inicial, manteniéndolo idempotente.
      Depende de: F02-T001 · Verificación: CA-6

## Bloque B — Infraestructura común

- [ ] F02-T004 [TDD] Crear `OrgScopedRepository` y el repositorio base de catálogos globales. Pruebas: el scope se aplica en select, update y softDelete; la auditoría se llena sola; sin organización en el contexto se lanza un error.
      Depende de: F02-T001 · Verificación: CA-17
- [ ] F02-T005 [P] Crear el helper de pruebas de API `seedTwoOrgs()`, que devuelve los tokens de un admin de A, un admin de B y el super admin. Lo reutilizan F03–F06.
      Depende de: F02-T004

## Bloque C — Catálogos

- [ ] F02-T006 [P] Crear las lecturas `GET /catalogs/*` con `includeInactive`, y el CRUD `/platform/catalogs/*` con `DUPLICATE_NAME`.
      Depende de: F02-T004 · Verificación: CA-4, CA-5
- [ ] F02-T007 [P] Crear el CRUD de `/expense-categories` y el endpoint de reordenamiento.
      Depende de: F02-T004 · Verificación: CA-7–CA-9

## Bloque D — Organizaciones y miembros

- [ ] F02-T008 [TDD] Crear la organización en una transacción: categorías iniciales, admin nuevo o existente, membresía e invitación. Si la invitación falla, se revierte todo.
      Depende de: F02-T003, F02-T006 · Verificación: CA-1
- [ ] F02-T009 Crear `PATCH` de organización con suspensión (revoca sesiones) y reactivación.
      Depende de: F02-T008 · Verificación: CA-2
- [ ] F02-T010 Ampliar el caso de uso `reset-password` para aceptar `purpose = 'invite'` y crear la plantilla del correo de invitación.
      Depende de: F01 · Verificación: CA-12
- [ ] F02-T011 [TDD] Crear el servicio de miembros: invitar (`ALREADY_MEMBER`), reenviar invitación (invalida las anteriores), activar/desactivar (`CANNOT_DEACTIVATE_SELF`, `LAST_ADMIN` y revocación de sesiones) y listar con la invitación pendiente.
      Depende de: F02-T010 · Verificación: CA-11, CA-13–CA-15
- [ ] F02-T012 Añadir los códigos de error `TAX_ID_TAKEN`, `DUPLICATE_NAME`, `SYSTEM_CATEGORY_PROTECTED`, `ALREADY_MEMBER`, `CANNOT_DEACTIVATE_SELF` y `LAST_ADMIN`, con sus mensajes en español.

## Bloque E — Pruebas de API

- [ ] F02-T013 Pruebas de API de CA-1 a CA-15.
      Depende de: F02-T006–F02-T012
- [ ] F02-T014 Pruebas de aislamiento con `seedTwoOrgs()` en categorías y miembros, y de admin contra `/platform/*`.
      Depende de: F02-T013 · Verificación: CA-3, CA-16

## Bloque F — Web

- [ ] F02-T015 Crear el layout `_app` con sidebar según el rol, header y páginas "Próximamente".
      Depende de: F01-T023 · Verificación: CA-18
- [ ] F02-T016 Crear los componentes reutilizables `DataTable` y `FormDialog`.
      Depende de: F02-T015
- [ ] F02-T017 [P] Crear la pantalla de categorías: CRUD, reordenamiento con dnd-kit y candado en las de sistema.
      Depende de: F02-T016
- [ ] F02-T018 [P] Crear la pantalla de usuarios (invitar, reenviar invitación, activar/desactivar) y la ruta pública `/activar`.
      Depende de: F02-T016
- [ ] F02-T019 [P] Crear las pantallas de plataforma: organizaciones y catálogos con pestañas.
      Depende de: F02-T016 · Verificación: CA-19

## Cierre

- [ ] F02-T020 Verificación manual del hito M2: crear una segunda organización, activar a su admin con el correo en Mailpit, comprobar que no ve datos de la primera, y probar el reordenamiento y la protección de categorías. Revisar la Definición de Hecho y actualizar `roadmap.md`.
