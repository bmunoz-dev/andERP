# F17 — Documento del contrato · Tareas

- **Rama:** `feat/017-contract-documents`
- **Plan:** [plan.md](plan.md)

- [ ] F17-T001 [TDD] Migración de `contract_documents` (CHECK, índice de un archivo vigente y FK compuesta) y Drizzle. Pruebas en SQL.
      Verificación: CA-1
- [ ] F17-T002 [TDD] Almacenamiento: dependencias S3, `ObjectStorage` (`put` y `signedUrl`), variables `S3_*` con su validación y redacción, MinIO en `docker-compose` y en Testcontainers.
      Depende de: F17-T001 · Verificación: CA-15
- [ ] F17-T003 [TDD] Reglas puras: detección de tipo y `Content-Disposition`. Shared: esquema del documento, límites y códigos de error con sus mensajes.
      Verificación: CA-4, CA-10, CA-20
- [ ] F17-T004 [TDD] API de subida y reemplazo: multer con límite, orden comprobar → subir → transacción con bloqueo, auditoría atómica.
      Depende de: F17-T002, F17-T003 · Verificación: CA-2–CA-7, CA-12
- [ ] F17-T005 [TDD] API de URL firmada y borrado, campo `document` en el contrato, aislamiento y OpenAPI.
      Depende de: F17-T004 · Verificación: CA-8, CA-9, CA-11–CA-14
- [ ] F17-T006 [TDD] Web: columna "Documento" con sus acciones y validación previa; prueba de `multipart` en el proxy del Worker.
      Depende de: F17-T005 · Verificación: CA-16–CA-19, CA-21
- [ ] F17-T007 Despliegue: conexión S3, llaves y bucket privado en Supabase, y variables en Render (con confirmación del usuario).
      Depende de: F17-T006 · Verificación: CA-15, CA-22 (producción)
- [ ] F17-T008 Notas de implementación, Definición de Hecho, verificación completa, verificación manual del usuario y `roadmap.md`.
      Depende de: F17-T007 · Verificación: CA-22
