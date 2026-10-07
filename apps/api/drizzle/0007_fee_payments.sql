CREATE TABLE "anderp"."fee_payment_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"fee_payment_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"is_holiday" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_payment_days_date_uq" UNIQUE("fee_payment_id","work_date"),
	CONSTRAINT "fee_payment_days_amount_ck" CHECK ("anderp"."fee_payment_days"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "anderp"."fee_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"period_year" smallint NOT NULL,
	"period_month" smallint NOT NULL,
	"week_of_month" smallint NOT NULL,
	"period_start" date GENERATED ALWAYS AS (make_date(period_year, period_month, 1) + (week_of_month - 1) * 7) STORED NOT NULL,
	"period_end" date GENERATED ALWAYS AS (case when week_of_month < 4
          then make_date(period_year, period_month, 1) + (week_of_month - 1) * 7 + 6
          else (make_date(period_year, period_month, 1) + interval '1 month' - interval '1 day')::date end) STORED NOT NULL,
	"payment_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "fee_payments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "fee_payments_year_ck" CHECK ("anderp"."fee_payments"."period_year" between 2000 and 2100),
	CONSTRAINT "fee_payments_month_ck" CHECK ("anderp"."fee_payments"."period_month" between 1 and 12),
	CONSTRAINT "fee_payments_week_ck" CHECK ("anderp"."fee_payments"."week_of_month" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "anderp"."fee_payment_days" ADD CONSTRAINT "fee_payment_days_payment_fk" FOREIGN KEY ("organization_id","fee_payment_id") REFERENCES "anderp"."fee_payments"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."fee_payments" ADD CONSTRAINT "fee_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."fee_payments" ADD CONSTRAINT "fee_payments_contract_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "anderp"."provider_contracts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_period_uq" ON "anderp"."fee_payments" USING btree ("contract_id","period_year","period_month","week_of_month") WHERE "anderp"."fee_payments"."deleted_at" is null;