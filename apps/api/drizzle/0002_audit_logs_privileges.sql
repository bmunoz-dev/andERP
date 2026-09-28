-- audit_logs es de solo inserción para la API (design.md §5.9, F01-T002).
-- Los privilegios por defecto de 0000_base le dan SELECT, INSERT, UPDATE y DELETE; se retiran
-- los que permitirían alterar o borrar el historial.
REVOKE UPDATE, DELETE, TRUNCATE ON "anderp"."audit_logs" FROM app_runtime;
