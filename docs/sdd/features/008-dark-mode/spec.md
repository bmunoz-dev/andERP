# F08 — Modo oscuro · Spec

- **Estado:** Aprobado
- **Diseño:** `design.md` §8

## Objetivo

Que AndERP se pueda usar con tema oscuro, con buen contraste, siguiendo por defecto el tema del sistema operativo y permitiendo que cada persona lo cambie.

## Historias

- **HU1.** Como usuario, quiero que AndERP use el tema de mi sistema operativo sin configurar nada.
- **HU2.** Como usuario, quiero elegir Claro, Oscuro o Sistema desde el menú de usuario y que mi elección se recuerde.

## Criterios de aceptación

- **CA-1.** Sin elección guardada, la app usa el tema del sistema (`prefers-color-scheme`). Si el sistema cambia de tema con la app abierta, la app cambia en vivo.
- **CA-2.** El menú de usuario tiene **Tema → Claro / Oscuro / Sistema**, con una marca en la opción activa. Elegir una aplica el tema al instante.
- **CA-3.** La elección se guarda en el navegador y se mantiene al recargar y al cerrar sesión. Si el almacenamiento del navegador no está disponible, la app funciona igual con el tema del sistema.
- **CA-4.** No hay parpadeo de tema claro al cargar en oscuro: el tema se aplica antes de dibujar la app, sin scripts en línea (la CSP de F07 los bloquea).
- **CA-5.** El tema aplica a todas las pantallas, incluidas las que no requieren sesión (login, activar, recuperar contraseña) y las notificaciones.
- **CA-6.** En oscuro, el texto cumple contraste WCAG AA (4.5:1; 3:1 para texto grande y bordes de controles). Las pantallas propias (matriz de egresos, cuadrícula de honorarios, insignias de contrato, panel del libro) no usan colores fijos que se pierdan en oscuro.

## Fuera de alcance

- Guardar la preferencia en la cuenta del usuario (sincronizar entre equipos). Requeriría API y base de datos para un ajuste visual; se reevalúa si alguien lo pide.
- Temas de color por organización y alto contraste.
