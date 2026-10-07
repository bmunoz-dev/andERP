-- Totales calculados, nunca almacenados (constitución, principio VI). security_invoker: la vista
-- se evalúa con los permisos de quien consulta (app_runtime), no con los del dueño.
CREATE VIEW "anderp"."v_fee_payment_totals" WITH (security_invoker = true) AS
SELECT fp.id AS fee_payment_id,
       fp.organization_id,
       fp.contract_id,
       COALESCE(SUM(d.amount), 0)::numeric(14, 2) AS total_amount
  FROM "anderp"."fee_payments" fp
  LEFT JOIN "anderp"."fee_payment_days" d ON d.fee_payment_id = fp.id
 WHERE fp.deleted_at IS NULL
 GROUP BY fp.id;
--> statement-breakpoint
CREATE VIEW "anderp"."v_contract_balances" WITH (security_invoker = true) AS
SELECT pc.id AS contract_id,
       pc.organization_id,
       pc.total_amount,
       COALESCE(SUM(t.total_amount), 0)::numeric(14, 2) AS paid_amount,
       (pc.total_amount - COALESCE(SUM(t.total_amount), 0))::numeric(14, 2) AS balance
  FROM "anderp"."provider_contracts" pc
  LEFT JOIN "anderp"."v_fee_payment_totals" t ON t.contract_id = pc.id
 WHERE pc.deleted_at IS NULL
 GROUP BY pc.id;
