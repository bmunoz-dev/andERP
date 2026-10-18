# F17 — Documento del contrato · Plan

- **Estado:** Borrador (pendiente de aprobación)
- **Spec:** [spec.md](spec.md)

## Datos (una migración generada)

`pnpm db:generate --name contract_documents` crea la tabla `contract_documents`:

- `UNIQUE (organization_id, id)` y la FK compuesta `(organization_id, contract_id)` → `provider_contracts`;
- el índice único `contract_documents_active_uq` sobre `(contract_id) WHERE deleted_at IS NULL` y `UNIQUE (storage_key)`;
- los CHECK `contract_documents_type_ck` (los tres tipos), `contract_documents_size_ck` (`size_bytes BETWEEN 1 AND 10485760`) y `contract_documents_sha256_ck` (`sha256 ~ '^[0-9a-f]{64}$'`).

Los CHECK se registran en `registerConstraintCodes` → `VALIDATION_ERROR`. El índice único no debería saltar nunca, porque el reemplazo bloquea el contrato (ver API); si salta, responde `409 CONFLICT`, el mismo código que usan las otras unicidades.

No hace falta SQL a mano: no hay triggers, vistas ni permisos especiales (`app_runtime` recibe permisos por los privilegios por defecto de `0000`).

**Producción:** la migración solo añade una tabla, así que la API anterior sigue funcionando.

## Almacenamiento

- **Dependencias** (en `apps/api`): `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`. En desarrollo, `@testcontainers/minio`.
- **`apps/api/src/modules/contract-documents/object-storage.ts`:** un `ObjectStorage` inyectable con dos métodos.
  - `put(key, body, { contentType, contentDisposition })` sube el objeto con `PutObject`.
  - `signedUrl(key, ttlSeconds)` firma un `GetObject` con `getSignedUrl`.

  Usa un `S3Client` con `forcePathStyle: true`, que exigen tanto Supabase como MinIO. No hay interfaz ni implementación falsa: las pruebas usan MinIO real.
- **Variables** (`env.ts`): `S3_ENDPOINT` (URL), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`, todas obligatorias. El entorno validado nunca se registra en los logs; se añade `*.secretAccessKey` a `REDACT_PATHS` por si un error del SDK incluye su configuración.
- **URL firmada que el navegador pueda alcanzar:** `S3_ENDPOINT` es la URL pública del almacenamiento, `http://localhost:9000` en local y `https://<ref>.supabase.co/storage/v1/s3` en producción. Así la firma vale para el host que abre el navegador.
- **Local:** `docker-compose.yml` suma `minio` (API en `:9000`, consola en `:9001`) y `minio-init`, que crea el bucket `contract-documents` y termina. Las dos imágenes van con versión fija. `apps/api/.env.example` suma las variables `S3_*`.
- **Pruebas:** `test/setup/global-setup.ts` levanta también un `MinioContainer`, crea el bucket con `CreateBucket` y provee `s3Endpoint`, `s3AccessKeyId` y `s3SecretAccessKey`. `create-test-app.ts` los agrega al entorno. Para comprobar el bucket, las pruebas usan un `S3Client` propio (`ListObjectsV2` y `HeadObject`); el adaptador no necesita esos métodos.

## API (módulo `contract-documents`)

