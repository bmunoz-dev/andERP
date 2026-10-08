CREATE TABLE "anderp"."expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"invoice_number" varchar(40),
	"payment_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"week_of_month" smallint GENERATED ALWAYS AS (anderp.week_of_month(payment_date)) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "expenses_amount_ck" CHECK ("anderp"."expenses"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "anderp"."expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."expenses" ADD CONSTRAINT "expenses_category_fk" FOREIGN KEY ("organization_id","category_id") REFERENCES "anderp"."expense_categories"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_org_date_idx" ON "anderp"."expenses" USING btree ("organization_id","payment_date") WHERE "anderp"."expenses"."deleted_at" is null;