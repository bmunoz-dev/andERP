# F23 — Reglas de datos en la base · Plan

- **Estado:** Aprobado (2026-11-07)
- **Spec:** [spec.md](spec.md)

## Restricciones globales

- Los triggers lanzan el `code` como mensaje (`RAISE EXCEPTION 'CODE'`); `pg-error.mapper.ts` lo convierte en `422 CODE` (`P0001`).
- Toda función nueva fija `SET search_path = ''` y usa nombres calificados (`"anderp".…`).
- "Hoy" en los triggers es `(now() AT TIME ZONE 'America/Bogota')::date`, como en `0018`.
- Códigos: `PROVIDER_HAS_CONTRACTS`, `PROVIDER_INACTIVE`, `UNPROCESSABLE` y `NOT_FOUND` ya existen. Hay uno nuevo: `FEE_PAYMENT_EMPTY`.
- Un solo PR. La migración aborta si hay datos que violen las reglas nuevas.

## Datos

Una migración escrita a mano, `pnpm db:generate:custom --name data_integrity_guards`, en este orden:

1. **Barrera.** Un bloque `DO` aborta con un mensaje por regla si existe:
   - un prestador borrado con contratos no borrados;
   - un contrato vigente o futuro de un prestador inactivo o borrado;
   - una credencial no borrada con un responsable borrado;
   - un pago de honorarios no borrado cuya suma de días sea 0.
2. **Prestadores, borrado lógico (CA-1).** `service_providers_guard_delete()`, `BEFORE UPDATE OF deleted_at ON service_providers`: si `OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL` y existe un contrato con `deleted_at IS NULL`, lanza `PROVIDER_HAS_CONTRACTS`.
3. **Contratos (CA-2, CA-3).** Se reemplaza `provider_contracts_require_active_provider()`, con trigger `BEFORE INSERT OR UPDATE OF service_provider_id, start_date, end_date, deleted_at`:
   - si `NEW.deleted_at IS NOT NULL`, retorna;
   - lee el prestador con `FOR SHARE` (`is_active`, `deleted_at`). Sin fila, retorna y deja actuar a la FK;
   - en `INSERT`, si está inactivo o borrado, lanza `PROVIDER_INACTIVE`, igual que hoy;
   - en `UPDATE`, lanza lo mismo solo si el contrato queda vigente o futuro (`NEW.end_date IS NULL OR NEW.end_date >= hoy`).
   El bloqueo serializa con la desactivación y el borrado del prestador: los dos son `UPDATE` de esa fila.
4. **Pagos con contrato borrado (CA-7).**
   - En `fee_payments_check_mode()` y en `fixed_payments_validate()`, la lectura del contrato pasa a `SELECT ... INTO ... WHERE ... AND pc.deleted_at IS NULL FOR SHARE`, seguida de `IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'`.
   - En `fee_payments_check_mode()` la comparación pasa a `v_mode <> 'daily'` con la variable.
   - Hoy un `NULL` hace pasar la comparación sin error.
5. **Semana sin montos (CA-6).** `fee_payments_require_amount(p_payment_id uuid)` verifica que un pago no borrado sume más de 0 en `fee_payment_days`. Dos `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` la llaman:
   - `AFTER INSERT OR UPDATE ON fee_payments`, por `NEW.id`;
   - `AFTER INSERT OR UPDATE OR DELETE ON fee_payment_days`, por `COALESCE(NEW.fee_payment_id, OLD.fee_payment_id)`.
   Lanza `FEE_PAYMENT_EMPTY`. Se comprueba al confirmar, así que editar (borrar y reinsertar días) funciona.
6. **Credenciales (CA-8).** `entity_credentials_require_live_responsible()`, `BEFORE INSERT OR UPDATE OF responsible_person_id ON entity_credentials`: si `NEW.responsible_person_id` no es nulo y el responsable de la misma organización tiene `deleted_at IS NOT NULL`, lanza `UNPROCESSABLE`. Es la misma respuesta que da hoy la FK compuesta con un responsable de otra organización.

## Paquete compartido

- `errors/codes.ts`: `FEE_PAYMENT_EMPTY`.
- `error-messages.es.ts`: "Registra al menos un día con monto mayor que cero."
- `schemas/fee-payments.ts`: `saveFeePaymentSchema` con `.refine(p => p.days.some(d => Number(d.amount) > 0), { message: 'Registra al menos un día con monto mayor que cero', path: ['days'] })`. `Number` solo se compara contra 0; no hace aritmética de dinero. La API responde `422 VALIDATION_ERROR` con el error en `days`, como cualquier otra regla del schema; `FEE_PAYMENT_EMPTY` es la respuesta del respaldo en la base.

## API

- **`ServiceProvidersService`**
  - `list(filter: { id?: string } = {})` aplica `eq(serviceProviders.id, id)` cuando viene el id, y `get(id)` usa `list({ id })` (CA-4).
  - `remove(id)` deja de consultar contratos: lo hace el trigger.
  - `update(id, changes)` hace el `UPDATE` y la auditoría en `db.transaction`. Si cambia alguno de `bankId`, `accountTypeId` o `accountNumber` respecto de `current`, registra `audit.log({ action: 'provider.bank_account_update', entityType: 'service_provider', entityId: id, changes: { before: { bankId, accountTypeId, accountNumber }, after: { … } } }, tx)` (CA-5).
