---
paths:
  - "apps/api/src/**"
  - "apps/api/drizzle/**"
  - "apps/api/**/*.sql"
---

# PostgreSQL y Drizzle

- Todo va en el esquema `anderp`, nunca en `public`. Las extensiones van en `extensions`.
- Las tablas de una organización llevan `organization_id`, `UNIQUE (organization_id, id)` y FK compuestas.
- Toda consulta a tablas de una organización pasa por `OrgScope` (`where`, `forInsert`, `forUpdate`, `forSoftDelete`).
- Las invariantes importantes se escriben también en la base de datos (CHECK, UNIQUE, EXCLUDE o trigger) con un nombre de restricción registrado en `registerConstraintCodes`.
- Dinero: `numeric(14,2)`; las sumas se hacen en SQL.
- Migraciones: `pnpm db:generate --name x` desde el esquema Drizzle; `pnpm db:generate:custom --name x` para SQL escrito a mano (triggers, EXCLUDE, vistas). Toda función nueva fija `search_path = ''`.
