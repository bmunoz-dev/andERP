-- F05 CA-3: la categoría "Honorarios" (system_code = 'FEES') solo se alimenta de los pagos de
-- honorarios; un egreso manual ahí contaría el mismo dinero dos veces.
CREATE FUNCTION "anderp"."expenses_reject_fees_category"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "anderp"."expense_categories" c
     WHERE c.organization_id = NEW.organization_id AND c.id = NEW.category_id AND c.system_code = 'FEES'
  ) THEN
    RAISE EXCEPTION 'FEES_CATEGORY_NOT_ALLOWED';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "expenses_reject_fees_category"
  BEFORE INSERT OR UPDATE OF "category_id" ON "anderp"."expenses"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."expenses_reject_fees_category"();
--> statement-breakpoint

-- F05 CA-7 (pendiente de F02): una categoría con egresos vigentes no se borra; se desactiva.
CREATE FUNCTION "anderp"."expense_categories_protect_expenses"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM "anderp"."expenses" e
     WHERE e.organization_id = OLD.organization_id AND e.category_id = OLD.id AND e.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CATEGORY_HAS_EXPENSES';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "expense_categories_protect_expenses"
  BEFORE UPDATE OF "deleted_at" ON "anderp"."expense_categories"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."expense_categories_protect_expenses"();
