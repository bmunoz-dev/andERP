-- F16: pagos de monto fijo. El mensaje de cada excepción es el `code` que la API devuelve (422).
-- Las funciones fijan `search_path` vacío (aviso function_search_path_mutable de Supabase).
-- Los triggers de pagos leen el contrato con FOR SHARE: un cambio simultáneo de su forma de pago
-- o de sus fechas espera a que el pago se confirme, y entonces ve el pago.

-- CA-5, CA-6 y CA-9: contrato de monto fijo, mes trabajado dentro del contrato, contrato y mes inmutables.
CREATE FUNCTION "anderp"."fixed_payments_validate"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_mode "anderp"."payment_mode";
  v_start date;
  v_end date;
  v_first date := make_date(NEW.period_year, NEW.period_month, 1);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.contract_id IS DISTINCT FROM OLD.contract_id
       OR NEW.period_year IS DISTINCT FROM OLD.period_year
       OR NEW.period_month IS DISTINCT FROM OLD.period_month THEN
      RAISE EXCEPTION 'FIXED_PAYMENT_PERIOD_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  SELECT pc.payment_mode, pc.start_date, pc.end_date
    INTO v_mode, v_start, v_end
    FROM "anderp"."provider_contracts" pc
   WHERE pc.organization_id = NEW.organization_id AND pc.id = NEW.contract_id
     FOR SHARE;

  IF v_mode <> 'fixed' THEN
    RAISE EXCEPTION 'CONTRACT_PAYMENT_MODE_MISMATCH';
  END IF;
  IF (v_end IS NOT NULL AND v_first > v_end)
     OR (v_first + interval '1 month' - interval '1 day')::date < v_start THEN
    RAISE EXCEPTION 'FIXED_PAYMENT_OUTSIDE_CONTRACT';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "fixed_payments_validate"
  BEFORE INSERT OR UPDATE ON "anderp"."fixed_payments"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."fixed_payments_validate"();
--> statement-breakpoint

-- CA-12: un pago por días exige un contrato por días. Basta al insertar: el contrato del pago no cambia.
CREATE FUNCTION "anderp"."fee_payments_check_mode"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (SELECT pc.payment_mode
        FROM "anderp"."provider_contracts" pc
       WHERE pc.organization_id = NEW.organization_id AND pc.id = NEW.contract_id
         FOR SHARE) <> 'daily' THEN
    RAISE EXCEPTION 'CONTRACT_PAYMENT_MODE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "fee_payments_check_mode"
  BEFORE INSERT ON "anderp"."fee_payments"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."fee_payments_check_mode"();
--> statement-breakpoint

