# F17 — Documento del contrato · Tareas

- **Rama:** `feat/017-contract-documents`
- **Plan:** [plan.md](plan.md)

- [x] F17-T001 [TDD] Migración de `contract_documents` (CHECK, índice de un archivo vigente y FK compuesta) y Drizzle. Pruebas en SQL.
      Verificación: CA-1
- [x] F17-T002 [TDD] Almacenamiento: dependencias S3, `ObjectStorage` (`put` y `signedUrl`), variables `S3_*` con su validación y redacción, s3mock en `docker-compose` y en Testcontainers (MinIO ya no publica imágenes).
      Depende de: F17-T001 · Verificación: CA-15
- [x] F17-T003 Prueba previa en Supabase Storage: conexión S3, bucket privado y llaves (las crea el usuario), script desechable que sube, firma y lee un PDF y un `.docx`. Si las cabeceras no vuelven como se guardaron, se detiene la feature.
      Depende de: F17-T002 · Verificación: CA-21b
- [x] F17-T004 [TDD] Reglas puras: detección de tipo con extensión, nombre (latin1 → UTF-8, nombre base, longitud) y `Content-Disposition`. Shared: esquema del documento, límites y códigos de error con sus mensajes.
      Verificación: CA-4, CA-4b, CA-10, CA-20
- [x] F17-T005 [TDD] API de subida y reemplazo: multer con límite, orden comprobar → límite por hora → tipo → subir → transacción con bloqueo, auditoría atómica.
      Depende de: F17-T003, F17-T004 · Verificación: CA-2–CA-7, CA-12
- [x] F17-T006 [TDD] API de URL firmada y borrado, campo `document` en el contrato, aislamiento y OpenAPI.
      Depende de: F17-T005 · Verificación: CA-8, CA-9, CA-11–CA-14
- [x] F17-T007 [TDD] Web: columna "Documento" con sus acciones (`opener = null`, descarga por `<iframe>`) y validación previa. Worker: cuerpo como stream y prueba de `multipart`.
      Depende de: F17-T006 · Verificación: CA-16–CA-19b, CA-21
- [ ] F17-T008 Despliegue: revisar que el bucket siga privado, cargar las variables en Render (el usuario), merge y pipeline.
      Depende de: F17-T007 · Verificación: CA-15, CA-15b
- [ ] F17-T009 Notas de implementación, Definición de Hecho, verificación completa, verificación manual en local y en producción (incluida una subida de 10 MB) y `roadmap.md`.
      Depende de: F17-T008 · Verificación: CA-22
