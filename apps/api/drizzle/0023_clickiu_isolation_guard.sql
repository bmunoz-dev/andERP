-- La regla del saldo de Clic Kiu solo es correcta en READ COMMITTED (tras el bloqueo, la lectura ve
-- lo confirmado por otras transacciones) y en SERIALIZABLE (Postgres aborta una de dos ventas en
-- conflicto). En REPEATABLE READ la foto es la del inicio y dos ventas pasarían; se rechaza con un
-- error interno (25000, 500 en la API) en lugar de dejar el saldo negativo sin aviso.
CREATE OR REPLACE FUNCTION "anderp"."clickiu_movements_check_balance"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'clickiu balance check requires read committed or serializable'
      USING ERRCODE = '25000';
  END IF;
  PERFORM pg_advisory_xact_lock(11, hashtext(NEW.organization_id::text));
  IF EXISTS (
    SELECT 1 FROM "anderp"."v_clickiu_balance"
     WHERE organization_id = NEW.organization_id AND balance < 0
  ) THEN
    RAISE EXCEPTION 'CLICKIU_INSUFFICIENT_BALANCE';
  END IF;
  RETURN NULL;
END;
$$;
