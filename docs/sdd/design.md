# AndERP — Especificación de Diseño

AndERP es un sistema de gestión de egresos y honorarios.

- **Fecha:** 2026-09-27
- **Estado:** Aprobado
- **Alcance:** Versión 1 (uso interno, una organización, preparado para multi-tenant)

### Historial de cambios

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-09-27 | Versión inicial aprobada. | — |
| 2026-09-27 | `password_resets.purpose` (`reset` / `invite`); las invitaciones duran 72 h. | Crear usuarios sin que el admin defina ni comunique contraseñas (F02). |
| 2026-09-27 | El cifrado de credenciales usa AAD (`organization_id` + `id`). | Impide mover un texto cifrado de un registro a otro (F06). |
| 2026-09-27 | El dinero viaja en la API como string decimal (`"150000.00"`). | Evita la pérdida de precisión de `number` en JSON. |
| 2026-09-27 | La web y la API se sirven en el **mismo origen** (la web reescribe `/api/*` hacia la API). | La cookie `SameSite=Strict` del refresh token no se envía entre sitios distintos (F07). |
| 2026-09-27 | Router del frontend: TanStack Router. Validación en Nest: `nestjs-zod`. | Decisiones de stack que faltaban (F00). |
| 2026-09-27 | Todas las tablas van en el esquema **`anderp`**, no en `public`. | Supabase expone `public` por su Data API con la llave `anon`: sería una fuga de datos (F00, F07). |
| 2026-09-27 | La web se publica en **Cloudflare Pages** con una Pages Function como proxy de `/api/*`. La API exige `X-Proxy-Secret`. | El plan gratuito de Vercel no permite uso comercial, y la API no debe quedar abierta directamente (F07). |
| 2026-09-27 | Función SQL `week_of_month(date)` compartida por la columna generada y las vistas. | Una sola fórmula en SQL, probada contra la de TypeScript (F05). |
| 2026-09-28 | `users.password_hash` es nullable (NULL = invitación pendiente). | Los usuarios invitados existen antes de definir su contraseña (F01, F02). |
| 2026-09-28 | El access token lleva la `family_id` de su sesión y el guard verifica en cada petición que siga activa. | Logout, cambio de contraseña y reutilización de tokens invalidan también los access tokens (F01). |
| 2026-09-28 | `organization_members.is_active`: activar o desactivar a alguien es por organización. | `users.status` es global; desactivar en una organización no debe bloquear al usuario en otra (F02). |
| 2026-10-06 | Un pago que haga superar el valor total del contrato se **rechaza** (`CONTRACT_BALANCE_EXCEEDED`), en vez de solo avisar. | Decisión del usuario: no se debe pagar más de lo acordado; las adiciones se registran aumentando el valor del contrato (F04). |
| 2026-10-08 | La web se publica como **Cloudflare Worker con archivos estáticos** (no Pages). El Worker solo atiende `/api/*` (proxy con `X-Proxy-Secret`); el resto lo sirven los estáticos. | El panel de Cloudflare ya crea Workers por defecto (Workers Builds con `wrangler deploy`) y es su camino recomendado; el comportamiento es el mismo que con la Pages Function. |
| 2026-10-09 | Invitar a un usuario sin contraseña a otra organización **reemplaza** su invitación pendiente: se borran sus otras membresías pendientes. | La membresía se crea al invitar y el login entra en la más antigua: aceptar la invitación de B dejaba al usuario en A (F02 CA-20). |
| 2026-10-09 | La web tiene tema **claro, oscuro o del sistema** (F08). La preferencia se guarda en el navegador, no en la cuenta. | Comodidad visual sin tocar la API ni la base de datos; la paleta oscura ya venía con shadcn/ui. |
| 2026-10-09 | `service_providers.is_active` (F09): un prestador inactivo no recibe contratos nuevos y no se puede desactivar con un contrato vigente o futuro. | Un prestador con pagos no se puede borrar; desactivarlo lo retira sin perder historial ni bloquear pagos atrasados. |
| 2026-10-10 | El contrato guarda un **monto mensual de referencia** (`monthly_amount`), no un valor total. Lo pagado se agrupa por mes trabajado (`v_contract_month_totals`) y **no se bloquea** ningún pago (F10). **Reemplaza** la decisión del 2026-10-06 (`CONTRACT_BALANCE_EXCEEDED`). | Los prestadores se pactan por mes y el usuario decide cuánto pagar cada mes; un tope total agotaba el contrato en el primer mes. |
| 2026-10-13 | Cuerpo del diseño alineado con F10 (§1, §2 decisiones 10 y 11, §8), módulos reales en §4.1 y §4.3 (solo `auth` es hexagonal; `reports` vive dentro de `expenses`; con `responsible-persons`, `mail` y `health`), `OrgScope` en §6.4 y planes **Free** de Render y Supabase en §10. | El historial registraba los cambios, pero el cuerpo seguía describiendo el modelo anterior y el plan de pago de Render (decisión del usuario del 2026-10-10: no contratar planes de pago por ahora). |
| 2026-10-14 | Módulo **Clic Kiu** (F11): `clickiu_movements` (recargas y ventas del saldo prepagado), vista `v_clickiu_balance` y regla de saldo no negativo en la base de datos. Independiente de Egresos. | La empresa recarga saldo en Clic Kiu (agencia de viajes) y vende con él; necesita saber el saldo y lo que deben los clientes por ventas a crédito. |
| 2026-10-14 | Los bloqueos de aplicación usan la forma de dos claves `(clase, objeto)` con una constante por regla (`11` = saldo de Clic Kiu, migración 0022). | Con una sola clave, cualquier bloqueo futuro sobre el id de la organización esperaría al de Clic Kiu; las claves de dos números no chocan con otras clases ni con las de una sola clave. |
| 2026-10-14 | **Auditoría atómica** (F12): los servicios escriben el cambio y su registro en `audit_logs` en la misma transacción. | `AuditService` escribía después de confirmar el cambio: un fallo entre las dos sentencias dejaba cambios de dinero o credenciales sin auditar. |
| 2026-10-14 | La regla del saldo de Clic Kiu rechaza las transacciones en `REPEATABLE READ` (migración 0023). | En ese nivel, dos ventas simultáneas pasarían las dos y el saldo quedaría negativo sin aviso; es mejor un error visible. |
| 2026-10-14 | Las credenciales auditan también crear y borrar (`credential.create`, `credential.delete`), sin la contraseña. §5.9 lista además `credential.update`, que ya se auditaba desde F06. | Eran el único módulo sensible sin rastro de quién creó o quitó un acceso; `created_by` y `deleted_by` guardan solo el último actor, sin valores. |
| 2026-10-14 | **Agenda de pagos a entidades** (F13): `payment_obligations` y `obligation_due_dates`, un solo vencimiento pendiente por obligación (índice único) y vencimientos completados inmutables (trigger). Estado calculado con la fecha de Bogotá; alertas solo dentro de la app. | La empresa debe cumplir obligaciones periódicas con la DIAN, Fontur y otras entidades, y necesita que AndERP le avise antes de cada fecha límite. Sin correo ni tareas programadas: Render Free se duerme y no correría un cron confiable. |
| 2026-10-15 | **Panel de notificaciones** (F14): campana en la cabecera con un punto si hay algo sin revisar. Las notificaciones se calculan de la Agenda; solo se guarda por usuario lo visto y lo descartado (`notification_states`, §5.12), sin borrado lógico ni auditoría. | El contador del menú dice cuántas alertas hay, pero no si hay algo nuevo, y no permite apartar lo ya atendido. Calcularlas en vez de guardarlas evita una tarea programada y una segunda fuente de verdad sobre los estados. |
| 2026-10-18 | **Documento del contrato** (F17): tabla `contract_documents` (un archivo vigente por contrato) y bucket privado `contract-documents` en Supabase Storage, usado por la API con su protocolo S3 (s3mock en local y en las pruebas). Lectura con URL firmada de 5 minutos. Reemplazar o eliminar no borra el objeto del bucket. Sale de §11 "adjuntar contratos". | El usuario quiere guardar el contrato firmado junto a su registro y abrirlo desde la app. Pasar el archivo por la API permite validar su tipo real y mantener las llaves fuera del navegador; conservar los objetos acota la falta de respaldo (riesgo aceptado). |
| 2026-10-17 | **Pagos de monto fijo** (F16): `provider_contracts.payment_mode` (`daily` / `fixed`) y tabla `fixed_payments` (contrato, mes trabajado, fecha de pago, valor). Entran en `v_expense_ledger` (categoría `FEES`) y en `v_contract_month_totals`. En la interfaz, "Prestadores" → "Personal" y "Honorarios" → "Pagos"; el código conserva sus nombres (§3). | A la empresa ahora también le trabajan personas con pago fijo por periodo (empleados); solo se registra lo pagado, sin calcular nómina. Una tabla aparte evita romper las invariantes de F04 (semana, días, un pago por semana). El renombrado del código se pospone a una feature de solo refactor (decisión del usuario). |
| 2026-10-15 | **Vistas para el celular** (F15): por debajo de 768 px las tablas se muestran como tarjetas generadas de sus mismas columnas, sin ocultar ninguna (§8). | El usuario consulta la Agenda, las credenciales y Clic Kiu, y registra movimientos, desde el teléfono; con tablas había que desplazarse de lado para ver columnas y acciones. Generar las tarjetas de las columnas evita mantener dos maquetaciones por pantalla. |
| 2026-10-20 | **Cuentas aéreas** (F18) **reemplaza a Clic Kiu** (F11): catálogo `air_operators`, `air_accounts` con `credit_limit` (0 = prepago) y libro `air_account_movements` (saldo inicial, recarga, pago, reembolso y emisión con PNR, tiquete, pasajero, tarifa neta e impuestos). Una sola regla para prepago y crédito: `saldo ≥ −credit_limit`, con trigger diferido y bloqueo por cuenta (clase `18`). Se eliminan `clickiu_movements`, `v_clickiu_balance` y sus enums; la clase `11` queda retirada. Libro editable, sin saldo guardado, sin ciclos de facturación ni comisión (§5.10). | La agencia emite tiquetes con varios operadores (aerolíneas y consolidadores), en cuentas prepago y a crédito con cupo, y varias cuentas por operador (sucursales, portal B2B). Producción no tenía datos de Clic Kiu, así que se reemplaza sin migrar datos. El vencimiento del pago a un operador va en la Agenda (F13). |
| 2026-10-20 | **Módulos por organización** (F19): `organizations.modules` (enum `app_module`) decide qué paquetes tiene cada organización: Personal y pagos, Credenciales, Cuentas aéreas y Agenda; Base siempre está. La API responde `403 MODULE_DISABLED` y la web oculta el menú. Una organización nueva nace solo con Base. Decisiones 1 y 12 actualizadas; los permisos por usuario siguen fuera del alcance (§11). | AndERP pasa a servir a varias empresas cliente y el super admin necesita dar a cada una solo lo que contrató. Se agrupan en paquetes para que no existan combinaciones rotas por dependencias (Pagos necesita Personal; Credenciales, Responsables). |
| 2026-10-22 | **Selector de organización** (F20): `sessions.organization_id` (organización activa de la sesión, FK compuesta `sessions_membership_fk` a `organization_members`) y `organization_members.last_selected_at`. El guard compara el `org` del token con la de la sesión (`409 ORGANIZATION_CHANGED`) y `POST /auth/organization` la cambia. El perfil lista las organizaciones disponibles. §6.2 y §8 actualizadas; el selector sale de §11. | Con F19 un usuario puede pertenecer a varias empresas cliente y hasta ahora el login siempre entraba en la más antigua. La organización activa en la sesión (y no en el token) permite rechazar en el servidor las pestañas que quedaron con la anterior. |
| 2026-10-22 | **No se renombran** en el código ni en la base de datos `service_providers` / `fee_payments` (Personal / Pagos en la interfaz); el glosario (§3) hace de traducción. | El refactor tocaba ~59 archivos, 4 tablas, sus vistas, restricciones, triggers, códigos de error y auditoría, con una ventana sin servicio al desplegar, a cambio de nada visible para el usuario. |

