# AndERP

Sistema de gestión de egresos, honorarios, prestadores y credenciales.

La documentación del proyecto (diseño, constitución, roadmap y features) está en [`docs/sdd/`](docs/sdd/README.md).

## Requisitos

- Node.js 24 (`.nvmrc`)
- pnpm 11
- Docker Desktop (Postgres local y pruebas de integración)

## Arranque

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

- API: http://localhost:3000/api/v1 (Swagger en http://localhost:3000/api/docs)
- Web: http://localhost:5173

Antes del primer arranque, copia `apps/api/.env.example` a `apps/api/.env`.

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` | Levanta shared (watch), API y web en paralelo |
| `pnpm build` | Compila todos los paquetes |
| `pnpm lint` | ESLint en todo el monorepo |
| `pnpm typecheck` | Verificación de tipos en todos los paquetes |
| `pnpm test` | Pruebas unitarias e integración (requiere Docker) |
| `pnpm db:generate` | Genera una migración a partir del esquema Drizzle |
| `pnpm db:generate:custom -- --name=<nombre>` | Crea una migración SQL vacía para escribir a mano |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
