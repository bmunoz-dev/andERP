# F09 — Desactivar prestadores · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Datos

- `service_providers.is_active boolean NOT NULL DEFAULT true` (migración generada).
- Migración escrita a mano con dos triggers (constitución, principio III):
  - `provider_contracts_require_active_provider` (`BEFORE INSERT` en `provider_contracts`) → `PROVIDER_INACTIVE`;
  - `service_providers_guard_deactivation` (`BEFORE UPDATE OF is_active` en `service_providers`) → `PROVIDER_HAS_ACTIVE_CONTRACT` si pasa a `false` con un contrato no borrado y `end_date IS NULL OR end_date >= (now() AT TIME ZONE 'America/Bogota')::date`.

## API

- `updateServiceProviderSchema` agrega `isActive` opcional; `serviceProviderSchema`, `isActive`.
- El servicio no repite las reglas: las lanzan los triggers y el mapeo de `P0001` las devuelve como `422` con su `code` (igual que F05 y F06).
- Dos códigos nuevos con su mensaje en español: `PROVIDER_INACTIVE` y `PROVIDER_HAS_ACTIVE_CONTRACT`.

## Web

- `prestadores/$id.tsx`: botón Desactivar/Activar (con `ConfirmDialog` al desactivar), insignia y "Nuevo contrato" oculto con nota.
- `prestadores/index.tsx`: insignia "Inactivo" junto al nombre.

## Despliegue (decisión del usuario, 2026-10-09)

El pipeline de F07 aún no migra (falta configurar sus secretos y apagar Auto-Deploy en Render). Para F09 se eligió la opción manual: **antes del merge**, las migraciones nuevas se aplican en Supabase por el conector y se registran en `drizzle.__drizzle_migrations`, como las 17 iniciales. Es un parche: el riesgo de F07 sigue abierto.
