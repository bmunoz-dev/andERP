# F00 — Fundaciones · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §4, §5.1, §5.2, §7, §9, §10

## Objetivo

Dejar la base técnica sobre la que se construye todo: monorepo, base de datos local, esqueletos de la API y de la web, utilidades compartidas, manejo de errores, logs, pruebas contra Postgres real y CI. **No entrega funcionalidad de negocio.**

## Historias (como desarrollador)

- **HU1.** Quiero clonar el repositorio y levantar todo con tres comandos, para empezar a trabajar sin configuración manual.
- **HU2.** Quiero las reglas de semanas del mes y festivos de Colombia en un solo lugar probado, para que la API y la web calculen igual.
- **HU3.** Quiero que la API responda siempre los errores en un formato estándar y registre logs estructurados sin secretos, para depurar con seguridad.
- **HU4.** Quiero pruebas de integración contra un Postgres real y desechable, para validar restricciones, triggers y vistas.
- **HU5.** Quiero que CI verifique lint, tipos y pruebas en cada push, para no romper `main`.

## Criterios de aceptación

- **CA-1.** Con Docker corriendo, `pnpm install`, `docker compose up -d` y `pnpm dev` levantan la API en `:3000` y la web en `:5173`.
- **CA-2.** `GET /api/v1/health` responde `200 {"status":"ok","db":"ok"}`. Si la base de datos no responde, devuelve `503` en formato Problem Details.
- **CA-3.** `weekOfMonth` y `weekRange` (formato B) cumplen:

  | Entrada | Resultado |
  |---|---|
  | `weekOfMonth(2026-02-07)` | 1 |
  | `weekOfMonth(2026-02-08)` | 2 |
  | `weekOfMonth(2026-02-21)` | 3 |
  | `weekOfMonth(2026-02-22)` | 4 |
  | `weekOfMonth(2026-08-31)` | 4 |
  | `weekRange(2026, 2, 4)` | 2026-02-22 … 2026-02-28 (7 días) |
  | `weekRange(2028, 2, 4)` | 2028-02-22 … 2028-02-29 (8 días, año bisiesto) |
  | `weekRange(2026, 9, 4)` | 2026-09-22 … 2026-09-30 (9 días) |
  | `weekRange(2026, 8, 4)` | 2026-08-22 … 2026-08-31 (10 días) |
  | `weekRange(2026, 8, 1)` | 2026-08-01 … 2026-08-07 |

- **CA-4.** `colombianHolidays(año)` devuelve exactamente los festivos oficiales de Colombia para 2025, 2026 y 2027 (fijos, trasladables por la Ley Emiliani y los dependientes de la Pascua). `isColombianHoliday(fecha)` es coherente con esa lista.
- **CA-5.** Una ruta inexistente responde `404` con Problem Details (`code: "NOT_FOUND"`).
- **CA-6.** Un error no controlado responde `500` con `code: "INTERNAL_ERROR"` y un `requestId`. El log de ese error incluye el mismo `requestId` y **no** contiene los valores de `password`, `token`, `authorization` ni `cookie`.
- **CA-7.** Un cuerpo inválido según su esquema Zod responde `422` con `code: "VALIDATION_ERROR"` y `errors[]` por campo.
- **CA-8.** La migración base se aplica desde cero: crea el esquema `anderp`, las extensiones `citext` y `btree_gist`, los enums de `design.md` §5.2 y los privilegios por defecto del rol `app_runtime`. Además, `app_runtime` no puede crear tablas.
- **CA-9.** Existe un harness de integración que levanta Postgres con Testcontainers, aplica las migraciones y permite limpiar datos entre archivos de prueba.
- **CA-10.** La web muestra un layout base y una página 404. Su cliente HTTP convierte las respuestas Problem Details en un `ApiError` tipado con mensaje en español.
- **CA-11.** El workflow de CI ejecuta `lint`, `typecheck` y `test` y falla si cualquiera falla.

## Fuera de alcance

Tablas de negocio, autenticación y pantallas funcionales.
