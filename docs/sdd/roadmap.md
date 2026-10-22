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
| F07 | [Despliegue y endurecimiento](features/007-deployment/spec.md) | F00–F06 | Aprobado | Aprobado | Hecho |
| F08 | [Modo oscuro](features/008-dark-mode/spec.md) | F00 | Aprobado | Aprobado | Hecho |
| F09 | [Desactivar prestadores](features/009-provider-deactivation/spec.md) | F03, F04 | Aprobado | Aprobado | Hecho |
| F10 | [Monto mensual de referencia en los contratos](features/010-monthly-contract-amount/spec.md) | F04 | Aprobado | Aprobado | Hecho |
| F11 | [Saldo de Clic Kiu](features/011-clickiu-balance/spec.md) (reemplazada por F18) | F02 | Aprobado | Aprobado | Hecho |
| F12 | [Auditoría atómica](features/012-atomic-audit/spec.md) | F01–F06, F11 | Aprobado | Aprobado | Hecho |
| F13 | [Agenda de pagos a entidades](features/013-payment-agenda/spec.md) | F02, F12 | Aprobado | Aprobado | Hecho |
| F14 | [Panel de notificaciones](features/014-notifications/spec.md) | F13 | Aprobado | Aprobado | Hecho |
| F15 | [Vistas para el celular](features/015-mobile-views/spec.md) | F13, F14 | Aprobado | Aprobado | Hecho |
| F16 | [Pagos de monto fijo](features/016-fixed-payments/spec.md) | F04, F05, F10, F12 | Aprobado | Aprobado | Hecho |
| F17 | [Documento del contrato](features/017-contract-documents/spec.md) | F03, F12, F15 | Aprobado | Aprobado | Hecho |
| F18 | [Cuentas aéreas](features/018-air-accounts/spec.md) (reemplaza a F11) | F02, F11, F12, F15 | Aprobado | Aprobado | Hecho |
| F19 | [Módulos por organización](features/019-organization-modules/spec.md) | F02, F12 | Aprobado | Aprobado | Hecho |
| F20 | [Selector de organización](features/020-organization-switcher/spec.md) | F01, F02, F12, F15, F19 | Aprobado | Aprobado | En progreso |

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