- **`contract-document-rules.ts`** contiene funciones puras con prueba unitaria:
  - `detectDocumentType(bytes, fileName)` devuelve el `content_type`, o `null`, a partir de los primeros bytes y la extensión (CA-4).
  - `contentDisposition(contentType, fileName)` arma `inline` o `attachment` con `filename*=UTF-8''…` y un `filename` ASCII sin `"`, `\`, `/` ni caracteres de control (CA-10).
- **Controlador** (`contract-documents.module.ts`):
  - `POST /contracts/:id/document` con `FileInterceptor('file', { limits: { fileSize: 10 MB, files: 1 } })` y `memoryStorage`. El error `LIMIT_FILE_SIZE` de multer (413) se traduce a `422 DOCUMENT_TOO_LARGE`. Sin campo `file`, o con un archivo vacío, responde `422 VALIDATION_ERROR`.
  - `GET /contracts/:id/document/url`.
  - `DELETE /contracts/:id/document`.
- **Subida en el servicio**, en este orden:
  1. Comprobar el contrato con `OrgScope` (404), antes de tocar el bucket, para no dejar objetos huérfanos por un 404.
  2. Detectar el tipo (422).
  3. Calcular `sha256` con `node:crypto`.
  4. `put` al bucket con la llave `org/{org}/contracts/{contract}/{randomUUID()}`.
  5. Transacción:
     - `SELECT … FOR UPDATE` del contrato;
     - marcar como borrada la fila vigente, si existe;
     - insertar la nueva;
     - auditar `contract_document.upload` o `.replace` (con `before` y `after`: nombre, tamaño y `sha256`) con `AuditService` dentro de la transacción (F12).

  Si la transacción falla, el objeto queda huérfano (CA-7), con un comentario `ponytail:` que lo explica.
- **URL firmada:** con el contrato verificado por `OrgScope` y la fila vigente (404 si no hay), `signedUrl(key, 300)` devuelve `{ url, expiresAt }`.
- **Borrado:** marca la fila como borrada y audita `contract_document.delete`, en la misma transacción. Nunca llama al bucket.
- **Campo `document` del contrato:** en `contractColumns` (`contract-queries.ts`) se agrega como subconsulta `json_build_object(...)` sobre la fila vigente. Así ninguna consulta de contratos necesita otro `JOIN`. El JSON lo convierte `postgres` en un objeto.

## Shared

- `contractDocumentSchema` (`fileName`, `contentType`, `sizeBytes` y `uploadedAt`), `document: contractDocumentSchema.nullable()` en `contractSchema` y `CONTRACT_DOCUMENT_MAX_BYTES` y `CONTRACT_DOCUMENT_EXTENSIONS`, que comparten la API y la web.
- Los códigos `DOCUMENT_TYPE_NOT_ALLOWED` y `DOCUMENT_TOO_LARGE`, con sus mensajes en `error-messages.es.ts`.

## Web

- **`lib/providers-api.ts`:** `uploadContractDocument(id, file)` con `FormData`. `apiFetch` hoy solo envía `json` (su `ApiRequestInit` omite `body`), así que suma una opción `formData` que se envía sin fijar el `Content-Type`: lo pone el navegador con el `boundary`. Así se conserva el reintento con el token renovado, más `contractDocumentUrl(id)` y `deleteContractDocument(id)`.
- **`components/providers/contract-document-cell.tsx`:**
  - un `<input type="file" accept=".pdf,.doc,.docx">` oculto;
  - la validación previa de la extensión y del tamaño (CA-18);
  - las acciones "Subir", "Abrir" (PDF) o "Descargar" (Word), "Reemplazar" y "Eliminar", con `ConfirmDialog` para las dos últimas.
- **"Abrir" y "Descargar":**
  - "Abrir" hace `window.open('', '_blank')` en el clic y le asigna `location` cuando llega la URL; si la petición falla, cierra la pestaña y muestra el error;
  - "Descargar" usa `window.location.assign(url)` (CA-19).
- **`routes/_app/personal/$id.tsx`:** la columna "Documento" usa la celda. Al subir o eliminar se invalida `providerKeys.all`.

## Proxy del Worker

`apps/web/worker/index.ts` ya reenvía el cuerpo como `ArrayBuffer` y el `Content-Type` (con su `boundary`). `worker.test.ts` suma un caso de `multipart` para comprobar que el cuerpo y la cabecera llegan sin cambios (CA-16). El plan gratuito de Cloudflare admite cuerpos de hasta 100 MB.

## Pruebas

- **`test/contract-documents.db.test.ts`:** los CHECK y el índice de un solo archivo vigente.
- **`src/modules/contract-documents/contract-document-rules.test.ts`:** la detección de tipo (PDF, `.docx`, `.doc`, un ejecutable renombrado y un ZIP con extensión `.pdf`) y el `Content-Disposition` con nombres con tildes, comillas y barras.
- **`test/contract-documents.test.ts`** (MinIO real):
  - subir los tres tipos y comprobar que el objeto existe con su `Content-Type` y `Content-Disposition` (`HeadObject`);
  - el error de tipo, el de más de 10 MB, el archivo vacío y la falta del campo;
  - **reemplazar**: hay dos objetos en el bucket y una sola fila vigente;
  - **eliminar**: el objeto sigue en el bucket;
  - la URL firmada (`fetch` devuelve los mismos bytes y las cabeceras guardadas);
  - `document` en el contrato, la auditoría, el aislamiento (`404`) y OpenAPI.
- **`test/audit-atomicity.test.ts`:** subir, reemplazar y eliminar, con la auditoría fallida, no dejan fila.
- **Web:** `contract-document-cell.test.tsx` cubre la validación previa, la confirmación al reemplazar y "Abrir" con la pestaña abierta antes de la respuesta.

## Despliegue (T007, con confirmación del usuario en cada paso)

1. **Supabase**, en *Settings → Storage*: activar la conexión S3 y crear las llaves S3. Las crea el usuario en el panel; las llaves no pasan por el chat.
2. **Supabase:** crear el bucket privado `contract-documents`, sin políticas. Se puede hacer desde el panel, o con SQL sobre `storage.buckets` con confirmación del usuario.
3. **Render:** cargar las cinco variables `S3_*`. Lo hace el usuario, por la misma razón que el paso 1. Tiene que ir **antes** del despliegue: sin ellas, la API nueva no arranca.
4. Merge, pipeline (migración y despliegue) y verificación manual en producción (CA-22).

## Notas de implementación

_(Se completan al implementar.)_
