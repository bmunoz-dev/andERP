# F18 — Cuentas aéreas · Spec

- **Estado:** En revisión (2026-10-20)
- **Diseño:** `design.md` §3 (glosario), §5.2 (enums), §5.9 (auditoría), §5.10 (reescrito: `air_operators`, `air_accounts`, `air_account_movements`, `v_air_account_balances`), §8 (pantallas). Los cambios a `design.md` se hacen en la primera tarea, antes del código.
- **Depende de:** F02 (organizaciones, `OrgScope`), F11 (lo reemplaza), F12 (auditoría atómica), F15 (tablas como tarjetas en el celular)
- **Reemplaza a:** F11 — Saldo de Clic Kiu. Su módulo, sus tablas, su vista y sus triggers se eliminan.

## Objetivo

La agencia emite tiquetes aéreos a través de varias **cuentas** con **operadores aéreos** (aerolíneas o consolidadores): por ejemplo, "Clic Air — KIU" en prepago y "Satena — KIU Sucursal Bogotá" a crédito con cupo. Un operador puede tener varias cuentas (sucursales con distinto Office ID, portal web B2B, vía consolidador).

Cada cuenta es un **libro mayor**: su saldo es la suma de sus movimientos. Prepago y crédito se tratan con **una sola regla**: el saldo nunca puede quedar por debajo de `−límite de crédito`. Una cuenta prepago es una cuenta con límite 0 (no puede deber); una cuenta a crédito puede deber hasta su límite.

El módulo también lleva lo que los clientes le deben a la agencia por cada tiquete emitido (Por cobrar / Cobrado), como hacía F11.

## Decisiones del usuario (2026-10-20)

- **Libro editable, no inmutable.** Los movimientos se editan y se borran (borrado lógico) como en F11; la trazabilidad la da `audit_logs`. Por eso no se guarda el saldo resultante de cada movimiento ni el saldo actual de la cuenta: ambos se calcularían mal al editar un movimiento anterior. El modelo propuesto por el usuario pedía un libro inmutable; se eligió editable a sabiendas.
- **Sin ciclos de facturación.** El cupo se controla con el saldo total, así que los ciclos no hacen falta para bloquear emisiones. El vencimiento del pago a un operador se registra como obligación en la **Agenda (F13)**.
- **Sin comisión.** Lo que baja del saldo es `tarifa neta + impuestos`.
- **Sin ruta** en el tiquete.
- **Operadores como catálogo** de la organización, para que el consolidado por operador no se rompa por nombres escritos distinto.
- **Sin migración de datos:** producción no tiene movimientos reales de Clic Kiu. Una sola migración crea lo nuevo y elimina lo de F11; se acepta que la API anterior falle en `/clickiu` durante la ventana entre la migración y el despliegue.

## Historias

- **HU1.** Como admin, quiero registrar los operadores aéreos con los que trabajo, para elegirlos al crear una cuenta y ver cuánto les debo en total.
- **HU2.** Como admin, quiero crear una cuenta de un operador con su límite de crédito (0 si es prepago), para llevar su saldo por separado.
- **HU3.** Como admin, quiero registrar el saldo inicial de una cuenta (a favor o en deuda), para empezar con el saldo real del día uno.
- **HU4.** Como admin, quiero registrar la emisión de un tiquete con su PNR, número, pasajero, tarifa neta e impuestos, y que el sistema la bloquee si deja la cuenta sin saldo (prepago) o por encima del cupo (crédito).
- **HU5.** Como admin, quiero registrar recargas, pagos al operador y reembolsos, para que el saldo suba.
- **HU6.** Como admin, quiero marcar como Cobrada una emisión cuando el cliente me paga.
- **HU7.** Como admin, quiero ver el saldo, el cupo disponible y lo por cobrar de cada cuenta y consolidado por operador.
- **HU8.** Como admin, quiero filtrar los movimientos de una cuenta por fechas, tipo y estado de cobro, y ver los totales de lo filtrado.

