-- F13 CA-9: el historial no se reescribe. Un vencimiento completado no cambia de fecha ni de obligación.
-- La función fija `search_path` vacío (aviso function_search_path_mutable de Supabase).
CREATE FUNCTION "anderp"."obligation_due_dates_completed_immutable"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'DUE_DATE_COMPLETED_IMMUTABLE';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "obligation_due_dates_completed_immutable"
  BEFORE UPDATE ON "anderp"."obligation_due_dates"
  FOR EACH ROW WHEN (
    OLD.completed_at IS NOT NULL
    AND (NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id)
  )
  EXECUTE FUNCTION "anderp"."obligation_due_dates_completed_immutable"();
