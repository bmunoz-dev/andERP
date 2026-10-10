-- F09 CA-2: un prestador inactivo no recibe contratos nuevos.
CREATE FUNCTION "anderp"."provider_contracts_require_active_provider"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "anderp"."service_providers" sp
     WHERE sp.organization_id = NEW.organization_id AND sp.id = NEW.service_provider_id
       AND NOT sp.is_active
  ) THEN
    RAISE EXCEPTION 'PROVIDER_INACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "provider_contracts_require_active_provider"
  BEFORE INSERT ON "anderp"."provider_contracts"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."provider_contracts_require_active_provider"();
--> statement-breakpoint

-- F09 CA-3: no se desactiva con un contrato vigente o futuro (fin nulo o desde hoy en Bogotá).
CREATE FUNCTION "anderp"."service_providers_guard_deactivation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
    SELECT 1 FROM "anderp"."provider_contracts" pc
     WHERE pc.organization_id = OLD.organization_id AND pc.service_provider_id = OLD.id
       AND pc.deleted_at IS NULL
       AND (pc.end_date IS NULL OR pc.end_date >= (now() AT TIME ZONE 'America/Bogota')::date)
  ) THEN
    RAISE EXCEPTION 'PROVIDER_HAS_ACTIVE_CONTRACT';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "service_providers_guard_deactivation"
  BEFORE UPDATE OF "is_active" ON "anderp"."service_providers"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."service_providers_guard_deactivation"();