---

## 1. Contexto y objetivos

Sistema administrativo-financiero para controlar los egresos de una empresa por categoría y semana del mes, gestionar prestadores de servicios con sus contratos, registrar el pago de honorarios por días trabajados y custodiar de forma segura las credenciales de acceso a portales de entidades externas.

**Objetivos:**

1. Ver los egresos del mes en una matriz **categoría × semana** con totales por semana, por categoría y del mes.
2. Registrar pagos de honorarios día a día por semana, ligados al contrato del prestador, con lo pagado por mes trabajado frente al monto mensual de referencia del contrato.
3. Guardar credenciales de portales externos cifradas, con registro de quién las revela.
4. Avisar con anticipación las fechas límite de las obligaciones con entidades (DIAN, Fontur…) y llevar su historial de cumplimiento (F13).
5. Llevar las cuentas con los operadores aéreos (prepago o a crédito con cupo): tiquetes emitidos, recargas y pagos, saldo y cupo disponible por cuenta y por operador, y lo que deben los clientes por cada tiquete (F18, reemplaza a F11).
6. Nacer como sistema interno de una sola empresa, pero con el modelo de datos listo para operar varias organizaciones (multi-tenant) sin migrar datos.

**Criterios de éxito:**

- El total mensual de egresos nunca cuenta dos veces un mismo pago.
- La base de datos rechaza por sí misma datos inconsistentes (semanas que no cuadran con la fecha, días fuera de la semana, contratos solapados, referencias entre organizaciones distintas).
- Ninguna contraseña (de usuario o de portal externo) existe en texto plano en la base de datos ni en los logs.

---

## 2. Decisiones de negocio acordadas

