---
paths:
  - "apps/api/**"
  - "apps/web/**"
  - "packages/shared/**"
  - "e2e/**"
  - "vitest.config.ts"
---

# Pruebas

- Las pruebas de la API corren en serie contra un Postgres real (Testcontainers). No simules la base de datos.
- Mientras trabajas, corre solo el archivo o proyecto afectado (`npx vitest run --project api test/x.test.ts`). La verificación completa (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`), una vez antes del commit.
- La API y la web consumen `@anderp/shared` desde `dist/`, sin alias a `src/`. Si tocaste `packages/shared`, corre `pnpm --filter @anderp/shared build` antes de `npx vitest` o `tsc` en otro paquete; los scripts `pnpm test`/`lint`/`typecheck` ya lo hacen.
- En Windows, el trabajador de Vitest a veces termina al arrancar con `0xC0000409`. Repite el archivo afectado antes de buscar un error en el código.
- No afirmes que una comprobación pasó si no viste su resultado.
