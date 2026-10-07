CREATE TABLE "anderp"."provider_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_provider_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"work_agreement" text NOT NULL,
	"payment_frequency" "anderp"."payment_frequency" NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "provider_contracts_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "provider_contracts_total_amount_ck" CHECK ("anderp"."provider_contracts"."total_amount" > 0),
	CONSTRAINT "provider_contracts_date_range_ck" CHECK ("anderp"."provider_contracts"."end_date" is null or "anderp"."provider_contracts"."end_date" >= "anderp"."provider_contracts"."start_date")
);
--> statement-breakpoint
CREATE TABLE "anderp"."service_providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"document_type_id" uuid NOT NULL,
	"document_number" varchar(20) NOT NULL,
	"description" text,
	"bank_id" uuid,
	"account_type_id" uuid,
	"account_number" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "service_providers_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "service_providers_bank_all_or_none" CHECK (("anderp"."service_providers"."bank_id" is null and "anderp"."service_providers"."account_type_id" is null and "anderp"."service_providers"."account_number" is null)
        or ("anderp"."service_providers"."bank_id" is not null and "anderp"."service_providers"."account_type_id" is not null and "anderp"."service_providers"."account_number" is not null))
);
--> statement-breakpoint
ALTER TABLE "anderp"."provider_contracts" ADD CONSTRAINT "provider_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."provider_contracts" ADD CONSTRAINT "provider_contracts_provider_fk" FOREIGN KEY ("organization_id","service_provider_id") REFERENCES "anderp"."service_providers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."service_providers" ADD CONSTRAINT "service_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."service_providers" ADD CONSTRAINT "service_providers_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "anderp"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."service_providers" ADD CONSTRAINT "service_providers_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "anderp"."banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."service_providers" ADD CONSTRAINT "service_providers_account_type_id_account_types_id_fk" FOREIGN KEY ("account_type_id") REFERENCES "anderp"."account_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_providers_document_uq" ON "anderp"."service_providers" USING btree ("organization_id","document_type_id","document_number") WHERE "anderp"."service_providers"."deleted_at" is null;