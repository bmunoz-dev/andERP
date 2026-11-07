-- F22 CA-5 (constitución XII): app_runtime solo borra físicamente donde la API lo hace. El resto
-- usa borrado lógico. Las tablas nuevas tampoco reciben DELETE por defecto.
REVOKE DELETE ON ALL TABLES IN SCHEMA "anderp" FROM app_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "anderp" REVOKE DELETE ON TABLES FROM app_runtime;
--> statement-breakpoint
GRANT DELETE ON "anderp"."fee_payment_days", "anderp"."sessions", "anderp"."password_resets" TO app_runtime;
