-- Protege las categorías de sistema (F02 CA-10). "Honorarios" (system_code = 'FEES') recibe los
-- pagos de honorarios en las vistas de egresos: si se renombra, desactiva o borra, la vista se rompe.
-- Solo se permite cambiar su orden. El mensaje es el `code` que la API devuelve (422).
CREATE FUNCTION "anderp"."expense_categories_protect_system"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.system_code IS NOT NULL THEN
      RAISE EXCEPTION 'SYSTEM_CATEGORY_PROTECTED';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.system_code IS NULL AND NEW.system_code IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_CATEGORY_PROTECTED';
  END IF;

  IF OLD.system_code IS NOT NULL AND (
       NEW.name IS DISTINCT FROM OLD.name
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.system_code IS DISTINCT FROM OLD.system_code
  ) THEN
    RAISE EXCEPTION 'SYSTEM_CATEGORY_PROTECTED';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "expense_categories_protect_system"
  BEFORE UPDATE OR DELETE ON "anderp"."expense_categories"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."expense_categories_protect_system"();
