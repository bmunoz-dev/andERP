-- F11: saldo de Clic Kiu. Las funciones fijan `search_path` vacío (aviso function_search_path_mutable de Supabase).

-- Saldo actual por organización: recargas − ventas (en cualquier estado), sin borrados.
CREATE VIEW "anderp"."v_clickiu_balance" WITH (security_invoker = true) AS
SELECT organization_id,
       (COALESCE(SUM(amount) FILTER (WHERE type = 'recharge'), 0)
        - COALESCE(SUM(amount) FILTER (WHERE type = 'sale'), 0))::numeric(14, 2) AS balance
  FROM "anderp"."clickiu_movements"
 WHERE deleted_at IS NULL
 GROUP BY organization_id;
--> statement-breakpoint

-- CA-3: una recarga no se convierte en venta ni al revés.
CREATE FUNCTION "anderp"."clickiu_movements_type_immutable"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'CLICKIU_MOVEMENT_TYPE_IMMUTABLE';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "clickiu_movements_type_immutable"
  BEFORE UPDATE ON "anderp"."clickiu_movements"
  FOR EACH ROW WHEN (OLD.type IS DISTINCT FROM NEW.type)
  EXECUTE FUNCTION "anderp"."clickiu_movements_type_immutable"();
--> statement-breakpoint

-- CA-7 y CA-9: el saldo nunca queda negativo. Diferido: se revisa al confirmar la transacción.
-- El bloqueo por organización va antes de leer: en READ COMMITTED la lectura siguiente ya ve lo
-- que confirmó otra transacción, así dos ventas simultáneas se validan en serie.
CREATE FUNCTION "anderp"."clickiu_movements_check_balance"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM "anderp"."v_clickiu_balance"
     WHERE organization_id = NEW.organization_id AND balance < 0
  ) THEN
    RAISE EXCEPTION 'CLICKIU_INSUFFICIENT_BALANCE';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "clickiu_movements_check_balance"
  AFTER INSERT OR UPDATE ON "anderp"."clickiu_movements"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "anderp"."clickiu_movements_check_balance"();
