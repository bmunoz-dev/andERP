# F19 — Módulos por organización · Plan

- **Estado:** Aprobado (2026-10-20)
- **Spec:** [spec.md](spec.md)

## Datos

Una migración, **`0034_organization_modules`**, generada con `pnpm db:generate --name organization_modules` después de tocar el esquema de Drizzle:

- `enums.ts`: `appModule = anderp.enum('app_module', ['staff_payments', 'credentials', 'air_accounts', 'agenda'])`. Es una lista literal, como el resto de los enums: el esquema no importa `@anderp/shared`, porque `drizzle-kit` lo carga por su cuenta. Una prueba compara `appModule.enumValues` con `APP_MODULES` de shared.
- `core.ts`: `organizations.modules: appModule().array().notNull().default(sql\`'{}'::anderp.app_module[]\`)`.
- Al final del SQL generado se agrega a mano el relleno de CA-2: `UPDATE anderp.organizations SET modules = '{staff_payments,credentials,air_accounts,agenda}';`. Es una sentencia de datos, así que no cambia el snapshot de Drizzle. Se revisa el SQL antes de aceptarlo.
- No hay CHECK contra repetidos: la API los descarta (CA-4) y un repetido no cambia lo que se permite. Tampoco hay `registerConstraintCodes`, porque no se agrega ninguna restricción con nombre.

Lo que cambia por el valor por defecto `{}`:

- `db/seed.ts`: la organización inicial se inserta con los cuatro paquetes, para que la base local siga como hoy.
- `test/setup/fixtures.ts`: `createOrganization` inserta con los cuatro paquetes por defecto y recibe `modules` opcional para los casos de F19. Sin esto, todas las pruebas que existen recibirían `403 MODULE_DISABLED`.
- `foundation.test.ts`: suma `app_module` a la lista de enums.

## Paquete compartido

- `schemas/organizations.ts`:
  - `APP_MODULES` (`as const`), `appModuleSchema = z.enum(APP_MODULES)` y `type AppModule`;
  - `appModulesSchema = z.array(appModuleSchema).transform((m) => [...new Set(m)])`, que descarta los repetidos (CA-4);
  - `organizationSchema` suma `modules`;
  - `createOrganizationSchema` suma `modules: appModulesSchema.default([])`;
  - `updateOrganizationSchema` suma `modules` opcional, y el `refine` también lo acepta como cambio.
- `schemas/auth.ts`: `authProfileSchema` suma `modules: z.array(appModuleSchema)`. Así lo llevan el login, el refresh y `/auth/me` (CA-15).
- `errors/codes.ts`: `MODULE_DISABLED`; `error-messages.es.ts`: "Tu organización no tiene activo este módulo."

## API

**Auth (hexagonal, F01):**

- `MembershipRecord` suma `modules: AppModule[]`. `findMembership` (`drizzle-auth.repositories.ts`) agrega `organizations.modules` al `select` que ya existe. `in-memory-auth.ts` pone los cuatro paquetes.
- `Actor` (`request-context.ts`) suma `modules`. `JwtAuthGuard` lo copia de la membresía, y `toProfile` lo pone en el perfil.

**Decorador y guard** (`modules/auth/http/guards.ts`, junto a `SuperAdminOnly`):

```ts
export const REQUIRED_MODULE = 'requiredModule';
export const RequiresModule = (module: AppModule) =>
  applyDecorators(SetMetadata(REQUIRED_MODULE, module), UseGuards(ModuleGuard));
```

`ModuleGuard` lee la metadata de la clase con `Reflector` y lanza `DomainError(MODULE_DISABLED, 403)` si `actor.modules` no incluye el paquete. No exime al super admin (CA-10). Como `JwtAuthGuard` es global y corre antes, el actor ya existe cuando se ejecuta.

**Controladores:** se aplica `@RequiresModule(...)` a nivel de clase en los 12 controladores de la tabla de CA-9. No se toca ningún servicio.

