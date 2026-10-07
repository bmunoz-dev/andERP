-- Reglas de F04 que necesitan datos de otras tablas (un CHECK no puede consultarlas).
-- El mensaje de cada excepción es el `code` que la API devuelve (422).

-- CA-4: cada día pagado cae dentro de la semana del pago y de las fechas del contrato.
CREATE FUNCTION "anderp"."fee_payment_days_validate"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_period_start date;
  v_period_end date;
  v_contract_start date;
  v_contract_end date;
BEGIN
  SELECT fp.period_start, fp.period_end, pc.start_date, pc.end_date
    INTO v_period_start, v_period_end, v_contract_start, v_contract_end
    FROM "anderp"."fee_payments" fp
    JOIN "anderp"."provider_contracts" pc
      ON pc.organization_id = fp.organization_id AND pc.id = fp.contract_id
   WHERE fp.id = NEW.fee_payment_id;

  IF NEW.work_date < v_period_start OR NEW.work_date > v_period_end THEN
    RAISE EXCEPTION 'WORK_DATE_OUTSIDE_WEEK';
  END IF;
  IF NEW.work_date < v_contract_start OR (v_contract_end IS NOT NULL AND NEW.work_date > v_contract_end) THEN
    RAISE EXCEPTION 'WORK_DATE_OUTSIDE_CONTRACT';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "fee_payment_days_validate"
  BEFORE INSERT OR UPDATE ON "anderp"."fee_payment_days"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."fee_payment_days_validate"();
--> statement-breakpoint

-- CA-11: el contrato y el periodo de un pago no cambian; para corregirlos se borra y se crea otro.
CREATE FUNCTION "anderp"."fee_payments_period_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.period_year IS DISTINCT FROM OLD.period_year
     OR NEW.period_month IS DISTINCT FROM OLD.period_month
     OR NEW.week_of_month IS DISTINCT FROM OLD.week_of_month THEN
    RAISE EXCEPTION 'FEE_PAYMENT_PERIOD_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "fee_payments_period_immutable"
  BEFORE UPDATE ON "anderp"."fee_payments"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."fee_payments_period_immutable"();
--> statement-breakpoint

-- CA-14 y CA-15: un contrato con pagos no se borra, y sus fechas no pueden dejar días pagados afuera.
CREATE FUNCTION "anderp"."provider_contracts_protect_payments"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM "anderp"."fee_payments" fp
     WHERE fp.contract_id = OLD.id AND fp.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CONTRACT_HAS_PAYMENTS';
  END IF;

  IF (NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date)
     AND EXISTS (
       SELECT 1
         FROM "anderp"."fee_payment_days" d
         JOIN "anderp"."fee_payments" fp ON fp.id = d.fee_payment_id
        WHERE fp.contract_id = OLD.id AND fp.deleted_at IS NULL
          AND (d.work_date < NEW.start_date OR (NEW.end_date IS NOT NULL AND d.work_date > NEW.end_date))
     ) THEN
    RAISE EXCEPTION 'CONTRACT_DATES_EXCLUDE_PAYMENTS';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "provider_contracts_protect_payments"
  BEFORE UPDATE ON "anderp"."provider_contracts"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."provider_contracts_protect_payments"();
