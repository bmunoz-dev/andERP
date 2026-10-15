# F15 — Vistas para el celular · Spec

- **Estado:** Borrador (pendiente de aprobación del usuario)
- **Diseño:** `design.md` §8 (Frontend: tablas como tarjetas por debajo de 768 px).
- **Depende de:** F13 (Agenda), F14 (notificaciones)

## Objetivo

Hoy la app funciona en el celular, pero las tablas obligan a desplazarse de lado para ver las columnas y las acciones. F15 adapta las pantallas que se usan fuera de la oficina para **consultar** (Agenda, notificaciones, credenciales, saldo de Clic Kiu) y **registrar sobre la marcha** (completar un vencimiento, una recarga o venta de Clic Kiu, un egreso).

En el celular se ve **toda** la información: ninguna columna se oculta. Por debajo de 768 px, cada fila de una tabla se muestra como una tarjeta generada a partir de las mismas columnas.

Sin cambios en la API ni en la base de datos. Sin app nativa ni instalable: el navegador del teléfono.

## Historias

- **HU1.** Como admin, quiero revisar la Agenda y las notificaciones desde el celular y completar un vencimiento sin desplazarme de lado.
- **HU2.** Como admin, quiero buscar una credencial desde el celular, revelarla, copiarla y abrir su enlace.
- **HU3.** Como admin, quiero ver el saldo de Clic Kiu y registrar una recarga o una venta desde el celular.
- **HU4.** Como admin, quiero registrar un egreso desde el celular.

## Criterios de aceptación

**Tablas**

- **CA-1.** Por debajo de 768 px de ancho (el corte de `useIsMobile`), `DataTable` muestra **una tarjeta por fila** en lugar de la tabla. Desde 768 px muestra la tabla como hoy. Se dibuja solo una de las dos versiones.
- **CA-2.** Cada columna con cabecera de texto aparece en la tarjeta como una línea "Etiqueta: valor", con la misma celda que en la tabla. Ninguna columna se oculta.
- **CA-3.** Las columnas sin cabecera visible (las de acciones) van al pie de la tarjeta, con los mismos botones que en la tabla.
- **CA-4.** En el celular, el estado de carga y el mensaje de vacío se muestran igual que en la tabla.
- **CA-5.** CA-1 a CA-4 aplican a todas las pantallas que usan `DataTable`, sin cambios en sus columnas. La matriz de Egresos no usa `DataTable` y sigue con desplazamiento horizontal.

**Pantallas**

- **CA-6.** Las pestañas de la Agenda caben en el ancho de la pantalla o se desplazan de lado dentro de su propia franja, sin desbordar la página.
- **CA-7.** Los diálogos no superan el alto de la pantalla: si el contenido no cabe, se desplaza dentro del diálogo.
- **CA-8.** Clic Kiu: las cuatro tarjetas de saldo se ven en 2 columnas en el celular (4 desde `lg`, como hoy) y el monto cabe sin cortarse (por ejemplo, "$ 12.345.678" en media pantalla). Los filtros se ven en 2 columnas en el celular (4 desde `sm`, como hoy).
- **CA-9.** El panel de notificaciones, la cabecera y el formulario de egreso se ven completos en el celular sin cambios propios (ya se adaptan; entran en la verificación visual).

**Verificación**

- **CA-10.** Verificación visual a 360–390 px de ancho (en un celular, o en el navegador con autorización del usuario): Agenda (tarjetas con todos los datos, pestañas, completar), notificaciones (abrir e ir a la Agenda), Credenciales (buscar, revelar, copiar, abrir el enlace), Clic Kiu (tarjetas, filtros, registrar una venta) y Egresos (registrar un egreso).

## Fuera de alcance

- Rediseñar para el celular la matriz de Egresos, el formulario de honorarios (cuadrícula de días), prestadores, contratos, configuración y plataforma. Sus listados heredan las tarjetas de CA-1, pero no se revisan uno por uno.
- Ocultar o reordenar columnas por pantalla.
- Barra de navegación inferior, gestos o tamaños táctiles mayores que los de shadcn.
- App instalable (PWA) o nativa.
