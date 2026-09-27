# Constitución de AndERP

Principios no negociables. Todo `plan.md` se revisa contra esta lista antes de aprobarse. Si un principio estorba, se discute y se cambia aquí primero; no se ignora en silencio.

## Principios

**I. Spec primero.**
Nada se implementa sin `spec.md` y `plan.md` aprobados. Un cambio de comportamiento actualiza primero la documentación.

**II. Pruebas primero en la lógica que importa.**
La lógica de dominio, las reglas de la base de datos (restricciones, triggers, vistas) y la seguridad se desarrollan con TDD. Las pruebas de integración usan **Postgres real**, nunca simulaciones de la base de datos.

**III. La base de datos es la última línea de defensa.**
Toda invariante importante existe en el dominio **y** en la base de datos (CHECK, UNIQUE, EXCLUDE, FK o trigger). Si el backend tiene un bug, la base de datos rechaza el dato.

**IV. Aislamiento por organización.**
- Toda tabla de una organización tiene `organization_id NOT NULL`, `UNIQUE (organization_id, id)` y FK compuestas.
- Toda consulta pasa por el repositorio base, que aplica `organization_id` y `deleted_at IS NULL`.
- Cada módulo tiene al menos una prueba de API que demuestra que la organización A no puede leer ni escribir datos de la B.

**V. Dinero exacto.**
`numeric(14,2)` en la base de datos, sumas en SQL y strings decimales en la API. Nunca se hace aritmética de dinero con `number` de JavaScript.

**VI. Lo derivado no se almacena.**
Totales, saldos y semanas se calculan (vistas o columnas generadas). Si hace falta rendimiento, se materializa sin cambiar el contrato de la API.

**VII. Secretos protegidos.**
- Contraseñas de usuarios: argon2id.
- Tokens: SHA-256.
- Credenciales de portales externos: AES-256-GCM con AAD.
- Nada de esto aparece en claro en la base de datos, los logs ni las respuestas, salvo el endpoint de revelar, que queda auditado.

**VIII. Idiomas.**
Base de datos, código, `code` de errores y commits de código en **inglés**. Interfaz y documentación en **español**. Se sigue el glosario de `design.md` §3.

**IX. Hexagonal solo donde hay dominio.**
`auth`, `fee-payments` y `credentials` usan puertos y adaptadores. El resto usa controlador → servicio → repositorio. No se crean capas vacías.

**X. Trazabilidad.**
Borrado lógico en las tablas de negocio, columnas `created_by` y `updated_by` en todo registro, y `audit_logs` para dinero, credenciales y auth.

**XI. YAGNI.**
No se construye nada que no pida una spec aprobada. Las ideas futuras van a `design.md` §11.

**XII. Seguridad por defecto.**
- Toda ruta de la API requiere autenticación salvo las marcadas `@Public()`.
- Toda ruta de plataforma exige `super_admin`.
- La API se conecta con un rol de base de datos de privilegios mínimos.

## Definición de Hecho (para cada feature)

- [ ] Todos los criterios de aceptación de `spec.md` tienen al menos una prueba automatizada y pasan.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde en CI.
- [ ] La prueba de aislamiento entre organizaciones existe y pasa (si la feature toca datos de una organización).
- [ ] Las migraciones se aplican desde cero sobre una base de datos vacía.
- [ ] Los endpoints nuevos aparecen documentados en OpenAPI.
- [ ] Los `code` de error nuevos tienen mensaje en español en la web.
- [ ] Todas las tareas de `tasks.md` están marcadas y `roadmap.md` está actualizado.
- [ ] Ningún `TODO` queda sin una tarea que lo respalde.
