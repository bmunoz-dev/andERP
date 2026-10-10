-- F10: el contrato guarda un monto mensual de referencia; lo pagado por mes no se bloquea.
-- Reemplaza la decisión del 2026-10-06 (CONTRACT_BALANCE_EXCEEDED).
DROP TRIGGER "fee_payment_days_check_balance" ON "anderp"."fee_payment_days";
--> statement-breakpoint
DROP FUNCTION "anderp"."fee_payment_days_check_balance"();
--> statement-breakpoint
DROP TRIGGER "provider_contracts_check_total" ON "anderp"."provider_contracts";
--> statement-breakpoint
DROP FUNCTION "anderp"."provider_contracts_check_total"();
--> statement-breakpoint
DROP VIEW "anderp"."v_contract_balances";
--> statement-breakpoint
ALTER TABLE "anderp"."provider_contracts" RENAME COLUMN "total_amount" TO "monthly_amount";
--> statement-breakpoint
ALTER TABLE "anderp"."provider_contracts"
  RENAME CONSTRAINT "provider_contracts_total_amount_ck" TO "provider_contracts_monthly_amount_ck";
--> statement-breakpoint
-- Lo pagado por contrato y por mes trabajado (periodo del pago, no su fecha de pago).
CREATE VIEW "anderp"."v_contract_month_totals" WITH (security_invoker = true) AS
SELECT fp.organization_id,
       fp.contract_id,
       fp.period_year,
       fp.period_month,
       SUM(t.total_amount)::numeric(14, 2) AS paid_amount
  FROM "anderp"."fee_payments" fp
  JOIN "anderp"."v_fee_payment_totals" t ON t.fee_payment_id = fp.id
 WHERE fp.deleted_at IS NULL
 GROUP BY fp.organization_id, fp.contract_id, fp.period_year, fp.period_month;