**Organizaciones:**

- `create` inserta `modules` (por defecto `[]`) y lo suma al `after` de `organization.create`.
- `update` ya hace `.set({ ...changes })`, así que `modules` entra sin código nuevo. El `before` y el `after` de `organization.update` suman `modules` (CA-7).
- `get` y el listado devuelven `modules` (CA-5).

**Prueba de cobertura (CA-12):** `test/organization-modules.test.ts` levanta la app de pruebas y recorre `app.get(DiscoveryService).getControllers()`. Para cada controlador:

- si tiene metadata `REQUIRED_MODULE`, pasa;
- si no, su ruta (`PATH_METADATA`) tiene que estar en `BASE_CONTROLLERS` o en `PLATFORM_CONTROLLERS`, dos listas literales en la misma prueba.

Un controlador nuevo sin paquete y sin estar en una lista hace fallar el CI. `DiscoveryModule` viene en `@nestjs/core`: no hay dependencia nueva.

## Web

- `lib/navigation.ts`:
  - `NavItem` suma `module?: AppModule`, y se marcan Pagos, Personal, Credenciales, Responsables, Cuentas aéreas, Agenda y Operadores aéreos;
  - `navigationFor(user)` filtra por `user.modules` y quita los grupos vacíos;
  - una función nueva, `moduleForPath(pathname)`, busca el ítem cuyo `to` es prefijo del `pathname`. Es la misma regla de `isActive` en `app-sidebar.tsx`.
- `routes/_app.tsx`: en `beforeLoad`, después de comprobar la sesión, si `moduleForPath(location.pathname)` devuelve un paquete que el usuario no tiene, hace `throw redirect({ to: '/egresos' })` (CA-17).
- `NotificationsBell`: se renderiza en `_app.tsx` solo si `modules` incluye `agenda` (CA-18).
- `components/expenses/ledger-sheet.tsx`: sin `staff_payments`, el concepto se muestra en un `<span>`, sin `<Link>` (CA-19).
- `routes/_app/plataforma/organizaciones.tsx`:
  - `MODULE_LABELS`: nombre y descripción en español de cada paquete, en la misma página porque nadie más los usa;
  - un `ModuleCheckboxes` con `<input type="checkbox">` nativo y `Label`, como en `week-grid.tsx`. No se agrega un componente `checkbox` de shadcn;
  - `CreateOrganizationDialog` suma las casillas, desmarcadas al crear (CA-21);
  - un `ModulesDialog` nuevo para editar, abierto por una acción **Módulos** en cada fila. Hoy no hay diálogo de edición: solo crear y suspender o activar;
  - al guardar, si se quitó algún paquete que estaba encendido, primero abre el `ConfirmDialog` que ya existe, con el texto de CA-23;
  - la tabla suma la columna **Módulos** con un `Badge` por paquete, o "Solo Base" si no tiene ninguno (CA-22).
- `lib/admin-api.ts`: `createOrganization` y `updateOrganization` envían `modules`.

## Pruebas

- **API, Postgres real:**
  - **`organization-modules.test.ts`:** migración y valor por defecto (CA-2); `POST` y `PATCH` con `modules`, repetidos, valor inválido y admin sin super admin (CA-4 a CA-6); auditoría (CA-7). Además, una ruta `GET` por controlador de cada paquete con el paquete apagado (403) y encendido (200, datos intactos) (CA-3, CA-9); el super admin (CA-10); el mismo token antes y después de apagar (CA-11); la cobertura (CA-12); A contra B con `seedTwoOrgs` (CA-13); el libro de Egresos con `staff_payments` apagado (CA-14), y `modules` en `/auth/me` (CA-15).
  - **Unitarias:** `auth.use-cases.test.ts` (perfil con `modules`) y `foundation.test.ts` (enum).
