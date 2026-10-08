-- F06 CA-2: un responsable con credenciales vigentes no se borra.
CREATE FUNCTION "anderp"."responsible_persons_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM "anderp"."entity_credentials" c
     WHERE c.organization_id = OLD.organization_id AND c.responsible_person_id = OLD.id
       AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'RESPONSIBLE_IN_USE';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "responsible_persons_guard"
  BEFORE UPDATE OF "deleted_at" ON "anderp"."responsible_persons"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."responsible_persons_guard"();