| # | Tema | Decisión |
|---|---|---|
| 1 | Tenencia | Varias empresas cliente, cada una una organización (F19). Todas las tablas de negocio llevan `organization_id`; hoy producción opera una sola. |
| 2 | Autenticación | Propia (no Supabase Auth). Supabase se usa **solo como PostgreSQL gestionado**. |
| 3 | Usuarios vs. credenciales | Son dos conceptos distintos: `users` (personas que inician sesión en la app) y `entity_credentials` (accesos a portales externos). |
| 4 | Semanas del mes | **Formato B, bloques fijos:** S1 = días 1–7, S2 = 8–14, S3 = 15–21, S4 = 22–fin de mes (7 a 10 días). |
| 5 | Semana en egresos | Se deriva de `payment_date` (columna generada). En la UI se elige la semana para acotar el selector de fecha, pero no se guarda por separado. |
| 6 | Total de egresos | Nunca se almacena; se calcula en vistas. |
| 7 | Honorarios en egresos | Una vista une los egresos manuales y los pagos de honorarios. La categoría "Honorarios" (`system_code = 'FEES'`) se alimenta **solo** del módulo de honorarios y no se puede elegir en egresos manuales. Los honorarios facturados (p. ej. un abogado externo) se registran como egreso manual en su categoría (p. ej. "Jurídico"). |
| 8 | Fecha que manda en egresos | `payment_date` (criterio de caja), tanto para egresos manuales como para pagos de honorarios. |
| 9 | Pago de honorarios | Se registra un **valor en dinero por fecha trabajada**, sin tarifas. Festivo es una marca (`is_holiday`) sugerida por el sistema. |
| 10 | Prestadores | Separados en `service_providers` (identidad y cuenta bancaria) y `provider_contracts` (fechas, acuerdo, periodicidad, monto mensual de referencia). |
| 11 | Monto del contrato | Es un **monto mensual de referencia** (F10). Lo pagado se calcula por mes trabajado; superarlo genera un aviso, no un bloqueo. No hay saldo total del contrato. |
| 12 | Roles | `super_admin` (plataforma: gestiona organizaciones y catálogos globales) y `admin` (todo dentro de los paquetes de su organización, incluidos ver credenciales y gestionar usuarios de la organización). Los paquetes los define el super admin por organización (decisión 19). |
| 13 | Idioma | Base de datos y código en **inglés**. Interfaz en **español**. |
| 14 | Responsables | Personas de contacto, independientes de los usuarios de la app. |
| 15 | Cuentas aéreas | Módulo aparte: sus movimientos **no** entran en la matriz de Egresos. Cada cuenta de un operador aéreo tiene un límite de crédito (0 = prepago) y su saldo nunca baja de `−límite`. Una emisión resta saldo esté Por cobrar o Cobrada (F18; reemplaza a Clic Kiu, F11). |
| 16 | Agenda de pagos | Registra obligaciones y sus fechas límite, **no los pagos**. Las fechas las ingresa el usuario: AndERP no calcula el calendario tributario. Alertas solo dentro de la app (F13). |
| 17 | Forma de pago | El contrato se paga **por días trabajados** (F04) o con un **monto fijo** por mes trabajado (F16), nunca de las dos formas. AndERP registra lo pagado; **no calcula nómina** (seguridad social, prestaciones, retenciones). |
| 18 | Documento del contrato | Un archivo vigente por contrato (PDF, `.doc` o `.docx`, hasta 10 MB) en Supabase Storage. Se lee con URL firmada; nunca se borra del bucket (F17). Sin respaldo de archivos: riesgo aceptado por el usuario. |
| 19 | Módulos por organización | El super admin enciende o apaga **paquetes** por organización (F19): Base (Egresos, Departamentos, Usuarios; siempre), Personal y pagos (`staff_payments`), Credenciales y Responsables (`credentials`), Cuentas aéreas y Operadores aéreos (`air_accounts`), Agenda y notificaciones (`agenda`). Una organización nueva nace solo con Base. Apagar un paquete no borra datos; los pagos ya registrados siguen en Egresos. El super admin tampoco se salta los paquetes dentro de una organización. |

---

## 3. Glosario (UI ↔ código)

| Interfaz (español) | Base de datos / código (inglés) |
|---|---|
| Organización | `organizations` |
| Usuario de la app | `users` |
| Miembro de organización | `organization_members` |
| Categoría de egreso (se muestra como "Departamento") | `expense_categories` |
| Egreso | `expenses` |
| Personal (antes "Prestador de servicios") | `service_providers` |
| Contrato | `provider_contracts` |
| Forma de pago (Por días trabajados / Monto fijo) | `payment_mode` (`daily` / `fixed`) |
| Pago por días (antes "Pago de honorarios") | `fee_payments` |
| Día trabajado | `fee_payment_days` |
| Pago de monto fijo | `fixed_payments` |
| Documento del contrato | `contract_documents` |
| Responsable | `responsible_persons` |
| Credencial de entidad | `entity_credentials` |
| Banco / Tipo de cuenta / Tipo de documento | `banks` / `account_types` / `document_types` |
| Periodicidad de pago | `payment_frequency` |
| Semana del mes | `week_of_month` |
| Registro de auditoría | `audit_logs` |
| Operador aéreo | `air_operators` |
| Cuenta aérea (Prepago si el límite es 0, Crédito si es mayor) | `air_accounts` (`credit_limit`) |
| Movimiento de la cuenta (Saldo inicial / Recarga / Pago al operador / Reembolso / Emisión) | `air_account_movements` (`opening_balance` / `recharge` / `payment` / `refund` / `issue`) |
| Estado de cobro de la emisión (Por cobrar / Cobrado) | `air_collection_status` (`pending` / `collected`) |
| Obligación (agenda de pagos) | `payment_obligations` |
| Vencimiento | `obligation_due_dates` |
| Periodicidad de la obligación | `obligation_frequency` |
| Notificación (Próximo / Vencido) | `notification_kind` (`obligation_upcoming` / `obligation_overdue`); lo visto y descartado, en `notification_states` |

Los nombres en inglés no se renombran para seguir a la interfaz (decisión del usuario, 2026-10-22): `service_providers`, `provider_contracts`, `fee_payments` y `fee_payment_days` siguen igual en la base de datos, en los módulos de la API (`service-providers`, `fee-payments`), en las rutas `/api/v1/...`, en los códigos de error y en las acciones de auditoría (`fee_payment.create`…). Este glosario es la traducción.

---

## 4. Arquitectura

### 4.1 Estilo

**Monolito modular** con NestJS. Una sola aplicación desplegable, dividida en módulos con fronteras claras. La **arquitectura hexagonal** (dominio / aplicación / infraestructura, con puertos y adaptadores) se aplica **solo en los módulos con lógica de dominio real**. Se planeó para `auth`, `fee-payments` y `credentials`, pero hoy solo `auth` la tiene: en `fee-payments` y `credentials` cada puerto habría tenido una sola implementación, así que usan funciones puras, un servicio y triggers (notas de implementación de F04 y F06). El resto usa controlador → servicio → repositorio, sin capas vacías.

Se descartaron: hexagonal estricta en todos los módulos (sobrecarga sin beneficio en un sistema con mucho CRUD) y microservicios (complejidad operativa injustificada; las fronteras de módulo permiten extraer servicios más adelante).

### 4.2 Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript (backend, frontend y paquete compartido) |
| Backend | NestJS |
| Acceso a datos | Drizzle ORM + `drizzle-kit`; triggers, vistas y restricciones EXCLUDE en SQL escrito a mano |
| Base de datos | PostgreSQL en Supabase (solo como Postgres) |
| Frontend | React + Vite |
| Enrutamiento | TanStack Router |
| Estado del servidor | TanStack Query |
| Formularios y validación | React Hook Form + Zod (esquemas compartidos con el backend) |
| Tablas y UI | TanStack Table + shadcn/ui |
| Contexto de petición | `nestjs-cls` (AsyncLocalStorage) |
| Hash de contraseñas | argon2id con `@node-rs/argon2` |
| Cifrado de credenciales | AES-256-GCM (módulo `crypto` de Node) |
| Logs | `pino` |
| Documentación de la API | OpenAPI con `@nestjs/swagger` |
| Pruebas | Vitest, Testcontainers (Postgres), Supertest, Testing Library, Playwright |
| Repositorio | Monorepo con pnpm workspaces |

### 4.3 Estructura del monorepo

```
apps/
  api/                     NestJS
    src/
      modules/
        auth/              ◆ hexagonal: login, refresh, bloqueo, recuperación de contraseña
        organizations/       CRUD de organizaciones (super admin) y miembros
        catalogs/            CRUD de bancos, tipos de cuenta, tipos de documento y categorías
        service-providers/   prestadores y contratos
        fee-payments/        invariantes de semana y días (funciones puras + triggers)
        expenses/            CRUD de egresos manuales y lectura de vistas (reports.service: matriz mensual, libro de egresos)
        responsible-persons/ CRUD de responsables
        credentials/         cifrado AES-256-GCM (credential-cipher.ts), servicio y rotación de llaves
        audit/               escritura de audit_logs
        air-accounts/        operadores, cuentas aéreas, movimientos y cupo (F18)
        obligations/         agenda de pagos a entidades (F13)
        mail/                envío de correos (invitaciones y recuperación)
        health/              healthcheck para el despliegue
      shared/              conexión a la DB, contexto de organización, guards, errores, logging
  web/                     React + Vite
packages/
  shared/                  esquemas Zod, enums, weekOfMonth(), weekRange(), festivos de Colombia, utilidades de dinero
```

