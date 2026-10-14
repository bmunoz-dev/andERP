-- Bloqueo del saldo de Clic Kiu con la forma de dos claves (clase, objeto): la clase 11 es la de esta
-- regla (design.md §5.10). Así no choca con otros bloqueos sobre el id de la organización.
CREATE OR REPLACE FUNCTION "anderp"."clickiu_movements_check_balance"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
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