## Criterios de aceptación

**Operadores aéreos**

- **CA-1.** Un operador tiene nombre (sin espacios sobrantes, de 1 a 120 caracteres) y un estado activo/inactivo. El nombre es único por organización sin distinguir mayúsculas: `409 DUPLICATE_NAME` (restricción en la base de datos; código ya existente).
- **CA-2.** Un operador no se borra: se desactiva y se vuelve a activar. Un operador inactivo no se puede elegir al crear una cuenta ni al cambiarle el operador a una: `422 AIR_OPERATOR_INACTIVE`. Sus cuentas siguen funcionando.

**Cuentas**

- **CA-3.** Una cuenta tiene operador, nombre (de 1 a 120 caracteres, único por operador sin distinguir mayúsculas: `409 DUPLICATE_NAME`), límite de crédito (`creditLimit`, string decimal ≥ 0; 0 = prepago) y estado activo/inactivo. Se pueden cambiar el operador, el nombre, el límite y el estado.
- **CA-4.** La **modalidad** no se guarda: es "Prepago" si el límite es 0 y "Crédito" si es mayor.
- **CA-5.** Una cuenta no se borra: se desactiva. Una cuenta inactiva no acepta movimientos nuevos (`422 AIR_ACCOUNT_INACTIVE`); los existentes se pueden editar y borrar.

**Movimientos**

- **CA-6.** Un movimiento tiene tipo, fecha (`movementDate`, `YYYY-MM-DD`), monto (`amount`) y descripción opcional (hasta 500 caracteres). Los tipos son:

  | Tipo (`type`) | Interfaz | Efecto en el saldo |
  |---|---|---|
  | `opening_balance` | Saldo inicial | suma su monto, que puede ser negativo (deuda) |
  | `recharge` | Recarga | suma |
  | `payment` | Pago al operador | suma |
  | `refund` | Reembolso | suma |
  | `issue` | Emisión | resta |

- **CA-7.** El monto es mayor que 0 en todos los tipos menos el saldo inicial, que puede ser positivo o negativo pero no 0: `422 AIR_MOVEMENT_AMOUNT_INVALID` (CHECK).
- **CA-8.** Una cuenta tiene como máximo un saldo inicial no borrado: `409 AIR_OPENING_BALANCE_EXISTS` (índice único parcial).
- **CA-9.** Una **emisión** exige PNR (6 caracteres alfanuméricos, se guarda en mayúsculas), número de tiquete (13 dígitos), pasajero (de 1 a 120 caracteres), tarifa neta (`netFare`, ≥ 0) e impuestos (`taxes`, ≥ 0), y tiene estado de cobro: `pending` (Por cobrar, por defecto) o `collected` (Cobrado). Su monto **no se envía**: es `netFare + taxes`, calculado en SQL al crear y al editar, y la base de datos lo verifica (`AIR_MOVEMENT_AMOUNT_INVALID`).
- **CA-10.** Los demás tipos no llevan campos de tiquete ni estado de cobro. Zod lo valida al crear (`422 VALIDATION_ERROR`) y la base de datos lo garantiza también (CHECK `AIR_MOVEMENT_TICKET_FIELDS_MISMATCH`), en especial ante un `PATCH` con campos de tiquete sobre una recarga.
- **CA-11.** El número de tiquete es único por organización entre los movimientos no borrados: `409 AIR_TICKET_NUMBER_TAKEN`.
- **CA-12.** El tipo y la cuenta de un movimiento no cambian después de crearlo: `422 AIR_MOVEMENT_TYPE_IMMUTABLE` y `422 AIR_MOVEMENT_ACCOUNT_IMMUTABLE` (trigger). Para corregirlos se borra el movimiento y se crea otro.
- **CA-13.** Se pueden editar la fecha, la descripción y, según el tipo, el monto o los campos del tiquete y el estado de cobro. El estado de cobro va de Por cobrar a Cobrado y vuelve.
- **CA-14.** Borrar es lógico: un movimiento borrado no aparece en el listado ni cuenta en ningún saldo ni total.