◆ = módulo con capas de dominio, aplicación e infraestructura separadas.

---

## 5. Modelo de datos

### 5.1 Convenciones

- **Nombres:** inglés, `snake_case`, tablas en plural.
- **Esquema:** todas las tablas, vistas y funciones van en el esquema `anderp`. Nunca en `public`.
- **Claves primarias:** `id uuid`, generado en el backend como **UUIDv7**.
- **Columnas de auditoría** (en todas las tablas salvo que se indique lo contrario): `created_at timestamptz`, `created_by uuid`, `updated_at timestamptz`, `updated_by uuid`, `deleted_at timestamptz NULL`, `deleted_by uuid NULL`. En adelante se abrevian como `audit`.
- **Borrado lógico:** un registro con `deleted_at` no nulo está borrado. Todos los índices únicos de negocio son **parciales** (`WHERE deleted_at IS NULL`), para poder volver a crear un registro después de borrarlo.
- **Tiempos:** los momentos van en `timestamptz` y las fechas de negocio en `date`. La zona horaria de negocio es `America/Bogota`.
- **Dinero:** `numeric(14,2)`. Las sumas se hacen en SQL; nunca con `number` de JavaScript. Moneda única: COP.
- **Aislamiento entre organizaciones:** toda tabla de una organización tiene `organization_id uuid NOT NULL` y `UNIQUE (organization_id, id)`. Las FK entre tablas de organización son **compuestas** (`(organization_id, x_id) → (organization_id, id)`), de modo que la base de datos impide referencias entre organizaciones distintas.
- **Enums de Postgres** para valores de los que depende la lógica del código; **tablas de catálogo** para valores que el usuario puede ampliar.
- **Extensiones:** `citext` y `btree_gist`.

### 5.2 Enums

| Enum | Valores |
|---|---|
| `organization_status` | `active`, `suspended` |
| `user_status` | `active`, `locked`, `inactive` |
| `member_role` | `admin` |
| `app_module` | `staff_payments`, `credentials`, `air_accounts`, `agenda` |
| `payment_frequency` | `weekly`, `biweekly`, `monthly`, `bimonthly` |
| `payment_mode` | `daily`, `fixed` |
| `air_movement_type` | `opening_balance`, `recharge`, `payment`, `refund`, `issue` |
| `air_collection_status` | `pending`, `collected` |
| `obligation_frequency` | `once`, `monthly`, `bimonthly`, `quarterly`, `semiannual`, `annual` |
| `notification_kind` | `obligation_upcoming`, `obligation_overdue` |

### 5.3 Núcleo: organizaciones y autenticación

**`organizations`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | varchar(100) NOT NULL | |
| tax_id | varchar(20) NOT NULL | NIT. UNIQUE parcial |
| status | organization_status NOT NULL | default `active` |
| modules | app_module[] NOT NULL | default `{}`. Paquetes encendidos (F19); Base no se guarda |
| audit | | |

**`users`** (global: un usuario puede pertenecer a varias organizaciones)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| email | citext NOT NULL | UNIQUE parcial; no distingue mayúsculas |
| password_hash | text NULL | argon2id en formato PHC. NULL mientras una invitación no se acepta |
| first_name | varchar(30) NOT NULL | |
| last_name | varchar(30) NOT NULL | |
| is_super_admin | boolean NOT NULL | default `false` |
| status | user_status NOT NULL | default `active` |
| failed_login_attempts | smallint NOT NULL | default 0 |
| locked_until | timestamptz NULL | |
| last_login_at | timestamptz NULL | |
| audit | | |

**`organization_members`**
| Columna | Tipo | Notas |
|---|---|---|
| user_id | uuid FK → users | |
| organization_id | uuid FK → organizations | |
| role | member_role NOT NULL | |
| is_active | boolean NOT NULL | default `true`. Desactivación por organización |
| last_selected_at | timestamptz NULL | Última vez que el usuario eligió esta organización en el selector (F20); el login entra en la de fecha más reciente |
| audit | | |

PK `(user_id, organization_id)`.

**`sessions`** (refresh tokens con rotación; sin columnas `audit`)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| organization_id | uuid NOT NULL | Organización activa de la sesión (F20). FK compuesta `(user_id, organization_id)` → `organization_members` (`sessions_membership_fk`) |
| family_id | uuid NOT NULL | agrupa los tokens rotados de un mismo inicio de sesión |
| token_hash | text NOT NULL | SHA-256 del token; nunca el token en claro |
| expires_at | timestamptz NOT NULL | |
| revoked_at | timestamptz NULL | |
| ip | inet NULL | |
| user_agent | text NULL | |
| created_at | timestamptz NOT NULL | |

**`password_resets`** (sin columnas `audit`)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| purpose | varchar(10) NOT NULL | `CHECK (purpose IN ('reset', 'invite'))` |
| token_hash | text NOT NULL | SHA-256 del token |
| expires_at | timestamptz NOT NULL | `reset`: 30 minutos; `invite`: 72 horas |
| used_at | timestamptz NULL | un token solo se usa una vez |
| created_at | timestamptz NOT NULL | |

### 5.4 Catálogos

**Globales** (sin `organization_id`; los gestiona el super admin):

| Tabla | Columnas | Restricciones |
|---|---|---|
| `banks` | id, name varchar(60), is_active boolean, audit | UNIQUE parcial (name) |
| `account_types` | id, name varchar(30), is_active boolean, audit | UNIQUE parcial (name) |
| `document_types` | id, code varchar(5), name varchar(40), is_active boolean, audit | UNIQUE parcial (code) |

`is_active = false` retira un valor de los selectores sin romper los registros que ya lo usan.

**Datos iniciales:** `account_types`: Ahorros, Corriente. `document_types`: CC, NIT, CE, PAS, TI, PPT. `banks`: los principales bancos de Colombia.

**Por organización:**

**`expense_categories`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| name | varchar(40) NOT NULL | UNIQUE parcial (organization_id, name) |
| system_code | varchar(20) NULL | UNIQUE parcial (organization_id, system_code) |
| is_active | boolean NOT NULL | default `true` |
| sort_order | smallint NOT NULL | orden de las filas en la matriz |
| audit | | |

**Datos iniciales al crear una organización:** Administrativo, Honorarios (`system_code = 'FEES'`), Comercial, Jurídico, Tributario, Nómina, Gastos extras.

**Reglas:**
- Una categoría con `system_code` no se puede renombrar, desactivar ni borrar (lo aplican el backend y un trigger).
- Una categoría con egresos no se borra; se desactiva.

### 5.5 Prestadores, contratos y honorarios

**`service_providers`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| name | varchar(100) NOT NULL | |
| document_type_id | uuid FK → document_types NOT NULL | |
| document_number | varchar(20) NOT NULL | |
| description | text NULL | |
| bank_id | uuid FK → banks NULL | |
| account_type_id | uuid FK → account_types NULL | |
| account_number | varchar(30) NULL | |
| is_active | boolean NOT NULL DEFAULT true | F09: inactivo = sin contratos nuevos |
| audit | | |

- `UNIQUE (organization_id, document_type_id, document_number) WHERE deleted_at IS NULL`.
- `CHECK`: `bank_id`, `account_type_id` y `account_number` son todos NULL o todos tienen valor.

**`provider_contracts`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| service_provider_id | uuid NOT NULL | FK compuesta → service_providers |
| start_date | date NOT NULL | |
| end_date | date NULL | NULL = sin fecha de fin |
| work_agreement | text NOT NULL | acuerdo de trabajo |
| payment_frequency | payment_frequency NOT NULL | informativo en la v1 |
| payment_mode | payment_mode NOT NULL DEFAULT 'daily' | F16: `daily` admite solo `fee_payments`; `fixed`, solo `fixed_payments`. No cambia si hay pagos (trigger) |
| monthly_amount | numeric(14,2) NOT NULL | Monto mensual de referencia (F10). `CHECK (monthly_amount > 0)` |
| audit | | |

