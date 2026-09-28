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

---

## 1. Contexto y objetivos

Sistema administrativo-financiero para controlar los egresos de una empresa por categoría y semana del mes, gestionar prestadores de servicios con sus contratos, registrar el pago de honorarios por días trabajados y custodiar de forma segura las credenciales de acceso a portales de entidades externas.

**Objetivos:**

1. Ver los egresos del mes en una matriz **categoría × semana** con totales por semana, por categoría y del mes.
2. Registrar pagos de honorarios día a día por semana, ligados al contrato del prestador, con control de saldo del contrato.
3. Guardar credenciales de portales externos cifradas, con registro de quién las revela.
4. Nacer como sistema interno de una sola empresa, pero con el modelo de datos listo para operar varias organizaciones (multi-tenant) sin migrar datos.

**Criterios de éxito:**

- El total mensual de egresos nunca cuenta dos veces un mismo pago.
- La base de datos rechaza por sí misma datos inconsistentes (semanas que no cuadran con la fecha, días fuera de la semana, contratos solapados, referencias entre organizaciones distintas).
- Ninguna contraseña (de usuario o de portal externo) existe en texto plano en la base de datos ni en los logs.

---

## 2. Decisiones de negocio acordadas

| # | Tema | Decisión |
|---|---|---|
| 1 | Tenencia | Uso interno. Todas las tablas de negocio llevan `organization_id`; hoy existe una sola organización. |
| 2 | Autenticación | Propia (no Supabase Auth). Supabase se usa **solo como PostgreSQL gestionado**. |
| 3 | Usuarios vs. credenciales | Son dos conceptos distintos: `users` (personas que inician sesión en la app) y `entity_credentials` (accesos a portales externos). |
| 4 | Semanas del mes | **Formato B, bloques fijos:** S1 = días 1–7, S2 = 8–14, S3 = 15–21, S4 = 22–fin de mes (7 a 10 días). |
| 5 | Semana en egresos | Se deriva de `payment_date` (columna generada). En la UI se elige la semana para acotar el selector de fecha, pero no se guarda por separado. |
| 6 | Total de egresos | Nunca se almacena; se calcula en vistas. |
| 7 | Honorarios en egresos | Una vista une los egresos manuales y los pagos de honorarios. La categoría "Honorarios" (`system_code = 'FEES'`) se alimenta **solo** del módulo de honorarios y no se puede elegir en egresos manuales. Los honorarios facturados (p. ej. un abogado externo) se registran como egreso manual en su categoría (p. ej. "Jurídico"). |
| 8 | Fecha que manda en egresos | `payment_date` (criterio de caja), tanto para egresos manuales como para pagos de honorarios. |
| 9 | Pago de honorarios | Se registra un **valor en dinero por fecha trabajada**, sin tarifas. Festivo es una marca (`is_holiday`) sugerida por el sistema. |
| 10 | Prestadores | Separados en `service_providers` (identidad y cuenta bancaria) y `provider_contracts` (fechas, acuerdo, periodicidad, valor total). |
| 11 | "Pago total" | Es el **valor total del contrato**. Lo pagado y el saldo se calculan. |
| 12 | Roles | `super_admin` (plataforma: gestiona organizaciones y catálogos globales) y `admin` (todo dentro de su organización, incluidos ver credenciales y gestionar usuarios de la organización). |
| 13 | Idioma | Base de datos y código en **inglés**. Interfaz en **español**. |
| 14 | Responsables | Personas de contacto, independientes de los usuarios de la app. |

---

## 3. Glosario (UI ↔ código)

| Interfaz (español) | Base de datos / código (inglés) |
|---|---|
| Organización | `organizations` |
| Usuario de la app | `users` |
| Miembro de organización | `organization_members` |
| Categoría de egreso (se muestra como "Departamento") | `expense_categories` |
| Egreso | `expenses` |
| Prestador de servicios | `service_providers` |
| Contrato del prestador | `provider_contracts` |
| Pago de honorarios | `fee_payments` |
| Día de honorarios | `fee_payment_days` |
| Responsable | `responsible_persons` |
| Credencial de entidad | `entity_credentials` |
| Banco / Tipo de cuenta / Tipo de documento | `banks` / `account_types` / `document_types` |
| Periodicidad de pago | `payment_frequency` |
| Semana del mes | `week_of_month` |
| Registro de auditoría | `audit_logs` |

---

## 4. Arquitectura

### 4.1 Estilo

**Monolito modular** con NestJS. Una sola aplicación desplegable, dividida en módulos con fronteras claras. La **arquitectura hexagonal** (dominio / aplicación / infraestructura, con puertos y adaptadores) se aplica **solo en los módulos con lógica de dominio real**: `auth`, `fee-payments` y `credentials`. Los módulos CRUD usan controlador → servicio → repositorio, sin capas vacías.

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
        fee-payments/      ◆ hexagonal: invariantes de semana, días y saldo del contrato
        expenses/            CRUD de egresos manuales
        reports/             lectura de vistas (matriz mensual, libro de egresos)
        credentials/       ◆ hexagonal: CipherPort → adaptador AesGcmCipher
        audit/               escritura de audit_logs
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
| `payment_frequency` | `weekly`, `biweekly`, `monthly`, `bimonthly` |

### 5.3 Núcleo: organizaciones y autenticación

