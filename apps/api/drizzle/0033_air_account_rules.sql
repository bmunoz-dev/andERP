-- F18: reglas de las cuentas aéreas (design.md §5.10). Las funciones fijan `search_path` vacío
-- (aviso function_search_path_mutable de Supabase).

-- Funciones de Clic Kiu (F11) que quedaron huérfanas al borrar su tabla en la 0031.
DROP FUNCTION "anderp"."clickiu_movements_type_immutable"();
--> statement-breakpoint
DROP FUNCTION "anderp"."clickiu_movements_check_balance"();
--> statement-breakpoint

-- CA-15: única fórmula del saldo. Las emisiones restan; todo lo demás suma con su signo.
CREATE VIEW "anderp"."v_air_account_balances" WITH (security_invoker = true) AS
SELECT a.organization_id,
       a.id AS account_id,
       COALESCE(SUM(CASE WHEN m.type = 'issue' THEN -m.amount ELSE m.amount END), 0)::numeric(14, 2)
         AS balance,
       (COALESCE(SUM(CASE WHEN m.type = 'issue' THEN -m.amount ELSE m.amount END), 0)
         + a.credit_limit)::numeric(14, 2) AS available
  FROM "anderp"."air_accounts" a
  LEFT JOIN "anderp"."air_account_movements" m
    ON m.organization_id = a.organization_id AND m.account_id = a.id AND m.deleted_at IS NULL
 GROUP BY a.organization_id, a.id, a.credit_limit;
--> statement-breakpoint

-- CA-12: el tipo y la cuenta no cambian (el bloqueo del cupo es por cuenta).
CREATE FUNCTION "anderp"."air_account_movements_immutable"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.type IS DISTINCT FROM NEW.type THEN
    RAISE EXCEPTION 'AIR_MOVEMENT_TYPE_IMMUTABLE';
  END IF;
  RAISE EXCEPTION 'AIR_MOVEMENT_ACCOUNT_IMMUTABLE';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "air_account_movements_immutable"
  BEFORE UPDATE ON "anderp"."air_account_movements"
  FOR EACH ROW WHEN (OLD.type IS DISTINCT FROM NEW.type OR OLD.account_id IS DISTINCT FROM NEW.account_id)
  EXECUTE FUNCTION "anderp"."air_account_movements_immutable"();
--> statement-breakpoint

-- CA-16 a CA-18: el disponible (saldo + límite) nunca queda negativo. Mismo esquema que la regla de
-- Clic Kiu (0021–0023): bloqueo de dos claves antes de leer, clase 18 = cupo de una cuenta aérea, y
-- REPEATABLE READ rechazado porque su foto no vería lo confirmado por otra transacción.
CREATE FUNCTION "anderp"."check_air_account_limit"(account uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  account_limit numeric;
  account_available numeric;
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'air account limit check requires read committed or serializable'
      USING ERRCODE = '25000';
  END IF;
  PERFORM pg_advisory_xact_lock(18, hashtext(account::text));
  SELECT a.credit_limit, b.available INTO account_limit, account_available
    FROM "anderp"."air_accounts" a
    JOIN "anderp"."v_air_account_balances" b ON b.account_id = a.id
   WHERE a.id = account;
  IF account_available < 0 THEN
    IF account_limit = 0 THEN
      RAISE EXCEPTION 'AIR_ACCOUNT_INSUFFICIENT_BALANCE';
    END IF;
    RAISE EXCEPTION 'AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "anderp"."air_account_movements_check_limit"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM "anderp"."check_air_account_limit"(NEW.account_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "air_account_movements_check_limit"
  AFTER INSERT OR UPDATE ON "anderp"."air_account_movements"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "anderp"."air_account_movements_check_limit"();
--> statement-breakpoint
CREATE FUNCTION "anderp"."air_accounts_check_limit"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM "anderp"."check_air_account_limit"(NEW.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Subir el límite nunca viola la regla: solo se revisa al bajarlo.
CREATE CONSTRAINT TRIGGER "air_accounts_check_limit"
  AFTER UPDATE OF credit_limit ON "anderp"."air_accounts"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.credit_limit < OLD.credit_limit)
  EXECUTE FUNCTION "anderp"."air_accounts_check_limit"();
