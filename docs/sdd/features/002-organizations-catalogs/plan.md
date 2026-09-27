# F02 — Organizaciones, catálogos y usuarios · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Migraciones

1. **`0003_catalogs` (generada):** `banks`, `account_types`, `document_types` y `expense_categories`, con sus índices únicos parciales. Incluye `UNIQUE (organization_id, id)` en `expense_categories` para permitir FK compuestas.
2. **`0004_expense_categories_guard` (custom):**
   - Trigger `BEFORE UPDATE OR DELETE` sobre `expense_categories`: si `OLD.system_code IS NOT NULL` y cambian `name`, `is_active`, `deleted_at` o `system_code`, o si la operación es un `DELETE`, lanza `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SYSTEM_CATEGORY_PROTECTED'`.
   - El mapper de F00 convierte ese error en `422` con ese `code`.

## Repositorio base con aislamiento por organización

`shared/db/org-scoped.repository.ts` es la base de todo repositorio de tablas de una organización:

- `scope(table)` → `and(eq(table.organizationId, ctx.organizationId), isNull(table.deletedAt))`.
- `insert` y `update` añaden `organizationId`, `createdBy`/`updatedBy` y `updatedAt` desde el contexto CLS.
- `softDelete(id)` → `deletedAt = now()`, `deletedBy = ctx.userId`, siempre dentro del scope.
- Si no hay `organizationId` en el contexto, lanza un error de programación.

Todos los repositorios de F03–F06 heredan de esta clase.

Los catálogos globales usan otro repositorio base, sin `organizationId` y con las mismas columnas de auditoría.

## Módulos

```
modules/organizations/
  platform-organizations.controller.ts   /platform/organizations      (SuperAdminGuard)
  organizations.service.ts               crear organización (transacción), suspender, reactivar
  members.controller.ts                  /members
  members.service.ts                     invitar, reenviar invitación, activar/desactivar, reglas LAST_ADMIN y SELF
modules/catalogs/
  catalogs.controller.ts                 GET /catalogs/*
  platform-catalogs.controller.ts        /platform/catalogs/*          (SuperAdminGuard)
  expense-categories.controller.ts       /expense-categories
  *.service.ts / *.repository.ts
  default-categories.ts                  las 7 categorías iniciales (compartido por el seed y la creación de organizaciones)
```

**Invitaciones.** Se reutilizan el puerto `Mailer` y `PasswordResetRepository` de F01 con `purpose = 'invite'` y vencimiento de 72 horas. El caso de uso `reset-password` acepta los dos `purpose`. La plantilla del correo de invitación dice "Te invitaron a AndERP".

**Suspender una organización** revoca las sesiones con un `UPDATE sessions SET revoked_at = now() WHERE user_id IN (miembros no super admin)`.

**Bancos del seed:** Bancolombia, Banco de Bogotá, Davivienda, BBVA Colombia, Banco de Occidente, Banco Popular, Scotiabank Colpatria, Banco AV Villas, Banco Caja Social, Banco Agrario de Colombia, Itaú, Banco GNB Sudameris, Banco Falabella, Banco Pichincha, Bancoomeva, Banco Finandina, Banco W, Lulo Bank, Nu Colombia, Nequi y Daviplata.

## Endpoints

| Método | Ruta | Rol |
|---|---|---|
| GET, POST | `/platform/organizations` | super admin |
| GET, PATCH | `/platform/organizations/:id` | super admin |
| GET | `/catalogs/banks`, `/catalogs/account-types`, `/catalogs/document-types` | autenticado |
| POST, PATCH | `/platform/catalogs/{banks\|account-types\|document-types}[/:id]` | super admin |
| GET, POST | `/expense-categories` | admin |
| PATCH, DELETE | `/expense-categories/:id` | admin |
| PUT | `/expense-categories/order` | admin |
| GET, POST | `/members` | admin |
| PATCH | `/members/:userId` | admin |
| POST | `/members/:userId/resend-invite` | admin |

El super admin también tiene acceso a las rutas de admin: el guard lo trata como admin de la organización activa.

## Web

- **Layout:** `_app/route.tsx` con un sidebar de shadcn (`Sidebar`) y un header con el nombre de la organización y el menú de usuario. El menú se construye a partir del perfil (`isSuperAdmin`).
- **Componentes reutilizables:** `DataTable` (TanStack Table con filtros, orden y paginación en cliente) y `FormDialog`. Los usarán F03–F06.
- **Pantallas:**
  - `configuracion/categorias`: lista ordenable con dnd-kit; las categorías de sistema muestran un candado.
  - `configuracion/usuarios`
  - `plataforma/organizaciones`
  - `plataforma/catalogos` (pestañas: Bancos, Tipos de cuenta, Tipos de documento)
  - `/activar` (pública)