-- F04 CA-14 y CA-15, ampliadas por F16 CA-3, CA-13 y CA-14: un contrato con pagos (por días o
-- de monto fijo) no se borra, no cambia de forma de pago y sus fechas no dejan pagos afuera.
CREATE OR REPLACE FUNCTION "anderp"."provider_contracts_protect_payments"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_has_payments boolean;
BEGIN
  -- Solo se consulta si el contrato tiene pagos cuando cambia algo que lo exige.
  IF (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
     OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode THEN
    v_has_payments := EXISTS (
      SELECT 1 FROM "anderp"."fee_payments" fp WHERE fp.contract_id = OLD.id AND fp.deleted_at IS NULL
    ) OR EXISTS (
      SELECT 1 FROM "anderp"."fixed_payments" xp WHERE xp.contract_id = OLD.id AND xp.deleted_at IS NULL
    );
    IF v_has_payments AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'CONTRACT_HAS_PAYMENTS';
    END IF;
    IF v_has_payments AND NEW.payment_mode IS DISTINCT FROM OLD.payment_mode THEN
      RAISE EXCEPTION 'CONTRACT_PAYMENT_MODE_LOCKED';
    END IF;
  END IF;

  IF (NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date)
     AND (EXISTS (
       SELECT 1
         FROM "anderp"."fee_payment_days" d
         JOIN "anderp"."fee_payments" fp ON fp.id = d.fee_payment_id
        WHERE fp.contract_id = OLD.id AND fp.deleted_at IS NULL
          AND (d.work_date < NEW.start_date OR (NEW.end_date IS NOT NULL AND d.work_date > NEW.end_date))
     ) OR EXISTS (
       SELECT 1
         FROM "anderp"."fixed_payments" xp
        WHERE xp.contract_id = OLD.id AND xp.deleted_at IS NULL
          AND ((NEW.end_date IS NOT NULL AND make_date(xp.period_year, xp.period_month, 1) > NEW.end_date)
            OR (make_date(xp.period_year, xp.period_month, 1) + interval '1 month' - interval '1 day')::date
               < NEW.start_date)
     )) THEN
    RAISE EXCEPTION 'CONTRACT_DATES_EXCLUDE_PAYMENTS';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- CA-17: lo pagado por contrato y mes trabajado suma los dos tipos de pago.
CREATE OR REPLACE VIEW "anderp"."v_contract_month_totals" WITH (security_invoker = true) AS
SELECT p.organization_id,
       p.contract_id,
       p.period_year,
       p.period_month,
       SUM(p.amount)::numeric(14, 2) AS paid_amount
  FROM (
    SELECT fp.organization_id, fp.contract_id, fp.period_year, fp.period_month, t.total_amount AS amount
      FROM "anderp"."fee_payments" fp
      JOIN "anderp"."v_fee_payment_totals" t ON t.fee_payment_id = fp.id
     WHERE fp.deleted_at IS NULL
    UNION ALL
    SELECT xp.organization_id, xp.contract_id, xp.period_year, xp.period_month, xp.amount
      FROM "anderp"."fixed_payments" xp
     WHERE xp.deleted_at IS NULL
  ) p
 GROUP BY p.organization_id, p.contract_id, p.period_year, p.period_month;
--> statement-breakpoint

-- CA-15: el libro suma los pagos de monto fijo en la categoría FEES, en el mes y la semana de su fecha de pago.
CREATE OR REPLACE VIEW "anderp"."v_expense_ledger" WITH (security_invoker = true) AS
SELECT e.organization_id,
       'manual'::text AS source,
       e.id AS source_id,
       e.category_id,
       e.concept,
       e.invoice_number,
       e.payment_date,
       e.week_of_month,
       e.amount
  FROM "anderp"."expenses" e
 WHERE e.deleted_at IS NULL
UNION ALL
SELECT fp.organization_id,
       'fee_payment'::text,
       fp.id,
       c.id,
       'Honorarios – ' || sp.name || ' – Sem ' || fp.week_of_month || ' '
         || lpad(fp.period_month::text, 2, '0') || '/' || fp.period_year,
       NULL,
       fp.payment_date,
       "anderp"."week_of_month"(fp.payment_date),
       t.total_amount
  FROM "anderp"."fee_payments" fp
  JOIN "anderp"."v_fee_payment_totals" t ON t.fee_payment_id = fp.id
  JOIN "anderp"."provider_contracts" pc
    ON pc.organization_id = fp.organization_id AND pc.id = fp.contract_id
  JOIN "anderp"."service_providers" sp
    ON sp.organization_id = pc.organization_id AND sp.id = pc.service_provider_id
  JOIN "anderp"."expense_categories" c
    ON c.organization_id = fp.organization_id AND c.system_code = 'FEES' AND c.deleted_at IS NULL
 WHERE fp.deleted_at IS NULL
UNION ALL
SELECT xp.organization_id,
       'fixed_payment'::text,
       xp.id,
       c.id,
       'Pago – ' || sp.name || ' – ' || lpad(xp.period_month::text, 2, '0') || '/' || xp.period_year,
       NULL,
       xp.payment_date,
       "anderp"."week_of_month"(xp.payment_date),
       xp.amount
  FROM "anderp"."fixed_payments" xp
  JOIN "anderp"."provider_contracts" pc
    ON pc.organization_id = xp.organization_id AND pc.id = xp.contract_id
  JOIN "anderp"."service_providers" sp
    ON sp.organization_id = pc.organization_id AND sp.id = pc.service_provider_id
  JOIN "anderp"."expense_categories" c
    ON c.organization_id = xp.organization_id AND c.system_code = 'FEES' AND c.deleted_at IS NULL
 WHERE xp.deleted_at IS NULL;