- `CHECK (end_date IS NULL OR end_date >= start_date)`.
- `EXCLUDE USING gist (service_provider_id WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE (deleted_at IS NULL)`: un prestador no puede tener dos contratos con fechas que se crucen.

**`fee_payments`** (cabecera: un pago por contrato y semana)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| contract_id | uuid NOT NULL | FK compuesta → provider_contracts |
| period_year | smallint NOT NULL | `CHECK (period_year BETWEEN 2000 AND 2100)` |
| period_month | smallint NOT NULL | `CHECK (period_month BETWEEN 1 AND 12)` |
| week_of_month | smallint NOT NULL | `CHECK (week_of_month BETWEEN 1 AND 4)` |
| period_start | date GENERATED | primer día del mes + (semana − 1) × 7 |
| period_end | date GENERATED | semanas 1–3: period_start + 6; semana 4: último día del mes |
| payment_date | date NOT NULL | determina en qué mes y semana aparece en egresos |
| notes | text NULL | |
| audit | | |

- `UNIQUE (contract_id, period_year, period_month, week_of_month) WHERE deleted_at IS NULL`: no se paga dos veces la misma semana de un contrato.
- `payment_date` no tiene restricción respecto al periodo (se permiten pagos anticipados y posteriores).

**`fee_payment_days`** (detalle: una fila por fecha trabajada; sin borrado lógico propio)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| fee_payment_id | uuid NOT NULL | FK compuesta → fee_payments, `ON DELETE CASCADE` |
| work_date | date NOT NULL | |
| amount | numeric(14,2) NOT NULL | `CHECK (amount >= 0)` |
| is_holiday | boolean NOT NULL | lo sugiere el sistema; queda fijo al guardarlo |
| created_at, updated_at | timestamptz | |

- `UNIQUE (fee_payment_id, work_date)`.
- **Trigger:** `work_date` debe estar dentro de `period_start..period_end` de la cabecera **y** dentro de las fechas del contrato.

**`fixed_payments`** (F16: pago de monto fijo; varios por contrato y mes)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| contract_id | uuid NOT NULL | FK compuesta → provider_contracts |
| period_year | smallint NOT NULL | `CHECK (period_year BETWEEN 2000 AND 2100)` |
| period_month | smallint NOT NULL | `CHECK (period_month BETWEEN 1 AND 12)` |
| payment_date | date NOT NULL | determina en qué mes y semana aparece en egresos |
| amount | numeric(14,2) NOT NULL | `CHECK (amount > 0)` |
| notes | text NULL | |
| audit | | |

- **Triggers:** el contrato debe ser `fixed` (y `fee_payments` exige `daily`); el mes trabajado debe cruzarse con las fechas del contrato; `contract_id`, `period_year` y `period_month` no cambian. Las reglas de contratos sobre pagos (no borrar con pagos, no excluir pagos al cambiar fechas) cubren también esta tabla.

**Reglas de dominio (backend):**
- Un pago de honorarios tiene al menos un día.
- Al editar un pago, sus días se reemplazan dentro de una transacción.
- Lo pagado por mes trabajado se compara con `monthly_amount` solo como referencia: la web avisa si se supera, pero no se bloquea (F10).
- Los festivos de Colombia se calculan en `packages/shared`; no hay tabla de festivos.

### 5.6 Egresos

**`expenses`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| category_id | uuid NOT NULL | FK compuesta → expense_categories |
| concept | text NOT NULL | |
| invoice_number | varchar(40) NULL | opcional y no único |
| payment_date | date NOT NULL | |
| amount | numeric(14,2) NOT NULL | `CHECK (amount > 0)` |
| week_of_month | smallint GENERATED | `LEAST((EXTRACT(DAY FROM payment_date)::int - 1) / 7 + 1, 4)` |
| audit | | |

- `INDEX (organization_id, payment_date) WHERE deleted_at IS NULL`.
- **Trigger:** rechaza `category_id` cuando la categoría tiene `system_code = 'FEES'`.

### 5.7 Vistas

**`v_fee_payment_totals`**: por cada `fee_payments` no borrado: `fee_payment_id`, `organization_id`, `contract_id`, `total_amount = SUM(fee_payment_days.amount)`.

**`v_contract_month_totals`** (F10, reemplaza a `v_contract_balances`): por contrato y mes trabajado: `organization_id`, `contract_id`, `period_year`, `period_month`, `paid_amount` (suma de pagos no borrados, por días y de monto fijo, F16).

**`v_expense_ledger`**: libro unificado, `UNION ALL` de egresos, pagos por días y pagos de monto fijo (F16: `source = 'fixed_payment'`, categoría `FEES`, concepto `'Pago – ' || persona || ' – ' || mes/año trabajado`, mes y semana de `payment_date`, `amount`). Los dos primeros:

| Columna | Desde `expenses` | Desde `fee_payments` |
|---|---|---|
| organization_id | organization_id | organization_id |
| source | `'manual'` | `'fee_payment'` |
| source_id | id | id |
| category_id | category_id | categoría `FEES` de la organización |
| concept | concept | `'Honorarios – ' \|\| nombre del prestador \|\| ' – Sem ' \|\| week_of_month \|\| ' ' \|\| mes/año del periodo` |
| invoice_number | invoice_number | NULL |
| payment_date | payment_date | payment_date |
| year, month | de payment_date | de payment_date |
| week_of_month | columna generada | calculada de payment_date con la misma fórmula |
| amount | amount | total de `v_fee_payment_totals` |

Excluye los registros borrados de ambos orígenes.

**`v_expense_monthly_summary`**: agrupa `v_expense_ledger` por `organization_id, year, month, category_id, week_of_month` con `SUM(amount)`. Alimenta la matriz. Los totales por categoría, por semana y del mes se calculan sobre esta vista.

Todas son vistas normales (no materializadas).

### 5.8 Responsables y credenciales

**`responsible_persons`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| first_name | varchar(30) NOT NULL | |
| last_name | varchar(30) NOT NULL | |
| email | citext NULL | |
| phone | varchar(20) NULL | |
| audit | | |

- `CHECK (email IS NOT NULL OR phone IS NOT NULL)`.

**`entity_credentials`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| responsible_person_id | uuid NULL | FK compuesta → responsible_persons |
| entity_name | varchar(100) NOT NULL | |
| username | varchar(254) NOT NULL | email o usuario del portal |
| url | text NULL | `CHECK (char_length(url) <= 2048)` |
| contact_1 | varchar(50) NULL | |
| contact_2 | varchar(50) NULL | |
| notes | text NULL | información extra |
| password_ciphertext | bytea NOT NULL | |
| password_iv | bytea NOT NULL | 12 bytes, único por cifrado |
| password_auth_tag | bytea NOT NULL | |
| key_version | smallint NOT NULL | versión de la llave con la que se cifró |
| audit | | |

- `UNIQUE (organization_id, entity_name, username) WHERE deleted_at IS NULL`.

### 5.9 Auditoría

**`audit_logs`** (solo inserción; el rol de la base de datos que usa la app no tiene `UPDATE` ni `DELETE` sobre esta tabla; sin columnas `audit`)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NULL | NULL = acción de plataforma |
| user_id | uuid NULL FK → users | NULL en logins fallidos de emails inexistentes |
| action | varchar(50) NOT NULL | p. ej. `credential.reveal`, `expense.update`, `auth.login_failed` |
| entity_type | varchar(50) NULL | |
| entity_id | uuid NULL | |
| changes | jsonb NULL | antes/después; nunca incluye secretos |
| ip | inet NULL | |
| user_agent | text NULL | |
| created_at | timestamptz NOT NULL | |

