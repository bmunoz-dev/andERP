# F19 — Módulos por organización · Spec

- **Estado:** Aprobado (2026-10-20)
- **Diseño:** `design.md` §2 (decisiones 1 y 12), §5.2 (enum `app_module`), §5.3 (`organizations.modules`), §6.4 (permisos por paquete), §8 (menú y Plataforma → Organizaciones), §11 (fuera de alcance) e historial. Los cambios a `design.md` se hacen en la primera tarea, antes del código.
- **Depende de:** F02 (organizaciones, guard, Plataforma), F12 (auditoría atómica), y de los módulos que agrupa: F03, F04, F06, F13, F14, F16, F17, F18.

## Objetivo

AndERP pasa a servir a **varias empresas cliente**, cada una como una organización. El super admin decide qué **paquetes** tiene cada organización según lo que ese cliente contrató. Un paquete apagado desaparece del menú de todos los usuarios de la organización y **la API lo rechaza**; sus datos no se borran y vuelven a estar disponibles al encenderlo.

No son permisos por usuario: todos los admins de una organización ven los mismos paquetes.

## Decisiones del usuario (2026-10-20)

- **Por organización, no por usuario.** Lo controla el super admin desde Plataforma. Los permisos por usuario dentro de una organización quedan fuera.
- **Paquetes en lugar de módulos sueltos**, para que no haya combinaciones rotas por dependencias (Pagos necesita Personal; Credenciales necesita Responsables):

| Paquete | `app_module` | Incluye | Se puede apagar |
|---|---|---|---|
| Base | — (no se guarda) | Egresos (inicio), Departamentos, Usuarios | No |
| Personal y pagos | `staff_payments` | Personal, contratos y su documento, Pagos (honorarios y monto fijo) | Sí |
| Credenciales | `credentials` | Credenciales y Responsables | Sí |
| Cuentas aéreas | `air_accounts` | Cuentas aéreas y Operadores aéreos | Sí |
| Agenda | `agenda` | Agenda y panel de notificaciones | Sí |

- **Una organización nueva nace solo con Base**: un olvido da de menos, no de más. Las que ya existen ("AndERP – Plataforma") quedan con los cuatro paquetes al migrar.
- **El super admin no se salta los paquetes** dentro de una organización. Su poder está en las rutas de Plataforma.
- **Los pagos ya registrados siguen en el libro de Egresos** aunque se apague Personal y pagos: son dinero que salió y quitarlos falsearía los totales.
- **Sin actualización en vivo** del menú: la API corta en la siguiente petición; el menú se actualiza en el próximo refresh del token o al recargar.
- **Entrega en dos PR** (ver CA-27): la web publicada en Cloudflare puede quedar antes que la API, y la web toma la sesión sin validarla.
- **El selector de organización** (un usuario en dos clientes) va en una feature aparte, antes de dar acceso a alguien que pertenezca a dos organizaciones.

## Historias

- **HU1.** Como super admin, quiero elegir los paquetes al crear una organización cliente, para darle solo lo que contrató.
- **HU2.** Como super admin, quiero encender o apagar paquetes de una organización existente sin perder sus datos.
- **HU3.** Como admin de una organización, quiero ver en el menú solo lo que mi organización tiene, sin pantallas rotas.
- **HU4.** Como responsable de la plataforma, quiero que un paquete apagado no se pueda usar ni llamando a la API directamente.

## Criterios de aceptación

**Modelo**

- **CA-1.** Enum `anderp.app_module` con `staff_payments`, `credentials`, `air_accounts` y `agenda`. Columna `organizations.modules anderp.app_module[] NOT NULL DEFAULT '{}'`.
- **CA-2.** La migración deja con los cuatro paquetes a toda organización existente. Una organización creada después nace con `{}` si no se indican paquetes.
- **CA-3.** Apagar un paquete no borra ni modifica filas de sus tablas; al encenderlo, los mismos datos vuelven a verse.

**Plataforma (super admin)**

- **CA-4.** `POST /platform/organizations` acepta `modules: AppModule[]` opcional (por defecto `[]`). `PATCH /platform/organizations/:id` acepta `modules` además de `name` y `status`; `modules` reemplaza el conjunto completo. Los repetidos se descartan; un valor fuera del enum devuelve `400 VALIDATION_ERROR`. El esquema Zod `appModuleSchema` vive en `packages/shared`.
- **CA-5.** `GET /platform/organizations` y `GET /platform/organizations/:id` devuelven `modules`.
- **CA-6.** Un admin que no es super admin recibe `403 FORBIDDEN` en estas rutas (como hoy).
- **CA-7.** Un cambio de `modules` se audita como `organization.update` (acción existente) con `modules` antes y después, en la misma transacción.

