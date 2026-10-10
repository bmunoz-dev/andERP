# F09 — Desactivar prestadores · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §5.5

## Objetivo

Impedir contratos nuevos con un prestador con el que ya no se trabaja, sin perder su historial. Un prestador con pagos no se puede borrar (F03 CA-5, F04); desactivarlo es la forma de retirarlo.

## Historias

- **HU1.** Como admin, quiero desactivar a un prestador para que nadie le haga contratos nuevos.
- **HU2.** Como admin, quiero volver a activarlo si se retoma el trabajo.

## Criterios de aceptación

- **CA-1.** `PATCH /service-providers/:id` acepta `isActive`. Los prestadores se crean activos y la respuesta incluye `isActive`.
- **CA-2.** Crear un contrato para un prestador inactivo responde `422 PROVIDER_INACTIVE`, también con un trigger al insertar directamente en SQL.
- **CA-3.** Desactivar un prestador con un contrato vigente o futuro (no borrado y con `end_date` nula o mayor o igual a hoy en Bogotá) responde `422 PROVIDER_HAS_ACTIVE_CONTRACT`, también con un trigger. Primero se cierra el contrato con una fecha de fin.
- **CA-4.** Un prestador inactivo conserva su ficha, sus contratos, sus pagos y sus egresos. Se pueden registrar y editar pagos de sus contratos existentes (pagos atrasados).
- **CA-5.** Un admin de otra organización recibe `404` al intentar activar o desactivar un prestador ajeno.
- **CA-6.** Web:
  - la ficha tiene "Desactivar" o "Activar" (botón neutro, porque es reversible; desactivar pide confirmación);
  - un prestador inactivo muestra la insignia "Inactivo" en la ficha y en el listado, y su ficha oculta "Nuevo contrato" con una nota que explica por qué.

## Fuera de alcance

Filtro por estado en el listado, borrar prestadores con contratos y desactivar automáticamente al vencer el último contrato.