- `INDEX (organization_id, created_at)`, `INDEX (entity_type, entity_id)`.

**Se registra:** crear, editar y borrar en `expenses`, `fee_payments` (incluidos sus días), `provider_contracts`, `air_accounts` (crear y editar; no se borran), `air_account_movements`, `entity_credentials` (nunca con la contraseña ni sus datos cifrados), `payment_obligations` y `obligation_due_dates` (incluidos completar y crear, cambiar o quitar el pendiente); revelar una credencial; y los eventos de auth (login, login fallido, bloqueo, cambio y recuperación de contraseña).

**Atomicidad (F12):** el cambio y su registro se escriben en la misma transacción (`audit.log(entry, tx)`): si falla la auditoría, el cambio no queda. Los eventos de auth y `credential.reveal` se auditan fuera de cualquier transacción de negocio.

**No se registra:** los cambios en catálogos (los cubren `created_by` y `updated_by`), ni ver o descartar notificaciones (F14, §5.12): es estado de la interfaz de cada usuario, no un dato del negocio.

### 5.10 Cuentas aéreas (F18)

Reemplaza a Clic Kiu (F11): `clickiu_movements`, `v_clickiu_balance`, sus triggers y sus enums se eliminaron en las migraciones 0030–0033 de F18.

**`air_operators`** (catálogo de la organización; no se audita, §5.9)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| name | varchar(120) NOT NULL | sin espacios sobrantes; UNIQUE parcial (organization_id, lower(name)) → `DUPLICATE_NAME` |
| is_active | boolean NOT NULL | default `true`; no se borra, se desactiva |
| audit | | |

**`air_accounts`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| operator_id | uuid NOT NULL | FK compuesta → `air_operators` |
| name | varchar(120) NOT NULL | UNIQUE parcial (organization_id, operator_id, lower(name)) → `DUPLICATE_NAME` |
| credit_limit | numeric(14,2) NOT NULL | default 0, `CHECK (credit_limit >= 0)`; 0 = prepago |
| is_active | boolean NOT NULL | default `true`; inactiva = no acepta movimientos nuevos |
| audit | | |

**`air_account_movements`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| account_id | uuid NOT NULL | FK compuesta → `air_accounts`; no cambia después de crear (trigger) |
| type | air_movement_type NOT NULL | no cambia después de crear (trigger) |
| movement_date | date NOT NULL | |
| amount | numeric(14,2) NOT NULL | siempre positivo; el saldo inicial puede ser negativo, nunca 0 |
| description | varchar(500) NULL | |
| pnr | varchar(6) NULL | solo emisiones; `^[A-Z0-9]{6}$` |
| ticket_number | varchar(13) NULL | solo emisiones; `^[0-9]{13}$`; UNIQUE parcial (organization_id, ticket_number) |
| passenger | varchar(120) NULL | solo emisiones |
| net_fare, taxes | numeric(14,2) NULL | solo emisiones; `>= 0` |
| collection_status | air_collection_status NULL | solo emisiones |
| audit | | |

- `air_account_movements_ticket_ck` (`AIR_MOVEMENT_TICKET_FIELDS_MISMATCH`): las seis columnas del tiquete son no nulas si `type = 'issue'` y nulas en cualquier otro tipo.
- `air_account_movements_amount_ck` y `air_account_movements_fare_ck` (`AIR_MOVEMENT_AMOUNT_INVALID`): `amount <> 0`; `amount > 0` salvo en `opening_balance`; en `issue`, `amount = net_fare + taxes` (la API lo calcula en SQL), con `net_fare` y `taxes` `>= 0`.
- `air_account_movements_opening_uq` (`AIR_OPENING_BALANCE_EXISTS`): un `opening_balance` no borrado por cuenta.
- `INDEX (organization_id, account_id, movement_date) WHERE deleted_at IS NULL`.
- **Trigger de inmutables** (`BEFORE UPDATE`): cambiar `type` o `account_id` → `AIR_MOVEMENT_TYPE_IMMUTABLE` / `AIR_MOVEMENT_ACCOUNT_IMMUTABLE`.
- **Regla del cupo:** constraint triggers diferidos (`AFTER INSERT OR UPDATE` en `air_account_movements`; `AFTER UPDATE OF credit_limit` en `air_accounts`). Toman `pg_advisory_xact_lock(18, hashtext(account_id::text))` y rechazan si `available < 0` en `v_air_account_balances`: `AIR_ACCOUNT_INSUFFICIENT_BALANCE` si `credit_limit = 0` y `AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED` si es mayor. Cubren emisiones nuevas o mayores, entradas reducidas o borradas y límites reducidos, y serializan las operaciones simultáneas sobre la misma cuenta. Rechazan con `25000` las transacciones en `REPEATABLE READ`, por la misma razón que tenía Clic Kiu: la foto de la transacción no vería lo confirmado por otra.
- **Bloqueos de aplicación** (`pg_advisory_xact_lock`): siempre con la forma de dos claves `(clase, objeto)`. La clase es una constante por regla, registrada aquí: `18` = cupo de una cuenta aérea. `11` (saldo de Clic Kiu) quedó retirada y no se reutiliza. La forma de una sola clave no se usa.

**`v_air_account_balances`** (`security_invoker`): por cuenta, `balance` = suma de los movimientos no borrados con las emisiones en negativo, y `available = balance + credit_limit`. Es la única fórmula del saldo: la usan los triggers, el listado de cuentas, el consolidado por operador y el saldo actual de la API. Los totales filtrados por fechas, tipo o estado de cobro se calculan en la consulta de la API con `SUM … FILTER`.

### 5.11 Agenda de pagos (F13)

**`payment_obligations`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| entity_name | varchar(100) NOT NULL | DIAN, Fontur… (texto libre) |
| concept | varchar(150) NOT NULL | "IVA bimestral"… |
| frequency | obligation_frequency NOT NULL | solo sugiere la fecha siguiente |
| notice_days | smallint NOT NULL | default 15; `CHECK (notice_days BETWEEN 0 AND 365)` |
| notes | text NULL | |
| audit | | |

- `UNIQUE (organization_id, lower(entity_name), lower(concept)) WHERE deleted_at IS NULL`.

**`obligation_due_dates`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| obligation_id | uuid NOT NULL | FK compuesta → payment_obligations |
| due_date | date NOT NULL | fecha límite |
| completed_at | timestamptz NULL | NULL = pendiente |
| completed_by | uuid NULL FK → users | `CHECK ((completed_at IS NULL) = (completed_by IS NULL))` |
| audit | | |

- `UNIQUE (obligation_id) WHERE completed_at IS NULL AND deleted_at IS NULL`: un solo pendiente por obligación.
- `UNIQUE (obligation_id, due_date) WHERE deleted_at IS NULL`.
- **Trigger:** un vencimiento completado no cambia de `due_date` ni de `obligation_id` (`DUE_DATE_COMPLETED_IMMUTABLE`).
- **Estado** (calculado en la consulta con `todayIn()`, no se guarda): Vencido, Próximo (hasta `notice_days` días), Programado o Sin próximo.

### 5.12 Notificaciones (F14)

Las notificaciones **no se guardan**: son los vencimientos pendientes en estado Próximo o Vencido (§5.11), calculados al consultar. Una notificación es el par `(due_date_id, kind)`. Solo se guarda lo que cada usuario hizo con ella.

**`notification_states`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| user_id | uuid NOT NULL FK → users | lo pone la sesión |
| due_date_id | uuid NOT NULL | FK compuesta → obligation_due_dates |
| kind | notification_kind NOT NULL | |
| seen_at | timestamptz NULL | al abrir el panel |
| dismissed_at | timestamptz NULL | al descartar |
| created_at, updated_at | timestamptz NOT NULL | |

