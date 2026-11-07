# F24 — Robustez y documentación al día · Plan

- **Estado:** Aprobado (2026-11-07)
- **Spec:** [spec.md](spec.md)

## Restricciones globales

- Sin migraciones y sin cambios de contrato, salvo `credentialSchema.url`, que se vuelve más estricto en la respuesta (CA-6).
- Los mensajes nuevos van en español. Las reglas compartidas viven en `packages/shared` y la web no las duplica (`.claude/rules/frontend.md`).
- Un solo PR. Puede ir en paralelo con F23, pero se mergea después de F21, porque toca `auth-api.ts` y `api-client.ts`.

## API

- `apps/api/src/modules/mail/mailer.ts`: `createTransport({ ..., connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000 })` (CA-1).
- `expenses.module.ts`: `@Query('categoryId', new ParseUUIDPipe({ optional: true, errorHttpStatusCode: 422 })) categoryId?: string` en el libro. Si hay otra ruta de reportes con `categoryId` en el mismo controlador, recibe el mismo cambio (CA-2).
- `service-providers.service.ts:262` usa `isBankAccountComplete` de shared en lugar de contar a mano (CA-4).

## Paquete compartido (CA-4, CA-6)

`schemas/service-providers.ts` exporta:

- `ACCOUNT_NUMBER_PATTERN = /^[0-9-]{4,30}$/`, que usan `createServiceProviderSchema` y el formulario;
- `isBankAccountComplete(values: { bankId?: string | null; accountTypeId?: string | null; accountNumber?: string | null }): boolean`, verdadero si los tres están llenos o los tres vacíos (`''`, `null` o `undefined` cuentan como vacío);
- `isContractEndValid(startDate: string, endDate: string | null | undefined): boolean`, verdadero si no hay fin o si `endDate >= startDate`.

En `schemas/credentials.ts`, el `url` de la respuesta pasa de `z.string()` a la misma regla `http(s)` que `saveCredentialSchema`, con `.nullable()`.

## Web

- **`DataTable` (CA-3).**
  - Prop nueva `error?: unknown`. Si viene, la tabla y la vista móvil muestran `errorMessage(error)` en lugar de `emptyMessage`, con el mismo estilo de la fila vacía y `role="alert"`.
  - Cada pantalla le pasa `error={q.error}`: Agenda (`agenda-table.tsx`), Pagos, Personal, Credenciales, Responsables, Cuentas aéreas, Usuarios, Departamentos y Organizaciones.
- **Formularios (CA-4).**
  - `provider-form-dialog.tsx`: `accountNumber` usa `ACCOUNT_NUMBER_PATTERN`, y el `superRefine` usa `isBankAccountComplete` para decidir si marca los campos.
  - `contract-form-dialog.tsx`: el `refine` de fechas usa `isContractEndValid`. El resto de campos sigue igual: el formulario usa `''` donde la API usa `null`, y por eso no se deriva el schema completo.
- **Invalidaciones (CA-5).**
  - `responsables.tsx`: `refresh` también invalida la clave del listado de credenciales (`credentialKeys`).
  - `categorias.tsx`: después de renombrar se invalida la raíz de `expenseKeys`.
  - `personal/$id.tsx`: `refresh` también invalida `['contracts', 'overlaps']`.
- **Enlace de credencial (CA-6).** `credenciales.tsx` pinta `<a>` solo si `/^https?:\/\//i.test(url)`; si no, muestra el texto.
- **Fechas (CA-7).** `usuarios.tsx:31` y `organizaciones.tsx:36` agregan `timeZone: 'America/Bogota'`.
- **Perfil (CA-8).** En `organizaciones.tsx`, el `onSuccess` de crear y editar una organización (los dos `save`) llama a `await refreshSession()`, que actualiza `authStore` con el perfil nuevo.
- **`_headers` (CA-10).** Corregir el comentario.

## Documentación (CA-11, CA-12)

- `features/004-fee-payments/spec.md` CA-1: tachar `warnings[]` con la nota "(2026-11-06: no se implementó; F10 quitó el tope)".
- `features/016-fixed-payments/spec.md` CA-5, CA-6, CA-12 y CA-14: "lo aplica un trigger", con nota fechada.
- `features/002-organizations-catalogs/spec.md` CA-20: "Reemplazado por F21 CA-7". Si F21-T001 ya lo hizo, no se repite.
- `design.md` §5.5: riesgo aceptado de pagos fijos duplicados, más el historial.
- `docs/reviews/2026-11-06-revision-modulos.md`: un párrafo al principio que remite a F21–F24 y a los riesgos aceptados.

## Pruebas

| CA | Dónde | Caso |
|---|---|---|
| CA-1 | `apps/api/test/mail.test.ts` | El transporte se crea con los tres timeouts en 10 000. Basta con una prueba unitaria de las opciones, sin un SMTP lento real |
| CA-2 | `expenses.test.ts` | `?categoryId=abc` → `422`; un UUID válido sin datos → `200 []` |
| CA-3 | `apps/web/src/components/data-table.test.tsx` | Con `error`, muestra el mensaje de error y no `emptyMessage`; sin error y sin datos, `emptyMessage` |
| CA-4 | `packages/shared/src/schemas/service-providers.test.ts` y `provider-form-dialog.test.tsx` | Los helpers con llenos, vacíos y a medias. El formulario con cuenta a medias marca los campos vacíos |
| CA-5 | — | Revisión en el PR; son tres líneas sin lógica |
| CA-6 | `credenciales` | `javascript:alert(1)` se muestra como texto y no como `<a>`. Puede ser una prueba de la celda o de un helper `isWebUrl(url)` en `lib/format.ts` |
| CA-9 | `apps/web/src/components/credentials/credential-form*.test.tsx` | Editar sin tocar la contraseña envía el cuerpo sin `password` (o con el valor que hoy significa "no cambiar") |
| CA-7, CA-8, CA-10 | — | Revisión en el PR |

## Puntos de revisión

1. **Error mientras ya hay datos en caché** (refetch fallido). Se muestran los datos y no el error a pantalla completa. `DataTable` solo muestra el error si `data` está vacío o indefinido (prueba en CA-3).
2. **`categoryId` vacío (`?categoryId=`).** Se trata como ausente, no como `422`. Hay que verificar qué hace `ParseUUIDPipe` con `optional` y una cadena vacía, y cubrirlo en la prueba de CA-2.
3. **URL en mayúsculas (`HTTPS://…`).** Se muestra como enlace (la regex no distingue mayúsculas).
4. **`refreshSession()` falla tras guardar una organización.** El guardado sigue contando como exitoso, y el menú se actualiza en la siguiente recarga.
5. **Número de cuenta con espacios alrededor.** Se recorta antes de validar, como hoy (`trim`).

## Notas de implementación

- **T003:** `categoryId` usa `ParseUUIDPipe` opcional con 422, como el resto de la API. Un `categoryId=` vacío también responde 422 (punto de revisión 2): la web nunca lo envía (`expenses-api.ts` solo pone el parámetro si tiene valor), y tratarlo como ausente pedía una validación propia.
