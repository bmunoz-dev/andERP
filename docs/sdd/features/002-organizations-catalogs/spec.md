# F02 — Organizaciones, catálogos y usuarios · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §5.3, §5.4, §6.4

## Objetivo

Dejar AndERP configurado para operar:
- el super admin gestiona organizaciones y catálogos globales;
- el admin gestiona las categorías de egreso y los usuarios de su organización;
- la app tiene su estructura de navegación.

## Historias

- **HU1.** Como super admin, quiero crear una organización con su primer admin, para que otra empresa pueda usar AndERP.
- **HU2.** Como super admin, quiero suspender y reactivar organizaciones.
- **HU3.** Como super admin, quiero mantener los bancos, los tipos de cuenta y los tipos de documento.
- **HU4.** Como admin, quiero crear, renombrar, ordenar y desactivar las categorías de egreso de mi organización.
- **HU5.** Como admin, quiero invitar usuarios a mi organización y desactivarlos.
- **HU6.** Como usuario, quiero un menú lateral con los módulos que me corresponden.

## Criterios de aceptación

**Organizaciones (solo super admin)**
- **CA-1.** `POST /platform/organizations` con `{ name, taxId, admin: { email, firstName, lastName } }` hace todo en una sola transacción:
  - crea la organización;
  - carga las 7 categorías iniciales con su orden, "Honorarios" con `system_code = 'FEES'`;
  - crea o reutiliza el usuario admin (por email) y su membresía;
  - envía una invitación.

  Un NIT repetido responde `409 TAX_ID_TAKEN`.
- **CA-2.** `PATCH /platform/organizations/:id` permite cambiar `name` y `status`. Suspender una organización revoca todas las sesiones de sus miembros que no son super admin.
- **CA-3.** Un admin que llama a cualquier ruta `/platform/*` recibe `403 FORBIDDEN`.

**Catálogos globales**
- **CA-4.** `GET /catalogs/{banks|account-types|document-types}` está disponible para cualquier usuario autenticado. Por defecto devuelve solo los activos; con `?includeInactive=true`, todos.
- **CA-5.** Crear, editar y desactivar en `/platform/catalogs/*` es solo para el super admin. Un nombre o código repetido responde `409 DUPLICATE_NAME`.
- **CA-6.** El seed carga los tipos de documento (CC, NIT, CE, PAS, TI, PPT), los tipos de cuenta (Ahorros, Corriente) y los bancos principales de Colombia, y crea las categorías iniciales de la organización del seed si no existen.

**Categorías de egreso (admin de la organización)**
- **CA-7.** `GET /expense-categories` devuelve las categorías de la organización del token, ordenadas por `sort_order`.
- **CA-8.** Crear y renombrar categorías funciona. Un nombre repetido dentro de la organización responde `409 DUPLICATE_NAME`, pero se permite el mismo nombre en otra organización.
- **CA-9.** `PUT /expense-categories/order` recibe la lista de ids en el orden nuevo y actualiza `sort_order`.
- **CA-10.** Renombrar, desactivar o borrar una categoría con `system_code` responde `422 SYSTEM_CATEGORY_PROTECTED`, tanto desde la API como con un `UPDATE` directo en SQL (trigger).

**Usuarios de la organización (admin)**
- **CA-11.** `POST /members` con `{ email, firstName, lastName }` crea el usuario (o reutiliza el existente por email) y la membresía con rol `admin`. Si el usuario **no tiene contraseña**, envía una invitación: un `password_resets` con `purpose = 'invite'` que vence en 72 horas y un correo con el enlace a `WEB_URL/activar?token=…`. Si **ya tiene contraseña** (pertenece a otra organización), solo recibe un aviso con el enlace al login. Si el email ya es miembro, responde `409 ALREADY_MEMBER`.
- **CA-12.** `POST /auth/password/reset` acepta tokens `invite` igual que los `reset`. Al usarlo, el usuario queda con contraseña y puede iniciar sesión.
- **CA-13.** `POST /members/:userId/resend-invite` invalida las invitaciones anteriores y envía una nueva. Si el usuario ya activó su cuenta, responde `422 INVITE_NOT_PENDING`.
- **CA-14.** `PATCH /members/:userId` con `{ isActive: boolean }` desactiva o reactiva la **membresía** en la organización (no al usuario globalmente) y, al desactivar, revoca sus sesiones. Un admin **no puede** desactivarse a sí mismo (`422 CANNOT_DEACTIVATE_SELF`), ni dejar la organización sin ningún admin activo (`422 LAST_ADMIN`), ni modificar la membresía de un super admin (`403 FORBIDDEN`).
- **CA-15.** `GET /members` lista los miembros con su estado y si tienen una invitación pendiente.

**Aislamiento y navegación**
- **CA-16.** Con dos organizaciones A y B, un admin de A no ve ni modifica categorías ni miembros de B: responde `404`, sin revelar que el recurso existe.
- **CA-17.** Toda escritura llena `created_by` y `updated_by`, y todo borrado llena `deleted_at` y `deleted_by`.
- **CA-18.** La web tiene un layout con menú lateral: Egresos, Honorarios, Prestadores, Credenciales, Responsables y Configuración (Categorías y Usuarios). La sección "Plataforma" (Organizaciones y Catálogos) solo aparece para el super admin. Los módulos que aún no existen muestran "Próximamente".
- **CA-19.** Hay pantallas para organizaciones, catálogos globales, categorías (con reordenamiento) y usuarios (invitar, reenviar invitación, activar y desactivar), además de la ruta pública `/activar` para definir la contraseña desde la invitación.
- **CA-20.** Un usuario sin contraseña tiene como máximo **una invitación pendiente**: la última gana. Si se le invita a otra organización, se borran sus membresías pendientes en las demás (con `member.invitation_replaced` en la auditoría de cada una) y sus enlaces anteriores dejan de servir. Al aceptar, queda solo en la organización que lo invitó por última vez.

## Fuera de alcance

Selector de organización para el super admin (la v1 opera la organización inicial), roles distintos de `admin` y borrado definitivo de organizaciones.

**Pendiente para F05:** que una categoría con egresos no se pueda borrar (solo desactivar). Se implementa cuando existan los egresos.