**F19 terminada y en producción (PRs #39 y #40, 2026-10-21/22):** paquetes de módulos por organización en la API y la web. Verificación manual del usuario (CA-28) hecha el 2026-10-22. El respaldo de producción sigue aplazado (pendiente 1 de F07).

**F18 terminada y en producción (PR #37, 2026-10-20):** cuentas aéreas con operadores, cupo prepago/crédito y emisión de tiquetes; reemplaza a Clic Kiu. Verificación manual del usuario hecha.

**Siguiente paso:** el selector de organización (pendiente multi-organización, abajo). El respaldo de producción (pendiente 1 de F07) está aplazado hasta que el usuario decida hacerlo. F17 terminada y en producción (PRs #34 y #35, 2026-10-18; QA del usuario el 2026-10-19): documento del contrato en Supabase Storage con URL firmada, y tabla de contratos con panel de detalle. **Decisión del usuario (2026-10-18):** los archivos no tendrán respaldo por ahora (Supabase Free no respalda Storage); se acota con no borrar nunca objetos del bucket. Mientras siga en Free, revisar el uso del bucket en *Settings → Usage* de Supabase: pasar el 1 GB restringe todo el proyecto, base de datos incluida. F16 terminada y mergeada (PR #33, 2026-10-18): pagos de monto fijo y los nombres "Personal" y "Pagos" en la interfaz. Después del respaldo de producción, una feature de solo refactor para renombrar en el código `service_providers` / `fee_payments` (decisión del usuario del 2026-10-17; F16 solo cambia los nombres en la interfaz). Siguen abiertos los riesgos de F07 (abajo). F15 terminada (2026-10-16): por debajo de 768 px las tablas se ven como tarjetas; verificación visual hecha por el usuario. F14 terminada y en producción (PR #31, 2026-10-15): campana con panel de notificaciones calculadas de la Agenda. F13 terminada (2026-10-14) y mergeada (PR #30, 2026-10-15): agenda de pagos a entidades con alertas dentro de la app. **Antes de cargar obligaciones reales en producción, hacer el respaldo (pendiente 1 de F07):** serán los primeros datos de negocio reales. F12 terminada (2026-10-14): cada cambio auditado y su registro se confirman en la misma transacción. **Pendientes que dejó F12** (fuera de su alcance): (1) ~~crear y borrar credenciales no se audita~~ resuelto el 2026-10-14 (F06 CA-7b); (2) ~~los correos de invitación se envían dentro de la transacción~~ reducido el 2026-10-14: el correo es lo último antes de confirmar (notas del plan de F02); solo un fallo del `COMMIT` dejaría un enlace inválido. F11 terminada y desplegada (2026-10-14). **Decisión del usuario:** se desplegó sin respaldo porque producción aún no tiene datos reales; el respaldo (pendiente 1 de F07) vuelve a ser prioritario en cuanto haya datos.

**Estado de producción (2026-10-10):**
- Hecho: pipeline activo (environment `production` con secretos, `API_HEALTH_URL`, Auto-Deploy de Render apagado), correo con Brevo, `PROXY_SECRET` rotado como Secret del Worker, `app_runtime` como único usuario de la API.
- **Decisión del usuario:** por ahora no se contratan planes de pago. Supabase y Render siguen en Free. Riesgos aceptados: Supabase Free **no tiene backups** y pausa el proyecto tras una semana sin uso; Render Free se duerme (~50 s al despertar).

**Pendiente de F07:**
1. **Aplazado hasta que el usuario decida hacerlo** (decisiones del 2026-10-17 y 2026-10-22). Respaldo diario gratuito con GitHub Actions (`pg_dump` cifrado) mientras no haya plan Pro. Riesgo aceptado: sin respaldo, cualquier dato cargado en producción se pierde si Supabase falla. No se propone de nuevo como siguiente paso.
2. ~~Cloudflare Workers Builds falla en las ramas de PR (vistas previas)~~ resuelto (confirmado por el usuario el 2026-10-15).
3. Avisos de Supabase `function_search_path_mutable` en los triggers (migración pequeña).
4. T012 (migración rota a propósito), T013 (primera corrida de Playwright, requiere autorización del navegador), T015 (ensayo de restauración) y T016 (hito M4).

**Pendiente (documentación, revisión del 2026-10-13):**
1. Constitución IX dice que `fee-payments` y `credentials` son hexagonales; solo `auth` lo es (`design.md` §4.1 ya está corregido). Constitución IV dice "repositorio base"; es `OrgScope`.
2. HU2 de la spec de F03 sigue diciendo "valor total" (F10 lo cambió a monto mensual).
3. `CLAUDE.md` repite las reglas técnicas de la constitución; dejar solo lo operativo y enlazarla. El README de SDD no dice que el merge lo hace el usuario. La Definición de Hecho no incluye `format:check`.
4. ~~Pendiente 2 de F07 (Workers Builds en las ramas de PR)~~ resuelto el 2026-10-15.

**Decisiones tomadas:** la skill `ponytail` se versiona en el repo (`.agents/`, `skills-lock.json` y una copia real en `.claude/skills/ponytail/`, sin enlace simbólico). La skill `ui-ux-pro-max` (`nextlevelbuilder/ui-ux-pro-max-skill`, instalada por el usuario el 2026-10-18) se versiona solo como copia real en `.claude/skills/ui-ux-pro-max/`, sin `scripts/tests/` (llaman a scripts que no vienen en la instalación) y sin la copia duplicada en `.agents/`. Auditada ese día: sin binarios, sin red ni procesos en sus scripts, que solo usan la biblioteca estándar de Python; el texto no trae instrucciones para el agente. Su `SKILL.md` usa `${CLAUDE_PLUGIN_ROOT}`, que solo existe como plugin: se invoca con `python .claude/skills/ui-ux-pro-max/scripts/search.py`. `--persist` (escribe `design-system/`) solo con permiso del usuario. Prettier la ignora (`.prettierignore`). Al actualizarla con `npx skills`, repetir la auditoría. No se protege `main`: es un proyecto personal.

**Pendiente (multi-organización):** un usuario que ya tiene contraseña y es agregado a una segunda organización queda en las dos, pero el login siempre entra en la más antigua. Resolverlo requiere el selector de organización, fuera de la v1 (design.md §fuera de alcance). **Con F19 (varias empresas cliente) deja de ser teórico:** el selector va como feature aparte y debe estar antes de dar acceso a alguien que pertenezca a dos organizaciones (decisión del usuario, 2026-10-20).

**Entorno:**
- En el árbol `New folder\personal`, el trabajador de Vitest a veces termina al arrancar un archivo de la API con `0xC0000409`, antes de ejecutar pruebas. Cuando arranca, todo pasa. El CI en Linux no lo presenta.
