# F11 — Saldo de Clic Kiu · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §3 (glosario), §5.10 (`clickiu_movements`, `v_clickiu_balance`), §8 (pantalla Clic Kiu).
- **Depende de:** F02 (organizaciones, auditoría y `OrgScope`)

## Objetivo

Clic Kiu es una plataforma de agencia de viajes que se usa con saldo prepagado. La empresa la **recarga** y con ese saldo **vende** viajes a sus clientes. AndERP registra esos movimientos, calcula el saldo y muestra cuánto deben los clientes por las ventas a crédito.

El módulo es independiente de Egresos: las recargas **no** aparecen en la matriz mensual. Si se quieren ver como egreso, se registran a mano en Egresos, como hasta hoy.

## Historias

- **HU1.** Como admin, quiero registrar una recarga de Clic Kiu con su fecha, monto y una observación opcional, para que se sume al saldo disponible.
- **HU2.** Como admin, quiero registrar una venta hecha con el saldo de Clic Kiu, indicando si el cliente ya pagó (Completado) o si quedó debiendo (Crédito).
- **HU3.** Como admin, quiero marcar como Completada una venta en Crédito cuando el cliente paga.
- **HU4.** Como admin, quiero filtrar los movimientos por rango de fechas, tipo y estado, y ver los totales de lo filtrado.
- **HU5.** Como admin, quiero que el sistema me impida registrar ventas por encima del saldo disponible, porque Clic Kiu no deja vender sin saldo.

## Criterios de aceptación

**Movimientos**

- **CA-1.** Un movimiento tiene tipo (`recharge` = Recarga, `sale` = Venta), fecha (`movementDate`, `YYYY-MM-DD`), monto (`amount`, string decimal mayor que 0) y descripción opcional (hasta 500 caracteres).
- **CA-2.** Una venta tiene estado obligatorio: `credit` (Crédito, el cliente aún no le ha pagado a la agencia) o `completed` (Completado, ya pagó). Una recarga no tiene estado. Si llega una venta sin estado o una recarga con estado, responde `422 CLICKIU_SALE_STATUS_REQUIRED`. La base de datos lo garantiza también (CHECK).
- **CA-3.** El tipo no se puede cambiar después de crear el movimiento: `422 CLICKIU_MOVEMENT_TYPE_IMMUTABLE`. Para corregirlo se borra el movimiento y se crea otro.
- **CA-4.** Se pueden editar la fecha, el monto, la descripción y el estado. El estado puede pasar de Crédito a Completado y volver a Crédito.
- **CA-5.** Borrar es lógico: un movimiento borrado no aparece en el listado ni cuenta en ningún total.

**Saldo**

- **CA-6.** El saldo es la suma de las recargas menos la suma de las ventas no borradas. Las ventas restan saldo en los dos estados. El saldo se calcula en SQL y no se guarda.
- **CA-7.** El saldo total actual nunca queda negativo. Se rechaza con `422 CLICKIU_INSUFFICIENT_BALANCE`, sin guardar nada, cualquier operación que lo dejaría por debajo de 0: crear o subir una venta, bajar una recarga o borrarla. Una venta igual al saldo disponible se acepta (saldo 0).
- **CA-8.** La regla del CA-7 se mide sobre el **saldo total**, no día por día: una venta con fecha anterior a la recarga que la cubre se acepta si el total no queda negativo.
- **CA-9.** Dos operaciones simultáneas no pueden dejar el saldo negativo entre ambas: si dos ventas a la vez lo superarían juntas, solo una se guarda.

**Listado y filtros**

- **CA-10.** `GET /clickiu/movements` lista los movimientos de la organización ordenados por fecha descendente. Acepta `from` y `to` (rango de fechas, bordes incluidos), `type` y `status`, todos opcionales y combinables. Sin `from` ni `to`, el rango es el **mes actual** en Bogotá. Si llega solo uno, el otro extremo queda abierto. Si `from` es posterior a `to`, responde `422 VALIDATION_ERROR`.
- **CA-11.** El filtro `status` solo devuelve ventas: las recargas no tienen estado y quedan fuera.

**Resumen**

- **CA-12.** `GET /clickiu/summary` acepta los mismos filtros que el listado (con el mismo mes actual por defecto) y devuelve:
  - `totalRecharged`, `totalSold` y `creditAmount` (suma de las ventas en Crédito): solo de los movimientos que cumplen los filtros;
  - `balanceAsOf`: el saldo acumulado con **todos** los movimientos hasta `to` (incluidos los anteriores a `from`), sin mirar tipo ni estado (sin `to`, es igual a `currentBalance`);
  - `currentBalance`: el saldo total actual, sin filtros.

  Todos los montos son strings decimales sumados en SQL.

**Auditoría, permisos y aislamiento**

- **CA-13.** Crear, editar (incluido el cambio de estado) y borrar un movimiento genera un registro en `audit_logs` (`clickiu_movement.create`, `.update`, `.delete`) con los valores antes y después.
- **CA-14.** Todas las rutas requieren un admin de la organización o un super admin.
- **CA-15.** Un admin de la organización A no lista, no lee, no edita ni borra movimientos de la organización B, y los movimientos de B no cambian el saldo ni los totales de A.

**Web**

- **CA-16.** Página **Clic Kiu** (`/clic-kiu`) en el menú lateral.
- **CA-17.** Arriba, cuatro tarjetas que cambian con los filtros: **Recargado**, **Vendido**, **Por cobrar** (ventas en Crédito) y **Saldo al {fecha Hasta}** (`balanceAsOf`; "Saldo actual" si no hay fecha Hasta).
- **CA-18.** Filtros **Desde** / **Hasta** (por defecto, el mes actual), **Tipo** (Todos / Recarga / Venta) y **Estado** (Todos / Crédito / Completado). Estado solo se habilita cuando Tipo = Venta. Los filtros se guardan en la URL.
- **CA-19.** Tabla con Fecha (`dd/mm/yyyy`), Tipo, Monto (COP; `+` en recargas y `−` en ventas), Estado (insignia ámbar para Crédito y verde para Completado; "—" en recargas) y Descripción. Acciones: **Marcar como completado** (solo ventas en Crédito), Editar y Borrar (con confirmación).
- **CA-20.** Diálogo para crear y editar: Tipo (deshabilitado al editar), Fecha (hoy por defecto), Monto, Descripción y Estado (solo en ventas, Crédito por defecto). En una venta muestra **"Saldo disponible: $X"** (`currentBalance`; al editar, sumando el monto original de la venta) y avisa si el monto lo supera. Si la API responde `CLICKIU_INSUFFICIENT_BALANCE`, se muestra su mensaje en español.

## Fuera de alcance

- Que las recargas aparezcan en la matriz de Egresos.
- Datos del cliente, código de reserva o precio cobrado al cliente (si hacen falta, van en la descripción).
- Otras plataformas además de Clic Kiu.
- Pagos parciales de una venta en Crédito.
- Paginación del listado (el rango por defecto de un mes lo mantiene corto).
- Exportar a Excel o PDF (`design.md` §11).
