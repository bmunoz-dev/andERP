# F17 — Documento del contrato · Spec

- **Estado:** Borrador (pendiente de aprobación)
- **Diseño:** `design.md` §2 (decisión 18), §3 (glosario), §5.13 (`contract_documents`), §6.5 (almacenamiento de archivos), §10 y §11
- **Depende de:** F03 (contratos), F12 (auditoría atómica), F15 (tablas como tarjetas en el celular)

## Objetivo

Guardar el archivo de cada contrato (PDF o Word) y poder abrirlo o descargarlo desde la ficha de la persona. Los archivos van en un bucket **privado** de Supabase Storage y se leen solo con una **URL firmada** de corta duración que genera la API.

Un contrato tiene **un solo archivo vigente**. Reemplazarlo o eliminarlo nunca borra el objeto del bucket: solo se marca como borrado en la base de datos, así que un error se puede recuperar a mano.

**Riesgo aceptado por el usuario (2026-10-18):** los archivos no tienen respaldo. Supabase Free no hace backups y el respaldo de F07 (`pg_dump`) no cubre Storage. Lo acota que nunca se borren objetos del bucket.

## Historias

- **HU1.** Como admin, quiero subir el contrato firmado (PDF o Word) a su contrato.
- **HU2.** Como admin, quiero ver el PDF en el navegador o descargar el archivo con su nombre original.
- **HU3.** Como admin, quiero reemplazar el archivo por una versión corregida o eliminarlo, con confirmación.

## Criterios de aceptación

**Datos**

- **CA-1.** Tabla `contract_documents`: `contract_id` (FK compuesta al contrato), `storage_key` (único), `file_name`, `content_type`, `size_bytes`, `sha256`, auditoría y borrado lógico.
  - Un solo archivo vigente por contrato: índice único `(contract_id) WHERE deleted_at IS NULL`.
  - CHECK de tipo: `application/pdf`, `application/msword` o `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
  - CHECK de tamaño: de 1 byte a 10 MB (10 485 760 bytes).
  - CHECK de hash: `sha256` con 64 caracteres hexadecimales.
- **CA-2.** La ruta del objeto es `org/{organizationId}/contracts/{contractId}/{uuid}`. El nombre original no forma parte de la ruta.

**Subir y reemplazar**

- **CA-3.** `POST /contracts/:id/document` recibe un `multipart/form-data` con el campo `file`. Sube el archivo y responde `201` con `{ fileName, contentType, sizeBytes, uploadedAt }`.
- **CA-4.** El tipo se decide por los primeros bytes del archivo y por su extensión, nunca por el `Content-Type` que envía el navegador:
  - un PDF empieza por `%PDF-`;
  - un `.docx` tiene la firma ZIP (`PK\x03\x04`) y la extensión `.docx`;
  - un `.doc` tiene la firma OLE (`D0 CF 11 E0 A1 B1 1A E1`) y la extensión `.doc`.

  Cualquier otra combinación responde `422 DOCUMENT_TYPE_NOT_ALLOWED`. No se inspecciona el interior del ZIP: un ZIP cualquiera renombrado a `.docx` pasa la validación (límite aceptado; el archivo solo se descarga, nunca se ejecuta ni se procesa en el servidor). Un archivo vacío o la falta del campo `file` responden `422 VALIDATION_ERROR`.
- **CA-5.** Un archivo de más de 10 MB responde `422 DOCUMENT_TOO_LARGE`, sin subir nada al bucket.
- **CA-6.** Si el contrato ya tiene archivo, se reemplaza. En una transacción que bloquea la fila del contrato, la fila anterior se marca como borrada y se inserta la nueva. El objeto anterior **sigue en el bucket**.
- **CA-7.** El objeto se sube al bucket antes de la transacción. Si la transacción falla, el objeto queda huérfano en el bucket y no se registra nada en la base de datos.

**Ver, descargar y eliminar**

- **CA-8.** Las respuestas de contratos (`GET /service-providers/:id/contracts` y el contrato vigente de la persona) incluyen `document`: `null` o `{ fileName, contentType, sizeBytes, uploadedAt }`.
- **CA-9.** `GET /contracts/:id/document/url?mode=view|download` devuelve `{ url, expiresAt }`: una URL firmada válida por **5 minutos**.
  - Con `download`, el archivo se descarga con su nombre original (`Content-Disposition: attachment`).
  - Con `view`, un PDF se abre en el navegador (`inline`). `view` sobre un Word responde `422 DOCUMENT_TYPE_NOT_ALLOWED`.
  - En los dos casos, el `Content-Type` es el guardado.
  - Si el contrato no tiene archivo, responde `404`.
- **CA-10.** En el `Content-Disposition`, el nombre del archivo se escribe con `filename*` (RFC 5987) y con un `filename` alternativo sin comillas, barras ni caracteres de control.
- **CA-11.** `DELETE /contracts/:id/document` hace un borrado lógico (`204`). El objeto sigue en el bucket. Si no hay archivo, responde `404`.
- **CA-12.** Subir, reemplazar y eliminar generan `audit_logs` (`contract_document.upload`, `contract_document.replace` y `contract_document.delete`) en la misma transacción que el cambio (F12), con el nombre, el tamaño y el `sha256`. Ver y descargar no se auditan.
- **CA-13.** Borrar un contrato que tiene archivo sigue permitido. El archivo queda ligado al contrato borrado y deja de verse.

**Aislamiento y seguridad**

- **CA-14.** Un admin de otra organización recibe `404` al subir, pedir la URL o eliminar el archivo de un contrato ajeno.
- **CA-15.** Las llaves S3 (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`) son obligatorias al arrancar la API, nunca llegan a la web y no aparecen en logs ni en respuestas. El bucket es privado y no tiene políticas para `anon` ni `authenticated`.
- **CA-16.** El proxy del Worker reenvía el `multipart` a la API sin alterarlo.

**Web**

- **CA-17.** La tabla de contratos de la ficha de la persona tiene la columna "Documento":
  - sin archivo, un botón **"Subir"** que abre el selector de archivos, limitado a `.pdf`, `.doc` y `.docx`;
  - con archivo, su nombre y las acciones **Ver** (solo PDF), **Descargar**, **Reemplazar** y **Eliminar**.
- **CA-18.** Antes de subir, la web rechaza un tipo o un tamaño no permitidos con un mensaje en español, sin llamar a la API. Reemplazar y eliminar piden confirmación.
- **CA-19.** "Ver" abre una pestaña en el mismo clic y le asigna la URL firmada cuando llega, para que no la detenga el bloqueador de ventanas. "Descargar" usa la URL de `download`.
- **CA-20.** Cada código de error nuevo tiene su mensaje en español en `error-messages.es.ts`.
- **CA-21.** En el celular, las acciones del documento aparecen en la tarjeta del contrato (F15).

**Verificación**

- **CA-22.** Verificación manual en local (MinIO) y en producción (Supabase Storage): subir un PDF y un Word, ver el PDF, descargar los dos, reemplazar y eliminar.

## Fuera de alcance

- Varios archivos por contrato, tipos de documento (otrosí, anexo) e historial de versiones en la interfaz.
- Vista previa de Word.
- Adjuntar facturas a los egresos.
- Firma electrónica de documentos.
- Auditar quién ve o descarga un archivo.
- Respaldo de los archivos (riesgo aceptado, ver Objetivo).
- Borrar objetos del bucket, incluidos los huérfanos.
