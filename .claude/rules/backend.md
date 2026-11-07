---
paths:
  - "apps/api/**"
---

# API — NestJS

- El puerto se configura con `API_PORT`, no `PORT`.
- Reutiliza los patrones y módulos existentes antes de crear abstracciones. Solo `auth` es hexagonal; el resto usa controlador → servicio, con repositorio solo cuando hace falta.
