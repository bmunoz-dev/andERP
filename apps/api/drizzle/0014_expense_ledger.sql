-- F05 CA-8: libro unificado. Una fila por egreso manual y una por pago de honorarios; los pagos
-- caen en la categoría FEES de su organización, en el mes y la semana de su fecha de pago.
CREATE VIEW "anderp"."v_expense_ledger" WITH (security_invoker = true) AS
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
 WHERE fp.deleted_at IS NULL;
