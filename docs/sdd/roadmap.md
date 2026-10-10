# Roadmap de AndERP

## Features

| ID | Feature | Depende de | Spec | Plan | Implementación |
|---|---|---|---|---|---|
| F00 | [Fundaciones](features/000-foundation/spec.md) | — | Aprobado | Aprobado | Hecho |
| F01 | [Auth y usuarios](features/001-auth/spec.md) | F00 | Aprobado | Aprobado | Hecho |
| F02 | [Organizaciones, catálogos y usuarios](features/002-organizations-catalogs/spec.md) | F01 | Aprobado | Aprobado | Hecho |
| F03 | [Prestadores y contratos](features/003-service-providers/spec.md) | F02 | Aprobado | Aprobado | Hecho |
| F04 | [Pagos de honorarios](features/004-fee-payments/spec.md) | F03 | Aprobado | Aprobado | Hecho |
| F05 | [Egresos y matriz mensual](features/005-expenses/spec.md) | F02, F04 | Aprobado | Aprobado | Hecho |
| F06 | [Responsables y credenciales](features/006-credentials/spec.md) | F02 | Aprobado | Aprobado | Hecho |
| F07 | [Despliegue y endurecimiento](features/007-deployment/spec.md) | F00–F06 | Aprobado | Aprobado | En progreso |
| F08 | [Modo oscuro](features/008-dark-mode/spec.md) | F00 | Borrador | — | Pendiente |

F06 solo depende de F02, así que se puede desarrollar en paralelo con F03–F05.

```
F00 ─► F01 ─► F02 ─┬─► F03 ─► F04 ─► F05 ─┐
                   └─► F06 ───────────────┴─► F07
```

## Hitos

| Hito | Features | Resultado verificable |
|---|---|---|
| M1 — Se puede entrar | F00, F01 | El super admin inicia sesión, cierra sesión y recupera su contraseña en local. |
| M2 — Sistema configurado | F02 | Hay organización, categorías, catálogos y usuarios admin invitados. |
| M3 — Operación completa | F03, F04, F05, F06 | Se registran prestadores, honorarios, egresos y credenciales, y la matriz mensual cuadra. |
| M4 — En producción | F07 | La app funciona en Supabase + Render + Cloudflare Pages con el mismo flujo E2E en verde. |

## Trazabilidad: diseño → features

| Sección de `design.md` | Features |
|---|---|
| §5.1 Convenciones, §5.2 Enums | F00 |
| §5.3 Núcleo y autenticación | F01 (tablas, login, sesiones), F02 (organizaciones, miembros, invitaciones) |
| §5.4 Catálogos | F02 |
| §5.5 Prestadores, contratos y honorarios | F03, F04 |
| §5.6 Egresos, §5.7 Vistas | F04 (`v_fee_payment_totals`, `v_contract_balances`), F05 (`v_expense_ledger`, `v_expense_monthly_summary`) |
| §5.8 Responsables y credenciales | F06 |
| §5.9 Auditoría | F01 (tabla y servicio), F03–F06 (eventos de cada módulo) |
| §6 Seguridad | F01, F02, F06, F07 |
| §7 API y errores | F00 (infraestructura), todas (códigos de error) |
| §8 Frontend | F00 (esqueleto), F01–F06 (pantallas) |
| §9 Pruebas | F00 (infraestructura), todas |
| §10 Migraciones y despliegue | F00 (local), F07 (producción) |

## Bloqueos y notas

**Siguiente paso:** cerrar los riesgos abiertos de F07 (abajo) y después F08 (modo oscuro; spec en borrador, sin aprobar).

**Pendiente de F07 (pospuesto por el usuario el 2026-10-09):**
1. Secretos del environment `production` en GitHub (ya creado, con aprobación de `bmunoz-dev` y solo `main`): `DATABASE_URL_MIGRATIONS` y `RENDER_DEPLOY_HOOK_URL`, con `gh secret set … --env production`. Después crear la variable de repositorio `API_HEALTH_URL=https://anderp-api.onrender.com/api/v1/health`, que activa el despliegue del pipeline.
2. Render (`anderp-api`): **Auto-Deploy off**, Health Check Path `/api/v1/health` y plan de pago (hoy es free y se duerme).
3. Rotar `PROXY_SECRET` (el valor actual quedó escrito en un chat): Render y secreto del Worker en Cloudflare a la vez.
4. Resto de F07: T012 (migración rota a propósito), T013 (primera corrida de Playwright, requiere autorización del navegador), T015 (ensayo de restauración) y T016 (verificación del hito M4).

**Riesgo mientras tanto:** con Auto-Deploy activo y el pipeline sin secretos, Render despliega cada merge a `main` **sin migrar**. No mergear PRs con migraciones hasta cerrar los puntos 1 y 2.

**Decisiones tomadas:** la skill `ponytail` se versiona en el repo (`.agents/`, `skills-lock.json` y una copia real en `.claude/skills/ponytail/`, sin enlace simbólico). No se protege `main`: es un proyecto personal.

**Pendiente (multi-organización):** un usuario que ya tiene contraseña y es agregado a una segunda organización queda en las dos, pero el login siempre entra en la más antigua. Resolverlo requiere el selector de organización, fuera de la v1 (design.md §fuera de alcance).

**Entorno:**
- En el árbol `New folder\personal`, el trabajador de Vitest a veces termina al arrancar un archivo de la API con `0xC0000409`, antes de ejecutar pruebas. Cuando arranca, todo pasa. El CI en Linux no lo presenta.
