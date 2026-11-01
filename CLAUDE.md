# AndERP — Instrucciones para Claude

Sistema de gestión de egresos, honorarios, prestadores y credenciales. Monorepo pnpm: `apps/api` (NestJS 11 + Drizzle + PostgreSQL), `apps/web` (React 19 + Vite + TanStack Router/Query + shadcn/ui), `packages/shared` (Zod, fechas, dinero y códigos de error).

**La fuente de verdad es [`docs/sdd/`](docs/sdd/README.md):** `constitution.md` (principios), `design.md` (diseño e historial), `roadmap.md` (estado, bloqueos y notas) y `features/NNN-*/` (spec, plan y tareas). Antes de trabajar en una feature, lee su `spec.md`, `plan.md` y `tasks.md`. Al retomar tras una pausa o una compresión del contexto, lee primero `roadmap.md` y el `tasks.md` activo.

Las reglas técnicas están en `.claude/rules/` y se cargan según los archivos que toques: `security`, `database`, `backend`, `frontend`, `shared`, `testing` y `workflow-sdd` (SDD y Git). Comandos y entorno: [`docs/development/commands.md`](docs/development/commands.md). Los datos de esta máquina (cuentas de Git y `gh`) van en `CLAUDE.local.md`, fuera de git.

## Reglas globales

1. **Ser crítico, no complaciente.** Evalúa cada idea, decisión o cambio del usuario contra la constitución, el diseño, la seguridad y el costo. Si tiene un problema, dilo con claridad y propón una alternativa; cuestiona prioridades y señala riesgos aunque no se pregunten. Si el usuario tiene razón, dilo en una frase y sigue. Si decide seguir tras la objeción, se respeta y se deja constancia en el documento que corresponda. Aplica la misma exigencia a tu propio trabajo.
2. **Skill `ponytail` en toda tarea que cree o corrija código:** la solución más simple que cumpla la spec, sin capas, opciones ni abstracciones que nadie pidió (constitución XI). Al empezar cada sesión, antes de editar código, comprueba que exista `.claude/skills/ponytail/`. Si falta, detente y pide al usuario que la instale desde la raíz con `npx skills add https://github.com/dietrichgebert/ponytail --skill ponytail`. **La instala el usuario, no Claude** (es código de terceros). Si decide seguir sin ella, aplica el principio a mano y recuérdaselo en la siguiente sesión.
3. **Economía de tokens.** Inspecciona solo lo necesario (un `grep` o una lectura dirigida), agrupa las llamadas independientes, lee rangos de líneas y corre solo las pruebas afectadas. Respuestas breves: qué se hizo, qué se verificó, qué falta y qué decidir.
4. **Navegador solo con autorización** en el chat, cada vez: navegador integrado, `preview_start`, Claude in Chrome o cualquier herramienta que abra páginas. Verifica primero con pruebas y consultas.
5. **Entorno local solo con autorización** en el chat, cada vez: `pnpm dev` o arrancar API/web, `docker compose up`/`down`, abrir Docker Desktop (si está cerrado, pide al usuario que lo abra), `pnpm db:migrate`/`db:seed`, peticiones HTTP contra la app local y crear o borrar sus datos. Sin permiso se pueden correr pruebas con Testcontainers (base efímera), typecheck, lint, formato y build; si no sabes qué hace un script, inspecciónalo antes.
6. **Producción y servicios remotos** (Supabase, Render, Cloudflare, GitHub): confirma antes de cualquier cambio.
7. **Git:** no hagas commit, push ni PR hasta que el usuario lo autorice para el alcance actual (si pidió completar la entrega de una feature, ese es el alcance). El merge lo hace el usuario; solo si lo pide expresamente y con el CI en verde.
8. **Subagentes:** no delegues salvo autorización explícita para la tarea actual, limitada a ese alcance y sin delegación en cadena. Una skill o un subagente nunca concede permisos que el usuario no dio.
9. **Idiomas:** código, base de datos, `code` de error y commits en inglés; interfaz y documentación en español (constitución VIII).
