# F17 — Documento del contrato · Spec

- **Estado:** Aprobado (2026-10-18; ajustado dos veces ese día, ver Historial)
- **Diseño:** `design.md` §2 (decisión 18), §3 (glosario), §5.13 (`contract_documents`), §6.5 (almacenamiento de archivos), §10 y §11
- **Depende de:** F03 (contratos), F12 (auditoría atómica), F15 (tablas como tarjetas en el celular)

## Objetivo

Guardar el archivo de cada contrato (PDF o Word) y poder abrirlo o descargarlo desde la ficha de la persona. Los archivos van en un bucket **privado** de Supabase Storage y se leen solo con una **URL firmada** de corta duración que genera la API.

Un contrato tiene **un solo archivo vigente**. Reemplazarlo o eliminarlo nunca borra el objeto del bucket: solo se marca como borrado en la base de datos, así que un error se puede recuperar a mano.

**Riesgo aceptado por el usuario (2026-10-18):** los archivos no tienen respaldo. Supabase Free no hace backups y el respaldo de F07 (`pg_dump`) no cubre Storage. Lo acota que nunca se borren objetos del bucket.

**Datos personales:** los contratos tienen datos personales (Ley 1581 de 2012). El bucket es privado, solo los admins de la organización llegan a la URL y la URL dura 5 minutos. Compartir una URL firmada expone el archivo mientras no caduque.

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
- **CA-4.** El tipo se decide por los primeros bytes del archivo **y** por su extensión, que deben coincidir (la extensión, sin distinguir mayúsculas). Nunca se usa el `Content-Type` que envía el navegador:
  - un PDF empieza por `%PDF-` y tiene la extensión `.pdf`;
  - un `.docx` tiene la firma ZIP (`PK\x03\x04`) y la extensión `.docx`;
  - un `.doc` tiene la firma OLE (`D0 CF 11 E0 A1 B1 1A E1`) y la extensión `.doc`.

  Cualquier otra combinación (por ejemplo, un PDF llamado `contrato.docx`) responde `422 DOCUMENT_TYPE_NOT_ALLOWED`. Un archivo vacío o la falta del campo `file` responden `422 VALIDATION_ERROR`.

  **Límites aceptados:** no se inspecciona el interior del archivo. Un ZIP cualquiera renombrado a `.docx`, o un `.xls` o `.msi` (que comparten la firma OLE) renombrado a `.doc`, pasan la validación. El servidor nunca procesa ni ejecuta el archivo: solo lo guarda y lo entrega.
- **CA-4b.** El nombre que se guarda es el nombre base del archivo (sin ruta, como `C:\fakepath\contrato.pdf`), en UTF-8: "Contratación.pdf" se guarda y se descarga así, con su tilde. Un nombre vacío o de más de 255 caracteres responde `422 VALIDATION_ERROR`.
- **CA-5.** Un archivo de más de 10 MB responde `422 DOCUMENT_TOO_LARGE`, sin subir nada al bucket.
- **CA-6.** Si el contrato ya tiene archivo, se reemplaza. En una transacción que bloquea la fila del contrato, la fila anterior se marca como borrada y se inserta la nueva. El objeto anterior **sigue en el bucket**.
- **CA-6b.** Un contrato borrado responde `404`. El contrato de una persona inactiva (F09) sí admite archivo: suele ser un contrato terminado cuyo documento se quiere guardar.
- **CA-6c.** Cada usuario puede subir hasta **20 archivos por hora**. El siguiente responde `429 TOO_MANY_REQUESTS`. El bucket solo crece (nunca se borra nada) y al pasar el 1 GB de Supabase Free se restringe el proyecto entero, incluida la base de datos.
- **CA-7.** El objeto se sube al bucket antes de la transacción. Si la transacción falla, el objeto queda huérfano en el bucket y no se registra nada en la base de datos.

**Ver, descargar y eliminar**

- **CA-8.** Las respuestas de contratos (`GET /service-providers/:id/contracts` y el contrato vigente de la persona) incluyen `document`: `null` o `{ fileName, contentType, sizeBytes, uploadedAt }`.
- **CA-9.** `GET /contracts/:id/document/url` devuelve `{ url, expiresAt }`: una URL firmada válida por **5 minutos**. Si el contrato no tiene archivo, responde `404`.
  - El `Content-Type` y el `Content-Disposition` se fijan **al subir** el objeto, según su tipo: un PDF se guarda como `inline` (se abre en el visor del navegador, que permite descargarlo) y un Word como `attachment` (se descarga con su nombre original).
  - La URL firmada no cambia esas cabeceras: Supabase Storage no admite `response-content-disposition` en la lectura por S3.
- **CA-10.** En el `Content-Disposition` que se guarda al subir, el nombre del archivo se escribe con `filename*` (RFC 5987) y con un `filename` alternativo sin comillas, barras ni caracteres de control.
- **CA-11.** `DELETE /contracts/:id/document` hace un borrado lógico (`204`). El objeto sigue en el bucket. Si no hay archivo, responde `404`.
- **CA-12.** Subir, reemplazar y eliminar generan `audit_logs` (`contract_document.upload`, `contract_document.replace` y `contract_document.delete`) en la misma transacción que el cambio (F12), con el nombre, el tamaño y el `sha256`. Ver y descargar no se auditan.
- **CA-13.** Borrar un contrato que tiene archivo sigue permitido. El archivo queda ligado al contrato borrado y deja de verse.

