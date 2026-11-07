-- F23: reglas que hoy solo aplica el código, ahora también en la base (constitución III).

-- CA-12: si hay datos que violan las reglas nuevas, la migración se detiene antes de crearlas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "anderp"."service_providers" sp
      JOIN "anderp"."provider_contracts" pc
        ON pc.organization_id = sp.organization_id AND pc.service_provider_id = sp.id
     WHERE sp.deleted_at IS NOT NULL AND pc.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'F23: hay prestadores borrados con contratos sin borrar; corrígelos antes de migrar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "anderp"."service_providers" sp
      JOIN "anderp"."provider_contracts" pc
        ON pc.organization_id = sp.organization_id AND pc.service_provider_id = sp.id
     WHERE (NOT sp.is_active OR sp.deleted_at IS NOT NULL) AND pc.deleted_at IS NULL
       AND (pc.end_date IS NULL OR pc.end_date >= (now() AT TIME ZONE 'America/Bogota')::date)
  ) THEN
    RAISE EXCEPTION 'F23: hay contratos vigentes o futuros de prestadores inactivos o borrados; corrígelos antes de migrar';
  END IF;
END $$;
--> statement-breakpoint

-- CA-1: un prestador con contratos sin borrar no se borra.
CREATE FUNCTION "anderp"."service_providers_guard_delete"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM "anderp"."provider_contracts" pc
     WHERE pc.organization_id = OLD.organization_id AND pc.service_provider_id = OLD.id
       AND pc.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PROVIDER_HAS_CONTRACTS';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "service_providers_guard_delete"
  BEFORE UPDATE OF "deleted_at" ON "anderp"."service_providers"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."service_providers_guard_delete"();
--> statement-breakpoint

-- CA-2 y CA-3: un prestador inactivo o borrado no recibe contratos, y un contrato suyo no vuelve
-- a quedar vigente o futuro al editarlo. La fila del prestador se lee con FOR SHARE: así una
-- desactivación o un borrado simultáneos (un UPDATE de esa fila) esperan, y no pasan los dos.
CREATE OR REPLACE FUNCTION "anderp"."provider_contracts_require_active_provider"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_active boolean;
  v_deleted_at timestamptz;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT sp.is_active, sp.deleted_at INTO v_active, v_deleted_at
    FROM "anderp"."service_providers" sp
   WHERE sp.organization_id = NEW.organization_id AND sp.id = NEW.service_provider_id
     FOR SHARE;
  -- Sin fila decide la FK compuesta.
  IF NOT FOUND OR (v_active AND v_deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
     OR NEW.end_date IS NULL
     OR NEW.end_date >= (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'PROVIDER_INACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER "provider_contracts_require_active_provider" ON "anderp"."provider_contracts";
--> statement-breakpoint
CREATE TRIGGER "provider_contracts_require_active_provider"
  BEFORE INSERT OR UPDATE OF "service_provider_id", "start_date", "end_date", "deleted_at"
  ON "anderp"."provider_contracts"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."provider_contracts_require_active_provider"();