- `UNIQUE (organization_id, id)` y `UNIQUE (user_id, due_date_id, kind)` (destino del upsert).
- **Excepciones a §5.1:** sin `created_by`, `updated_by` ni borrado lógico (el autor es siempre `user_id` y descartar no es borrar), y sin auditoría (§5.9).
- Las filas de vencimientos completados o borrados se quedan: la consulta parte de las alertas activas y no las vuelve a leer.

### 5.13 Documento del contrato (F17)

**`contract_documents`** (un archivo por fila; el vigente es el no borrado)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| contract_id | uuid NOT NULL | FK compuesta → provider_contracts |
| storage_key | text NOT NULL | `org/{organizationId}/contracts/{contractId}/{uuid}`; `UNIQUE` |
| file_name | varchar(255) NOT NULL | nombre original, solo para mostrar y descargar |
| content_type | varchar(100) NOT NULL | CHECK: PDF, `application/msword` o `.docx` |
| size_bytes | integer NOT NULL | CHECK: 1 a 10 485 760 |
| sha256 | char(64) NOT NULL | CHECK: hexadecimal |
| audit | | |

- `UNIQUE (contract_id) WHERE deleted_at IS NULL`: un solo archivo vigente por contrato.
- Reemplazar marca como borrada la fila anterior e inserta la nueva en una transacción que bloquea el contrato. El objeto del bucket nunca se borra.

---

## 6. Seguridad

### 6.1 Contraseñas de usuarios

- **Hash:** argon2id con `@node-rs/argon2`; memoria 19 MiB, 2 iteraciones, paralelismo 1 (mínimo recomendado por OWASP).
- **Formato:** el hash se guarda en formato PHC. Si los parámetros guardados son menores que los actuales, se vuelve a hashear en el siguiente login exitoso.
- **Política:** mínimo 12 caracteres, sin reglas de composición, y se rechazan las contraseñas de una lista de contraseñas comunes.

### 6.2 Sesiones

- **Access token:** JWT de 15 minutos, guardado en memoria en el frontend.
- **Refresh token:** en una cookie `httpOnly`, `Secure`, `SameSite=Strict`, con duración de 7 días y rotación en cada uso.
- **Reutilización:** si se reutiliza un refresh token ya rotado, se revocan todos los tokens de esa `family_id`.
- **Organización activa (F20):** vive en la sesión (`sessions.organization_id`), no en el token ni en el usuario. El login entra en la última organización elegida (`last_selected_at`) o, si nunca eligió, la más antigua; `POST /auth/organization` la cambia para toda la familia. El guard compara el `org` del token con la de la sesión y responde `409 ORGANIZATION_CHANGED` si difieren, así una pestaña con la organización anterior no puede leer ni escribir.
- **Límites:** `@nestjs/throttler` en los endpoints de auth; tras 5 intentos fallidos, la cuenta se bloquea 15 minutos (`locked_until`).
- **Recuperación de contraseña:** la respuesta es la misma exista o no el email (no revela qué cuentas existen).

### 6.3 Credenciales de entidades

- **Cifrado:** AES-256-GCM en el backend, con un IV aleatorio de 12 bytes por cada cifrado. Como datos autenticados adicionales (AAD) se usa `organization_id:id` del registro, de modo que un texto cifrado copiado a otro registro no se puede descifrar.
- **Llave maestra:** se lee de variables de entorno o de un gestor de secretos, por versión (`CREDENTIALS_KEY_V1`, …). Nunca se guarda en la DB.
- **Rotación:** `key_version` permite rotar la llave; un script vuelve a cifrar los registros con la nueva versión.
- **Exposición:** los listados y el detalle nunca devuelven la contraseña. Solo `POST /api/v1/credentials/:id/reveal` la devuelve, y cada llamada genera un registro `credential.reveal` en `audit_logs`.

### 6.4 Aislamiento por organización y permisos

- **Contexto:** el JWT lleva `userId` y la organización activa. Un guard verifica la membresía en `organization_members` (o `is_super_admin`) en cada petición y deja en el `Actor` los `modules` de la organización, leídos en esa misma consulta (el JWT no los lleva, así apagar un paquete corta el acceso en la siguiente petición).
- **Paquetes (F19):** cada controlador de un paquete declara `@RequiresModule(...)`; sin el paquete responde `403 MODULE_DISABLED`, también al super admin. Una prueba recorre los controladores y falla si alguno no tiene paquete ni está en la lista de Base o de Plataforma.
- **`OrgScope`:** `nestjs-cls` guarda `userId` y `organizationId`. El servicio `OrgScope` (`where`, `forInsert`, `forUpdate`, `forSoftDelete`) aplica `organization_id = :orgId` y `deleted_at IS NULL` en toda consulta y llena `created_by` y `updated_by`. Cumple el papel del "repositorio base" de la constitución (principio IV); se eligió un servicio explícito porque los genéricos de Drizzle hacen incómoda una clase base tipada (F02).
- **Base de datos:** las FK compuestas impiden referencias entre organizaciones aunque falle el backend.
- **Permisos:**

| Acción | admin | super_admin |
|---|---|---|
| Operar egresos, honorarios, prestadores, responsables y credenciales de su organización | ✔ | ✔ |
| Gestionar usuarios de su organización | ✔ | ✔ |
| Gestionar categorías de egreso de su organización | ✔ | ✔ |
| Gestionar catálogos globales (bancos, tipos de cuenta, tipos de documento) | ✘ | ✔ |
| Crear y suspender organizaciones, y elegir sus paquetes | ✘ | ✔ |

Las filas de egresos, honorarios, prestadores, responsables y credenciales aplican solo si la organización tiene el paquete correspondiente (F19).

### 6.5 Almacenamiento de archivos (F17)

- Bucket **privado** `contract-documents` en Supabase Storage, sin políticas para `anon` ni `authenticated`. Solo la API lo usa, con llaves S3 de servidor (`S3_*`), que nunca llegan a la web.
- La API valida el tipo por los primeros bytes y la extensión, no por el `Content-Type` del navegador, y corta en 10 MB.
- La lectura es con una URL firmada de 5 minutos, después de comprobar el contrato con `OrgScope`. Quien tenga la URL puede abrir el archivo hasta que caduque.
- El `Content-Disposition` se fija al firmar la URL (PDF `inline`, Word `attachment`): Supabase Storage descarta el que se envía al subir y respeta el de la URL firmada (comprobado en F17-T003).
- Hay que activar la conexión S3 en *Settings → Storage* del proyecto de Supabase.
- Las llaves S3 de Supabase son de máximo privilegio (todos los buckets, sin RLS): viven solo en Render y se rotan desde *Settings → Storage → S3 Access Keys*.
- Cada usuario sube hasta 20 archivos por hora (`429`): el bucket solo crece y pasar el 1 GB gratuito restringe todo el proyecto.
- El Worker reenvía el cuerpo como stream, sin cargar el archivo en memoria.
- La ruta empieza por la organización y no incluye el nombre original.

---

## 7. API y manejo de errores

- **API:** REST bajo `/api/v1`, documentada con OpenAPI.
- **Validación:** DTOs validados con los esquemas Zod de `packages/shared` (`nestjs-zod`).
- **Dinero en JSON:** siempre como string decimal con 2 decimales (`"150000.00"`), nunca como `number`.
- **Errores de dominio:** el dominio lanza errores tipados (p. ej. `WorkDateOutsideWeekError`, `FeesCategoryNotAllowedError`). Un filtro global los traduce a respuestas en formato **RFC 9457 (Problem Details)**: `type`, `title`, `status`, `detail`, `code` (estable, en inglés `SCREAMING_SNAKE_CASE`) y `errors[]` para los errores de validación por campo.
- **Violaciones de restricciones de Postgres:**