**Cumplimiento en la API**

- **CA-8.** El `Actor` lleva `modules`, leído de `organizations` en la misma consulta de membresía que ya hace el guard en cada petición. El JWT no lleva los paquetes.
- **CA-9.** Cada controlador de un paquete se marca con `@RequiresModule(...)`. Sin el paquete, toda ruta del controlador responde `403 MODULE_DISABLED` (código nuevo en `codes.ts`, mensaje "Tu organización no tiene activo este módulo." en `error-messages.es.ts`):

| Paquete | Controladores |
|---|---|
| `staff_payments` | `service-providers`, `contracts`, `contracts/:id/document`, `fee-payments`, `fixed-payments` |
| `credentials` | `credentials`, `responsible-persons` |
| `air_accounts` | `air-operators`, `air-accounts`, `air-accounts/:accountId/movements` |
| `agenda` | `obligations`, `notifications` |
| Base (sin paquete) | `auth`, `expenses`, `reports/expenses`, `expense-categories`, `members`, `catalogs`, `health` |
| Plataforma (`@SuperAdminOnly`) | `platform/organizations`, `platform/catalogs` |

- **CA-10.** El super admin recibe `403 MODULE_DISABLED` como cualquier admin si su organización no tiene el paquete.
- **CA-11.** Apagar un paquete corta el acceso en la siguiente petición, con el mismo access token.
- **CA-12.** Una prueba recorre todos los controladores registrados y falla si alguno no tiene `@RequiresModule` y no está en la lista explícita de Base o de Plataforma.
- **CA-13.** Apagar un paquete en la organización A no cambia lo que puede hacer la organización B.
- **CA-14.** Con `staff_payments` apagado, el libro y los totales de Egresos (`v_expense_ledger`) siguen incluyendo los pagos ya registrados.
- **CA-15.** `/auth/me`, el login y el refresh devuelven `modules` en el perfil (`AuthProfile`).

**Web**

- **CA-16.** Cada ítem del menú (`navigation.ts`) puede declarar su paquete; `navigationFor` oculta los ítems de paquetes que la organización no tiene y los grupos que quedan vacíos. Operadores aéreos (Configuración) va con `air_accounts`.
- **CA-17.** La guardia de `_app` usa el mismo mapa: una ruta de un paquete apagado redirige a `/egresos`.
- **CA-18.** La campana de notificaciones solo aparece con `agenda`.
- **CA-19.** En el libro de Egresos, sin `staff_payments`, el concepto de un pago se muestra como texto, sin enlace a `/pagos`.
- **CA-20.** Si una pantalla abierta recibe `MODULE_DISABLED`, se muestra el mensaje en español, como cualquier error de la API.
- **CA-21.** **Plataforma → Organizaciones:** el diálogo de crear y editar tiene una casilla por paquete con su nombre y una línea de lo que incluye; al crear salen desmarcadas.
- **CA-22.** La tabla de organizaciones suma la columna **Módulos** con una insignia por paquete encendido ("Solo Base" si no tiene ninguno).
- **CA-23.** Quitar un paquete que estaba encendido pide confirmación: "Los usuarios de {organización} dejarán de ver {paquete}. Los datos no se borran."
- **CA-24.** En el celular (F15) el filtro aplica igual, porque el menú es el mismo.

**Aislamiento y pruebas**

- **CA-25.** Pruebas de la API contra Postgres real para CA-2 a CA-15, con una ruta por controlador de cada paquete.
- **CA-26.** Pruebas de la web para CA-16 a CA-19 y CA-21 a CA-23.

**Despliegue**

- **CA-27.** Dos PR: el **PR 1** lleva migración, `packages/shared` y API (la web actual ignora `modules`); el **PR 2** lleva la web y se mergea solo cuando la API del PR 1 ya responde en producción. Sin código de transición.
- **CA-28.** Antes del merge del PR 1, una consulta de solo lectura en producción, con confirmación del usuario, lista las organizaciones existentes. Después del despliegue, el usuario verifica a mano que el admin de "AndERP – Plataforma" sigue viendo todo.

## Fuera de alcance

- Permisos o roles por usuario dentro de una organización (tablas `permissions` / `role_permissions`).
- Planes, precios, límites por plan, facturación o vencimiento de paquetes.
- Selector de organización para usuarios que pertenecen a varias (feature aparte).
- Registro autoservicio de organizaciones.
- Actualización en vivo del menú (sondeo, websockets).
- Ocultar de Egresos los pagos ya registrados cuando se apaga Personal y pagos.
