# F17 — Documento del contrato · Plan

- **Estado:** Aprobado (2026-10-18)
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

- **Dependencias** (en `apps/api`): `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`. Las pruebas usan `GenericContainer` de `testcontainers` (ya instalado).
- **`apps/api/src/modules/contract-documents/object-storage.ts`:** un `ObjectStorage` inyectable con dos métodos.
  - `put(key, body, contentType)` sube el objeto con `PutObject`.
  - `signedUrl(key, ttlSeconds, contentDisposition)` firma un `GetObject` con `ResponseContentDisposition` usando `getSignedUrl`. Supabase descarta el `Content-Disposition` de `PutObject` y respeta el de la URL firmada (T003).

  Usa un `S3Client` con `forcePathStyle: true`, que exige Supabase. No hay interfaz ni implementación falsa: las pruebas usan un servidor S3 en un contenedor.
- **Variables** (`env.ts`): `S3_ENDPOINT` (URL), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`, todas obligatorias. El entorno validado nunca se registra en los logs; se añade `*.secretAccessKey` a `REDACT_PATHS` por si un error del SDK incluye su configuración.
- **URL firmada que el navegador pueda alcanzar:** `S3_ENDPOINT` es la URL pública del almacenamiento, `http://localhost:9090` en local y `https://<ref>.supabase.co/storage/v1/s3` en producción. Así la firma vale para el host que abre el navegador.
- **Servidor S3 local: `adobe/s3mock:4.7.0`** (decisión del usuario, 2026-10-18). MinIO dejó de publicar imágenes: `minio/minio` responde "denied" en Docker Hub y tampoco están las de `quay.io` ni Bitnami. s3mock guarda y devuelve el `Content-Type` y el `Content-Disposition` y atiende URLs firmadas, pero **no valida la firma ni las llaves**: un error de firma o de configuración solo se ve contra Supabase (T003 y la verificación en producción).
- **Local:** `docker-compose.yml` suma `s3mock` en `:9090`, con el bucket `contract-documents` creado al arrancar (`COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS`). `apps/api/.env.example` suma las variables `S3_*`.
- **Pruebas:** `test/setup/global-setup.ts` levanta también s3mock con `GenericContainer`, crea el bucket con `CreateBucket` y provee `s3Endpoint`, `s3AccessKeyId` y `s3SecretAccessKey`. `create-test-app.ts` los agrega al entorno. Para comprobar el bucket, las pruebas usan un `S3Client` propio (`ListObjectsV2` y `HeadObject`); el adaptador no necesita esos métodos.

## Prueba previa en Supabase Storage (T003, CA-21b)

Antes de escribir la API se confirma en el proyecto real lo que el diseño supone:

1. El usuario activa la conexión S3 en *Settings → Storage*, crea el bucket privado `contract-documents` y genera un par de llaves S3.
2. El usuario guarda las llaves en `apps/api/.env.storage` (lo ignora `.gitignore` por `.env.*`). Las llaves no pasan por el chat.
3. Un script desechable, que no se commitea, lee ese archivo y hace cuatro cosas:
   - sube un PDF con `ContentType: application/pdf` y `ContentDisposition: inline; filename*=UTF-8''Contrataci%C3%B3n.pdf`;
   - firma un `GetObject` de 5 minutos;
   - descarga la URL con `fetch`;
   - imprime el estado, `content-type`, `content-disposition` y si los bytes coinciden.

   Repite lo mismo con un `.docx` en `attachment`.
4. **Si las cabeceras no vuelven como se guardaron, o la URL no abre, la feature se detiene** y se ajusta el diseño. Los objetos de prueba quedan con el prefijo `spike/` (nunca se borra nada del bucket).

## API (módulo `contract-documents`)

