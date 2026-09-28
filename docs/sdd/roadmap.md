# Roadmap de AndERP

## Features

| ID | Feature | Depende de | Spec | Plan | Implementación |
|---|---|---|---|---|---|
| F00 | [Fundaciones](features/000-foundation/spec.md) | — | Aprobado | Aprobado | Hecho |
| F01 | [Auth y usuarios](features/001-auth/spec.md) | F00 | Aprobado | Aprobado | En progreso |
| F02 | [Organizaciones, catálogos y usuarios](features/002-organizations-catalogs/spec.md) | F01 | Aprobado | Aprobado | Pendiente |
| F03 | [Prestadores y contratos](features/003-service-providers/spec.md) | F02 | Aprobado | Aprobado | Pendiente |
| F04 | [Pagos de honorarios](features/004-fee-payments/spec.md) | F03 | Aprobado | Aprobado | Pendiente |
| F05 | [Egresos y matriz mensual](features/005-expenses/spec.md) | F02, F04 | Aprobado | Aprobado | Pendiente |
| F06 | [Responsables y credenciales](features/006-credentials/spec.md) | F02 | Aprobado | Aprobado | Pendiente |
| F07 | [Despliegue y endurecimiento](features/007-deployment/spec.md) | F00–F06 | Aprobado | Aprobado | Pendiente |

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

_Ninguno por ahora._