| Código SQLSTATE | Caso | HTTP |
|---|---|---|
| `23505` | unique_violation | 409 |
| `23P01` | exclusion_violation (contratos solapados) | 409 |
| `23503` | foreign_key_violation | 422 |
| `23514` | check_violation | 422 |
| `P0001` | excepción de trigger (el `code` viaja en el mensaje) | 422 |

- **Otros errores:** cualquier error no controlado devuelve 500 con un `requestId` y se registra completo en los logs.
- **Mensajes:** el frontend traduce cada `code` a un mensaje en español. El backend no devuelve textos de interfaz.
- **Logs:** `pino` estructurado, con `requestId` por petición. Los campos `password`, `token`, `authorization` y `cookie` se ocultan automáticamente.

---

## 8. Frontend

**Pantallas de la v1:**

| Pantalla | Contenido |
|---|---|
| Login y recuperación de contraseña | |
| Egresos | Matriz categoría × semana del mes seleccionado, con totales por fila, por columna y del mes. Cada celda abre el detalle de sus egresos. Formulario de egreso: select de semana que acota el selector de fecha, sin la categoría "Honorarios". Las filas de honorarios enlazan a su pago. |
| Pagos de honorarios | Listado filtrable por mes, prestador y semana. Formulario: contrato → año/mes/semana → cuadrícula con los días del rango (marcando festivos) y un valor por día, fecha de pago y total calculado. Lo pagado en el mes trabajado frente al monto mensual, con aviso si se supera (no bloquea). |
| Prestadores | Listado y detalle con sus contratos, monto mensual y pagado este mes. |
| Credenciales | Listado sin contraseñas; botón "Revelar" (se registra en auditoría) y copiar al portapapeles. |
| Responsables | CRUD. |
| Cuentas aéreas | Tarjetas por operador (saldo, cupo, disponible y por cobrar de sus cuentas activas) y tabla de cuentas con su modalidad, saldo y disponible. Cada cuenta abre sus movimientos: tarjetas Entradas, Emitido, Por cobrar, Saldo al corte y Disponible, que cambian con los filtros (fechas, tipo y estado de cobro); tabla con "Marcar como cobrado"; diálogos de emisión (con el total y el disponible), recarga, pago, reembolso y saldo inicial (F18). |
| Agenda | Obligaciones por urgencia (pestañas Vencidos, Próximos, Programados, Sin próximo), completar con la fecha siguiente sugerida e historial. El menú muestra un contador de vencidas y próximas. |
| Notificaciones (cabecera) | Campana con un punto si hay notificaciones sin revisar (sin número). Abre un panel con las alertas de la Agenda: pulsar lleva a la pestaña de la Agenda, la X la descarta; abrir el panel las marca como vistas (F14). |
| Configuración (admin) | Categorías de egreso, operadores aéreos y usuarios de la organización. |
| Plataforma (super admin) | Organizaciones (con una casilla por paquete y la acción **Módulos**, que pide confirmación al quitar uno) y catálogos globales. |

**Selector de organización (F20):** con dos o más organizaciones disponibles, el nombre de la organización en la cabecera es un menú desplegable. Al elegir otra, la página se recarga completa en `/egresos` y las demás pestañas se recargan al recibir un aviso por `BroadcastChannel`.

El menú y las rutas solo muestran los paquetes que tiene la organización (F19): una ruta de un paquete apagado redirige a Egresos y la campana de notificaciones solo aparece con `agenda`.

La interfaz está en español y el formato de moneda es COP (`es-CO`).

**Celular (F15):** por debajo de 768 px (`useIsMobile`), `DataTable` muestra cada fila como una tarjeta con una línea "Etiqueta: valor" por columna y las acciones al pie; no se oculta ninguna columna. Los diálogos se desplazan por dentro si no caben en el alto de la pantalla. La matriz de Egresos y la cuadrícula de honorarios siguen siendo vistas de escritorio (desplazamiento horizontal).

---

## 9. Pruebas

| Nivel | Cobertura | Herramienta |
|---|---|---|
| Unitarias | `weekOfMonth`, `weekRange`, festivos de Colombia, invariantes de `fee-payments`, cifrado y descifrado de credenciales, política de contraseñas | Vitest |
| Integración | Restricciones, triggers, columnas generadas, EXCLUDE, vistas (en especial que `v_expense_ledger` no duplique) y repositorios | Vitest + Testcontainers (Postgres real) |
| API | Login, refresh con rotación y detección de reutilización, bloqueo por intentos, **aislamiento entre organizaciones** (un usuario de A no lee ni escribe en B), permisos admin vs. super admin, revelar credencial genera auditoría | Vitest + Supertest |
| Frontend | Matriz de egresos, cuadrícula de honorarios, formularios | Testing Library |
| E2E | Humo: login → registrar egreso → verlo en la matriz; registrar pago de honorarios → verlo en la categoría Honorarios | Playwright |

**Casos borde obligatorios:**
- Semana 4 de febrero (7 días), de meses de 30 días (9 días) y de meses de 31 días (10 días).
- Febrero de año bisiesto.
- Egreso el día 7 frente al día 8.
- Pago de honorarios con fecha de pago en un mes distinto al del periodo.

---

## 10. Migraciones, entornos y despliegue

- **Migraciones:** `drizzle-kit` genera el SQL de las tablas; los triggers, las vistas, las restricciones EXCLUDE y los permisos del rol de la app van en migraciones SQL escritas a mano. Todo queda versionado en el repositorio y se aplica en orden.
- **Datos iniciales:** catálogos globales y una organización inicial con su usuario super admin (la contraseña se define por variable de entorno en el primer arranque).
- **Entornos:** local con Postgres en Docker (`docker compose`) y producción en Supabase. Staging con un segundo proyecto de Supabase cuando haga falta.
- **Rol de la base de datos:** la API se conecta con un rol propio con privilegios mínimos, distinto del rol dueño de las migraciones.
- **Despliegue de la API:** contenedor Docker en Render. Hoy en plan **Free** (se duerme tras inactividad, ~50 s al despertar); pasar a un plan de pago cuando el uso lo justifique.
- **Base de datos en producción:** Supabase en plan **Free**: sin backups automáticos y se pausa tras una semana sin uso. El respaldo propio está pendiente (`roadmap.md`, F07).
- **Despliegue de la web:** Cloudflare Worker con archivos estáticos; el Worker reenvía `/api/*` a la API agregando `X-Proxy-Secret`. La web y la API comparten origen: la cookie `SameSite=Strict` funciona y no hace falta CORS. El detalle está en `features/007-deployment/plan.md`.
- **Archivos:** Supabase Storage (protocolo S3) en producción; `adobe/s3mock` en `docker compose` y en Testcontainers (MinIO dejó de publicar imágenes; s3mock no valida firmas, eso se prueba contra Supabase). Supabase Free no respalda Storage (riesgo aceptado, F17).
- **Secretos:** `DATABASE_URL`, `JWT_SECRET`, `CREDENTIALS_KEY_V*`, `S3_*` y la configuración de correo para la recuperación de contraseña, como variables de entorno del proveedor.

---

## 11. Fuera del alcance de la v1

- Autenticación de dos factores (MFA).
- Registro autoservicio de organizaciones (el selector de organización llegó con F20).
- Permisos granulares por usuario (tablas `permissions` y `role_permissions`) y roles adicionales. Los paquetes por organización (F19) no son esto: son iguales para todos los admins de la organización.
- Alertas por `payment_frequency`.
- Adjuntar facturas a los egresos (el documento del contrato llegó con F17).
- Exportar a Excel o PDF.
- Visor de `audit_logs` en la interfaz (los datos se capturan desde la v1).
- Presupuestos y multimoneda.
- Proveedores en egresos (`supplier_id`) y unicidad de `(supplier_id, invoice_number)`.
- Vincular responsables con usuarios de la app (`user_id` opcional).
