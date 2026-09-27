# F03 — Prestadores y contratos · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §5.5 (`service_providers`, `provider_contracts`), §5.9

## Objetivo

Registrar a los prestadores de servicios con sus datos bancarios y el histórico de sus contratos. Es la base del pago de honorarios.

## Historias

- **HU1.** Como admin, quiero registrar un prestador con su documento y su cuenta bancaria.
- **HU2.** Como admin, quiero registrar los contratos de un prestador (fechas, acuerdo, periodicidad y valor total) y conservar su histórico cuando se renuevan.
- **HU3.** Como admin, quiero buscar prestadores y ver cuál tiene un contrato vigente.

## Criterios de aceptación

**Prestadores**
- **CA-1.** Crear un prestador con `name`, `documentTypeId`, `documentNumber` y `description?` funciona. Los datos bancarios (`bankId`, `accountTypeId`, `accountNumber`) son opcionales, pero van **los tres o ninguno**. Si llegan incompletos, la API responde `422 INCOMPLETE_BANK_ACCOUNT`; la base de datos también lo rechaza con un CHECK.
- **CA-2.** `documentNumber` acepta de 3 a 20 caracteres (`[0-9A-Za-z-]`). Si el mismo tipo y número de documento ya existe en la organización, responde `409 DUPLICATE_DOCUMENT`. Si el prestador anterior fue borrado, se permite crearlo de nuevo.
- **CA-3.** Un banco, tipo de cuenta o tipo de documento inactivo **no** se acepta en altas nuevas (`422 INACTIVE_CATALOG_VALUE`). Los prestadores que ya lo tenían lo conservan.
- **CA-4.** `GET /service-providers?search=&hasActiveContract=` busca por nombre o número de documento. Cada fila incluye `activeContract` (el contrato vigente hoy, o `null`).
- **CA-5.** Borrar un prestador que tiene contratos no borrados responde `422 PROVIDER_HAS_CONTRACTS`.

**Contratos**
- **CA-6.** Crear un contrato con `startDate`, `endDate?`, `workAgreement`, `paymentFrequency` y `totalAmount` (string decimal mayor que 0) funciona. Si `endDate < startDate`, responde `422 INVALID_DATE_RANGE`.
- **CA-7.** Si un contrato se cruza en fechas con otro no borrado del mismo prestador, responde `409 CONTRACT_OVERLAP`. Esto incluye un contrato sin fecha de fin, que se considera abierto hasta el infinito. Lo garantiza la restricción EXCLUDE de la base de datos.
- **CA-8.** `GET /service-providers/:id/contracts` lista los contratos del más reciente al más antiguo, con `status` calculado: `upcoming`, `active` o `ended`.
- **CA-9.** Editar un contrato puede cambiar cualquier campo; se aplican las mismas validaciones.
- **CA-10.** Crear, editar y borrar contratos genera `audit_logs` (`contract.create`, `contract.update`, `contract.delete`) con los valores anteriores y nuevos en `changes`.

**Aislamiento y web**
- **CA-11.** Un admin de otra organización recibe `404` en prestadores y contratos ajenos. Además, un contrato no puede apuntar a un prestador de otra organización: lo impide la FK compuesta (prueba en SQL).
- **CA-12.** Web:
  - listado de prestadores con buscador y un distintivo "Contrato vigente";
  - formulario de prestador con los selects de catálogo y la sección bancaria opcional;
  - página de detalle con los datos y la lista de contratos (alta, edición y borrado).
  - Valores en formato COP y fechas en formato `dd/mm/aaaa`.

## Fuera de alcance

Pagado y saldo del contrato (llegan en F04, cuando existen los pagos), y reglas para impedir borrar un contrato con pagos (también en F04).
