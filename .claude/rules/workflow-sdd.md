---
paths:
  - "docs/sdd/**"
  - ".github/**"
---

# SDD y Git

- Una rama por feature: `feat/NNN-nombre`, desde `main` actualizado.
- Por tarea de `tasks.md`: prueba que falla → código mínimo → prueba en verde → marcar `[x]`.
- Si la spec o el diseño cambian, se actualiza el documento primero (y el historial de `design.md`). Las decisiones de implementación van en "Notas de implementación" del `plan.md`.
- Commits en inglés con Conventional Commits y el ID de la tarea: `feat(f03): ... [F03-T010]`.
- Al cerrar: `roadmap.md` actualizado, push y PR con el resumen (con la autorización de la regla 7 de `CLAUDE.md`). Merge con `gh pr merge N --merge` (merge commit), solo si el usuario lo pide.
- Antes de escribir en GitHub, verifica que `gh` use la cuenta dueña del repo (`CLAUDE.local.md`). No cambies la configuración global de Git.
