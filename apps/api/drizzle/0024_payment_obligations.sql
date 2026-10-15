CREATE TYPE "anderp"."obligation_frequency" AS ENUM('once', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual');--> statement-breakpoint
CREATE TABLE "anderp"."obligation_due_dates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "obligation_due_dates_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "obligation_due_dates_completed_ck" CHECK (("anderp"."obligation_due_dates"."completed_at" is null) = ("anderp"."obligation_due_dates"."completed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "anderp"."payment_obligations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_name" varchar(100) NOT NULL,
	"concept" varchar(150) NOT NULL,
	"frequency" "anderp"."obligation_frequency" NOT NULL,
	"notice_days" smallint DEFAULT 15 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "payment_obligations_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_obligations_notice_days_ck" CHECK ("anderp"."payment_obligations"."notice_days" between 0 and 365)
);
--> statement-breakpoint
ALTER TABLE "anderp"."obligation_due_dates" ADD CONSTRAINT "obligation_due_dates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."obligation_due_dates" ADD CONSTRAINT "obligation_due_dates_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "anderp"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."obligation_due_dates" ADD CONSTRAINT "obligation_due_dates_obligation_fk" FOREIGN KEY ("organization_id","obligation_id") REFERENCES "anderp"."payment_obligations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."payment_obligations" ADD CONSTRAINT "payment_obligations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "obligation_due_dates_pending_uq" ON "anderp"."obligation_due_dates" USING btree ("obligation_id") WHERE "anderp"."obligation_due_dates"."completed_at" is null and "anderp"."obligation_due_dates"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "obligation_due_dates_date_uq" ON "anderp"."obligation_due_dates" USING btree ("obligation_id","due_date") WHERE "anderp"."obligation_due_dates"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_obligations_name_uq" ON "anderp"."payment_obligations" USING btree ("organization_id",lower("entity_name"),lower("concept")) WHERE "anderp"."payment_obligations"."deleted_at" is null;