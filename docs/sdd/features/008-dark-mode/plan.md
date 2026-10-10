# F08 — Modo oscuro · Plan

- **Estado:** Aprobado
- **Spec:** [spec.md](spec.md)

## Enfoque

shadcn/ui ya define la paleta oscura (bloque `.dark` en `index.css`) y la variante `dark` de Tailwind; solo falta decidir cuándo poner la clase `.dark` en `<html>`. Sin dependencias nuevas: `next-themes` se quitó en F00 y para tres opciones basta un módulo propio.

## Módulo `lib/theme.ts`

- `ThemeChoice = 'light' | 'dark' | 'system'`; se guarda en `localStorage` (`anderp-theme`). "Sistema" es no guardar nada. Cada acceso al almacenamiento va en `try/catch` (CA-3).
- `initTheme()`: aplica el tema y escucha `prefers-color-scheme` para el modo Sistema (CA-1). Se llama en `main.tsx` antes de `createRoot`, así no hay parpadeo y no hace falta un script en línea que la CSP bloquearía (CA-4).
- `setThemeChoice()` guarda, aplica y avisa a los suscriptores; `useThemeChoice()` es un `useSyncExternalStore`.
- Aplicar = `classList.toggle('dark')` y `style.colorScheme` en `<html>` (los controles nativos, como el calendario de `<input type="date">` y las barras de scroll, también cambian).

## Interfaz

- `UserMenu`: submenú **Tema** con `DropdownMenuRadioGroup` (Claro / Oscuro / Sistema) (CA-2).
- `Toaster` (sonner): `theme={useThemeChoice()}`; sonner entiende `'system'` (CA-5).
- Pantallas sin sesión: no necesitan nada, el tema vive en `<html>` (CA-5).

## Contraste (CA-6)

Fuera de `components/ui`, el único color fijo es `text-white` sobre el botón destructivo de `confirm-dialog`, válido en ambos temas. Se revisa a mano en el navegador (con autorización) la matriz, la cuadrícula de honorarios y las insignias.

## Notas de implementación

- **Botones rojos (CA-6).** En oscuro, `--destructive` es un rojo claro pensado para *texto* rojo sobre fondo oscuro (6.2:1). Los botones le ponían texto blanco encima: 2.9:1 en la confirmación de borrado y 4.35:1 en la variante de shadcn (`dark:bg-destructive/60`), ambos bajo AA. Se agregó `--destructive-solid` (red-700, igual en ambos temas; blanco encima 6.4:1) para el fondo de la variante `destructive`, y `ConfirmDialog` usa `buttonVariants({ variant: 'destructive' })` en lugar de repetir clases. El texto rojo (`text-destructive`) no cambia.
- **Botones de borrar en filas y paneles.** Eran `ghost` grises, iguales al botón de editar. Nueva variante `destructive-ghost` (icono y texto `text-destructive`, fondo rojo suave al pasar; 4.76:1 en claro y 6.19:1 en oscuro, sobre el 3:1 de un icono) en los 6 botones de borrar (departamentos, credenciales, honorarios, contratos, responsables y libro de egresos). El "Eliminar" con borde de la ficha del prestador queda `outline` con texto rojo, emparejado con "Editar". El rojo relleno se reserva para el botón que confirma el borrado. "Desactivar" (usuarios, departamentos, catálogos) sigue neutro: es reversible.
