# AndERP — Desarrollo guiado por especificaciones (SDD)

Este directorio es la **fuente de verdad** de AndERP. El código implementa lo que dicen estos documentos; nunca al revés.

## Estructura

```
docs/sdd/
  README.md          este archivo: cómo se trabaja
  constitution.md    principios no negociables del proyecto
  design.md          diseño global aprobado (arquitectura, modelo de datos, seguridad)
  roadmap.md         orden de las features, estado y trazabilidad
  features/
    NNN-nombre/
      spec.md        QUÉ y POR QUÉ: historias de usuario y criterios de aceptación
      plan.md        CÓMO: migraciones, módulos, endpoints, pantallas y decisiones técnicas
      tasks.md       PASOS: tareas ordenadas con checkbox, dependencias y verificación
```

## Flujo de una feature

1. **Spec.** Se escribe o revisa `spec.md`. Estado: `Borrador` → `Aprobado`.
2. **Plan.** Se escribe o revisa `plan.md` contra la spec y la constitución. Estado: `Borrador` → `Aprobado`.
3. **Tareas.** `tasks.md` descompone el plan en tareas pequeñas (de 30 minutos a 2 horas cada una).
4. **Implementación.**
   - Una rama por feature: `feat/NNN-nombre`.
   - Por cada tarea: prueba que falla → código mínimo → prueba en verde → refactor → marcar `[x]` → commit.
   - Commits con Conventional Commits y el ID de la tarea: `feat(f04): valida días dentro de la semana [F04-T012]`.
5. **Cierre.** Se verifican todos los criterios de aceptación de la spec y la *Definición de Hecho* de la constitución. Se actualiza `roadmap.md` y se hace merge a `main`.

## Reglas de cambio

- **Si al implementar descubres que la spec está mal o incompleta, detente.** Actualiza primero `spec.md` (y `design.md` si afecta al diseño global, añadiendo una fila a su *Historial de cambios*); después sigue con el código.
- **Nunca se escribe código que contradiga un documento aprobado.**
- Si una tarea resulta más grande de lo previsto, se divide en `tasks.md` antes de continuar.

## Convenciones en `tasks.md`

```
- [ ] F04-T012 [P] Descripción de la tarea
      Archivos: ruta/a/archivo.ts
      Depende de: F04-T010
      Verificación: qué prueba o comando demuestra que está hecha
```

| Marca | Significado |
|---|---|
| `[ ]` / `[x]` | Pendiente / hecha |
| `[P]` | Se puede hacer en paralelo con las demás `[P]` de su bloque |
| `[TDD]` | La prueba se escribe y se ve fallar antes que el código |
| `CA-n` | Referencia a un criterio de aceptación de la `spec.md` de la feature |

## Migraciones en los planes

Los números de migración de los `plan.md` (`0005_…`, `0010_…`) son **orientativos**. El número real lo asigna `drizzle-kit` al generarla, según el orden en que se implementen las features (F06 puede hacerse antes que F05). El nombre descriptivo sí se respeta.

## Estados

| Estado | Uso |
|---|---|
| `Pendiente` | No se ha empezado |
| `Borrador` | Documento en redacción |
| `Aprobado` | Documento revisado; se puede avanzar a la siguiente etapa |
| `En progreso` | Implementación en curso |
| `Hecho` | Criterios de aceptación y Definición de Hecho cumplidos |
| `Bloqueado` | Espera algo externo; se anota el motivo en `roadmap.md` |
