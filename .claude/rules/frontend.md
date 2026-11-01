---
paths:
  - "apps/web/**"
---

# Web — React

- Los schemas y reglas de negocio viven en `packages/shared`; la web los importa, no los duplica.
- Los errores se muestran por su `code` con el mensaje de `apps/web/src/lib/error-messages.es.ts`.