- **`CredentialsService.list()`** filtra el `leftJoin` de responsables con `isNull(responsiblePersons.deletedAt)` (CA-8).
- **`rotateCredentialKeys(db, cipher, batchSize)`** pasa a devolver `Promise<{ rotated: number; failed: string[] }>` (CA-9):
  - el `decrypt` y el `encrypt` de cada fila van en `try/catch`; la que falla agrega su `id` a `failed` y no se actualiza;
  - la consulta del lote agrega `notInArray(entityCredentials.id, failed)` cuando `failed` no está vacío;
  - `main()` imprime los ids fallidos y termina con `process.exitCode = 1` si hay alguno.
- **Documentos (CA-10).** `ContractDocumentUploadGuard implements CanActivate`, en `contract-documents.module.ts`:
  - llama a `ContractDocumentsService.assertUploadAllowed(contractId: string): Promise<void>`, que es público y agrupa `assertContract` y `assertUploadLimit`;
  - se aplica con `@UseGuards` en la ruta de subida, antes del `DocumentUploadInterceptor`;
  - `upload()` deja de llamar a esas dos funciones.

## Documentación

- `design.md`:
  - §5.5: reglas de borrado y reapertura, y semana sin montos;
  - §5.8: credenciales hacia responsables vigentes;
  - §5.9: `provider.bank_account_update`;
  - §6.3: rotación por fila;
  - §6.5: el límite se comprueba antes de leer el archivo;
  - §11: revelar contraseñas sin visor ni tope, como decisión del 2026-11-06;
  - historial.
- `docs/runbooks/04-rotar-llave-credenciales.md`: el paso de los ids fallidos.
- `docs/runbooks/07-archivos-huerfanos.md`, con esta consulta en el SQL Editor de Supabase:
  ```sql
  select o.name, o.created_at
    from storage.objects o
   where o.bucket_id = 'contract-documents'
     and not exists (select 1 from anderp.contract_documents d where d.storage_key = o.name)
   order by o.created_at;
  ```

## Pruebas

| CA | Dónde | Caso |
|---|---|---|
| CA-1 | `service-providers.db.test.ts` | `UPDATE deleted_at` directo en SQL con contratos → `PROVIDER_HAS_CONTRACTS`; sin contratos → pasa |
| CA-2 | `provider-deactivation.db.test.ts` | Contrato terminado de un prestador inactivo: `end_date = null` → `PROVIDER_INACTIVE`; una fecha pasada distinta → pasa; insertar con el prestador borrado → `PROVIDER_INACTIVE` |
| CA-3 | `provider-deactivation.db.test.ts` | `Promise.all` de desactivar y crear un contrato vigente, en transacciones separadas: exactamente una falla |
| CA-4 | `service-providers.test.ts` | Las pruebas existentes de `get`, `create` y `update` siguen en verde |
| CA-5 | `service-providers.test.ts` | Cambiar la cuenta → un `provider.bank_account_update` con `before` y `after`; cambiar solo el nombre → ninguno |
| CA-6 | `fee-payments.test.ts` y `fee-payments.db.test.ts` | API: todos los días en `0.00` → `422 VALIDATION_ERROR` con error en `days`. SQL: pago con días en 0 → falla al confirmar. Editar reemplazando días con montos → pasa. Schema de shared en `packages/shared` |
| CA-7 | `fixed-payments.db.test.ts` y `fee-payments.db.test.ts` | Insertar un pago contra un contrato con `deleted_at` → `NOT_FOUND` |
| CA-8 | `credentials.db.test.ts` y `credentials.test.ts` | Responsable borrado al crear o editar → `422 UNPROCESSABLE`; la lista no muestra el nombre de un responsable borrado |
| CA-9 | `credentials.test.ts` | Un registro dañado y dos sanos con la llave vieja: `rotated = 2`, `failed = [id]`; la prueba ya no borra el dañado |
| CA-10 | `contract-documents.test.ts` | Pasado el límite, `429`; contrato de otra organización, `404`; un spy en el servicio de subida comprueba que no se llamó |
| CA-12 | `apps/api/test/data-integrity.db.test.ts` | Con una fila que viola cada regla, la barrera de la migración aborta. Se ejecuta el bloque `DO` sobre datos de prueba, como hizo F19 con su relleno |

## Puntos de revisión

1. **Editar el nombre de un prestador inactivo con un contrato terminado.** El `UPDATE` del prestador no debe disparar el trigger de contratos (prueba en CA-2).
2. **Borrar un contrato (`deleted_at`) de un prestador inactivo.** Debe pasar, porque el trigger retorna si `NEW.deleted_at IS NOT NULL`.
3. **Un día `0.00` y otro `50000.00`.** Es válido en el schema, en la API y en la base.
4. **Una credencial sin responsable (`null`).** Pasa por el trigger sin error.
5. **Rotar cuando todos los registros están dañados.** El bucle termina; no puede ser infinito por los ids excluidos (prueba en CA-9 con un lote de tamaño 1).

## Notas de implementación

(Se completan al implementar.)