**Aislamiento y seguridad**

- **CA-14.** Un admin de otra organización recibe `404` al subir, pedir la URL o eliminar el archivo de un contrato ajeno.
- **CA-15.** Las variables S3 (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`) son obligatorias al arrancar la API, nunca llegan a la web y no aparecen en logs ni en respuestas. El bucket es privado y no tiene políticas para `anon` ni `authenticated`.
- **CA-15b.** Las llaves S3 de Supabase son de **máximo privilegio**: abren todos los buckets del proyecto y no pasan por RLS. Con ellas se podrían borrar los contratos. Viven solo como variables de entorno en Render, nunca en el repositorio ni en el chat. Si se sospecha una filtración, se revocan en Supabase (*Settings → Storage → S3 Access Keys*), se crea otro par y se actualiza Render.
- **CA-16.** El proxy del Worker reenvía el `multipart` a la API sin alterarlo y **como stream**, sin cargar el archivo en memoria (el plan gratuito de Workers limita el tiempo de CPU por petición). Un archivo de 10 MB sube en producción.

**Web**

- **CA-17.** La tabla de contratos de la ficha de la persona tiene la columna "Documento":
  - sin archivo, un botón **"Subir"** que abre el selector de archivos, limitado a `.pdf`, `.doc` y `.docx`;
  - con archivo, su nombre y las acciones **Abrir** (PDF) o **Descargar** (Word), **Reemplazar** y **Eliminar**.
- **CA-18.** Antes de subir, la web rechaza un tipo o un tamaño no permitidos con un mensaje en español, sin llamar a la API. Reemplazar y eliminar piden confirmación.
- **CA-19.** "Abrir" abre una pestaña en el mismo clic y le asigna la URL firmada cuando llega, para que no la detenga el bloqueador de ventanas. Antes de asignarla corta la referencia a la pestaña de origen (`opener = null`), para que la página abierta no pueda cambiar la URL de AndERP. Si la petición falla, cierra la pestaña y muestra el error.
- **CA-19b.** "Descargar" usa la URL firmada en un `<iframe>` oculto: como el Word se guardó con `attachment`, el navegador lo descarga sin salir de la ficha. Si la API no entrega la URL, se muestra el error y la página no se mueve.
- **CA-20.** Cada código de error nuevo tiene su mensaje en español en `error-messages.es.ts`.
- **CA-21.** En el celular, las acciones del documento aparecen en la tarjeta del contrato (F15).

**Verificación**

- **CA-21b.** Antes de implementar la API, una prueba en Supabase Storage confirma lo que el diseño supone de él: que una URL firmada por S3 abre el objeto y devuelve el `Content-Type` y el `Content-Disposition` guardados al subir. Si no lo hace, se detiene la feature y se ajusta el diseño.
- **CA-22.** Verificación manual en local (MinIO) y en producción (Supabase Storage): subir un PDF y un Word, abrir el PDF (y descargarlo desde el visor), descargar el Word con su nombre, reemplazar y eliminar.

## Fuera de alcance

- Varios archivos por contrato, tipos de documento (otrosí, anexo) e historial de versiones en la interfaz.
- Vista previa de Word.
- Adjuntar facturas a los egresos.
- Firma electrónica de documentos.
- Auditar quién ve o descarga un archivo.
- Respaldo de los archivos (riesgo aceptado, ver Objetivo).
- Borrar objetos del bucket, incluidos los huérfanos.
- Una cuota de almacenamiento por organización (el límite de CA-6c es por usuario y por hora).

## Historial

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-10-18 | CA-9: un solo endpoint de URL firmada, sin `mode`; el `Content-Disposition` (`inline` para PDF, `attachment` para Word) se fija al subir. CA-10, CA-17, CA-19 y CA-22 ajustados ("Abrir" el PDF, "Descargar" el Word). | La documentación de Supabase ("S3 Compatibility") no admite `response-content-disposition` en `GetObject`: una URL con `mode` habría funcionado en MinIO y no en producción. Aprobado por el usuario. |
| 2026-10-18 | Auditoría de la spec. Nuevos: CA-4b (nombre en UTF-8, sin ruta, hasta 255), CA-6b (contrato borrado y persona inactiva), CA-6c (20 subidas por hora), CA-15b (alcance y rotación de las llaves S3), CA-19b (descarga sin salir de la app) y CA-21b (prueba previa en Supabase). Ajustados: CA-4 (la extensión debe coincidir también en el PDF; límites aceptados), CA-16 (stream en el Worker) y CA-19 (`opener = null`). | El diseño suponía comportamientos de Supabase sin probarlos; multer decodifica los nombres como latin1; el Worker cargaba el archivo entero en memoria; el bucket solo crece y su cuota afecta a todo el proyecto. Aprobado por el usuario. |