- **Web:**
  - `navigation.test.ts`: filtro, grupos vacíos y `moduleForPath`.
  - Prueba del libro sin enlace (CA-19).
  - Prueba de la página de organizaciones: casillas desmarcadas al crear, `PATCH` con `modules`, y confirmación al quitar un paquete (CA-21 a CA-23).
  - Prueba de la campana (CA-18).

## Despliegue

Dos PR (CA-27):

1. **PR 1** (`feat/019-organization-modules`): bloques A a C. Datos, shared y API. La web en producción ignora `modules`, y el nuevo `403 MODULE_DISABLED` nunca aparece porque la organización existente queda con todo encendido.
2. **PR 2** (`feat/019-organization-modules-web`, creada desde `main` después del merge del PR 1): bloque D, la web. Se mergea cuando `/auth/me` en producción ya devuelve `modules`. Después del despliegue, el usuario hace la verificación de CA-28.

La consulta de solo lectura previa al PR 1 (CA-28) es: `SELECT name, status FROM anderp.organizations WHERE deleted_at IS NULL`.

## Notas de implementación

- **Migración 0034 (T002):** la generó `drizzle-kit`; el `UPDATE` de relleno se agregó a mano al final. La base de pruebas se migra vacía, así que la prueba extrae esa sentencia del archivo y la ejecuta sobre una organización recién creada; el orden real de aplicación se confirma en producción (CA-28).
- **Tipo del formulario (T003):** `.default([])` en `createOrganizationSchema` hace que su entrada y su salida difieran, y el formulario de crear organización dejó de compilar. Se exporta `CreateOrganizationInput = z.input<…>` y el formulario usa `useForm<CreateOrganizationInput, unknown, CreateOrganization>`, como `contract-form-dialog.tsx`.
- **Typecheck entre tareas (T003–T005):** `authProfileSchema` y `organizationSchema` exigen `modules`, así que el typecheck de la API estuvo en rojo hasta que T004 y T005 llenaron `toProfile` y las filas del listado. El PR 1 se evalúa completo.
- **Validación (T004):** un paquete inválido responde `422 VALIDATION_ERROR`, como el resto de la API (la spec decía 400 por error y se corrigió).
- **Auditoría (T004):** se reutilizó `organization.update` con `modules` en el antes y el después, en vez de una acción nueva.
- **Fixtures (T002, T005):** `createOrganization` y el seed crean con los cuatro paquetes. Una prueba que inserte una organización directamente nace con `[]` y recibiría `MODULE_DISABLED` en las rutas de un paquete (`auth.test.ts` lo hace, pero solo usa rutas de Base).
- **Guard (T006):** `ModuleGuard` falla cerrado: sin actor también responde 403. Lee la metadata con `getAllAndOverride` (método y clase): en la auditoría se vio que con `get` sobre la clase, un `@RequiresModule` puesto en un método dejaba pasar sin el paquete (`module-guard.test.ts`). No se registró en `AuthModule`; Nest lo instancia en cada módulo con `UseGuards`, y solo necesita `Reflector` y `ClsService`.
- **Cobertura (T006):** la prueba usa `ModulesContainer` en vez de `DiscoveryService`, para no importar otro módulo. Compara la ruta de cada controlador con una lista esperada y comprueba que los de Plataforma lleven `SuperAdminGuard`.
- **CA-28 (T007):** el usuario decidió no hacer la consulta de solo lectura en producción: el `UPDATE` de 0034 no filtra, así que toda organización existente recibe los cuatro paquetes, y los datos de producción aún no son de clientes. La única condición es que el usuario `bayrol.dev@gmail.com` siga existiendo; el PR 1 no borra ni modifica usuarios. Queda la verificación manual tras el despliegue.
- **Entorno:** en Windows, `vitest` cierra un worker al arrancar (`0xC0000409`) en uno o dos archivos de la API por corrida; repetir el archivo lo resuelve (ya está en `CLAUDE.md`).
