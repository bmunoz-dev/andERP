-- F04 CA-9 (cambio del 2026-10-06): lo pagado nunca supera el valor total del contrato.

-- Diferido: se revisa al confirmar la transacción, cuando ya están todos los días del pago.
CREATE FUNCTION "anderp"."fee_payment_days_check_balance"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "anderp"."fee_payments" fp
      JOIN "anderp"."v_contract_balances" b ON b.contract_id = fp.contract_id
     WHERE fp.id = NEW.fee_payment_id AND b.balance < 0
  ) THEN
    RAISE EXCEPTION 'CONTRACT_BALANCE_EXCEEDED';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "fee_payment_days_check_balance"
  AFTER INSERT OR UPDATE ON "anderp"."fee_payment_days"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "anderp"."fee_payment_days_check_balance"();
--> statement-breakpoint

-- El valor del contrato no puede bajar de lo ya pagado.
CREATE FUNCTION "anderp"."provider_contracts_check_total"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_amount < OLD.total_amount AND NEW.total_amount < (
    SELECT COALESCE(SUM(t.total_amount), 0)
      FROM "anderp"."v_fee_payment_totals" t
     WHERE t.contract_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'CONTRACT_BALANCE_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "provider_contracts_check_total"
  BEFORE UPDATE OF "total_amount" ON "anderp"."provider_contracts"
  FOR EACH ROW EXECUTE FUNCTION "anderp"."provider_contracts_check_total"();
