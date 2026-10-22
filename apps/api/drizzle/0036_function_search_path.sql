-- F07 (pendiente 3): las funciones anteriores a 0028 fijan `search_path` vacío, como las nuevas
-- (aviso function_search_path_mutable de Supabase). Sus cuerpos ya nombran las tablas con `anderp.`.
ALTER FUNCTION "anderp"."expense_categories_protect_expenses"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."expense_categories_protect_system"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."expenses_reject_fees_category"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."fee_payment_days_validate"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."fee_payments_period_immutable"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."provider_contracts_require_active_provider"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."responsible_persons_guard"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."service_providers_guard_deactivation"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "anderp"."week_of_month"(date) SET search_path = '';