**`organizations`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | varchar(100) NOT NULL | |
| tax_id | varchar(20) NOT NULL | NIT. UNIQUE parcial |
| status | organization_status NOT NULL | default `active` |
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
| audit | | |

PK `(user_id, organization_id)`.

**`sessions`** (refresh tokens con rotación; sin columnas `audit`)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
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
| total_amount | numeric(14,2) NOT NULL | `CHECK (total_amount > 0)` |
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

**Reglas de dominio (backend):**
- Un pago de honorarios tiene al menos un día.
- Al editar un pago, sus días se reemplazan dentro de una transacción.
- Si la suma de lo pagado supera `total_amount` del contrato, se muestra una **advertencia**; no se bloquea (puede haber adiciones al contrato).
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

**`v_contract_balances`**: por contrato: `contract_id`, `total_amount`, `paid_amount` (suma de pagos no borrados) y `balance = total_amount − paid_amount`.

**`v_expense_ledger`**: libro unificado, `UNION ALL` de:

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

**Se registra:** crear, editar y borrar en `expenses`, `fee_payments` (incluidos sus días) y `provider_contracts`; revelar una credencial; y los eventos de auth (login, login fallido, bloqueo, cambio y recuperación de contraseña).

**No se registra:** los cambios en catálogos (los cubren `created_by` y `updated_by`).

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
- **Límites:** `@nestjs/throttler` en los endpoints de auth; tras 5 intentos fallidos, la cuenta se bloquea 15 minutos (`locked_until`).
- **Recuperación de contraseña:** la respuesta es la misma exista o no el email (no revela qué cuentas existen).

### 6.3 Credenciales de entidades

- **Cifrado:** AES-256-GCM en el backend, con un IV aleatorio de 12 bytes por cada cifrado. Como datos autenticados adicionales (AAD) se usa `organization_id:id` del registro, de modo que un texto cifrado copiado a otro registro no se puede descifrar.
- **Llave maestra:** se lee de variables de entorno o de un gestor de secretos, por versión (`CREDENTIALS_KEY_V1`, …). Nunca se guarda en la DB.
- **Rotación:** `key_version` permite rotar la llave; un script vuelve a cifrar los registros con la nueva versión.
- **Exposición:** los listados y el detalle nunca devuelven la contraseña. Solo `POST /api/v1/credentials/:id/reveal` la devuelve, y cada llamada genera un registro `credential.reveal` en `audit_logs`.

### 6.4 Aislamiento por organización y permisos

- **Contexto:** el JWT lleva `userId` y la organización activa. Un guard verifica la membresía en `organization_members` (o `is_super_admin`) en cada petición.
- **Repositorio base:** `nestjs-cls` guarda `userId` y `organizationId`. El repositorio base de Drizzle aplica `organization_id = :orgId` y `deleted_at IS NULL` en toda consulta y llena `created_by` y `updated_by`.
- **Base de datos:** las FK compuestas impiden referencias entre organizaciones aunque falle el backend.
- **Permisos:**

| Acción | admin | super_admin |
|---|---|---|
| Operar egresos, honorarios, prestadores, responsables y credenciales de su organización | ✔ | ✔ |
| Gestionar usuarios de su organización | ✔ | ✔ |
| Gestionar categorías de egreso de su organización | ✔ | ✔ |
| Gestionar catálogos globales (bancos, tipos de cuenta, tipos de documento) | ✘ | ✔ |
| Crear y suspender organizaciones | ✘ | ✔ |

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
| Pagos de honorarios | Listado filtrable por mes, prestador y semana. Formulario: contrato → año/mes/semana → cuadrícula con los días del rango (marcando festivos) y un valor por día, fecha de pago y total calculado. Advertencia de saldo del contrato. |
| Prestadores | Listado y detalle con sus contratos, pagado y saldo. |
| Credenciales | Listado sin contraseñas; botón "Revelar" (se registra en auditoría) y copiar al portapapeles. |
| Responsables | CRUD. |
| Configuración (admin) | Categorías de egreso y usuarios de la organización. |
| Plataforma (super admin) | Organizaciones y catálogos globales. |

La interfaz está en español y el formato de moneda es COP (`es-CO`).

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
- **Despliegue de la API:** contenedor Docker en Render (plan de pago, sin dormirse).
- **Despliegue de la web:** sitio estático en Cloudflare Pages, con una Pages Function que reenvía `/api/*` a la API agregando `X-Proxy-Secret`. La web y la API comparten origen: la cookie `SameSite=Strict` funciona y no hace falta CORS. El detalle está en `features/007-deployment/plan.md`.
- **Secretos:** `DATABASE_URL`, `JWT_SECRET`, `CREDENTIALS_KEY_V*` y la configuración de correo para la recuperación de contraseña, como variables de entorno del proveedor.

---

## 11. Fuera del alcance de la v1

- Autenticación de dos factores (MFA).
- Registro autoservicio de organizaciones y selector de organización en la interfaz (el modelo lo soporta; la v1 opera una sola organización).
- Permisos granulares (tablas `permissions` y `role_permissions`) y roles adicionales.
- Alertas por `payment_frequency`.
- Adjuntar archivos (facturas, contratos).
- Exportar a Excel o PDF.
- Visor de `audit_logs` en la interfaz (los datos se capturan desde la v1).
- Presupuestos y multimoneda.
- Proveedores en egresos (`supplier_id`) y unicidad de `(supplier_id, invoice_number)`.
- Vincular responsables con usuarios de la app (`user_id` opcional).
