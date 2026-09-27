# F03 — Prestadores y contratos · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Migraciones

1. **`0005_service_providers` (generada y revisada):**
   - `service_providers` con `UNIQUE (organization_id, id)` y `UNIQUE (organization_id, document_type_id, document_number) WHERE deleted_at IS NULL`.
   - `CHECK ((bank_id IS NULL AND account_type_id IS NULL AND account_number IS NULL) OR (bank_id IS NOT NULL AND account_type_id IS NOT NULL AND account_number IS NOT NULL))`.
   - `provider_contracts` con `UNIQUE (organization_id, id)`, la FK compuesta `(organization_id, service_provider_id) → service_providers (organization_id, id)`, `CHECK (total_amount > 0)` y `CHECK (end_date IS NULL OR end_date >= start_date)`.
2. **`0006_contracts_no_overlap` (custom):**
   ```
   EXCLUDE USING gist (
     service_provider_id WITH =,
     daterange(start_date, end_date, '[]') WITH &&
   ) WHERE (deleted_at IS NULL)
   ```
   `daterange` con fin `NULL` es un rango abierto.

## Módulo `service-providers` (CRUD, no hexagonal)

```
modules/service-providers/
  service-providers.controller.ts    /service-providers
  contracts.controller.ts            /service-providers/:providerId/contracts, /contracts/:id
  service-providers.service.ts       valida catálogos activos, regla PROVIDER_HAS_CONTRACTS
  contracts.service.ts               auditoría con changes antes/después
  *.repository.ts                    extienden OrgScopedRepository
```

**Estado del contrato.** `status` se calcula en SQL con `CURRENT_DATE AT TIME ZONE 'America/Bogota'`. `activeContract` se obtiene con un `LEFT JOIN LATERAL` al contrato vigente.

**Mapeo de errores de la base de datos.** El mapper de F00 recibe el nombre de la restricción violada. Se agrega una tabla `constraintName → code`:

| Restricción | Código |
|---|---|
| `service_providers_document_uq` | `DUPLICATE_DOCUMENT` |
| `provider_contracts_no_overlap` | `CONTRACT_OVERLAP` |
| `service_providers_bank_all_or_none` | `INCOMPLETE_BANK_ACCOUNT` |

Todas las restricciones se nombran explícitamente en las migraciones.

**Esquemas compartidos** en `@anderp/shared/schemas/service-providers.ts`. El dinero usa el esquema `money` de F00.

## Endpoints

| Método | Ruta |
|---|---|
| GET, POST | `/service-providers` |
| GET, PATCH, DELETE | `/service-providers/:id` |
| GET, POST | `/service-providers/:id/contracts` |
| PATCH, DELETE | `/contracts/:id` |

## Web

- `prestadores/index.tsx`: `DataTable` con buscador, distintivo de contrato vigente y botón "Nuevo prestador".
- `prestadores/$id.tsx`: ficha del prestador y tabla de contratos con `FormDialog`. El campo de dinero es un componente `MoneyInput` que formatea mientras se escribe y entrega un string decimal. Se reutiliza en F04 y F05.
- El componente `DateInput` trabaja con strings `YYYY-MM-DD` y los muestra como `dd/mm/aaaa`.