- **`contract-document-rules.ts`** contiene funciones puras con prueba unitaria:
  - `detectDocumentType(bytes, fileName)` devuelve el `content_type`, o `null`, a partir de los primeros bytes y la extensión (CA-4).
  - `contentDisposition(contentType, fileName)` arma `inline` o `attachment` con `filename*=UTF-8''…` y un `filename` ASCII sin `"`, `\`, `/` ni caracteres de control (CA-10).
- **Nombre del archivo (CA-4b):** multer entrega `originalname` decodificado como latin1. Se corrige con `Buffer.from(originalname, 'latin1').toString('utf8')`, se toma el nombre base (lo que sigue a la última `/` o `\`) y se rechaza si queda vacío o pasa de 255 caracteres. Va en `contract-document-rules.ts`, con su prueba ("Contratación.pdf" y `C:\fakepath\x.pdf`).
- **Controlador** (`contract-documents.module.ts`):
  - `POST /contracts/:id/document` con `FileInterceptor('file', { limits: { fileSize: 10 MB, files: 1 } })` y `memoryStorage`. El error `LIMIT_FILE_SIZE` de multer (413) se traduce a `422 DOCUMENT_TOO_LARGE`. Sin campo `file`, o con un archivo vacío, responde `422 VALIDATION_ERROR`.
  - `GET /contracts/:id/document/url`.
  - `DELETE /contracts/:id/document`.
- **Subida en el servicio**, en este orden:
  1. Comprobar el contrato con `OrgScope` (404, también si está borrado), antes de tocar el bucket, para no dejar objetos huérfanos por un 404. No se mira si la persona está activa (CA-6b).
  2. **Límite de subidas (CA-6c):** contar las filas de `contract_documents` con `created_by` = usuario y `created_at` de la última hora, incluidas las borradas. Si hay 20 o más, `429 TOO_MANY_REQUESTS`. Se cuenta en la base de datos y no con `@nestjs/throttler`: es por usuario y no por IP, sobrevive a un reinicio de Render y no toca la configuración del throttler de login. Dos subidas simultáneas pueden pasar el límite por una (`ponytail:`, se acepta).
  3. Detectar el tipo (422).
  4. Calcular `sha256` con `node:crypto`.
  5. `put` al bucket con la llave `org/{org}/contracts/{contract}/{randomUUID()}`.
  6. Transacción:
     - `SELECT … FOR UPDATE` del contrato;
     - marcar como borrada la fila vigente, si existe;
     - insertar la nueva;
     - auditar `contract_document.upload` o `.replace` (con `before` y `after`: nombre, tamaño y `sha256`) con `AuditService` dentro de la transacción (F12).

  Si la transacción falla, el objeto queda huérfano (CA-7), con un comentario `ponytail:` que lo explica.
- **URL firmada:** con el contrato verificado por `OrgScope` y la fila vigente (404 si no hay), `signedUrl(key, 300, contentDisposition(contentType, fileName))` devuelve `{ url, expiresAt }`.
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
  - "Abrir" hace `window.open('', '_blank')` en el clic, pone `tab.opener = null` y le asigna `location` cuando llega la URL; si la petición falla, cierra la pestaña y muestra el error (CA-19);
  - "Descargar" pide la URL y la asigna a un `<iframe>` oculto que se quita al rato; si la petición falla, muestra el error y la página no se mueve (CA-19b).
- **`routes/_app/personal/$id.tsx`:** la columna "Documento" usa la celda. Al subir o eliminar se invalida `providerKeys.all`.

## Proxy del Worker

`apps/web/worker/index.ts` reenvía hoy el cuerpo con `await request.arrayBuffer()`, que carga el archivo entero en memoria y gasta CPU, limitada en el plan gratuito de Workers. Pasa a `body: request.body` (stream), con `duplex: 'half'` si el tipo lo pide. `worker.test.ts` suma un caso de `multipart` que comprueba que el cuerpo y el `Content-Type` (con su `boundary`) llegan sin cambios (CA-16). El plan gratuito admite cuerpos de hasta 100 MB. La subida de 10 MB se prueba en producción (CA-22).

## Pruebas

- **`test/contract-documents.db.test.ts`:** los CHECK y el índice de un solo archivo vigente.
- **`src/modules/contract-documents/contract-document-rules.test.ts`:**
  - la detección de tipo: PDF, `.docx` y `.doc`, extensión en mayúsculas, un ejecutable renombrado, un ZIP con extensión `.pdf` y un PDF con extensión `.docx`;
  - el nombre: latin1 → UTF-8, nombre base sin ruta, vacío y más de 255 caracteres;
  - el `Content-Disposition` con nombres con tildes, comillas y barras.
- **`test/contract-documents.test.ts`** (s3mock en un contenedor):
  - subir los tres tipos y comprobar que el objeto existe con su `Content-Type` (`HeadObject`);
  - el error de tipo, el de más de 10 MB, el archivo vacío y la falta del campo;
  - "Contratación.pdf" subido con su tilde vuelve igual en `document.fileName` y en el `Content-Disposition` de la URL firmada;
  - un contrato borrado (`404`), el contrato de una persona inactiva (se acepta) y la subida 21 de la hora (`429`);
  - **reemplazar**: hay dos objetos en el bucket y una sola fila vigente;
  - **eliminar**: el objeto sigue en el bucket;
  - la URL firmada (`fetch` devuelve los mismos bytes y las cabeceras guardadas);
  - `document` en el contrato, la auditoría, el aislamiento (`404`) y OpenAPI.
- **`test/audit-atomicity.test.ts`:** subir, reemplazar y eliminar, con la auditoría fallida, no dejan fila.
- **Web:** `contract-document-cell.test.tsx` cubre la validación previa, la confirmación al reemplazar, "Abrir" (la pestaña se abre antes de la respuesta y queda con `opener = null`) y "Descargar" (un `<iframe>` con la URL, sin mover la página).

## Despliegue (T008, con confirmación del usuario en cada paso)

1. La conexión S3, el bucket y las llaves ya existen desde la prueba previa (T003). Se revisa que el bucket siga privado y sin políticas.
2. **Render:** cargar las cinco variables `S3_*`. Lo hace el usuario, por la misma razón que el paso 1. Tiene que ir **antes** del despliegue: sin ellas, la API nueva no arranca.
3. Merge, pipeline (migración y despliegue) y verificación manual en producción (CA-22), incluida una subida de 10 MB.

## Operación

- **Recuperar un archivo reemplazado o eliminado:**
  1. En Supabase (*SQL Editor*): `select storage_key, file_name, deleted_at from anderp.contract_documents where contract_id = '<id>' order by created_at desc;`
  2. En *Storage → contract-documents*, abrir la ruta `storage_key` y descargar el objeto.
  3. Para volver a dejarlo vigente, subirlo de nuevo desde la app (queda auditado).
- **Uso del bucket:** revisar el tamaño en *Settings → Usage* de Supabase. El límite gratuito es 1 GB y, al pasarlo, se restringe todo el proyecto.
- **Rotar las llaves S3 (CA-15b):** crear un par nuevo en *Settings → Storage → S3 Access Keys*, actualizar las variables en Render, esperar el despliegue y revocar el par anterior.

## Notas de implementación

- **T002 — s3mock:** se verificó con Testcontainers que `COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS` crea el bucket al arrancar (la usa `docker-compose.yml`); en las pruebas se crea con `CreateBucket`. La prueba del adaptador comprueba que la URL firmada devuelve los bytes, el `Content-Type` guardado y el `Content-Disposition` pedido al firmar.
- **Entorno local:** las variables `S3_*` son obligatorias, así que `apps/api/.env` necesita las de `.env.example` para que `pnpm dev` arranque.
- **T003 — Prueba en Supabase Storage (2026-10-18):** con el bucket privado `contract-documents` y llaves S3 creadas por el usuario. Resultado: la URL firmada abre el objeto (200, mismos bytes), devuelve el `Content-Type` guardado y sin firma responde 403. **No** devuelve el `Content-Disposition` enviado en `PutObject`: Supabase lo descarta (en `storage.objects.metadata` solo quedan `mimetype` y `cacheControl`) y `HeadObject` tampoco lo trae. En cambio, `ResponseContentDisposition` en la URL firmada **sí** funciona, aunque la tabla de compatibilidad no lo menciona. Se cambió el diseño: la disposición se fija al firmar. Quedaron dos objetos de prueba con el prefijo `spike/` (22 y 15 bytes). Los scripts no se commitearon y se borraron.
- **T005 — Subida:**
  - Multer guarda en memoria por defecto (sin `storage` ni `dest`), así que no hizo falta depender de `multer` ni de `@types/multer`; el servicio usa un tipo propio con `originalname`, `buffer` y `size`.
  - `DocumentUploadInterceptor` extiende `FileInterceptor` y traduce su `PayloadTooLargeException` a `422 DOCUMENT_TOO_LARGE`.
  - La prueba con "Contratación firmada.pdf" confirma que multer 2.4 entrega el nombre en latin1 y que `normalizeFileName` lo corrige.
  - Las pruebas de la API se escribieron y se vieron fallar (404) antes del controlador. Las de auditoría atómica se agregaron después del servicio y pasaron al primer intento.
- **T006:** el campo `document` sale de `json_build_object` en `contractColumns`, así que llega también en el contrato vigente de la persona sin tocar sus consultas. Su `uploadedAt` viene en el formato JSON de Postgres (con zona horaria), no en el ISO con `Z` de la respuesta de subida; los dos son fechas válidas para la web.
