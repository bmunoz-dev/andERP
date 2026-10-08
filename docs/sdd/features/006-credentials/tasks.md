# F06 — Responsables y credenciales · Tareas

- **Rama:** `feat/006-credentials`
- **Plan:** [plan.md](plan.md)

## Bloque A — Datos

- [x] F06-T001 Definir en Drizzle `responsible_persons` y `entity_credentials` con restricciones nombradas. Generar la migración y revisarla.
- [x] F06-T002 [TDD] Pruebas en SQL:
      - CHECK de contacto (email o teléfono);
      - credencial duplicada, y credencial que se puede recrear tras un borrado;
      - la FK compuesta impide un responsable de otra organización.

      Después, escribir las pruebas del trigger `RESPONSIBLE_IN_USE` y crearlo.
      Depende de: F06-T001 · Verificación: CA-1, CA-2, CA-4

## Bloque B — Responsables

- [ ] F06-T003 Crear el CRUD de responsables, los esquemas en `@anderp/shared/schemas/responsible-persons.ts` y las pruebas de API.
      Depende de: F06-T002 · Verificación: CA-1, CA-2

## Bloque C — Cifrado (TDD)

- [ ] F06-T004 [TDD] Crear `key-ring.ts`: parseo de `CREDENTIALS_KEYS`, validación de 32 bytes y de la llave activa, y error al arrancar si algo falla.
      Verificación: CA-10
- [ ] F06-T005 [TDD] Crear `aes-gcm.cipher.ts`. Pruebas:
      - el ciclo cifrar → descifrar devuelve el texto original;
      - el IV cambia en cada cifrado;
      - un AAD distinto falla;
      - un `authTag` alterado falla;
      - una versión de llave inexistente falla.
      Depende de: F06-T004 · Verificación: CA-8, CA-12

## Bloque D — Credenciales

- [ ] F06-T006 Crear el dominio `Credential` y `EncryptedSecret`, y el repositorio Drizzle.
      Depende de: F06-T001
- [ ] F06-T007 [TDD] Crear los comandos:
      - `create`: genera el id antes de cifrar;
      - `update`: vuelve a cifrar solo si llega una contraseña, y registra `passwordChanged` en la auditoría;
      - `reveal`: registra la auditoría;
      - `delete`.
      Depende de: F06-T005, F06-T006 · Verificación: CA-3, CA-6, CA-7
- [ ] F06-T008 Crear el controlador y las consultas: listado con `search` y `hasPassword`, y cabeceras `no-store` en reveal. Añadir los esquemas a `@anderp/shared/schemas/credentials.ts`.
      Depende de: F06-T007 · Verificación: CA-5, CA-9
- [ ] F06-T009 [TDD] Crear el caso de uso `rotate-keys` y el script `credentials:rotate`: lotes, idempotencia y prueba de integración con dos versiones de llave.
      Depende de: F06-T007 · Verificación: CA-11
- [ ] F06-T010 Añadir los códigos `CONTACT_REQUIRED`, `RESPONSIBLE_IN_USE`, `DUPLICATE_CREDENTIAL`, `CREDENTIAL_DECRYPT_FAILED` y `CREDENTIAL_KEY_UNAVAILABLE`, con sus mensajes en español.

## Bloque E — Pruebas de API y seguridad

- [ ] F06-T011 Pruebas de API de CA-3 a CA-12, incluida la prueba de CA-8: copiar el texto cifrado en SQL de un registro a otro y verificar que reveal falla.
      Depende de: F06-T008, F06-T009
- [ ] F06-T012 Pruebas de seguridad:
      - ninguna respuesta de listado o detalle contiene `password`, `ciphertext`, `iv` ni `authTag`;
      - `audit_logs.changes` nunca contiene la contraseña;
      - el log capturado durante reveal no contiene la contraseña.
      Depende de: F06-T011
- [ ] F06-T013 Pruebas de aislamiento con `seedTwoOrgs()`, incluido reveal de una credencial ajena.
      Depende de: F06-T011 · Verificación: CA-13

## Bloque F — Web

- [ ] F06-T014 [P] Crear la pantalla de responsables.
      Depende de: F06-T003
- [ ] F06-T015 [TDD] Crear `RevealButton` (se oculta a los 30 segundos) y `CopyButton`, sin dejar la contraseña en la caché de consultas.
      Depende de: F06-T008
- [ ] F06-T016 Crear el listado y el formulario de credenciales (contraseña de solo escritura en edición).
      Depende de: F06-T015 · Verificación: CA-14

## Cierre

- [ ] F06-T017 Verificación manual: crear, revelar, copiar y editar sin cambiar la contraseña; consultar `audit_logs`; rotar la llave en local y revelar de nuevo. Revisar la Definición de Hecho y actualizar `roadmap.md`.