**Saldo y cupo**

- **CA-15.** El **saldo** de una cuenta es la suma de sus movimientos no borrados, con las emisiones en negativo. El **disponible** es `saldo + límite de crédito`. Ninguno se guarda: los calcula la vista `v_air_account_balances`, que es la única fórmula del saldo.
- **CA-16.** El disponible de una cuenta nunca queda negativo. Se rechaza, sin guardar nada, cualquier operación que lo dejaría por debajo de 0: crear o subir una emisión; bajar, borrar o volver negativo un saldo inicial; bajar o borrar una recarga, un pago o un reembolso; o **bajar el límite de crédito** de la cuenta por debajo de su deuda. El código depende de la cuenta: `422 AIR_ACCOUNT_INSUFFICIENT_BALANCE` si su límite es 0 y `422 AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED` si es mayor. Una operación que deja el disponible justo en 0 se acepta.
- **CA-17.** La regla se mide sobre el saldo **total** de la cuenta, no fecha por fecha: un movimiento con fecha anterior a la recarga que lo cubre se acepta si el total no queda por debajo del límite.
- **CA-18.** Dos operaciones simultáneas sobre la **misma cuenta** no pueden pasarse del cupo entre ambas: si dos emisiones a la vez lo superarían juntas, solo una se guarda. Las operaciones sobre cuentas distintas no se esperan entre sí.

**Listados y resúmenes**

- **CA-19.** `GET /air-operators` lista los operadores ordenados por nombre; con `?active=true`, solo los activos.
- **CA-20.** `GET /air-accounts` lista las cuentas (ordenadas por operador y nombre) con operador, límite, saldo, disponible y `pendingCollection` (suma de las emisiones Por cobrar); acepta `?active=`. `GET /air-accounts/by-operator` devuelve, por operador, la suma de saldo, límite, disponible y por cobrar de sus cuentas **activas**. Todas las sumas se hacen en SQL.
- **CA-21.** `GET /air-accounts/:accountId/movements` lista los movimientos de la cuenta por fecha descendente. Acepta `from`, `to`, `type` y `collectionStatus`, opcionales y combinables. Sin `from` ni `to`, el rango es el **mes actual** en Bogotá; si llega solo uno, el otro extremo queda abierto; si `from` es posterior a `to`, `422 VALIDATION_ERROR`. El filtro `collectionStatus` solo devuelve emisiones.
- **CA-22.** `GET /air-accounts/:accountId/movements/summary` acepta los mismos filtros y devuelve:
  - sobre lo filtrado: `totalIn` (saldo inicial, recargas, pagos y reembolsos, con su signo), `totalIssued` y `pendingCollection`;
  - `balanceAsOf`: el saldo con todos los movimientos hasta `to`, sin mirar tipo ni estado (sin `to`, igual al saldo actual);
  - sin filtros: `currentBalance` y `available`.

**Auditoría, permisos y aislamiento**

- **CA-23.** Crear y editar una cuenta (`air_account.create`, `.update`) y crear, editar y borrar un movimiento (`air_account_movement.create`, `.update`, `.delete`) generan un registro en `audit_logs` con los valores antes y después, en la misma transacción. Los operadores no se auditan, como el resto de los catálogos (`design.md` §5.9).
- **CA-24.** Todas las rutas requieren un admin de la organización o un super admin.
- **CA-25.** Un admin de la organización A no lista, no lee, no edita ni usa operadores, cuentas ni movimientos de la organización B (`404`), y nada de B cambia los saldos, totales ni el consolidado de A.

**Web**

