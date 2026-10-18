CREATE TYPE "anderp"."payment_mode" AS ENUM('daily', 'fixed');--> statement-breakpoint
CREATE TABLE "anderp"."fixed_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"period_year" smallint NOT NULL,
	"period_month" smallint NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "fixed_payments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "fixed_payments_year_ck" CHECK ("anderp"."fixed_payments"."period_year" between 2000 and 2100),
	CONSTRAINT "fixed_payments_month_ck" CHECK ("anderp"."fixed_payments"."period_month" between 1 and 12),
	CONSTRAINT "fixed_payments_amount_ck" CHECK ("anderp"."fixed_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "anderp"."provider_contracts" ADD COLUMN "payment_mode" "anderp"."payment_mode" DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "anderp"."fixed_payments" ADD CONSTRAINT "fixed_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."fixed_payments" ADD CONSTRAINT "fixed_payments_contract_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "anderp"."provider_contracts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixed_payments_contract_period_idx" ON "anderp"."fixed_payments" USING btree ("contract_id","period_year","period_month");