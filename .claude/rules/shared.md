---
paths:
  - "packages/shared/**"
  - "apps/api/src/**"
  - "apps/web/src/**"
---

# Contratos compartidos

- Errores: el dominio lanza `DomainError(code, status)`. Cada `code` nuevo va en `packages/shared/src/errors/codes.ts` y con su mensaje en español en `apps/web/src/lib/error-messages.es.ts`; el `satisfies` obliga a no olvidarlo.
- Dinero: string decimal (`"150000.00"`) en la API y la web. Nunca aritmética de dinero con `number`.
- Fechas de negocio: strings `YYYY-MM-DD` en `America/Bogota` (`todayIn()`), nunca `Date` para fechas de calendario.
- Antes de cambiar un contrato, busca sus consumidores en la API y la web.