- **CA-26.** En el menú, **Cuentas aéreas** (`/cuentas-aereas`) reemplaza a Clic Kiu en Operación, y **Operadores aéreos** (`/configuracion/operadores-aereos`) aparece en Configuración.
- **CA-27.** **Operadores aéreos:** tabla con nombre y estado; botón **Nuevo operador**; acciones Editar y Activar/Desactivar.
- **CA-28.** **Cuentas aéreas:** arriba, una tarjeta por operador con su saldo, cupo, disponible y por cobrar (consolidado de sus cuentas activas). Debajo, tabla de cuentas con Operador, Cuenta, Modalidad (insignia Prepago / Crédito), Saldo (en rojo si es negativo), Cupo, Disponible y Por cobrar; acciones Ver movimientos, Editar y Activar/Desactivar; botón **Nueva cuenta** (Operador entre los activos, Nombre y Límite de crédito, 0 por defecto, con la ayuda "0 = prepago").
- **CA-29.** **Movimientos de una cuenta** (`/cuentas-aereas/$accountId`): nombre de la cuenta y operador; tarjetas **Entradas**, **Emitido**, **Por cobrar**, **Saldo al {fecha Hasta}** ("Saldo actual" si no hay Hasta) y **Disponible**; filtros Desde / Hasta (mes actual por defecto), Tipo y Estado de cobro (habilitado solo con Tipo = Emisión), guardados en la URL.
- **CA-30.** Tabla de movimientos con Fecha (`dd/mm/yyyy`), Tipo, Monto (COP; `+` en lo que suma y `−` en emisiones y saldos iniciales negativos), PNR, Tiquete, Pasajero, Estado de cobro (insignia ámbar Por cobrar, verde Cobrado; "—" en lo que no es emisión) y Descripción. Acciones: **Marcar como cobrado** (solo emisiones Por cobrar), Editar y Borrar (con confirmación).
- **CA-31.** Botones **Emitir tiquete**, **Recarga**, **Pago al operador**, **Reembolso** y **Saldo inicial** (este último solo si la cuenta no tiene uno). Cada uno abre el diálogo con el tipo fijo en el título, también al editar. El de emisión pide PNR, número de tiquete, pasajero, tarifa neta, impuestos y estado de cobro (Por cobrar por defecto), muestra el **Total** (`sumMoney`) y el **"Disponible: $X"** de la cuenta (al editar, sumando el monto original), y avisa si el total lo supera. El de saldo inicial pide el monto y un selector **A favor / En deuda** en lugar del signo.
- **CA-32.** Los errores de la API se muestran con su mensaje en español; los de cupo distinguen "Saldo prepago insuficiente" y "Cupo de crédito excedido".

**Eliminación de F11**

- **CA-33.** Desaparecen `clickiu_movements`, `v_clickiu_balance`, sus triggers y funciones, los enums `clickiu_movement_type` y `clickiu_sale_status`, el módulo `clickiu` de la API, las rutas `/clickiu`, la página `/clic-kiu`, sus componentes, sus pruebas y los códigos `CLICKIU_*`. La clase de bloqueo `11` queda retirada y no se reutiliza.
- **CA-34.** Antes de aplicar la migración en producción, una consulta de solo lectura confirma que `clickiu_movements` no tiene filas. Si tiene, la migración no se aplica y se vuelve a decidir.

## Fuera de alcance

- Ciclos de facturación, cortes, vencimientos y estados de pago por ciclo (el vencimiento va en la Agenda, F13).
- Comisión de la agencia, ruta, precio cobrado al cliente y datos de contacto del pasajero.
- NIT o tipo (aerolínea / consolidador) del operador.
- Buscar por PNR, número de tiquete o pasajero.
- Saldo resultante después de cada movimiento.
- Reembolsos ligados a un tiquete o pagos parciales de un cliente.
- Integración con KIU u otro GDS: todo se registra a mano.
- Paginación (el rango por defecto de un mes lo mantiene corto) y exportar a Excel o PDF.
- Que estos movimientos aparezcan en la matriz de Egresos.
