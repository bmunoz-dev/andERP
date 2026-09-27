# F06 — Responsables y credenciales · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §5.8, §5.9, §6.3

## Objetivo

Guardar las credenciales de acceso a portales externos (DIAN, bancos, secretarías, etc.) cifradas, cada una con su persona responsable, y dejar registro de quién revela cada contraseña.

## Historias

- **HU1.** Como admin, quiero registrar a los responsables con su email o teléfono.
- **HU2.** Como admin, quiero registrar la credencial de una entidad: nombre, usuario, contraseña, URL, contactos, notas y responsable.
- **HU3.** Como admin, quiero ver la contraseña solo cuando la necesito y copiarla.
- **HU4.** Como dueño, quiero saber quién vio qué contraseña y cuándo.
- **HU5.** Como dueño, quiero poder rotar la llave de cifrado sin perder las contraseñas.

## Criterios de aceptación

**Responsables**
- **CA-1.** Hay CRUD de responsables. `firstName` y `lastName` son obligatorios, de hasta 30 caracteres. Si faltan a la vez `email` y `phone`, responde `422 CONTACT_REQUIRED`; la base de datos también lo rechaza con un CHECK. El email debe tener formato válido.
- **CA-2.** Borrar un responsable asignado a credenciales no borradas responde `422 RESPONSIBLE_IN_USE`.

**Credenciales**
- **CA-3.** `POST /credentials` con `{ entityName, username, password, url?, contact1?, contact2?, notes?, responsiblePersonId? }` guarda la contraseña **cifrada** con AES-256-GCM, un IV aleatorio de 12 bytes, AAD `"{organizationId}:{id}"` y la `key_version` activa. La contraseña es obligatoria, de 1 a 256 caracteres.
- **CA-4.** Límites: `entityName` hasta 100 caracteres, `username` hasta 254 y `url` hasta 2048 con esquema `http` o `https`. Si ya existe la misma `entityName` + `username` en la organización, responde `409 DUPLICATE_CREDENTIAL`.
- **CA-5.** `GET /credentials` y `GET /credentials/:id` **nunca** devuelven la contraseña ni los campos cifrados. En su lugar incluyen `hasPassword: true` y el responsable.
- **CA-6.** `POST /credentials/:id/reveal` devuelve `{ password }` y registra `credential.reveal` en `audit_logs` con `entity_id` y **sin** la contraseña. Las respuestas de reveal llevan `Cache-Control: no-store`.
- **CA-7.** `PATCH /credentials/:id`: si llega `password`, se vuelve a cifrar con IV nuevo y la llave activa; si no llega, la contraseña guardada no cambia. El cambio registra `credential.update`, sin incluir la contraseña en `changes`, solo `passwordChanged: true`.
- **CA-8.** Un texto cifrado copiado en SQL de un registro a otro **no** se puede descifrar: falla la verificación por AAD y se responde `500 CREDENTIAL_DECRYPT_FAILED`, que queda en el log como error de integridad.
- **CA-9.** `GET /credentials?search=` busca por entidad, usuario o nombre del responsable.

**Llaves**
- **CA-10.** Las llaves se configuran con `CREDENTIALS_KEYS` (JSON `{"1":"<base64 de 32 bytes>", ...}`) y `CREDENTIALS_ACTIVE_KEY_VERSION`. La API no arranca si la llave activa falta o no mide 32 bytes.
- **CA-11.** `pnpm credentials:rotate` vuelve a cifrar con la llave activa todas las credenciales que tienen otra versión, en lotes y dentro de transacciones. Es idempotente e informa cuántas procesó. Después de rotar, todas se revelan correctamente.
- **CA-12.** Descifrar un registro con una `key_version` que ya no está configurada responde `500 CREDENTIAL_KEY_UNAVAILABLE`.

**Aislamiento y web**
- **CA-13.** Un admin de otra organización recibe `404` en credenciales y responsables ajenos, incluido `reveal`.
- **CA-14.** Web:
  - **Listado de credenciales:** entidad, usuario, URL (se abre en una pestaña nueva con `rel="noopener noreferrer"`) y responsable.
  - **Botón "Revelar":** muestra la contraseña 30 segundos y luego la oculta.
  - **Botón "Copiar":** llama a reveal y copia al portapapeles sin mostrarla.
  - **Formulario:** el campo de contraseña es de solo escritura; en edición dice "Dejar vacío para no cambiar".
  - **Pantalla de responsables:** CRUD.

## Fuera de alcance

Generador de contraseñas, vencimiento o recordatorios de cambio de contraseña, adjuntos y compartir credenciales fuera de AndERP.
