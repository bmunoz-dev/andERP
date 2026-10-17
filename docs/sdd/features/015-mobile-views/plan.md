# F15 — Vistas para el celular · Plan

- **Estado:** Aprobado (2026-10-16)
- **Spec:** [spec.md](spec.md)

Solo web. Sin cambios en la API, la base de datos, el paquete compartido ni los códigos de error.

## Web

**`hooks/use-mobile.ts` (CA-1):**

- El estado se inicializa con `useState(() => window.innerWidth < MOBILE_BREAKPOINT)` en lugar de `undefined`. El efecto queda igual (escucha `matchMedia` y vuelve a leer `innerWidth`).
- Se usa `innerWidth` y no `matchMedia(...).matches` en el inicializador para que coincida con lo que ya hace `onChange`.
- **Efecto lateral aceptado:** `components/ui/sidebar.tsx` usa el mismo hook. En el celular, la barra lateral también arranca como `Sheet` desde el primer render, en lugar de pasar por la versión de escritorio. Es una mejora y no cambia el escritorio.
- La web es una SPA (Vite) sin render en servidor, así que `window` siempre existe en el inicializador.

**`components/data-table.tsx` (CA-1 a CA-5):**

- `const isMobile = useIsMobile()`. Si `isMobile`, se devuelve la lista de tarjetas y no se dibuja `<Table>`.
- Columnas de la tarjeta: `table.getAllLeafColumns()` partidas por `typeof column.columnDef.header === 'string'`:
  - **con cabecera de texto** → una línea `<dt>{header}:</dt> <dd>{celda}</dd>` dentro de un `<dl>`, con la celda de `flexRender(cell.column.columnDef.cell, cell.getContext())`, la misma que en la tabla (CA-2);
  - **el resto** (hoy, siempre `() => <span className="sr-only">Acciones</span>`) → al pie de la tarjeta, alineado a la derecha, con la misma celda (CA-3).
- Tarjeta: `rounded-md border p-4 text-sm`, una por fila, en un `div` con `space-y-3`. Etiqueta en `text-muted-foreground`. Sin componente nuevo: va dentro de `DataTable`, en el mismo archivo.
- Carga: tres `Skeleton` de `h-20` en lugar de las filas. Vacío: el mismo `emptyMessage`, centrado en un recuadro con borde de `h-24` (CA-4).
- No se toca ninguna definición de columnas (CA-5).

**`test/setup.ts`:**

- jsdom no implementa `matchMedia`. Desde que `DataTable` usa `useIsMobile`, todas las pruebas que renderizan una tabla lo necesitan.
- Se agrega un stub global mínimo (`matches: false`, `addEventListener` y `removeEventListener` vacíos), definido una sola vez fuera de `afterEach`.
- `theme.test.ts` lo reemplaza con `vi.stubGlobal`, y `unstubAllGlobals` lo restaura. No cambia.
- El ancho por defecto de jsdom es 1024 px: las pruebas existentes siguen viendo la tabla.

**Pantallas:**

- `components/obligations/agenda-tabs.tsx` (CA-6): `Tabs` con `className="mb-4 max-w-full overflow-x-auto"`. La franja se desplaza de lado por dentro y la página no desborda.
- `components/ui/dialog.tsx` (CA-7): `DialogContent` suma `max-h-[calc(100dvh-2rem)] overflow-y-auto` a sus clases base. Lo heredan todos los diálogos de formulario.
  - `alert-dialog.tsx` no se toca: solo lo usan confirmaciones de dos líneas.
- `components/clickiu/summary-cards.tsx` (CA-8):
  - cuadrícula de `sm:grid-cols-2 lg:grid-cols-4` a `grid-cols-2 lg:grid-cols-4`;
  - monto de `text-2xl` a `text-lg sm:text-2xl`.

  A 360 px, media pantalla deja unos 110 px para el monto. Si "$ 12.345.678" no cabe en la verificación visual, se reduce el relleno lateral de la tarjeta en el celular (`px-4 sm:px-6`). Las dos medidas son solo de CSS.
- `components/clickiu/movement-filters.tsx` (CA-8): de `grid gap-4 sm:grid-cols-4` a `grid grid-cols-2 gap-4 sm:grid-cols-4`.
- Panel de notificaciones, cabecera y formulario de egreso: sin cambios (CA-9).

## Pruebas

- `components/data-table.test.tsx` (nuevo, Testing Library). Una tabla de prueba con dos columnas de texto y una de acciones (`header: () => <span className="sr-only">Acciones</span>`, con un botón):
  - con `innerWidth` en 1024: hay `role="table"` y no hay tarjetas;
  - con `vi.stubGlobal('innerWidth', 375)`:
    - no hay `table`;
    - hay una tarjeta por fila con "Etiqueta:" y su valor;
    - el botón de acciones está en la tarjeta y responde al clic;
    - carga muestra esqueletos;
    - vacío muestra el mensaje;
  - **primer render (CA-1):** con `innerWidth` en 375, `renderToStaticMarkup(<DataTable … />)` (sin efectos) no contiene `<table`. Así se prueba que la tabla no aparece ni un instante.
- `components/obligations/agenda.test.tsx`: un caso a 375 px que completa un vencimiento desde su tarjeta (HU1, de punta a punta sobre una pantalla real).
- Las demás pruebas de pantallas con `DataTable` no cambian y siguen en el modo de escritorio (CA-5).
- CA-6 a CA-9 son solo CSS: se comprueban en la verificación visual (CA-10), no con pruebas de jsdom, que no calcula el diseño.

## Despliegue

Solo cambia el frontend. Pasa por el pipeline de F07 (Cloudflare). Sin variables de entorno nuevas.

## Notas de implementación

- **T001:** las tarjetas son una lista (`<ul>`/`<li>`) con un `<dl>` por fila. El stub de `matchMedia` va dentro de `if (typeof window !== 'undefined')`: `worker.test.ts` corre en Node y `setup.ts` también se carga ahí. El proyecto no tiene `@testing-library/user-event`; la prueba usa `fireEvent`, como las demás. `hooks/use-mobile.ts` está excluido del lint (es de shadcn).
- **T002:** la prueba pasó al escribirla: el comportamiento ya venía de T001 y este caso lo comprueba sobre `AgendaTable` real. Renderiza la tabla directamente porque el ayudante `renderTable` busca filas (`role="row"`), que en el celular no existen.
- **T003:** a 360 px cada tarjeta de saldo mide unos 156 px (`main` con `px-4` y `gap-4`). Con el `px-6` de `CardHeader` quedaban unos 106 px, y "$ 12.345.678" en `text-lg` no cabía. Por eso el relleno reducido (`px-4 sm:px-6`) se aplicó desde el principio, en lugar de esperar a la verificación visual.
- **T004 — Definición de Hecho:** CA-1 a CA-4 están en `data-table.test.tsx`. CA-5 lo cubren las pruebas existentes de las pantallas (siguen en escritorio, sin cambios) y el caso de la Agenda en el celular. CA-6 a CA-9 son solo CSS y se comprueban en CA-10 (T005).
- **T004 — Verificación completa:** `format:check`, `lint`, `typecheck` y `test` en verde (62 archivos, 553 pruebas).
