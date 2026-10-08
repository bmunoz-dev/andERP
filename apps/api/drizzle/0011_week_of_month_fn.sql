-- Semana del mes en formato B (design.md §2, decisión 4): 1–7, 8–14, 15–21, 22–fin.
-- La usan la columna generada de `expenses` y la vista `v_expense_ledger`. Una prueba la compara
-- con `weekOfMonth()` de @anderp/shared para todos los días de 2024 a 2030.
CREATE FUNCTION "anderp"."week_of_month"(d date) RETURNS smallint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT LEAST((EXTRACT(DAY FROM d)::int - 1) / 7 + 1, 4)::smallint $$;
