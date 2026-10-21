CREATE TYPE "anderp"."app_module" AS ENUM('staff_payments', 'credentials', 'air_accounts', 'agenda');--> statement-breakpoint
ALTER TABLE "anderp"."organizations" ADD COLUMN "modules" "anderp"."app_module"[] DEFAULT '{}'::anderp.app_module[] NOT NULL;--> statement-breakpoint
UPDATE anderp.organizations SET modules = '{staff_payments,credentials,air_accounts,agenda}';
